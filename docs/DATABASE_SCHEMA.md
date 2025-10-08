# Database Schema Reference

**Last Updated**: 2025-10-08
**Status**: Design Phase - Pre-Implementation
**Related Docs**: [ARCHITECTURE.md](ARCHITECTURE.md), [ASSET_MANAGEMENT.md](ASSET_MANAGEMENT.md), [WORKFLOWS.md](WORKFLOWS.md)

This document provides the complete database schema for Metarr's redesigned architecture, including all new tables for the three-tier asset system, state machine tracking, and publishing workflow.

---

## Table of Contents

1. [Schema Design Principles](#schema-design-principles)
2. [Core Media Tables](#core-media-tables)
3. [Asset Management Tables](#asset-management-tables)
4. [Automation & Publishing Tables](#automation--publishing-tables)
5. [Stream Details Tables](#stream-details-tables)
6. [Normalized Entity Tables](#normalized-entity-tables)
7. [System Tables](#system-tables)
8. [Notification System Tables](#notification-system-tables)
9. [Many-to-Many Link Tables](#many-to-many-link-tables)
10. [Common Query Patterns](#common-query-patterns)
11. [Migration Strategy](#migration-strategy)

---

## Schema Design Principles

### Normalized Design

Metarr uses fully normalized schema to:
- **Eliminate duplication**: Actors, genres, directors shared across media
- **Enable efficient updates**: Change actor name once, affects all movies
- **Support incremental scans**: Update existing records without losing custom metadata
- **Automatic cleanup**: Cascade deletes remove orphaned references

### Content-Addressed Storage

Assets stored using SHA256 hash as filename:
- **Automatic deduplication**: Same file stored once regardless of usage
- **Integrity verification**: Rehash file to detect corruption
- **Immutable naming**: Filename never changes (perfect for caching)
- **Database tracking**: `cache_inventory` table tracks reference counts

### State Machine Architecture

Media items transition through well-defined lifecycle states:
```
discovered → identified → enriching → enriched → selected → published
```

Special states:
- `needs_identification`: No provider IDs found
- `error_*`: Various error conditions (provider failure, network, etc.)

### Field-Level Locking

Every lockable field has corresponding `{field}_locked` boolean:
- Manual user edits automatically lock field
- Locked fields excluded from automated updates
- No explicit "monitored" flag (computed from locks + completeness)

See [FIELD_LOCKING.md](FIELD_LOCKING.md) for details.

### Soft Deletes with Grace Periods

- `deleted_on`: Set to NOW() + 90 days on deletion
- Scheduled garbage collection deletes when `deleted_on <= CURRENT_TIMESTAMP`
- Allows recovery during grace period

### Cascading Deletes

Foreign keys use `ON DELETE CASCADE` to automatically clean up related records:

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
  ├─ asset_candidates (all asset candidates)
  │   ↓ TRIGGER: orphan_cache_assets
  │   └─ Decrement reference_count in cache_inventory
  │      └─ If ref_count = 0, set orphaned_at = NOW()
  ├─ video_streams (video stream entry)
  ├─ audio_streams (all audio tracks)
  ├─ subtitle_streams (all subtitle tracks)
  └─ unknown_files (all unknown file entries)
```

**Similar Cascade for Series:**
```
DELETE FROM series WHERE id = 1
  ↓ CASCADE
  ├─ episodes (all episodes)
  │   ↓ CASCADE (same as movies)
  │   ├─ episodes_actors
  │   ├─ episodes_directors
  │   ├─ episodes_writers
  │   ├─ asset_candidates → trigger cache orphaning
  │   ├─ audio_streams
  │   ├─ subtitle_streams
  │   └─ video_streams
  ├─ series_actors
  ├─ series_genres
  ├─ series_studios
  ├─ series_tags
  ├─ ratings
  ├─ asset_candidates → trigger cache orphaning
  └─ unknown_files
```

### Cache Asset Orphaning Trigger

**Purpose**: Automatically mark cache assets for garbage collection when all references deleted

```sql
-- Trigger: Decrement cache reference count when asset_candidate deleted
CREATE TRIGGER orphan_cache_assets
AFTER DELETE ON asset_candidates
FOR EACH ROW
WHEN OLD.content_hash IS NOT NULL
BEGIN
  -- Decrement reference count
  UPDATE cache_inventory
  SET reference_count = reference_count - 1
  WHERE content_hash = OLD.content_hash;

  -- Mark as orphaned if ref_count = 0
  UPDATE cache_inventory
  SET orphaned_at = CURRENT_TIMESTAMP
  WHERE content_hash = OLD.content_hash
    AND reference_count = 0
    AND orphaned_at IS NULL;
END;
```

**How It Works:**

1. **User deletes movie** (via UI or webhook):
   ```sql
   DELETE FROM movies WHERE id = 123;
   ```

2. **CASCADE deletes all related records**:
   - `asset_candidates` for movie 123 deleted
   - Trigger fires for each deleted asset_candidate
   - Cache reference counts decremented

3. **Cache assets orphaned**:
   - If `reference_count = 0`, `orphaned_at` set to NOW()
   - Asset remains in cache for 90-day grace period

4. **Garbage collection** (scheduled weekly):
   ```sql
   -- Find orphaned assets older than 90 days
   DELETE FROM cache_inventory
   WHERE orphaned_at IS NOT NULL
     AND orphaned_at < DATETIME('now', '-90 days');
   ```

5. **Physical file deletion**:
   ```typescript
   async function garbageCollect(): Promise<void> {
     const orphaned = await db.query(`
       SELECT * FROM cache_inventory
       WHERE orphaned_at < DATETIME('now', '-90 days')
     `);

     for (const asset of orphaned) {
       await fs.unlink(asset.file_path);
       await db.execute(`DELETE FROM cache_inventory WHERE id = ?`, [asset.id]);
     }
   }
   ```

**Webhook Delete Flow:**

```typescript
// Radarr sends "MovieDelete" webhook
async function handleMovieDeleteWebhook(payload: any): Promise<void> {
  const movie = await db.query(`
    SELECT * FROM movies WHERE tmdb_id = ?
  `, [payload.movie.tmdbId]);

  if (movie) {
    // This triggers cascade delete + cache orphaning
    await db.execute(`DELETE FROM movies WHERE id = ?`, [movie.id]);

    // Log activity
    await logActivity({
      event_type: 'movie.deleted',
      entity_type: 'movie',
      entity_id: movie.id,
      description: `Movie deleted via webhook: ${movie.title}`,
      metadata: JSON.stringify({ trigger: 'webhook', payload })
    });
  }
}
```

**Manual Delete Flow (UI):**

```typescript
// User clicks "Delete" in UI
async function deleteMovie(movieId: number): Promise<void> {
  const movie = await db.getMovie(movieId);

  // Soft delete first (90-day grace period)
  await db.execute(`
    UPDATE movies
    SET deleted_on = DATETIME('now', '+90 days')
    WHERE id = ?
  `, [movieId]);

  // User can restore within 90 days
  // Scheduled job will permanently delete after grace period
}

// Scheduled job: Permanent deletion
async function permanentlyDeleteExpiredMovies(): Promise<void> {
  const expired = await db.query(`
    SELECT * FROM movies
    WHERE deleted_on IS NOT NULL
      AND deleted_on <= CURRENT_TIMESTAMP
  `);

  for (const movie of expired) {
    // This triggers cascade delete + cache orphaning
    await db.execute(`DELETE FROM movies WHERE id = ?`, [movie.id]);
  }
}
```

**Orphaned Entity Cleanup:**

After cascading deletes, orphaned entities (actors, genres, etc. with no links) should be cleaned up:

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

**Note**: Orphan cleanup runs:
- After garbage collection deletes expired movies
- During scheduled maintenance (daily)
- After bulk delete operations

---

## Core Media Tables

### movies

Stores movie metadata from NFO files and provider enrichment.

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

  -- Movie Set/Collection
  set_id INTEGER,         -- FK to sets table

  -- File Info
  file_path TEXT NOT NULL UNIQUE,

  -- NFO Validation
  nfo_hash TEXT,          -- SHA-256 hash of NFO file content
  nfo_parsed_at TEXT,     -- ISO timestamp when NFO was last parsed

  -- State Machine (NEW)
  state TEXT DEFAULT 'discovered',  -- discovered, identified, enriching, enriched, selected, published, needs_identification, error_*
  enriched_at TIMESTAMP,             -- When provider fetch completed
  enrichment_priority INTEGER DEFAULT 5,  -- 1 (highest) to 10 (lowest)

  -- Publishing State (NEW)
  has_unpublished_changes BOOLEAN DEFAULT 0,
  last_published_at TIMESTAMP,
  published_nfo_hash TEXT,          -- Hash of last published NFO

  -- Soft Delete
  deleted_on TIMESTAMP,   -- Set to NOW() + 90 days on deletion

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
  set_id_locked BOOLEAN DEFAULT 0,

  -- Array Field Locking (locked as a whole)
  actors_locked BOOLEAN DEFAULT 0,
  directors_locked BOOLEAN DEFAULT 0,
  writers_locked BOOLEAN DEFAULT 0,
  genres_locked BOOLEAN DEFAULT 0,
  studios_locked BOOLEAN DEFAULT 0,
  tags_locked BOOLEAN DEFAULT 0,
  countries_locked BOOLEAN DEFAULT 0,

  -- Asset Locking (per-type)
  poster_locked BOOLEAN DEFAULT 0,
  fanart_locked BOOLEAN DEFAULT 0,
  banner_locked BOOLEAN DEFAULT 0,
  clearlogo_locked BOOLEAN DEFAULT 0,
  clearart_locked BOOLEAN DEFAULT 0,
  discart_locked BOOLEAN DEFAULT 0,

  -- Timestamps
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (set_id) REFERENCES sets(id) ON DELETE SET NULL
);

-- Critical Indexes
CREATE INDEX idx_movies_tmdb_id ON movies(tmdb_id);
CREATE INDEX idx_movies_imdb_id ON movies(imdb_id);
CREATE INDEX idx_movies_state ON movies(state);
CREATE INDEX idx_movies_file_path ON movies(file_path);
CREATE INDEX idx_movies_deleted_on ON movies(deleted_on);

-- Performance Indexes
CREATE INDEX idx_movies_needs_enrichment
  ON movies(state, enriched_at, enrichment_priority)
  WHERE state = 'identified' AND enriched_at IS NULL;

CREATE INDEX idx_movies_needs_publish
  ON movies(has_unpublished_changes)
  WHERE has_unpublished_changes = 1;
```

**Example Row:**
```json
{
  "id": 1,
  "title": "Kick-Ass",
  "year": 2010,
  "tmdb_id": 12345,
  "imdb_id": "tt1250777",
  "plot": "A teenager decides to become a superhero...",
  "state": "published",
  "enriched_at": "2025-10-02T10:30:00Z",
  "has_unpublished_changes": 0,
  "last_published_at": "2025-10-02T10:35:00Z",
  "plot_locked": 1,
  "poster_locked": 1,
  "file_path": "M:\\Movies\\Kick-Ass (2010)\\Kick-Ass.mkv"
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
  directory_path TEXT NOT NULL UNIQUE,

  -- NFO Validation
  nfo_hash TEXT,
  nfo_parsed_at TEXT,

  -- State Machine (NEW)
  state TEXT DEFAULT 'discovered',
  enriched_at TIMESTAMP,
  enrichment_priority INTEGER DEFAULT 5,

  -- Publishing State (NEW)
  has_unpublished_changes BOOLEAN DEFAULT 0,
  last_published_at TIMESTAMP,
  published_nfo_hash TEXT,

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
  genres_locked BOOLEAN DEFAULT 0,
  studios_locked BOOLEAN DEFAULT 0,
  tags_locked BOOLEAN DEFAULT 0,

  -- Asset Locking
  poster_locked BOOLEAN DEFAULT 0,
  fanart_locked BOOLEAN DEFAULT 0,
  banner_locked BOOLEAN DEFAULT 0,
  clearlogo_locked BOOLEAN DEFAULT 0,

  -- Timestamps
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_series_tmdb_id ON series(tmdb_id);
CREATE INDEX idx_series_tvdb_id ON series(tvdb_id);
CREATE INDEX idx_series_state ON series(state);
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
  file_path TEXT NOT NULL UNIQUE,

  -- NFO Validation
  nfo_hash TEXT,
  nfo_parsed_at TEXT,

  -- State Machine (NEW)
  state TEXT DEFAULT 'discovered',
  enriched_at TIMESTAMP,
  enrichment_priority INTEGER DEFAULT 5,

  -- Publishing State (NEW)
  has_unpublished_changes BOOLEAN DEFAULT 0,
  last_published_at TIMESTAMP,
  published_nfo_hash TEXT,

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

  -- Asset Locking
  thumb_locked BOOLEAN DEFAULT 0,

  -- Timestamps
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE
);

CREATE INDEX idx_episodes_series_id ON episodes(series_id);
CREATE INDEX idx_episodes_season_episode ON episodes(season_number, episode_number);
CREATE INDEX idx_episodes_state ON episodes(state);
CREATE INDEX idx_episodes_deleted_on ON episodes(deleted_on);
```

---

## Asset Management Tables

See [ASSET_MANAGEMENT.md](ASSET_MANAGEMENT.md) for complete workflow documentation.

### asset_candidates

**NEW TABLE** - Tracks all available assets (Provider URLs + Cache)

**Replaces**: `images` table (old two-copy system) and `trailers` table

```sql
CREATE TABLE asset_candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,      -- 'movie', 'series', 'episode', 'actor'
  entity_id INTEGER NOT NULL,
  asset_type TEXT NOT NULL,       -- 'poster', 'fanart', 'banner', 'clearlogo', 'trailer', 'subtitle', etc.

  -- Provider information
  provider TEXT NOT NULL,         -- 'tmdb', 'tvdb', 'fanart.tv', 'local'
  provider_url TEXT,              -- NULL if local file
  provider_metadata TEXT,         -- JSON: { language, vote_avg, vote_count }

  -- Asset properties (from provider API, before download)
  width INTEGER,                  -- For images
  height INTEGER,                 -- For images
  duration_seconds INTEGER,       -- For trailers
  file_size INTEGER,

  -- Download state
  is_downloaded BOOLEAN DEFAULT 0,
  cache_path TEXT,                -- NULL until downloaded
  content_hash TEXT,              -- SHA256 of file content
  perceptual_hash TEXT,           -- pHash for duplicate detection (images only)

  -- Selection state
  is_selected BOOLEAN DEFAULT 0,
  is_rejected BOOLEAN DEFAULT 0,  -- User or algorithm rejected
  selected_by TEXT,               -- 'auto', 'manual', 'local'
  selected_at TIMESTAMP,

  -- Scoring (for auto-selection algorithm)
  auto_score REAL,                -- 0-100

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Cascading deletes when parent entity deleted
  FOREIGN KEY (entity_type, entity_id) REFERENCES movies(id) ON DELETE CASCADE,
  FOREIGN KEY (entity_type, entity_id) REFERENCES series(id) ON DELETE CASCADE,
  FOREIGN KEY (entity_type, entity_id) REFERENCES episodes(id) ON DELETE CASCADE
);

-- Critical Indexes
CREATE INDEX idx_candidates_entity ON asset_candidates(entity_type, entity_id, asset_type);
CREATE INDEX idx_candidates_selected ON asset_candidates(entity_type, entity_id, is_selected);
CREATE INDEX idx_candidates_downloaded ON asset_candidates(is_downloaded);
CREATE INDEX idx_candidates_content_hash ON asset_candidates(content_hash);
CREATE INDEX idx_candidates_provider_url ON asset_candidates(provider, provider_url);

-- Performance Index
CREATE INDEX idx_candidates_needs_download
  ON asset_candidates(is_selected, is_downloaded)
  WHERE is_selected = 1 AND is_downloaded = 0;
```

**Example Rows:**
```json
[
  {
    "id": 123,
    "entity_type": "movie",
    "entity_id": 1,
    "asset_type": "poster",
    "provider": "tmdb",
    "provider_url": "https://image.tmdb.org/t/p/original/abc.jpg",
    "width": 2000,
    "height": 3000,
    "is_downloaded": 1,
    "cache_path": "/data/cache/assets/abc123...xyz.jpg",
    "content_hash": "abc123def456...",
    "perceptual_hash": "a1b2c3d4...",
    "is_selected": 1,
    "selected_by": "manual",
    "auto_score": 87.5
  },
  {
    "id": 124,
    "entity_type": "movie",
    "entity_id": 1,
    "asset_type": "poster",
    "provider": "tmdb",
    "provider_url": "https://image.tmdb.org/t/p/original/def.jpg",
    "width": 1500,
    "height": 2250,
    "is_downloaded": 0,
    "is_selected": 0,
    "is_rejected": 0,
    "auto_score": 72.3
  }
]
```

### cache_inventory

**NEW TABLE** - Tracks content-addressed cache with reference counting

```sql
CREATE TABLE cache_inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_hash TEXT UNIQUE NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  asset_type TEXT NOT NULL,       -- 'image', 'trailer', 'subtitle'
  mime_type TEXT,

  -- Reference counting
  reference_count INTEGER DEFAULT 0,

  -- Lifecycle
  first_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMP,
  orphaned_at TIMESTAMP,          -- Set when ref_count = 0

  -- Image metadata
  width INTEGER,
  height INTEGER,
  perceptual_hash TEXT,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Critical Indexes
CREATE INDEX idx_cache_content_hash ON cache_inventory(content_hash);
CREATE INDEX idx_cache_orphaned ON cache_inventory(orphaned_at);
CREATE INDEX idx_cache_perceptual_hash ON cache_inventory(perceptual_hash);

-- Garbage Collection Index
CREATE INDEX idx_cache_gc
  ON cache_inventory(orphaned_at)
  WHERE orphaned_at IS NOT NULL;
```

**Example Row:**
```json
{
  "id": 1,
  "content_hash": "abc123def456789012345678901234567890123456789012345678901234",
  "file_path": "/data/cache/assets/abc123def456...xyz.jpg",
  "file_size": 1048576,
  "asset_type": "image",
  "mime_type": "image/jpeg",
  "reference_count": 3,
  "width": 2000,
  "height": 3000,
  "perceptual_hash": "a1b2c3d4e5f6g7h8",
  "first_used_at": "2025-10-01T10:00:00Z",
  "last_used_at": "2025-10-04T15:30:00Z",
  "orphaned_at": null
}
```

### asset_selection_config

**NEW TABLE** - Configures auto-selection algorithm per library

```sql
CREATE TABLE asset_selection_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  library_id INTEGER NOT NULL,
  asset_type TEXT NOT NULL,

  -- Quantity
  min_count INTEGER DEFAULT 1,
  max_count INTEGER DEFAULT 3,

  -- Quality filters
  min_width INTEGER,
  min_height INTEGER,
  prefer_language TEXT DEFAULT 'en',

  -- Scoring weights (must sum to 1.0)
  weight_resolution REAL DEFAULT 0.3,
  weight_votes REAL DEFAULT 0.4,
  weight_language REAL DEFAULT 0.2,
  weight_provider REAL DEFAULT 0.1,

  -- Duplicate detection
  phash_similarity_threshold REAL DEFAULT 0.90,

  -- Provider priority (JSON array)
  provider_priority TEXT DEFAULT '["tmdb", "tvdb", "fanart.tv"]',

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE,
  UNIQUE(library_id, asset_type)
);

CREATE INDEX idx_asset_config_library ON asset_selection_config(library_id);
```

**Example Row:**
```json
{
  "library_id": 1,
  "asset_type": "poster",
  "min_count": 1,
  "max_count": 3,
  "min_width": 1000,
  "min_height": 1500,
  "prefer_language": "en",
  "weight_resolution": 0.3,
  "weight_votes": 0.4,
  "weight_language": 0.2,
  "weight_provider": 0.1,
  "phash_similarity_threshold": 0.90,
  "provider_priority": "[\"tmdb\", \"fanart.tv\", \"tvdb\"]"
}
```

### rejected_assets

**NEW TABLE** - Global blacklist for rejected assets

```sql
CREATE TABLE rejected_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  provider_url TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  rejected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reason TEXT,  -- 'user_rejected', 'duplicate', 'low_quality', 'inappropriate'

  UNIQUE(provider, provider_url)
);

CREATE INDEX idx_rejected_provider_url ON rejected_assets(provider, provider_url);
```

### unknown_files

Tracks unrecognized files discovered during scanning.

```sql
CREATE TABLE unknown_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,      -- 'movie', 'series', 'episode'
  entity_id INTEGER NOT NULL,

  -- File Properties
  file_path TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  file_size BIGINT,
  file_extension TEXT,
  mime_type TEXT,

  discovered_at TEXT DEFAULT CURRENT_TIMESTAMP,

  -- Cascading delete when parent entity deleted
  FOREIGN KEY (entity_type, entity_id) REFERENCES movies(id) ON DELETE CASCADE,
  FOREIGN KEY (entity_type, entity_id) REFERENCES series(id) ON DELETE CASCADE,
  FOREIGN KEY (entity_type, entity_id) REFERENCES episodes(id) ON DELETE CASCADE
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
  }
]
```

### completeness_config

Per-media-type configuration for exact quantity requirements.

```sql
CREATE TABLE completeness_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  media_type TEXT NOT NULL UNIQUE,  -- 'movies', 'series', 'episodes'

  -- Required Scalar Fields (JSON array)
  required_fields TEXT NOT NULL,    -- ["plot", "mpaa", "premiered"]

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

  // Check assets
  const assetCounts = getAssetCounts(movie.id);
  for (const assetType of ASSET_TYPES) {
    const required = config[`required_${assetType}s`];
    if (required > 0) {
      total++;
      if (assetCounts[assetType] >= required) satisfied++;
    }
  }

  return (satisfied / total) * 100;
}
```

---

## Automation & Publishing Tables

### library_automation_config

**NEW TABLE** - Configures automation behavior per library

```sql
CREATE TABLE library_automation_config (
  library_id INTEGER PRIMARY KEY,

  -- Automation level
  automation_mode TEXT DEFAULT 'hybrid',  -- 'manual', 'yolo', 'hybrid'

  -- Phase 2 behavior
  auto_enrich BOOLEAN DEFAULT 1,
  auto_select_assets BOOLEAN DEFAULT 1,
  auto_publish BOOLEAN DEFAULT 0,         -- Only true for 'yolo' mode

  -- Webhook behavior
  webhook_enabled BOOLEAN DEFAULT 1,
  webhook_auto_publish BOOLEAN DEFAULT 1,  -- Always publish on webhook

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE
);
```

**Example Configurations:**

**Manual Mode:**
```json
{
  "library_id": 1,
  "automation_mode": "manual",
  "auto_enrich": 0,
  "auto_select_assets": 0,
  "auto_publish": 0,
  "webhook_enabled": 0
}
```

**YOLO Mode:**
```json
{
  "library_id": 1,
  "automation_mode": "yolo",
  "auto_enrich": 1,
  "auto_select_assets": 1,
  "auto_publish": 1,
  "webhook_enabled": 1,
  "webhook_auto_publish": 1
}
```

**Hybrid Mode:**
```json
{
  "library_id": 1,
  "automation_mode": "hybrid",
  "auto_enrich": 1,
  "auto_select_assets": 1,
  "auto_publish": 0,
  "webhook_enabled": 1,
  "webhook_auto_publish": 1
}
```

### publish_log

**NEW TABLE** - Audit trail for publish operations

```sql
CREATE TABLE publish_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,

  -- Publish details
  published_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  published_by TEXT,              -- 'auto', 'manual', 'webhook'
  success BOOLEAN DEFAULT 1,
  error_message TEXT,

  -- Published content
  nfo_content TEXT,               -- Full NFO content
  nfo_hash TEXT,                  -- SHA256 of NFO
  assets_published TEXT,          -- JSON array: [{ asset_type, cache_path, library_path, content_hash }]

  -- Metadata
  duration_ms INTEGER,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_publish_log_entity ON publish_log(entity_type, entity_id);
CREATE INDEX idx_publish_log_published_at ON publish_log(published_at);
CREATE INDEX idx_publish_log_success ON publish_log(success);
```

**Example Row:**
```json
{
  "id": 1,
  "entity_type": "movie",
  "entity_id": 1,
  "published_at": "2025-10-02T10:35:00Z",
  "published_by": "manual",
  "success": 1,
  "nfo_content": "<?xml version=\"1.0\"?>\n<movie>...",
  "nfo_hash": "abc123...",
  "assets_published": "[{\"asset_type\":\"poster\",\"cache_path\":\"/data/cache/assets/abc.jpg\",\"library_path\":\"/movies/The Matrix/poster.jpg\",\"content_hash\":\"abc123...\"}]",
  "duration_ms": 1250
}
```

### job_queue

**NEW TABLE** - Background job processing queue

```sql
CREATE TABLE job_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_type TEXT NOT NULL,           -- 'scan_directory', 'enrich_metadata', 'download_asset', 'publish_entity', 'webhook_process'
  priority INTEGER NOT NULL,        -- 1 (critical) to 10 (low)
  status TEXT DEFAULT 'pending',    -- 'pending', 'processing', 'completed', 'failed'

  -- Payload
  payload TEXT NOT NULL,            -- JSON with job-specific data

  -- Retry logic
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  error_message TEXT,

  -- Timing
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP
);

CREATE INDEX idx_job_queue_status ON job_queue(status);
CREATE INDEX idx_job_queue_priority ON job_queue(status, priority, created_at);

-- Worker query optimization
CREATE INDEX idx_job_queue_worker
  ON job_queue(status, priority, created_at)
  WHERE status = 'pending';
```

**Priority Levels:**
- **1 (Critical)**: Webhooks
- **2 (High)**: User-triggered actions
- **5 (Normal)**: Auto-enrichment
- **7 (Low)**: Library scans
- **10 (Background)**: Garbage collection, cleanup

**Example Row:**
```json
{
  "id": 1,
  "job_type": "enrich_metadata",
  "priority": 2,
  "status": "completed",
  "payload": "{\"entity_type\":\"movie\",\"entity_id\":1,\"provider\":\"tmdb\"}",
  "retry_count": 0,
  "created_at": "2025-10-02T10:30:00Z",
  "started_at": "2025-10-02T10:30:05Z",
  "completed_at": "2025-10-02T10:30:07Z"
}
```

---

## Stream Details Tables

### video_streams

Stores video stream information extracted from FFprobe.

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

### audio_streams

Stores audio track information.

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
```

### subtitle_streams

Stores subtitle track information.

```sql
CREATE TABLE subtitle_streams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,      -- 'movie', 'episode'
  entity_id INTEGER NOT NULL,
  stream_index INTEGER,           -- 0-based index (NULL for external)

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

---

## Normalized Entity Tables

### actors

Shared actor data across all media types.

```sql
CREATE TABLE actors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  tmdb_id INTEGER,
  thumb_url TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_actors_name ON actors(name);
CREATE INDEX idx_actors_tmdb_id ON actors(tmdb_id);
```

### genres

```sql
CREATE TABLE genres (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_genres_name ON genres(name);
```

### directors

```sql
CREATE TABLE directors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_directors_name ON directors(name);
```

### writers

```sql
CREATE TABLE writers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_writers_name ON writers(name);
```

### studios

```sql
CREATE TABLE studios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_studios_name ON studios(name);
```

### tags

```sql
CREATE TABLE tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tags_name ON tags(name);
```

### countries

```sql
CREATE TABLE countries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_countries_name ON countries(name);
```

### sets

Movie collections (e.g., "Kick-Ass Collection").

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

---

## System Tables

### libraries

Library configuration.

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
  scan_type TEXT NOT NULL,      -- 'full', 'incremental', 'single_directory'
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
CREATE INDEX idx_scan_jobs_started ON scan_jobs(started_at);
```

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

### activity_log

Comprehensive audit trail.

```sql
CREATE TABLE activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  event_type TEXT NOT NULL,     -- 'webhook', 'scan_completed', 'user_edit', etc.
  severity TEXT NOT NULL,       -- 'info', 'warning', 'error', 'success'
  entity_type TEXT,             -- 'movie', 'series', 'episode', 'library'
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

---

## Notification System Tables

### notification_channels

Defines WHERE notifications are sent.

```sql
CREATE TABLE notification_channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL,                    -- 'kodi', 'pushover', 'discord', etc.
  enabled BOOLEAN DEFAULT 1,

  -- Link to media player (for Kodi channels only)
  media_player_id INTEGER,

  -- Type-specific configuration (JSON)
  config TEXT,

  -- Capabilities (JSON array)
  capabilities TEXT NOT NULL,            -- ["text", "images"]

  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (media_player_id) REFERENCES media_players(id) ON DELETE CASCADE
);

CREATE INDEX idx_notification_channels_type ON notification_channels(type);
CREATE INDEX idx_notification_channels_enabled ON notification_channels(enabled);
```

### notification_event_types

Defines all possible events.

```sql
CREATE TABLE notification_event_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_name TEXT NOT NULL UNIQUE,       -- 'movie.download.complete'
  category TEXT NOT NULL,                -- 'movie', 'series', 'health', 'system'
  description TEXT,

  -- Defaults
  default_enabled BOOLEAN DEFAULT 1,
  default_severity TEXT DEFAULT 'info',

  -- Required capabilities
  required_capabilities TEXT,            -- JSON: ["text", "images"]

  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notification_event_types_category ON notification_event_types(category);
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
  message_template TEXT,

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

### notification_queue

Transient queue for async notification processing.

```sql
CREATE TABLE notification_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_name TEXT NOT NULL,
  event_data TEXT NOT NULL,              -- JSON: full event payload
  status TEXT DEFAULT 'pending',
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  error_message TEXT,

  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  processed_at TEXT
);

CREATE INDEX idx_notification_queue_status ON notification_queue(status);
CREATE INDEX idx_notification_queue_created ON notification_queue(created_at);
```

---

## Many-to-Many Link Tables

### movies_actors

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

### movies_genres

```sql
CREATE TABLE movies_genres (
  movie_id INTEGER NOT NULL,
  genre_id INTEGER NOT NULL,
  PRIMARY KEY (movie_id, genre_id),
  FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
  FOREIGN KEY (genre_id) REFERENCES genres(id) ON DELETE CASCADE
);

CREATE INDEX idx_movies_genres_movie ON movies_genres(movie_id);
CREATE INDEX idx_movies_genres_genre ON movies_genres(genre_id);
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

CREATE INDEX idx_movies_directors_movie ON movies_directors(movie_id);
CREATE INDEX idx_movies_directors_director ON movies_directors(director_id);
```

**Similar tables exist for**: `movies_writers`, `movies_studios`, `movies_tags`, `movies_countries`, `series_actors`, `series_genres`, etc.

---

## Common Query Patterns

### Get Movies Needing Enrichment

```sql
SELECT * FROM movies
WHERE state = 'identified'
  AND enriched_at IS NULL
ORDER BY enrichment_priority ASC, created_at DESC
LIMIT 50;
```

### Get Movies Needing Publish

```sql
SELECT * FROM movies
WHERE has_unpublished_changes = 1
ORDER BY updated_at DESC;
```

### Get Selected Assets for Movie

```sql
SELECT ac.*, ci.file_path, ci.width, ci.height
FROM asset_candidates ac
LEFT JOIN cache_inventory ci ON ac.content_hash = ci.content_hash
WHERE ac.entity_type = 'movie'
  AND ac.entity_id = ?
  AND ac.is_selected = 1
ORDER BY ac.asset_type;
```

### Get Asset Candidates (Not Downloaded)

```sql
SELECT * FROM asset_candidates
WHERE entity_type = ?
  AND entity_id = ?
  AND asset_type = ?
  AND is_downloaded = 0
  AND is_rejected = 0
  AND provider_url NOT IN (
    SELECT provider_url FROM rejected_assets
  )
ORDER BY auto_score DESC;
```

### Get Orphaned Cache Files

```sql
SELECT * FROM cache_inventory
WHERE orphaned_at IS NOT NULL
  AND orphaned_at < DATETIME('now', '-90 days')
ORDER BY orphaned_at ASC;
```

### Get Movie with Full Metadata

```sql
SELECT
  m.*,
  s.name AS set_name,
  GROUP_CONCAT(DISTINCT g.name) AS genres,
  GROUP_CONCAT(DISTINCT d.name) AS directors
FROM movies m
LEFT JOIN sets s ON m.set_id = s.id
LEFT JOIN movies_genres mg ON m.id = mg.movie_id
LEFT JOIN genres g ON mg.genre_id = g.id
LEFT JOIN movies_directors md ON m.id = md.movie_id
LEFT JOIN directors d ON md.director_id = d.id
WHERE m.id = ?
GROUP BY m.id;
```

---

## Migration Strategy

### Schema Changes Summary

**Tables REMOVED:**
1. **`images`** - Replaced by `asset_candidates` (three-tier system)
2. **`trailers`** - Now handled by `asset_candidates` with `asset_type = 'trailer'`

**Tables ADDED:**
1. **`asset_candidates`** - Three-tier asset system (replaces `images` and `trailers`)
2. **`cache_inventory`** - Content-addressed cache tracking with reference counting
3. **`asset_selection_config`** - Auto-selection algorithm configuration
4. **`rejected_assets`** - Global asset blacklist
5. **`library_automation_config`** - Automation mode configuration (Manual, YOLO, Hybrid)
6. **`publish_log`** - Audit trail for publish operations
7. **`job_queue`** - Background job processing with priority levels

**Tables MODIFIED (columns added):**
- **`movies`**, **`series`**, **`episodes`**:
  - State machine: `state`, `enriched_at`, `enrichment_priority`
  - Publishing: `has_unpublished_changes`, `last_published_at`, `published_nfo_hash`
  - Asset locking: `poster_locked`, `fanart_locked`, etc.
  - File path: `UNIQUE` constraint added

**Triggers ADDED:**
- **`orphan_cache_assets`** - Automatic cache orphaning on asset deletion

**Foreign Keys ADDED:**
- `asset_candidates` → cascades from `movies`, `series`, `episodes`
- `unknown_files` → cascades from `movies`, `series`, `episodes`
- All link tables properly cascade

### Development Phase (Current)

**Approach**: Delete and recreate database
- No production users
- Database deletion acceptable
- Test with small library subset (100-500 items)
- Iterate on schema rapidly

**Migration Steps:**
```bash
# 1. Backup existing data (optional, for reference)
sqlite3 data/metarr.sqlite .dump > backup.sql

# 2. Delete old database
rm data/metarr.sqlite

# 3. Run new migration scripts
npm run db:migrate

# 4. Seed with test data
npm run db:seed
```

### Pre-Production Phase

**Approach**: Migration scripts with data transformation
1. Export existing data to JSON
2. Drop old tables (`images`, `trailers`)
3. Create new tables
4. Transform data:
   - Migrate `images` → `asset_candidates` (set `is_downloaded = 1`, `is_selected = 1`, `selected_by = 'local'`)
   - Migrate `trailers` → `asset_candidates` (same transformation)
   - Import cache files into `cache_inventory`
   - Calculate reference counts
5. Verify integrity

**Example Transformation:**
```typescript
// Migrate images table to asset_candidates
async function migrateImages() {
  const oldImages = await db.query(`SELECT * FROM images`);

  for (const img of oldImages) {
    const contentHash = await hashFile(img.cache_path);

    // Insert into cache_inventory
    await db.execute(`
      INSERT OR IGNORE INTO cache_inventory (
        content_hash, file_path, file_size, asset_type,
        width, height, perceptual_hash, reference_count
      ) VALUES (?, ?, ?, 'image', ?, ?, ?, 1)
    `, [contentHash, img.cache_path, img.file_size, img.width, img.height, img.perceptual_hash]);

    // Insert into asset_candidates
    await db.execute(`
      INSERT INTO asset_candidates (
        entity_type, entity_id, asset_type,
        provider, provider_url, width, height,
        is_downloaded, cache_path, content_hash, perceptual_hash,
        is_selected, selected_by
      ) VALUES (?, ?, ?, 'local', ?, ?, ?, 1, ?, ?, ?, 1, 'local')
    `, [
      img.entity_type,
      img.entity_id,
      img.image_type,
      img.provider_url,
      img.width,
      img.height,
      img.cache_path,
      contentHash,
      img.perceptual_hash
    ]);
  }
}
```

### Production Phase (Future)

**Approach**: Zero-downtime migrations
1. Create new tables alongside old
2. Dual-write to both schemas
3. Backfill new tables
4. Switch read traffic to new tables
5. Drop old tables after verification

---

## Related Documentation

- **[ARCHITECTURE.md](ARCHITECTURE.md)** - Overall system design
- **[ASSET_MANAGEMENT.md](ASSET_MANAGEMENT.md)** - Three-tier asset system
- **[AUTOMATION_AND_WEBHOOKS.md](AUTOMATION_AND_WEBHOOKS.md)** - Automation configuration
- **[PUBLISHING_WORKFLOW.md](PUBLISHING_WORKFLOW.md)** - Publishing process
- **[WORKFLOWS.md](WORKFLOWS.md)** - Operational workflows
- **[FIELD_LOCKING.md](FIELD_LOCKING.md)** - Field-level locking system

---

**Next Steps**: Implement Phase 1 database migration (see [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md))
