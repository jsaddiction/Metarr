# Database Schema Reference

This document provides comprehensive reference for Metarr's normalized database schema, including table structures, relationships, and usage patterns.

## Schema Design Principles

### Normalization Strategy

Metarr uses a **fully normalized schema** to:
- Eliminate data duplication (actors, genres, directors shared across media)
- Enable efficient querying and updates
- Support incremental scanning without losing custom metadata
- Automatically clean up orphaned entities

### Cascading Deletes

Foreign keys use `ON DELETE CASCADE` to automatically clean up related records when parent is deleted.

**Movie Deletion Cascade**:
```
DELETE FROM movies WHERE id = 1
  ↓ CASCADE
  ├─ movies_actors (all actor links)
  ├─ movies_genres (all genre links)
  ├─ movies_directors (all director links)
  ├─ movies_writers (all writer links)
  ├─ movies_studios (all studio links)
  ├─ movies_tags (all tag links)
  ├─ movies_countries (all country links)
  ├─ ratings (all ratings for this movie)
  ├─ images (all images for this movie)
  ├─ trailers (trailer file entry)
  ├─ video_streams (video stream entry)
  ├─ audio_streams (all audio tracks)
  ├─ subtitle_streams (all subtitle tracks)
  └─ unknown_files (all unknown file entries)
```

**Series Deletion Cascade**:
```
DELETE FROM series WHERE id = 1
  ↓ CASCADE
  ├─ episodes (all episodes)
  │   ↓ CASCADE
  │   ├─ episodes_actors
  │   ├─ episodes_directors
  │   ├─ episodes_writers
  │   ├─ audio_streams
  │   ├─ subtitle_streams
  │   └─ video_streams
  ├─ series_actors
  ├─ series_genres
  ├─ series_directors
  ├─ series_studios
  ├─ series_tags
  ├─ ratings
  └─ images
```

**Media Player Deletion Cascade**:
```
DELETE FROM media_players WHERE id = 1
  ↓ CASCADE
  ├─ player_path_mappings (all path mappings)
  ├─ notification_channels (linked notification channel)
  └─ media_player_group_members (group membership)
```

**Notification Channel Deletion Cascade**:
```
DELETE FROM notification_channels WHERE id = 1
  ↓ CASCADE
  ├─ notification_subscriptions (all subscriptions)
  └─ notification_delivery_log (delivery history)
```

**Library Deletion Cascade**:
```
DELETE FROM libraries WHERE id = 1
  ↓ CASCADE
  └─ scan_jobs (all scan history)
```

**Orphaned Entity Cleanup**:

After cascading deletes, orphaned entities (actors, genres, etc. with no links) can be cleaned up:

```sql
-- Delete actors with no movie/series/episode links
DELETE FROM actors
WHERE id NOT IN (
  SELECT DISTINCT actor_id FROM movies_actors
  UNION SELECT DISTINCT actor_id FROM series_actors
  UNION SELECT DISTINCT actor_id FROM episodes_actors
);

-- Similar for genres, directors, writers, studios, tags, countries
```

**Note**: Orphan cleanup is run:
- After garbage collection deletes expired movies
- During scheduled maintenance (daily)
- After bulk delete operations

### Status States

Media items track their **transient operational state** (not data completeness):
- `null` or empty: Normal/idle state (no processing needed)
- `scanning`: Currently being scanned
- `processing_webhook`: Currently processing webhook-triggered update
- `enriching`: Fetching metadata from providers
- `needs_identification`: No NFO or provider IDs found
- `error_nfo_conflict`: Multiple conflicting NFO files in directory
- `error_provider_failure`: Provider API returned error
- `error_network`: Network connectivity issue

**Note**: Status state is **not** the same as monitored state. See Field Locking documentation for computed monitoring logic.

### Field Locking System

Metarr implements **field-level locking** to preserve manual user edits:
- Each lockable field has a corresponding `{field}_locked` boolean column
- Manual user edits automatically lock that field
- Locked fields are excluded from automated updates (NFO rescans, provider refreshes)
- **No explicit "monitored" flag** - monitoring is computed from locked fields + completeness
- See `@docs/FIELD_LOCKING.md` for complete documentation

## Core Media Tables

### movies

Stores movie metadata from NFO files and optional provider enrichment.

```sql
CREATE TABLE movies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Basic Info
  title TEXT NOT NULL,
  original_title TEXT,
  sort_title TEXT,
  year INTEGER,

  -- Provider IDs
  tmdb_id INTEGER,
  imdb_id TEXT,

  -- Plot & Description
  plot TEXT,              -- Full synopsis
  outline TEXT,           -- Short summary
  tagline TEXT,           -- Movie tagline

  -- Classification
  mpaa TEXT,              -- Rating (G, PG, PG-13, R, etc.)

  -- Dates
  premiered TEXT,         -- Release date (YYYY-MM-DD)

  -- User Data
  user_rating REAL,       -- User's personal rating (0-10)

  -- Media Assets
  trailer_url TEXT,       -- Link to trailer

  -- Movie Set/Collection
  set_id INTEGER,         -- FK to sets table

  -- File Info
  file_path TEXT NOT NULL

  -- NFO Validation
  nfo_hash TEXT,          -- SHA-256 hash of NFO file content
  nfo_parsed_at TEXT,     -- ISO timestamp when NFO was last parsed

  -- Status (transient operational state)
  status TEXT,            -- null, scanning, processing_webhook, enriching, needs_identification, error_*
  error_message TEXT,     -- Error details if status is error_*

  -- Soft Delete
  deleted_on TIMESTAMP,   -- Set to NOW() + 7 days on deletion, null otherwise

  -- Field Locking (preserves manual edits)
  title_locked BOOLEAN DEFAULT 0,
  original_title_locked BOOLEAN DEFAULT 0,
  sort_title_locked BOOLEAN DEFAULT 0,
  year_locked BOOLEAN DEFAULT 0,
  plot_locked BOOLEAN DEFAULT 0,
  outline_locked BOOLEAN DEFAULT 0,
  tagline_locked BOOLEAN DEFAULT 0,
  mpaa_locked BOOLEAN DEFAULT 0,
  premiered_locked BOOLEAN DEFAULT 0,
  user_rating_locked BOOLEAN DEFAULT 0,
  trailer_url_locked BOOLEAN DEFAULT 0,
  set_id_locked BOOLEAN DEFAULT 0,

  -- Array Field Locking (locked as a whole)
  actors_locked BOOLEAN DEFAULT 0,
  directors_locked BOOLEAN DEFAULT 0,
  writers_locked BOOLEAN DEFAULT 0,
  genres_locked BOOLEAN DEFAULT 0,
  studios_locked BOOLEAN DEFAULT 0,
  tags_locked BOOLEAN DEFAULT 0,
  countries_locked BOOLEAN DEFAULT 0,

  -- Note: Images have per-image locking (see images table)

  -- Timestamps
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (set_id) REFERENCES sets(id) ON DELETE SET NULL
);

CREATE INDEX idx_movies_tmdb_id ON movies(tmdb_id);
CREATE INDEX idx_movies_imdb_id ON movies(imdb_id);
CREATE INDEX idx_movies_status ON movies(status);
CREATE INDEX idx_movies_nfo_hash ON movies(nfo_hash);
CREATE INDEX idx_movies_set_id ON movies(set_id);
CREATE INDEX idx_movies_deleted_on ON movies(deleted_on);
```

**Example Row:**
```json
{
  "id": 1,
  "title": "Kick-Ass",
  "original_title": "Kick-Ass",
  "sort_title": "Kick-Ass",
  "year": 2010,
  "tmdb_id": 12345,
  "imdb_id": "tt1250777",
  "plot": "A teenager decides to become a superhero...",
  "outline": "Teen becomes superhero",
  "tagline": "Shut up. Kick ass.",
  "mpaa": "R",
  "premiered": "2010-04-16",
  "user_rating": 8.5,
  "trailer_url": "plugin://plugin.video.youtube/?action=play_video&videoid=...",
  "set_id": 1,
  "file_path": "M:\\Movies\\Kick-Ass (2010)\\Kick-Ass.mkv",
  "nfo_hash": "a3f2c1b9e4d8f7e6c5b4a3f2c1b9e4d8f7e6c5b4a3f2c1b9e4d8f7e6c5b4a3f2",
  "nfo_parsed_at": "2025-10-02T10:30:00Z",
  "status": null,
  "error_message": null,
  "deleted_on": null,
  "title_locked": 0,
  "plot_locked": 1,
  "created_at": "2025-10-02T10:30:00Z",
  "updated_at": "2025-10-02T10:30:00Z"
}
```

### series

Stores TV show metadata.

```sql
CREATE TABLE series (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Basic Info
  title TEXT NOT NULL,
  original_title TEXT,
  sort_title TEXT,
  year INTEGER,           -- First aired year

  -- Provider IDs
  tmdb_id INTEGER,
  tvdb_id INTEGER,
  imdb_id TEXT,

  -- Plot & Description
  plot TEXT,
  outline TEXT,

  -- Classification
  mpaa TEXT,
  series_status TEXT,     -- Continuing, Ended

  -- Dates
  premiered TEXT,         -- First air date (YYYY-MM-DD)

  -- User Data
  user_rating REAL,

  -- File Info
  directory_path TEXT NOT NULL,

  -- NFO Validation
  nfo_hash TEXT,
  nfo_parsed_at TEXT,

  -- Status
  status TEXT,
  error_message TEXT,

  -- Soft Delete
  deleted_on TIMESTAMP,

  -- Field Locking
  title_locked BOOLEAN DEFAULT 0,
  original_title_locked BOOLEAN DEFAULT 0,
  sort_title_locked BOOLEAN DEFAULT 0,
  year_locked BOOLEAN DEFAULT 0,
  plot_locked BOOLEAN DEFAULT 0,
  outline_locked BOOLEAN DEFAULT 0,
  mpaa_locked BOOLEAN DEFAULT 0,
  series_status_locked BOOLEAN DEFAULT 0,
  premiered_locked BOOLEAN DEFAULT 0,
  user_rating_locked BOOLEAN DEFAULT 0,

  -- Array Field Locking
  actors_locked BOOLEAN DEFAULT 0,
  directors_locked BOOLEAN DEFAULT 0,
  writers_locked BOOLEAN DEFAULT 0,
  genres_locked BOOLEAN DEFAULT 0,
  studios_locked BOOLEAN DEFAULT 0,
  tags_locked BOOLEAN DEFAULT 0,

  -- Timestamps
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_series_tmdb_id ON series(tmdb_id);
CREATE INDEX idx_series_tvdb_id ON series(tvdb_id);
CREATE INDEX idx_series_imdb_id ON series(imdb_id);
CREATE INDEX idx_series_status ON series(status);
CREATE INDEX idx_series_nfo_hash ON series(nfo_hash);
CREATE INDEX idx_series_deleted_on ON series(deleted_on);
```

### episodes

Stores individual episode metadata.

```sql
CREATE TABLE episodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  series_id INTEGER NOT NULL,

  -- Episode Numbering
  season_number INTEGER NOT NULL,
  episode_number INTEGER NOT NULL,
  display_season INTEGER,      -- For special numbering
  display_episode INTEGER,     -- For special numbering

  -- Basic Info
  title TEXT NOT NULL,
  plot TEXT,
  outline TEXT,

  -- Dates
  aired TEXT,                  -- Air date (YYYY-MM-DD)

  -- User Data
  user_rating REAL,

  -- File Info
  file_path TEXT NOT NULL,

  -- NFO Validation
  nfo_hash TEXT,
  nfo_parsed_at TEXT,

  -- Status
  status TEXT,
  error_message TEXT,

  -- Soft Delete
  deleted_on TIMESTAMP,

  -- Field Locking
  title_locked BOOLEAN DEFAULT 0,
  plot_locked BOOLEAN DEFAULT 0,
  outline_locked BOOLEAN DEFAULT 0,
  aired_locked BOOLEAN DEFAULT 0,
  user_rating_locked BOOLEAN DEFAULT 0,

  -- Array Field Locking
  actors_locked BOOLEAN DEFAULT 0,
  directors_locked BOOLEAN DEFAULT 0,
  writers_locked BOOLEAN DEFAULT 0,

  -- Timestamps
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE
);

CREATE INDEX idx_episodes_series_id ON episodes(series_id);
CREATE INDEX idx_episodes_season_episode ON episodes(season_number, episode_number);
CREATE INDEX idx_episodes_status ON episodes(status);
CREATE INDEX idx_episodes_nfo_hash ON episodes(nfo_hash);
CREATE INDEX idx_episodes_deleted_on ON episodes(deleted_on);
```

## Stream Details Tables

### video_streams

Stores video stream information extracted from FFprobe. One video stream per movie/episode.

```sql
CREATE TABLE video_streams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,      -- 'movie', 'episode'
  entity_id INTEGER NOT NULL,

  -- Video Properties
  codec TEXT,                      -- h264, hevc, vp9, av1
  aspect_ratio REAL,               -- 2.35, 1.78, etc.
  width INTEGER,                   -- 1920, 3840, etc.
  height INTEGER,                  -- 1080, 2160, etc.
  duration_seconds INTEGER,        -- Total runtime in seconds

  -- Advanced Properties
  bitrate INTEGER,                 -- Video bitrate in kbps
  framerate REAL,                  -- 23.976, 24, 29.97, 60, etc.
  hdr_type TEXT,                   -- NULL, HDR10, HDR10+, Dolby Vision, HLG
  color_space TEXT,                -- bt709, bt2020, etc.
  file_size BIGINT,                -- File size in bytes

  -- Scan Tracking
  scanned_at TEXT DEFAULT CURRENT_TIMESTAMP,

  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(entity_type, entity_id)
);

CREATE INDEX idx_video_streams_entity ON video_streams(entity_type, entity_id);
CREATE INDEX idx_video_streams_resolution ON video_streams(width, height);
CREATE INDEX idx_video_streams_codec ON video_streams(codec);
```

**Example Row:**
```json
{
  "id": 1,
  "entity_type": "movie",
  "entity_id": 1,
  "codec": "hevc",
  "aspect_ratio": 2.35,
  "width": 3840,
  "height": 2160,
  "duration_seconds": 8160,
  "bitrate": 45000,
  "framerate": 23.976,
  "hdr_type": "HDR10",
  "color_space": "bt2020",
  "file_size": 46179488972,
  "scanned_at": "2025-10-04T10:30:00Z"
}
```

**Usage Notes:**
- Populated exclusively by FFprobe scanning (never from NFO)
- Scanned on: webhook trigger, full library scan, manual rescan
- Use `duration_seconds` as authoritative runtime (not NFO `<runtime>`)
- Quality derived from resolution: 2160p = 4K, 1080p = HD, etc.

### audio_streams

Stores audio track information. Multiple audio streams per movie/episode.

```sql
CREATE TABLE audio_streams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,      -- 'movie', 'episode'
  entity_id INTEGER NOT NULL,
  stream_index INTEGER NOT NULL,  -- 0-based index in file

  -- Audio Properties
  codec TEXT,                      -- aac, ac3, eac3, dts, truehd, flac
  language TEXT,                   -- ISO 639-2 (eng, spa, fra, etc.)
  channels INTEGER,                -- 2, 6, 8, etc.
  channel_layout TEXT,             -- stereo, 5.1, 7.1, etc.

  -- Advanced Properties
  bitrate INTEGER,                 -- Audio bitrate in kbps
  sample_rate INTEGER,             -- 48000, 96000, etc.
  title TEXT,                      -- Stream title/description

  -- Stream Flags
  is_default BOOLEAN DEFAULT 0,
  is_forced BOOLEAN DEFAULT 0,

  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(entity_type, entity_id, stream_index)
);

CREATE INDEX idx_audio_streams_entity ON audio_streams(entity_type, entity_id);
CREATE INDEX idx_audio_streams_language ON audio_streams(language);
CREATE INDEX idx_audio_streams_codec ON audio_streams(codec);
```

**Example Rows:**
```json
[
  {
    "id": 1,
    "entity_type": "movie",
    "entity_id": 1,
    "stream_index": 0,
    "codec": "truehd",
    "language": "eng",
    "channels": 8,
    "channel_layout": "7.1",
    "bitrate": 4608,
    "sample_rate": 48000,
    "title": "English Dolby TrueHD 7.1",
    "is_default": 1,
    "is_forced": 0
  },
  {
    "id": 2,
    "entity_type": "movie",
    "entity_id": 1,
    "stream_index": 1,
    "codec": "ac3",
    "language": "eng",
    "channels": 6,
    "channel_layout": "5.1",
    "bitrate": 640,
    "sample_rate": 48000,
    "title": "English AC3 5.1",
    "is_default": 0,
    "is_forced": 0
  }
]
```

### subtitle_streams

Stores subtitle track information. Multiple subtitle streams per movie/episode.

```sql
CREATE TABLE subtitle_streams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,      -- 'movie', 'episode'
  entity_id INTEGER NOT NULL,
  stream_index INTEGER NOT NULL,  -- 0-based index (embedded) or NULL (external)

  -- Subtitle Properties
  language TEXT,                   -- ISO 639-2 (eng, spa, fra, etc.)
  codec TEXT,                      -- subrip, ass, pgs, vobsub, etc.
  title TEXT,                      -- Stream title/description

  -- Stream Type
  is_external BOOLEAN DEFAULT 0,  -- TRUE for .srt files, FALSE for embedded
  file_path TEXT,                  -- Path to external subtitle file

  -- Stream Flags
  is_default BOOLEAN DEFAULT 0,
  is_forced BOOLEAN DEFAULT 0,

  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(entity_type, entity_id, stream_index, file_path)
);

CREATE INDEX idx_subtitle_streams_entity ON subtitle_streams(entity_type, entity_id);
CREATE INDEX idx_subtitle_streams_language ON subtitle_streams(language);
CREATE INDEX idx_subtitle_streams_external ON subtitle_streams(is_external);
```

**Example Rows:**
```json
[
  {
    "id": 1,
    "entity_type": "movie",
    "entity_id": 1,
    "stream_index": 0,
    "language": "eng",
    "codec": "subrip",
    "title": "English",
    "is_external": 0,
    "file_path": null,
    "is_default": 1,
    "is_forced": 0
  },
  {
    "id": 2,
    "entity_type": "movie",
    "entity_id": 1,
    "stream_index": null,
    "language": "spa",
    "codec": "subrip",
    "title": "Spanish",
    "is_external": 1,
    "file_path": "/movies/The Matrix (1999)/The Matrix.spa.srt",
    "is_default": 0,
    "is_forced": 0
  }
]
```

**Usage Notes:**
- `stream_index` is NULL for external subtitle files
- External subtitles detected by scanning for .srt, .ass, .sub files in movie directory
- Use `is_default` to determine which subtitle track is selected by default

## Normalized Entity Tables

### actors

Shared actor data across all media types.

```sql
CREATE TABLE actors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  thumb_url TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_actors_name ON actors(name);
```

### genres

Shared genre data.

```sql
CREATE TABLE genres (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_genres_name ON genres(name);
```

### directors

Shared director data.

```sql
CREATE TABLE directors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_directors_name ON directors(name);
```

### writers

Shared writer data.

```sql
CREATE TABLE writers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_writers_name ON writers(name);
```

### studios

Shared studio data.

```sql
CREATE TABLE studios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_studios_name ON studios(name);
```

### tags

User-defined tags.

```sql
CREATE TABLE tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tags_name ON tags(name);
```

### countries

Country of origin data.

```sql
CREATE TABLE countries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_countries_name ON countries(name);
```

### sets

Movie collections (e.g., "Kick-Ass Collection", "Marvel Cinematic Universe").

```sql
CREATE TABLE sets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  overview TEXT,
  tmdb_collection_id INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sets_name ON sets(name);
CREATE INDEX idx_sets_tmdb_id ON sets(tmdb_collection_id);
```

**Example Row:**
```json
{
  "id": 1,
  "name": "Kick-Ass Collection",
  "overview": "The complete Kick-Ass series featuring Dave Lizewski's adventures as the superhero Kick-Ass.",
  "tmdb_collection_id": 169484
}
```

### ratings

Multi-source rating system.

```sql
CREATE TABLE ratings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,  -- 'movie', 'series', 'episode'
  entity_id INTEGER NOT NULL,
  source TEXT NOT NULL,       -- 'tmdb', 'imdb', 'rottenTomatoes', 'metacritic'
  value REAL NOT NULL,
  votes INTEGER,
  is_default BOOLEAN DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ratings_entity ON ratings(entity_type, entity_id);
CREATE INDEX idx_ratings_source ON ratings(source);
```

**Example Rows:**
```json
[
  {
    "entity_type": "movie",
    "entity_id": 1,
    "source": "tmdb",
    "value": 7.6,
    "votes": 12543,
    "is_default": 1
  },
  {
    "entity_type": "movie",
    "entity_id": 1,
    "source": "imdb",
    "value": 7.6,
    "votes": 567890,
    "is_default": 0
  },
  {
    "entity_type": "movie",
    "entity_id": 1,
    "source": "rottenTomatoes",
    "value": 76,
    "votes": 235,
    "is_default": 0
  }
]
```

### images

Stores image assets with three-tier architecture (Provider → Cache → Library).

```sql
CREATE TABLE images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,      -- 'movie', 'series', 'episode', 'actor'
  entity_id INTEGER NOT NULL,
  image_type TEXT NOT NULL,       -- 'poster', 'fanart', 'landscape', 'keyart', 'banner', 'clearart', 'clearlogo', 'discart'

  -- Image Sources
  provider_url TEXT,              -- Original provider URL
  cache_path TEXT,                -- Path in cache directory
  library_path TEXT,              -- Path in library directory (copied on selection)

  -- Image Metadata
  width INTEGER,
  height INTEGER,
  file_size INTEGER,
  perceptual_hash TEXT,           -- pHash for duplicate detection

  -- Selection Metrics
  vote_average REAL,              -- Provider rating
  vote_count INTEGER,
  is_selected BOOLEAN DEFAULT 0,  -- Currently selected for this entity+type

  -- Locking
  locked BOOLEAN DEFAULT 0,       -- User manually selected this image

  -- Timestamps
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_images_entity ON images(entity_type, entity_id);
CREATE INDEX idx_images_type ON images(image_type);
CREATE INDEX idx_images_selected ON images(is_selected);
CREATE INDEX idx_images_phash ON images(perceptual_hash);
```

**Image Type Reference:**
- `poster`: 2:3 aspect ratio (movie/series posters)
- `fanart`: 16:9 backdrop images
- `landscape`: 16:9 landscape artwork
- `keyart`: Promotional key art
- `banner`: Wide banner (10:1 aspect ratio)
- `clearart`: Transparent logo/character art
- `clearlogo`: Transparent title logo
- `discart`: Disc/DVD artwork

**Usage Notes:**
- `provider_url` → downloaded to `cache_path` on first fetch
- When image is selected (`is_selected = 1`), copied to `library_path`
- `locked = 1` prevents automatic replacement during updates
- Duplicate detection uses `perceptual_hash` with 90% similarity threshold
- See `@docs/IMAGE_MANAGEMENT.md` for complete workflow

### trailers

Stores trailer file metadata. One-to-one relationship with movies/episodes.

```sql
CREATE TABLE trailers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,      -- 'movie', 'episode', 'series'
  entity_id INTEGER NOT NULL,

  -- File Properties
  file_path TEXT NOT NULL,
  file_size BIGINT,

  -- Video Properties (from FFprobe)
  duration_seconds INTEGER,
  resolution TEXT,                -- '1080p', '720p', '2160p', etc.
  codec TEXT,                     -- h264, hevc, etc.

  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(entity_type, entity_id)
);

CREATE INDEX idx_trailers_entity ON trailers(entity_type, entity_id);
```

**Usage Notes:**
- Only ONE trailer per movie/episode (enforced by UNIQUE constraint)
- For TV shows: trailers are ONLY at series level (`entity_type = 'series'`), never episodes
- Only local file paths (never URL-based trailers)
- NFO `<trailer>` URLs are NEVER read or written (see NFO_PARSING.md)
- Trailer discovery part of unified scan process (see WORKFLOWS.md)
- File patterns: `<movie>-trailer.mkv`, `trailer.mkv`, `<movie>-trailer1.mp4`, etc.

**Example Row:**
```json
{
  "id": 1,
  "entity_type": "movie",
  "entity_id": 1,
  "file_path": "/movies/Kick-Ass (2010)/Kick-Ass-trailer.mkv",
  "file_size": 52428800,
  "duration_seconds": 150,
  "resolution": "1080p",
  "codec": "h264"
}
```

### unknown_files

Temporary tracking for unrecognized files discovered during scanning.

```sql
CREATE TABLE unknown_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,      -- 'movie', 'series', 'episode'
  entity_id INTEGER NOT NULL,     -- Links to parent media item

  -- File Properties
  file_path TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  file_size BIGINT,
  file_extension TEXT,
  mime_type TEXT,

  discovered_at TEXT DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (entity_type, entity_id) REFERENCES movies(id) ON DELETE CASCADE
);

CREATE INDEX idx_unknown_files_entity ON unknown_files(entity_type, entity_id);
CREATE INDEX idx_unknown_files_path ON unknown_files(file_path);
```

**Usage Notes:**
- Files that don't match known asset patterns (posters, fanarts, trailers, subtitles)
- Linked to parent media item for context
- **Resolution actions** (DELETE from table immediately):
  1. **Delete File**: Remove file from filesystem + DELETE from table
  2. **Assign To**: Process as normal asset (pHash, quality check, rename) + DELETE from table
  3. **Add to Ignore Pattern**: Add pattern to config, cleanup matching files + DELETE from table
- **No status/notes fields** - table only tracks current unknown files
- **Foreign key cascade**: Auto-deleted when parent media deleted
- **Two UI views**: Per-media edit page + global unknown files table
- Files never reappear after resolution (ignore patterns prevent re-discovery)

**Example Rows:**
```json
[
  {
    "id": 1,
    "entity_type": "movie",
    "entity_id": 1,
    "file_path": "/movies/Kick-Ass (2010)/posster.png",
    "file_name": "posster.png",
    "file_size": 1048576,
    "file_extension": "png",
    "mime_type": "image/png",
    "discovered_at": "2025-10-04T10:30:00Z"
  },
  {
    "id": 2,
    "entity_type": "movie",
    "entity_id": 1,
    "file_path": "/movies/Kick-Ass (2010)/.stfolder",
    "file_name": ".stfolder",
    "file_size": 0,
    "file_extension": null,
    "mime_type": "application/octet-stream",
    "discovered_at": "2025-10-04T10:31:00Z"
  }
]
```

### completeness_config

Per-media-type configuration for exact quantity requirements.

```sql
CREATE TABLE completeness_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  media_type TEXT NOT NULL UNIQUE,  -- 'movies', 'series', 'episodes'

  -- Required Scalar Fields
  required_fields TEXT NOT NULL,    -- JSON array: ["plot", "mpaa", "premiered", ...]

  -- Required Images (exact quantities)
  required_posters INTEGER DEFAULT 1,
  required_fanart INTEGER DEFAULT 1,
  required_landscape INTEGER DEFAULT 0,
  required_keyart INTEGER DEFAULT 0,
  required_banners INTEGER DEFAULT 0,
  required_clearart INTEGER DEFAULT 0,
  required_clearlogo INTEGER DEFAULT 0,
  required_discart INTEGER DEFAULT 0,

  -- Required Media Assets
  required_trailers INTEGER DEFAULT 0,
  required_subtitles INTEGER DEFAULT 0,
  required_themes INTEGER DEFAULT 0,

  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Default configuration for movies
INSERT INTO completeness_config (media_type, required_fields, required_posters, required_fanart)
VALUES ('movies', '["plot", "mpaa", "premiered"]', 1, 1);
```

**Example Configuration:**
```json
{
  "media_type": "movies",
  "required_fields": ["plot", "mpaa", "premiered"],
  "required_posters": 1,
  "required_fanart": 1,
  "required_landscape": 0,
  "required_trailers": 2,
  "required_subtitles": 0
}

**Note:** Runtime is not a required field as it comes from `video_streams.duration_seconds` (FFprobe scan).
```

**Completeness Calculation:**
```typescript
function calculateCompleteness(movie: Movie, config: CompletenessConfig): number {
  let total = 0;
  let satisfied = 0;

  // Check scalar fields
  for (const field of config.required_fields) {
    total++;
    if (movie[field] !== null && movie[field] !== '') satisfied++;
  }

  // Check images
  const imageCounts = getImageCounts(movie.id);
  for (const imageType of IMAGE_TYPES) {
    const required = config[`required_${imageType}s`];
    if (required > 0) {
      total++;
      if (imageCounts[imageType] >= required) satisfied++;
    }
  }

  return (satisfied / total) * 100;
}
```

## Many-to-Many Link Tables

### movies_actors

Links movies to actors with role information.

```sql
CREATE TABLE movies_actors (
  movie_id INTEGER NOT NULL,
  actor_id INTEGER NOT NULL,
  role TEXT,              -- Character name
  order_index INTEGER,    -- Display order in credits
  PRIMARY KEY (movie_id, actor_id),
  FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_id) REFERENCES actors(id) ON DELETE CASCADE
);

CREATE INDEX idx_movies_actors_movie ON movies_actors(movie_id);
CREATE INDEX idx_movies_actors_actor ON movies_actors(actor_id);
```

**Example Rows:**
```json
[
  {
    "movie_id": 1,
    "actor_id": 1,
    "role": "Dave Lizewski / Kick-Ass",
    "order_index": 0
  },
  {
    "movie_id": 1,
    "actor_id": 2,
    "role": "Mindy Macready / Hit-Girl",
    "order_index": 1
  }
]
```

### movies_genres

```sql
CREATE TABLE movies_genres (
  movie_id INTEGER NOT NULL,
  genre_id INTEGER NOT NULL,
  PRIMARY KEY (movie_id, genre_id),
  FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
  FOREIGN KEY (genre_id) REFERENCES genres(id) ON DELETE CASCADE
);
```

### movies_directors

```sql
CREATE TABLE movies_directors (
  movie_id INTEGER NOT NULL,
  director_id INTEGER NOT NULL,
  PRIMARY KEY (movie_id, director_id),
  FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
  FOREIGN KEY (director_id) REFERENCES directors(id) ON DELETE CASCADE
);
```

### movies_writers

```sql
CREATE TABLE movies_writers (
  movie_id INTEGER NOT NULL,
  writer_id INTEGER NOT NULL,
  PRIMARY KEY (movie_id, writer_id),
  FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
  FOREIGN KEY (writer_id) REFERENCES writers(id) ON DELETE CASCADE
);
```

### movies_studios

```sql
CREATE TABLE movies_studios (
  movie_id INTEGER NOT NULL,
  studio_id INTEGER NOT NULL,
  PRIMARY KEY (movie_id, studio_id),
  FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
  FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE
);
```

### movies_tags

```sql
CREATE TABLE movies_tags (
  movie_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  PRIMARY KEY (movie_id, tag_id),
  FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);
```

### movies_countries

```sql
CREATE TABLE movies_countries (
  movie_id INTEGER NOT NULL,
  country_id INTEGER NOT NULL,
  PRIMARY KEY (movie_id, country_id),
  FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
  FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE CASCADE
);
```

### Similar Link Tables for TV Shows

```sql
-- tvshows_actors, tvshows_genres, tvshows_directors,
-- tvshows_studios, tvshows_tags
-- (Similar structure to movies_* tables)

-- episodes_actors, episodes_directors, episodes_writers
-- (Episode-specific credits)
```

## System Tables

### libraries

Library configuration and scan tracking.

```sql
CREATE TABLE libraries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL,           -- 'movies', 'tvshows', 'music'
  path TEXT NOT NULL,
  enabled BOOLEAN DEFAULT 1,
  scan_on_startup BOOLEAN DEFAULT 0,
  auto_scan_interval INTEGER,   -- Minutes (NULL = disabled)
  last_scanned_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_libraries_type ON libraries(type);
CREATE INDEX idx_libraries_enabled ON libraries(enabled);
```

### media_players

Media player connections.

```sql
CREATE TABLE media_players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL,           -- 'kodi', 'jellyfin', 'plex'
  host TEXT NOT NULL,
  port INTEGER NOT NULL,
  username TEXT,
  password TEXT,
  api_key TEXT,
  use_ssl BOOLEAN DEFAULT 0,
  enabled BOOLEAN DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_media_players_type ON media_players(type);
CREATE INDEX idx_media_players_enabled ON media_players(enabled);
```

### scan_jobs

Tracks library scan operations.

```sql
CREATE TABLE scan_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  library_id INTEGER NOT NULL,
  status TEXT NOT NULL,         -- 'running', 'completed', 'failed'
  started_at TEXT NOT NULL,
  completed_at TEXT,
  total_items INTEGER,
  processed_items INTEGER,
  added_items INTEGER,
  updated_items INTEGER,
  removed_items INTEGER,
  error_message TEXT,
  FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE
);

CREATE INDEX idx_scan_jobs_library ON scan_jobs(library_id);
CREATE INDEX idx_scan_jobs_status ON scan_jobs(status);
```

### jobs

Background job processing queue.

```sql
CREATE TABLE jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,           -- 'metadata_fetch', 'library_scan', 'webhook_process'
  status TEXT NOT NULL,         -- 'pending', 'processing', 'completed', 'failed'
  priority INTEGER DEFAULT 5,   -- 1 (highest) to 10 (lowest)
  payload TEXT NOT NULL,        -- JSON data
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  error_message TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  started_at TEXT,
  completed_at TEXT
);

CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_type ON jobs(type);
CREATE INDEX idx_jobs_priority ON jobs(priority);
```

### player_path_mappings

Maps filesystem paths between Metarr's view and media player's view.

```sql
CREATE TABLE player_path_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER NOT NULL,
  metarr_path TEXT NOT NULL,    -- Path as Metarr sees it (e.g., "M:\Movies\")
  player_path TEXT NOT NULL,    -- Path as player sees it (e.g., "/mnt/movies/")
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (player_id) REFERENCES media_players(id) ON DELETE CASCADE
);

CREATE INDEX idx_player_path_mappings_player ON player_path_mappings(player_id);
```

**Example Mappings:**
```json
[
  {
    "player_id": 1,
    "metarr_path": "M:\\Movies\\",
    "player_path": "/mnt/movies/"
  },
  {
    "player_id": 1,
    "metarr_path": "M:\\TV Shows\\",
    "player_path": "/mnt/tv/"
  }
]
```

**Translation Algorithm:**
- Sort mappings by `metarr_path` length (longest first)
- Find first mapping where `metarr_path` is prefix of file path
- Replace prefix with `player_path`
- See `@docs/PATH_MAPPING.md` for details

### media_player_groups

Groups media players that share a library (e.g., Kodi MySQL shared library).

```sql
CREATE TABLE media_player_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### media_player_group_members

Links media players to groups.

```sql
CREATE TABLE media_player_group_members (
  group_id INTEGER NOT NULL,
  player_id INTEGER NOT NULL,
  PRIMARY KEY (group_id, player_id),
  FOREIGN KEY (group_id) REFERENCES media_player_groups(id) ON DELETE CASCADE,
  FOREIGN KEY (player_id) REFERENCES media_players(id) ON DELETE CASCADE
);
```

**Group Behavior:**
- All players in a group share the same path mappings
- Library scan on any group member triggers scan on representative player only
- One player per group is designated as "representative" for path operations
- See `@docs/PATH_MAPPING.md` for Kodi shared library configuration

### manager_path_mappings

Maps filesystem paths between Metarr's view and media manager's view (Sonarr/Radarr/Lidarr).

```sql
CREATE TABLE manager_path_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  manager_type TEXT NOT NULL,   -- 'sonarr', 'radarr', 'lidarr'
  manager_path TEXT NOT NULL,   -- Path as manager sees it (webhook payload)
  metarr_path TEXT NOT NULL,    -- Path as Metarr sees it (filesystem access)
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_manager_path_mappings_type ON manager_path_mappings(manager_type);
```

**Example Mappings:**
```json
[
  {
    "manager_type": "radarr",
    "manager_path": "/data/movies/",
    "metarr_path": "M:\\Movies\\"
  }
]
```

### activity_log

Comprehensive audit trail of all significant events, user actions, and webhook activity.

```sql
CREATE TABLE activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  event_type TEXT NOT NULL,     -- 'webhook', 'download_complete', 'scan_completed', 'user_edit', 'movie.download.complete', etc.
  severity TEXT NOT NULL,       -- 'info', 'warning', 'error', 'success'
  entity_type TEXT,             -- 'movie', 'series', 'episode', 'library', 'player', 'webhook'
  entity_id INTEGER,
  description TEXT NOT NULL,
  metadata TEXT,                -- JSON with event-specific details
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_activity_log_timestamp ON activity_log(timestamp);
CREATE INDEX idx_activity_log_event_type ON activity_log(event_type);
CREATE INDEX idx_activity_log_severity ON activity_log(severity);
CREATE INDEX idx_activity_log_entity ON activity_log(entity_type, entity_id);
```

**Event Types**:

1. **Webhook Events** (`event_type = 'webhook'`):
   - All webhooks from Radarr/Sonarr/Lidarr
   - Full payload stored in `metadata` for debugging
   - See `@docs/WEBHOOKS.md`

2. **Notification Events** (`event_type = 'movie.download.complete'`, etc.):
   - System-wide events that can trigger notifications
   - See `@docs/NOTIFICATIONS.md`

3. **System Events** (`event_type = 'scan_completed'`, etc.):
   - Library scans, garbage collection, scheduled tasks

4. **User Actions** (`event_type = 'user_edit'`, etc.):
   - Manual metadata edits, user-initiated scans

**Example Entries:**
```json
[
  {
    "timestamp": "2025-10-02T10:30:00Z",
    "event_type": "webhook",
    "severity": "info",
    "entity_type": "webhook",
    "entity_id": null,
    "description": "Radarr Download: The Matrix",
    "metadata": {
      "source": "radarr",
      "eventType": "Download",
      "status": "processed",
      "processingTime": 1250,
      "payload": { "movie": { "title": "The Matrix", "tmdbId": 603 } }
    }
  },
  {
    "timestamp": "2025-10-02T10:30:05Z",
    "event_type": "movie.download.complete",
    "severity": "success",
    "entity_type": "movie",
    "entity_id": 1,
    "description": "Movie downloaded: The Matrix",
    "metadata": {
      "movie": { "title": "The Matrix", "year": 1999, "quality": "Bluray-1080p" }
    }
  },
  {
    "timestamp": "2025-10-02T10:35:00Z",
    "event_type": "metadata_updated",
    "severity": "info",
    "entity_type": "movie",
    "entity_id": 1,
    "description": "Metadata enriched from TMDB",
    "metadata": {
      "provider": "tmdb",
      "fields_updated": ["plot", "ratings", "actors"]
    }
  },
  {
    "timestamp": "2025-10-03T02:00:00Z",
    "event_type": "system.scan.complete",
    "severity": "success",
    "entity_type": "library",
    "entity_id": 1,
    "description": "Library scan completed",
    "metadata": {
      "scan": { "added": 5, "updated": 12, "removed": 2, "durationMs": 45000 }
    }
  }
]
```

**Retention:**
- Activity log entries are kept for configurable retention period (default: 90 days)
- Old entries automatically deleted during scheduled cleanup
- See `@docs/NOTIFICATIONS_AND_LOGGING.md` for configuration

### users

Single admin user for authentication.

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,        -- bcrypt hash
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_username ON users(username);
```

**Initial Setup:**
- Database migration creates default admin if table is empty
- Default credentials: `Metarr:password` (if no environment variables provided)
- Environment variables `ADMIN_USERNAME` and `ADMIN_PASSWORD` can set initial credentials
- Only one admin user supported (single row in table)

### sessions

JWT session management.

```sql
CREATE TABLE sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,           -- ISO timestamp
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_sessions_token ON sessions(token);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
```

**Session Behavior:**
- JWT tokens stored in HTTP-only cookie
- Default expiration: 7 days
- Automatic cleanup of expired sessions (scheduled task)

## Notification System Tables

See `@docs/NOTIFICATIONS.md` for complete notification system architecture.

### notification_channels

Defines WHERE notifications are sent (Kodi players, Pushover, Discord, etc.).

```sql
CREATE TABLE notification_channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,                    -- "Living Room Kodi", "Pushover"
  type TEXT NOT NULL,                    -- 'kodi', 'pushover', 'discord', 'slack', 'email', 'webhook'
  enabled BOOLEAN DEFAULT 1,

  -- Link to media player (for Kodi channels only)
  media_player_id INTEGER,               -- NULL for global channels like Pushover

  -- Type-specific configuration (JSON)
  config TEXT,                           -- For non-Kodi channels

  -- Capabilities (JSON array)
  capabilities TEXT NOT NULL,            -- ["text", "images"]

  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (media_player_id) REFERENCES media_players(id) ON DELETE CASCADE
);

CREATE INDEX idx_notification_channels_type ON notification_channels(type);
CREATE INDEX idx_notification_channels_enabled ON notification_channels(enabled);
CREATE INDEX idx_notification_channels_player ON notification_channels(media_player_id);
```

**Channel Types**:
- `kodi`: Notification to specific Kodi player (links to `media_players` table)
- `pushover`: Push notifications to mobile devices
- `discord`: Discord webhook
- `slack`: Slack webhook
- `email`: Email notifications
- `webhook`: Custom webhook endpoint

**Capabilities**:
- `text`: Plain text messages
- `images`: Can embed images
- `rich_media`: Rich formatting (embeds, buttons)
- `interactive`: Supports user interaction

**Example Rows**:
```json
[
  {
    "id": 1,
    "name": "Living Room Kodi Notifications",
    "type": "kodi",
    "enabled": true,
    "media_player_id": 1,
    "config": null,
    "capabilities": "[\"text\", \"images\"]"
  },
  {
    "id": 2,
    "name": "Pushover",
    "type": "pushover",
    "enabled": true,
    "media_player_id": null,
    "config": "{\"apiKey\": \"abc123\", \"userKey\": \"def456\"}",
    "capabilities": "[\"text\", \"images\", \"links\"]"
  }
]
```

### notification_event_types

Defines all possible events that can trigger notifications.

```sql
CREATE TABLE notification_event_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_name TEXT NOT NULL UNIQUE,       -- 'movie.download.complete'
  category TEXT NOT NULL,                -- 'movie', 'series', 'health', 'system'
  description TEXT,

  -- Defaults
  default_enabled BOOLEAN DEFAULT 1,
  default_severity TEXT DEFAULT 'info',  -- 'info', 'warning', 'error', 'success'

  -- Required capabilities for this event
  required_capabilities TEXT,            -- JSON: ["text"] or ["text", "images"]

  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notification_event_types_category ON notification_event_types(category);
```

**Seeded Events**:
```sql
INSERT INTO notification_event_types (event_name, category, description, default_severity, required_capabilities) VALUES
  ('movie.download.started', 'movie', 'Download queued', 'info', '["text"]'),
  ('movie.download.complete', 'movie', 'Download finished', 'success', '["text", "images"]'),
  ('movie.upgrade.available', 'movie', 'Upgrade downloading', 'info', '["text"]'),
  ('movie.file.deleted', 'movie', 'File deleted', 'warning', '["text"]'),
  ('movie.renamed', 'movie', 'File renamed', 'info', '["text"]'),
  ('health.issue.detected', 'health', 'Health problem', 'error', '["text"]'),
  ('health.issue.resolved', 'health', 'Health resolved', 'success', '["text"]'),
  ('system.scan.started', 'system', 'Library scan started', 'info', '["text"]'),
  ('system.scan.complete', 'system', 'Library scan complete', 'success', '["text"]');
```

### notification_subscriptions

Defines WHICH events send to WHICH channels.

```sql
CREATE TABLE notification_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL,
  event_name TEXT NOT NULL,
  enabled BOOLEAN DEFAULT 1,

  -- Message customization
  message_template TEXT,                 -- NULL = use default template

  -- Filtering (future feature)
  filter_conditions TEXT,                -- JSON: {"quality": "1080p"}

  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (channel_id) REFERENCES notification_channels(id) ON DELETE CASCADE,
  FOREIGN KEY (event_name) REFERENCES notification_event_types(event_name) ON DELETE CASCADE,

  UNIQUE(channel_id, event_name)
);

CREATE INDEX idx_notification_subscriptions_channel ON notification_subscriptions(channel_id);
CREATE INDEX idx_notification_subscriptions_event ON notification_subscriptions(event_name);
```

**Example Subscriptions**:
```sql
-- Living Room Kodi: Download complete events only
INSERT INTO notification_subscriptions (channel_id, event_name, enabled, message_template) VALUES
  (1, 'movie.download.complete', 1, '✅ Ready to watch: {{movie.title}}');

-- Pushover: Critical events only
INSERT INTO notification_subscriptions (channel_id, event_name, enabled, message_template) VALUES
  (2, 'movie.download.complete', 1, '✅ {{movie.title}} ({{movie.year}}) downloaded'),
  (2, 'movie.file.deleted', 1, '⚠️ File deleted: {{movie.title}}'),
  (2, 'health.issue.detected', 1, '⚠️ {{health.message}}');
```

### notification_queue

Transient queue for async notification processing.

```sql
CREATE TABLE notification_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_name TEXT NOT NULL,
  event_data TEXT NOT NULL,              -- JSON: full event payload
  status TEXT DEFAULT 'pending',         -- 'pending', 'processing', 'completed', 'failed'
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  error_message TEXT,

  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  processed_at TEXT
);

CREATE INDEX idx_notification_queue_status ON notification_queue(status);
CREATE INDEX idx_notification_queue_created ON notification_queue(created_at);
```

**Queue Lifecycle**:
1. Event emitted → Insert with `status = 'pending'`
2. Processor picks up → Set `status = 'processing'`
3. Success → Set `status = 'completed'`, set `processed_at`
4. Failure → Retry up to 3 times, then set `status = 'failed'`

**Cleanup**: Completed/failed items older than 7 days can be deleted.

### notification_delivery_log

Tracks delivery success/failure per channel (for debugging).

```sql
CREATE TABLE notification_delivery_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  queue_id INTEGER,
  channel_id INTEGER NOT NULL,
  event_name TEXT NOT NULL,
  status TEXT NOT NULL,                  -- 'sent', 'failed'
  error_message TEXT,
  delivery_time_ms INTEGER,

  created_at TEXT DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (queue_id) REFERENCES notification_queue(id) ON DELETE CASCADE,
  FOREIGN KEY (channel_id) REFERENCES notification_channels(id) ON DELETE CASCADE
);

CREATE INDEX idx_notification_delivery_log_queue ON notification_delivery_log(queue_id);
CREATE INDEX idx_notification_delivery_log_channel ON notification_delivery_log(channel_id);
CREATE INDEX idx_notification_delivery_log_status ON notification_delivery_log(status);
```

**Usage**: Query failed deliveries to diagnose notification issues:
```sql
SELECT * FROM notification_delivery_log
WHERE status = 'failed'
ORDER BY created_at DESC
LIMIT 50;
```

## Common Query Patterns

### Get Movie with Full Metadata

```sql
SELECT
  m.*,
  s.name AS set_name,
  s.overview AS set_overview,
  GROUP_CONCAT(DISTINCT g.name) AS genres,
  GROUP_CONCAT(DISTINCT d.name) AS directors,
  GROUP_CONCAT(DISTINCT st.name) AS studios,
  GROUP_CONCAT(DISTINCT c.name) AS countries,
  GROUP_CONCAT(DISTINCT t.name) AS tags
FROM movies m
LEFT JOIN sets s ON m.set_id = s.id
LEFT JOIN movies_genres mg ON m.id = mg.movie_id
LEFT JOIN genres g ON mg.genre_id = g.id
LEFT JOIN movies_directors md ON m.id = md.movie_id
LEFT JOIN directors d ON md.director_id = d.id
LEFT JOIN movies_studios ms ON m.id = ms.movie_id
LEFT JOIN studios st ON ms.studio_id = st.id
LEFT JOIN movies_countries mc ON m.id = mc.movie_id
LEFT JOIN countries c ON mc.country_id = c.id
LEFT JOIN movies_tags mt ON m.id = mt.movie_id
LEFT JOIN tags t ON mt.tag_id = t.id
WHERE m.id = ?
GROUP BY m.id;
```

### Get Movie with Actors and Roles

```sql
SELECT
  m.id,
  m.title,
  m.year,
  a.id AS actor_id,
  a.name AS actor_name,
  a.thumb_url AS actor_thumb,
  ma.role,
  ma.order_index
FROM movies m
JOIN movies_actors ma ON m.id = ma.movie_id
JOIN actors a ON ma.actor_id = a.id
WHERE m.id = ?
ORDER BY ma.order_index;
```

### Get All Ratings for a Movie

```sql
SELECT
  source,
  value,
  votes,
  is_default
FROM ratings
WHERE entity_type = 'movie' AND entity_id = ?
ORDER BY is_default DESC, source;
```

### Find Movies by Genre

```sql
SELECT DISTINCT m.*
FROM movies m
JOIN movies_genres mg ON m.id = mg.movie_id
JOIN genres g ON mg.genre_id = g.id
WHERE g.name = 'Action'
ORDER BY m.title;
```

### Find Movies by Actor

```sql
SELECT DISTINCT m.*
FROM movies m
JOIN movies_actors ma ON m.id = ma.movie_id
JOIN actors a ON ma.actor_id = a.id
WHERE a.name = 'Keanu Reeves'
ORDER BY m.year DESC;
```

### Find Orphaned Actors (No Movie Links)

```sql
SELECT a.*
FROM actors a
LEFT JOIN movies_actors ma ON a.id = ma.actor_id
LEFT JOIN tvshows_actors ta ON a.id = ta.actor_id
LEFT JOIN episodes_actors ea ON a.id = ea.actor_id
WHERE ma.actor_id IS NULL
  AND ta.actor_id IS NULL
  AND ea.actor_id IS NULL;
```

### Delete Orphaned Entities

```sql
-- Delete orphaned actors
DELETE FROM actors
WHERE id NOT IN (
  SELECT DISTINCT actor_id FROM movies_actors
  UNION
  SELECT DISTINCT actor_id FROM tvshows_actors
  UNION
  SELECT DISTINCT actor_id FROM episodes_actors
);

-- Delete orphaned genres
DELETE FROM genres
WHERE id NOT IN (
  SELECT DISTINCT genre_id FROM movies_genres
  UNION
  SELECT DISTINCT genre_id FROM tvshows_genres
);

-- Similar for directors, writers, studios, tags, countries
```

### Get Movies Currently Processing

```sql
SELECT *
FROM movies
WHERE status IS NOT NULL
  AND status != ''
ORDER BY created_at DESC;
```

### Get Movies with Errors

```sql
SELECT *
FROM movies
WHERE status LIKE 'error_%'
ORDER BY updated_at DESC;
```

### Get Movies Pending Deletion

```sql
SELECT *
FROM movies
WHERE deleted_on IS NOT NULL
  AND deleted_on <= CURRENT_TIMESTAMP
ORDER BY deleted_on ASC;
```

**Note**: Scheduled cleanup task runs daily to permanently delete these items.

### Get Monitored Movies (Computed State)

```sql
-- Movies with at least one unlocked field AND incomplete metadata
SELECT m.*,
       COUNT(CASE WHEN i.is_selected = 1 THEN 1 END) AS selected_image_count
FROM movies m
LEFT JOIN images i ON m.id = i.entity_id AND i.entity_type = 'movie'
WHERE (
  -- Has at least one unlocked scalar field
  m.title_locked = 0 OR
  m.plot_locked = 0 OR
  m.outline_locked = 0 OR
  m.tagline_locked = 0 OR
  m.mpaa_locked = 0 OR
  m.runtime_locked = 0 OR
  m.premiered_locked = 0 OR
  m.user_rating_locked = 0 OR
  m.trailer_url_locked = 0 OR
  m.set_id_locked = 0
)
GROUP BY m.id
-- Filter for incomplete (requires application-level completeness check)
ORDER BY m.created_at DESC;
```

**Note**: Full completeness calculation requires application-level logic to compare against `completeness_config` table. The above query returns candidates; filter by completeness < 100% in code.

### Calculate Movie Completeness

```typescript
async function getMovieCompleteness(movieId: number): Promise<number> {
  const movie = await db.getMovie(movieId);
  const config = await db.getCompletenessConfig('movies');
  const requiredFields = JSON.parse(config.required_fields);

  let total = 0;
  let satisfied = 0;

  // Check scalar fields
  for (const field of requiredFields) {
    total++;
    if (movie[field] !== null && movie[field] !== '') {
      satisfied++;
    }
  }

  // Check images
  const imageCounts = await db.getImageCounts(movieId, 'movie');
  const imageTypes = ['poster', 'fanart', 'landscape', 'keyart', 'banner', 'clearart', 'clearlogo', 'discart'];

  for (const imageType of imageTypes) {
    const required = config[`required_${imageType}s`];
    if (required > 0) {
      total++;
      if ((imageCounts[imageType] || 0) >= required) {
        satisfied++;
      }
    }
  }

  return total > 0 ? (satisfied / total) * 100 : 100;
}
```

### Check NFO Hash for Changes

```sql
-- Find movies whose NFO files have changed since last parse
SELECT m.id, m.title, m.file_path, m.nfo_hash
FROM movies m
WHERE m.nfo_hash IS NULL
   OR m.nfo_hash != :new_hash;
```

**Workflow:**
1. During library scan, calculate SHA-256 hash of each NFO file
2. Compare against `nfo_hash` column
3. If hash differs or is NULL → re-parse NFO and merge changes
4. Locked fields are preserved during merge

### Get Movies in a Collection/Set

```sql
SELECT m.*
FROM movies m
JOIN sets s ON m.set_id = s.id
WHERE s.name = 'Kick-Ass Collection'
ORDER BY m.year;
```

### Get Selected Images for Movie

```sql
SELECT *
FROM images
WHERE entity_type = 'movie'
  AND entity_id = ?
  AND is_selected = 1
ORDER BY image_type;
```

### Find Duplicate Images (Perceptual Hash)

```sql
-- Find images with similar perceptual hashes (90% similarity threshold)
SELECT i1.id AS image1_id, i2.id AS image2_id, i1.image_type, i1.perceptual_hash, i2.perceptual_hash
FROM images i1
JOIN images i2 ON i1.entity_type = i2.entity_type
              AND i1.entity_id = i2.entity_id
              AND i1.image_type = i2.image_type
              AND i1.id < i2.id
WHERE hamming_distance(i1.perceptual_hash, i2.perceptual_hash) <= 6  -- Approx 90% similarity
ORDER BY i1.entity_type, i1.entity_id, i1.image_type;
```

**Note**: `hamming_distance()` is a custom function. Calculate in application code for each candidate pair.

### Translate Path for Media Player

```typescript
function translatePath(playerId: number, metarrPath: string): string {
  const mappings = db.getPlayerPathMappings(playerId);

  // Sort by metarr_path length descending (longest prefix first)
  mappings.sort((a, b) => b.metarr_path.length - a.metarr_path.length);

  for (const mapping of mappings) {
    if (metarrPath.startsWith(mapping.metarr_path)) {
      return metarrPath.replace(mapping.metarr_path, mapping.player_path);
    }
  }

  return metarrPath;  // No mapping found, return original
}
```

### Get Activity Log for Entity

```sql
SELECT *
FROM activity_log
WHERE entity_type = 'movie'
  AND entity_id = ?
ORDER BY timestamp DESC
LIMIT 50;
```

### Get Recent Activity (All Entities)

```sql
SELECT *
FROM activity_log
ORDER BY timestamp DESC
LIMIT 100;
```

## Incremental Scanning Pattern

### Step 1: Discover New Directories

```sql
-- Insert new directories found on filesystem
INSERT OR IGNORE INTO movies (title, file_path, status, nfo_parsed_at)
VALUES ('The Matrix (1999)', '/movies/The Matrix (1999)/', 'needs_identification', NULL);
```

**Note**: New movies are marked with `status = 'needs_identification'` if no NFO file or provider IDs found.

### Step 2: Update Existing Entries

```sql
-- Update metadata from re-parsed NFO
UPDATE movies
SET
  title = ?,
  year = ?,
  plot = ?,
  tmdb_id = ?,
  imdb_id = ?,
  nfo_parsed_at = CURRENT_TIMESTAMP,
  updated_at = CURRENT_TIMESTAMP
WHERE id = ?;
```

### Step 3: Mark Deleted Directories (Soft Delete)

```sql
-- Mark movies for deletion (7-day grace period)
UPDATE movies
SET deleted_on = DATETIME('now', '+7 days')
WHERE file_path NOT IN (
  -- List of currently discovered directories
  SELECT path FROM temp_discovered_paths
)
AND deleted_on IS NULL;  -- Don't update if already marked for deletion
```

**Note**: Scheduled cleanup task runs daily to permanently delete items where `deleted_on <= NOW()`. This allows recovery within the 7-day grace period.

### Step 4: Update Link Tables

```sql
-- Clear existing links for movie
DELETE FROM movies_genres WHERE movie_id = ?;
DELETE FROM movies_actors WHERE movie_id = ?;
DELETE FROM movies_directors WHERE movie_id = ?;

-- Insert new links
INSERT INTO movies_genres (movie_id, genre_id) VALUES (?, ?);
-- Repeat for actors, directors, etc.
```

## Transaction Patterns

### Movie Insert with Full Metadata

```typescript
db.transaction(() => {
  // 1. Insert/get normalized entities
  const genreIds = genres.map(name => getOrCreateGenre(name));
  const actorIds = actors.map(actor => getOrCreateActor(actor.name));
  const directorIds = directors.map(name => getOrCreateDirector(name));
  const setId = set ? getOrCreateSet(set.name) : null;

  // 2. Insert movie
  const movieId = db.run(`
    INSERT INTO movies (title, year, plot, tmdb_id, imdb_id, set_id, ...)
    VALUES (?, ?, ?, ?, ?, ?, ...)
  `, [title, year, plot, tmdbId, imdbId, setId, ...]);

  // 3. Insert links
  genreIds.forEach(genreId => {
    db.run('INSERT INTO movies_genres (movie_id, genre_id) VALUES (?, ?)',
      [movieId, genreId]);
  });

  actorIds.forEach((actorId, index) => {
    db.run('INSERT INTO movies_actors (movie_id, actor_id, role, order_index) VALUES (?, ?, ?, ?)',
      [movieId, actorId, actors[index].role, index]);
  });

  // 4. Insert ratings
  ratings.forEach(rating => {
    db.run('INSERT INTO ratings (entity_type, entity_id, source, value, votes) VALUES (?, ?, ?, ?, ?)',
      ['movie', movieId, rating.source, rating.value, rating.votes]);
  });
});
```

## Best Practices

### 1. Use Transactions for Multi-Table Operations
Wrap related inserts/updates in transactions to ensure consistency.

### 2. Leverage Normalized Entities
Check for existing entities before creating new ones to avoid duplicates.

### 3. Clean Up Orphans Periodically
Run orphan cleanup after library scans or deletions.

### 4. Index Frequently Queried Columns
Provider IDs, status fields, and foreign keys should be indexed.

### 5. Use Prepared Statements
Prevent SQL injection and improve performance with prepared statements.

### 6. Handle NULL Values Gracefully
Use `IS NULL` / `IS NOT NULL` rather than `= NULL` / `!= NULL`.

### 7. Optimize JOIN Queries
Use appropriate JOIN types (INNER, LEFT) based on data requirements.

### 8. Batch Operations for Performance
Use batch inserts for large datasets (e.g., initial library scan).

## Migration Examples

### Adding New Column

```sql
-- Add new column with default value
ALTER TABLE movies ADD COLUMN certification_country TEXT DEFAULT 'US';
```

### Adding New Table

```sql
-- Create new entity table
CREATE TABLE keywords (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Create link table
CREATE TABLE movies_keywords (
  movie_id INTEGER NOT NULL,
  keyword_id INTEGER NOT NULL,
  PRIMARY KEY (movie_id, keyword_id),
  FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
  FOREIGN KEY (keyword_id) REFERENCES keywords(id) ON DELETE CASCADE
);
```

### Backfilling Data

```sql
-- Backfill missing sort_title from title
UPDATE movies
SET sort_title = title
WHERE sort_title IS NULL;
```
