# Database Schema

**Purpose**: Complete data model for Metarr's metadata, assets, configuration, and job queue.

**Related Docs**:
- Parent: [Architecture Overview](OVERVIEW.md)
- Asset Management: [ASSET_MANAGEMENT/](ASSET_MANAGEMENT/)
- Job Queue: [JOB_QUEUE.md](JOB_QUEUE.md)

## Quick Reference

- **Database**: SQLite (default) / PostgreSQL (production)
- **Migrations**: Version-controlled in `src/database/migrations/`
- **Key Tables**: movies, series, cache_image_files, library_image_files, jobs
- **Design Principles**: Content-addressed caching, field-level locking, soft deletes

## Database Engines

### SQLite (Default)

**Use Cases**:
- Development environments
- Small to medium libraries (< 5000 items)
- Single-server deployments
- Embedded/Docker deployments

**Advantages**:
- Zero configuration
- Single file database
- Fast for read-heavy workloads
- Embedded in application

**Location**: `/data/metarr.sqlite`

### PostgreSQL (Production)

**Use Cases**:
- Large libraries (> 10000 items)
- High-concurrency environments
- Multi-server deployments
- Production environments

**Advantages**:
- Better concurrent write performance
- Advanced indexing options
- Connection pooling
- Proven scalability

**Configuration**:
```env
DB_TYPE=postgres
DATABASE_URL=postgresql://user:pass@localhost/metarr
```

## Core Media Tables

### movies

Primary table for movie metadata and status.

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

  -- Production metadata (read-only from providers)
  budget INTEGER,               -- Production budget in USD
  revenue INTEGER,              -- Box office revenue in USD
  homepage TEXT,                -- Official movie website URL
  original_language TEXT,       -- ISO 639-1 language code (e.g., "en", "ja")
  popularity REAL,              -- TMDB popularity metric (0-1000+ range)
  status TEXT,                  -- Production status (Released, In Production, etc.)

  -- External IDs
  tmdb_id INTEGER,
  imdb_id TEXT,

  -- Selected assets (FK to cache_image_files)
  poster_id INTEGER,
  fanart_id INTEGER,
  logo_id INTEGER,
  banner_id INTEGER,
  clearart_id INTEGER,
  discart_id INTEGER,

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
CREATE INDEX idx_movies_popularity ON movies(popularity DESC);
CREATE INDEX idx_movies_budget ON movies(budget);
CREATE INDEX idx_movies_revenue ON movies(revenue);
CREATE INDEX idx_movies_original_language ON movies(original_language);
```

**Read-Only Fields Note**: The 6 new production metadata fields (budget, revenue, homepage, original_language, popularity, status) are read-only reference data from TMDB. These fields are populated during the enrichment phase and cannot be edited by users. No lock columns are needed for these fields.

### movie_external_ids

Stores external site and social media IDs for movies. Separate table to avoid bloating movies table.

```sql
CREATE TABLE movie_external_ids (
  movie_id INTEGER PRIMARY KEY,
  facebook_id TEXT,             -- Facebook page ID
  instagram_id TEXT,            -- Instagram handle
  twitter_id TEXT,              -- Twitter/X handle
  wikidata_id TEXT,             -- Wikidata entity ID
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE
);

CREATE INDEX idx_movie_external_ids_updated ON movie_external_ids(updated_at);
```

**Design Rationale**:
- Wide table design (one column per site) for single-row read performance
- IDs stored as stubs (e.g., "inception"), not full URLs
- URLs built dynamically in application code at runtime
- Separate from movies table to avoid NULL column proliferation
- Updated during enrichment phase from TMDB metadata

### series

TV show metadata and directory tracking.

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
  logo_id INTEGER,

  -- Status
  monitored BOOLEAN DEFAULT 1,

  -- Timestamps
  last_scanned TIMESTAMP,
  last_enriched TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Field locks
  title_locked BOOLEAN DEFAULT 0,
  plot_locked BOOLEAN DEFAULT 0,
  poster_locked BOOLEAN DEFAULT 0,

  FOREIGN KEY (library_id) REFERENCES libraries(id)
);

CREATE INDEX idx_series_library ON series(library_id);
CREATE INDEX idx_series_tmdb ON series(tmdb_id);
CREATE INDEX idx_series_tvdb ON series(tvdb_id);
```

### seasons

TV season metadata.

```sql
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

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE,
  UNIQUE(series_id, season_number)
);

CREATE INDEX idx_seasons_series ON seasons(series_id);
```

### episodes

TV episode metadata and file tracking.

```sql
CREATE TABLE episodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  series_id INTEGER NOT NULL,
  season_id INTEGER NOT NULL,

  -- File information
  file_path TEXT NOT NULL UNIQUE,
  file_size INTEGER,
  file_modified TIMESTAMP,

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

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE,
  FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE,
  UNIQUE(series_id, season_number, episode_number)
);

CREATE INDEX idx_episodes_series ON episodes(series_id);
CREATE INDEX idx_episodes_season ON episodes(season_id);
CREATE INDEX idx_episodes_file_path ON episodes(file_path);
```

## Asset Management Tables

### cache_image_files

Protected cache storage (source of truth). See [ASSET_MANAGEMENT/](ASSET_MANAGEMENT/) for details.

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
  file_hash TEXT NOT NULL,               -- SHA256 hash

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

**Note**: Polymorphic foreign key constraints enforced via triggers (see migration `20251015_001_clean_schema.ts`).

### library_image_files

Published working copies in library directories.

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

### asset_candidates

Provider URLs and metadata for asset selection.

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

## Stream Information Tables

### video_streams

Video stream technical details.

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

  CHECK((movie_id IS NOT NULL) != (episode_id IS NOT NULL)),
  FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
  FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE
);

CREATE INDEX idx_video_streams_movie ON video_streams(movie_id);
CREATE INDEX idx_video_streams_episode ON video_streams(episode_id);
```

### audio_streams

Audio stream details.

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

  CHECK((movie_id IS NOT NULL) != (episode_id IS NOT NULL)),
  FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
  FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE
);

CREATE INDEX idx_audio_streams_movie ON audio_streams(movie_id);
CREATE INDEX idx_audio_streams_episode ON audio_streams(episode_id);
```

### subtitle_streams

Subtitle stream and external file tracking.

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

  CHECK((movie_id IS NOT NULL) != (episode_id IS NOT NULL)),
  FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
  FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE
);

CREATE INDEX idx_subtitle_streams_movie ON subtitle_streams(movie_id);
CREATE INDEX idx_subtitle_streams_episode ON subtitle_streams(episode_id);
```

## Job Queue Table

See [JOB_QUEUE.md](JOB_QUEUE.md) for complete job system documentation.

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

### people

Actors, directors, crew members.

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
  birthplace TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_people_tmdb ON people(tmdb_id);
CREATE INDEX idx_people_name ON people(name);
```

### movie_cast / series_cast

Cast associations with characters.

```sql
CREATE TABLE movie_cast (
  movie_id INTEGER NOT NULL,
  person_id INTEGER NOT NULL,
  character TEXT,
  order_index INTEGER,
  PRIMARY KEY (movie_id, person_id),
  FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
  FOREIGN KEY (person_id) REFERENCES people(id)
);

CREATE TABLE series_cast (
  series_id INTEGER NOT NULL,
  person_id INTEGER NOT NULL,
  character TEXT,
  order_index INTEGER,
  PRIMARY KEY (series_id, person_id),
  FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE,
  FOREIGN KEY (person_id) REFERENCES people(id)
);
```

### movie_crew / series_crew

Crew associations (directors, writers, producers).

```sql
CREATE TABLE movie_crew (
  movie_id INTEGER NOT NULL,
  person_id INTEGER NOT NULL,
  job TEXT NOT NULL,                    -- 'Director', 'Writer', 'Producer'
  department TEXT,
  PRIMARY KEY (movie_id, person_id, job),
  FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
  FOREIGN KEY (person_id) REFERENCES people(id)
);

CREATE TABLE series_crew (
  series_id INTEGER NOT NULL,
  person_id INTEGER NOT NULL,
  job TEXT NOT NULL,
  department TEXT,
  PRIMARY KEY (series_id, person_id, job),
  FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE,
  FOREIGN KEY (person_id) REFERENCES people(id)
);
```

### genres

Normalized genre list.

```sql
CREATE TABLE genres (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE movie_genres (
  movie_id INTEGER NOT NULL,
  genre_id INTEGER NOT NULL,
  PRIMARY KEY (movie_id, genre_id),
  FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
  FOREIGN KEY (genre_id) REFERENCES genres(id)
);

CREATE TABLE series_genres (
  series_id INTEGER NOT NULL,
  genre_id INTEGER NOT NULL,
  PRIMARY KEY (series_id, genre_id),
  FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE,
  FOREIGN KEY (genre_id) REFERENCES genres(id)
);
```

### studios

Production companies.

```sql
CREATE TABLE studios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  logo_path TEXT
);

CREATE TABLE movie_studios (
  movie_id INTEGER NOT NULL,
  studio_id INTEGER NOT NULL,
  PRIMARY KEY (movie_id, studio_id),
  FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
  FOREIGN KEY (studio_id) REFERENCES studios(id)
);

CREATE TABLE series_studios (
  series_id INTEGER NOT NULL,
  studio_id INTEGER NOT NULL,
  PRIMARY KEY (series_id, studio_id),
  FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE,
  FOREIGN KEY (studio_id) REFERENCES studios(id)
);
```

## System Tables

### recycle_bin

Soft delete tracking with 30-day retention.

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

### configuration

Key-value configuration storage.

```sql
CREATE TABLE configuration (
  key TEXT PRIMARY KEY,
  value TEXT,
  type TEXT,                             -- 'string', 'number', 'boolean', 'json'
  description TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### libraries

Library path configuration.

```sql
CREATE TABLE libraries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  path TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK(type IN ('movie', 'tv', 'music')),
  enabled BOOLEAN DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_libraries_type ON libraries(type);
```

## Migration System

### Location

Migrations stored in: `src/database/migrations/`

### Naming Convention

```
YYYYMMDD_NNN_description.ts

Examples:
20251015_001_clean_schema.ts
20251101_001_add_field_locks.ts
```

### Migration Structure

```typescript
import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Apply changes
  await knex.schema.createTable('new_table', (table) => {
    table.increments('id').primary();
    table.text('name').notNullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  // Rollback changes
  await knex.schema.dropTable('new_table');
}
```

### Running Migrations

```bash
# Apply all pending migrations
npm run migrate:latest

# Rollback last migration
npm run migrate:rollback

# Check migration status
npm run migrate:status
```

## See Also

- [Architecture Overview](OVERVIEW.md) - System design
- [Asset Management](ASSET_MANAGEMENT/) - Asset table details
- [Job Queue](JOB_QUEUE.md) - Job processing system
- [API Architecture](API.md) - Database query endpoints
