# Backend Overhaul Plan

**Branch:** `backend-overhaul`
**Goal:** Simplify Metarr to a focused post-processor that leverages the *arr stack

## Problem Statement

Current Metarr has:
- 67 database tables (need ~10)
- 125 service files (need ~12)
- Reimplements functionality that Radarr already provides
- Over-engineered abstractions that impede development velocity

## New Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Radarr (source of truth for movies)                           │
│  - Knows all movies + TMDB IDs                                 │
│  - Tracks file paths                                           │
│  - Sends webhooks on import/rename/delete                      │
└──────────────────────┬──────────────────────────────────────────┘
                       │ Webhooks + API
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│  Metarr (enhancement layer)                                    │
│  1. Receive webhook event                                      │
│  2. Query Radarr API for movie details                         │
│  3. Fetch assets from providers (TMDB, Fanart.tv)              │
│  4. Generate NFO, download images                              │
│  5. Write to media folder                                      │
│  6. Notify Kodi to scan                                        │
│  7. Protect cache from external overwrites                     │
└─────────────────────────────────────────────────────────────────┘
```

## Simplified Database Schema

**Target: 10 tables** (down from 67)

```sql
-- Connection to *arr applications
CREATE TABLE arr_connections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,              -- 'radarr', 'sonarr', 'lidarr'
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    api_key TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Media items (synced from *arr via webhooks)
CREATE TABLE media_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    arr_connection_id INTEGER NOT NULL REFERENCES arr_connections(id),
    arr_id INTEGER NOT NULL,         -- ID in the *arr system
    media_type TEXT NOT NULL,        -- 'movie', 'episode', 'track'
    title TEXT NOT NULL,
    year INTEGER,
    path TEXT NOT NULL,              -- File path from *arr
    tmdb_id INTEGER,
    imdb_id TEXT,
    tvdb_id INTEGER,
    status TEXT DEFAULT 'pending',   -- 'pending', 'enriched', 'published', 'error'
    last_event TEXT,                 -- 'import', 'rename', 'delete'
    last_event_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(arr_connection_id, arr_id)
);

-- Assets fetched from providers (candidates + cached)
CREATE TABLE assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    media_item_id INTEGER NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
    asset_type TEXT NOT NULL,        -- 'poster', 'fanart', 'banner', 'nfo', 'trailer'
    provider TEXT NOT NULL,          -- 'tmdb', 'fanart', 'local', 'generated'
    provider_url TEXT,               -- Original URL (for candidates)
    cache_path TEXT,                 -- Local cached file (SHA256 sharded)
    cache_hash TEXT,                 -- SHA256 of cached file
    language TEXT,                   -- ISO 639-1 code
    width INTEGER,
    height INTEGER,
    vote_average REAL,               -- Provider rating
    vote_count INTEGER,
    selected INTEGER DEFAULT 0,      -- User or auto-selected for publishing
    locked INTEGER DEFAULT 0,        -- Don't auto-replace
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Published assets (what's in the media folder)
CREATE TABLE published_assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    media_item_id INTEGER NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
    asset_id INTEGER REFERENCES assets(id) ON DELETE SET NULL,
    asset_type TEXT NOT NULL,
    published_path TEXT NOT NULL,    -- e.g., /movies/Title (2024)/poster.jpg
    published_hash TEXT NOT NULL,    -- For detecting external changes
    published_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Job queue
CREATE TABLE jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,              -- 'enrich', 'publish', 'notify', 'protect'
    media_item_id INTEGER REFERENCES media_items(id) ON DELETE CASCADE,
    payload TEXT,                    -- JSON
    status TEXT DEFAULT 'pending',   -- 'pending', 'running', 'completed', 'failed'
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    error TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    started_at TEXT,
    completed_at TEXT
);

-- Media player connections
CREATE TABLE player_connections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,              -- 'kodi', 'jellyfin', 'plex'
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    username TEXT,
    password TEXT,
    api_key TEXT,
    enabled INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Provider configuration
CREATE TABLE provider_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL UNIQUE,   -- 'tmdb', 'fanart', 'omdb'
    api_key TEXT,                    -- User's key (null = use embedded)
    enabled INTEGER DEFAULT 1,
    priority INTEGER DEFAULT 0,      -- Higher = preferred
    rate_limit_remaining INTEGER,
    rate_limit_reset TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Application settings (key-value store)
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,             -- JSON encoded
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Activity log (recent events)
CREATE TABLE activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,        -- 'webhook', 'enrich', 'publish', 'error'
    media_item_id INTEGER REFERENCES media_items(id) ON DELETE SET NULL,
    message TEXT NOT NULL,
    details TEXT,                    -- JSON
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_media_items_status ON media_items(status);
CREATE INDEX idx_media_items_arr ON media_items(arr_connection_id, arr_id);
CREATE INDEX idx_assets_media_item ON assets(media_item_id);
CREATE INDEX idx_assets_selected ON assets(media_item_id, asset_type, selected);
CREATE INDEX idx_published_media_item ON published_assets(media_item_id);
CREATE INDEX idx_jobs_status ON jobs(status, created_at);
CREATE INDEX idx_activity_created ON activity_log(created_at);
```

## Simplified Service Architecture

**Target: 12 services** (down from 125)

```
src/services/
├── ArrService.ts           # Radarr/Sonarr/Lidarr API client
├── WebhookService.ts       # Incoming webhook handler
├── MediaItemService.ts     # CRUD for media items
├── ProviderService.ts      # TMDB, Fanart.tv, OMDB calls
├── AssetService.ts         # Asset fetching, caching, selection
├── NfoService.ts           # NFO generation
├── PublishService.ts       # Write files to media folder
├── PlayerService.ts        # Kodi/Jellyfin notification
├── ProtectionService.ts    # Detect & restore overwritten files
├── JobService.ts           # Job queue operations
├── ConfigService.ts        # Settings management
└── ActivityService.ts      # Logging recent events
```

## Implementation Phases

### Phase 0: Environment Setup ✓
- [x] Create Docker development environment
- [x] Document setup process
- [ ] Clone and start on dev server
- [ ] Verify Radarr + NZBGet work

### Phase 1: Core Pipeline (MVP)
**Goal:** Radarr webhook → enrich → publish → Kodi notification

1. **New database schema**
   - Create migration with simplified schema
   - Keep old schema in separate file for reference

2. **ArrService** - Radarr API client
   - Connect to Radarr
   - Get movie by ID
   - Get movie list
   - Verify connection

3. **WebhookService** - Receive Radarr events
   - POST /webhooks/radarr
   - Parse import/rename/delete events
   - Create/update media_items record
   - Queue enrichment job

4. **ProviderService** - Fetch metadata
   - TMDB movie lookup
   - TMDB images (poster, fanart)
   - Basic rate limiting

5. **AssetService** - Download and cache
   - Download image to cache (SHA256 sharded)
   - Store asset record
   - Auto-select best poster/fanart

6. **NfoService** - Generate NFO
   - Movie NFO (Kodi format)
   - Store as asset

7. **PublishService** - Write to media folder
   - Copy selected assets to movie folder
   - Create published_assets records
   - Track hashes for protection

8. **PlayerService** - Notify Kodi
   - JSON-RPC VideoLibrary.Scan
   - Path-specific scan if supported

9. **JobService** - Process queue
   - Simple worker loop
   - Sequential job processing
   - Error handling and retries

**Success Criteria:**
- Add movie in Radarr → Metarr receives webhook → fetches poster/fanart → writes NFO → Kodi shows movie with artwork

### Phase 2: Asset Management
**Goal:** User control over asset selection

1. **Asset browsing API**
   - GET /api/media/:id/assets
   - Returns all cached assets by type

2. **Asset selection API**
   - PUT /api/media/:id/assets
   - Select which assets to publish
   - Lock assets from auto-update

3. **Additional providers**
   - Fanart.tv integration
   - OMDB for additional metadata

4. **Asset scoring**
   - Language preference
   - Resolution preference
   - Vote-based ranking

### Phase 3: Protection System
**Goal:** Detect and restore overwritten files

1. **Hash verification**
   - Periodic check of published files
   - Compare hash to published_assets record

2. **Auto-restore**
   - If hash mismatch and asset not locked
   - Restore from cache

3. **Event detection**
   - Handle Radarr rename events
   - Move published assets with renamed folder

### Phase 4: UI Adaptation
**Goal:** Connect existing UI to new backend

1. **API endpoint mapping**
   - Document which old endpoints map to new
   - Create compatibility layer if needed

2. **Media browser**
   - List media items
   - Show enrichment status
   - Trigger manual enrichment

3. **Asset picker**
   - Display cached assets
   - Select/lock assets
   - Trigger publish

4. **Settings pages**
   - *arr connection config
   - Provider config
   - Player config

### Phase 5: Polish & Expand
**Goal:** Production readiness

1. **Error handling**
   - Graceful degradation
   - User-visible error messages

2. **Logging**
   - Activity log UI
   - Debug logging toggle

3. **Additional player support**
   - Jellyfin integration
   - Plex integration

4. **Additional *arr support**
   - Sonarr (TV shows)
   - Lidarr (music)

---

## Migration Strategy

### Preserving Current Code

The current `src/` directory will be renamed to `src-old/` for reference. This allows:
- Copying patterns that work
- Reference for API contracts
- Gradual migration of UI components

### Clean Start

New `src/` directory with minimal structure:
```
src/
├── index.ts              # Express app setup
├── config.ts             # Configuration loading
├── routes/
│   ├── webhooks.ts
│   ├── media.ts
│   ├── settings.ts
│   └── players.ts
├── services/
│   └── (12 services listed above)
├── database/
│   ├── connection.ts
│   └── migrations/
└── types/
    └── index.ts
```

### UI Migration

The `public/frontend/` stays intact. We update:
- API endpoint URLs in hooks
- Response type definitions
- Add new endpoints as needed

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Database tables | 67 | 10 |
| Service files | 125 | 12 |
| Time to understand codebase | Hours | Minutes |
| Lines of backend code | ~40,000 | ~5,000 |
| Webhook → Kodi scan time | N/A (broken) | < 30 seconds |

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Losing working features | Keep src-old/ for reference |
| UI incompatibility | Maintain API compatibility where possible |
| Missing edge cases | Start with MVP, add complexity only when needed |
| Provider rate limits | Reuse existing provider code patterns |

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2025-01-18 | Require *arr integration | Eliminates need for scanning/classification |
| 2025-01-18 | Start with Radarr + Kodi only | Focused MVP, expand later |
| 2025-01-18 | 10 tables max | Current 67 is unmaintainable |
| 2025-01-18 | No orchestrators | Simple services with methods |
| 2025-01-18 | SQLite for development | Matches current, easy to work with |
