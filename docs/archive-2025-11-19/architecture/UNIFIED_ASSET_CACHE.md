# Unified Asset Cache Architecture

## Overview

Metarr uses a **single source of truth** for provider assets: the `provider_assets` table. This table serves both manual UI workflows and automated enrichment workflows, eliminating duplicate data pipelines.

## Design Principles

1. **Single Source of Truth**: `provider_assets` is the only table storing provider asset metadata
2. **7-Day Cache Strategy**: Fresh data (< 7 days) is reused; stale data triggers provider refresh
3. **Shared by All Workflows**: UI browsing, automation, and enrichment all read/write the same table
4. **Incremental Enrichment**: Assets start basic (URL only) and gain analysis data over time

## The `provider_assets` Table

### Schema

```sql
CREATE TABLE provider_assets (
  id INTEGER PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  asset_type TEXT NOT NULL,

  -- Provider information (Phase 1: Fetch)
  provider_name TEXT NOT NULL,
  provider_url TEXT NOT NULL,
  provider_metadata TEXT,  -- JSON: votes, likes, language

  -- Analysis results (Phase 3: Download & Analyze)
  analyzed BOOLEAN DEFAULT 0,
  width INTEGER,
  height INTEGER,
  duration_seconds INTEGER,
  content_hash TEXT,        -- SHA256 for validation
  perceptual_hash TEXT,     -- pHash for similarity matching
  mime_type TEXT,
  file_size INTEGER,

  -- Selection state (Phase 4-5: Score & Select)
  score INTEGER,
  is_selected BOOLEAN DEFAULT 0,
  is_rejected BOOLEAN DEFAULT 0,
  is_downloaded BOOLEAN DEFAULT 0,

  -- Timestamps
  fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  analyzed_at TIMESTAMP,
  selected_at TIMESTAMP,
  selected_by TEXT,  -- 'auto' or 'user'

  UNIQUE(entity_type, entity_id, asset_type, provider_url)
)
```

### Lifecycle States

```
┌─────────────────────────────────────────────────────────────┐
│ FETCHED (Phase 1)                                           │
│ - provider_url populated                                    │
│ - fetched_at = NOW                                          │
│ - analyzed = 0                                              │
│ - is_selected = 0                                           │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ ANALYZED (Phase 3)                                          │
│ - content_hash, perceptual_hash calculated                  │
│ - width, height, mime_type extracted                        │
│ - analyzed = 1                                              │
│ - analyzed_at = NOW                                         │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ SCORED (Phase 4)                                            │
│ - score calculated (0-100)                                  │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ SELECTED (Phase 5 or Manual)                                │
│ - is_selected = 1                                           │
│ - selected_at = NOW                                         │
│ - selected_by = 'auto' | 'user'                             │
└─────────────────────────────────────────────────────────────┘
```

## Workflows

### 1. UI Manual Selection Flow

**User clicks "Fetch from Providers"**

```typescript
GET /api/movies/:id/provider-results?assetTypes=poster,fanart

MovieProviderController:
  1. Query provider_assets WHERE entity_id = :id AND fetched_at > (NOW - 7 days)
  2. IF cache fresh (< 7 days):
       → Return cached results to UI
  3. ELSE:
       → Fetch fresh from providers (TMDB, Fanart.tv, TVDB)
       → UPSERT into provider_assets (ON CONFLICT UPDATE)
       → Save to provider_cache_assets for backward compat (deprecated)
       → Return results to UI
```

**User selects poster from grid**

```typescript
PUT /api/movies/:id/assets/poster
Body: { assets: [{ url: "...", provider: "fanart_tv" }] }

MovieAssetController:
  1. Download asset to /data/cache/
  2. Create cache_image_files record
  3. Lock poster_locked = 1 (prevent automation override)
```

### 2. Automated Enrichment Flow

**Webhook triggers scan → enrichment job**

```typescript
enrich-metadata job (EnrichmentService):

  Phase 1: Fetch Provider Metadata
    1. Query provider_assets WHERE entity_id = :id AND fetched_at > (NOW - 7 days)
    2. IF cache fresh:
         → Skip provider fetch (reuse existing)
    3. ELSE:
         → Fetch fresh from providers
         → UPSERT into provider_assets
    4. Result: provider_assets populated with URLs

  Phase 2: Match Cache Assets
    - Link existing cache_image_files via perceptual_hash matching
    - Update is_downloaded = 1 where matched

  Phase 3: Download & Analyze Unanalyzed
    - Query WHERE analyzed = 0
    - Download to temp, extract metadata
    - Calculate SHA256 + perceptual hash
    - Update analyzed = 1, width, height, hashes
    - Delete temp file immediately

  Phase 4: Calculate Scores
    - Apply scoring algorithm (0-100)
    - Update score field

  Phase 5: Intelligent Selection
    - Query top N by score per asset type
    - Update is_selected = 1, selected_by = 'auto'
    - Auto-evict lower-ranked (is_selected = 0)
```

## Cache Freshness Strategy

### The 7-Day Rule

```typescript
function isCacheFresh(entity_id: number, entity_type: string): Promise<boolean> {
  const result = await db.query(`
    SELECT MIN(fetched_at) as oldest_fetch
    FROM provider_assets
    WHERE entity_id = ? AND entity_type = ?
  `, [entity_id, entity_type]);

  const oldestFetch = new Date(result.oldest_fetch);
  const now = new Date();
  const daysSinceLastFetch = (now - oldestFetch) / (1000 * 60 * 60 * 24);

  return daysSinceLastFetch < 7;
}
```

### When to Refresh

| Trigger | Force Refresh? | Behavior |
|---------|---------------|----------|
| **UI "Fetch Providers"** | ✅ Yes (always fresh) | Fetch + update cache |
| **Automated enrichment** | ❌ No (respect cache) | Skip if < 7 days |
| **Manual "Refresh" button** | ✅ Yes | Fetch + update cache |
| **Webhook (new movie)** | N/A (no cache yet) | Fetch + populate |
| **Webhook (upgrade)** | ❌ No | Reuse cache |

### Force Refresh Parameter

Both UI and automation support a `forceRefresh` parameter:

```typescript
// UI request with force
GET /api/movies/1/provider-results?force=true

// Enrichment job with force
{
  type: 'enrich-metadata',
  payload: {
    entityId: 1,
    entityType: 'movie',
    forceRefresh: true  // Bypass 7-day cache
  }
}
```

## Migration Path

### Deprecating `provider_cache_assets`

The old `provider_cache_assets` table is **deprecated** but kept temporarily for backward compatibility:

```typescript
// OLD (deprecated):
ProviderCacheService.saveCandidates(entityId, 'movie', 'poster', [...])
  → Saves to provider_cache_assets

// NEW (preferred):
ProviderAssetsRepository.create({ entityId, entityType, assetType, ... })
  → Saves to provider_assets
```

**Migration Strategy:**
1. ✅ **Phase 1** (DONE): EnrichmentService uses `provider_assets`
2. ✅ **Phase 2** (DONE): MovieProviderController migrated to `provider_assets`
3. 🔄 **Phase 3** (Next): Migrate MovieAssetController and other consumers
4. 🗑️ **Phase 4** (Future): Drop `provider_cache_assets` table entirely

### Code Changes Completed

```typescript
// MovieProviderController (DONE):
// ✅ Replaced ProviderCacheService with ProviderAssetsRepository
// ✅ Saves to provider_assets instead of provider_cache_assets
// ✅ Checks fetched_at for 7-day freshness using isCacheStale()
// ✅ Uses upsertBatch() for atomic cache updates

// EnrichmentService (DONE):
// ✅ Already uses provider_assets
// ✅ Already respects manual flag for cache bypass
```

### Code Changes Remaining

```typescript
// MovieAssetController (TO DO):
// - Still uses ProviderCacheService.getCandidates() for UI browsing
// - Needs to read from provider_assets table instead
// - Will require frontend changes to handle new data format

// ScheduledJobHandlers (TO DO):
// - scheduledProviderUpdateHandler still uses ProviderCacheService
// - Should trigger enrich-metadata jobs instead
```

## Benefits of Unified Architecture

1. ✅ **No Data Duplication**: Single source of truth eliminates sync issues
2. ✅ **Progressive Enhancement**: Assets gain analysis data incrementally
3. ✅ **Shared Cache**: UI and automation benefit from each other's work
4. ✅ **Consistent Freshness**: 7-day rule applied uniformly
5. ✅ **Better Performance**: Fewer table joins, simpler queries
6. ✅ **Audit Trail**: Complete history with timestamps and selected_by tracking

## Example Queries

### Get Fresh Assets for UI Display

```sql
SELECT * FROM provider_assets
WHERE entity_id = 1
  AND entity_type = 'movie'
  AND asset_type = 'poster'
  AND is_rejected = 0
ORDER BY score DESC NULLS LAST;
```

### Check Cache Freshness

```sql
SELECT
  MIN(fetched_at) as oldest_fetch,
  MAX(fetched_at) as newest_fetch,
  COUNT(*) as total_assets,
  SUM(CASE WHEN analyzed = 1 THEN 1 ELSE 0 END) as analyzed_count
FROM provider_assets
WHERE entity_id = 1 AND entity_type = 'movie';
```

### Get Selected Assets Ready for Publishing

```sql
SELECT * FROM provider_assets
WHERE entity_id = 1
  AND entity_type = 'movie'
  AND is_selected = 1
ORDER BY asset_type, score DESC;
```

## See Also

- [Enrichment Phase](../phases/ENRICHMENT.md) - 5-phase enrichment workflow
- [Publishing Phase](../phases/PUBLISHING.md) - Cache to library deployment
- [Database Schema](../DATABASE.md) - Complete table reference
