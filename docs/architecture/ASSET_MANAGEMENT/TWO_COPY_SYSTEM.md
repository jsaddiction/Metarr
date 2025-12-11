# Two-Copy System Architecture

**Purpose**: Explain the cache vs library storage architecture and why Metarr maintains two copies of assets.

**Related Docs**:
- Parent: [Asset Management](README.md)
- Content Addressing: [CONTENT_ADDRESSING.md](CONTENT_ADDRESSING.md)
- Publishing: [Publishing Phase](../../concepts/Publishing/README.md)
- Verification: [Verification Phase](../../concepts/Verification/README.md)

## Quick Reference

- **Cache**: Protected, content-addressed source of truth at `/data/cache/`
- **Library**: Working, player-compatible copies at `/media/`
- **Benefit**: Cache survives deletions, enables recovery, supports multiple libraries
- **Synchronization**: Publishing phase deploys cache → library

## Why Two Copies?

Metarr maintains two copies of each asset file for critical architectural benefits:

### 1. Protection from External Changes

**Problem**: Media managers (Radarr/Sonarr) delete movie folders when upgrading quality, removing all assets.

**Solution**: Cache survives media manager operations. When movie is re-added, assets republish from cache instantly.

### 2. Protection from Provider Changes

**Problem**: Providers (TMDB, Fanart.tv) can remove or change images, making URLs invalid.

**Solution**: Once downloaded to cache, assets are preserved regardless of provider availability.

### 3. Disaster Recovery

**Problem**: Library corruption, accidental deletion, or file system issues can destroy working library.

**Solution**: Library can be completely rebuilt from cache without re-downloading from providers.

### 4. Player Compatibility

**Problem**: Different players require different file naming conventions (Kodi, Jellyfin, Plex).

**Solution**: Cache stores files in content-addressed format; library deploys in player-specific format.

### 5. Multiple Libraries

**Problem**: Same content in multiple libraries (e.g., 4K and 1080p collections) would duplicate downloads.

**Solution**: Cache stores once; library publishes to multiple locations from single source.

## Cache Storage (/data/cache/)

### Purpose

Protected, permanent storage that serves as the source of truth for all assets.

### Storage Structure

```
/data/cache/
├── assets/                          # Media assets
│   └── ab/                          # First 2 chars of SHA256
│       └── c1/                      # Next 2 chars
│           └── abc123def456...jpg   # Full SHA256 hash
└── actors/                          # Actor images (separate namespace)
    └── ab/
        └── c1/
            └── abc123def456...jpg
```

### Characteristics

- **Content-Addressed**: Files named by SHA256 hash (see [CONTENT_ADDRESSING.md](CONTENT_ADDRESSING.md))
- **Deduplicated**: Identical files share single copy
- **Immutable**: Files never modified after creation
- **Protected**: Never deleted by external tools
- **Provider-Independent**: No dependency on original source

### Database Tracking

The `cache_image_files` table tracks all cache files:

```sql
CREATE TABLE cache_image_files (
  id INTEGER PRIMARY KEY,
  entity_type TEXT NOT NULL,       -- 'movie', 'series', 'season', 'episode', 'actor'
  entity_id INTEGER NOT NULL,      -- ID of entity
  file_path TEXT UNIQUE NOT NULL,  -- Content-addressed path
  file_hash TEXT NOT NULL,         -- SHA256 for verification
  file_size INTEGER NOT NULL,
  image_type TEXT NOT NULL,        -- 'poster', 'fanart', etc.
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  source_url TEXT,                 -- Original provider URL
  provider_name TEXT,              -- 'tmdb', 'fanart.tv', etc.
  -- ... additional metadata
);
```

### Lifecycle

```
Provider URL → Download → Hash → Store in Cache → Track in Database
```

**Never Deleted Unless**:
- User explicitly removes via UI
- Orphan cleanup (no entity references file)
- Manual cache purge operation

## Library Storage (/media/)

### Purpose

Working copies in player-discoverable locations with player-specific naming conventions.

### Storage Structure

```
/media/
├── movies/
│   └── Movie (2024)/
│       ├── movie.mkv                # Video file (not managed by Metarr)
│       ├── movie-poster.jpg         # Published from cache
│       ├── movie-fanart.jpg         # Published from cache
│       ├── movie-clearlogo.png      # Published from cache
│       └── .actors/                 # Actor images
│           └── Actor Name.jpg       # Published from cache
└── tv/
    └── Show Name/
        ├── poster.jpg               # Published from cache
        ├── fanart.jpg               # Published from cache
        └── Season 01/
            ├── season01-poster.jpg  # Published from cache
            └── episode.mkv
```

### Characteristics

- **Player-Compatible**: Kodi, Jellyfin, Plex naming conventions
- **Rebuiltable**: Can be deleted and republished from cache
- **Scanned by Players**: Media players discover these files
- **Working Directory**: Subject to external modifications

### Database Tracking

The `library_image_files` table links library files to cache:

```sql
CREATE TABLE library_image_files (
  id INTEGER PRIMARY KEY,
  cache_file_id INTEGER NOT NULL,  -- FK to cache_image_files
  file_path TEXT UNIQUE NOT NULL,  -- Library path (Kodi naming)
  published_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (cache_file_id) REFERENCES cache_image_files(id)
);
```

### Lifecycle

```
Cache File → Copy → Library Path → Track in Database
```

**Can Be Deleted**:
- Media manager operations (Radarr/Sonarr deletions)
- User cleanup
- Library rebuild
- Publishing phase (cleanup unknown files)

**Can Be Recovered**:
- Republish from cache (instant)
- No provider re-download needed

## File Naming Conventions

### Cache Naming

**Pattern**: `{sha256_hash}.{extension}`

**Example**: `abc123def456789abcdef123456789abcdef123456789abcdef123456789ab.jpg`

**Benefits**:
- Unique across all assets
- Content verification possible
- Automatic deduplication
- No naming conflicts

### Library Naming (Kodi Convention)

**Movies**:
```
Movie (2024)/
├── movie.mkv
├── movie-poster.jpg      # or poster.jpg
├── movie-fanart.jpg      # or fanart.jpg
├── movie-clearlogo.png   # or clearlogo.png
├── movie-disc.png        # or disc.png
└── movie-banner.jpg      # or banner.jpg
```

**TV Shows**:
```
Show Name/
├── poster.jpg            # Show poster
├── fanart.jpg            # Show fanart
├── banner.jpg            # Show banner
└── Season 01/
    ├── season01-poster.jpg
    └── Show Name - S01E01.mkv
```

**Actors**:
```
Movie (2024)/
└── .actors/
    └── Actor Name.jpg
```

## Synchronization Process

The [Publishing Phase](../../concepts/Publishing/README.md) synchronizes cache to library.

### Publishing Workflow

```
1. Identify Entity (movie/series/season/episode)
2. Query cache_image_files for selected assets
3. For each cache file:
   a. Determine library path (Kodi naming)
   b. Check if library file exists and matches cache
   c. If missing or different: Copy cache → library
   d. Create/update library_image_files record
4. (Optional) Cleanup unknown library files
5. Emit progress events via WebSocket
```

### Synchronization States

| State | Description | Action |
|-------|-------------|--------|
| **In Sync** | Library file matches cache (hash verified) | No action |
| **Missing** | Cache file selected but no library file | Copy cache → library |
| **Outdated** | Library file exists but different from cache | Replace library with cache |
| **Unknown** | Library file exists but not tracked | Delete if cleanup enabled |

### Idempotency

Publishing is idempotent:
- Running multiple times produces same result
- Existing correct files are not touched
- Only missing/changed files are updated

## Disaster Recovery Scenarios

### Scenario 1: Library Directory Deleted

```
Problem: /media/movies/ directory accidentally deleted

Recovery:
1. Recreate directory structure
2. Run publish phase for all movies
3. Library rebuilt from cache in minutes
4. No provider re-download needed
```

### Scenario 2: Media Manager Upgrade

```
Problem: Radarr upgrades movie quality, deletes old folder

Automatic Recovery:
1. Webhook notifies Metarr of deletion
2. Radarr adds new movie file
3. Webhook notifies Metarr of new file
4. Scan phase discovers new location
5. Publish phase deploys cached assets to new location
6. No user intervention needed
```

### Scenario 3: Provider Image Removed

```
Problem: TMDB removes a poster image from their database

Protection:
1. Poster already in cache (downloaded during enrichment)
2. Cache file unaffected by provider changes
3. Publishing continues using cached file
4. No broken images
```

### Scenario 4: Database Corruption

```
Problem: cache_image_files table corrupted

Recovery:
1. Restore from database backup
2. If no backup: Scan cache directory
3. Recalculate hashes and rebuild cache_image_files records
4. Republish to library
```

## Performance Considerations

### Storage Space

**Overhead**: 2x storage for assets (cache + library)

**Typical Size**:
- Movie poster: ~500 KB
- Movie fanart: ~1-2 MB
- Per movie: ~5-10 MB of assets
- 1000 movies: ~5-10 GB

**Deduplication Savings**: Content addressing reduces cache size by 5-20% typically.

### Copy Performance

**Cache → Library**: File copy operation
- Small images (<1 MB): ~10ms
- Large images (5 MB): ~50ms
- Batch publishing 100 movies: ~10-30 seconds

**Optimization**: Only copy changed files (hash comparison)

### Verification Performance

**Hash Verification**: Recalculate SHA256 and compare
- Per file: ~10-50ms depending on size
- Full library (1000 movies, 5000 assets): ~5-10 minutes

**Frequency**: Verification runs on-demand or scheduled (weekly recommended)

## Multiple Library Support

The two-copy system enables serving multiple libraries from single cache.

### Use Case: 4K and 1080p Collections

```
Cache (Single Copy):
/data/cache/assets/ab/c1/abc123...jpg

Library (Multiple Copies):
/media/movies-4k/Movie (2024)/movie-poster.jpg
/media/movies-1080p/Movie (2024)/movie-poster.jpg
```

**Benefit**: Download once, publish to multiple libraries without duplicate cache storage.

### Implementation

```sql
-- Same cache file published to multiple libraries
INSERT INTO library_image_files (cache_file_id, file_path)
VALUES
  (123, '/media/movies-4k/Movie (2024)/movie-poster.jpg'),
  (123, '/media/movies-1080p/Movie (2024)/movie-poster.jpg');
```

## Monitoring and Maintenance

### Cache Health

Monitor:
- Cache size growth
- Orphaned files (no entity references)
- Corrupted files (hash mismatch)

Tools:
- Verification phase (scheduled)
- Cache statistics API
- Orphan cleanup jobs

### Library Health

Monitor:
- Missing library files (cache exists but library doesn't)
- Unknown library files (not tracked in database)
- Outdated library files (different from cache)

Tools:
- Verification phase reports
- Publishing logs
- WebSocket sync status events

### Cleanup Strategies

**Cache Cleanup**:
- Remove orphaned cache files (no entity references)
- Remove duplicates (multiple cache records for same hash)
- Archive old versions (if keeping history)

**Library Cleanup**:
- Remove unknown files (cleanup_unknown option)
- Remove files for deleted entities
- Rebuild from cache periodically

## See Also

- [Asset Management Overview](README.md) - Three-tier architecture
- [Content Addressing](CONTENT_ADDRESSING.md) - SHA256 hashing and deduplication
- [Publishing Phase](../../concepts/Publishing/README.md) - Cache to library synchronization
- [Verification Phase](../../concepts/Verification/README.md) - Consistency checks
- [Database Schema](../DATABASE.md) - Cache and library tables
