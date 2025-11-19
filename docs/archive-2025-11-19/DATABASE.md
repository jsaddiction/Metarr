# Database Schema

**Purpose**: Complete data model for Metarr's metadata, assets, and configuration.

**Database**: SQLite (development) / PostgreSQL (production)

## Overview

Metarr uses a relational database with these design principles:

- **Content-addressed caching**: SHA256 hashing with deduplication
- **Field-level locking**: Preserve user edits from automation
- **Normalized metadata**: Shared actors, genres, studios across media
- **Job queue integration**: Priority-based background processing
- **Soft deletes**: 30-day recovery window for all deletions

## Core Media Tables

### Movies

```sql
CREATE TABLE movies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  library_id INTEGER NOT NULL,

  -- File information
  file_path TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  file_size INTEGER,
  file_modified TIMESTAMP,

  -- Core metadata
  title TEXT NOT NULL,
  original_title TEXT,
  sort_title TEXT,
  year INTEGER,
  release_date DATE,
  runtime INTEGER,              -- Minutes
  plot TEXT,
  tagline TEXT,

  -- Ratings
  rating REAL,                  -- 0-10 scale
  vote_count INTEGER,
  mpaa_rating TEXT,
  content_rating TEXT,

  -- External IDs
  tmdb_id INTEGER,
  imdb_id TEXT,

  -- Selected assets (FK to cache_image_files)
  poster_id INTEGER,
  fanart_id INTEGER,
  logo_id INTEGER,
  disc_art_id INTEGER,

  -- Status flags
  identification_status TEXT DEFAULT 'discovered',
  monitored BOOLEAN DEFAULT 1,

  -- Timestamps
  last_scanned TIMESTAMP,
  last_enriched TIMESTAMP,
  last_published TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Field locks (user edits preserved)
  title_locked BOOLEAN DEFAULT 0,
  plot_locked BOOLEAN DEFAULT 0,
  poster_locked BOOLEAN DEFAULT 0,
  fanart_locked BOOLEAN DEFAULT 0,

  FOREIGN KEY (library_id) REFERENCES libraries(id)
);

CREATE INDEX idx_movies_library ON movies(library_id);
CREATE INDEX idx_movies_tmdb ON movies(tmdb_id);
CREATE INDEX idx_movies_monitored ON movies(monitored);
CREATE INDEX idx_movies_status ON movies(identification_status);
```

### TV Shows

```sql
CREATE TABLE series (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  library_id INTEGER NOT NULL,

  -- Directory information
  directory_path TEXT NOT NULL UNIQUE,

  -- Core metadata
  title TEXT NOT NULL,
  original_title TEXT,
  year INTEGER,
  first_aired DATE,
  status TEXT,                  -- 'continuing', 'ended', 'cancelled'
  plot TEXT,

  -- External IDs
  tmdb_id INTEGER,
  tvdb_id INTEGER,
  imdb_id TEXT,

  -- Selected assets
  poster_id INTEGER,
  fanart_id INTEGER,
  banner_id INTEGER,

  -- Status
  monitored BOOLEAN DEFAULT 1,

  FOREIGN KEY (library_id) REFERENCES libraries(id)
);

CREATE TABLE seasons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  series_id INTEGER NOT NULL,
  season_number INTEGER NOT NULL,

  -- Metadata
  title TEXT,
  plot TEXT,
  air_date DATE,

  -- Assets
  poster_id INTEGER,

  FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE,
  UNIQUE(series_id, season_number)
);

CREATE TABLE episodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  series_id INTEGER NOT NULL,
  season_id INTEGER NOT NULL,

  -- File information
  file_path TEXT NOT NULL UNIQUE,
  file_size INTEGER,

  -- Episode info
  season_number INTEGER NOT NULL,
  episode_number INTEGER NOT NULL,

  -- Metadata
  title TEXT,
  plot TEXT,
  air_date DATE,
  runtime INTEGER,

  -- Assets
  thumbnail_id INTEGER,

  FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE,
  FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE,
  UNIQUE(series_id, season_number, episode_number)
);
```

## Asset Management

### Cache Image Files (Protected Storage)

Content-addressed image storage using polymorphic associations. Survives library deletions.

```sql
CREATE TABLE cache_image_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Polymorphic association
  entity_type TEXT NOT NULL CHECK(entity_type IN ('movie', 'episode', 'series', 'season', 'actor')),
  entity_id INTEGER NOT NULL,

  -- File information (content-addressed)
  file_path TEXT UNIQUE NOT NULL,        -- /data/cache/assets/ab/c1/abc123...jpg
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_hash TEXT,                        -- SHA256 hash

  -- Image hashing for similarity detection
  perceptual_hash TEXT,
  difference_hash TEXT,

  -- Image type and dimensions
  image_type TEXT NOT NULL CHECK(image_type IN (
    'poster', 'fanart', 'banner', 'clearlogo', 'clearart', 'discart',
    'landscape', 'keyart', 'thumb', 'actor_thumb', 'unknown'
  )),
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  format TEXT NOT NULL,                  -- 'jpg', 'png', etc.
  has_alpha BOOLEAN DEFAULT NULL,
  foreground_ratio REAL DEFAULT NULL,    -- For classification scoring

  -- Provenance tracking
  source_type TEXT CHECK(source_type IN ('provider', 'local', 'user')),
  source_url TEXT,                       -- Original provider URL
  provider_name TEXT,                    -- 'tmdb', 'fanart.tv', etc.
  classification_score INTEGER,          -- Quality score from image analysis

  -- Field locking
  is_locked BOOLEAN DEFAULT 0,

  -- Timestamps
  discovered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_accessed_at TIMESTAMP
);

-- Optimized composite index for entity lookups with sorting
CREATE INDEX idx_cache_images_entity_score ON cache_image_files(
  entity_type, entity_id, image_type,
  classification_score DESC, discovered_at DESC
);
CREATE INDEX idx_cache_images_hash ON cache_image_files(file_hash);
CREATE INDEX idx_cache_images_locked ON cache_image_files(is_locked);
```

### Library Image Files (Published Working Copies)

Working copies deployed to library directories for media player scanning. Can be rebuilt from cache.

```sql
CREATE TABLE library_image_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cache_file_id INTEGER NOT NULL,
  file_path TEXT UNIQUE NOT NULL,        -- /media/movies/Movie (2024)/movie-poster.jpg
  published_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (cache_file_id) REFERENCES cache_image_files(id) ON DELETE CASCADE
);

CREATE INDEX idx_library_images_cache ON library_image_files(cache_file_id);
CREATE INDEX idx_library_images_path ON library_image_files(file_path);
```

**Note**: Polymorphic foreign key constraints are enforced via triggers (see migration `20251015_001_clean_schema.ts` lines 271-318). When a movie/series/episode/season/actor is deleted, associated cache files are automatically cleaned up.

### Asset Candidates (Provider URLs)

```sql
CREATE TABLE asset_candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Entity reference
  entity_type TEXT NOT NULL,             -- 'movie', 'series', 'season', 'episode'
  entity_id INTEGER NOT NULL,

  -- Asset info
  asset_type TEXT NOT NULL,              -- 'poster', 'fanart', 'logo', etc.
  provider TEXT NOT NULL,                -- 'tmdb', 'tvdb', 'fanart.tv'
  provider_id TEXT,
  url TEXT NOT NULL,

  -- Metadata for scoring
  width INTEGER,
  height INTEGER,
  language TEXT,
  vote_average REAL,
  vote_count INTEGER,

  -- Selection
  score REAL,                            -- Calculated quality score
  is_selected BOOLEAN DEFAULT 0,         -- Auto or manually selected
  is_blocked BOOLEAN DEFAULT 0,          -- User rejected this
  user_locked BOOLEAN DEFAULT 0,         -- Manual selection locked

  -- Cache reference
  cache_file_id INTEGER,                 -- If downloaded (FK to cache_image_files)

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_refreshed TIMESTAMP,

  FOREIGN KEY (cache_file_id) REFERENCES cache_image_files(id),
  UNIQUE(entity_type, entity_id, asset_type, url)
);

CREATE INDEX idx_candidates_entity ON asset_candidates(entity_type, entity_id);
CREATE INDEX idx_candidates_selected ON asset_candidates(is_selected);
CREATE INDEX idx_candidates_score ON asset_candidates(score DESC);
```

## Stream Information

### Video Streams

```sql
CREATE TABLE video_streams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  movie_id INTEGER,
  episode_id INTEGER,

  -- Stream info
  stream_index INTEGER NOT NULL,
  codec TEXT NOT NULL,                   -- 'h264', 'h265', 'av1'
  profile TEXT,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  aspect_ratio TEXT,
  framerate REAL,
  bitrate INTEGER,

  -- HDR info
  color_space TEXT,
  color_transfer TEXT,
  color_primaries TEXT,
  hdr_format TEXT,                       -- 'HDR10', 'HDR10+', 'Dolby Vision'

  CHECK((movie_id IS NOT NULL) != (episode_id IS NOT NULL))
);
```

### Audio Streams

```sql
CREATE TABLE audio_streams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  movie_id INTEGER,
  episode_id INTEGER,

  stream_index INTEGER NOT NULL,
  codec TEXT NOT NULL,                   -- 'aac', 'ac3', 'dts', 'truehd'
  channels INTEGER NOT NULL,
  channel_layout TEXT,                   -- '5.1', '7.1', 'stereo'
  sample_rate INTEGER,
  bitrate INTEGER,
  language TEXT,
  title TEXT,
  is_default BOOLEAN DEFAULT 0,

  CHECK((movie_id IS NOT NULL) != (episode_id IS NOT NULL))
);
```

### Subtitle Streams

```sql
CREATE TABLE subtitle_streams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  movie_id INTEGER,
  episode_id INTEGER,

  stream_index INTEGER,                  -- NULL for external files
  file_path TEXT,                        -- External subtitle path
  codec TEXT,                            -- 'srt', 'ass', 'pgs'
  language TEXT,
  title TEXT,
  is_forced BOOLEAN DEFAULT 0,
  is_default BOOLEAN DEFAULT 0,
  is_external BOOLEAN DEFAULT 0,

  CHECK((movie_id IS NOT NULL) != (episode_id IS NOT NULL))
);
```

## Job Queue

```sql
CREATE TABLE jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Job definition
  type TEXT NOT NULL,                    -- 'scan', 'enrich', 'publish', 'sync'
  status TEXT DEFAULT 'pending',         -- 'pending', 'running', 'completed', 'failed'
  priority INTEGER DEFAULT 5,            -- 1=highest, 10=lowest

  -- Payload
  entity_type TEXT,                      -- 'movie', 'series', etc.
  entity_id INTEGER,
  payload TEXT,                          -- JSON data

  -- Execution
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  worker_id TEXT,                        -- Which worker processing

  -- Timing
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  next_retry TIMESTAMP,

  -- Results
  result TEXT,                          -- JSON result data
  error TEXT,                           -- Error message if failed

  CHECK(priority BETWEEN 1 AND 10)
);

CREATE INDEX idx_jobs_status_priority ON jobs(status, priority);
CREATE INDEX idx_jobs_type ON jobs(type);
CREATE INDEX idx_jobs_entity ON jobs(entity_type, entity_id);
```

## Metadata Tables

### People

```sql
CREATE TABLE people (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  tmdb_id INTEGER UNIQUE,
  imdb_id TEXT UNIQUE,
  profile_image TEXT,
  biography TEXT,
  birthday DATE,
  deathday DATE,
  birthplace TEXT
);

-- Link tables
CREATE TABLE movie_cast (
  movie_id INTEGER NOT NULL,
  person_id INTEGER NOT NULL,
  character TEXT,
  order_index INTEGER,
  FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
  FOREIGN KEY (person_id) REFERENCES people(id)
);

CREATE TABLE movie_crew (
  movie_id INTEGER NOT NULL,
  person_id INTEGER NOT NULL,
  job TEXT NOT NULL,                    -- 'Director', 'Writer', 'Producer'
  department TEXT,
  FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
  FOREIGN KEY (person_id) REFERENCES people(id)
);
```

### Genres & Studios

```sql
CREATE TABLE genres (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE studios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  logo_path TEXT
);

-- Link tables
CREATE TABLE movie_genres (
  movie_id INTEGER NOT NULL,
  genre_id INTEGER NOT NULL,
  PRIMARY KEY (movie_id, genre_id),
  FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
  FOREIGN KEY (genre_id) REFERENCES genres(id)
);

CREATE TABLE movie_studios (
  movie_id INTEGER NOT NULL,
  studio_id INTEGER NOT NULL,
  PRIMARY KEY (movie_id, studio_id),
  FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
  FOREIGN KEY (studio_id) REFERENCES studios(id)
);
```

## System Tables

### Recycle Bin

```sql
CREATE TABLE recycle_bin (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  original_path TEXT NOT NULL,
  recycle_path TEXT NOT NULL,
  file_type TEXT,
  file_size INTEGER,
  deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP,                  -- When to permanently delete
  restored_at TIMESTAMP,                 -- If restored
  entity_type TEXT,
  entity_id INTEGER
);

CREATE INDEX idx_recycle_expires ON recycle_bin(expires_at);
CREATE INDEX idx_recycle_entity ON recycle_bin(entity_type, entity_id);
```

### Configuration

```sql
CREATE TABLE configuration (
  key TEXT PRIMARY KEY,
  value TEXT,
  type TEXT,                             -- 'string', 'number', 'boolean', 'json'
  description TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Default configuration
INSERT INTO configuration (key, value, type, description) VALUES
  ('scan.auto_enrich', 'true', 'boolean', 'Auto-enrich after scan'),
  ('enrich.auto_publish', 'false', 'boolean', 'Auto-publish after enrich'),
  ('publish.use_kodi_naming', 'true', 'boolean', 'Use Kodi naming convention'),
  ('recycle.enabled', 'true', 'boolean', 'Use recycle bin'),
  ('recycle.retention_days', '30', 'number', 'Days to keep recycled files');
```

## Indexes & Constraints

```sql
-- Performance indexes
CREATE INDEX idx_movies_file_path ON movies(file_path);
CREATE INDEX idx_series_directory ON series(directory_path);
CREATE INDEX idx_episodes_file_path ON episodes(file_path);

-- Integrity constraints
ALTER TABLE movies ADD CONSTRAINT chk_year
  CHECK(year BETWEEN 1888 AND 2100);

ALTER TABLE movies ADD CONSTRAINT chk_rating
  CHECK(rating BETWEEN 0 AND 10);

-- Trigger for updated_at
CREATE TRIGGER update_movies_timestamp
AFTER UPDATE ON movies
BEGIN
  UPDATE movies SET updated_at = CURRENT_TIMESTAMP
  WHERE id = NEW.id;
END;
```

## Migration Strategy

### Development (Pre-release)
- Direct schema manipulation allowed
- Database recreation on schema changes
- No migration files needed

### Production (Post-release)
- Migration files in `src/database/migrations/`
- Versioned migrations with up/down methods
- Zero-downtime migrations where possible

## Performance Considerations

- **Indexes**: Cover all foreign keys and common queries
- **Denormalization**: Selected asset IDs on media tables for fast access
- **JSON columns**: Flexible storage for provider-specific data
- **Batch operations**: Design supports bulk inserts/updates
- **Connection pooling**: PostgreSQL production configuration

## Related Documentation

### Phases Using Database
- [Scanning Phase](phases/SCANNING.md) - Movie/series discovery
- [Enrichment Phase](phases/ENRICHMENT.md) - Asset candidate storage
- [Publishing Phase](phases/PUBLISHING.md) - Recycle bin management
- [Player Sync Phase](phases/PLAYER_SYNC.md) - Player configuration
- [Verification Phase](phases/VERIFICATION.md) - Verification history

### Related Systems
- [API Architecture](API.md) - Database query endpoints
- [Development](DEVELOPMENT.md) - Migration patterns