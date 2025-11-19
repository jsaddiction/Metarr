# ProviderCacheManager - Unified Provider Interface

## Overview

**ProviderCacheManager** is the SINGLE SOURCE OF TRUTH for all provider interactions in Metarr. It provides a clean, unified interface with intelligent 7-day caching, eliminating duplicate code and ensuring consistent behavior across UI, automation, and scheduled tasks.

## Core Principle

**"One interface for all provider data"**

All components that need provider data (metadata, assets, search) call ProviderCacheManager. No direct calls to FetchOrchestrator, ProviderOrchestrator, or ProviderCacheService.

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                    ALL CONSUMER REQUESTS                              │
└──────────────────────────────────────────────────────────────────────┘
         │                │                │                │
    ┌────▼────┐    ┌──────▼──────┐   ┌────▼────┐   ┌──────▼──────┐
    │ UI      │    │ Enrichment  │   │ Asset   │   │ Scheduled   │
    │ Manual  │    │ Automation  │   │ Browser │   │ Updates     │
    └────┬────┘    └──────┬──────┘   └────┬────┘   └──────┬──────┘
         │                │                │               │
         └────────────────┴────────────────┴───────────────┘
                          │
         ┌────────────────▼────────────────────────────────┐
         │  ProviderCacheManager                           │
         │  ┌──────────────────────────────────────────┐   │
         │  │ 1. fetchAssets()   - CACHED (7-day TTL) │   │
         │  │ 2. search()        - NOT CACHED         │   │
         │  │ 3. getCachedAssets() - READ-ONLY CACHE  │   │
         │  └──────────────────────────────────────────┘   │
         └───────────┬────────────────────────────────────┘
                     │
        ┌────────────┼────────────┐
        │            │            │
    CACHE       NETWORK       SEARCH
        │            │            │
        ▼            ▼            ▼
 ┌─────────────┐ ┌──────────────────┐ ┌─────────────────┐
 │ provider_   │ │ FetchOrchestrator│ │ Provider        │
 │ assets      │ │                  │ │ Orchestrator    │
 │ (SQLite)    │ │ - Retry logic    │ │ .searchAcross   │
 │             │ │ - Timeout        │ │ Providers()     │
 │ 7-day TTL   │ │ - Parallel fetch │ └────────┬────────┘
 └─────────────┘ └────────┬─────────┘          │
                          │                     │
          ┌───────────────┴─────────────────────┘
          │
    ┌─────┴──────┬─────────┬──────────┐
    ▼            ▼         ▼          ▼
┌────────┐  ┌─────────┐ ┌──────┐  ┌──────────┐
│ TMDB   │  │ Fanart  │ │ TVDB │  │ MusicBrz │
└────────┘  └─────────┘ └──────┘  └──────────┘
```

## Three Core Methods

### 1. `fetchAssets()` - Cached Asset Retrieval

**Purpose:** Fetch metadata and assets from providers with intelligent 7-day caching.

**Caching Strategy:**
- Cache HIT (< 7 days old) → Return instantly (no network calls)
- Cache MISS/STALE/force=true → Fetch from network, save to cache, return

**Used By:**
- UI asset browsing (user clicks "Browse Assets")
- Enrichment automation (Phase 1 of 5-phase workflow)
- Scheduled weekly provider updates

**Example:**
```typescript
const result = await providerCacheManager.fetchAssets({
  entityType: 'movie',
  entityId: 123,
  externalIds: { tmdb_id: 27205, imdb_id: 'tt1375666' },
  assetTypes: ['poster', 'fanart', 'trailer'],
  force: false,  // Use cache if fresh
  priority: 'user'
});

// Result:
{
  cached: true,  // Returned from cache
  cacheAge: 2.5, // 2.5 days old
  providers: {
    tmdb: {
      images: {
        poster: [{ url: '...', width: 2000, height: 3000 }]
      }
    },
    fanart_tv: {
      images: {
        clearlogo: [{ url: '...', width: 800, height: 310 }]
      }
    }
  },
  metadata: {
    fetchedAt: '2025-01-15T10:30:00Z',
    completedProviders: ['tmdb', 'fanart_tv'],
    failedProviders: [],
    timedOutProviders: []
  }
}
```

### 2. `search()` - Search for Identification

**Purpose:** Search providers for entity identification (NOT CACHED).

**Why Not Cached?**
- Search results change over time (new releases, metadata updates)
- Ephemeral data used only for one-time user selection
- Low frequency (only during manual identification)

**Used By:**
- UI identification flow (user types "Inception" to find movie)

**Example:**
```typescript
const results = await providerCacheManager.search({
  entityType: 'movie',
  query: 'Inception',
  year: 2010,
  limit: 20
});

// Results:
[
  {
    providerId: 'tmdb',
    providerResultId: '27205',
    externalIds: { tmdb: 27205, imdb: 'tt1375666' },
    title: 'Inception',
    originalTitle: 'Inception',
    releaseDate: '2010-07-16',
    overview: 'Cobb, a skilled thief...',
    posterUrl: 'https://...',
    confidence: 95
  },
  // ... more results
]
```

### 3. `getCachedAssets()` - Read-Only Cache Query

**Purpose:** Retrieve cached assets for UI display (does NOT trigger network calls).

**Why Separate Method?**
- Asset browser needs instant response (no loading states)
- Read-only operation - never modifies cache
- Returns empty array if cache doesn't exist (graceful degradation)

**Used By:**
- Asset browser modal (display available assets for selection)

**Example:**
```typescript
const assets = await providerCacheManager.getCachedAssets({
  entityType: 'movie',
  entityId: 123,
  assetType: 'poster'
});

// Returns:
[
  {
    id: 456,
    url: 'https://image.tmdb.org/t/p/original/abc123.jpg',
    width: 2000,
    height: 3000,
    language: 'en',
    provider_name: 'tmdb',
    score: 85,
    analyzed: true,
    is_selected: false,
    provider_metadata: {
      votes: 1250,
      voteAverage: 8.5
    },
    fetched_at: '2025-01-15T10:30:00Z'
  },
  // ... more assets
]
```

## Cache Decision Matrix

| Request Source | Method | force | Cache Age | Behavior |
|----------------|--------|-------|-----------|----------|
| UI Manual | fetchAssets() | false | < 7 days | Return cache instantly |
| UI Manual | fetchAssets() | false | > 7 days | Fetch + save cache |
| UI Manual | fetchAssets() | true | any | Always fetch + save |
| Automation | fetchAssets() | false | < 7 days | Return cache (skip job) |
| Automation | fetchAssets() | false | > 7 days | Fetch + save cache |
| Scheduled | fetchAssets() | false | < 7 days | Return cache (no-op) |
| Scheduled | fetchAssets() | false | > 7 days | Fetch + save cache |
| UI Browser | getCachedAssets() | N/A | any | Return cache or [] |
| UI Search | search() | N/A | N/A | Always fetch (no cache) |

## Consumer Migration Guide

### Before (Fragmented)

**UI Manual Asset Fetch:**
```typescript
// MovieProviderController.ts - OLD
const result = await this.fetchOrchestrator.fetchAllProviders(movie, 'movie', {
  priority: 'user',
  assetTypes: ['poster', 'fanart']
});

// Manually save to cache
for (const assetType of assetTypes) {
  await this.providerAssetsRepo.upsertBatch(movieId, 'movie', assetType, assets);
}
```

**Automation Asset Fetch:**
```typescript
// EnrichmentService.ts - OLD
const result = await this.fetchOrchestrator.fetchAllProviders(movie, 'movie', {
  priority: 'automation'
});

// Manually save to provider_assets
// (duplicated cache logic)
```

**Asset Browser:**
```typescript
// MovieAssetController.ts - OLD
const assets = await this.providerCacheService.getCandidates(movieId, 'movie', 'poster');
// Returns provider_cache_assets format (different schema!)
```

### After (Unified)

**UI Manual Asset Fetch:**
```typescript
// MovieProviderController.ts - NEW
const result = await this.providerCacheManager.fetchAssets({
  entityType: 'movie',
  entityId: movieId,
  externalIds: { tmdb_id: movie.tmdb_id, imdb_id: movie.imdb_id },
  assetTypes: ['poster', 'fanart'],
  force: req.query.force === 'true',
  priority: 'user'
});

// Cache is automatically handled!
```

**Automation Asset Fetch:**
```typescript
// EnrichmentService.ts - NEW
const result = await this.providerCacheManager.fetchAssets({
  entityType: config.entityType,
  entityId: config.entityId,
  externalIds: config.externalIds,
  assetTypes: config.assetTypes,
  force: config.forceRefresh || false,
  priority: 'automation'
});

// Same interface, same cache logic!
```

**Asset Browser:**
```typescript
// MovieAssetController.ts - NEW
const assets = await this.providerCacheManager.getCachedAssets({
  entityType: 'movie',
  entityId: movieId,
  assetType: 'poster'
});

// Returns provider_assets format (unified schema!)
```

## Cache Storage Schema

All cached data stored in `provider_assets` table:

```sql
CREATE TABLE provider_assets (
  id INTEGER PRIMARY KEY,
  entity_type TEXT NOT NULL,        -- 'movie', 'tv', 'music'
  entity_id INTEGER NOT NULL,       -- FK to movies/series/albums
  asset_type TEXT NOT NULL,         -- 'poster', 'fanart', 'trailer', etc.
  provider_name TEXT NOT NULL,      -- 'tmdb', 'fanart_tv', 'tvdb'
  provider_url TEXT NOT NULL,       -- Remote URL (source of truth)
  provider_metadata TEXT,           -- JSON: votes, language, etc.
  width INTEGER,
  height INTEGER,

  -- Analysis data (enrichment phase)
  analyzed INTEGER DEFAULT 0,       -- Has been analyzed?
  content_hash TEXT,                -- SHA256 of downloaded file
  perceptual_hash TEXT,             -- pHash for similarity matching
  score INTEGER,                    -- 0-100 quality score

  -- Selection state
  is_selected INTEGER DEFAULT 0,    -- User/auto selected for publishing
  is_rejected INTEGER DEFAULT 0,    -- User explicitly rejected
  is_downloaded INTEGER DEFAULT 0,  -- Exists in cache_image_files

  -- Timestamps
  fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  selected_at TIMESTAMP,
  selected_by TEXT,                 -- 'user' | 'auto'

  -- Indexes
  UNIQUE(entity_type, entity_id, asset_type, provider_url)
);

CREATE INDEX idx_provider_assets_entity ON provider_assets(entity_type, entity_id);
CREATE INDEX idx_provider_assets_type ON provider_assets(entity_type, entity_id, asset_type);
CREATE INDEX idx_provider_assets_fetched ON provider_assets(fetched_at);
```

## Benefits of Unified Architecture

### 1. **Eliminates Duplicate Code**
- Before: 3 different places implementing cache logic
- After: 1 place with tested, consistent behavior

### 2. **Consistent Caching**
- Before: UI and automation had different cache strategies
- After: Same 7-day TTL rule everywhere

### 3. **Extensible for Future Media Types**
```typescript
// TV shows - same interface!
await providerCacheManager.fetchAssets({
  entityType: 'tv',
  entityId: seriesId,
  assetTypes: ['poster', 'fanart', 'seasonposter']
});

// Music - same interface!
await providerCacheManager.fetchAssets({
  entityType: 'music',
  entityId: albumId,
  assetTypes: ['cover', 'artistart', 'discart']
});
```

### 4. **Simpler Testing**
- Before: Mock FetchOrchestrator, ProviderCacheService, database, etc.
- After: Mock only ProviderCacheManager

### 5. **Performance Monitoring**
All provider interactions funnel through one class:
- Cache hit rate
- Average fetch time
- Provider reliability
- TTL effectiveness

## Migration Checklist

### Phase 1: Create Infrastructure
- [x] Create ProviderCacheManager
- [ ] Add to dependency injection in api.ts
- [ ] Write unit tests

### Phase 2: Migrate Consumers
- [ ] MovieProviderController (UI manual)
- [ ] EnrichmentService Phase 1 (automation)
- [ ] MovieAssetController (asset browser)
- [ ] MovieWorkflowService (search)
- [ ] ScheduledJobHandlers (weekly updates)

### Phase 3: Update Frontend
- [ ] Update AssetBrowserModal to handle provider_assets format
- [ ] Remove provider_cache_assets references

### Phase 4: Cleanup
- [ ] Delete ProviderCacheService
- [ ] Drop provider_cache_assets table migration
- [ ] Remove duplicate ProviderOrchestrator (if unused)

## FAQ

**Q: Why not cache search results?**
A: Search is infrequent (only during identification) and results change over time (new releases, metadata updates). Caching adds complexity with minimal benefit.

**Q: Why 7 days TTL?**
A: Balance between freshness and network efficiency:
- Short enough: Captures new assets (trailers, artwork updates)
- Long enough: Automation rarely re-fetches (reduces API load)
- User override: force=true always bypasses cache

**Q: What happens if cache is corrupted?**
A: Graceful degradation:
- Cache read error → treated as cache miss → fetch from network
- Cache write error → logged, but request succeeds with network data

**Q: Can individual assets be invalidated?**
A: Yes, via `provider_assets` table:
```sql
DELETE FROM provider_assets
WHERE entity_id = ? AND asset_type = ?;
```
Next `fetchAssets()` call will re-fetch.

**Q: How does this handle provider rate limits?**
A: FetchOrchestrator handles retry/backoff. ProviderCacheManager just wraps it. If all providers fail, error bubbles up to caller.

**Q: What about webhook-triggered updates?**
A: Webhooks trigger jobs, which call `fetchAssets({ force: false })`:
- Cache fresh → instant completion (no network)
- Cache stale → fetch + update
