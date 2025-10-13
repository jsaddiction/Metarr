# Database Schema

## Overview

Metarr uses a relational database to manage metadata, assets, jobs, and configuration. The schema supports:
- **Multi-media types**: Movies, TV shows, music
- **Content-addressed cache**: SHA256-based asset storage with deduplication
- **Job queue**: Priority-based background processing
- **Field locking**: Preserve manual user edits
- **Soft deletes**: 30-day recovery window
- **Normalized metadata**: Shared actors, crew, genres across all media

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

```sql
CREATE TABLE media_player_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('kodi', 'jellyfin', 'plex')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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
  last_ping_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (group_id) REFERENCES media_player_groups(id) ON DELETE CASCADE
);

CREATE INDEX idx_media_players_group ON media_players(group_id);
CREATE INDEX idx_media_players_enabled ON media_players(enabled);
```

### Path Mappings

```sql
CREATE TABLE path_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  media_player_group_id INTEGER NOT NULL,
  metarr_path TEXT NOT NULL,
  player_path TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (media_player_group_id) REFERENCES media_player_groups(id) ON DELETE CASCADE
);

CREATE INDEX idx_path_mappings_group ON path_mappings(media_player_group_id);
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

### Cache Assets (Content-Addressed Storage)

```sql
CREATE TABLE cache_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_hash TEXT UNIQUE NOT NULL,
  file_path TEXT NOT NULL, -- /cache/assets/{ab}/{cd}/{hash}.ext
  file_size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,

  -- Image-specific metadata
  width INTEGER,
  height INTEGER,
  perceptual_hash TEXT, -- For visual duplicate detection

  -- Source tracking
  source_type TEXT NOT NULL CHECK(source_type IN ('provider', 'local', 'user')),
  source_url TEXT,
  provider_name TEXT,

  -- Reference counting
  reference_count INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_cache_assets_hash ON cache_assets(content_hash);
CREATE INDEX idx_cache_assets_phash ON cache_assets(perceptual_hash);
CREATE INDEX idx_cache_assets_type ON cache_assets(source_type);
CREATE INDEX idx_cache_assets_refs ON cache_assets(reference_count);
```

### Asset References (Track where assets are used)

```sql
CREATE TABLE asset_references (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cache_asset_id INTEGER NOT NULL,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('movie', 'series', 'season', 'episode', 'artist', 'album')),
  entity_id INTEGER NOT NULL,
  asset_type TEXT NOT NULL CHECK(asset_type IN ('poster', 'fanart', 'banner', 'logo', 'clearart', 'thumb', 'discart')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (cache_asset_id) REFERENCES cache_assets(id) ON DELETE CASCADE
);

CREATE INDEX idx_asset_refs_cache ON asset_references(cache_asset_id);
CREATE INDEX idx_asset_refs_entity ON asset_references(entity_type, entity_id);
CREATE UNIQUE INDEX idx_asset_refs_unique ON asset_references(entity_type, entity_id, asset_type);
```

### Trailers

```sql
CREATE TABLE trailers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cache_asset_id INTEGER NOT NULL,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('movie', 'series')),
  entity_id INTEGER NOT NULL,
  title TEXT,
  duration INTEGER,
  quality TEXT,
  locked BOOLEAN DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (cache_asset_id) REFERENCES cache_assets(id) ON DELETE CASCADE
);

CREATE INDEX idx_trailers_cache ON trailers(cache_asset_id);
CREATE INDEX idx_trailers_entity ON trailers(entity_type, entity_id);
```

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

### Schema Migrations

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

### Content-Addressed Cache
- Assets stored by SHA256 hash: `/cache/assets/{ab}/{cd}/{hash}.ext`
- First 2 chars → first directory level (256 options)
- Next 2 chars → second directory level (256 options)
- Total: 65,536 leaf directories for optimal filesystem performance
- `perceptual_hash` enables visual duplicate detection within same media

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
