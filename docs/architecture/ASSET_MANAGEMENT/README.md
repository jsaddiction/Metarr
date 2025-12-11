# Asset Management System

**Purpose**: THE canonical documentation for Metarr's three-tier asset architecture. All other asset documentation links here.

**Related Docs**:
- Parent: [Architecture Overview](../OVERVIEW.md)
- Database: [Asset Tables](../DATABASE.md#asset-management-tables)
- Phases: [Enrichment](../../concepts/Enrichment/README.md), [Publishing](../../concepts/Publishing/README.md)

## Quick Reference

- **Three Tiers**: CANDIDATES (database) → CACHE (protected) → LIBRARY (working)
- **Protection**: Cache survives media manager deletions and provider removals
- **Deduplication**: Content-addressed storage (SHA256) eliminates duplicates
- **Recovery**: Library can be rebuilt from cache at any time
- **User Control**: Manual selections always preserved via field locking

## System Overview

Metarr manages media assets (posters, fanart, logos, etc.) through a three-tier architecture designed for **protection, efficiency, and user control**.

### Why Three Tiers?

1. **CANDIDATES (Database)**: Evaluate provider options before downloading
2. **CACHE (Protected Storage)**: Survive deletions, enable recovery, deduplicate
3. **LIBRARY (Working Copies)**: Player-compatible files that can be rebuilt

This separation ensures that user selections and downloaded assets are never lost, even when media files are deleted or providers remove content.

## The Three Asset Tiers

### Tier 1: CANDIDATES (Provider URLs)

**Storage**: `asset_candidates` database table
**Purpose**: Evaluate provider options before committing to downloads

```
Provider APIs → Database
TMDB, TVDB, Fanart.tv → asset_candidates table
```

**Contains**:
- Provider URLs (not downloaded yet)
- Asset metadata (dimensions, language, votes)
- Calculated quality scores
- Selection state (is_selected, is_blocked)
- User locks (user_locked)

**Operations**:
- Fetched during enrichment phase
- Scored by quality algorithm
- Presented to user for selection
- Auto-selected if configured

### Tier 2: CACHE (Protected Storage)

**Storage**: `/data/cache/assets/` (content-addressed)
**Purpose**: Protected source of truth that survives all external changes

```
Selected Candidates → Download → Cache
/data/cache/assets/ab/c1/abc123...jpg
```

**Contains**:
- Downloaded image files
- Perceptual hashes for similarity detection
- Provenance tracking (source URL, provider)
- Quality metrics (classification score)

**Protection Benefits**:
- Survives media manager deletions (Radarr/Sonarr removing movies)
- Survives provider removals (TMDB deleting images)
- Survives library rebuilds
- Enables disaster recovery

**Database**: `cache_image_files` table tracks cache file metadata

### Tier 3: LIBRARY (Player-Compatible)

**Storage**: `/media/movies/Movie (2024)/` (Kodi naming)
**Purpose**: Working copies for media player scanning

```
Cache → Copy → Library
movie-poster.jpg, movie-fanart.jpg
```

**Contains**:
- Published copies of cache files
- Kodi/Jellyfin/Plex naming conventions
- Player-discoverable locations

**Rebuilding**:
- Can be deleted and republished from cache
- Publishing phase handles deployment
- Verification phase ensures consistency

**Database**: `library_image_files` table links library files to cache

## Asset Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     ENRICHMENT PHASE                         │
└─────────────────────────────────────────────────────────────┘
                             ↓
              ┌──────────────────────────┐
              │   Provider APIs          │
              │   (TMDB, TVDB, Fanart)   │
              └──────────────┬───────────┘
                             ↓
                   ┌─────────────────┐
                   │   CANDIDATES    │  ← Tier 1: Database
                   │   (Database)    │
                   │   - URLs        │
                   │   - Metadata    │
                   │   - Scores      │
                   └────────┬────────┘
                            ↓
                   [User Selection]
                   [or Auto-Select]
                            ↓
                   ┌─────────────────┐
                   │     CACHE       │  ← Tier 2: Protected
                   │  (Protected)    │
                   │  Content-       │
                   │  Addressed      │
                   │  Storage        │
                   └────────┬────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                     PUBLISHING PHASE                         │
└─────────────────────────────────────────────────────────────┘
                            ↓
                   ┌─────────────────┐
                   │    LIBRARY      │  ← Tier 3: Working
                   │   (Working)     │
                   │   Kodi Naming   │
                   │   Convention    │
                   └────────┬────────┘
                            ↓
              ┌──────────────────────────┐
              │   Media Players          │
              │   (Kodi, Jellyfin, Plex) │
              └──────────────────────────┘
```

## Tier Promotion Process

### CANDIDATES → CACHE

**Trigger**: User selects asset or auto-selection runs
**Process**:
1. Download image from provider URL
2. Calculate SHA256 hash
3. Check if hash exists in cache (deduplication)
4. If new: Save to content-addressed path
5. Create `cache_image_files` record
6. Link `asset_candidates.cache_file_id` to cache record

**Idempotency**: If hash exists, reuse existing cache file

### CACHE → LIBRARY

**Trigger**: Publishing phase runs
**Process**:
1. Read cache file path from `cache_image_files`
2. Determine library path (Kodi naming convention)
3. Copy cache file to library location
4. Create `library_image_files` record linking cache to library
5. (Optional) Delete untracked library files

**Rebuilding**: If library file deleted, republishing restores from cache

## Key Behaviors

### Original Library Assets

When scanning finds existing library assets (e.g., user-provided poster):
- **Tracked**: Recorded in `library_image_files` (without cache link)
- **Not Scored**: Not evaluated or compared to provider assets
- **Preserved**: Not deleted unless user explicitly requests
- **Replaceable**: At enrichment, provider assets replace originals at publish

**Philosophy**: Original files are placeholders until enrichment provides better options.

### Manual Selection Always Wins

- Manual asset selection sets `user_locked = true`
- Locked assets skip enrichment (won't be replaced)
- Locked assets skip publishing (won't be changed)
- User can unlock to allow automation

### Monitored vs Unmonitored

**Monitored** (default):
- Full automation: enrich → publish
- Assets can be replaced by better provider options

**Unmonitored**:
- Global lock on downloadable content
- Still processes webhooks for renames/deletions
- Still updates stream info from upgrades
- Preserves all user customizations

## Database Relationships

```sql
-- Candidates reference cache files
asset_candidates.cache_file_id → cache_image_files.id

-- Library files reference cache files
library_image_files.cache_file_id → cache_image_files.id

-- Cache files use polymorphic association
cache_image_files.entity_type = 'movie'|'series'|'season'|'episode'|'actor'
cache_image_files.entity_id → [entity table].id
```

See [Database Schema](../DATABASE.md) for complete table definitions.

## Content Addressing

**Method**: SHA256 hash of file content
**Sharding**: First 2 chars / next 2 chars / full hash

```
File: poster.jpg
SHA256: abc123def456...
Path: /data/cache/assets/ab/c1/abc123def456...jpg
```

**Benefits**:
- Automatic deduplication (same file = same hash = single storage)
- Content verification (file integrity)
- Organized file system (sharding prevents huge directories)
- Provider-independent (same image from TMDB/Fanart reuses storage)

See [Content Addressing](CONTENT_ADDRESSING.md) for details.

## Two-Copy System

**Cache**: Protected, content-addressed, source of truth
**Library**: Working copies, player-compatible, rebuiltable

**Why Two Copies?**
1. **Protection**: Cache survives library deletions
2. **Recovery**: Library rebuilds from cache
3. **Compatibility**: Library uses player-specific naming
4. **Efficiency**: Cache enables deduplication

See [Two-Copy System](TWO_COPY_SYSTEM.md) for details.

## Field Locking

**Philosophy**: User edits are sacred and preserved from automation.

**Lockable Entities**:
- Metadata fields (title, plot, rating)
- Asset fields (poster, fanart, logo)

**Locking Behavior**:
- **Manual edit**: Automatically locks field
- **Explicit lock**: User can lock without editing
- **Enrichment**: Skips locked fields
- **Publishing**: Skips locked assets

See [Field Locking](FIELD_LOCKING.md) for complete behavior.

## Detailed Documentation

This README provides the overview. For specific details:

- **[Asset Types](ASSET_TYPES.md)** - Media-specific asset types (movie, TV, music, actors)
- **[Content Addressing](CONTENT_ADDRESSING.md)** - SHA256 sharding and deduplication
- **[Two-Copy System](TWO_COPY_SYSTEM.md)** - Cache vs library architecture
- **[Field Locking](FIELD_LOCKING.md)** - User control and lock behavior

## See Also

- [Enrichment Phase](../../concepts/Enrichment/README.md) - Fetches candidates, downloads to cache
- [Publishing Phase](../../concepts/Publishing/README.md) - Deploys cache to library
- [Verification Phase](../../concepts/Verification/README.md) - Ensures cache↔library consistency
- [Database Schema](../DATABASE.md) - Asset table structures
