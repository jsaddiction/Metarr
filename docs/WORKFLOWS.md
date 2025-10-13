# Workflows

## Overview

Metarr operates through 6 core workflows that handle all media processing scenarios. These workflows are designed for efficiency and automation while preserving user control.

**Core Principle**: "Automate Everything, Override Anything"
- 95% webhook automation
- 5% manual fixes when needed
- Field locking preserves user edits

## Workflow 1: Webhook - New Media

**Trigger**: Radarr/Sonarr sends "Download" or "Import" webhook

**Purpose**: Fully automated processing of new media from *arr stack

### Flow Diagram

```
Webhook Received
    ↓
Parse Webhook Payload
    ↓
Check if Movie Exists (by provider ID)
    ↓
┌─────────────┐
│ NEW MEDIA   │
└─────────────┘
    ↓
Create Job (Priority 1 - Critical)
    ↓
JOB PROCESSING:
│
├─ 1. Create Database Record
│   - Extract: title, year, file_path, provider IDs
│   - Status: identified
│   - Priority: 1 (immediate enrichment)
│
├─ 2. FFprobe Analysis
│   - Extract: video streams (codec, resolution, HDR)
│   - Extract: audio streams (codec, language, channels)
│   - Extract: subtitle streams (embedded + external .srt)
│   - Store in: video_streams, audio_streams, subtitle_streams
│
├─ 3. Provider Enrichment (TMDB/TVDB/etc)
│   - Fetch: metadata (plot, rating, release date, runtime)
│   - Fetch: cast & crew (actors, directors, writers)
│   - Fetch: asset URLs (posters, fanart, logos, trailers)
│   - Store in: normalized tables (actors, crew, genres, studios)
│   - Update: identification_status = 'enriched'
│
├─ 4. Asset Download (Concurrent)
│   - Download all asset types from providers
│   - Calculate: SHA256 hash, perceptual hash (images)
│   - Store in: /cache/assets/{ab}/{cd}/{hash}.ext
│   - Deduplicate: Check if hash exists in cache_assets
│   - Create: cache_assets record (if new)
│   - Link: asset_references (entity → cache_asset)
│   - Update: movie.poster_id, fanart_id, etc.
│
├─ 5. Write Library Assets
│   - Copy from cache → library directory
│   - Naming: Kodi convention (moviename-poster.jpg, moviename-fanart.jpg)
│   - Generate: NFO file with all metadata
│
└─ 6. Notify Media Players
    - Translate: Metarr path → Player path (via path_mappings)
    - Send: Library update notification to all Kodi groups
    - Trigger: Library scan for new item

COMPLETE
```

### Code Example

```typescript
async function handleNewMediaWebhook(webhook: WebhookPayload): Promise<void> {
  // Create critical priority job
  const jobId = await jobQueue.add({
    type: 'webhook',
    priority: 1,
    payload: {
      action: 'new_media',
      movieId: webhook.movie.tmdbId,
      filePath: webhook.movie.path,
      title: webhook.movie.title,
      year: webhook.movie.year
    }
  });

  // Job processor handles the rest
  await jobQueue.process(jobId);
}

async function processNewMediaJob(job: Job): Promise<void> {
  // Step 1: Create database record
  const movie = await db.movies.create({
    library_id: 1,
    file_path: job.payload.filePath,
    title: job.payload.title,
    year: job.payload.year,
    tmdb_id: job.payload.movieId,
    identification_status: 'identified',
    enrichment_priority: 1
  });

  // Step 2: FFprobe
  const streams = await ffprobe(job.payload.filePath);
  await storeStreams(movie.id, streams);

  // Step 3: Provider enrichment
  const metadata = await tmdb.getMovie(job.payload.movieId);
  await enrichMovie(movie.id, metadata);

  // Step 4: Download assets
  await downloadAssets(movie.id, metadata.images);

  // Step 5: Write library files
  await writeNFO(movie.id);
  await copyAssetsToLibrary(movie.id);

  // Step 6: Notify players
  await notifyKodiGroups('library.scan', { movieId: movie.id });
}
```

### Timing

- **Total Duration**: 10-30 seconds (depends on asset count)
  - Database + FFprobe: 1-2 seconds
  - Provider API: 1-3 seconds
  - Asset downloads: 5-20 seconds (concurrent)
  - NFO + Library writes: 1-2 seconds
  - Kodi notification: 1 second

## Workflow 2: Webhook - Upgrade

**Trigger**: Radarr sends "MovieFileDelete" followed by "Download" webhook

**Purpose**: Handle quality upgrades while preserving assets and playback state

### Flow Diagram

```
MovieFileDelete Webhook
    ↓
Check if Movie is Currently Playing
    ↓
┌────────────────────┐
│ PLAYING → CAPTURE  │
└────────────────────┘
    ↓
Query Kodi: Get playback position
Store in: playback_state table
    ↓
Download Webhook (New File)
    ↓
Update Movie Record
│
├─ Update: file_path (new location)
├─ Update: file_size, file_hash
├─ Re-run: FFprobe (new streams)
├─ Keep: All metadata (no re-enrichment)
├─ Keep: All assets (already in cache)
│
└─ Copy Assets to New Location
    - Source: cache (SHA256 hash)
    - Destination: new movie directory
    - Naming: Kodi convention

Update NFO (new file path)
    ↓
Notify Kodi Groups
    ↓
Check for Playback State
    ↓
┌──────────────────────┐
│ HAS STATE → RESTORE  │
└──────────────────────┘
    ↓
Resume Playback:
- Same position
- Same player
- Notify user: "Upgrade complete, resuming playback"
```

### Code Example

```typescript
async function handleMovieFileDeleteWebhook(webhook: WebhookPayload): Promise<void> {
  const movie = await db.movies.findByTmdbId(webhook.movie.tmdbId);

  // Check if currently playing
  const playbackState = await kodi.getPlaybackState(movie.id);

  if (playbackState) {
    // Capture current position
    await db.playback_state.create({
      media_player_id: playbackState.playerId,
      entity_type: 'movie',
      entity_id: movie.id,
      file_path: movie.file_path,
      position_seconds: playbackState.position,
      total_seconds: playbackState.total,
      position_percentage: (playbackState.position / playbackState.total) * 100
    });

    // Stop playback
    await kodi.stopPlayback(playbackState.playerId);
  }
}

async function handleUpgradeDownloadWebhook(webhook: WebhookPayload): Promise<void> {
  const movie = await db.movies.findByTmdbId(webhook.movie.tmdbId);

  // Update file info only (keep all metadata and assets)
  await db.movies.update(movie.id, {
    file_path: webhook.movie.path,
    file_size: webhook.movie.size,
    updated_at: new Date()
  });

  // Re-analyze streams (may have changed)
  const streams = await ffprobe(webhook.movie.path);
  await updateStreams(movie.id, streams);

  // Copy assets from cache to new location
  await copyAssetsToLibrary(movie.id);

  // Update NFO
  await writeNFO(movie.id);

  // Notify players
  await notifyKodiGroups('library.scan', { movieId: movie.id });

  // Check for playback state
  const playbackState = await db.playback_state.findLatest(movie.id);

  if (playbackState && !playbackState.restored_at) {
    // Wait for library scan to complete (5 seconds)
    await sleep(5000);

    // Resume playback
    await kodi.play(playbackState.media_player_id, {
      file: translatePath(movie.file_path, playbackState.media_player_id),
      resume: {
        position: playbackState.position_seconds,
        percentage: playbackState.position_percentage
      }
    });

    // Mark as restored
    await db.playback_state.update(playbackState.id, {
      restored_at: new Date()
    });

    // Notify user
    await kodi.showNotification(playbackState.media_player_id, {
      title: 'Upgrade Complete',
      message: `${movie.title} upgraded and resumed`,
      image: movie.poster_path
    });
  }
}
```

### Timing

- **Upgrade Duration**: 5-10 seconds
  - Playback capture: <1 second
  - Database update: <1 second
  - FFprobe: 1-2 seconds
  - Asset copy: 1-3 seconds
  - NFO write: <1 second
  - Playback restore: 5 seconds (wait for scan)

## Workflow 3: Manual Library Scan

**Trigger**: User clicks "Scan Library" or scheduled scan runs

**Purpose**: Discover new files, remove deleted files, realign metadata

### Flow Diagram

```
Scan Initiated
    ↓
Create Scan Job (Priority 7 - Low)
    ↓
Read Library Configuration
    ↓
Filesystem Walk
│
├─ For each media file:
│   │
│   ├─ Check Database (by file_path)
│   │   │
│   │   ├─ EXISTS → Compare file_hash
│   │   │   │
│   │   │   ├─ SAME → Skip (no changes)
│   │   │   │
│   │   │   └─ DIFFERENT → File replaced
│   │   │       - Delete old streams
│   │   │       - Re-run FFprobe
│   │   │       - Keep metadata (unless locked)
│   │   │       - Update file_hash
│   │   │
│   │   └─ NOT EXISTS → New file
│   │       - Parse filename (title, year)
│   │       - Create database record
│   │       - Status: unidentified
│   │       - Add to enrichment queue
│   │
│   └─ Check for sidecar files
│       - NFO file → Parse for provider IDs
│       - Subtitle files → Link to movie
│       - Image files → Import to cache
│
└─ Check for deleted files
    - Database records not found in filesystem
    - Set: deleted_at = NOW() + 30 days (soft delete)

Scan Complete
    ↓
Process Unidentified Files
│
├─ Search Provider (TMDB/TVDB)
│   - Query: title + year
│   - Match threshold: 85% confidence
│   │
│   ├─ MATCH FOUND → Update record
│   │   - Set: provider IDs
│   │   - Status: identified
│   │   - Add to enrichment queue (priority 5)
│   │
│   └─ NO MATCH → Manual intervention
│       - Status: unidentified
│       - User notified via UI
│
└─ Process Enrichment Queue
    - Background job processes identified media
    - Lower priority (5) than webhooks (1)
```

### Code Example

```typescript
async function scanLibrary(libraryId: number): Promise<ScanResult> {
  const library = await db.libraries.findById(libraryId);
  const scanJob = await db.scan_jobs.create({
    library_id: libraryId,
    scan_type: 'full',
    status: 'running',
    started_at: new Date()
  });

  const stats = {
    total: 0,
    added: 0,
    updated: 0,
    removed: 0,
    unidentified: 0
  };

  // Walk filesystem
  const files = await walkDirectory(library.path, ['.mkv', '.mp4', '.avi']);
  stats.total = files.length;

  for (const file of files) {
    const fileHash = await calculateHash(file.path);
    const existing = await db.movies.findByPath(file.path);

    if (existing) {
      // Check if file changed
      if (existing.file_hash !== fileHash) {
        await updateMovie(existing.id, file, fileHash);
        stats.updated++;
      }
    } else {
      // New file
      const parsed = parseFilename(file.name);
      const movie = await db.movies.create({
        library_id: libraryId,
        file_path: file.path,
        file_name: file.name,
        file_size: file.size,
        file_hash: fileHash,
        title: parsed.title,
        year: parsed.year,
        identification_status: 'unidentified',
        enrichment_priority: 5
      });

      stats.added++;

      // Try to identify
      const match = await searchTMDB(parsed.title, parsed.year);
      if (match && match.confidence > 0.85) {
        await db.movies.update(movie.id, {
          tmdb_id: match.id,
          imdb_id: match.imdb_id,
          identification_status: 'identified'
        });

        // Add to enrichment queue
        await jobQueue.add({
          type: 'enrichment',
          priority: 5,
          payload: { movieId: movie.id }
        });
      } else {
        stats.unidentified++;
      }
    }
  }

  // Check for deleted files
  const allMovies = await db.movies.findByLibrary(libraryId);
  const filePaths = new Set(files.map(f => f.path));

  for (const movie of allMovies) {
    if (!filePaths.has(movie.file_path) && !movie.deleted_at) {
      await db.movies.update(movie.id, {
        deleted_at: addDays(new Date(), 30)
      });
      stats.removed++;
    }
  }

  // Update scan job
  await db.scan_jobs.update(scanJob.id, {
    status: 'completed',
    completed_at: new Date(),
    total_items: stats.total,
    added_items: stats.added,
    updated_items: stats.updated,
    removed_items: stats.removed
  });

  return stats;
}
```

### Timing

- **Scan Duration**: Depends on library size
  - Small (100 movies): 1-2 minutes
  - Medium (1000 movies): 10-15 minutes
  - Large (5000 movies): 30-60 minutes
- **Per File**: ~1-2 seconds (hash calculation + database lookup)

## Workflow 4: Manual Asset Replacement

**Trigger**: User uploads custom asset or selects different provider image

**Purpose**: Override automated asset selection with user preference

### Flow Diagram

```
User Action: "Replace Poster"
    ↓
┌─────────────────────┐
│ UPLOAD LOCAL FILE   │
│ or                  │
│ SELECT FROM PROVIDER│
└─────────────────────┘
    ↓
IF UPLOAD:
│
├─ Validate Image
│   - Check: file type (jpg, png)
│   - Check: dimensions (min 1000x1500)
│   - Check: file size (max 10MB)
│
├─ Process Image
│   - Calculate: SHA256 hash
│   - Calculate: perceptual hash
│   - Check: Duplicate in cache (by hash)
│
├─ Store in Cache
│   - Path: /cache/assets/{ab}/{cd}/{hash}.jpg
│   - Create: cache_assets record
│   - Source: 'user'
│
└─ Link to Movie
    - Update: movie.poster_id
    - Set: movie.poster_locked = true
    - Create: asset_references record

IF PROVIDER:
│
├─ Download from URL
│   - Process same as upload
│   - Source: 'provider'
│
└─ Link to Movie (same as above)

Copy to Library
    ↓
Update NFO
    ↓
Set Field Lock
- poster_locked = true
- Prevents future automation from changing
    ↓
Notify Media Players
    ↓
Activity Log
- Event: 'asset.replaced'
- Description: "User replaced poster for {title}"
```

### Code Example

```typescript
async function replaceAsset(
  movieId: number,
  assetType: string,
  source: 'upload' | 'provider',
  data: Buffer | string
): Promise<void> {
  let imageBuffer: Buffer;

  if (source === 'upload') {
    imageBuffer = data as Buffer;
  } else {
    // Download from provider URL
    imageBuffer = await downloadImage(data as string);
  }

  // Validate
  const metadata = await sharp(imageBuffer).metadata();
  if (metadata.width < 1000 || metadata.height < 1500) {
    throw new Error('Image too small (min 1000x1500)');
  }

  // Calculate hashes
  const contentHash = crypto.createHash('sha256').update(imageBuffer).digest('hex');
  const perceptualHash = await calculatePerceptualHash(imageBuffer);

  // Check for duplicate
  let cacheAsset = await db.cache_assets.findByHash(contentHash);

  if (!cacheAsset) {
    // Store in cache
    const cachePath = `/cache/assets/${contentHash.slice(0, 2)}/${contentHash.slice(2, 4)}/${contentHash}.jpg`;
    await fs.writeFile(cachePath, imageBuffer);

    cacheAsset = await db.cache_assets.create({
      content_hash: contentHash,
      file_path: cachePath,
      file_size: imageBuffer.length,
      mime_type: `image/${metadata.format}`,
      width: metadata.width,
      height: metadata.height,
      perceptual_hash: perceptualHash,
      source_type: source === 'upload' ? 'user' : 'provider',
      reference_count: 0
    });
  }

  // Get movie
  const movie = await db.movies.findById(movieId);

  // Decrement old asset reference count
  if (movie.poster_id) {
    await decrementAssetReference(movie.poster_id);
  }

  // Update movie
  await db.movies.update(movieId, {
    poster_id: cacheAsset.id,
    poster_locked: true
  });

  // Increment new asset reference count
  await incrementAssetReference(cacheAsset.id);

  // Create asset reference
  await db.asset_references.create({
    cache_asset_id: cacheAsset.id,
    entity_type: 'movie',
    entity_id: movieId,
    asset_type: assetType
  });

  // Copy to library
  await copyAssetToLibrary(movieId, assetType, cacheAsset.file_path);

  // Update NFO
  await writeNFO(movieId);

  // Notify players
  await notifyKodiGroups('library.scan', { movieId });

  // Log activity
  await db.activity_log.create({
    event_type: 'asset.replaced',
    severity: 'info',
    entity_type: 'movie',
    entity_id: movieId,
    description: `User replaced ${assetType} for ${movie.title}`
  });
}
```

### Timing

- **Upload**: 2-5 seconds
  - Image processing: 1-2 seconds
  - Cache storage: <1 second
  - Database updates: <1 second
  - Library copy: <1 second
  - NFO write: <1 second

## Workflow 5: Delete Webhook (Trash Day)

**Trigger**: Radarr sends "MovieDelete" webhook

**Purpose**: Soft delete with 30-day recovery period

### Flow Diagram

```
MovieDelete Webhook
    ↓
Find Movie Record (by provider ID)
    ↓
Soft Delete
- Set: deleted_at = NOW() + 30 days
- Status: Visible in "Trash" UI
    ↓
User Has 30 Days to:
│
├─ RESTORE → Clear deleted_at
│   - Movie returns to library
│   - All assets intact
│   - No re-download needed
│
└─ DO NOTHING → Auto-delete after 30 days

Scheduled Job (Daily):
│
└─ Find Expired Records
    - Query: deleted_at < NOW()
    │
    └─ For each expired movie:
        │
        ├─ Delete database record
        │   - Cascade: all relationships
        │   - Cascade: stream details
        │   - Cascade: asset references
        │
        ├─ Decrement cache reference counts
        │   - For each linked asset
        │   - If ref_count = 0 → mark orphaned
        │
        └─ Delete library files (NFO, assets)

Cache Cleanup (Weekly):
│
└─ Find orphaned assets
    - Query: reference_count = 0 AND created_at < NOW() - 90 days
    │
    └─ Delete physical files
        - Remove from /cache/assets/
        - Delete cache_assets record
```

### Code Example

```typescript
async function handleMovieDeleteWebhook(webhook: WebhookPayload): Promise<void> {
  const movie = await db.movies.findByTmdbId(webhook.movie.tmdbId);

  if (!movie) {
    return; // Already deleted
  }

  // Soft delete (30-day grace period)
  await db.movies.update(movie.id, {
    deleted_at: addDays(new Date(), 30)
  });

  await db.activity_log.create({
    event_type: 'movie.deleted',
    severity: 'warning',
    entity_type: 'movie',
    entity_id: movie.id,
    description: `Movie soft-deleted via webhook: ${movie.title}. Recoverable for 30 days.`,
    metadata: JSON.stringify(webhook)
  });
}

async function restoreMovie(movieId: number): Promise<void> {
  const movie = await db.movies.findById(movieId);

  if (!movie.deleted_at) {
    throw new Error('Movie is not deleted');
  }

  // Restore
  await db.movies.update(movieId, {
    deleted_at: null
  });

  await db.activity_log.create({
    event_type: 'movie.restored',
    severity: 'success',
    entity_type: 'movie',
    entity_id: movieId,
    description: `Movie restored from trash: ${movie.title}`
  });
}

// Scheduled job (runs daily)
async function permanentlyDeleteExpired(): Promise<void> {
  const expired = await db.movies.findExpired();

  for (const movie of expired) {
    // Get all linked assets before deletion
    const assets = await db.asset_references.findByEntity('movie', movie.id);

    // Delete movie (cascades to all relationships)
    await db.movies.delete(movie.id);

    // Decrement asset reference counts
    for (const asset of assets) {
      await decrementAssetReference(asset.cache_asset_id);
    }

    // Delete library files
    await deleteLibraryFiles(movie.file_path);

    await db.activity_log.create({
      event_type: 'movie.permanently_deleted',
      severity: 'warning',
      entity_type: 'movie',
      entity_id: movie.id,
      description: `Movie permanently deleted after grace period: ${movie.title}`
    });
  }
}

// Scheduled job (runs weekly)
async function cleanupOrphanedAssets(): Promise<void> {
  const orphaned = await db.cache_assets.find({
    reference_count: 0,
    created_at: { $lt: subDays(new Date(), 90) }
  });

  for (const asset of orphaned) {
    // Delete physical file
    await fs.unlink(asset.file_path);

    // Delete database record
    await db.cache_assets.delete(asset.id);
  }

  await db.activity_log.create({
    event_type: 'cache.cleanup',
    severity: 'info',
    description: `Cleaned up ${orphaned.length} orphaned assets`
  });
}
```

## Workflow 6: Unidentified Media

**Trigger**: Library scan finds file that can't be automatically matched

**Purpose**: User intervention to identify media

### Flow Diagram

```
Scan Finds Unknown File
    ↓
Parse Filename
- Extract: title, year (best guess)
- Status: unidentified
    ↓
Search Provider (Auto-attempt)
- Query: TMDB with title + year
- Confidence threshold: 85%
    ↓
┌────────────────┐
│ MATCH < 85%    │
└────────────────┘
    ↓
User Notification
- UI: "Unidentified Media" badge
- List: All unidentified files
    ↓
User Actions:
│
├─ 1. SEARCH MANUALLY
│   - User enters: title, year
│   - UI shows: provider results
│   - User selects: correct match
│   - Update: provider IDs
│   - Status: identified
│   - Trigger: Workflow 1 (enrichment)
│
├─ 2. ENTER METADATA MANUALLY
│   - User fills form: title, plot, cast, etc.
│   - Upload: custom assets
│   - Status: enriched
│   - Lock: all fields (prevent automation)
│
└─ 3. IGNORE
    - Mark: identification_status = 'ignored'
    - Hide from UI
    - Skip in future scans
```

### Code Example

```typescript
async function identifyMovie(movieId: number, tmdbId: number): Promise<void> {
  const movie = await db.movies.findById(movieId);

  // Update with provider ID
  await db.movies.update(movieId, {
    tmdb_id: tmdbId,
    identification_status: 'identified',
    enrichment_priority: 2 // High priority (user action)
  });

  // Add to enrichment queue
  await jobQueue.add({
    type: 'enrichment',
    priority: 2,
    payload: { movieId }
  });

  await db.activity_log.create({
    event_type: 'movie.identified',
    severity: 'success',
    entity_type: 'movie',
    entity_id: movieId,
    description: `User identified movie: ${movie.title} → TMDB ${tmdbId}`
  });
}

async function manuallyEnrichMovie(
  movieId: number,
  metadata: ManualMetadata
): Promise<void> {
  // Update all fields
  await db.movies.update(movieId, {
    ...metadata,
    identification_status: 'enriched',

    // Lock all manually entered fields
    title_locked: true,
    plot_locked: true,
    year_locked: true,
    // ... lock all provided fields
  });

  // Handle manual cast/crew
  if (metadata.actors) {
    for (const actorName of metadata.actors) {
      const actor = await db.actors.findOrCreate(actorName);
      await db.movie_actors.create({
        movie_id: movieId,
        actor_id: actor.id
      });
    }

    await db.movies.update(movieId, { actors_locked: true });
  }

  // Handle manual assets
  if (metadata.customAssets) {
    for (const [type, file] of Object.entries(metadata.customAssets)) {
      await replaceAsset(movieId, type, 'upload', file);
    }
  }

  await db.activity_log.create({
    event_type: 'movie.manually_enriched',
    severity: 'success',
    entity_type: 'movie',
    entity_id: movieId,
    description: `User manually enriched movie with custom metadata`
  });
}
```

## Supporting Processes

### Job Queue Processing

```typescript
class JobQueue {
  async process(): Promise<void> {
    while (true) {
      // Get next job (priority order)
      const job = await db.job_queue.findNext();

      if (!job) {
        await sleep(1000);
        continue;
      }

      // Mark as running
      await db.job_queue.update(job.id, {
        status: 'running',
        started_at: new Date()
      });

      try {
        // Route to handler
        switch (job.job_type) {
          case 'webhook':
            await processWebhookJob(job);
            break;
          case 'enrichment':
            await processEnrichmentJob(job);
            break;
          case 'scan':
            await processScanJob(job);
            break;
        }

        // Mark complete
        await db.job_queue.update(job.id, {
          status: 'completed',
          completed_at: new Date()
        });

      } catch (error) {
        // Handle failure
        if (job.retry_count < job.max_retries) {
          await db.job_queue.update(job.id, {
            status: 'pending',
            retry_count: job.retry_count + 1,
            next_retry_at: addMinutes(new Date(), 5),
            error_message: error.message
          });
        } else {
          await db.job_queue.update(job.id, {
            status: 'failed',
            error_message: error.message,
            completed_at: new Date()
          });
        }
      }
    }
  }
}
```

### Path Translation

```typescript
async function translatePath(
  metarrPath: string,
  mediaPlayerGroupId: number
): Promise<string> {
  const mappings = await db.path_mappings.findByGroup(mediaPlayerGroupId);

  for (const mapping of mappings) {
    if (metarrPath.startsWith(mapping.metarr_path)) {
      return metarrPath.replace(mapping.metarr_path, mapping.player_path);
    }
  }

  throw new Error(`No path mapping found for: ${metarrPath}`);
}
```

### Asset Reference Counting

```typescript
async function incrementAssetReference(cacheAssetId: number): Promise<void> {
  await db.cache_assets.update(cacheAssetId, {
    reference_count: sql`reference_count + 1`,
    last_accessed_at: new Date()
  });
}

async function decrementAssetReference(cacheAssetId: number): Promise<void> {
  const asset = await db.cache_assets.findById(cacheAssetId);

  if (asset.reference_count <= 1) {
    // Mark as orphaned
    await db.cache_assets.update(cacheAssetId, {
      reference_count: 0
    });
  } else {
    await db.cache_assets.update(cacheAssetId, {
      reference_count: sql`reference_count - 1`
    });
  }
}
```

## Error Handling

### Provider API Failures

```typescript
async function enrichMovie(movieId: number): Promise<void> {
  try {
    const movie = await db.movies.findById(movieId);
    const metadata = await tmdb.getMovie(movie.tmdb_id);

    // Process metadata...

  } catch (error) {
    if (error instanceof RateLimitError) {
      // Retry later
      throw new RetryableError('Rate limit exceeded', 300); // 5 min
    } else if (error instanceof NetworkError) {
      // Retry soon
      throw new RetryableError('Network error', 60); // 1 min
    } else {
      // Fatal error
      await db.movies.update(movieId, {
        identification_status: 'error'
      });
      throw error;
    }
  }
}
```

### Asset Download Failures

```typescript
async function downloadAsset(url: string): Promise<Buffer> {
  const maxRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, { timeout: 30000 });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.buffer();

    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }

      await sleep(attempt * 1000); // Exponential backoff
    }
  }
}
```

## Related Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) - Overall system design
- [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) - Complete schema reference
- [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md) - Phased development plan
