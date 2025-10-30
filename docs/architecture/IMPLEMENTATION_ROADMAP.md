# Implementation Roadmap: ENRICH & PUBLISH Jobs

**Status**: Ready for implementation
**Created**: 2025-01-29
**Target**: Complete enrichment-to-publish workflow

---

## Documentation Complete ✅

All phase documentation has been polished and finalized:

1. **[JOB_ROLE_REFINEMENT.md](JOB_ROLE_REFINEMENT.md)** - Detailed job responsibilities and decisions
2. **[ENRICH_VS_PUBLISH_TOPOLOGY.md](ENRICH_VS_PUBLISH_TOPOLOGY.md)** - Mental model and topology
3. **[ENRICHMENT.md](../phases/ENRICHMENT.md)** - Complete 7-phase enrichment workflow
4. **[PUBLISHING.md](../phases/PUBLISHING.md)** - Complete 6-phase publishing workflow

---

## Finalized Decisions

✅ **Cache Cleanup**: During publish (Phase 2) - immediate space reclamation
✅ **Multiple Assets**: Full rank-based naming (poster.jpg, poster1.jpg, poster2.jpg)
✅ **Actor Images**: During enrichment (Phase 6) - UI-ready immediately
✅ **NFO Streams**: Full stream details from DB
✅ **Recycle Bin**: Removed - direct deletion

---

## Phase 1: Complete ENRICH Job

### Current Status
**EnrichmentService.ts** implements phases 1-5:
- ✅ Phase 1: Fetch provider metadata (via ProviderCacheManager)
- ✅ Phase 2: Match cache assets via perceptual hash
- ✅ Phase 3: Download & analyze (temp files only)
- ✅ Phase 4: Calculate scores
- ✅ Phase 5: Intelligent selection

### Missing Implementation
- ❌ **Phase 5B**: Download selected assets to permanent cache
- ❌ **Phase 6**: Fetch actors & download thumbnails to cache
- ⚠️ **Phase 7**: Remove auto-chain to publish, check `workflow.auto_publish`

### Implementation Tasks

#### Task 1.1: Add Phase 5B - Download Selected to Cache
**File**: `src/services/enrichment/EnrichmentService.ts`
**Location**: After `phase5IntelligentSelection()`, before `updateEnrichmentTimestamp()`

```typescript
/**
 * Phase 5B: Download selected assets to permanent cache storage
 */
private async phase5BDownloadSelectedToCache(
  config: EnrichmentConfig
): Promise<{ assetsDownloaded: number }> {
  // Implementation from ENRICHMENT.md Phase 5B
  // Query provider_assets where is_selected=1 and is_downloaded=0
  // Download to /data/cache/{asset_type}/{hash[0:2]}/{hash}.ext
  // Insert into cache_image_files
  // Update provider_assets.is_downloaded = 1
}
```

**Steps**:
1. Query selected assets not in cache
2. For each asset:
   - Determine cache path (content-addressed)
   - Download from provider_url
   - Verify hash matches
   - Write to cache directory
   - Get image dimensions with sharp
   - Insert cache_image_files record
   - Update provider_assets.is_downloaded = 1
3. Return count of assets downloaded

#### Task 1.2: Add Phase 6 - Fetch Actors & Download Thumbnails
**File**: `src/services/enrichment/EnrichmentService.ts`
**Location**: After `phase5BDownloadSelectedToCache()`

```typescript
/**
 * Phase 6: Fetch actors from TMDB and download thumbnails to cache
 */
private async phase6FetchActors(
  config: EnrichmentConfig
): Promise<{ actorsFetched: number }> {
  // Implementation from ENRICHMENT.md Phase 6
  // Get TMDB ID from movie
  // Fetch cast from TMDB API
  // For each actor:
  //   - Find or create actor record
  //   - Link to movie via movie_actors
  //   - Download thumbnail to cache
  //   - Insert cache_image_files with image_type='actor_thumb'
  //   - Update actor.image_cache_path
}
```

**Steps**:
1. Get movie TMDB ID
2. Call `tmdbClient.getMovieCredits(tmdb_id)`
3. For top 15 actors:
   - Find or create actor by tmdb_id
   - Link via movie_actors table
   - If profile_path exists:
     - Download from `https://image.tmdb.org/t/p/original{profile_path}`
     - Calculate SHA256 hash
     - Save to `/data/cache/actor/{hash[0:2]}/{hash}.jpg`
     - Insert cache_image_files record
     - Update actor.image_cache_path
4. Return count of actors fetched

#### Task 1.3: Update Phase 7 - Remove Auto-Chain
**File**: `src/services/jobHandlers/AssetJobHandlers.ts`
**Method**: `handleEnrichMetadata()`
**Location**: After enrichment completes successfully

```typescript
// Check if auto-publish is enabled
const autoPublish = await this.workflowControl.isEnabled('auto_publish');

if (autoPublish && !manual) {
  // Automated workflow: chain to publish
  const publishJobId = await this.jobQueue.addJob({
    type: 'publish',
    priority: manual ? 3 : 5,
    payload: { entityType, entityId, libraryPath, mediaFilename, chainContext },
    manual,
    retry_count: 0,
    max_retries: 3,
  });

  logger.info('[AssetJobHandlers] Auto-publish enabled, chaining to publish', {
    entityType,
    entityId,
    publishJobId,
  });
} else {
  // Manual workflow: stop for user review
  logger.info('[AssetJobHandlers] Enrichment complete, waiting for user to publish', {
    entityType,
    entityId,
  });
}
```

#### Task 1.4: Add workflow.auto_publish Setting
**File**: `src/services/workflowControlService.ts`

```typescript
export type WorkflowStage =
  | 'webhooks'
  | 'scanning'
  | 'identification'
  | 'enrichment'
  | 'auto_publish'  // NEW
  | 'publishing';
```

**Update interface**:
```typescript
export interface WorkflowSettings {
  webhooks: boolean;
  scanning: boolean;
  identification: boolean;
  enrichment: boolean;
  auto_publish: boolean;  // NEW - Default: false
  publishing: boolean;
}
```

### Testing Phase 1

**Test 1: Basic Enrichment**
1. Scan a movie
2. Run enrich job
3. Verify cache populated with selected assets
4. Verify actor thumbnails in cache
5. Verify entity status = 'enriched'
6. Verify NO auto-publish job created

**Test 2: Auto-Publish Enabled**
1. Enable `workflow.auto_publish = true`
2. Run enrich job
3. Verify publish job created automatically

**Test 3: Re-Enrichment**
1. Enrich movie
2. Re-enrich same movie
3. Verify new selections
4. Verify cache updated

**Success Criteria**:
- Cache directory contains all selected assets
- UI shows all assets and actors
- User can review before publishing
- Status badge shows "Enriched - Unpublished"

---

## Phase 2: Complete PUBLISH Job

### Current Status
**PublishingService.ts** has basic implementation:
- ⚠️ Cache lookup (uses wrong table: `cache_inventory`)
- ⚠️ Asset copying (only one per type, no ranking)
- ⚠️ NFO generation (basic, missing stream details)
- ❌ **Missing**: Phase 0 validation
- ❌ **Missing**: Phase 1 cache completeness check
- ❌ **Missing**: Phase 2 cleanup unselected assets
- ❌ **Missing**: Phase 3 rank-based naming
- ❌ **Missing**: Phase 4 actor .actors/ folder
- ⚠️ **Missing**: Phase 5 stream details in NFO
- ⚠️ **Partial**: Phase 6 status update & player notification

### Implementation Tasks

#### Task 2.1: Add Phase 0 - Validation
**File**: `src/services/publishingService.ts`
**Method**: New `validatePrerequisites()`

```typescript
private async validatePrerequisites(config: PublishConfig): Promise<void> {
  // Check entity is enriched
  // Check selected assets exist
  // Check library directory writable
  // Check disk space (warn if low)
}
```

#### Task 2.2: Add Phase 1 - Ensure Cache Completeness
**File**: `src/services/publishingService.ts`
**Method**: New `ensureCacheCompleteness()`

```typescript
private async ensureCacheCompleteness(config: PublishConfig): Promise<{ redownloaded: number }> {
  // Query selected assets
  // For each, check cache_image_files exists
  // Re-download if missing (edge case)
}
```

#### Task 2.3: Add Phase 2 - Cleanup Unselected Assets
**File**: `src/services/publishingService.ts`
**Method**: New `cleanupUnselectedCache()`

```typescript
private async cleanupUnselectedCache(config: PublishConfig): Promise<{ filesDeleted: number; bytesReclaimed: number }> {
  // Query cache files NOT linked to selected provider_assets
  // Delete physical files
  // Delete database records
  // Track space reclaimed
}
```

#### Task 2.4: Fix Phase 3 - Rank-Based Naming
**File**: `src/services/publishingService.ts`
**Method**: Rewrite `publishAsset()` or create `copyAssetsToLibrary()`

```typescript
private async copyAssetsToLibrary(config: PublishConfig): Promise<{ assetsPublished: number }> {
  // Query with ROW_NUMBER() OVER (PARTITION BY asset_type ORDER BY score DESC)
  // For each asset:
  //   - If rank=1: basename-poster.jpg
  //   - If rank>1: basename-poster1.jpg, basename-poster2.jpg
  //   - Atomic write: temp file → rename
  //   - Insert library_image_files record
}
```

#### Task 2.5: Add Phase 4 - Actor .actors/ Folder
**File**: `src/services/publishingService.ts`
**Method**: New `copyActorImages()`

```typescript
private async copyActorImages(config: PublishConfig): Promise<{ actorsPublished: number }> {
  // Create .actors/ subdirectory
  // Query actors for this movie
  // Copy from cache to .actors/{ActorName}.jpg
  // Use spaces in filename, not underscores
}
```

#### Task 2.6: Enhance Phase 5 - NFO with Streams
**File**: `src/services/publishingService.ts`
**Method**: Update `generateMovieNFO()`

```typescript
private async generateMovieNFO(movie: any): Promise<string> {
  // Existing metadata fields
  // Add stream details:
  //   - Query video_streams table
  //   - Query audio_streams table
  //   - Query subtitle_streams table
  //   - Include in <fileinfo><streamdetails>
  // Include actor <thumb> tags pointing to .actors/ files
}
```

#### Task 2.7: Complete Phase 6 - Status & Notifications
**File**: `src/services/publishingService.ts`
**Method**: Update `updatePublishedMetadata()` and add `notifyPlayers()`

```typescript
private async updatePublishedMetadata(...): Promise<void> {
  // Calculate NFO hash
  // Update last_published_at
  // Update published_nfo_hash
  // Log to publish_log
  // Emit WebSocket event
}

private async notifyPlayers(config: PublishConfig): Promise<void> {
  // Get media player groups for this library
  // Queue notification jobs
}
```

### Testing Phase 2

**Test 1: Basic Publish**
1. Enrich a movie
2. Click "Publish" button
3. Verify library directory structure:
   - Multiple assets per type (poster.jpg, poster1.jpg)
   - .actors/ folder with thumbnails
   - NFO file with streams
4. Verify cache cleanup occurred
5. Verify player notification queued

**Test 2: Re-Publish**
1. Publish movie
2. Edit metadata
3. Re-publish
4. Verify files updated

**Test 3: Missing Cache Files**
1. Enrich movie
2. Delete cache file manually
3. Publish
4. Verify file re-downloaded

**Success Criteria**:
- Library has Kodi-compliant structure
- All selected assets published with correct naming
- .actors/ folder created
- NFO includes stream details
- Status shows "Published"
- Players notified

---

## Timeline Estimate

### Week 1: Enrichment Implementation
- **Day 1-2**: Phase 5B (cache download)
- **Day 3-4**: Phase 6 (actors)
- **Day 5**: Phase 7 (remove auto-chain) + workflow setting
- **Testing**: 1-2 days

### Week 2: Publishing Implementation
- **Day 1**: Phase 0-2 (validation, cache check, cleanup)
- **Day 2-3**: Phase 3-4 (rank naming, actors folder)
- **Day 4**: Phase 5-6 (NFO streams, notifications)
- **Day 5**: Integration testing
- **Testing**: 2-3 days

**Total**: ~2-3 weeks for complete implementation + testing

---

## Files to Modify

### Phase 1 (Enrichment)
1. `src/services/enrichment/EnrichmentService.ts` - Add phases 5B, 6
2. `src/services/jobHandlers/AssetJobHandlers.ts` - Remove auto-chain
3. `src/services/workflowControlService.ts` - Add auto_publish

### Phase 2 (Publishing)
1. `src/services/publishingService.ts` - Complete rewrite of all 6 phases
2. `src/services/jobHandlers/AssetJobHandlers.ts` - Update publish handler

### Supporting Files (if needed)
1. `src/providers/TMDBClient.ts` - Ensure getMovieCredits() exists
2. `src/utils/imageHash.ts` - Ensure functions exist
3. `src/utils/fileSystem.ts` - Add helper functions if needed

---

## Ready to Begin Implementation

Documentation is complete and polished. All decisions finalized. Implementation roadmap is clear.

**Next Step**: Begin with Task 1.1 (Phase 5B - Download Selected to Cache)

**User will test after Phase 1 complete, then proceed to Phase 2.**
