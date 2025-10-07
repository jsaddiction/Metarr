# Core Application Workflows

This document details the primary workflows and operational sequences in Metarr.

---

## Three Scan Initiation Methods

Metarr supports three distinct methods to initiate a scan on media directories. Each has different contexts and lookup strategies.

### 1. Webhook-Initiated Scan (Critical Priority)

**Trigger**: Radarr/Sonarr/Lidarr sends webhook when download completes

**Context Available**:
- ✅ TMDB ID (from webhook payload)
- ✅ IMDB ID (from webhook payload)
- ✅ File path (from webhook payload)
- ✅ Movie metadata (title, year, quality, etc.)

**Database Lookup Strategy**:
1. Search by `tmdb_id` (authoritative identifier)
2. If found AND path changed → Update `file_path`
3. If not found → Create new movie record
4. Clear `deleted_on` if previously marked for deletion

**Priority**: **Critical** - Pauses scheduled library scans if running

**Use Case**: Real-time processing of newly downloaded media

See [WEBHOOKS.md](WEBHOOKS.md) for complete webhook documentation.

---

### 2. User-Initiated Refresh (High Priority)

**Trigger**: User clicks "Refresh" button on movie details page

**Context Available**:
- ✅ Movie ID (database record)
- ✅ TMDB ID (from existing record)
- ✅ Old file path (from existing record)
- ❌ No external metadata

**Database Lookup Strategy**:
1. Load existing record by `id`
2. Check if directory still exists
3. Find video file (path may have changed due to rename)
4. Update `file_path` if changed
5. If directory missing → Mark `deleted_on = NOW() + 7 days`

**Priority**: **High** - Queued after webhooks

**Use Case**: Manual metadata refresh, recover from errors, re-scan after manual edits

---

### 3. Scheduled Library Scan (Normal Priority)

**Trigger**: Periodic scan (e.g., daily at 2 AM) or manual library scan

**Context Available**:
- ✅ Library directory paths only
- ❌ No TMDB ID initially
- ❌ No IMDB ID initially
- ❌ No external metadata

**Database Lookup Strategy**:
1. Discover all movie directories in library
2. Find NFO files and parse for `tmdb_id`
3. If NFO has TMDB ID:
   - Search database by `tmdb_id`
   - If found AND path changed → Update `file_path`
   - If not found → Create new record
4. If no NFO or no TMDB ID:
   - Search database by `file_path`
   - If not found → Create record with `status = 'needs_identification'`
5. Compare directory hash to detect changes
   - Hash match → Skip scan (nothing changed)
   - Hash differs → Run unified scan

**Critical Function**: **Only way to detect deletions** (no delete webhook from Radarr)

After scanning all directories:
- Movies with paths NOT discovered → Set `deleted_on = NOW() + 7 days`
- 7-day grace period before permanent deletion

**Priority**: **Normal** - Can be paused by webhooks

**Use Case**: Discover new media added while Metarr was offline, detect deleted files, verify database accuracy

---

## Database Lookup Priority (All Scan Types)

All scans follow this priority when looking up movies:

```
1. TMDB ID (authoritative)
   ↓
2. File Path (fallback for legacy items)
   ↓
3. Create New (if not found)
```

### Why TMDB ID is Authoritative

- **Files can be renamed/moved** → Path changes
- **TMDB ID never changes** → Stable identifier
- **Webhooks always include TMDB ID** → Reliable source
- **Prevents duplicate entries** → Same movie, different path

### Path Change Detection

When movie found by TMDB ID but path differs:

```typescript
if (movie.tmdb_id === tmdbId && movie.file_path !== newFilePath) {
  logger.info('Path changed', {
    movieId: movie.id,
    oldPath: movie.file_path,
    newPath: newFilePath,
    trigger: 'webhook' // or 'user_refresh' or 'scheduled_scan'
  });

  await db.execute(
    `UPDATE movies SET file_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [newFilePath, movie.id]
  );
}
```

**Result**: Database stays current even when files are renamed or moved.

---

## Webhook Flow - Download Processing

Metarr receives webhooks from download managers (Radarr/Sonarr/Lidarr) for various events. The **Download** webhook is the primary trigger for automated metadata management.

**For complete webhook documentation, see [WEBHOOKS.md](WEBHOOKS.md)**

This section provides workflow overview only.

### Sequence Diagram

```
Radarr/Sonarr                Metarr                          Kodi/Jellyfin
─────────────                ──────                          ─────────────
     │                          │                                  │
     │ 1. "grab" webhook        │                                  │
     ├─────────────────────────>│                                  │
     │    (movie downloading)   │                                  │
     │                          │ Check if playing via WebSocket   │
     │                          ├─────────────────────────────────>│
     │                          │<─────────────────────────────────┤
     │                          │ Send notification if playing     │
     │                          ├─────────────────────────────────>│
     │                          │                                  │
     │ 2. "download" webhook    │                                  │
     ├─────────────────────────>│                                  │
     │    (download complete)   │                                  │
     │                          │ Pause library scan if running    │
     │                          │ Process immediately (highest priority)
     │                          │                                  │
     │                          │ Check if file being played       │
     │                          ├─────────────────────────────────>│
     │                          │<─────────────────────────────────┤
     │                          │ If playing → stop, save position │
     │                          ├─────────────────────────────────>│
     │                          │                                  │
     │                          │ Apply path mapping (manager→Metarr)
     │                          │ Check if exists in DB (by path/tmdbId)
     │                          │ Create/update DB entry           │
     │                          │                                  │
     │                          │ UNIFIED SCAN PROCESS             │
     │                          │ ================================ │
     │                          │ 1. Parse NFO metadata            │
     │                          │    (skip URL elements - see NFO_PARSING.md)
     │                          │                                  │
     │                          │ 2. Scan stream details (FFprobe) │
     │                          │    - Video: codec, resolution, HDR│
     │                          │    - Audio: codec, language, channels
     │                          │    - Subtitles: language, external│
     │                          │    Store in video/audio/subtitle_streams
     │                          │                                  │
     │                          │ 3. Discover image assets         │
     │                          │    - poster.jpg, fanart*.jpg, etc.│
     │                          │    - .actors/*.jpg               │
     │                          │    - Migrate legacy (extrafanart/)│
     │                          │    - Copy to cache (backup)      │
     │                          │    - Calculate pHash             │
     │                          │                                  │
     │                          │ 4. Discover trailer files        │
     │                          │    - {movie}-trailer.mkv         │
     │                          │    - Max ONE trailer per movie   │
     │                          │    Store in trailers table       │
     │                          │                                  │
     │                          │ 5. Discover subtitles            │
     │                          │    - External .srt/.ass files    │
     │                          │    Store in subtitle_streams     │
     │                          │                                  │
     │                          │ 6. Detect unknown files          │
     │                          │    - Files not matching patterns │
     │                          │    Store in unknown_files table  │
     │                          │                                  │
     │                          │ 7. Atomic database update        │
     │                          │    - All metadata committed together│
     │                          │                                  │
     │                          │ 8. Enrich from providers (optional)│
     │                          │    (TMDB, TVDB - only unlocked fields)
     │                          │                                  │
     │                          │ Generate/update NFO file         │
     │                          │ Include streamdetails from DB    │
     │                          │ Calculate NFO hash, store in DB  │
     │                          │                                  │
     │                          │ Copy images from cache to library│
     │                          │                                  │
     │                          │ Apply path mapping (Metarr→player)
     │                          │ Trigger library scan             │
     │                          ├─────────────────────────────────>│
     │                          │<─────────────────────────────────┤
     │                          │ (Kodi scans, caches images)      │
     │                          │                                  │
     │                          │ If playback was stopped →        │
     │                          │   Resume at saved position       │
     │                          ├─────────────────────────────────>│
     │                          │                                  │
     │                          │ Resume library scan if paused    │
     │                          │                                  │
```

### Detailed Steps

#### Step 1: "Grab" Event (Download Started)
1. Receive webhook with `Radarr_EventType: grab`
2. Extract `tmdbId`, `imdbId`, and `path` from payload
3. Apply media manager path mapping (if configured)
4. Check all connected Kodi players via WebSocket
5. If movie is currently playing:
   - Send Kodi notification: "Upgrade downloading for [Movie Title]"
   - Record playback state (for later interruption)
6. No other action (download not complete yet)

#### Step 2: "Download" Event (Download Complete)
1. Receive webhook with `eventType: Download`
2. **Immediately process** (pause library scan if running - critical priority)
3. Check `isUpgrade` flag:
   - If `true` → Check for active playback, stop if needed, save position
4. Apply media manager path mapping to webhook path (Radarr path → Metarr path)
5. **Database Lookup** (TMDB ID first):
   - Search by `tmdb_id` (from webhook - authoritative)
   - If found AND path changed → Update `file_path`
   - If found AND `deleted_on` set → Clear deletion flag (file restored)
   - If not found → Create new movie record with webhook metadata
6. Run unified scan workflow (see Unified Scan Process below)

#### Step 3: Metadata Enrichment
1. Check `status` (skip if already 'enriching')
2. Set `status = 'enriching'`
3. For each provider (TMDB, TVDB):
   - Check rate limits, wait if necessary (1-second window)
   - Fetch metadata (append_to_response for batching)
   - **Merge only unlocked fields** (check `plot_locked`, `poster_locked`, etc.)
   - Skip locked fields entirely (preserve user edits)
4. Download images:
   - Check completeness requirements (e.g., "3 fanarts required")
   - Filter already-locked images
   - Download candidates to temp directory
   - Calculate perceptual hashes
   - Select top N by vote_average + resolution + uniqueness (90% similarity threshold)
   - Move selected to cache directory
   - Store URLs, hashes, dimensions in `images` table
5. Set `status = null` (or error state if failed)

#### Step 4: Stream Details Scanning (FFprobe)
1. Locate video file using `file_path` from database
2. Execute FFprobe to extract stream information:
   - Video stream (codec, resolution, bitrate, HDR, framerate, aspect ratio)
   - Audio streams (codec, language, channels, bitrate, defaults)
   - Subtitle streams (language, codec, defaults)
3. Scan for external subtitle files (.srt, .ass, .sub) in same directory
4. Update database tables:
   - Delete existing streams for this entity
   - Insert video stream into `video_streams` table
   - Insert audio streams into `audio_streams` table
   - Insert subtitle streams (embedded + external) into `subtitle_streams` table
5. Store `duration_seconds` (authoritative runtime)
6. See `@docs/STREAM_DETAILS.md` for complete details

#### Step 5: NFO Generation
1. Build complete NFO XML from database state
2. Include all metadata (scalar fields + arrays)
3. Include image URLs from `images` table
4. **Generate `<fileinfo><streamdetails>` section from database** (video_streams, audio_streams, subtitle_streams)
5. Write NFO to library directory (e.g., `movie.nfo`)
6. Calculate hash of NFO content (SHA256)
7. Store hash in `movies.nfo_hash` column

**Note:** NFO `<streamdetails>` is **write-only** - never parsed on import, always generated from FFprobe data.

#### Step 6: Image Deployment
1. For each image in `images` table (for this movie):
   - Copy from cache to library directory
   - Use Kodi naming conventions (poster.jpg, fanart.jpg, fanart1.jpg, etc.)
   - If cache file missing → re-download from provider URL

#### Step 7: Media Player Update
1. For each configured media player:
   - Apply path mapping (Metarr library path → player path)
   - If Kodi:
     - Trigger scan on specific directory (mapped path)
     - If metadata-only update → scan fake directory `/doesNotExist` to force skin refresh
   - If Kodi Shared Group:
     - Pick one member to trigger scan (all share same database)
   - If Jellyfin/Plex:
     - Trigger library scan via REST API

#### Step 8: Playback Resumption (If Upgrade)
1. If playback was stopped during upgrade:
   - Wait for Kodi scan to complete (listen for `VideoLibrary.OnScanFinished` via WebSocket)
   - Check user setting: "Auto-resume after upgrade" (default: true)
   - If enabled → Resume playback at saved position (per player)
   - Send notification: "Playback resuming..."

---

## Library Scan Flow

Manual or scheduled library scans discover new media, parse NFO files, and populate the database.

### Sequence Diagram

```
User/Scheduler          Metarr                    Filesystem            Database
─────────────          ──────                    ──────────            ────────
     │                    │                            │                   │
     │ Trigger scan       │                            │                   │
     ├───────────────────>│                            │                   │
     │                    │ Set scan_job status='running'                  │
     │                    ├──────────────────────────────────────────────>│
     │                    │                            │                   │
     │                    │ Discover directories       │                   │
     │                    ├───────────────────────────>│                   │
     │                    │<───────────────────────────┤                   │
     │                    │ (list of movie directories)│                   │
     │                    │                            │                   │
     │                    │ For each directory:        │                   │
     │                    │   Search for NFO files     │                   │
     │                    ├───────────────────────────>│                   │
     │                    │<───────────────────────────┤                   │
     │                    │                            │                   │
     │                    │   Read NFO content         │                   │
     │                    ├───────────────────────────>│                   │
     │                    │<───────────────────────────┤                   │
     │                    │                            │                   │
     │                    │   Calculate NFO hash       │                   │
     │                    │   Lookup by path in DB     │                   │
     │                    ├──────────────────────────────────────────────>│
     │                    │<──────────────────────────────────────────────┤
     │                    │                            │                   │
     │                    │   If new → Unified scan, insert DB            │
     │                    │   If exists → Compare hash │                   │
     │                    │     If hash match → skip   │                   │
     │                    │     If hash differ → unified scan + merge     │
     │                    │       (preserve locked fields)                │
     │                    │                            │                   │
     │                    │   UNIFIED SCAN:            │                   │
     │                    │   - Parse NFO              │                   │
     │                    │   - FFprobe stream details │                   │
     │                    │   - Discover images (cache backup)            │
     │                    │   - Discover trailers      │                   │
     │                    │   - Discover subtitles     │                   │
     │                    │   - Detect unknown files   │                   │
     │                    │   - Atomic DB commit       │
     │                    │                            │                   │
     │                    │   Emit SSE progress event  │                   │
     │                    ├──────────────────────────────────────────────>│
     │                    │                            │                   │
     │                    │ Remove deleted directories │                   │
     │                    │   (DB entries for missing paths)              │
     │                    ├──────────────────────────────────────────────>│
     │                    │                            │                   │
     │                    │ Orphan cleanup (unused entities)              │
     │                    ├──────────────────────────────────────────────>│
     │                    │                            │                   │
     │                    │ Set scan_job status='completed'               │
     │                    ├──────────────────────────────────────────────>│
     │                    │                            │                   │
     │                    │ Emit SSE scanCompleted     │                   │
     │                    │                            │                   │
```

### Detailed Steps

#### Step 1: Directory Discovery
1. For each library configured in `libraries` table:
   - If `enabled = false` → skip
   - Read `path` column (e.g., `/data/movies`)
   - List subdirectories (each subdirectory = one movie)
   - Store discovered paths in temp list

#### Step 2: NFO Processing (Per Directory)
1. Search for NFO files:
   - Priority 1: `movie.nfo`
   - Priority 2: `{directory_name}.nfo` (e.g., `The Matrix (1999).nfo`)
   - If none found → Set `status = 'needs_identification'`, skip to next
2. Read NFO content (UTF-8)
3. Calculate NFO hash: `SHA256(nfo_content)`
4. Check if movie exists in DB by `file_path`
5. If exists → Compare `nfo_hash` from DB with calculated hash:
   - **If hashes match** → NFO unchanged, skip parsing entirely (no updates needed)
   - **If hashes differ** → Continue to step 6
6. If new movie OR hash differs:
   - Detect format (XML vs URL):
     - If XML → Parse with XML parser
     - If URL → Extract provider IDs from URLs
   - Extract metadata (see NFO_PARSING.md for details)

#### Step 3: Database Lookup
1. Query database by `file_path`:
   ```sql
   SELECT * FROM movies WHERE file_path = ?
   ```
2. If **not found** (new movie):
   - Insert new row with parsed metadata
   - Set `status = null` (will be picked up by scheduled enrichment if incomplete)
   - Set `nfo_hash = calculated_hash`
   - Insert link table entries (actors, genres, directors, etc.)
   - Emit SSE progress: `{ type: 'scanProgress', added: 1 }`

3. If **found** (existing movie) and hash differs:
   - Proceed to intelligent merge (Step 4)

#### Step 4: Intelligent Merge (NFO Changed)
1. Parse new NFO data (**Note:** `<fileinfo><streamdetails>` is skipped)
2. For each scalar field (plot, tagline, year, etc.):
   - If field is **locked** (e.g., `plot_locked = 1`):
     - **Keep database value** (ignore NFO changes)
   - If field is **unlocked** (e.g., `plot_locked = 0`):
     - **Update from NFO** (accept external changes)
3. For array fields (actors, genres, directors):
   - If unlocked → Clear existing links, insert new links from NFO
   - If locked → Keep existing links (ignore NFO changes)
4. For images:
   - If unlocked → Update URLs from NFO
   - If locked → Keep existing image references
5. Update `nfo_hash` with new hash
6. Update `updated_at` timestamp
7. Emit SSE progress: `{ type: 'scanProgress', updated: 1 }`

#### Step 4b: Stream Details Scanning (FFprobe)
1. Locate video file in directory (scan for .mkv, .mp4, .avi, etc.)
2. If file found:
   - Execute FFprobe (with timeout: 30 seconds)
   - Parse JSON output for video/audio/subtitle streams
   - Scan for external subtitle files (.srt, .ass, .sub)
   - Update database tables:
     - `video_streams` (upsert by entity_type + entity_id)
     - `audio_streams` (delete existing, insert new)
     - `subtitle_streams` (delete existing, insert new + external)
3. If FFprobe fails:
   - Log error but continue scan (don't fail entire library scan)
   - Mark movie with error flag if desired
4. See `@docs/STREAM_DETAILS.md` for complete workflow

#### Step 5: Remove Deleted Directories (Soft Delete)
1. After processing all discovered directories:
   ```sql
   -- Mark movies for deletion (7-day grace period)
   UPDATE movies
   SET deleted_on = DATETIME('now', '+7 days')
   WHERE file_path NOT IN (
     -- Temp list of discovered paths
   )
   AND deleted_on IS NULL;

   -- Mark associated images for deletion
   UPDATE images
   SET deleted_on = DATETIME('now', '+7 days')
   WHERE entity_type = 'movie'
     AND entity_id IN (
       SELECT id FROM movies WHERE deleted_on IS NOT NULL
     )
     AND deleted_on IS NULL;
   ```
2. Cascading deletes happen during daily cleanup task (7 days later)
3. Emit SSE progress: `{ type: 'scanProgress', markedForDeletion: X }`

#### Step 6: Orphan Cleanup
1. Delete unused entities:
   ```sql
   DELETE FROM actors WHERE id NOT IN (
     SELECT DISTINCT actor_id FROM movies_actors
     UNION SELECT DISTINCT actor_id FROM series_actors
     UNION SELECT DISTINCT actor_id FROM episodes_actors
   );
   ```
2. Repeat for genres, directors, writers, studios, tags, countries

#### Step 7: Completion
1. Update scan_job:
   ```sql
   UPDATE scan_jobs SET
     status = 'completed',
     completed_at = CURRENT_TIMESTAMP,
     total_items = ?,
     added_items = ?,
     updated_items = ?,
     removed_items = ?
   WHERE id = ?;
   ```
2. Emit SSE: `{ type: 'scanCompleted', jobId, stats }`

---

## Scheduled Metadata Updates

Background task runs every 12 hours to check monitored items for metadata updates.

### Task Flow

```
Scheduler                Metarr                   Providers (TMDB, TVDB)
─────────               ──────                   ──────────────────────
   │                       │                              │
   │ Every 12 hours        │                              │
   ├──────────────────────>│                              │
   │                       │ Query "needs update" items   │
   │                       │ (unlocked + incomplete)      │
   │                       │                              │
   │                       │ Order by: created_at DESC    │
   │                       │ (newest first - most likely  │
   │                       │  to have new metadata)       │
   │                       │                              │
   │                       │ For each item:               │
   │                       │   Check provider rate limits │
   │                       │   If at limit → skip provider│
   │                       │                              │
   │                       │   Fetch metadata             │
   │                       ├─────────────────────────────>│
   │                       │<─────────────────────────────┤
   │                       │                              │
   │                       │   Update unlocked fields     │
   │                       │   Download missing images    │
   │                       │   Regenerate NFO             │
   │                       │                              │
   │                       │   Check completeness         │
   │                       │   If complete → lock all     │
   │                       │                              │
   │                       │ Continue until:              │
   │                       │   - All items processed      │
   │                       │   - OR rate limits hit       │
   │                       │   - OR 12 hour window ends   │
   │                       │                              │
```

### Query for "Needs Update"

```sql
SELECT * FROM movies
WHERE
  -- Not in error state
  status IS NULL

  -- Has at least one unlocked field
  AND (
    plot_locked = 0
    OR poster_locked = 0
    OR fanart_locked = 0
    -- ... (check all lockable fields)
  )

  -- Is incomplete (computed in application layer)
  -- Example: Missing required plot, or has 1 fanart but needs 3

ORDER BY created_at DESC  -- Newest first
LIMIT 1000;  -- Process in batches
```

### Rate Limiting Strategy

Each provider manages its own rate limit. When limit is reached, wait until the next time window.

```typescript
class ProviderRateLimiter {
  private requestsInWindow = 0;
  private windowStart = Date.now();
  private maxRequests = 50;  // Per provider (TMDB: 50/sec, TVDB: 1/sec)
  private windowMs = 1000;   // 1 second window
  private reservedCapacity = 10;  // Reserve for webhooks

  canMakeRequest(): boolean {
    this.resetWindowIfExpired();
    return this.requestsInWindow < (this.maxRequests - this.reservedCapacity);
  }

  private resetWindowIfExpired(): void {
    const elapsed = Date.now() - this.windowStart;
    if (elapsed >= this.windowMs) {
      this.requestsInWindow = 0;
      this.windowStart = Date.now();
    }
  }

  private async waitForNextWindow(): Promise<void> {
    const elapsed = Date.now() - this.windowStart;
    const remaining = this.windowMs - elapsed;

    if (remaining > 0) {
      await new Promise(resolve => setTimeout(resolve, remaining));
      this.requestsInWindow = 0;
      this.windowStart = Date.now();
    }
  }

  async executeWithWait<T>(fn: () => Promise<T>): Promise<T> {
    // Wait until we can make a request
    while (!this.canMakeRequest()) {
      await this.waitForNextWindow();
    }

    this.requestsInWindow++;
    return fn();
  }
}
```

**Usage Example:**
```typescript
// TMDB Rate Limiter (50 requests per second)
const tmdbLimiter = new ProviderRateLimiter(50, 1000);

// TVDB Rate Limiter (1 request per second)
const tvdbLimiter = new ProviderRateLimiter(1, 1000);

// Fetch metadata with automatic waiting
const movieData = await tmdbLimiter.executeWithWait(() =>
  tmdbClient.getMovieDetails(tmdbId)
);
```

### Priority Ordering

1. **Newest items first** - Recently added via webhook, most likely to have updates
2. **Oldest "last checked" timestamp** - Ensure nothing gets stuck
3. Continue processing until:
   - All items checked
   - OR all providers hit rate limits
   - OR task runtime exceeds threshold

---

## NFO Hash Validation & Intelligent Merge

Detects when external tools (Radarr, manual edits) modify NFO files and merges changes intelligently.

### When NFO Hash Differs

```
Current DB State:
  plot: "User's custom description" (plot_locked = 1)
  tagline: "Original tagline" (tagline_locked = 0)
  nfo_hash: "abc123..."

NFO File Changed (Radarr updated it):
  plot: "Radarr's new plot from TMDB"
  tagline: "Updated tagline from TMDB"
  nfo_hash (calculated): "def456..."

Intelligent Merge Result:
  plot: "User's custom description" (locked field preserved)
  tagline: "Updated tagline from TMDB" (unlocked field updated)
  nfo_hash: "def456..." (new hash stored)
```

### Merge Algorithm

```typescript
async function mergeNFOChanges(movieId: number, parsedNFO: NFOData): Promise<void> {
  const movie = await db.getMovie(movieId);
  const updates: Partial<Movie> = {};

  // Scalar fields
  for (const field of SCALAR_FIELDS) {
    const locked = movie[`${field}_locked`];
    if (!locked && parsedNFO[field] !== undefined) {
      updates[field] = parsedNFO[field];  // Accept NFO change
    }
    // If locked → skip (preserve DB value)
  }

  // Update database
  await db.updateMovie(movieId, updates);

  // Array fields (actors, genres, etc.)
  for (const arrayField of ARRAY_FIELDS) {
    const locked = movie[`${arrayField}_locked`];
    if (!locked) {
      // Clear existing links
      await db.clearLinks(movieId, arrayField);
      // Insert new links from NFO
      await db.insertLinks(movieId, arrayField, parsedNFO[arrayField]);
    }
  }

  // Update hash
  await db.updateMovie(movieId, { nfo_hash: newHash });
}
```

---

## Backup & Restore Process

Database-only backup with automatic asset rebuilding from library files and providers.

### Backup Flow

```
User                    Metarr                  Filesystem
────                    ──────                  ──────────
 │                         │                         │
 │ Click "Create Backup"   │                         │
 ├────────────────────────>│                         │
 │                         │ Stop active operations  │
 │                         │ (scans, scheduled tasks)│
 │                         │                         │
 │                         │ Dump database           │
 │                         ├────────────────────────>│
 │                         │ (metarr_backup_YYYYMMDD_HHmmss.sql)
 │                         │                         │
 │                         │ Compress (gzip)         │
 │                         │                         │
 │<────────────────────────┤                         │
 │ Download backup file    │                         │
 │                         │                         │
```

### Restore Flow with Policy Configuration

```
User                    Metarr                  Filesystem/Providers
────                    ──────                  ────────────────────
 │                         │                         │
 │ Upload backup file      │                         │
 ├────────────────────────>│                         │
 │                         │ Validate backup         │
 │                         │                         │
 │                         │ Show policy config:     │
 │<────────────────────────┤                         │
 │ "Locked assets missing: │                         │
 │  [X] Unlock automatically"                        │
 │  [ ] Ask me for each"   │                         │
 │                         │                         │
 │ Select "Unlock auto"    │                         │
 ├────────────────────────>│                         │
 │                         │ Stop all operations     │
 │                         │ Restore database        │
 │                         │                         │
 │                         │ Rebuild cache:          │
 │                         │ For each movie:         │
 │                         │   Check library dir     │
 │                         ├────────────────────────>│
 │                         │<────────────────────────┤
 │                         │ Copy images to cache    │
 │                         │                         │
 │                         │ If image missing:       │
 │                         │   If locked → unlock,   │
 │                         │     mark as needs update│
 │                         │   If unlocked → mark as │
 │                         │     needs update        │
 │                         │                         │
 │                         │ Trigger library scan    │
 │                         │ (fetches missing assets)│
 │                         │                         │
 │<────────────────────────┤                         │
 │ "Restore complete!      │                         │
 │  8 locked images marked │                         │
 │  as monitored"          │                         │
 │                         │                         │
```

### Restore Policies

**Automatic Mode (Default):**
- Locked assets missing → Unlock, mark as incomplete
- Unlocked assets missing → Mark as incomplete
- After restore → Trigger full library scan
- Library scan → Fetch all missing assets from providers
- Result: Fully automated, no user intervention

**Manual Review Mode:**
- For each locked asset missing → Show modal:
  - "Unlock" - Allow auto-replacement
  - "Skip" - Leave locked, add to skip report
  - "Cancel" - Abort restore
- Generate downloadable skip report (CSV/JSON)
- User reviews later, manually uploads or marks as monitored

---

## Media Player Scan Triggers

Different strategies for different update types and player configurations.

### Kodi: Standard Scan (New Files)
```
Metarr → Kodi: VideoLibrary.Scan({ directory: "/mnt/movies/The Matrix (1999)/" })
Result: Kodi reads NFO, converts images, caches, updates skin
```

### Kodi: Metadata-Only Update (No New Files)
```
Metarr → Kodi: VideoLibrary.Scan({ directory: "/doesNotExist" })
Result: Scan fails (no directory), but triggers skin refresh and cache rebuild
```

### Kodi Shared Library Group
```
Group: Living Room Kodi, Bedroom Kodi, Basement Kodi
Shared: MySQL database on NAS

Metarr action:
1. Pick one member (e.g., Living Room Kodi)
2. Trigger scan on that player only
3. All players now see updated metadata (shared DB)
4. Each player rebuilds its own image cache independently
5. Send notification to each player: "Library updated"
```

### Jellyfin/Plex
```
Metarr → Jellyfin: POST /Library/Refresh
Result: Jellyfin scans library, reads NFO files, updates database
```

---

## Daily Cleanup Task

Scheduled task runs daily (default: 3 AM local time) to permanently delete media and images past their 7-day grace period.

### Task Flow

```
Scheduler (Daily at 3 AM)    Metarr                          Filesystem
─────────────────────────    ──────                          ──────────
         │                      │                                 │
         │ Trigger cleanup      │                                 │
         ├─────────────────────>│                                 │
         │                      │ Query images pending deletion   │
         │                      │ (deleted_on <= NOW())          │
         │                      │                                 │
         │                      │ For each image:                 │
         │                      │   Delete cache file             │
         │                      ├────────────────────────────────>│
         │                      │   Delete library file           │
         │                      ├────────────────────────────────>│
         │                      │   DELETE FROM images           │
         │                      │                                 │
         │                      │ Query movies pending deletion   │
         │                      │ (deleted_on <= NOW())          │
         │                      │                                 │
         │                      │ For each movie:                 │
         │                      │   DELETE FROM movies           │
         │                      │   (cascades to link tables)    │
         │                      │                                 │
         │                      │ Orphan cleanup (unused entities)│
         │                      │                                 │
         │                      │ Log activity                    │
         │                      │                                 │
```

### Implementation

```typescript
async function runDailyCleanup(): Promise<void> {
  const startTime = Date.now();

  // Step 1: Clean up images
  const imagesToDelete = await db.query(`
    SELECT id, cache_path, file_path
    FROM images
    WHERE deleted_on IS NOT NULL
      AND deleted_on <= CURRENT_TIMESTAMP
  `);

  let imagesDeleted = 0;
  let imageErrors = 0;

  for (const image of imagesToDelete) {
    try {
      // Delete cache file
      if (image.cache_path && await fs.exists(image.cache_path)) {
        await fs.remove(image.cache_path);
      }

      // Delete library file
      if (image.file_path && await fs.exists(image.file_path)) {
        await fs.remove(image.file_path);
      }

      // Remove from database
      await db.run('DELETE FROM images WHERE id = ?', [image.id]);
      imagesDeleted++;
    } catch (error) {
      console.error(`Failed to delete image ${image.id}:`, error);
      imageErrors++;
    }
  }

  // Step 2: Clean up movies (and associated link table entries via CASCADE)
  const result = await db.run(`
    DELETE FROM movies
    WHERE deleted_on IS NOT NULL
      AND deleted_on <= CURRENT_TIMESTAMP
  `);
  const moviesDeleted = result.changes;

  // Step 3: Clean up series
  const seriesResult = await db.run(`
    DELETE FROM series
    WHERE deleted_on IS NOT NULL
      AND deleted_on <= CURRENT_TIMESTAMP
  `);
  const seriesDeleted = seriesResult.changes;

  // Step 4: Clean up episodes
  const episodesResult = await db.run(`
    DELETE FROM episodes
    WHERE deleted_on IS NOT NULL
      AND deleted_on <= CURRENT_TIMESTAMP
  `);
  const episodesDeleted = episodesResult.changes;

  // Step 5: Orphan cleanup (actors, genres, directors, etc.)
  await cleanOrphanedEntities();

  // Step 6: Log activity
  const duration = Date.now() - startTime;
  await db.logActivity({
    event_type: 'cleanup_completed',
    severity: 'info',
    description: `Daily cleanup completed in ${duration}ms`,
    metadata: JSON.stringify({
      imagesDeleted,
      imageErrors,
      moviesDeleted,
      seriesDeleted,
      episodesDeleted,
      durationMs: duration
    })
  });
}

async function cleanOrphanedEntities(): Promise<void> {
  // Delete actors with no links
  await db.run(`
    DELETE FROM actors
    WHERE id NOT IN (
      SELECT DISTINCT actor_id FROM movies_actors
      UNION SELECT DISTINCT actor_id FROM series_actors
      UNION SELECT DISTINCT actor_id FROM episodes_actors
    )
  `);

  // Delete genres with no links
  await db.run(`
    DELETE FROM genres
    WHERE id NOT IN (
      SELECT DISTINCT genre_id FROM movies_genres
      UNION SELECT DISTINCT genre_id FROM series_genres
    )
  `);

  // Similar for directors, writers, studios, tags, countries
  // ...
}
```

### Scheduling Configuration

```typescript
import * as cron from 'node-cron';

// Schedule daily cleanup at 3 AM local time
cron.schedule('0 3 * * *', async () => {
  console.log('Starting daily cleanup task...');
  await runDailyCleanup();
  console.log('Daily cleanup task completed.');
});
```

**Alternative Schedule Times:**
- `0 3 * * *` - 3:00 AM daily (default)
- `0 2 * * *` - 2:00 AM daily
- `0 4 * * 0` - 4:00 AM Sundays only

### Recovery Before Cleanup

Users can recover deleted items during the 7-day grace period:

```typescript
async function recoverMovie(movieId: number): Promise<void> {
  // Clear deletion timestamps
  await db.run(`
    UPDATE movies
    SET deleted_on = NULL
    WHERE id = ? AND deleted_on > CURRENT_TIMESTAMP
  `, [movieId]);

  await db.run(`
    UPDATE images
    SET deleted_on = NULL
    WHERE entity_type = 'movie'
      AND entity_id = ?
      AND deleted_on > CURRENT_TIMESTAMP
  `, [movieId]);

  // Log recovery
  await db.logActivity({
    event_type: 'recovery_completed',
    severity: 'info',
    entity_type: 'movie',
    entity_id: movieId,
    description: 'Movie recovered from pending deletion'
  });
}
```

---

## Priority System & Task Interruption

Metarr uses a priority-based task system to ensure responsiveness.

### Priority Levels

1. **Critical** - Webhook events (new downloads)
2. **High** - Manual user actions (force refresh, edits)
3. **Normal** - Scheduled metadata updates
4. **Low** - Full library scans

### Interruption Rules

**When webhook arrives:**
- If library scan running → **Pause scan**, save state
- Process webhook immediately (10-30 seconds typical)
- Resume library scan from saved position

**When user triggers action:**
- If scheduled task running → Continue scheduled task (non-blocking)
- Queue user action as high priority
- Process after current webhook (if any)

**Concurrency:**
- Webhooks: Sequential (one at a time, FIFO order)
- Library scans: One at a time per library
- Scheduled tasks: One global task (all libraries)
- User actions: Queue, process sequentially

### Example Timeline

```
Time  Event                              Action
────  ─────                              ──────
0:00  Library scan starts (1000 movies)  Processing...
0:30  Webhook arrives (Movie A)          Pause scan at item 452
0:30  Process Movie A                    Enrich, NFO, images, Kodi scan
0:45  Movie A complete                   Resume library scan from item 453
1:15  Webhook arrives (Movie B)          Pause scan at item 623
1:15  Process Movie B                    Enrich, NFO, images, Kodi scan
1:30  Movie B complete                   Resume library scan from item 624
2:00  Library scan completes             All 1000 movies processed
```

---

## Status State Diagram

Media items transition through various status states during processing. Status is **transient operational state**, not data completeness.

### State Transitions

```
┌──────────────────────────────────────────────────────────────────┐
│                        Media Item Lifecycle                       │
└──────────────────────────────────────────────────────────────────┘

┌─────────────┐
│ File Created│  (New movie file appears in library)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│status: null │  (Normal/idle state)
└──────┬──────┘
       │
       │  ┌────────────────────────────────────┐
       │  │ Triggers:                          │
       │  │ - Library scan discovers file      │
       │  │ - Webhook notification received    │
       │  │ - User manual action               │
       │  └────────────────────────────────────┘
       │
       ├──────────────────┬──────────────────┬──────────────────┐
       │                  │                  │                  │
       ▼                  ▼                  ▼                  ▼
 ┌──────────┐      ┌──────────┐      ┌──────────┐      ┌──────────┐
 │ scanning │      │processing│      │enriching │      │  needs_  │
 │          │      │_webhook  │      │          │      │identifi- │
 │          │      │          │      │          │      │ cation   │
 └────┬─────┘      └────┬─────┘      └────┬─────┘      └────┬─────┘
      │                 │                 │                 │
      │  Success        │  Success        │  Success        │  User
      │                 │                 │                 │  provides
      ▼                 ▼                 ▼                 │  ID
 ┌──────────┐      ┌──────────┐      ┌──────────┐         │
 │status:   │      │status:   │      │status:   │         │
 │null      │      │null      │      │null      │         │
 └────┬─────┘      └──────────┘      └──────────┘         │
      │                                                     │
      │                                                     ▼
      │            ┌─────────────────────────────────────────┐
      │            │            Error States                 │
      │            └─────────────────────────────────────────┘
      │                 │                 │                 │
      │                 ▼                 ▼                 ▼
      │         ┌──────────┐      ┌──────────┐      ┌──────────┐
      │         │error_nfo_│      │error_    │      │error_    │
      │         │conflict  │      │provider_ │      │network   │
      │         │          │      │failure   │      │          │
      │         └────┬─────┘      └────┬─────┘      └────┬─────┘
      │              │                 │                 │
      │              │  User resolves  │  Retry          │  Retry
      │              │  manually       │                 │
      │              ▼                 ▼                 ▼
      └────────────> status: null (retry processing)
                         │
                         ▼
                  ┌──────────────┐
                  │ Completeness │
                  │   Check      │
                  └──────┬───────┘
                         │
                    ┌────┴────┐
                    │         │
                    ▼         ▼
            ┌──────────┐ ┌──────────┐
            │Complete  │ │Incomplete│
            │→Lock All │ │→Monitored│
            └──────────┘ └──────────┘
```

### Status Values

| Status | Description | Next States | User Action |
|--------|-------------|-------------|-------------|
| `null` | Normal/idle state, no processing | `scanning`, `processing_webhook`, `enriching` | View, Edit, Delete |
| `scanning` | Currently being scanned (library scan) | `null`, `error_nfo_conflict`, `needs_identification` | View only |
| `processing_webhook` | Processing download webhook | `enriching`, `null` | View only |
| `enriching` | Fetching metadata from providers | `null`, `error_provider_failure`, `error_network` | View only |
| `needs_identification` | No NFO or provider IDs found | `null` (after user provides ID) | Provide TMDB/IMDB ID |
| `error_nfo_conflict` | Multiple conflicting NFO files | `null` (after user resolves) | Delete duplicate NFOs |
| `error_provider_failure` | Provider API returned error | `null` (retry) | Manual retry |
| `error_network` | Network connectivity issue | `null` (retry) | Check network, retry |

### State Persistence

- **Status is NOT persisted long-term** - Set to `null` after completion
- **Error states persist** until user resolves or system retries
- **Status does NOT indicate data quality** - Use completeness % for that
- **Deleted items** use `deleted_on` timestamp, not status

### Example State Transitions

**Scenario 1: New Movie Downloaded**
```
1. Webhook received → status = 'processing_webhook'
2. Metadata enrichment → status = 'enriching'
3. Completion → status = null
```

**Scenario 2: Library Scan with NFO Error**
```
1. Scan starts → status = 'scanning'
2. Multiple NFOs found → status = 'error_nfo_conflict'
3. User deletes duplicate → status = null
4. Rescan → status = 'scanning' → null
```

**Scenario 3: Provider API Failure**
```
1. Enrichment starts → status = 'enriching'
2. TMDB returns 500 error → status = 'error_provider_failure'
3. Automatic retry (1 hour later) → status = 'enriching'
4. Success → status = null
```

**Scenario 4: No NFO File**
```
1. Scan discovers directory → status = 'scanning'
2. No NFO found → status = 'needs_identification'
3. User provides TMDB ID → status = 'enriching'
4. Metadata fetched → status = null
```

---

## Unknown File Resolution Workflow

When files don't match known patterns during scanning, they're tracked in the `unknown_files` table for user resolution.

### Detection Process

During directory scanning, files are matched against known patterns:
- NFO files (`movie.nfo`, `tvshow.nfo`)
- Media files (`*.mkv`, `*.mp4`, `*.avi`)
- Images (`poster*.jpg`, `fanart*.jpg`, etc.)
- Trailers (`*-trailer.*`)
- Subtitles (`*.srt`, `*.ass`, `*.sub`)
- Actor images (`.actors/*.jpg`)
- Ignore patterns (user-configured)

Files that don't match any pattern are inserted into `unknown_files` table.

### Resolution Actions

#### Action 1: Delete File

```typescript
async function deleteUnknownFile(unknownFileId: number) {
  const file = await db.getUnknownFile(unknownFileId);

  // 1. Delete physical file from filesystem
  await fs.unlink(file.file_path);

  // 2. Delete from database
  await db.query('DELETE FROM unknown_files WHERE id = ?', [unknownFileId]);

  // File will NEVER appear in unknown list again (doesn't exist)
}
```

#### Action 2: Assign To Asset Type

User assigns unknown file to an asset type (poster, fanart, etc.).

```typescript
async function assignUnknownFile(
  unknownFileId: number,
  assignTo: 'poster' | 'fanart' | 'banner' | 'clearlogo' | etc.,
  forceInclude: boolean = false
) {
  const file = await db.getUnknownFile(unknownFileId);

  // 1. Process as normal asset
  const pHash = await calculatePerceptualHash(file.file_path);

  // Check for duplicates
  const existingImages = await db.getImages(file.entity_id, assignTo);
  const isDuplicate = existingImages.some(img =>
    calculateSimilarity(pHash, img.perceptual_hash) > 90
  );

  if (isDuplicate && !forceInclude) {
    throw new Error('Duplicate image detected. Use Force Include to bypass.');
  }

  // 2. Quality check (unless force include)
  const config = await db.getCompletenessConfig(file.entity_type);
  const maxCount = config[`required_${assignTo}s`];
  const currentCount = existingImages.length;

  if (currentCount >= maxCount && !forceInclude) {
    throw new Error(`Maximum ${maxCount} ${assignTo}s allowed. Use Force Include to bypass.`);
  }

  // 3. Rename file to standard pattern
  const nextIndex = getNextImageIndex(file.entity_id, assignTo);
  const extension = path.extname(file.file_path);
  const newFileName = nextIndex === 0 ? `${assignTo}${extension}` : `${assignTo}${nextIndex}${extension}`;
  const newLibraryPath = path.join(path.dirname(file.file_path), newFileName);

  await fs.rename(file.file_path, newLibraryPath);

  // 4. Copy to cache
  const cacheFileName = `${assignTo}_${generateHash()}${extension}`;
  const cachePath = `/cache/images/${file.entity_id}/${cacheFileName}`;
  await copyFile(newLibraryPath, cachePath);

  // 5. Insert into images table
  await db.insertImage({
    entity_type: file.entity_type,
    entity_id: file.entity_id,
    image_type: assignTo,
    library_path: newLibraryPath,
    cache_path: cachePath,
    perceptual_hash: pHash,
    locked: forceInclude ? 1 : 0  // Lock if force included
  });

  // 6. Delete from unknown_files (resolution complete)
  await db.query('DELETE FROM unknown_files WHERE id = ?', [unknownFileId]);

  // File will NEVER appear in unknown list again (now tracked in images table)

  // 7. Trigger media player update (optional)
  await triggerLibraryScan(file.entity_id);
}
```

#### Action 3: Add to Ignore Pattern

User adds a pattern to ignore similar files in future scans.

```typescript
async function addIgnorePattern(unknownFileId: number, pattern: string) {
  const file = await db.getUnknownFile(unknownFileId);

  // 1. Add pattern to configuration
  const config = await db.getConfig('ignore_patterns') || { patterns: [] };
  config.patterns.push(pattern);
  await db.setConfig('ignore_patterns', config);

  // 2. Find all matching files across ALL media items
  const allUnknownFiles = await db.query('SELECT * FROM unknown_files');

  const matchingFiles = allUnknownFiles.filter(f =>
    minimatch(f.file_name, pattern)
  );

  // 3. Delete matching files from database
  for (const matchingFile of matchingFiles) {
    await db.query('DELETE FROM unknown_files WHERE id = ?', [matchingFile.id]);
  }

  // Files will NEVER appear in unknown list again (pattern added to ignore list)
  // Future scans skip files matching this pattern
}
```

### Unknown Files UI Views

#### View 1: Per-Media Edit Page

Displayed when editing a specific movie/series/episode:

```typescript
// Get unknown files for this media item
const unknownFiles = await db.query(
  'SELECT * FROM unknown_files WHERE entity_type = ? AND entity_id = ?',
  [entityType, entityId]
);

// UI displays:
// - File name
// - File size
// - Actions: [Delete] [Assign To ▼] [Add to Ignore Pattern]
```

#### View 2: Global Unknown Files Table

System-wide view of all unknown files:

```sql
SELECT
  uf.*,
  m.title AS media_title,
  m.year AS media_year
FROM unknown_files uf
LEFT JOIN movies m ON uf.entity_type = 'movie' AND uf.entity_id = m.id
LEFT JOIN series s ON uf.entity_type = 'series' AND uf.entity_id = s.id
ORDER BY uf.discovered_at DESC;
```

**Table Columns:**
- File Name
- Media Item (clickable link to edit page)
- File Size
- Discovered At
- Actions

### Foreign Key Cascade Behavior

When a media item is deleted, all associated unknown files are automatically deleted:

```sql
CREATE TABLE unknown_files (
  -- ...
  FOREIGN KEY (entity_type, entity_id) REFERENCES movies(id) ON DELETE CASCADE
);
```

**Example:**
1. Movie "The Matrix" has 3 unknown files
2. User deletes "The Matrix" from library
3. Database automatically deletes 3 unknown files (CASCADE)
4. No orphaned unknown files remain
