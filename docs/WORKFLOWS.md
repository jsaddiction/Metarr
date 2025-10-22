# Workflows

## Overview

Metarr operates through 6 core workflows that handle all media processing scenarios. These workflows are designed for efficiency and automation while preserving user control.

**Core Principle**: "Automate Everything, Override Anything"
- 95% webhook automation
- 5% manual fixes when needed
- Field locking preserves user edits

---

## Implementation Status

- ✅ **[Implemented]** - Webhook receiver infrastructure
- ✅ **[Implemented]** - Job queue processing
- ✅ **[Implemented]** - Database schema for all workflows
- 📋 **[Planned]** - Workflow 1: New media webhook processing
- 📋 **[Planned]** - Workflow 2: Upgrade handling with playback state
- 📋 **[Planned]** - Workflow 3A: Library scan (discovery & import)
- 📋 **[Planned]** - Workflow 3B: Media item rescan (verification & reconciliation)
- 📋 **[Planned]** - Workflow 4: Manual asset replacement
- 📋 **[Planned]** - Workflow 5: Delete webhook (trash day)
- 📋 **[Planned]** - Workflow 6: Unidentified media identification

---

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

## Workflow 3A: Library Scan (Discovery & Import)

**Trigger**: User clicks "Scan Library", scheduled library-wide scan

**Purpose**: Discover files in filesystem, import to cache, create database records

**Flow**: Filesystem → Database → Cache

### Flow Diagram

```
Scan Initiated (Library-Wide)
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
│   │   ├─ NOT EXISTS → New file
│   │   │   - Create database record
│   │   │   - Parse NFO (if present)
│   │   │   - Extract FFprobe streams
│   │   │   - Discover assets → Copy to cache
│   │   │   - Status: identified or unidentified
│   │   │
│   │   └─ EXISTS → Skip (already in database)
│   │       - Note: Use Workflow 3B (Rescan) to verify
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

**Key Principle**: Library Scan is about **discovery** - finding what's on disk and importing it.

---

## Workflow 3B: Media Item Rescan (Verification & Reconciliation)

**Trigger**: User clicks refresh icon on movie, per-item verification

**Purpose**: Verify library matches cache, remove unauthorized files, trigger workflow chain

**Flow**: Cache → Library (verify alignment)

**Core Principle**: Cache is source of truth. Library must mirror cache selection exactly.

### Flow Diagram

```
Rescan Single Movie
    ↓
Query Database for Movie Record
    ↓
Get Cache Asset Selection (all cache_*_files for this movie)
    ↓
Get Library File Tracking (all library_*_files for this movie)
    ↓
PHASE 1: Video File Verification
│
├─ Compare file hash (library vs cache)
│   ├─ Hash Match → OK
│   └─ Hash Mismatch → Video replaced/modified
│       ├─ Re-extract FFprobe streams
│       ├─ Update cache file hash
│       └─ Queue re-enrichment (if configured)
│
PHASE 2: Asset Verification
│
├─ For each selected cache asset:
│   ├─ Check if published to library
│   │   ├─ Published → Verify hash match
│   │   │   ├─ Match → OK
│   │   │   └─ Mismatch → Library file corrupted
│   │   │       └─ Re-publish from cache
│   │   │
│   │   └─ Not Published → Missing from library
│   │       └─ Publish cache asset to library
│
PHASE 3: Unknown Files Verification
│
├─ For each unknown file record:
│   ├─ Check if file still exists
│   ├─ Verify hash matches record
│   └─ Update or remove record as needed
│
PHASE 4: Extra Files Cleanup
│
├─ Scan library directory for all files
├─ Build expected files set:
│   ├─ Main video file
│   ├─ Published cache assets
│   ├─ Unknown files (tracked)
│   └─ Ignored files (matching ignore patterns)
│
└─ For each file in directory:
    ├─ In expected set? → OK
    └─ NOT in expected set? → REMOVE (unauthorized)

PHASE 5: Workflow Chain (if configured)
│
├─ Re-enrichment (if auto_enrich_on_rescan)
├─ Re-publishing (if auto_publish_on_rescan)
└─ Player Notification (if changes detected)
    - Only notify if directory actually changed
    - Show notification: "Movie has been refreshed"
```

**Key Principle**: Rescan is about **verification** - ensuring library matches cache ideal state.

### Configuration Options

Rescan behavior is controlled by workflow settings:

```
auto_enrich_on_rescan: false      # Avoid unnecessary API calls
auto_publish_on_rescan: true      # Ensure library matches cache
cleanup_unauthorized_files: true  # Remove files not in cache/unknown
notify_player_on_rescan: true     # Tell player to refresh
notify_player_only_if_changed: true  # Skip notification if nothing changed
```

### Timing

- **Library Scan**: Depends on library size
  - Small (100 movies): 1-2 minutes
  - Medium (1000 movies): 10-15 minutes
  - Large (5000 movies): 30-60 minutes
- **Media Item Rescan**: 2-5 seconds per movie
  - Hash verification: <1 second
  - Asset verification: 1-2 seconds
  - Cleanup: <1 second
  - Workflow trigger: 1-2 seconds (if configured)

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

  // Generate UUID for filename
  const uuid = crypto.randomUUID();

  // Calculate hashes
  const sha256Hash = crypto.createHash('sha256').update(imageBuffer).digest('hex');
  const perceptualHash = await calculatePerceptualHash(imageBuffer);

  // Check for visual duplicate (by perceptual hash)
  const existingImages = await db.query(`
    SELECT * FROM cache_image_files
    WHERE entity_type = 'movie' AND entity_id = ? AND image_type = ?
  `, [movieId, assetType]);

  for (const existing of existingImages) {
    const similarity = comparePerceptualHashes(perceptualHash, existing.perceptual_hash);
    if (similarity >= 0.90) {
      throw new Error('Visually identical image already exists');
    }
  }

  // Store in cache with UUID naming
  const cachePath = `/data/cache/images/movie/${movieId}/${uuid}.jpg`;
  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  await fs.writeFile(cachePath, imageBuffer);

  // Create cache record
  const cacheResult = await db.execute(`
    INSERT INTO cache_image_files (
      entity_type, entity_id, file_path, file_name, file_size,
      file_hash, perceptual_hash, image_type, width, height, format,
      source_type, is_locked
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `, ['movie', movieId, cachePath, `${uuid}.jpg`, imageBuffer.length,
      sha256Hash, perceptualHash, assetType, metadata.width, metadata.height,
      metadata.format, source === 'upload' ? 'user' : 'provider']);

  const cacheFileId = cacheResult.insertId;

  // Get movie
  const movie = await db.movies.findById(movieId);

  // Update movie FK column (e.g., poster_id)
  await db.movies.update(movieId, {
    [`${assetType}_id`]: cacheFileId,
    [`${assetType}_locked`]: true
  });

  // Copy to library (publish)
  const libraryPath = await copyAssetToLibrary(movieId, assetType, cachePath);

  // Create library record
  await db.execute(`
    INSERT INTO library_image_files (cache_file_id, file_path)
    VALUES (?, ?)
    ON CONFLICT(file_path) DO UPDATE SET cache_file_id = excluded.cache_file_id
  `, [cacheFileId, libraryPath]);

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

## Workflow 5: Recycle Bin System

**Trigger**: Entity deletion (UI/webhook), unauthorized files during rescan

**Purpose**: Temporary storage for deleted files with configurable retention period

**Core Principle**: Cache files are recycled, library files are immediately deleted

### Recycle Bin Architecture

**Storage:**
```
data/recycle/              # Flat directory (no subdirectories)
  ├─ a1b2c3d4-uuid.jpg    # UUID naming prevents conflicts
  ├─ e5f6g7h8-uuid.mkv    # Extension preserved for type identification
  └─ i9j0k1l2-uuid.srt
```

**Database:**
```sql
CREATE TABLE recycle_bin (
  id INTEGER PRIMARY KEY,
  uuid TEXT UNIQUE NOT NULL,              -- UUID for recycled file
  original_path TEXT NOT NULL,            -- Where it came from
  original_filename TEXT NOT NULL,        -- Display name
  recycle_path TEXT NOT NULL,             -- data/recycle/{uuid}.ext
  file_size INTEGER NOT NULL,
  file_hash TEXT,                         -- SHA256 for verification

  entity_type TEXT,                       -- 'movie', 'episode', 'album', NULL
  entity_id INTEGER,                      -- FK to parent entity

  item_type TEXT NOT NULL,                -- 'image', 'video', 'text', 'audio', 'unknown'
  deletion_reason TEXT NOT NULL,          -- 'entity_deleted', 'unauthorized', etc.
  deleted_by TEXT NOT NULL,               -- 'system', 'user', 'webhook'

  deleted_at DATETIME DEFAULT CURRENT_TIMESTAMP  -- Used to calculate expiry
);
```

**Note**: No `restored_at`, `restored_to`, or `metadata` fields. Record is **deleted on successful restore**.

### Flow Diagram

```
Movie Deleted (User or Webhook)
    ↓
1. Set movies.deleted_at = NOW() (soft delete entity)
    ↓
2. Find All Cache Files for Movie
    ├─ cache_image_files (posters, fanart, etc.)
    ├─ cache_video_files (trailers)
    ├─ cache_text_files (NFO, subtitles)
    └─ cache_audio_files
    ↓
3. For Each Cache File:
    ├─ Generate UUID
    ├─ Move to data/recycle/{uuid}.ext
    ├─ Create recycle_bin record
    └─ Delete cache_*_files record
    ↓
4. Delete All Library Files Immediately
    ├─ library_image_files → DELETE physical file
    ├─ library_video_files → DELETE physical file
    ├─ library_text_files → DELETE physical file
    └─ Delete library_*_files records
    ↓
COMPLETE: Cache files in recycle bin, library files gone

---

Unauthorized File Found During Rescan
    ↓
Check if File Matches Ignore Pattern
    ├─ YES → Skip (leave in library)
    └─ NO → Proceed
    ↓
Recycle File
    ├─ Generate UUID
    ├─ Move from library to data/recycle/{uuid}.ext
    ├─ Create recycle_bin record (item_type='unknown')
    └─ Log: "Unauthorized file recycled"
    ↓
COMPLETE: File moved to recycle bin

---

User Restores File from Recycle Bin
    ↓
Query recycle_bin Record
    ↓
IF item_type = 'unknown':
    ├─ Move file back to original_path
    ├─ Add original_path to ignore_patterns table (exact path)
    ├─ DELETE recycle_bin record
    └─ Success: File restored and auto-ignored
    ↓
IF item_type = 'image|video|text|audio':
    ├─ Move file back to cache directory (original_path)
    ├─ Recreate cache_*_files record
    ├─ DELETE recycle_bin record
    └─ Success: Cache file restored (can re-publish later)
    ↓
COMPLETE: File restored, recycle_bin record removed

---

Garbage Collection (Daily at 3:00 AM)
    ↓
Query workflow_control_settings.recycle_retention_days (default: 30)
    ↓
Find Expired Items:
  SELECT * FROM recycle_bin
  WHERE deleted_at <= datetime('now', '-' || @retentionDays || ' days')
    ↓
For Each Expired Item:
    ├─ DELETE physical file (data/recycle/{uuid}.ext)
    ├─ DELETE recycle_bin record
    └─ Log: "Permanently deleted expired recycle bin item"
    ↓
COMPLETE: Expired files permanently deleted
```

### Deletion Reasons

| Reason | Description | Source |
|--------|-------------|--------|
| `entity_deleted` | Movie/show was deleted | User or webhook |
| `library_removed` | Library was removed from Metarr | User |
| `unauthorized` | File found in library not tracked in cache | Rescan |
| `user_deleted` | User explicitly deleted this file | User |
| `cache_orphaned` | Cache file with no entity reference | Garbage collection |

### Configuration

**Workflow Settings:**
```
recycle_enabled: true           # Global toggle (when false, immediate permanent delete)
recycle_retention_days: 30      # Days before permanent deletion
```

**Query for Expiry:**
```sql
-- NO expired_at column stored
-- Calculate expiry dynamically based on current retention setting
SELECT * FROM recycle_bin
WHERE deleted_at <= datetime('now', '-' || @retentionDays || ' days')
```

**Why Dynamic Calculation?**
- User changes retention days → Immediately affects ALL files
- Old files respect new policy
- No need to update existing records

### Ignore Patterns Integration

**Restored Unknown Files:**
When user restores an unknown/unauthorized file, it's automatically added to `ignore_patterns`:

```sql
INSERT OR IGNORE INTO ignore_patterns (pattern, scope, description)
VALUES (
  '/movies/Movie/sample.mkv',  -- Exact path (not glob)
  'global',
  'Auto-ignored after restore from recycle bin'
)
```

**Scanner Checks:**
```typescript
// Check exact paths first (fast)
if (pattern.startsWith('/') || pattern.match(/^[A-Z]:\\/)) {
  return filePath === pattern;
}
// Then check glob patterns
return minimatch(filePath, pattern);
```

### UI Components

**Recycle Bin Page (`/system/recycle-bin`):**
- Fuzzy search bar (filename, path, reason)
- Filter by item type, deletion reason
- Table columns: Filename, Original Path, Type, Reason, Deleted, Expires In, Size, Actions
- Actions: Restore + Ignore, Restore Only, Delete Now
- Bulk actions: Restore Selected, Delete Selected, Empty Recycle Bin

**Settings -> Workflow Control:**
- Toggle: Enable Recycle Bin
- Input: Retention Period (days)
- Button: Empty Recycle Bin Now

**Settings -> Ignore Patterns:**
- Fuzzy search bar
- Badge differentiation: 🌐 Glob Pattern vs 📄 Exact Path
- Manage both manually added patterns and auto-ignored restored files

### Key Implementation Notes

1. **Flat Storage**: `data/recycle/` contains all recycled files with UUID naming - no subdirectories
2. **Dynamic Expiry**: Query calculates expiry based on current `recycle_retention_days` setting
3. **Restore = Delete Record**: Upon successful restore, `recycle_bin` record is deleted (not marked restored)
4. **Library Files Deleted Immediately**: Only cache files are recycled, library copies are permanently deleted
5. **Unknown Files Auto-Ignored**: Restored unknown files automatically added to `ignore_patterns` as exact paths
6. **Graceful Failure**: If library directory already deleted by *arr apps, log warning and continue with cache recycling

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

**Note**: Current implementation uses foreign key tracking via `library_*_files.cache_file_id`.
Reference counting for garbage collection is [Planned].

```typescript
// Current approach: Find orphaned cache files via LEFT JOIN
async function findOrphanedCacheFiles(): Promise<CacheImageFile[]> {
  return await db.query(`
    SELECT cif.*
    FROM cache_image_files cif
    LEFT JOIN library_image_files lif ON lif.cache_file_id = cif.id
    WHERE lif.id IS NULL
      AND cif.discovered_at < datetime('now', '-90 days')
      AND cif.is_locked = 0
  `);
}

// Planned: Reference counting column for faster queries
async function incrementAssetReference(cacheFileId: number): Promise<void> {
  await db.execute(`
    UPDATE cache_image_files
    SET last_verified_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [cacheFileId]);
}

async function decrementAssetReference(cacheFileId: number): Promise<void> {
  // No-op in current implementation (handled by foreign key CASCADE)
  // Planned: Decrement reference_count column when implemented
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
