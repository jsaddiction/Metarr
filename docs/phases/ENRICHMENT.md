# Enrichment Phase

**Purpose**: Fetch metadata and asset information from providers, analyze assets, calculate scores, and intelligently select the best options for each media item.

**Related Docs**:
- Parent: [Phase Overview](OVERVIEW.md)
- Related: [Asset Scoring](../reference/ASSET_SCORING.md), [Field Locking](../architecture/ASSET_MANAGEMENT/FIELD_LOCKING.md), [Provider Overview](../providers/OVERVIEW.md)

## Quick Reference

- **Core phase**: Transforms discovered media into enriched, ready-to-publish entities
- **Single heavy job**: Fetches, analyzes, scores, and selects all in one execution
- **Idempotent**: Re-enrichment updates scores and may select better assets without losing user edits
- **Non-destructive**: Never overwrites locked fields or locked asset types
- **Rate-limited**: Respects provider API limits with adaptive backoff
- **Chainable**: Always triggers publishing phase (or passes through if disabled)

---

## Overview

Enrichment enhances discovered media with high-quality metadata and artwork from multiple providers (TMDB, TVDB, Fanart.tv). It operates as a single job that fetches provider data, downloads assets temporarily for analysis, calculates quality scores, and selects the best assets—all while respecting user preferences and manual locks.

**Critical Principle**: Original library assets discovered during scanning are tracked for replacement purposes only. They do NOT compete in the selection process. Provider assets are the canonical source of truth.

---

## Prerequisites

- Entity must have `identification_status = 'discovered'` or `'enriched'` (for re-enrichment)
- Entity must have `tmdb_id` or `imdb_id` (extracted during scan or user-provided)
- Entity must have `monitored = true` (unless `manual=true` in job payload)

---

## Triggers

| Trigger Type | Description | Force Refresh | Priority |
|--------------|-------------|---------------|----------|
| **Post-scan** | Automatically after scanning phase (if enabled) | No | 5 (NORMAL) |
| **Manual** | User clicks "Enrich" on specific items | Yes | 10 (HIGH) |
| **Scheduled** | Weekly metadata refresh (configurable) | No | 5 (NORMAL) |
| **Webhook** | Radarr/Sonarr download triggers immediate enrichment | No | 8 (URGENT) |
| **Bulk** | User selects multiple items for enrichment | Yes | 10 (HIGH) |

**Force Refresh**: Bypasses 7-day cache check and re-fetches from providers

---

## Job Parameters

```typescript
interface EnrichmentJobPayload {
  entityId: number;
  entityType: 'movie' | 'episode' | 'series';
  manual: boolean;        // User-triggered (true) vs automated (false)
  force_refresh: boolean; // Bypass 7-day cache check and re-fetch providers
}
```

---

## Phase Flow (Step-by-Step)

Enrichment executes seven sequential sub-phases in a single job:

```
ENRICHMENT JOB (Cache Preparation for UI)
│
├─ Phase 1: Fetch Provider Metadata
│  └─ Query providers, save URLs and metadata to provider_assets table
│
├─ Phase 2: Match Existing Cache Assets
│  └─ Link existing cache files to provider assets via hash matching
│
├─ Phase 3: Download & Analyze ALL Candidates
│  └─ Temp download, extract metadata, calculate hashes, discard temp files
│
├─ Phase 4: Calculate Scores
│  └─ Score all analyzed assets using 0-100 algorithm
│
├─ Phase 5: Intelligent Selection
│  └─ Select top N per asset type, respect locks
│
├─ Phase 5B: Download Selected to Cache
│  └─ Permanently store selected assets in cache for UI display
│
├─ Phase 6: Fetch Actors & Download Thumbnails
│  └─ Create actor records, download headshots to cache
│
└─ Phase 7: Update Entity Status
   └─ Mark as 'enriched', emit WebSocket event to UI
```

---

## Phase 1: Fetch Provider Metadata

**Goal**: Catalog all available assets from providers and create actor records.

### Provider Query

Uses `FetchOrchestrator` to query providers in parallel:
- **TMDB**: Movies, metadata, images, trailers
- **TVDB**: TV series/episodes, images
- **Fanart.tv**: High-quality artwork

Results saved to `provider_assets` table:
- **Purpose**: Master catalog for enrichment workflow
- **Lifecycle**: Permanent (until movie deleted via garbage collector)
- **Updated during**: Enrichment (manual refresh updates votes/metadata)

### Insert Logic

```typescript
for (const asset of providerResults) {
  const existing = await db.provider_assets.findByUrl(asset.url, entityId, entityType);

  if (existing && manual === false) {
    continue; // Automated job: skip known assets
  }

  if (existing && manual === true) {
    // Manual job: update with fresh provider metadata
    await db.provider_assets.update(existing.id, {
      provider_metadata: JSON.stringify(asset.metadata), // Fresh votes, likes
      width: asset.width,   // API-provided (Phase 3 will verify)
      height: asset.height,
    });
  } else {
    // New asset: insert
    await db.provider_assets.create({
      entity_type: entityType,
      entity_id: entityId,
      asset_type: asset.type,
      provider_name: asset.provider,
      provider_url: asset.url,
      provider_metadata: JSON.stringify(asset.metadata),
      width: asset.width,
      height: asset.height,
      analyzed: 0,
      is_downloaded: 0,
      is_selected: 0,
      score: null,
    });
  }
}
```

**Actor Fetch**: TMDB credits queried, actor records created (thumbnails downloaded in Phase 6).

---

## Phase 2: Match Cache Assets to Providers

**Goal**: Link existing cache files (discovered during scan) to provider assets via hash matching.

This enables:
- Accurate scoring (cached assets get bonus consideration)
- Skip re-downloading assets already in cache

### Hash Matching Strategy

```typescript
const cacheFiles = await db.cache_image_files.findByEntity(entityId, entityType);

for (const cacheFile of cacheFiles) {
  // Try exact SHA256 match
  let providerAsset = await db.provider_assets.findByHash(cacheFile.file_hash);

  if (!providerAsset && cacheFile.perceptual_hash) {
    // Try perceptual hash (Hamming distance < 10)
    const candidates = await db.provider_assets.findByAssetType(entityId, cacheFile.image_type);
    for (const candidate of candidates) {
      if (candidate.perceptual_hash) {
        const distance = hammingDistance(cacheFile.perceptual_hash, candidate.perceptual_hash);
        if (distance < 10) {
          providerAsset = candidate;
          break;
        }
      }
    }
  }

  if (providerAsset) {
    // Link cache file to provider asset
    await db.provider_assets.update(providerAsset.id, {
      is_downloaded: 1,
      content_hash: cacheFile.file_hash,
      analyzed: 1,
      analyzed_at: new Date(),
    });
  }
}
```

**Critical Note**: Original library assets are matched and linked but **NOT scored**. They exist only for tracking replacement during publishing.

---

## Phase 3: Download & Analyze Assets

**Goal**: Download all unanalyzed assets to extract accurate metadata for scoring.

### Parallel Download (up to 10 concurrent)

```typescript
const unanalyzed = await db.provider_assets.findUnanalyzed(entityId);

await pMap(unanalyzed, async (asset) => {
  const tempPath = `/data/temp/metarr-analyze-${uuidv4()}.tmp`;

  try {
    // Download to temp
    await downloadFile(asset.provider_url, tempPath);

    // Extract metadata
    const metadata = asset.asset_type.includes('video')
      ? await analyzeVideo(tempPath)
      : await analyzeImage(tempPath);

    // Calculate hashes
    const contentHash = await calculateSHA256(tempPath);
    const perceptualHash = metadata.isImage ? await calculatePerceptualHash(tempPath) : null;

    // Update provider_assets with ACTUAL metadata
    await db.provider_assets.update(asset.id, {
      width: metadata.width,
      height: metadata.height,
      duration_seconds: metadata.duration,
      content_hash: contentHash,
      perceptual_hash: perceptualHash,
      mime_type: metadata.mimeType,
      file_size: metadata.size,
      analyzed: 1,
      analyzed_at: new Date(),
    });
  } finally {
    // Always delete temp file
    await fs.unlink(tempPath).catch(() => {});
  }
}, { concurrency: 10 });
```

**Result**: All provider assets have accurate dimensions, hashes, and metadata for scoring.

---

## Phase 4: Calculate Scores

**Goal**: Score all analyzed provider assets using weighted algorithm.

### Scoring Algorithm (0-100 points)

Full algorithm detailed in [Asset Scoring Reference](../reference/ASSET_SCORING.md). Summary:

| Component | Max Points | Description |
|-----------|------------|-------------|
| **Resolution** | 30 | Pixel count relative to ideal (2000x3000 for posters, 1920x1080 for fanart) |
| **Aspect Ratio** | 20 | Closeness to ideal ratio (2:3 for posters, 16:9 for fanart) |
| **Language** | 20 | User's preferred language prioritized |
| **Community Votes** | 20 | Vote average weighted by vote count (TMDB/TVDB) |
| **Provider Priority** | 10 | TMDB=10, Fanart.tv=9, TVDB=8 |

```typescript
const analyzedAssets = await db.provider_assets.findAnalyzed(entityId);

for (const asset of analyzedAssets) {
  const score = calculateAssetScore(asset);
  await db.provider_assets.update(asset.id, { score });
}
```

**See**: [Asset Scoring Reference](../reference/ASSET_SCORING.md) for complete formula.

---

## Phase 5: Asset Selection Process

**Goal**: Select top N unique provider assets per type, automatically evicting lower-ranked assets.

**Philosophy**: Provider assets are the canonical source of truth. Scanned assets are temporary discovery artifacts that are always replaced during enrichment.

### Configuration Limits

Default limits (user-configurable via `AssetConfigService`):

```typescript
const maxAllowable = {
  poster: 3,
  fanart: 4,
  banner: 1,
  clearlogo: 1,
  clearart: 1,
  discart: 1,
  landscape: 1,
  keyart: 1,
  thumb: 1,
  actor_thumb: 1,
};
```

### Selection Algorithm (Provider Assets Only)

**Step 1**: Gather provider assets (ignore scanned cache assets)

```typescript
const providerAssets = await db.provider_assets.findByType(entityId, entityType, assetType);
```

**Step 2**: Score all provider assets

**Step 3**: Sort by score descending

**Step 4**: Deduplicate by perceptual hash (keep higher-scored)

```typescript
const uniqueAssets = [];
const seenHashes = new Set();

for (const asset of scoredAssets) {
  if (!asset.perceptual_hash) {
    uniqueAssets.push(asset);
    continue;
  }

  let isDuplicate = false;
  for (const seenHash of seenHashes) {
    const similarity = hammingSimilarity(asset.perceptual_hash, seenHash);
    if (similarity >= 0.90) {
      isDuplicate = true;
      break;
    }
  }

  if (!isDuplicate) {
    uniqueAssets.push(asset);
    seenHashes.add(asset.perceptual_hash);
  }
}
```

**Step 5**: Select top N (based on limit)

**Step 6**: Detect changes

```typescript
const oldSelectedIds = providerAssets.filter(p => p.is_selected === 1).map(p => p.id);
const newSelectedIds = topN.map(a => a.id);

if (arraysEqual(oldSelectedIds, newSelectedIds)) {
  return; // Skip cache updates - selection unchanged
}
```

**Step 7**: Update `is_selected` flags

```typescript
// Reset all to deselected
await db.provider_assets.deselectAll(entityId, entityType, assetType);

// Mark new selections
for (const asset of topN) {
  await db.provider_assets.update(asset.id, {
    is_selected: 1,
    selected_at: new Date(),
    selected_by: 'auto',
  });
}
```

---

## Phase 5B: Download Selected to Cache

**Goal**: Download newly selected assets to permanent cache storage.

```typescript
const toDownload = newSelectedIds.filter(id => !oldSelectedIds.includes(id));
const toDelete = oldSelectedIds.filter(id => !newSelectedIds.includes(id));

// Download new selections to cache
for (const id of toDownload) {
  const asset = topN.find(a => a.id === id);
  const cachePath = `/data/cache/${assetType}/${asset.content_hash.slice(0, 2)}/${asset.content_hash}.jpg`;

  await downloadFile(asset.provider_url, cachePath);

  await db.cache_image_files.create({
    entity_type: entityType,
    entity_id: entityId,
    file_path: cachePath,
    file_hash: asset.content_hash,
    perceptual_hash: asset.perceptual_hash,
    image_type: assetType,
    source_type: 'provider',
    source_url: asset.provider_url,
    provider_name: asset.provider_name,
  });
}

// Delete evicted cache files
for (const id of toDelete) {
  const provider = providerAssets.find(p => p.id === id);
  const cache = await db.cache_image_files.findByHash(provider.content_hash);

  if (cache) {
    await fs.unlink(cache.file_path);
    await db.cache_image_files.delete(cache.id);
  }
}
```

**Result**: Cache contains only selected assets, ready for UI display and publishing.

---

## Phase 6: Fetch Actor Data and Download Thumbnails

**Goal**: Create actor records and download thumbnails to cache for UI display.

**Critical**: Actors are created during enrichment (not scan) to avoid naming ambiguities.

```typescript
const movie = await db.movies.findById(entityId);
if (!movie.tmdb_id) return { actorsFetched: 0 };

const credits = await tmdbClient.getMovieCredits(movie.tmdb_id);
const cast = credits.cast.slice(0, 15); // Top 15 actors

for (const tmdbActor of cast) {
  let actor = await db.actors.findByTmdbId(tmdbActor.id);

  if (!actor) {
    actor = await db.actors.create({
      name: tmdbActor.name,
      name_normalized: normalizeActorName(tmdbActor.name),
      tmdb_id: tmdbActor.id,
      tmdb_profile_path: tmdbActor.profile_path,
    });
  }

  // Link actor to movie
  await db.movie_actors.create({
    movie_id: entityId,
    actor_id: actor.id,
    character: tmdbActor.character,
    actor_order: tmdbActor.order,
  });

  // Download thumbnail to cache
  if (tmdbActor.profile_path) {
    const imageUrl = `https://image.tmdb.org/t/p/original${tmdbActor.profile_path}`;
    const buffer = await downloadFile(imageUrl);
    const contentHash = calculateSHA256(buffer);
    const cachePath = `/data/cache/actor/${contentHash.slice(0, 2)}/${contentHash}.jpg`;

    await fs.writeFile(cachePath, buffer);

    await db.cache_image_files.create({
      entity_type: 'movie',
      entity_id: entityId,
      file_path: cachePath,
      file_hash: contentHash,
      image_type: 'actor_thumb',
      source_type: 'provider',
      source_url: imageUrl,
      provider_name: 'tmdb',
    });

    await db.actors.update(actor.id, {
      image_cache_path: cachePath,
      image_hash: contentHash,
    });
  }
}
```

**Output**: Actors table populated, thumbnails in cache, visible in UI.

---

## Phase 7: Update Entity Status

**Goal**: Mark entity as enriched and notify UI.

```typescript
await db.movies.update(entityId, {
  enriched_at: new Date(),
  identification_status: 'enriched',
});

websocketBroadcaster.broadcast('enrichment.complete', {
  entityType,
  entityId,
  assetsSelected: selectedCount,
  actorsFound: actorsFetched,
});

logger.info('[Enrichment] Complete', {
  entityType,
  entityId,
  durationMs: Date.now() - startTime,
});
```

---

## Provider Prioritization

Providers are queried and prioritized by quality/reliability:

1. **TMDB** (10 points): Largest catalog, good quality, comprehensive metadata
2. **Fanart.tv** (9 points): **Highest quality** artwork, but fewer assets than TMDB
3. **TVDB** (8 points): Best for TV content, similar quality to TMDB

---

## Field Locking Behavior

When a user manually edits a field or locks an asset type:

```typescript
// Check if asset type is locked
const movie = await db.movies.findById(entityId);
if (movie.poster_locked) {
  logger.debug('Poster selection locked by user', { entityId });
  return; // Skip automated selection for this type
}
```

**See**: [Field Locking Reference](../architecture/ASSET_MANAGEMENT/FIELD_LOCKING.md) for complete behavior.

---

## Configuration

```typescript
interface EnrichmentPhaseConfig {
  // Fetch provider assets (posters, fanart, logos, trailers)
  fetchProviderAssets: boolean;  // Default: true

  // Auto-select best assets (if false, user picks manually in UI)
  autoSelectAssets: boolean;     // Default: false (manual selection recommended)

  // Preferred language for asset scoring (ISO 639-1 code)
  preferredLanguage: string;     // Default: 'en'
}
```

**Configuration via UI**: Settings → General → Enrichment
**Configuration via API**: `GET/PATCH /api/v1/settings/phase-config`

---

## Metadata Completeness Tracking

**New in Phase 5**: Enrichment now tracks metadata completeness and provides library-wide statistics.

### Expected Fields

The system expects the following fields for complete metadata:

```typescript
const EXPECTED_FIELDS = [
  // Direct fields (movie table columns)
  'title', 'plot', 'outline', 'tagline',
  'imdb_rating', 'imdb_votes',
  'rotten_tomatoes_score', 'metacritic_score',
  'release_date', 'runtime', 'content_rating',

  // Junction table fields (must have at least one entry)
  'genres',     // movie_genres table
  'directors',  // movie_directors table
  'writers',    // movie_writers table
  'studios',    // movie_studios table
];
```

### Completeness Categories

Movies are categorized based on what percentage of expected fields are populated:

| Category | Completeness | Description |
|----------|--------------|-------------|
| **Enriched** | ≥90% | Comprehensive metadata, ready for use |
| **Partial** | 60-89% | Some fields missing or rate-limited providers |
| **Unenriched** | <60% | Missing critical metadata |

**See API Documentation**: `/api/v1/movies/enrichment/stats` for library statistics, `/api/v1/movies/:id/enrichment-status` for movie-specific completeness.

### Missing Field Tracking

The system tracks which specific fields are missing for each movie:

```json
{
  "missingFields": [
    { "field": "plot", "displayName": "Plot" },
    { "field": "tagline", "displayName": "Tagline" },
    { "field": "directors", "displayName": "Directors" }
  ]
}
```

This allows the UI to show users exactly what metadata is incomplete.

---

## Two-Mode Operation (requireComplete)

Enrichment supports two operational modes controlled by the `requireComplete` parameter:

### Mode 1: Best Effort (requireComplete=false)

**Used for**: Webhook triggers, manual user enrichment

**Behavior**:
- Continues enrichment even if some providers are rate-limited
- Marks entity with `partial=true` flag if incomplete
- Provides partial metadata rather than nothing
- Does NOT fail the job on rate limit

```typescript
{
  type: 'enrich-metadata',
  payload: {
    entityId: 123,
    entityType: 'movie',
    requireComplete: false  // Best effort
  },
  priority: 3  // HIGH (user-initiated)
}
```

**Example**: User clicks "Refresh Metadata" - we provide whatever we can get, even if TMDB is rate-limited.

### Mode 2: Complete or Skip (requireComplete=true)

**Used for**: Bulk scheduled enrichment

**Behavior**:
- Stops enrichment immediately if ANY provider returns rate limit
- Does NOT mark entity as enriched if incomplete
- Preserves daily API quota for higher-priority requests
- Job stops processing remaining movies

```typescript
{
  type: 'bulk-enrich',
  payload: {
    requireComplete: true  // All or nothing
  },
  priority: 7  // NORMAL (background job)
}
```

**Example**: Nightly bulk enrichment hits TMDB rate limit after 800 movies - stops immediately, preserving 200 requests for tomorrow's webhooks.

**See**: `EnrichmentOrchestrator` src/services/enrichment/EnrichmentOrchestrator.ts for implementation details.

---

## Bulk Enrichment

**Purpose**: Process all monitored movies with complete metadata refresh.

**Trigger**: Manual via UI (Settings → Bulk Enrichment → Run Now) or scheduled (future feature)

**API Endpoint**: `POST /api/v1/enrichment/bulk-run`

### Bulk Job Statistics

The system tracks detailed statistics for bulk enrichment runs:

```typescript
interface BulkJobStats {
  processed: number;     // Movies processed
  updated: number;       // Movies with new/updated data
  skipped: number;       // Movies skipped (up-to-date)
  stopped: boolean;      // Job stopped early?
  stopReason: string | null;  // "Rate limit detected"
}
```

**Progress Tracking**: Real-time WebSocket events (`bulk:progress`) show current progress:

```typescript
{
  processed: 234,
  total: 1542,
  percentComplete: 15,
  currentMovie: "The Matrix (1999)",
  skipped: 89,
  updated: 145
}
```

**API Endpoints**:
- `GET /api/v1/enrichment/bulk-status` - Current/last run status
- `POST /api/v1/enrichment/bulk-run` - Trigger manual bulk enrichment

### Bulk Job Behavior

1. **Concurrent Protection**: Only one bulk job can run at a time (409 Conflict if already running)
2. **Rate Limit Handling**: Uses `requireComplete=true` - stops on first rate limit
3. **Duration Estimation**: ~2 seconds per movie (includes provider queries and asset downloads)
4. **Cache Efficiency**: 7-day cache means most movies are cache hits after first run
5. **Priority**: Normal priority (7) - background processing

**Example Response**:

```json
{
  "data": {
    "jobId": 5432,
    "estimatedDuration": 3084  // seconds (~51 minutes for 1542 movies)
  }
}
```

---

## Error Handling

| Error Type | Behavior |
|------------|----------|
| **Provider timeout** | Skip provider, continue with others |
| **404 Not Found** | Mark as "no metadata available", log |
| **Rate limited (429)** | Exponential backoff with retry-after header |
| **Download failed** | Retry 3x, then skip asset (log error) |
| **Corrupted file** | Skip asset, try next candidate |
| **Hash mismatch** | Log error, skip asset (provider changed file) |

---

## User Review Gate

After enrichment, the user sees:
- All metadata populated (title, plot, ratings, etc.)
- Selected assets visible in UI (posters, fanart, logos)
- Actor list with headshots
- Status badge: "Enriched - Ready to Publish"
- **"Publish" button** to deploy to library

The user can:
- Swap asset selections (click alternative poster)
- Edit metadata fields (title, plot, etc.)
- Lock asset types to prevent future auto-selection
- Manually trigger publishing when satisfied

---

## Next Phase

Publishing is **manually triggered** (or automated if `workflow.auto_publish = true`). See [Publishing Phase](PUBLISHING.md) for deployment workflow.

**Chain**: Scan → Enrichment → Publishing → Player Sync

---

## See Also

- [Asset Scoring Reference](../reference/ASSET_SCORING.md) - Complete scoring formula
- [Field Locking](../architecture/ASSET_MANAGEMENT/FIELD_LOCKING.md) - Lock behavior
- [Provider Overview](../providers/OVERVIEW.md) - Provider system details
- [TMDB Provider](../providers/TMDB.md) - TMDB API integration
- [TVDB Provider](../providers/TVDB.md) - TVDB API integration
- [Fanart.tv Provider](../providers/FANART.md) - Fanart.tv integration
- [Database Schema](../architecture/DATABASE.md) - Complete schema reference
- [Publishing Phase](PUBLISHING.md) - Asset deployment to library
