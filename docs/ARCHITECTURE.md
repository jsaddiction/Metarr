# Metarr Architecture Overview

**Last Updated**: 2025-10-08
**Status**: Design Phase - Pre-Implementation

This document provides the comprehensive architectural vision for Metarr, a web-based metadata management application for media libraries. This architecture reflects the refined design based on MediaElch's workflow principles while maintaining automation capabilities through webhooks.

---

## Table of Contents

1. [Core Philosophy](#core-philosophy)
2. [Design Principles](#design-principles)
3. [System Architecture](#system-architecture)
4. [Data State Machine](#data-state-machine)
5. [Three-Tier Asset System](#three-tier-asset-system)
6. [Two-Phase Scanning Strategy](#two-phase-scanning-strategy)
7. [Automation Levels](#automation-levels)
8. [Technology Stack](#technology-stack)
9. [Scale & Performance](#scale--performance)
10. [Related Documentation](#related-documentation)

---

## Core Philosophy

```
┌─────────────────────────────────────────────────────────────┐
│  "Intelligent Defaults with Manual Override Capability"     │
└─────────────────────────────────────────────────────────────┘
```

### Key Tenets

1. **User Control First**
   - Initial setup: User chooses automation level (Conservative, YOLO, or Hybrid)
   - Manual edits are sacred: Any user change locks that field/asset permanently
   - Locked items never modified by automation

2. **Webhooks = Full Automation**
   - User enabled webhooks because they want automation
   - New downloads: Scan → Enrich → Select → Publish → Notify players (fully automated)
   - Upgrades: Detect → Restore cache → Republish (seamless)
   - User can manually fix mistakes later

3. **Cache as Single Source of Truth**
   - All assets stored in immutable, content-addressed cache
   - Library directory is ephemeral (can be regenerated from cache + database)
   - Disaster recovery: Rebuild entire library from cache even if providers are offline

4. **Scan Fast, Enrich Lazily**
   - Initial scan: Filesystem + FFprobe only (no provider API calls)
   - Enrichment: Background jobs, rate-limited, low priority
   - User sees library immediately, enrichment happens in background

5. **Resilient by Default**
   - Content-addressed storage (deduplication, corruption detection)
   - Transactional publishing (atomic writes, rollback on failure)
   - Soft deletes with grace periods (90-day recovery window)
   - NFO hash validation (detect external modifications)

---

## Design Principles

### Separation of Concerns

**Current Problem**: Monolithic scan process combines discovery, enrichment, and publishing

**Solution**: Clear separation of operational phases

| Phase | Purpose | Duration | Blocks User |
|-------|---------|----------|-------------|
| **Discovery** | Scan filesystem, parse NFO, FFprobe | Minutes to hours | No (background) |
| **Enrichment** | Fetch provider metadata, download assets | Hours to days | No (background) |
| **Selection** | Algorithm chooses or user picks assets | Instant | No |
| **Publishing** | Write NFO + assets to library, notify players | Seconds | No |

### Immutable Cache Architecture

**Principles**:
- Files named by SHA256 hash of content (content-addressable storage)
- Automatic deduplication (same file used 10x = stored 1x)
- Never delete immediately (move to orphaned, garbage collect after 90 days)
- Metadata stored in database, not filesystem

**Structure**:
```
data/cache/assets/
  {sha256_hash}.jpg         ← Immutable asset file
  {sha256_hash}.jpg.meta    ← JSON metadata (optional, or DB-only)
```

### Field Locking Strategy

**Rule**: Manual edit = permanent lock, automation respects locks

**Implementation**:
```sql
-- User manually changes plot
UPDATE movies SET
  plot = 'My custom description',
  plot_locked = 1,           -- Lock the field
  has_unpublished_changes = 1
WHERE id = 123;

-- Future enrichment queries
SELECT * FROM movies WHERE plot_locked = 0;  -- Only update unlocked
```

**Asset Locking**: Per-asset granularity
```sql
UPDATE asset_candidates
SET is_selected = 1,
    selected_by = 'manual'  -- 'auto' or 'manual'
WHERE id = 456;

UPDATE movies SET poster_locked = 1 WHERE id = 123;
```

---

## System Architecture

### High-Level Component Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        METARR SYSTEM                         │
└─────────────────────────────────────────────────────────────┘

┌──────────────┐
│   Frontend   │  React + Vite + TailwindCSS
│   (Port      │  - Virtual scrolling (react-window)
│    3001)     │  - Real-time SSE updates
└──────┬───────┘  - TanStack Query (cache management)
       │
       │ REST API + SSE
       ↓
┌──────────────┐
│   Backend    │  Node.js + Express + TypeScript
│   (Port      │  - API routes
│    3000)     │  - SSE event stream
└──────┬───────┘  - Background job processor
       │
       ├─────────────┬─────────────┬─────────────┐
       ↓             ↓             ↓             ↓
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│ Database │  │  Cache   │  │ Library  │  │ External │
│(SQLite3/ │  │(Content  │  │(Media    │  │(TMDB,    │
│Postgres) │  │Address)  │  │Files +   │  │TVDB,     │
│          │  │          │  │Assets)   │  │Players)  │
└──────────┘  └──────────┘  └──────────┘  └──────────┘
```

### Core Services

```typescript
┌─────────────────────────────────────────────────────────────┐
│                     SERVICE ARCHITECTURE                     │
└─────────────────────────────────────────────────────────────┘

ScanService
  ├─ discoverDirectories()      // Find all media directories
  ├─ scanDirectory()            // Parse NFO, FFprobe, find local assets
  ├─ detectChanges()            // NFO hash comparison
  └─ emitProgress()             // SSE events

EnrichmentService
  ├─ fetchMetadata()            // TMDB/TVDB API calls
  ├─ fetchAssetCandidates()     // Get poster/fanart URLs
  ├─ respectLocks()             // Skip locked fields
  └─ rateLimiter                // Prevent API hammering

AssetSelectionService
  ├─ autoSelectAssets()         // Algorithm-based selection
  ├─ scoreCandidate()           // Resolution + votes + language
  ├─ filterDuplicates()         // pHash similarity check
  └─ respectRejections()        // Skip globally rejected assets

PublishService
  ├─ generateNFO()              // Build NFO from database state
  ├─ copyAssetsToLibrary()      // Cache → Library (transactional)
  ├─ updateDatabase()           // Mark as published
  └─ notifyPlayers()            // Trigger Kodi/Jellyfin scan

DisasterRecoveryService
  ├─ detectMissingAssets()      // Check for deleted files
  ├─ restoreFromCache()         // Copy cache → library
  ├─ regenerateNFO()            // Rebuild from database
  └─ validateIntegrity()        // Hash verification

CacheService
  ├─ storeAsset()               // Save with content-addressed naming
  ├─ retrieveAsset()            // Lookup by hash
  ├─ deduplicateAsset()         // Check if already exists
  ├─ orphanAsset()              // Move to orphaned (soft delete)
  └─ garbageCollect()           // Delete orphaned > 90 days

WebhookService
  ├─ parsePayload()             // Radarr/Sonarr webhook data
  ├─ determineEventType()       // Download, Upgrade, Delete, Rename
  ├─ prioritizeJob()            // Critical priority queue
  └─ triggerWorkflow()          // Dispatch to appropriate service
```

---

## Data State Machine

Media items transition through well-defined states during their lifecycle.

### State Definitions

```
┌─────────────────────────────────────────────────────────────┐
│                   MEDIA ITEM LIFECYCLE                       │
└─────────────────────────────────────────────────────────────┘

DISCOVERED
  │ - Found on filesystem
  │ - NFO parsed (if exists)
  │ - FFprobe completed
  │ - Local assets copied to cache
  ↓
IDENTIFIED
  │ - Has provider IDs (tmdb_id or imdb_id)
  │ - Ready for enrichment
  ↓
ENRICHING
  │ - Currently fetching from TMDB/TVDB
  │ - Rate-limited, queued
  ↓
ENRICHED
  │ - Provider metadata fetched
  │ - Asset candidates stored (URLs only, not yet downloaded)
  │ - Ready for selection
  ↓
SELECTED
  │ - Assets selected (auto or manual)
  │ - Assets downloaded to cache
  │ - Ready for publishing
  ↓
PUBLISHED
  │ - NFO written to library
  │ - Assets copied to library
  │ - Players notified
  │ - Clean state (has_unpublished_changes = 0)

SPECIAL STATES:
  - needs_identification: No provider IDs, user must provide
  - error_*: Various error states (provider_failure, network, etc.)
```

### State Transitions

```sql
-- Initial discovery
INSERT INTO movies (state, ...) VALUES ('discovered', ...);

-- After parsing NFO with IDs
UPDATE movies SET state = 'identified' WHERE id = ? AND tmdb_id IS NOT NULL;

-- Start enrichment
UPDATE movies SET state = 'enriching', enriched_at = CURRENT_TIMESTAMP WHERE id = ?;

-- Complete enrichment
UPDATE movies SET state = 'enriched' WHERE id = ?;

-- After asset selection
UPDATE movies SET state = 'selected' WHERE id = ?;

-- After publishing
UPDATE movies SET
  state = 'published',
  has_unpublished_changes = 0,
  last_published_at = CURRENT_TIMESTAMP
WHERE id = ?;

-- User edits (any state → dirty)
UPDATE movies SET has_unpublished_changes = 1 WHERE id = ?;
```

### Query Patterns

```sql
-- Items needing enrichment
SELECT * FROM movies
WHERE state = 'identified'
  AND enriched_at IS NULL
ORDER BY enrichment_priority ASC, created_at DESC;

-- Items needing publish
SELECT * FROM movies
WHERE has_unpublished_changes = 1
ORDER BY updated_at DESC;

-- Items ready for YOLO auto-publish
SELECT * FROM movies
WHERE state = 'selected'
  AND has_unpublished_changes = 0
  AND automation_enabled = 1;
```

---

## Three-Tier Asset System

Replaces the current two-copy (cache + library) system with a three-tier pipeline.

### Tier 1: Provider URLs (Candidates)

**Storage**: Database only (no files downloaded)

```sql
CREATE TABLE asset_candidates (
  id INTEGER PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  asset_type TEXT NOT NULL,

  provider TEXT NOT NULL,        -- 'tmdb', 'tvdb', 'fanart.tv', 'local'
  provider_url TEXT,             -- NULL if local file

  -- Metadata from provider
  width INTEGER,
  height INTEGER,
  vote_average REAL,
  vote_count INTEGER,
  language TEXT,

  -- Download state
  is_downloaded BOOLEAN DEFAULT 0,
  cache_path TEXT,               -- NULL until downloaded
  content_hash TEXT,             -- SHA256 of file content
  perceptual_hash TEXT,          -- pHash for duplicate detection

  -- Selection state
  is_selected BOOLEAN DEFAULT 0,
  is_rejected BOOLEAN DEFAULT 0,
  selected_by TEXT,              -- 'auto', 'manual', 'local'
  selected_at TIMESTAMP,

  -- Scoring
  auto_score REAL                -- 0-100 (for algorithm ranking)
);
```

**Workflow**:
1. Enrichment fetches metadata from TMDB → stores 15 poster URLs
2. No files downloaded yet (lazy loading)
3. User opens movie → sees grid of 15 thumbnails (lazy-loaded from URLs)

### Tier 2: Cache (Immutable Storage)

**Storage**: Filesystem (content-addressed) + Database (inventory)

```
data/cache/assets/
  abc123def456789...xyz.jpg  ← Content-addressed filename (SHA256)
```

```sql
CREATE TABLE cache_inventory (
  id INTEGER PRIMARY KEY,
  content_hash TEXT UNIQUE NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  asset_type TEXT NOT NULL,
  mime_type TEXT,

  -- Reference counting
  reference_count INTEGER DEFAULT 0,

  -- Lifecycle
  first_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMP,
  orphaned_at TIMESTAMP,

  -- Metadata
  width INTEGER,
  height INTEGER,
  perceptual_hash TEXT
);
```

**Workflow**:
1. User selects poster #3 → downloads from provider URL
2. Calculate SHA256 hash of downloaded file
3. Check if hash already exists in cache (deduplication)
4. If new: save as `{hash}.jpg`, insert into `cache_inventory`
5. If exists: increment `reference_count`
6. Store `cache_path` in `asset_candidates` table

**Benefits**:
- **Deduplication**: Same image used 10x = stored 1x
- **Integrity**: Hash mismatch = corruption detected
- **Immutable**: Filename never changes (perfect for caching)

### Tier 3: Library (Published Assets)

**Storage**: Media library directory (Kodi naming conventions)

```
/movies/The Matrix (1999)/
  The Matrix.mkv
  The Matrix.nfo
  poster.jpg          ← Copied from cache on publish
  fanart.jpg          ← Copied from cache on publish
  fanart1.jpg         ← Copied from cache on publish
```

**Workflow**:
1. User clicks "Publish"
2. For each selected asset: Copy `cache/{hash}.jpg` → `library/poster.jpg`
3. Write NFO to library
4. Trigger player scan

**Ephemeral**: Library assets can be deleted and regenerated from cache

---

## Two-Phase Scanning Strategy

Current problem: Monolithic scan blocks UI, hammers provider APIs, takes hours.

**Solution**: Separate discovery from enrichment

### Phase 1: Fast Local Scan (Non-Blocking)

**Purpose**: Populate database with local filesystem state

**Steps**:
1. Discover all media directories
2. Parse NFO files (extract IDs, metadata)
3. FFprobe video files (stream details)
4. Discover local assets (copy to cache)
5. Insert to database (state = 'discovered' or 'identified')

**Characteristics**:
- **No provider API calls**
- **No network I/O** (except local filesystem)
- **Fast**: 32k items in 3-5 hours (~0.5 seconds per item)
- **Progress**: Real-time SSE updates to UI
- **Result**: User sees library immediately

**Implementation**: See [WORKFLOWS.md](WORKFLOWS.md#two-phase-scanning)

### Phase 2: Lazy Enrichment (Background)

**Purpose**: Fetch provider metadata and asset candidates

**Steps**:
1. Query items where `state = 'identified'` AND `enriched_at IS NULL`
2. Priority queue: User-triggered > Webhooks > Auto-enrichment
3. For each item:
   - Fetch TMDB/TVDB metadata (respect rate limits)
   - Store asset candidate URLs (don't download yet)
   - Run auto-selection algorithm (if YOLO mode)
   - Download selected assets to cache
   - Mark `state = 'enriched'` or `'selected'`
4. If YOLO mode: Auto-publish immediately

**Characteristics**:
- **Rate-limited**: 50/sec for TMDB, 1/sec for TVDB
- **Pauseable**: Can be interrupted by high-priority jobs
- **Resumable**: Crash-safe (state persisted in database)
- **Slow**: 32k items could take days (respecting rate limits)
- **Non-blocking**: User can browse/edit while enrichment runs

**Implementation**: See [WORKFLOWS.md](WORKFLOWS.md#lazy-enrichment)

---

## Automation Levels

User chooses automation level per library during initial setup.

### Level 1: Manual (MediaElch-Style)

**Behavior**:
- Initial scan: Discovery only (no enrichment)
- User manually triggers enrichment per item
- User manually selects assets
- User manually publishes
- Webhooks disabled or manual mode

**Use Case**: User wants full control, no surprises

### Level 2: YOLO (Full Automation)

**Behavior**:
- Initial scan: Discovery + automatic enrichment
- Auto-select assets using algorithm
- Auto-publish immediately after selection
- Webhooks trigger full automated pipeline
- User can manually fix mistakes later (locks protect changes)

**Use Case**: User trusts algorithm, wants hands-off operation

### Level 3: Hybrid (Recommended)

**Behavior**:
- Initial scan: Discovery + automatic enrichment
- Auto-select assets using algorithm
- **Do NOT auto-publish** (user reviews before publish)
- Show "Pending Review" queue in UI
- Webhooks auto-publish (user opted in)
- User can bulk-publish after review

**Use Case**: Best of both worlds (automation + control)

### Configuration

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

  FOREIGN KEY (library_id) REFERENCES libraries(id)
);
```

**Webhook Override**: Even in manual mode, if webhooks are enabled, they auto-publish (user wants automation for new downloads).

---

## Technology Stack

### Backend

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Runtime | Node.js 20+ | Async I/O, large ecosystem |
| Language | TypeScript | Type safety, better DX |
| Framework | Express.js | Mature, simple, extensible |
| Database (Dev) | SQLite3 | Zero-config, single file |
| Database (Prod) | PostgreSQL | Scalable, transactional, JSON support |
| Job Queue | Database-backed | No Redis needed, use DB for jobs table |
| Real-time | Server-Sent Events (SSE) | Simpler than WebSockets, unidirectional |
| ORM | None (raw SQL) | Full control, no abstraction overhead |

**Rationale for no Redis**:
- Database already handles transactions
- Job queue can be database table with polling
- SSE doesn't require pub/sub (broadcast to all clients)
- Caching: TanStack Query handles frontend, DB queries fast enough
- Simplicity: One fewer dependency to manage

**Job Queue Strategy**:
```sql
CREATE TABLE job_queue (
  id INTEGER PRIMARY KEY,
  job_type TEXT NOT NULL,
  priority INTEGER NOT NULL,
  payload TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Worker polls every 100ms
SELECT * FROM job_queue
WHERE status = 'pending'
ORDER BY priority ASC, created_at ASC
LIMIT 1;
```

### Frontend

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Framework | React 18 | Component model, large ecosystem |
| Build Tool | Vite | Fast dev server, modern |
| Language | TypeScript | Type safety, autocomplete |
| Styling | TailwindCSS | Utility-first, no custom CSS |
| State | TanStack Query | Server state caching, SSE integration |
| Routing | React Router 6 | Standard, mature |
| Virtual Scrolling | react-window | Handle 32k item lists |
| Forms | React Hook Form | Performant, simple validation |

### External Integrations

| Service | Purpose | API Rate Limit |
|---------|---------|----------------|
| TMDB | Movie/TV metadata, images | 50 requests/second |
| TVDB | TV show metadata | 1 request/second |
| Fanart.tv | High-quality artwork | 2 requests/second (with key) |
| Kodi | Media player updates | Unlimited (local network) |
| Jellyfin | Media player updates | Unlimited (local network) |

---

## Scale & Performance

### Target Scale

| Metric | Development | Production |
|--------|-------------|------------|
| Movies | 100-500 | 2,000 |
| TV Episodes | 1,000-5,000 | 30,000 |
| Total Items | 1,100-5,500 | 32,000 |
| Assets per Item | 5-10 | 5-10 |
| Total Assets | 5,500-55,000 | 160,000-320,000 |
| Database Size | 50-200 MB | 500 MB - 2 GB |
| Cache Size | 2-10 GB | 50-200 GB |

### Performance Targets

| Operation | Target | Notes |
|-----------|--------|-------|
| Load movie list (50 items) | <500ms | Paginated, indexed query |
| Load movie detail | <200ms | Single item with joins |
| Full library scan (Phase 1) | 0.5s per item | 32k items = ~4-5 hours |
| Enrichment (Phase 2) | 1-2s per item | 32k items = ~18-36 hours (rate-limited) |
| Publish single item | <2s | Transactional, atomic |
| Publish bulk (50 items) | <30s | Sequential, non-blocking |
| Webhook processing | <5s | High priority, immediate |
| UI responsiveness | Always <100ms | Background jobs don't block |

### Database Optimization

```sql
-- Critical indexes (already in schema)
CREATE INDEX idx_movies_state_unpublished
  ON movies(state, has_unpublished_changes)
  WHERE has_unpublished_changes = 1;

CREATE INDEX idx_movies_needs_enrichment
  ON movies(state, enriched_at)
  WHERE state = 'identified' AND enriched_at IS NULL;

CREATE INDEX idx_asset_candidates_entity
  ON asset_candidates(entity_type, entity_id, asset_type);

-- Full-text search (Phase 2 feature)
CREATE VIRTUAL TABLE movies_fts USING fts5(
  title,
  original_title,
  plot,
  content=movies,
  content_rowid=id
);
```

### Frontend Optimization

**Virtual Scrolling**: Only render visible rows
```typescript
import { FixedSizeList } from 'react-window';

<FixedSizeList
  height={600}
  itemCount={32000}
  itemSize={50}
  width="100%"
>
  {Row}
</FixedSizeList>
```

**Lazy Asset Loading**: Intersection Observer
```typescript
const [imageSrc, setImageSrc] = useState(placeholderImage);

useEffect(() => {
  const observer = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) {
      setImageSrc(actualImageUrl);
      observer.disconnect();
    }
  });

  observer.observe(imageRef.current);
}, []);
```

**Incremental Cache Updates**: Don't invalidate entire list
```typescript
// Bad: Refetch entire list
queryClient.invalidateQueries(['movies']);

// Good: Update single item
queryClient.setQueryData(['movies', movieId], updatedMovie);
queryClient.invalidateQueries(['movies', 'list'], { exact: false });
```

---

## Related Documentation

### Core Architecture
- **[WORKFLOWS.md](WORKFLOWS.md)** - Detailed operational workflows
- **[DATABASE_SCHEMA.md](DATABASE_SCHEMA.md)** - Complete schema reference
- **[API_ARCHITECTURE.md](API_ARCHITECTURE.md)** - REST API endpoints

### Feature Areas
- **[ASSET_MANAGEMENT.md](ASSET_MANAGEMENT.md)** - Three-tier asset system
- **[AUTOMATION_AND_WEBHOOKS.md](AUTOMATION_AND_WEBHOOKS.md)** - Automation levels, webhook handling
- **[PUBLISHING_WORKFLOW.md](PUBLISHING_WORKFLOW.md)** - Dirty state, publish process
- **[FIELD_LOCKING.md](FIELD_LOCKING.md)** - Field and asset-level locking system

### External Integrations
- **[METADATA_PROVIDERS.md](METADATA_PROVIDERS.md)** - TMDB, TVDB integration
- **[KODI_API.md](KODI_API.md)** - Kodi JSON-RPC reference
- **[WEBHOOKS.md](WEBHOOKS.md)** - Radarr/Sonarr webhook handling
- **[NFO_PARSING.md](NFO_PARSING.md)** - Kodi NFO format

### Frontend
- **[UI_DESIGN.md](UI_DESIGN.md)** - Layout, color scheme
- **[FRONTEND_COMPONENTS.md](FRONTEND_COMPONENTS.md)** - React components

### System
- **[PATH_MAPPING.md](PATH_MAPPING.md)** - Path translation
- **[NOTIFICATIONS_AND_LOGGING.md](NOTIFICATIONS_AND_LOGGING.md)** - Logging, notifications
- **[STREAM_DETAILS.md](STREAM_DETAILS.md)** - FFprobe integration

---

## Implementation Roadmap

See [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md) for detailed phased implementation plan.

**High-Level Phases**:
1. Database schema migration (new tables, columns)
2. Core services refactor (two-phase scan, asset selection)
3. API redesign (pagination, filtering, bulk operations)
4. Frontend rebuild (virtual scrolling, SSE updates)
5. Background jobs (enrichment queue, garbage collection)
6. Testing & polish (load testing, disaster recovery)

---

## Migration from Current State

**Current Status**: Application in deep development, no production users

**Migration Strategy**: Database deletion acceptable during development

**Approach**:
1. Implement new schema alongside old (no migration scripts yet)
2. Test with small library subset (100-500 items)
3. Delete and recreate database as needed
4. Once stable: Design production migration script

**No Data Loss Risk**: Development phase, no production users

---

## Design Decisions Log

### Decision 1: Database-Only Job Queue (No Redis)
**Rationale**: Simplicity, one fewer dependency, database already handles transactions
**Tradeoff**: Slightly slower than Redis (polling vs pub/sub), but acceptable for scale

### Decision 2: Content-Addressed Cache
**Rationale**: Deduplication, immutability, integrity verification
**Tradeoff**: Filenames not human-readable (need metadata in DB)

### Decision 3: Two-Phase Scanning
**Rationale**: Fast initial feedback, non-blocking enrichment, rate-limit friendly
**Tradeoff**: More complex workflow, but better UX

### Decision 4: No Intermediate Staging Tables
**Rationale**: Simpler schema, changes save immediately to main tables
**Tradeoff**: Harder to preview changes before publish (but `has_unpublished_changes` flag solves this)

### Decision 5: Webhooks Always Auto-Publish
**Rationale**: User enabled webhooks because they want automation
**Tradeoff**: Less control, but manual edits can fix mistakes (locks prevent future auto-changes)

---

## Future Enhancements (Out of Scope for v1)

- [ ] Plex media player support
- [ ] Subtitle extraction from video files
- [ ] Subtitle sourcing from online providers (OpenSubtitles)
- [ ] Music library support (Lidarr integration)
- [ ] Multi-user support (roles, permissions)
- [ ] Mobile companion app
- [ ] Backup/restore UI
- [ ] Advanced matching algorithms (fuzzy search)
- [ ] Custom metadata provider plugins

---

**Next Steps**: Review this architecture document, then proceed to update individual feature docs.
