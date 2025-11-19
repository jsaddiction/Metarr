# Job Role Refinement: ENRICH vs PUBLISH

**Purpose**: Define precise responsibilities for each job to eliminate ambiguity and create a clear implementation roadmap.

**Created**: 2025-01-29

---

## Executive Summary

### The Core Problem
Current implementation has **role ambiguity** between enrichment and publishing:
- Which job downloads assets to cache?
- Which job handles actor images?
- When does the user review gate occur?
- What triggers each job?

### The Solution
**Clear separation of concerns** with distinct completion criteria:

```
ENRICH Job                          PUBLISH Job
─────────────────────────           ─────────────────────────
Input:  tmdb_id, imdb_id            Input:  enriched entity
Output: UI-ready cache              Output: player-ready library
Result: User can review             Result: Players can scan
```

---

## Job 1: ENRICH (Metadata & Cache Preparation)

### Role Definition
**Primary Responsibility**: Prepare everything needed for the user to review and edit in the web UI.

**Completion Criteria**: When this job finishes successfully:
- ✅ User can see all metadata in UI
- ✅ User can see all selected assets (posters, fanart, etc.)
- ✅ User can see actor list with thumbnails
- ✅ User can swap assets, edit fields, lock choices
- ✅ Cache is fully populated with selected assets
- ✅ Entity status = 'enriched'

### Detailed Responsibilities

#### 1. Fetch Provider Metadata
```typescript
// Phase 1A: Query providers
const providers = ['tmdb', 'tvdb', 'fanart.tv'];
for (const provider of providers) {
  const assets = await provider.fetchAssets(tmdb_id);

  // Save to provider_assets table
  for (const asset of assets) {
    await db.provider_assets.create({
      entity_id: movieId,
      entity_type: 'movie',
      asset_type: asset.type,
      provider_name: provider,
      provider_url: asset.url,
      provider_metadata: JSON.stringify(asset.metadata),
      width: asset.width,  // API estimate (will verify later)
      height: asset.height,
      analyzed: 0,         // Not yet analyzed
      is_downloaded: 0,    // Not in cache yet
      is_selected: 0,      // Not selected yet
    });
  }
}
```

**Output**: `provider_assets` table populated with 50-200 candidate URLs

#### 2. Match Existing Cache Assets
```typescript
// Phase 1B: Link existing cache files to provider URLs
const cacheFiles = await db.cache_image_files.findByEntity(movieId, 'movie');

for (const cacheFile of cacheFiles) {
  // Try perceptual hash matching
  const match = await findProviderAssetByPerceptualHash(
    cacheFile.perceptual_hash,
    cacheFile.image_type
  );

  if (match) {
    // Mark as already downloaded
    await db.provider_assets.update(match.id, {
      is_downloaded: 1,
      content_hash: cacheFile.file_hash,
      analyzed: 1,
    });
  }
}
```

**Output**: Existing cache files linked to provider URLs (deduplication)

#### 3. Download & Analyze ALL Candidates
```typescript
// Phase 2: Temp download for analysis (NOT permanent storage)
const unanalyzed = await db.provider_assets.findUnanalyzed(movieId);

await pMap(unanalyzed, async (asset) => {
  const tempPath = `/tmp/metarr-analyze-${uuid()}.tmp`;

  try {
    // Download to temp
    await downloadFile(asset.provider_url, tempPath);

    // Get ACTUAL dimensions (not API estimate)
    const metadata = await sharp(tempPath).metadata();
    const contentHash = await hashFile(tempPath);
    const perceptualHash = await computePerceptualHash(tempPath);

    // Update provider_assets with real data
    await db.provider_assets.update(asset.id, {
      width: metadata.width,        // ACTUAL (not estimate)
      height: metadata.height,      // ACTUAL
      content_hash: contentHash,
      perceptual_hash: perceptualHash,
      file_size: metadata.size,
      mime_type: metadata.format,
      analyzed: 1,
      analyzed_at: new Date(),
    });

  } finally {
    // ALWAYS delete temp file
    await fs.unlink(tempPath).catch(() => {});
  }
}, { concurrency: 10 });
```

**Output**: All provider assets analyzed with accurate metadata, temp files deleted

#### 4. Calculate Scores
```typescript
// Phase 3: Score based on quality metrics
const analyzedAssets = await db.provider_assets.findAnalyzed(movieId);

for (const asset of analyzedAssets) {
  const score = calculateScore(asset); // 0-100 points
  await db.provider_assets.update(asset.id, { score });
}
```

**Scoring Algorithm** (0-100 points):
- **Resolution** (30 pts): Higher resolution = higher score
- **Aspect Ratio** (20 pts): Match ideal ratio for asset type
- **Language** (20 pts): User's preferred language
- **Community Votes** (20 pts): TMDB vote average weighted by count
- **Provider Priority** (10 pts): TMDB=10, Fanart.tv=9, TVDB=8

**Output**: All assets scored for ranking

#### 5. Intelligent Selection
```typescript
// Phase 4: Select top N per asset type (respecting locks)
const assetLimits = {
  poster: 3,
  fanart: 5,
  logo: 2,
  clearlogo: 1,
  clearart: 1,
  discart: 1,
  banner: 1,
  landscape: 1,
  thumb: 1,
};

for (const [assetType, maxAllowable] of Object.entries(assetLimits)) {
  // Check if user locked this asset type
  const isLocked = await db.movies.get(movieId)[`${assetType}_locked`];
  if (isLocked) {
    continue; // Skip auto-selection
  }

  // Get top N by score
  const topN = await db.provider_assets.findTopN({
    entity_id: movieId,
    asset_type: assetType,
    limit: maxAllowable,
    order_by: 'score DESC',
  });

  // Mark as selected
  for (const asset of topN) {
    await db.provider_assets.update(asset.id, {
      is_selected: 1,
      selected_at: new Date(),
      selected_by: 'auto',
    });
  }

  // Deselect others (auto-eviction)
  await db.provider_assets.deselectOthers(movieId, assetType, topN.map(a => a.id));
}
```

**Output**: Top assets selected per type, marked in database

#### 6. Download Selected Assets to Cache
```typescript
// Phase 5: Permanent cache storage for selected assets
const selectedAssets = await db.provider_assets.findSelected(movieId);

for (const asset of selectedAssets) {
  // Skip if already in cache
  if (asset.is_downloaded) {
    continue;
  }

  // Download to permanent cache
  const cacheDir = `/data/cache/${asset.asset_type}`;
  const cachePath = `${cacheDir}/${asset.content_hash.slice(0, 2)}/${asset.content_hash}.jpg`;

  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  await downloadFile(asset.provider_url, cachePath);

  // Get metadata (for cache_image_files)
  const metadata = await sharp(cachePath).metadata();

  // Insert cache_image_files record
  await db.cache_image_files.create({
    entity_type: 'movie',
    entity_id: movieId,
    file_path: cachePath,
    file_name: path.basename(cachePath),
    file_size: metadata.size,
    file_hash: asset.content_hash,
    perceptual_hash: asset.perceptual_hash,
    image_type: asset.asset_type,
    width: metadata.width,
    height: metadata.height,
    format: metadata.format,
    source_type: 'provider',
    source_url: asset.provider_url,
    provider_name: asset.provider_name,
  });

  // Update provider_assets
  await db.provider_assets.update(asset.id, {
    is_downloaded: 1,
  });
}
```

**Output**: Selected assets permanently stored in `/data/cache/`, `cache_image_files` populated

#### 7. Fetch & Store Actor Data
```typescript
// Phase 6: Actor metadata and thumbnails
const cast = await tmdb.getMovieCredits(tmdb_id);

for (const tmdbActor of cast.slice(0, 15)) { // Top 15 actors
  // Find or create actor
  let actor = await db.actors.findByTmdbId(tmdbActor.id);

  if (!actor) {
    actor = await db.actors.create({
      name: tmdbActor.name,
      name_normalized: normalizeActorName(tmdbActor.name),
      tmdb_id: tmdbActor.id,
      tmdb_profile_path: tmdbActor.profile_path,
    });
  }

  // Link to movie
  await db.movie_actors.create({
    movie_id: movieId,
    actor_id: actor.id,
    character: tmdbActor.character,
    actor_order: tmdbActor.order,
  });

  // Download actor thumbnail to cache
  if (tmdbActor.profile_path) {
    const imageUrl = `https://image.tmdb.org/t/p/original${tmdbActor.profile_path}`;
    const contentHash = await downloadAndHashFile(imageUrl);
    const cachePath = `/data/cache/actor/${contentHash.slice(0, 2)}/${contentHash}.jpg`;

    await fs.mkdir(path.dirname(cachePath), { recursive: true });
    await downloadFile(imageUrl, cachePath);

    const metadata = await sharp(cachePath).metadata();

    // Store in cache_image_files
    await db.cache_image_files.create({
      entity_type: 'movie',
      entity_id: movieId,
      file_path: cachePath,
      file_name: path.basename(cachePath),
      file_size: metadata.size,
      file_hash: contentHash,
      image_type: 'actor_thumb',
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      source_type: 'provider',
      source_url: imageUrl,
      provider_name: 'tmdb',
    });

    // Update actor record
    await db.actors.update(actor.id, {
      image_cache_path: cachePath,
      image_hash: contentHash,
      image_ctime: Date.now(),
    });
  }
}
```

**Output**: Actors populated, thumbnails in cache, visible in UI

#### 8. Update Entity Status
```typescript
// Phase 7: Mark as enriched
await db.movies.update(movieId, {
  identification_status: 'enriched',
  enriched_at: new Date(),
});

// Broadcast to UI
websocketBroadcaster.broadcast('enrichment.complete', {
  entityType: 'movie',
  entityId: movieId,
  assetsSelected: selectedCount,
  actorsFound: cast.length,
});
```

**Output**: Entity marked as enriched, UI updates with badge and data

### What ENRICH Does NOT Do
- ❌ Copy files to library directories
- ❌ Generate NFO files
- ❌ Notify media players
- ❌ Modify library filesystem in any way

### Current Implementation Status

**EnrichmentService.ts** - Mostly complete:
- ✅ Phase 1: Fetch provider metadata (via ProviderCacheManager)
- ✅ Phase 2: Match cache assets
- ✅ Phase 3: Download & analyze (temp files only)
- ✅ Phase 4: Calculate scores
- ✅ Phase 5: Intelligent selection
- ❌ **MISSING**: Phase 5B - Download selected to cache
- ❌ **MISSING**: Phase 6 - Actor images to cache
- ⚠️ Phase 7: Status update (exists but doesn't match new model)

**Implementation Gap**: Phase 3 downloads to temp and deletes. Need new Phase 5B to download selected assets to permanent cache.

---

## Job 2: PUBLISH (Library Deployment)

### Role Definition
**Primary Responsibility**: Deploy enriched cache to library filesystem for media player consumption.

**Completion Criteria**: When this job finishes successfully:
- ✅ Library directory contains all asset files with Kodi naming
- ✅ NFO file generated with complete metadata
- ✅ `.actors/` folder contains actor thumbnails
- ✅ Media players notified to scan
- ✅ Entity `last_published_at` updated
- ✅ User sees "Published" badge in UI

### Detailed Responsibilities

#### 1. Validate Prerequisites
```typescript
// Phase 0: Safety checks
const movie = await db.movies.findById(movieId);

// Check enrichment status
if (movie.identification_status !== 'enriched') {
  throw new Error('Cannot publish: movie not enriched');
}

// Check selected assets exist in cache
const selectedAssets = await db.provider_assets.findSelected(movieId);
if (selectedAssets.length === 0) {
  throw new Error('Cannot publish: no assets selected');
}

// Check cache completeness
for (const asset of selectedAssets) {
  const cacheFile = await db.cache_image_files.findByHash(asset.content_hash);
  if (!cacheFile || !await fs.exists(cacheFile.file_path)) {
    logger.warn('Cache file missing, will re-download', {
      assetId: asset.id,
      assetType: asset.asset_type,
    });
    // Mark for re-download
    missingSssets.push(asset);
  }
}
```

**Output**: Validation passed or errors thrown

#### 2. Ensure Cache Completeness
```typescript
// Phase 1: Re-download missing cache files (edge case: cache cleanup)
for (const asset of missingAssets) {
  logger.info('Re-downloading missing cache file', {
    assetType: asset.asset_type,
    url: asset.provider_url,
  });

  const cachePath = `/data/cache/${asset.asset_type}/${asset.content_hash.slice(0, 2)}/${asset.content_hash}.jpg`;

  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  await downloadFile(asset.provider_url, cachePath);

  // Recreate cache_image_files record
  await db.cache_image_files.create({
    entity_type: 'movie',
    entity_id: movieId,
    file_path: cachePath,
    file_hash: asset.content_hash,
    image_type: asset.asset_type,
    // ... other metadata
  });
}
```

**Output**: Cache guaranteed complete

#### 3. Copy Assets to Library (Rank-Based Naming)
```typescript
// Phase 2: Deploy to library with Kodi naming
const movieDir = path.dirname(movie.file_path);
const basename = path.basename(movie.file_path, path.extname(movie.file_path));
// e.g., "The Matrix (1999)"

// Group selected assets by type and rank by score
const assetsByType = await db.query(`
  SELECT
    pa.asset_type,
    pa.score,
    cf.file_path as cache_path,
    ROW_NUMBER() OVER (
      PARTITION BY pa.asset_type
      ORDER BY pa.score DESC
    ) as rank
  FROM provider_assets pa
  JOIN cache_image_files cf ON cf.file_hash = pa.content_hash
  WHERE pa.entity_id = ? AND pa.is_selected = 1
  ORDER BY pa.asset_type, pa.score DESC
`, [movieId]);

for (const asset of assetsByType) {
  const ext = path.extname(asset.cache_path);

  // Kodi naming: poster.jpg (rank 1), poster1.jpg (rank 2), poster2.jpg (rank 3)
  let libraryFilename;
  if (asset.rank === 1) {
    libraryFilename = `${basename}-${asset.asset_type}${ext}`;
  } else {
    libraryFilename = `${basename}-${asset.asset_type}${asset.rank - 1}${ext}`;
  }

  const libraryPath = path.join(movieDir, libraryFilename);

  // Atomic write: temp file → rename
  const tempPath = `${libraryPath}.tmp.${Date.now()}`;
  await fs.copyFile(asset.cache_path, tempPath);
  await fs.rename(tempPath, libraryPath);

  // Track in library_image_files
  await db.library_image_files.create({
    cache_file_id: asset.cache_file_id,
    file_path: libraryPath,
    published_at: new Date(),
  });

  logger.debug('Asset published', {
    assetType: asset.asset_type,
    rank: asset.rank,
    libraryPath,
  });
}
```

**Output**: Assets copied to library with Kodi-compliant naming

#### 4. Copy Actor Images to .actors/ Folder
```typescript
// Phase 3: Actor thumbnails
const actorsDir = path.join(movieDir, '.actors');
await fs.mkdir(actorsDir, { recursive: true });

const actors = await db.query(`
  SELECT a.name, a.image_cache_path
  FROM actors a
  JOIN movie_actors ma ON ma.actor_id = a.id
  WHERE ma.movie_id = ?
    AND a.image_cache_path IS NOT NULL
  ORDER BY ma.actor_order
`, [movieId]);

for (const actor of actors) {
  if (!await fs.exists(actor.image_cache_path)) {
    logger.warn('Actor image missing from cache', {
      actorName: actor.name,
    });
    continue;
  }

  const ext = path.extname(actor.image_cache_path);
  const libraryFilename = `${actor.name}${ext}`; // "Keanu Reeves.jpg"
  const libraryPath = path.join(actorsDir, libraryFilename);

  // Atomic copy
  const tempPath = `${libraryPath}.tmp.${Date.now()}`;
  await fs.copyFile(actor.image_cache_path, tempPath);
  await fs.rename(tempPath, libraryPath);

  logger.debug('Actor image published', {
    actorName: actor.name,
    libraryPath,
  });
}
```

**Output**: `.actors/` folder created with thumbnails

#### 5. Generate NFO File
```typescript
// Phase 4: Kodi-compliant NFO
const nfoContent = await generateMovieNFO(movie);
const nfoPath = path.join(movieDir, `${basename}.nfo`);

// Atomic write
const tempPath = `${nfoPath}.tmp.${Date.now()}`;
await fs.writeFile(tempPath, nfoContent, 'utf-8');
await fs.rename(tempPath, nfoPath);

// Calculate hash for change detection
const nfoHash = crypto.createHash('sha256').update(nfoContent).digest('hex');

logger.info('NFO generated', { nfoPath });
```

**NFO Structure**:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<movie>
  <title>The Matrix</title>
  <originaltitle>The Matrix</originaltitle>
  <year>1999</year>
  <plot>...</plot>
  <runtime>136</runtime>

  <!-- Ratings -->
  <ratings>
    <rating name="tmdb" max="10" default="true">
      <value>8.7</value>
      <votes>25634</votes>
    </rating>
  </ratings>

  <!-- IDs -->
  <uniqueid type="tmdb" default="true">603</uniqueid>
  <uniqueid type="imdb">tt0133093</uniqueid>

  <!-- Genres -->
  <genre>Action</genre>
  <genre>Science Fiction</genre>

  <!-- Actors -->
  <actor>
    <name>Keanu Reeves</name>
    <role>Neo</role>
    <thumb>.actors/Keanu Reeves.jpg</thumb>
    <order>0</order>
  </actor>

  <!-- Stream Details -->
  <fileinfo>
    <streamdetails>
      <video>
        <codec>hevc</codec>
        <width>3840</width>
        <height>2160</height>
        <aspect>1.78</aspect>
      </video>
      <audio>
        <codec>dts</codec>
        <language>eng</language>
        <channels>8</channels>
      </audio>
    </streamdetails>
  </fileinfo>

  <!-- NO <thumb> or <fanart> URLs - Kodi scans directory -->
</movie>
```

**Output**: NFO file in library directory

#### 6. Update Entity Status
```typescript
// Phase 5: Mark as published
await db.movies.update(movieId, {
  last_published_at: new Date(),
  published_nfo_hash: nfoHash,
});

// Log publication
await db.publish_log.create({
  entity_type: 'movie',
  entity_id: movieId,
  published_at: new Date(),
  assets_published: JSON.stringify({ count: assetsByType.length }),
  nfo_generated: true,
});

// Broadcast to UI
websocketBroadcaster.broadcast('entity.published', {
  entityType: 'movie',
  entityId: movieId,
  assetsPublished: assetsByType.length,
});
```

**Output**: Entity marked as published, UI shows badge

#### 7. Notify Media Players
```typescript
// Phase 6: Queue player notification jobs
const library = await db.libraries.findById(movie.library_id);
const playerGroups = await db.query(`
  SELECT mpg.id, mpg.type
  FROM media_player_groups mpg
  JOIN media_player_libraries mpl ON mpl.group_id = mpg.id
  WHERE mpl.library_id = ? AND mpg.enabled = 1
`, [library.id]);

for (const group of playerGroups) {
  await jobQueue.create({
    type: `notify-${group.type}`, // notify-kodi, notify-jellyfin, notify-plex
    priority: 5,
    payload: {
      groupId: group.id,
      libraryId: library.id,
      libraryPath: movieDir,
      event: 'publish',
    },
  });

  logger.debug('Player notification queued', {
    groupType: group.type,
    groupId: group.id,
  });
}
```

**Output**: Media players notified to scan

### What PUBLISH Does NOT Do
- ❌ Fetch provider metadata
- ❌ Score or select assets
- ❌ Modify cache (except re-download on missing files)
- ❌ Update enrichment status

### Current Implementation Status

**PublishingService.ts** - Partial implementation:
- ⚠️ Cache lookup (uses wrong table: `cache_inventory`)
- ⚠️ Asset copying (only one per type, no ranking)
- ⚠️ NFO generation (basic, missing stream details)
- ❌ **MISSING**: Actor .actors/ folder
- ❌ **MISSING**: Rank-based numbering
- ✅ Status update (mostly correct)
- ⚠️ Player notification (stubbed in AssetJobHandlers)

**Implementation Gap**: Needs significant enhancement to match specification.

---

## Workflow Control & Job Chaining

### Current Behavior (Incorrect)
```typescript
// AssetJobHandlers.ts - handleEnrichMetadata()
if (!manual) {
  const publishingEnabled = await this.workflowControl.isEnabled('publishing');
  if (!publishingEnabled) {
    return; // Stop chain
  }
}

// Always chains to publish
await jobQueue.addJob({
  type: 'publish',
  payload: { ... },
});
```

**Problem**: Auto-chains regardless of user review needs

### Correct Behavior
```typescript
// AssetJobHandlers.ts - handleEnrichMetadata()
const enrichmentComplete = {
  success: true,
  assetsSelected: result.assetsSelected,
};

// Check if auto-publish is enabled
const autoPublish = await this.workflowControl.isEnabled('auto_publish');

if (autoPublish && !manual) {
  // Automated workflow: chain to publish
  await jobQueue.addJob({
    type: 'publish',
    payload: { ... },
  });

  logger.info('[AssetJobHandlers] Auto-publish enabled, chaining to publish', {
    entityType,
    entityId,
  });
} else {
  // Manual workflow: stop for user review
  logger.info('[AssetJobHandlers] Enrichment complete, waiting for user to publish', {
    entityType,
    entityId,
  });
}

return enrichmentComplete;
```

### New Workflow Setting

**Add to WorkflowControlService.ts**:
```typescript
export type WorkflowStage =
  | 'webhooks'
  | 'scanning'
  | 'identification'
  | 'enrichment'
  | 'auto_publish'  // NEW: Auto-publish after enrichment
  | 'publishing';   // KEEP: Manual publish toggle
```

**Semantics**:
- `workflow.enrichment = true`: Auto-enrich after scan/identification
- `workflow.auto_publish = false`: **DEFAULT** - Stop after enrich for user review
- `workflow.auto_publish = true`: Chain to publish automatically (full automation)
- `workflow.publishing = true`: Enable publish job execution (safety toggle)

---

## Implementation Roadmap

### Phase 1: Fix ENRICH Job (Week 1)

**Goal**: Complete the enrichment job so cache is fully populated

**Tasks**:
1. ✅ Review current EnrichmentService.ts phases 1-5
2. **Add Phase 5B**: Download selected assets to cache
   - Query `provider_assets` where `is_selected = 1`
   - Download to `/data/cache/{asset_type}/{hash[0:2]}/{hash}.{ext}`
   - Insert into `cache_image_files`
   - Mark `is_downloaded = 1` in `provider_assets`
3. **Add Phase 6**: Actor images to cache
   - Fetch cast from TMDB
   - Create/update `actors` table
   - Download thumbnails to `/data/cache/actor/...`
   - Insert into `cache_image_files` with `image_type = 'actor_thumb'`
4. **Update Phase 7**: Entity status
   - Set `identification_status = 'enriched'`
   - Set `enriched_at = CURRENT_TIMESTAMP`
   - Broadcast WebSocket event
5. **Remove auto-chain** to publish job
   - Check `workflow.auto_publish` setting
   - Only chain if enabled

**Acceptance Criteria**:
- Cache directory contains all selected assets
- Actor thumbnails in cache
- UI shows all assets and actors
- User can review before publishing

**Files to Modify**:
- `src/services/enrichment/EnrichmentService.ts`
- `src/services/jobHandlers/AssetJobHandlers.ts` (remove auto-chain)
- `src/services/workflowControlService.ts` (add `auto_publish`)

---

### Phase 2: Fix PUBLISH Job (Week 2)

**Goal**: Complete the publishing job to deploy cache to library

**Tasks**:
1. **Fix cache lookup**: Use `cache_image_files` instead of `cache_inventory`
2. **Implement rank-based naming**:
   - Query selected assets with `ROW_NUMBER() OVER (PARTITION BY asset_type ORDER BY score DESC)`
   - Copy with naming: `movie-poster.jpg`, `movie-poster1.jpg`, `movie-poster2.jpg`
3. **Implement actor .actors/ folder**:
   - Create `.actors/` subdirectory
   - Copy thumbnails: `Keanu Reeves.jpg`
4. **Enhance NFO generation**:
   - Add stream details (video/audio/subtitle)
   - Add actor `<thumb>` tags pointing to `.actors/` files
   - Include all metadata fields
5. **Implement atomic writes**: temp file → rename pattern
6. **Update status tracking**:
   - Set `last_published_at`
   - Calculate `published_nfo_hash`
   - Log to `publish_log`

**Acceptance Criteria**:
- Library directory has Kodi-compliant structure
- Multiple assets per type (if selected)
- `.actors/` folder with thumbnails
- NFO with complete metadata
- Media players can scan successfully

**Files to Modify**:
- `src/services/publishingService.ts` (major refactor)
- `src/services/jobHandlers/AssetJobHandlers.ts` (update handler)

---

### Phase 3: Frontend Integration (Week 3)

**Goal**: UI shows enrichment/publication status clearly

**Tasks**:
1. **Add status badges** to movie cards
   - "Enriched - Unpublished" (warning)
   - "Updated - Republish?" (info)
   - "Published" (success)
2. **Add action buttons**:
   - "Enrich" button (if not enriched)
   - "Publish" button (if enriched but unpublished)
   - "Republish" button (if published but outdated)
3. **Show asset preview** after enrichment:
   - Selected posters, fanart, logos
   - Actor list with thumbnails
   - "Swap" buttons for alternative assets
4. **WebSocket updates**:
   - Listen for `enrichment.complete`
   - Listen for `entity.published`
   - Update UI real-time

**Files to Modify**:
- `public/frontend/src/components/MovieCard.tsx`
- `public/frontend/src/pages/MovieDetails.tsx`
- `public/frontend/src/hooks/useMovieActions.ts`

---

### Phase 4: Testing & Validation (Week 4)

**Goal**: Ensure end-to-end workflow works correctly

**Test Cases**:
1. **Full enrichment flow**:
   - Scan movie
   - Enrich (fetch, analyze, select, cache)
   - Verify cache populated
   - Verify UI shows assets
2. **Manual publish flow**:
   - Click "Publish" button
   - Verify library files created
   - Verify NFO generated
   - Verify players notified
3. **Auto-publish flow**:
   - Enable `workflow.auto_publish`
   - Enrich movie
   - Verify automatically publishes
4. **Re-enrichment flow**:
   - Enrich again
   - Verify new selections
   - Verify "Republish?" badge shows
   - Click "Republish"
5. **Edge cases**:
   - Cache deleted between enrich/publish
   - Actor missing image
   - Provider 404 on re-download
   - Library directory read-only

**Deliverables**:
- Integration tests for each flow
- Manual test checklist
- Error handling documentation

---

## Decision Points for Discussion

### 1. Cache Cleanup Strategy

**Question**: When should we delete unselected cache assets?

**DECISION**: **Option A** - During publish (immediate cleanup)

**Rationale**:
- Reclaims space immediately after publish
- User has already reviewed and approved selections
- Can always re-enrich if they change their mind
- Simpler logic (no retention tracking)

**Implementation**: Add cleanup phase to publish job (Phase 2)

### 2. Multiple Assets Per Type

**Question**: Should Phase 1 implement rank-based naming?

**DECISION**: **Option A** - Yes, full rank-based naming

**Rationale**:
- Enrichment already selects top N per type (poster: 3, fanart: 5)
- Kodi supports multiple assets with numbered suffixes
- Users get richer artwork experience
- Aligns with "intelligent defaults" philosophy

**Implementation**: Use `ROW_NUMBER()` window function for ranking

### 3. Actor Image Timing

**Question**: When should actor images download?

**DECISION**: **Option A** - During enrichment

**Rationale**:
- User needs to see complete actor list with thumbnails before publishing
- Part of "review gate" - user verifies cast is correct
- Cache completeness principle - everything ready for UI
- Enrichment time is acceptable (actors download in parallel)

**Implementation**: Add Phase 6 to EnrichmentService (fetch cast, download thumbnails)

### 4. NFO Generation

**Question**: Should NFO include stream details?

**DECISION**: **Option A** - Yes, full stream details

**Rationale**:
- Stream data already extracted during scan phase
- Kodi displays codec/resolution info from NFO
- NFO regeneration on upgrades is expected behavior
- Complete metadata = better user experience

**Implementation**: Query `video_streams`, `audio_streams`, `subtitle_streams` tables during NFO generation

---

---

## Finalized Decisions Summary

✅ **Cache Cleanup**: During publish (Phase 2) - immediate space reclamation
✅ **Multiple Assets**: Full rank-based naming (poster.jpg, poster1.jpg, poster2.jpg)
✅ **Actor Images**: During enrichment (Phase 6) - UI-ready immediately
✅ **NFO Streams**: Full stream details from DB
✅ **Recycle Bin**: Removed - direct deletion

---

## Summary

### Clear Role Assignments

| Responsibility | ENRICH | PUBLISH |
|----------------|--------|---------|
| Fetch provider metadata | ✅ | ❌ |
| Download to temp for analysis | ✅ | ❌ |
| Score and select assets | ✅ | ❌ |
| Download selected to cache | ✅ | ❌ |
| Download actor images to cache | ✅ | ❌ |
| Copy cache → library | ❌ | ✅ |
| Generate NFO | ❌ | ✅ |
| Create .actors/ folder | ❌ | ✅ |
| Notify media players | ❌ | ✅ |
| Update enriched_at | ✅ | ❌ |
| Update last_published_at | ❌ | ✅ |

### Implementation Priority

**Must Have (Phase 1-2)**:
- ✅ Complete ENRICH: Phase 5B (cache download) + Phase 6 (actors)
- ✅ Complete PUBLISH: All 6 phases
- ✅ Remove auto-chain, add `workflow.auto_publish`
- ✅ Fix cache table references

**Should Have (Phase 3)**:
- ✅ Frontend status badges
- ✅ Manual publish button
- ✅ Asset preview after enrich

**Nice to Have (Phase 4)**:
- ✅ Comprehensive testing
- ⚠️ Cache cleanup strategy
- ⚠️ Verification job integration

---

## Next Steps

**Ready to proceed with implementation?**

1. Review this document and confirm role assignments
2. Discuss decision points (especially #1-4)
3. Begin Phase 1 implementation (EnrichmentService enhancements)
4. Create detailed implementation PRs for each phase

Let me know your thoughts on the decision points and if you'd like any adjustments to the roadmap!
