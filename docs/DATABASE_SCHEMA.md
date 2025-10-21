# Database Schema

> **Architecture Note**: This schema uses a **split cache/library architecture** with UUID-based file naming. See [ASSET_STORAGE_ARCHITECTURE.md](ASSET_STORAGE_ARCHITECTURE.md) for complete rationale and implementation details.

## Overview

Metarr uses a relational database to manage metadata, assets, jobs, and configuration. The schema supports:
- **Multi-media types**: Movies, TV shows, music
- **Split cache/library tables**: Separate `cache_*_files` and `library_*_files` tables for each asset type
- **UUID-based naming**: Files stored with UUIDs (not content-addressed hashing)
- **SHA256 integrity verification**: Hashes detect library file corruption/replacement
- **Perceptual hash deduplication**: Images compared at enrichment time to avoid duplicates
- **Job queue**: Priority-based background processing
- **Field locking**: Preserve manual user edits
- **Soft deletes**: 30-day recovery window
- **Normalized metadata**: Shared actors, crew, genres across all media

## Asset Storage Architecture

**Current Implementation** (as of 2025-10-20):

- **Cache files** (`cache_*_files` tables): Permanent storage in `/data/cache/{type}/{entityType}/{entityId}/{uuid}.ext`
  - UUID-based naming prevents file collisions
  - SHA256 hashes stored for integrity verification
  - Perceptual hashes (phash) stored for visual similarity comparison

- **Library files** (`library_*_files` tables): Published copies in library directories with Kodi naming
  - Reference `cache_file_id` to link back to source
  - Can be deleted and rebuilt from cache
  - SHA256 mismatch triggers cache→library restore

- **Deduplication strategy**: Perceptual hash comparison during enrichment (not SHA256-based)
  - Prevents downloading visually identical images from different URLs
  - SHA256 is for change detection, not deduplication

**Legacy sections removed**: Lines 587-663 previously documented `cache_assets` and `asset_references` tables that were never implemented. Current schema uses split cache/library architecture exclusively.

## Core Tables

### Libraries

```sql
CREATE TABLE libraries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('movie', 'tv', 'music')),
  enabled BOOLEAN DEFAULT 1,
  last_scan_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_libraries_type ON libraries(type);
CREATE INDEX idx_libraries_enabled ON libraries(enabled);
```

### Media Player Groups

**Universal Group Architecture**: ALL media players belong to groups, regardless of type.

```sql
CREATE TABLE media_player_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('kodi', 'jellyfin', 'plex')),
  max_members INTEGER NULL,  -- NULL = unlimited (Kodi), 1 = single-member (Jellyfin/Plex)
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_media_player_groups_type ON media_player_groups(type);
CREATE INDEX idx_media_player_groups_max_members ON media_player_groups(max_members);
```

**Group Constraints**:
- **Kodi groups**: `max_members = NULL` (unlimited) - Multiple instances sharing MySQL database
- **Jellyfin groups**: `max_members = 1` (single server) - One server per group
- **Plex groups**: `max_members = 1` (single server) - One server per group

```sql
CREATE TABLE media_players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  host TEXT NOT NULL,
  port INTEGER NOT NULL,
  username TEXT,
  password TEXT,
  api_key TEXT,
  enabled BOOLEAN DEFAULT 1,
  use_websocket BOOLEAN DEFAULT 1,
  connection_status TEXT CHECK(connection_status IN ('connected', 'disconnected', 'error')),
  json_rpc_version TEXT,
  last_connected TIMESTAMP,
  last_error TEXT,
  last_sync TIMESTAMP,
  config TEXT,  -- JSON blob for player-specific config
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (group_id) REFERENCES media_player_groups(id) ON DELETE CASCADE
);

CREATE INDEX idx_media_players_group ON media_players(group_id);
CREATE INDEX idx_media_players_enabled ON media_players(enabled);
CREATE INDEX idx_media_players_connection_status ON media_players(connection_status);
```

### Media Player Libraries

Links media player **groups** (not individual players) to libraries.

```sql
CREATE TABLE media_player_libraries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL,
  library_id INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (group_id) REFERENCES media_player_groups(id) ON DELETE CASCADE,
  FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE,
  UNIQUE(group_id, library_id)
);

CREATE INDEX idx_media_player_libraries_group ON media_player_libraries(group_id);
CREATE INDEX idx_media_player_libraries_library ON media_player_libraries(library_id);
```

**Why group-level linking?**
- Different groups can manage different libraries
- Example: Living Room group → /movies, Kids Room group → /tvshows
- Prevents unnecessary scans on irrelevant groups

### Group Path Mappings

Path mappings configured at **group level** (not player level).

```sql
CREATE TABLE media_player_group_path_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL,
  metarr_path TEXT NOT NULL,
  player_path TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (group_id) REFERENCES media_player_groups(id) ON DELETE CASCADE
);

CREATE INDEX idx_group_path_mappings_group ON media_player_group_path_mappings(group_id);
CREATE INDEX idx_group_path_mappings_metarr_path ON media_player_group_path_mappings(metarr_path);
CREATE UNIQUE INDEX idx_group_path_mappings_unique ON media_player_group_path_mappings(group_id, metarr_path);
```

**Why group-level path mapping?**
- All players in a group share the same path view
- Kodi instances with shared MySQL see identical paths
- Jellyfin/Plex servers have one path namespace
- Simpler configuration: One mapping per group instead of N per player

**Example**:
```
Metarr sees:       /mnt/media/movies/The Matrix (1999)/
Kodi Group sees:   /movies/The Matrix (1999)/
```

## Movie Tables

### Movies

```sql
CREATE TABLE movies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  library_id INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER,
  file_hash TEXT,

  -- Provider IDs
  tmdb_id INTEGER,
  imdb_id TEXT,

  -- Basic Metadata
  title TEXT NOT NULL,
  original_title TEXT,
  sort_title TEXT,
  tagline TEXT,
  plot TEXT,
  outline TEXT,
  runtime INTEGER,
  year INTEGER,
  release_date DATE,
  content_rating TEXT,

  -- Ratings
  tmdb_rating REAL,
  tmdb_votes INTEGER,
  imdb_rating REAL,
  imdb_votes INTEGER,

  -- Assets
  poster_id INTEGER,
  fanart_id INTEGER,
  logo_id INTEGER,
  clearart_id INTEGER,
  banner_id INTEGER,
  thumb_id INTEGER,
  discart_id INTEGER,

  -- Field Locking (user manual overrides)
  title_locked BOOLEAN DEFAULT 0,
  plot_locked BOOLEAN DEFAULT 0,
  poster_locked BOOLEAN DEFAULT 0,
  fanart_locked BOOLEAN DEFAULT 0,
  logo_locked BOOLEAN DEFAULT 0,
  clearart_locked BOOLEAN DEFAULT 0,
  banner_locked BOOLEAN DEFAULT 0,
  thumb_locked BOOLEAN DEFAULT 0,
  discart_locked BOOLEAN DEFAULT 0,

  -- Workflow State
  identification_status TEXT DEFAULT 'unidentified' CHECK(identification_status IN ('unidentified', 'identified', 'enriched')),
  enrichment_priority INTEGER DEFAULT 5,

  -- Soft Delete
  deleted_at TIMESTAMP,

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE,
  FOREIGN KEY (poster_id) REFERENCES cache_assets(id),
  FOREIGN KEY (fanart_id) REFERENCES cache_assets(id),
  FOREIGN KEY (logo_id) REFERENCES cache_assets(id),
  FOREIGN KEY (clearart_id) REFERENCES cache_assets(id),
  FOREIGN KEY (banner_id) REFERENCES cache_assets(id),
  FOREIGN KEY (thumb_id) REFERENCES cache_assets(id),
  FOREIGN KEY (discart_id) REFERENCES cache_assets(id)
);

CREATE INDEX idx_movies_library ON movies(library_id);
CREATE INDEX idx_movies_tmdb ON movies(tmdb_id);
CREATE INDEX idx_movies_imdb ON movies(imdb_id);
CREATE INDEX idx_movies_identification ON movies(identification_status);
CREATE INDEX idx_movies_deleted ON movies(deleted_at);
CREATE INDEX idx_movies_file_path ON movies(file_path);
```

### Movie Collections

```sql
CREATE TABLE movie_collections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tmdb_collection_id INTEGER UNIQUE,
  name TEXT NOT NULL,
  plot TEXT,
  poster_id INTEGER,
  fanart_id INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (poster_id) REFERENCES cache_assets(id),
  FOREIGN KEY (fanart_id) REFERENCES cache_assets(id)
);

CREATE TABLE movie_collection_members (
  movie_id INTEGER NOT NULL,
  collection_id INTEGER NOT NULL,
  sort_order INTEGER,
  PRIMARY KEY (movie_id, collection_id),
  FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
  FOREIGN KEY (collection_id) REFERENCES movie_collections(id) ON DELETE CASCADE
);

CREATE INDEX idx_collection_members_movie ON movie_collection_members(movie_id);
CREATE INDEX idx_collection_members_collection ON movie_collection_members(collection_id);
```

## TV Show Tables

### Series

```sql
CREATE TABLE series (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  library_id INTEGER NOT NULL,
  directory_path TEXT NOT NULL,

  -- Provider IDs
  tvdb_id INTEGER,
  tmdb_id INTEGER,
  imdb_id TEXT,

  -- Basic Metadata
  title TEXT NOT NULL,
  original_title TEXT,
  sort_title TEXT,
  plot TEXT,
  outline TEXT,
  status TEXT,
  premiered DATE,
  studio TEXT,
  content_rating TEXT,

  -- Ratings
  tvdb_rating REAL,
  tvdb_votes INTEGER,
  tmdb_rating REAL,
  tmdb_votes INTEGER,

  -- Assets
  poster_id INTEGER,
  fanart_id INTEGER,
  banner_id INTEGER,
  logo_id INTEGER,
  clearart_id INTEGER,
  thumb_id INTEGER,

  -- Field Locking
  title_locked BOOLEAN DEFAULT 0,
  plot_locked BOOLEAN DEFAULT 0,
  poster_locked BOOLEAN DEFAULT 0,
  fanart_locked BOOLEAN DEFAULT 0,
  banner_locked BOOLEAN DEFAULT 0,
  logo_locked BOOLEAN DEFAULT 0,
  clearart_locked BOOLEAN DEFAULT 0,
  thumb_locked BOOLEAN DEFAULT 0,

  -- Workflow State
  identification_status TEXT DEFAULT 'unidentified' CHECK(identification_status IN ('unidentified', 'identified', 'enriched')),
  enrichment_priority INTEGER DEFAULT 5,

  -- Soft Delete
  deleted_at TIMESTAMP,

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE,
  FOREIGN KEY (poster_id) REFERENCES cache_assets(id),
  FOREIGN KEY (fanart_id) REFERENCES cache_assets(id),
  FOREIGN KEY (banner_id) REFERENCES cache_assets(id),
  FOREIGN KEY (logo_id) REFERENCES cache_assets(id),
  FOREIGN KEY (clearart_id) REFERENCES cache_assets(id),
  FOREIGN KEY (thumb_id) REFERENCES cache_assets(id)
);

CREATE INDEX idx_series_library ON series(library_id);
CREATE INDEX idx_series_tvdb ON series(tvdb_id);
CREATE INDEX idx_series_tmdb ON series(tmdb_id);
CREATE INDEX idx_series_imdb ON series(imdb_id);
CREATE INDEX idx_series_identification ON series(identification_status);
CREATE INDEX idx_series_deleted ON series(deleted_at);
```

### Seasons

```sql
CREATE TABLE seasons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  series_id INTEGER NOT NULL,
  season_number INTEGER NOT NULL,

  -- Metadata
  title TEXT,
  plot TEXT,
  premiered DATE,

  -- Assets
  poster_id INTEGER,
  fanart_id INTEGER,
  banner_id INTEGER,
  thumb_id INTEGER,

  -- Field Locking
  poster_locked BOOLEAN DEFAULT 0,
  fanart_locked BOOLEAN DEFAULT 0,
  banner_locked BOOLEAN DEFAULT 0,
  thumb_locked BOOLEAN DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE,
  FOREIGN KEY (poster_id) REFERENCES cache_assets(id),
  FOREIGN KEY (fanart_id) REFERENCES cache_assets(id),
  FOREIGN KEY (banner_id) REFERENCES cache_assets(id),
  FOREIGN KEY (thumb_id) REFERENCES cache_assets(id),
  UNIQUE(series_id, season_number)
);

CREATE INDEX idx_seasons_series ON seasons(series_id);
CREATE INDEX idx_seasons_number ON seasons(season_number);
```

### Episodes

```sql
CREATE TABLE episodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  series_id INTEGER NOT NULL,
  season_id INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER,
  file_hash TEXT,

  -- Episode Info
  episode_number INTEGER NOT NULL,
  absolute_number INTEGER,

  -- Provider IDs
  tvdb_id INTEGER,
  tmdb_id INTEGER,
  imdb_id TEXT,

  -- Metadata
  title TEXT NOT NULL,
  plot TEXT,
  aired DATE,
  runtime INTEGER,

  -- Ratings
  tvdb_rating REAL,
  tvdb_votes INTEGER,

  -- Assets
  thumb_id INTEGER,

  -- Field Locking
  title_locked BOOLEAN DEFAULT 0,
  plot_locked BOOLEAN DEFAULT 0,
  thumb_locked BOOLEAN DEFAULT 0,

  -- Soft Delete
  deleted_at TIMESTAMP,

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE,
  FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE,
  FOREIGN KEY (thumb_id) REFERENCES cache_assets(id),
  UNIQUE(season_id, episode_number)
);

CREATE INDEX idx_episodes_series ON episodes(series_id);
CREATE INDEX idx_episodes_season ON episodes(season_id);
CREATE INDEX idx_episodes_tvdb ON episodes(tvdb_id);
CREATE INDEX idx_episodes_tmdb ON episodes(tmdb_id);
CREATE INDEX idx_episodes_deleted ON episodes(deleted_at);
CREATE INDEX idx_episodes_file_path ON episodes(file_path);
```

## Music Tables

### Artists

```sql
CREATE TABLE artists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  library_id INTEGER NOT NULL,
  directory_path TEXT,

  -- Provider IDs
  musicbrainz_id TEXT,

  -- Metadata
  name TEXT NOT NULL,
  sort_name TEXT,
  biography TEXT,
  formed DATE,
  disbanded DATE,

  -- Assets
  thumb_id INTEGER,
  fanart_id INTEGER,
  banner_id INTEGER,
  logo_id INTEGER,

  -- Field Locking
  biography_locked BOOLEAN DEFAULT 0,
  thumb_locked BOOLEAN DEFAULT 0,
  fanart_locked BOOLEAN DEFAULT 0,
  banner_locked BOOLEAN DEFAULT 0,
  logo_locked BOOLEAN DEFAULT 0,

  -- Workflow State
  identification_status TEXT DEFAULT 'unidentified' CHECK(identification_status IN ('unidentified', 'identified', 'enriched')),
  enrichment_priority INTEGER DEFAULT 5,

  -- Soft Delete
  deleted_at TIMESTAMP,

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE,
  FOREIGN KEY (thumb_id) REFERENCES cache_assets(id),
  FOREIGN KEY (fanart_id) REFERENCES cache_assets(id),
  FOREIGN KEY (banner_id) REFERENCES cache_assets(id),
  FOREIGN KEY (logo_id) REFERENCES cache_assets(id)
);

CREATE INDEX idx_artists_library ON artists(library_id);
CREATE INDEX idx_artists_musicbrainz ON artists(musicbrainz_id);
CREATE INDEX idx_artists_identification ON artists(identification_status);
CREATE INDEX idx_artists_deleted ON artists(deleted_at);
```

### Albums

```sql
CREATE TABLE albums (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  artist_id INTEGER NOT NULL,
  directory_path TEXT NOT NULL,

  -- Provider IDs
  musicbrainz_id TEXT,

  -- Metadata
  title TEXT NOT NULL,
  sort_title TEXT,
  year INTEGER,
  release_date DATE,
  album_type TEXT,
  description TEXT,
  label TEXT,

  -- Ratings
  rating REAL,
  votes INTEGER,

  -- Assets
  thumb_id INTEGER,

  -- Field Locking
  title_locked BOOLEAN DEFAULT 0,
  description_locked BOOLEAN DEFAULT 0,
  thumb_locked BOOLEAN DEFAULT 0,

  -- Soft Delete
  deleted_at TIMESTAMP,

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE,
  FOREIGN KEY (thumb_id) REFERENCES cache_assets(id)
);

CREATE INDEX idx_albums_artist ON albums(artist_id);
CREATE INDEX idx_albums_musicbrainz ON albums(musicbrainz_id);
CREATE INDEX idx_albums_deleted ON albums(deleted_at);
```

### Tracks

```sql
CREATE TABLE tracks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  album_id INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER,
  file_hash TEXT,

  -- Provider IDs
  musicbrainz_id TEXT,

  -- Metadata
  title TEXT NOT NULL,
  track_number INTEGER,
  disc_number INTEGER DEFAULT 1,
  duration INTEGER,

  -- Soft Delete
  deleted_at TIMESTAMP,

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE
);

CREATE INDEX idx_tracks_album ON tracks(album_id);
CREATE INDEX idx_tracks_musicbrainz ON tracks(musicbrainz_id);
CREATE INDEX idx_tracks_deleted ON tracks(deleted_at);
CREATE INDEX idx_tracks_file_path ON tracks(file_path);
```

## Cache & Asset Tables

> **Current Architecture**: Split cache/library tables for images, videos, audio, and text files. See [ASSET_STORAGE_ARCHITECTURE.md](ASSET_STORAGE_ARCHITECTURE.md) for detailed documentation.

The schema currently uses type-specific tables:
- `cache_image_files` / `library_image_files` - Posters, fanart, logos, etc.
- `cache_video_files` / `library_video_files` - Trailers, extras
- `cache_audio_files` / `library_audio_files` - Theme songs
- `cache_text_files` / `library_text_files` - NFO files, subtitles

Each cache table stores:
- **UUID-based filenames** (e.g., `/data/cache/images/movie/123/a1b2c3d4.jpg`)
- **SHA256 hashes** for integrity verification
- **Perceptual hashes** (images only) for visual similarity detection
- **Source tracking** (provider URL, provider name)
- **Classification metadata** (dimensions, codec, etc.)

Each library table stores:
- **Foreign key to cache table** (`cache_file_id`)
- **Published path** (library directory with Kodi naming)
- **Timestamp** when published

**Planned Additions** (Post-v1.0):
- `deleted` (BOOLEAN) - Soft delete flag for garbage collection
- `deleted_at` (TIMESTAMP) - Deletion timestamp for retention tracking

For complete table schemas, see `src/database/migrations/20251015_001_clean_schema.ts`.

## Stream Details Tables

### Video Streams

```sql
CREATE TABLE video_streams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('movie', 'episode', 'track')),
  entity_id INTEGER NOT NULL,
  stream_index INTEGER NOT NULL,
  codec TEXT,
  width INTEGER,
  height INTEGER,
  aspect_ratio TEXT,
  framerate REAL,
  bitrate INTEGER,
  hdr_type TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_video_streams_entity ON video_streams(entity_type, entity_id);
```

### Audio Streams

```sql
CREATE TABLE audio_streams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('movie', 'episode', 'track')),
  entity_id INTEGER NOT NULL,
  stream_index INTEGER NOT NULL,
  codec TEXT,
  language TEXT,
  channels INTEGER,
  bitrate INTEGER,
  title TEXT,
  default_stream BOOLEAN DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audio_streams_entity ON audio_streams(entity_type, entity_id);
```

### Subtitle Streams

```sql
CREATE TABLE subtitle_streams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('movie', 'episode')),
  entity_id INTEGER NOT NULL,
  stream_index INTEGER,
  cache_asset_id INTEGER, -- For external subtitle files
  language TEXT NOT NULL,
  title TEXT,
  format TEXT,
  forced BOOLEAN DEFAULT 0,
  default_stream BOOLEAN DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (cache_asset_id) REFERENCES cache_assets(id)
);

CREATE INDEX idx_subtitle_streams_entity ON subtitle_streams(entity_type, entity_id);
CREATE INDEX idx_subtitle_streams_cache ON subtitle_streams(cache_asset_id);
```

## Normalized Metadata Tables

### Actors

```sql
CREATE TABLE actors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  tmdb_id INTEGER UNIQUE,
  imdb_id TEXT,
  thumb_id INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (thumb_id) REFERENCES cache_assets(id)
);

CREATE UNIQUE INDEX idx_actors_name ON actors(name);
CREATE INDEX idx_actors_tmdb ON actors(tmdb_id);
```

### Movie Actors

```sql
CREATE TABLE movie_actors (
  movie_id INTEGER NOT NULL,
  actor_id INTEGER NOT NULL,
  role TEXT,
  sort_order INTEGER,
  PRIMARY KEY (movie_id, actor_id),
  FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_id) REFERENCES actors(id) ON DELETE CASCADE
);

CREATE INDEX idx_movie_actors_movie ON movie_actors(movie_id);
CREATE INDEX idx_movie_actors_actor ON movie_actors(actor_id);
```

### Episode Actors

```sql
CREATE TABLE episode_actors (
  episode_id INTEGER NOT NULL,
  actor_id INTEGER NOT NULL,
  role TEXT,
  sort_order INTEGER,
  PRIMARY KEY (episode_id, actor_id),
  FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_id) REFERENCES actors(id) ON DELETE CASCADE
);

CREATE INDEX idx_episode_actors_episode ON episode_actors(episode_id);
CREATE INDEX idx_episode_actors_actor ON episode_actors(actor_id);
```

### Crew

```sql
CREATE TABLE crew (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  tmdb_id INTEGER UNIQUE,
  imdb_id TEXT,
  thumb_id INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (thumb_id) REFERENCES cache_assets(id)
);

CREATE UNIQUE INDEX idx_crew_name ON crew(name);
CREATE INDEX idx_crew_tmdb ON crew(tmdb_id);
```

### Movie Crew

```sql
CREATE TABLE movie_crew (
  movie_id INTEGER NOT NULL,
  crew_id INTEGER NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('director', 'writer', 'producer', 'composer')),
  sort_order INTEGER,
  PRIMARY KEY (movie_id, crew_id, role),
  FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
  FOREIGN KEY (crew_id) REFERENCES crew(id) ON DELETE CASCADE
);

CREATE INDEX idx_movie_crew_movie ON movie_crew(movie_id);
CREATE INDEX idx_movie_crew_crew ON movie_crew(crew_id);
CREATE INDEX idx_movie_crew_role ON movie_crew(role);
```

### Episode Crew

```sql
CREATE TABLE episode_crew (
  episode_id INTEGER NOT NULL,
  crew_id INTEGER NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('director', 'writer', 'producer')),
  sort_order INTEGER,
  PRIMARY KEY (episode_id, crew_id, role),
  FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE,
  FOREIGN KEY (crew_id) REFERENCES crew(id) ON DELETE CASCADE
);

CREATE INDEX idx_episode_crew_episode ON episode_crew(episode_id);
CREATE INDEX idx_episode_crew_crew ON episode_crew(crew_id);
CREATE INDEX idx_episode_crew_role ON episode_crew(role);
```

### Genres

```sql
CREATE TABLE genres (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  media_type TEXT NOT NULL CHECK(media_type IN ('movie', 'tv', 'music'))
);

CREATE UNIQUE INDEX idx_genres_name_type ON genres(name, media_type);
```

### Movie Genres

```sql
CREATE TABLE movie_genres (
  movie_id INTEGER NOT NULL,
  genre_id INTEGER NOT NULL,
  PRIMARY KEY (movie_id, genre_id),
  FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
  FOREIGN KEY (genre_id) REFERENCES genres(id) ON DELETE CASCADE
);

CREATE INDEX idx_movie_genres_movie ON movie_genres(movie_id);
CREATE INDEX idx_movie_genres_genre ON movie_genres(genre_id);
```

### Series Genres

```sql
CREATE TABLE series_genres (
  series_id INTEGER NOT NULL,
  genre_id INTEGER NOT NULL,
  PRIMARY KEY (series_id, genre_id),
  FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE,
  FOREIGN KEY (genre_id) REFERENCES genres(id) ON DELETE CASCADE
);

CREATE INDEX idx_series_genres_series ON series_genres(series_id);
CREATE INDEX idx_series_genres_genre ON series_genres(genre_id);
```

### Music Genres

```sql
CREATE TABLE music_genres (
  artist_id INTEGER NOT NULL,
  genre_id INTEGER NOT NULL,
  PRIMARY KEY (artist_id, genre_id),
  FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE,
  FOREIGN KEY (genre_id) REFERENCES genres(id) ON DELETE CASCADE
);

CREATE INDEX idx_music_genres_artist ON music_genres(artist_id);
CREATE INDEX idx_music_genres_genre ON music_genres(genre_id);
```

### Studios

```sql
CREATE TABLE studios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL
);

CREATE UNIQUE INDEX idx_studios_name ON studios(name);
```

### Movie Studios

```sql
CREATE TABLE movie_studios (
  movie_id INTEGER NOT NULL,
  studio_id INTEGER NOT NULL,
  PRIMARY KEY (movie_id, studio_id),
  FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
  FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE
);

CREATE INDEX idx_movie_studios_movie ON movie_studios(movie_id);
CREATE INDEX idx_movie_studios_studio ON movie_studios(studio_id);
```

### Series Studios

```sql
CREATE TABLE series_studios (
  series_id INTEGER NOT NULL,
  studio_id INTEGER NOT NULL,
  PRIMARY KEY (series_id, studio_id),
  FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE,
  FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE
);

CREATE INDEX idx_series_studios_series ON series_studios(series_id);
CREATE INDEX idx_series_studios_studio ON series_studios(studio_id);
```

## Job Queue Tables

### Job Queue

```sql
CREATE TABLE job_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_type TEXT NOT NULL CHECK(job_type IN ('webhook', 'enrichment', 'scan', 'publish', 'cleanup', 'playback_restore')),
  priority INTEGER NOT NULL DEFAULT 5, -- 1=critical (webhooks), 2=high (user actions), 5=normal, 10=low (background)
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),

  -- Job data (JSON)
  payload TEXT NOT NULL,

  -- Result tracking
  result TEXT,
  error_message TEXT,

  -- Retry logic
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  next_retry_at TIMESTAMP,

  -- Processing tracking
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  worker_id TEXT,

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_jobs_status_priority ON job_queue(status, priority);
CREATE INDEX idx_jobs_type ON job_queue(job_type);
CREATE INDEX idx_jobs_retry ON job_queue(status, next_retry_at);
CREATE INDEX idx_jobs_created ON job_queue(created_at);
```

### Job Dependencies

```sql
CREATE TABLE job_dependencies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL,
  depends_on_job_id INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES job_queue(id) ON DELETE CASCADE,
  FOREIGN KEY (depends_on_job_id) REFERENCES job_queue(id) ON DELETE CASCADE
);

CREATE INDEX idx_job_deps_job ON job_dependencies(job_id);
CREATE INDEX idx_job_deps_depends ON job_dependencies(depends_on_job_id);
```

## Playback State Tables

### Playback State

```sql
CREATE TABLE playback_state (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  media_player_id INTEGER NOT NULL,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('movie', 'episode', 'track')),
  entity_id INTEGER NOT NULL,
  file_path TEXT NOT NULL,

  -- Playback position
  position_seconds INTEGER NOT NULL,
  total_seconds INTEGER NOT NULL,
  position_percentage REAL,

  -- State
  paused BOOLEAN DEFAULT 0,
  speed REAL DEFAULT 1.0,

  -- Timestamps
  captured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  restored_at TIMESTAMP,

  FOREIGN KEY (media_player_id) REFERENCES media_players(id) ON DELETE CASCADE
);

CREATE INDEX idx_playback_state_player ON playback_state(media_player_id);
CREATE INDEX idx_playback_state_entity ON playback_state(entity_type, entity_id);
CREATE INDEX idx_playback_state_captured ON playback_state(captured_at);
```

## Webhook Tables

### Webhook Events

```sql
CREATE TABLE webhook_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL CHECK(source IN ('radarr', 'sonarr', 'lidarr')),
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  processed BOOLEAN DEFAULT 0,
  job_id INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES job_queue(id)
);

CREATE INDEX idx_webhook_events_source ON webhook_events(source);
CREATE INDEX idx_webhook_events_processed ON webhook_events(processed);
CREATE INDEX idx_webhook_events_created ON webhook_events(created_at);
```

## Configuration Tables

### Provider Configuration

```sql
CREATE TABLE provider_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_name TEXT UNIQUE NOT NULL,
  enabled BOOLEAN DEFAULT 1,
  api_key TEXT,
  rate_limit_per_second REAL,
  priority INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_provider_config_enabled ON provider_config(enabled);
CREATE INDEX idx_provider_config_priority ON provider_config(priority);
```

### Application Settings

```sql
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Migration Tracking

### Schema Migration Strategy

**Two-Phase Approach**:

1. **Pre-Release (Current - Development Phase v1.0)**
   - All schema changes made directly in the initial migration file: `20251015_001_clean_schema.ts`
   - Keeps table definitions centralized in one place
   - Nodemon watches for file changes and auto-restarts
   - Temporary cleanup code deletes old database on restart
   - No risk of data loss (no users yet)
   - **Purpose**: Rapid iteration and schema refinement

2. **Post-Release (After Docker Distribution)**
   - Switch to traditional migration flow
   - Create new timestamped migration files for each schema change
   - Implement `up()` and `down()` methods
   - Migration service applies changes incrementally
   - **Purpose**: Protect user data, support rollback

### Schema Migrations Table

```sql
CREATE TABLE schema_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_migrations_version ON schema_migrations(version);
```

## Notes

### Field Locking Strategy
- Each lockable field has a corresponding `{field}_locked` boolean column
- When user manually edits a field, the lock is set to `true`
- Locked fields are excluded from all automated updates
- User can unlock fields to re-enable automation

### Soft Delete Pattern
- All primary entity tables include `deleted_at` timestamp
- `deleted_at IS NULL` = active record
- `deleted_at IS NOT NULL` = soft deleted (30-day recovery)
- Scheduled job purges records where `deleted_at < NOW() - 30 days`

### UUID-Based Cache Architecture **[Current Implementation]**
- **UUID-based naming**: Files stored with random UUIDs to prevent collisions: `/data/cache/{type}/{entityType}/{entityId}/{uuid}.ext`
- **SHA256 integrity verification**: Hashes detect when library files are corrupted or replaced (triggers cache→library restore)
- **Perceptual hash deduplication**: Images compared using pHash at enrichment time to avoid downloading duplicates
  - pHash similarity threshold: 90% (configurable)
  - SHA256 is for change detection, NOT deduplication
  - Cache size grows per unique visual selection, not per URL
- **Split tables**: Separate `cache_*_files` and `library_*_files` tables for images, videos, audio, text
- **Library files**: Published copies in library directories with Kodi naming (can be rebuilt from cache)
- **Reference tracking**: `library_*_files.cache_file_id` foreign key links published files to cache source
- **Atomic writes**: Temp → rename pattern prevents partial file corruption on disk full/crash scenarios
- **Garbage collection**: [Planned] Remove cache files with zero library references after retention period

See [ASSET_STORAGE_ARCHITECTURE.md](ASSET_STORAGE_ARCHITECTURE.md) for complete implementation details.

### Job Queue Priority
- **1 = Critical**: Webhooks (new media, upgrades)
- **2 = High**: User-initiated actions (manual enrichment, publish)
- **5 = Normal**: Default priority
- **10 = Low**: Background tasks (library scans, cleanup)

### Reference Counting
- `cache_assets.reference_count` tracks active usage
- Incremented when asset assigned to media
- Decremented when media deleted or asset replaced
- Assets with `reference_count = 0` eligible for cleanup (after retention period)
