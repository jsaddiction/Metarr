# Enrichment Phase

**Purpose**: Fetch metadata and asset information from providers, analyze assets, calculate scores, and intelligently select the best options for each media item.

**Status**: Design complete - awaiting implementation

## Overview

The enrichment phase enhances discovered media with high-quality metadata and artwork from multiple providers. It operates as a **single heavy job** that fetches provider data, downloads assets temporarily for analysis, calculates quality scores, and selects the best assets—all while respecting user preferences and manual locks.

## Phase Rules

1. **Idempotent**: Re-enrichment updates scores and may select better assets without losing user edits
2. **Non-destructive**: Never overwrites locked fields or locked asset types
3. **Rate-limited**: Respects provider API limits with adaptive backoff
4. **Selective**: Only enriches monitored items unless forced (manual=true)
5. **Observable**: Reports progress and emits completion events
6. **Chainable**: Always triggers publishing phase via job creation

## Triggers

- **Post-scan**: Automatically after scanning phase (if workflow.enrichment enabled)
- **Manual**: User clicks "Enrich" on specific items (force_refresh=true)
- **Scheduled**: Weekly metadata refresh (configurable, automated jobs only)
- **Webhook**: Radarr/Sonarr download triggers immediate enrichment
- **Bulk**: User selects multiple items for sequential enrichment

## Job Parameters

```typescript
interface EnrichmentJobPayload {
  entityId: number;
  entityType: 'movie' | 'episode' | 'series';
  manual: boolean;        // User-triggered (true) vs automated (false)
  force_refresh: boolean; // Bypass 7-day cache check and re-fetch providers
}
```

## The Seven-Phase Process

Enrichment is a **single job** that executes seven sequential phases:

```
ENRICHMENT JOB (Cache Preparation for UI)
│
├─ Phase 1: Fetch Provider Metadata
│  └─ Query providers, save URLs and metadata to provider_assets table
│
├─ Phase 2: Match Existing Cache Assets
│  └─ Link existing cache files to provider assets via perceptual hash
│
├─ Phase 3: Download & Analyze ALL Candidates
│  └─ Temp download, extract metadata, calculate hashes, discard temp files
│
├─ Phase 4: Calculate Scores
│  └─ Score all analyzed assets using 0-100 algorithm
│
├─ Phase 5: Intelligent Selection
│  └─ Select top N per asset type, evict lowest-ranked, respect locks
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

## Phase 1: Fetch Provider Metadata & Actors

**Goal**: Catalog all available assets from providers and create actor records.

### 1A. Fetch Asset Metadata from Providers

Uses `FetchOrchestrator` to query multiple providers in parallel:

- **TMDB**: Movies, metadata, images, trailers
- **TVDB**: TV series/episodes, images
- **Fanart.tv**: High-quality artwork

Results are saved to **two separate tables**:

1. **`provider_cache_assets`** (managed by `ProviderCacheService`)
   - Purpose: Cache-aside pattern for instant UI browsing
   - Lifecycle: Persists until manually refreshed or weekly update
   - **Not touched by enrichment job** - read-only for UI display

2. **`provider_assets`** (enrichment working table - **NEW**)
   - Purpose: Master catalog for enrichment workflow
   - Lifecycle: Permanent (until movie deleted via garbage collector)
   - Updated during enrichment for scoring and selection

### Insert Logic for `provider_assets`

```typescript
for (const asset of providerResults) {
  const existing = await db.provider_assets.findByUrl(
    asset.url,
    entityId,
    entityType
  );

  if (existing && manual === false) {
    // Automated job: skip known assets
    continue;
  }

  if (existing && manual === true) {
    // Manual job: update with fresh provider metadata
    await db.provider_assets.update(existing.id, {
      provider_metadata: JSON.stringify(asset.metadata), // Fresh votes, likes
      width: asset.width,   // API-provided (may be inaccurate)
      height: asset.height,
    });
  } else {
    // New asset: insert
    await db.provider_assets.create({
      entity_type: entityType,
      entity_id: entityId,
      asset_type: asset.type, // poster, fanart, clearlogo, etc.
      provider_name: asset.provider, // tmdb, tvdb, fanart.tv
      provider_url: asset.url,
      provider_metadata: JSON.stringify(asset.metadata),
      width: asset.width,   // From API (Phase 3 will verify)
      height: asset.height,
      analyzed: 0,          // Not yet analyzed
      is_downloaded: 0,     // Not in cache
      is_selected: 0,       // Not selected
      score: null,
    });
  }
}
```

### 1B. Fetch Actors from TMDB

**Actors are ONLY created during enrichment** to avoid filesystem naming ambiguities.

```typescript
// Get cast from TMDB
const cast = await tmdbClient.getMovieCredits(movie.tmdb_id);

for (const tmdbActor of cast) {
  // Find or create actor by tmdb_id (unique identifier)
  let actor = await db.actors.findByTmdbId(tmdbActor.id);

  if (!actor) {
    actor = await db.actors.create({
      name: tmdbActor.name,
      name_normalized: normalizeActorName(tmdbActor.name),
      tmdb_id: tmdbActor.id,
      image_cache_path: tmdbActor.profile_path, // TMDB URL (download in publishing)
      identification_status: 'identified',
    });
  }

  // Link actor to movie
  await db.movie_actors.create({
    movie_id: movie.id,
    actor_id: actor.id,
    role: tmdbActor.character,
    actor_order: tmdbActor.order,
  });
}
```

**Actor images are NOT downloaded during enrichment** - they download during the publishing phase to minimize enrichment job time.

---

## Phase 2: Match Cache Assets to Providers

**Goal**: Link existing cache files (discovered during scan) to provider assets via hash matching.

This phase identifies which cached files came from which provider URLs, enabling:
- Accurate scoring (cached assets get bonus consideration)
- Skip re-downloading assets already in cache

### Hash Matching Strategy

```typescript
// Get all cache files for this entity
const cacheFiles = await db.cache_image_files.findByEntity(entityId, entityType);

for (const cacheFile of cacheFiles) {
  // Try exact SHA256 match
  let providerAsset = await db.provider_assets.findByHash(cacheFile.file_hash);

  if (!providerAsset && cacheFile.perceptual_hash) {
    // Try perceptual hash (Hamming distance < 10)
    const candidates = await db.provider_assets.findByAssetType(
      entityId,
      cacheFile.image_type
    );

    for (const candidate of candidates) {
      if (candidate.perceptual_hash) {
        const distance = hammingDistance(
          cacheFile.perceptual_hash,
          candidate.perceptual_hash
        );

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

    await db.cache_image_files.update(cacheFile.id, {
      provider_name: providerAsset.provider_name,
      source_url: providerAsset.provider_url,
    });
  }
}
```

---

## Phase 3: Download & Analyze Assets + Store Selected in Cache

**Goal**: Download and analyze assets to get accurate metadata for scoring, then download selected assets to permanent cache storage.

**Critical Change**: This phase now operates in TWO sub-phases:
- **Phase 3A**: Download ALL assets temporarily for analysis (dimensions, hashes, scoring)
- **Phase 3B**: After selection, download SELECTED assets to permanent cache storage

This ensures the user can immediately see selected assets in the UI after enrichment completes.

### Parallel Download with Limit

```typescript
const unanalyzed = await db.provider_assets.findUnanalyzed(entityId);

// Process up to 10 assets concurrently
await pMap(unanalyzed, async (asset) => {
  const tempPath = `/data/temp/metarr-analyze-${uuidv4()}.tmp`;

  try {
    // Download to temp
    await downloadFile(asset.provider_url, tempPath);

    // Extract metadata
    let metadata;
    if (asset.asset_type === 'trailer' || asset.asset_type === 'sample') {
      // Video analysis with ffprobe
      metadata = await analyzeVideo(tempPath);
    } else {
      // Image analysis with sharp
      metadata = await analyzeImage(tempPath);
    }

    // Calculate hashes
    const contentHash = await calculateSHA256(tempPath);
    const perceptualHash = metadata.isImage
      ? await calculatePerceptualHash(tempPath)
      : null;

    // Update provider_assets with ACTUAL metadata
    await db.provider_assets.update(asset.id, {
      width: metadata.width,           // Actual (not API estimate)
      height: metadata.height,
      duration_seconds: metadata.duration,
      content_hash: contentHash,
      perceptual_hash: perceptualHash,
      mime_type: metadata.mimeType,
      file_size: metadata.size,
      analyzed: 1,
      analyzed_at: new Date(),
    });

    // Re-check cache linkage (now that we have hash)
    const cachedFile = await db.cache_image_files.findByHash(contentHash);
    if (cachedFile) {
      await db.provider_assets.update(asset.id, {
        is_downloaded: 1,
      });
    }

  } finally {
    // Always delete temp file
    await fs.unlink(tempPath).catch(() => {});
  }
}, { concurrency: 10 });

// Cleanup any remaining temp files
await cleanupTempDirectory('/data/temp');
```

### Analysis Functions

```typescript
async function analyzeImage(path: string) {
  const metadata = await sharp(path).metadata();
  const stats = await fs.stat(path);

  return {
    width: metadata.width,
    height: metadata.height,
    format: metadata.format,
    mimeType: `image/${metadata.format}`,
    size: stats.size,
    isImage: true,
  };
}

async function analyzeVideo(path: string) {
  const probe = await ffprobe(path);
  const videoStream = probe.streams.find(s => s.codec_type === 'video');
  const stats = await fs.stat(path);

  return {
    width: videoStream.width,
    height: videoStream.height,
    duration: Math.floor(probe.format.duration),
    codec: videoStream.codec_name,
    mimeType: 'video/mp4',
    size: stats.size,
    isImage: false,
  };
}
```

---

## Phase 4: Calculate Scores

**Goal**: Score all analyzed assets using a weighted algorithm considering quality, community preference, and provider reliability.

### Scoring Algorithm (0-100 points)

```typescript
function calculateAssetScore(asset: ProviderAsset): number {
  let score = 0;

  // ========================================
  // RESOLUTION SCORE (0-30 points)
  // Scaled by pixel count relative to ideal
  // ========================================
  const pixels = asset.width * asset.height;
  let idealPixels: number;

  if (asset.asset_type === 'poster') {
    idealPixels = 6000000;  // 2000x3000
  } else if (asset.asset_type === 'fanart') {
    idealPixels = 2073600;  // 1920x1080
  } else {
    idealPixels = 1000000;  // Generic
  }

  const scaleFactor = Math.min(pixels / idealPixels, 1.5);
  score += scaleFactor * 30;

  // ========================================
  // ASPECT RATIO SCORE (0-20 points)
  // Closer to ideal ratio = higher score
  // ========================================
  const ratio = asset.width / asset.height;
  let idealRatio: number;

  if (asset.asset_type === 'poster') {
    idealRatio = 2 / 3;  // 0.667
  } else if (asset.asset_type === 'fanart') {
    idealRatio = 16 / 9;  // 1.778
  } else if (asset.asset_type === 'clearlogo') {
    idealRatio = 4.0;     // 3:1 to 5:1 range
  } else {
    idealRatio = ratio;   // Accept any ratio for unknown types
  }

  const ratioDiff = Math.abs(ratio - idealRatio);
  score += Math.max(0, 20 - ratioDiff * 100);

  // ========================================
  // LANGUAGE SCORE (0-20 points)
  // User's preferred language prioritized
  // ========================================
  const metadata = JSON.parse(asset.provider_metadata || '{}');
  const language = metadata.language;

  if (language === userPreferredLanguage) {
    score += 20;
  } else if (language === 'en') {
    score += 15;
  } else if (!language) {
    score += 18;  // Language-neutral (e.g., logos)
  } else {
    score += 5;
  }

  // ========================================
  // COMMUNITY VOTES SCORE (0-20 points)
  // Vote average weighted by vote count
  // ========================================
  const voteAverage = metadata.vote_average || 0;  // 0-10 scale
  const voteCount = metadata.vote_count || 0;

  const normalized = voteAverage / 10;  // 0-1 scale
  const weight = Math.min(voteCount / 50, 1.0);  // Need 50+ votes for full weight
  score += normalized * weight * 20;

  // ========================================
  // PROVIDER PRIORITY (0-10 points)
  // Provider reliability and quality
  // ========================================
  if (asset.provider_name === 'tmdb') {
    score += 10;  // Highest quantity, good quality
  } else if (asset.provider_name === 'fanart.tv') {
    score += 9;   // Highest quality, fewer assets
  } else if (asset.provider_name === 'tvdb') {
    score += 8;   // Good for TV content
  } else {
    score += 5;   // Unknown providers
  }

  return Math.round(score);
}
```

### Batch Scoring

```typescript
const analyzedAssets = await db.provider_assets.findAnalyzed(entityId);

for (const asset of analyzedAssets) {
  const score = calculateAssetScore(asset);
  await db.provider_assets.update(asset.id, { score });
}
```

---

## Phase 5: Intelligent Selection

**Goal**: Select the top N assets per type, automatically evicting lower-ranked assets when better options arrive.

### Selection Configuration

Default limits (user-configurable):

```typescript
const maxAllowable = {
  poster: 3,
  fanart: 5,
  logo: 2,
  banner: 1,
  clearlogo: 1,
  clearart: 1,
  discart: 1,
  landscape: 1,
  keyart: 1,
  thumb: 1,
  trailer: 3,
};
```

### Selection Logic with Auto-Eviction

```typescript
const assetTypes = Object.keys(maxAllowable);

for (const assetType of assetTypes) {
  // Check if asset type is locked by user
  const lockField = `${assetType}_locked`;
  const isLocked = movie[lockField] === 1;

  if (isLocked) {
    // User manually selected assets for this type - never auto-change
    continue;
  }

  // Get top N candidates by score
  const topN = await db.provider_assets.findTopN({
    entity_id: entityId,
    entity_type: entityType,
    asset_type: assetType,
    is_rejected: 0,  // Exclude user-rejected assets
    limit: maxAllowable[assetType],
    order_by: 'score DESC',
  });

  const topNIds = topN.map(a => a.id);

  // Mark top N as selected
  await db.provider_assets.updateMany({
    where: { id: { in: topNIds } },
    data: {
      is_selected: 1,
      selected_at: new Date(),
      selected_by: 'auto',
    },
  });

  // Deselect all others (auto-eviction of lower-ranked assets)
  await db.provider_assets.updateMany({
    where: {
      entity_id: entityId,
      entity_type: entityType,
      asset_type: assetType,
      id: { notIn: topNIds },
    },
    data: {
      is_selected: 0,
      selected_at: null,
      selected_by: null,
    },
  });
}
```

### Manual Selection Lock

When a user manually selects an asset via UI:

```typescript
// User clicks "Set as Poster" on a specific asset
async function manualSelectAsset(assetId: number) {
  const asset = await db.provider_assets.findById(assetId);
  const lockField = `${asset.asset_type}_locked`;

  // Mark asset as selected
  await db.provider_assets.update(assetId, {
    is_selected: 1,
    selected_at: new Date(),
    selected_by: 'user',
  });

  // Lock asset type to prevent auto-changes
  await db.movies.update(asset.entity_id, {
    [lockField]: 1,
  });

  // Deselect all other assets of this type
  await db.provider_assets.updateMany({
    where: {
      entity_id: asset.entity_id,
      asset_type: asset.asset_type,
      id: { not: assetId },
    },
    data: { is_selected: 0 },
  });
}
```

---

## Phase 5B: Download Selected Assets to Cache

**Goal**: Permanently store selected assets in cache for UI display and future publishing.

**Critical**: This is the NEW phase that makes enrichment cache-complete. After Phase 5 (selection), we now download the selected assets to permanent storage.

### Download Selected to Cache

```typescript
// Get all selected assets that aren't already in cache
const selectedAssets = await db.query(`
  SELECT pa.id, pa.asset_type, pa.provider_url, pa.content_hash,
         pa.perceptual_hash, pa.width, pa.height, pa.mime_type, pa.file_size
  FROM provider_assets pa
  WHERE pa.entity_id = ?
    AND pa.entity_type = ?
    AND pa.is_selected = 1
    AND pa.is_downloaded = 0
`, [entityId, entityType]);

logger.info('[Enrichment] Downloading selected assets to cache', {
  count: selectedAssets.length,
});

for (const asset of selectedAssets) {
  try {
    // Determine cache path (content-addressed)
    const ext = path.extname(new URL(asset.provider_url).pathname) || '.jpg';
    const cacheDir = `/data/cache/${asset.asset_type}`;
    const cachePath = path.join(
      cacheDir,
      asset.content_hash.slice(0, 2),
      `${asset.content_hash}${ext}`
    );

    // Ensure directory exists
    await fs.mkdir(path.dirname(cachePath), { recursive: true });

    // Download from provider
    const buffer = await downloadFile(asset.provider_url);

    // Verify hash matches
    const actualHash = calculateSHA256(buffer);
    if (actualHash !== asset.content_hash) {
      logger.error('[Enrichment] Hash mismatch - provider changed asset', {
        assetId: asset.id,
        expected: asset.content_hash.slice(0, 8),
        actual: actualHash.slice(0, 8),
      });
      continue; // Skip this asset
    }

    // Write to cache
    await fs.writeFile(cachePath, buffer);

    // Get image dimensions (if not already accurate)
    let width = asset.width;
    let height = asset.height;
    let format = ext.slice(1);

    if (asset.asset_type !== 'trailer' && asset.asset_type !== 'sample') {
      const metadata = await sharp(cachePath).metadata();
      width = metadata.width;
      height = metadata.height;
      format = metadata.format;
    }

    // Insert cache_image_files record
    const cacheFileId = await db.execute(
      `INSERT INTO cache_image_files (
        entity_type, entity_id, file_path, file_name, file_size,
        file_hash, perceptual_hash, image_type, width, height, format,
        source_type, source_url, provider_name, discovered_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        entityType,
        entityId,
        cachePath,
        path.basename(cachePath),
        buffer.length,
        asset.content_hash,
        asset.perceptual_hash,
        asset.asset_type,
        width,
        height,
        format,
        'provider',
        asset.provider_url,
        asset.provider_name,
      ]
    );

    // Update provider_assets
    await db.provider_assets.update(asset.id, {
      is_downloaded: 1,
    });

    logger.debug('[Enrichment] Asset downloaded to cache', {
      assetId: asset.id,
      assetType: asset.asset_type,
      cachePath,
    });

  } catch (error) {
    logger.error('[Enrichment] Failed to download asset to cache', {
      assetId: asset.id,
      url: asset.provider_url,
      error: getErrorMessage(error),
    });
    // Continue with other assets
  }
}

logger.info('[Enrichment] Phase 5B complete', {
  assetsDownloaded: selectedAssets.length,
});
```

**Output**: Selected assets permanently stored in cache, visible in UI

---

## Phase 6: Fetch Actor Data and Download Thumbnails

**Goal**: Create actor records and download thumbnails to cache for UI display.

**Critical**: Actors are created during enrichment (not scan) to avoid naming ambiguities. Thumbnails download to cache immediately so user can review cast before publishing.

### Fetch Cast from TMDB

```typescript
// Get TMDB ID for this movie
const movie = await db.movies.findById(entityId);
if (!movie.tmdb_id) {
  logger.warn('[Enrichment] No TMDB ID, skipping actor fetch', { entityId });
  return { actorsFetched: 0 };
}

// Fetch cast from TMDB
const credits = await tmdbClient.getMovieCredits(movie.tmdb_id);
const cast = credits.cast.slice(0, 15); // Top 15 actors

logger.info('[Enrichment] Fetching actors', {
  movieId: entityId,
  tmdbId: movie.tmdb_id,
  actorCount: cast.length,
});

let actorsFetched = 0;

for (const tmdbActor of cast) {
  try {
    // Find or create actor by tmdb_id (unique identifier)
    let actor = await db.get(
      `SELECT id, name, tmdb_id FROM actors WHERE tmdb_id = ?`,
      [tmdbActor.id]
    );

    if (!actor) {
      // Create new actor
      const actorId = await db.execute(
        `INSERT INTO actors (
          name, name_normalized, tmdb_id, tmdb_profile_path, created_at
        ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          tmdbActor.name,
          normalizeActorName(tmdbActor.name),
          tmdbActor.id,
          tmdbActor.profile_path,
        ]
      );

      actor = { id: actorId, name: tmdbActor.name, tmdb_id: tmdbActor.id };

      logger.debug('[Enrichment] Created actor', {
        actorId,
        name: tmdbActor.name,
        tmdbId: tmdbActor.id,
      });
    }

    // Link actor to movie
    await db.execute(
      `INSERT OR IGNORE INTO movie_actors (
        movie_id, actor_id, character, actor_order, created_at
      ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [entityId, actor.id, tmdbActor.character, tmdbActor.order]
    );

    // Download actor thumbnail to cache
    if (tmdbActor.profile_path) {
      const imageUrl = `https://image.tmdb.org/t/p/original${tmdbActor.profile_path}`;

      // Download and hash
      const buffer = await downloadFile(imageUrl);
      const contentHash = calculateSHA256(buffer);

      // Determine cache path
      const cachePath = path.join(
        '/data/cache/actor',
        contentHash.slice(0, 2),
        `${contentHash}.jpg`
      );

      // Check if already cached
      const existingCache = await db.get(
        `SELECT id FROM cache_image_files WHERE file_hash = ?`,
        [contentHash]
      );

      if (!existingCache) {
        // Write to cache
        await fs.mkdir(path.dirname(cachePath), { recursive: true });
        await fs.writeFile(cachePath, buffer);

        // Get metadata
        const metadata = await sharp(cachePath).metadata();

        // Insert cache_image_files record
        await db.execute(
          `INSERT INTO cache_image_files (
            entity_type, entity_id, file_path, file_name, file_size,
            file_hash, image_type, width, height, format,
            source_type, source_url, provider_name, discovered_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          [
            'movie',
            entityId,
            cachePath,
            path.basename(cachePath),
            buffer.length,
            contentHash,
            'actor_thumb',
            metadata.width,
            metadata.height,
            metadata.format,
            'provider',
            imageUrl,
            'tmdb',
          ]
        );

        logger.debug('[Enrichment] Actor thumbnail cached', {
          actorName: tmdbActor.name,
          cachePath,
        });
      }

      // Update actor record with cache path
      await db.execute(
        `UPDATE actors SET
          image_cache_path = ?,
          image_hash = ?,
          image_ctime = ?
        WHERE id = ?`,
        [cachePath, contentHash, Date.now(), actor.id]
      );
    }

    actorsFetched++;

  } catch (error) {
    logger.error('[Enrichment] Failed to process actor', {
      actorName: tmdbActor.name,
      error: getErrorMessage(error),
    });
    // Continue with other actors
  }
}

logger.info('[Enrichment] Phase 6 complete', {
  actorsFetched,
});
```

**Output**: Actors table populated, thumbnails in cache, visible in UI

---

## Phase 7: Update Entity Status and Complete

**Goal**: Mark entity as enriched and notify UI.

```typescript
// Update movie enrichment timestamp
await db.movies.update(entityId, {
  enriched_at: new Date(),
  identification_status: 'enriched',
});

// Emit completion event (WebSocket to UI)
websocketBroadcaster.broadcast('enrichment.complete', {
  entityType,
  entityId,
  assetsSelected: selectedCount,
  actorsFound: actorsFetched,
});

logger.info('[Enrichment] Complete', {
  entityType,
  entityId,
  assetsSelected: selectedCount,
  actorsFetched,
  durationMs: Date.now() - startTime,
});
```

**Output**: Entity marked as enriched, UI updates immediately

---

## Provider Integration

### Provider Priority Explained

1. **TMDB** (10 points): Largest catalog, good quality, comprehensive metadata
2. **Fanart.tv** (9 points): **Highest quality** artwork, but fewer assets than TMDB
3. **TVDB** (8 points): Best for TV content, similar quality to TMDB

### Rate Limiting Strategy

```typescript
// Adaptive backoff on 429 responses
if (response.status === 429) {
  const retryAfter = parseInt(response.headers['retry-after']) || 60;
  await sleep(retryAfter * 1000 * backoffMultiplier);
  backoffMultiplier *= 2; // Exponential backoff
}
```

### Force Refresh Behavior

```typescript
// manual=true bypasses 7-day staleness check
if (manual === true) {
  // Always fetch fresh from providers
  // Update existing provider_assets rows with latest votes/metadata
  force_refresh = true;
}

// manual=false uses cache strategy
if (manual === false && cache_age < 7_days) {
  // Skip provider fetch - use cached provider_assets
  skip_to_phase_2 = true;
}
```

---

## Database Schema

### `provider_assets` Table (Master Catalog)

```sql
CREATE TABLE provider_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  asset_type TEXT NOT NULL,

  -- Provider information
  provider_name TEXT NOT NULL,
  provider_url TEXT NOT NULL,
  provider_metadata TEXT,  -- JSON: votes, likes, language

  -- Analysis results (from Phase 3)
  analyzed BOOLEAN DEFAULT 0,
  width INTEGER,
  height INTEGER,
  duration_seconds INTEGER,
  content_hash TEXT,
  perceptual_hash TEXT,
  mime_type TEXT,
  file_size INTEGER,

  -- Selection state
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
);
```

---

## Configuration

```typescript
interface EnrichmentConfig {
  enabled: boolean; // Global enrichment toggle (workflow.enrichment)

  // Provider configuration
  providers: {
    tmdb: { enabled: boolean; apiKey?: string };
    tvdb: { enabled: boolean; apiKey?: string };
    fanart: { enabled: boolean; apiKey?: string };
  };

  // Asset limits (max selected per type)
  maxAllowable: {
    poster: number;    // Default: 3
    fanart: number;    // Default: 5
    logo: number;      // Default: 2
    banner: number;    // Default: 1
    clearlogo: number; // Default: 1
    clearart: number;  // Default: 1
    discart: number;   // Default: 1
    landscape: number; // Default: 1
    keyart: number;    // Default: 1
    thumb: number;     // Default: 1
    trailer: number;   // Default: 3
  };

  // Refresh interval
  cacheRefreshDays: number; // Default: 7
}
```

---

## Error Handling

- **Provider timeout**: Skip provider, continue with others
- **404 Not Found**: Mark as "no metadata available", log
- **Rate limited (429)**: Exponential backoff with retry-after header
- **Download failed**: Retry 3x, then skip asset (log error)
- **Corrupted file**: Skip asset, try next candidate
- **Hash mismatch**: Log error, skip asset (provider changed file)

---

## Performance Optimizations

- **Parallel provider fetches**: All providers queried concurrently
- **Parallel analysis**: Up to 10 concurrent temp downloads in Phase 3
- **Batch database updates**: Group scoring and selection updates
- **Temp file cleanup**: Immediate deletion after analysis
- **Cache linkage**: Hash-based lookups avoid full table scans

---

## Related Documentation

- [Publishing Phase](PUBLISHING.md) - Asset deployment to library
- [Provider Overview](../providers/OVERVIEW.md) - Provider system details
- [TMDB Provider](../providers/TMDB.md) - TMDB API integration
- [TVDB Provider](../providers/TVDB.md) - TVDB API integration
- [Fanart.tv Provider](../providers/FANART.md) - Fanart.tv integration
- [Database Schema](../DATABASE.md) - Complete schema reference
- [API Architecture](../API.md) - Enrichment endpoints

---

## Completion State

Upon completion, enrichment:

1. **Marks entity as enriched**
   ```typescript
   await db.movies.update(entityId, {
     identification_status: 'enriched',
     enriched_at: new Date(),
   });
   ```

2. **Broadcasts completion event**
   ```typescript
   websocketBroadcaster.broadcast('enrichment.complete', {
     entityId,
     entityType,
     assetsSelected: selectedCount,
   });
   ```

3. **DOES NOT auto-publish** (by default)
   - Enrichment creates a **user review gate**
   - User can preview assets, edit metadata, swap selections
   - User manually triggers publishing when satisfied
   - **Exception**: If `workflow.auto_publish = true`, creates publish job automatically

## User Review Gate

After enrichment, the user sees:
- ✅ All metadata populated (title, plot, ratings, etc.)
- ✅ Selected assets visible in UI (posters, fanart, logos)
- ✅ Actor list with headshots
- ✅ Status badge: "Enriched - Ready to Publish"
- ✅ **"Publish" button** to deploy to library

The user can:
- Swap asset selections (click alternative poster)
- Edit metadata fields (title, plot, etc.)
- Lock asset types to prevent future auto-selection
- Manually trigger publishing when satisfied

## Next Phase

Publishing is **manually triggered** (or automated if `workflow.auto_publish = true`):
- See [Publishing Phase](PUBLISHING.md) for deployment workflow
- Publishing copies cache → library and notifies media players
