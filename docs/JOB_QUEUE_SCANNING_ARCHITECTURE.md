# Job Queue Scanning Architecture

## Overview

This document defines the **multi-phase, fan-out job queue architecture** for library scanning, asset caching, and metadata enrichment. It addresses the critical challenge of **progress tracking** across thousands of jobs while providing clear, human-readable status to users.

## Design Principles

1. **Maximum Parallelization**: Break work into smallest possible units for maximum throughput
2. **Clear Progress Reporting**: Users should understand "what's happening" and "how far along are we"
3. **Debuggable**: Each job type is isolated and can be inspected/retried independently
4. **Non-Blocking**: User sees results immediately, enrichment happens in background
5. **Resilient**: Job failures don't cascade; each job can be retried independently

## Scan Configuration (Development Controls)

To aid development and debugging, scan behavior can be controlled via configuration flags:

```typescript
interface ScanOptions {
  // Phase control
  enableCaching?: boolean;      // Default: true
  enableEnrichment?: boolean;   // Default: true (based on library automation config)

  // Development flags
  skipAssetDiscovery?: boolean; // Skip local asset discovery (faster testing)
  skipFFprobe?: boolean;        // Skip video stream extraction (faster testing)
  maxDirectories?: number;      // Limit scan to N directories (for testing)

  // Enrichment control
  enrichmentMode?: 'none' | 'metadata-only' | 'full';
  // - 'none': No enrichment jobs queued
  // - 'metadata-only': Fetch metadata but not provider assets
  // - 'full': Full enrichment (default)
}
```

**Usage Example**:
```typescript
// Scan but don't scrape (development mode)
await libraryScanService.startScan(libraryId, {
  enableEnrichment: false
});

// Scan first 10 directories only (quick test)
await libraryScanService.startScan(libraryId, {
  maxDirectories: 10,
  skipFFprobe: true  // Extra fast
});
```

These options are stored in `scan_jobs.options` (JSON column) and respected by job handlers.

## Phase Architecture

### Phase 1: Directory Discovery (Fast, Synchronous)

**Purpose**: Walk library filesystem and queue jobs for each directory found.

```
User clicks "Scan Library"
  ↓
Create scan_jobs record (status='discovering')
  ↓
Walk library path recursively
  - Skip directories matching ignore patterns
  - For each valid directory → Emit 'directory-scan' job
  - Increment directories_queued counter
  ↓
Update scan_jobs (status='scanning', directories_total=N)
```

**Duration**: Seconds to minutes (filesystem walk only, no I/O)
**Progress**: Known total from the start (directories_total)
**User Sees**: "Discovering directories... Found 1,247 movies"

### Phase 2: Directory Scanning (Parallel, Background)

**Purpose**: Parse each directory's contents and extract metadata.

```
For EACH directory-scan job:
  ↓
  1. Find main video file
  2. Parse NFO files (local only, no API calls)
  3. Extract FFprobe streams
  4. Create/update movie record (state='discovered')
  5. Discover local assets (images, trailers, subtitles)
  6. For each asset found → Emit 'cache-asset' job
  7. Increment directories_scanned, movies_found, assets_queued
  ↓
When all directory-scan jobs complete → status='caching'
```

**Duration**: Minutes (FFprobe can be slow)
**Progress**: directories_scanned / directories_total
**User Sees**: "Scanning movies... 453/1,247 (36%)"

### Phase 3: Asset Caching (Parallel, Background)

**Purpose**: Copy discovered assets from library to cache directory.

```
For EACH cache-asset job:
  ↓
  1. Hash asset file (SHA256)
  2. Copy to cache: data/cache/{entityId}/{assetType}_{hash}.ext
  3. Store cache_path in database
  4. Increment assets_cached counter
  ↓
When all cache-asset jobs complete → status='enriching' (or 'completed' if no enrichment)
```

**Duration**: Seconds to minutes (file copying)
**Progress**: assets_cached / assets_queued
**User Sees**: "Caching assets... 1,832/3,456 (53%)"

### Phase 4: Metadata Enrichment (Parallel, Background, Optional)

**Purpose**: Fetch metadata and assets from providers (TMDB/TVDB).

```
For EACH movie with tmdb_id:
  ↓
  Queue 'fetch-provider-assets' job (priority 8)
    - Download poster/fanart/trailer URLs from TMDB
    - Store as asset candidates
    - Emit 'cache-asset' jobs for downloads
  ↓
  Queue 'enrich-metadata' job (priority 8)
    - Fetch full metadata from TMDB
    - Update movies table (respecting locked fields)
    - Change state to 'enriched'
  ↓
  If auto_select_assets enabled:
    Queue 'select-assets' job
      - Run asset selection algorithm
      - Mark selected assets
  ↓
When all enrichment jobs complete → status='completed'
```

**Duration**: Hours to days (rate-limited API calls)
**Progress**: enrichment_completed / enrichment_queued
**User Sees**: "Enriching metadata... 234/453 (52%)"

## Job Types

### 1. `directory-scan`

**Payload**:
```typescript
{
  scanJobId: number,      // Parent scan job for progress tracking
  libraryId: number,
  directoryPath: string,
  libraryType: 'movie' | 'tv' | 'music'
}
```

**Priority**: 6 (Normal - user-initiated)

**Handler**: `handleDirectoryScan()`
- Find video file
- Parse NFO (local only)
- Extract FFprobe streams
- Create/update entity record
- Discover local assets
- **Emit**: `cache-asset` jobs (one per asset found)
- **Update**: `scan_jobs.directories_scanned++, movies_found++`

**Failure Handling**: Log error, increment scan_jobs.errors_count, continue (don't block other directories)

### 2. `cache-asset`

**Payload**:
```typescript
{
  scanJobId: number,      // Parent scan job for progress tracking
  entityType: 'movie' | 'series' | 'episode',
  entityId: number,
  assetType: 'poster' | 'fanart' | 'trailer' | 'subtitle',
  sourcePath: string,     // Path to asset in library
  language?: string       // For subtitles
}
```

**Priority**: 7 (Low - non-blocking background work)

**Handler**: `handleCacheAsset()`
- Hash file (SHA256)
- Copy to cache directory
- Store cache_path in appropriate table (images, trailers, subtitle_streams)
- **Update**: `scan_jobs.assets_cached++`

**Failure Handling**: Retry up to 3 times, log error if all retries fail

### 3. `fetch-provider-assets`

**Payload**:
```typescript
{
  scanJobId?: number,     // Optional: for scan progress tracking
  entityType: 'movie' | 'series' | 'episode',
  entityId: number,
  provider: 'tmdb' | 'tvdb',
  providerId: number
}
```

**Priority**: 8 (Very low - can take hours/days)

**Handler**: `handleFetchProviderAssets()`
- Fetch asset URLs from provider
- Create asset_candidates records
- Download assets to temp directory
- **Emit**: `cache-asset` jobs (for downloaded assets)
- **Update**: `scan_jobs.assets_queued++` (if scanJobId present)

**Failure Handling**: Respect rate limits, retry with exponential backoff

### 4. `enrich-metadata`

**Payload**:
```typescript
{
  scanJobId?: number,
  entityType: 'movie' | 'series' | 'episode',
  entityId: number,
  provider: 'tmdb' | 'tvdb',
  providerId: number
}
```

**Priority**: 8 (Very low)

**Handler**: `handleEnrichMetadata()`
- Fetch full metadata from provider
- Update entity table (respecting locked fields)
- Change state to 'enriched'
- **Update**: `scan_jobs.enrichment_completed++` (if scanJobId present)

**Failure Handling**: Retry with exponential backoff, mark entity status='enrichment_failed'

## Progress Tracking Framework

### Database: Enhanced `scan_jobs` Table

```sql
CREATE TABLE scan_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  library_id INTEGER NOT NULL,

  -- Phase tracking
  status TEXT NOT NULL DEFAULT 'discovering',
  -- Values: 'discovering' | 'scanning' | 'caching' | 'enriching' | 'completed' | 'failed' | 'cancelled'

  -- Phase 1: Directory Discovery
  directories_total INTEGER DEFAULT 0,
  directories_queued INTEGER DEFAULT 0,

  -- Phase 2: Directory Scanning
  directories_scanned INTEGER DEFAULT 0,
  movies_found INTEGER DEFAULT 0,
  movies_new INTEGER DEFAULT 0,
  movies_updated INTEGER DEFAULT 0,

  -- Phase 3: Asset Caching
  assets_queued INTEGER DEFAULT 0,
  assets_cached INTEGER DEFAULT 0,

  -- Phase 4: Enrichment (optional)
  enrichment_queued INTEGER DEFAULT 0,
  enrichment_completed INTEGER DEFAULT 0,

  -- Timing
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  discovery_completed_at TIMESTAMP,
  scanning_completed_at TIMESTAMP,
  caching_completed_at TIMESTAMP,
  completed_at TIMESTAMP,

  -- Errors
  errors_count INTEGER DEFAULT 0,
  last_error TEXT,

  -- Current operation (for debugging)
  current_operation TEXT,

  -- Scan options (JSON)
  options TEXT, -- JSON: { enableCaching, enableEnrichment, skipAssetDiscovery, etc. }

  FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE
);

CREATE INDEX idx_scan_jobs_library ON scan_jobs(library_id);
CREATE INDEX idx_scan_jobs_status ON scan_jobs(status);
```

### Progress Update Strategy

Each job handler updates `scan_jobs` on completion:

```typescript
// Example: directory-scan job completes
async function handleDirectoryScan(job: Job): Promise<void> {
  const { scanJobId, directoryPath } = job.payload;

  try {
    // ... scan directory, discover assets ...
    const assetsFound = 12; // example
    const isNewMovie = true;

    // Update scan_jobs atomically
    await db.execute(`
      UPDATE scan_jobs
      SET directories_scanned = directories_scanned + 1,
          movies_found = movies_found + 1,
          movies_new = movies_new + ?,
          assets_queued = assets_queued + ?,
          current_operation = ?
      WHERE id = ?
    `, [
      isNewMovie ? 1 : 0,
      assetsFound,
      `Scanned ${directoryPath}`,
      scanJobId
    ]);

    // Broadcast progress via WebSocket
    broadcastScanProgress(scanJobId);

  } catch (error) {
    // Update error count
    await db.execute(`
      UPDATE scan_jobs
      SET errors_count = errors_count + 1,
          last_error = ?
      WHERE id = ?
    `, [error.message, scanJobId]);
  }
}
```

### Phase Transition Logic

After each job completes, check if phase is complete:

```typescript
async function checkPhaseTransition(scanJobId: number): Promise<void> {
  const scan = await getScanJob(scanJobId);

  // Phase 2 → Phase 3 transition
  if (scan.status === 'scanning' &&
      scan.directories_scanned === scan.directories_total) {

    await db.execute(`
      UPDATE scan_jobs
      SET status = 'caching',
          scanning_completed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [scanJobId]);

    broadcastPhaseChange(scanJobId, 'caching');
  }

  // Phase 3 → Phase 4 transition (or completion)
  if (scan.status === 'caching' &&
      scan.assets_cached === scan.assets_queued) {

    // Check if enrichment is needed
    const needsEnrichment = await checkEnrichmentNeeded(scan.library_id);

    if (needsEnrichment) {
      await db.execute(`
        UPDATE scan_jobs
        SET status = 'enriching',
            caching_completed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [scanJobId]);

      // Queue enrichment jobs here
      await queueEnrichmentJobs(scan.library_id, scanJobId);
    } else {
      // No enrichment needed, mark as completed
      await db.execute(`
        UPDATE scan_jobs
        SET status = 'completed',
            caching_completed_at = CURRENT_TIMESTAMP,
            completed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [scanJobId]);

      broadcastScanCompleted(scanJobId);
    }
  }

  // Phase 4 → Completion
  if (scan.status === 'enriching' &&
      scan.enrichment_completed === scan.enrichment_queued) {

    await db.execute(`
      UPDATE scan_jobs
      SET status = 'completed',
          completed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [scanJobId]);

    broadcastScanCompleted(scanJobId);
  }
}
```

## WebSocket Progress Reporting

### Message Structure

```typescript
interface ScanProgressMessage {
  type: 'scan:progress',
  scanJobId: number,
  libraryId: number,
  libraryName: string,

  // Current phase
  phase: 'discovering' | 'scanning' | 'caching' | 'enriching' | 'completed',

  // Phase-specific progress
  progress: {
    discovering?: {
      directoriesFound: number,
      inProgress: boolean
    },
    scanning?: {
      scanned: number,
      total: number,
      percentage: number
    },
    caching?: {
      cached: number,
      queued: number,
      percentage: number
    },
    enriching?: {
      completed: number,
      queued: number,
      percentage: number
    }
  },

  // Summary stats
  stats: {
    moviesFound: number,
    moviesNew: number,
    moviesUpdated: number,
    assetsCached: number,
    errorsCount: number
  },

  // Status
  currentOperation: string,
  estimatedTimeRemaining?: string,

  // Timestamps
  startedAt: string,
  lastUpdatedAt: string
}
```

### Broadcast Strategy

**No Throttling**: Broadcast immediately on each progression event for real-time feedback

```typescript
async function broadcastScanProgress(scanJobId: number): Promise<void> {
  const message = await buildProgressMessage(scanJobId);
  websocketBroadcaster.broadcast('scan:progress', message);
}

// Called after each job completes
async function handleDirectoryScan(job: Job): Promise<void> {
  // ... scan logic ...

  await db.execute(`UPDATE scan_jobs SET directories_scanned = directories_scanned + 1 WHERE id = ?`, [scanJobId]);

  // Broadcast immediately
  await broadcastScanProgress(scanJobId);
}
```

**Rationale**: Real-time updates provide better user feedback during development and debugging. Frontend can throttle rendering if needed.

## User Interface Display

### Phase 1: Discovering

```
Library Scan: "Movies"
┌─────────────────────────────────────────┐
│ 🔍 Discovering directories...          │
│                                         │
│ Found: 1,247 movie directories          │
│ Ignored: 34 (matching ignore patterns)  │
│                                         │
│ [████████████████████████        ] 75%  │
└─────────────────────────────────────────┘
```

### Phase 2: Scanning

```
Library Scan: "Movies"
┌─────────────────────────────────────────┐
│ 📊 Scanning movies...                   │
│                                         │
│ Progress: 453 / 1,247 (36%)             │
│ Movies: 453 found (421 new, 32 updated) │
│ Assets: 3,456 discovered                │
│                                         │
│ [████████████                    ] 36%  │
│                                         │
│ Currently scanning:                     │
│ /movies/The Matrix (1999)               │
└─────────────────────────────────────────┘
```

### Phase 3: Caching

```
Library Scan: "Movies"
┌─────────────────────────────────────────┐
│ ✅ Scanning complete!                   │
│ 💾 Caching assets...                    │
│                                         │
│ Assets: 1,832 / 3,456 cached (53%)      │
│ - Posters: 421 cached                   │
│ - Fanart: 389 cached                    │
│ - Trailers: 127 cached                  │
│ - Subtitles: 895 cached                 │
│                                         │
│ [████████████████                ] 53%  │
└─────────────────────────────────────────┘
```

### Phase 4: Enriching

```
Library Scan: "Movies"
┌─────────────────────────────────────────┐
│ ✅ Caching complete!                    │
│ 🌐 Enriching metadata...                │
│                                         │
│ Enrichment: 234 / 453 movies (52%)      │
│ - Fetching from TMDB                    │
│ - Rate limited (50 req/10 sec)          │
│ - Est. completion: ~15 minutes          │
│                                         │
│ [████████████████                ] 52%  │
│                                         │
│ ℹ️  Library is ready to use!            │
│    Enrichment continues in background   │
└─────────────────────────────────────────┘
```

### Completed

```
Library Scan: "Movies"
┌─────────────────────────────────────────┐
│ ✅ Scan completed successfully!         │
│                                         │
│ Summary:                                │
│ - Movies found: 453 (421 new, 32 updated)│
│ - Assets cached: 3,456                  │
│ - Metadata enriched: 453                │
│ - Errors: 0                             │
│                                         │
│ Duration: 28 minutes                    │
│ Completed at: 2025-01-15 14:32:18       │
└─────────────────────────────────────────┘
```

## Error Handling

### Job-Level Errors

**Strategy**: Fail gracefully, don't block other jobs

```typescript
async function handleDirectoryScan(job: Job): Promise<void> {
  try {
    // ... scan logic ...
  } catch (error) {
    logger.error('Directory scan failed', {
      jobId: job.id,
      directory: job.payload.directoryPath,
      error: error.message
    });

    // Update scan job error count
    await db.execute(`
      UPDATE scan_jobs
      SET errors_count = errors_count + 1,
          last_error = ?
      WHERE id = ?
    `, [error.message, job.payload.scanJobId]);

    // Don't throw - let other directory scans continue
  }
}
```

### Phase-Level Errors

**Strategy**: Log errors but continue scanning. Scan only fails if catastrophic error occurs (filesystem unmounted, database failure, etc.)

```typescript
// Errors are tracked but don't stop the scan
async function handleDirectoryScan(job: Job): Promise<void> {
  try {
    // ... scan logic ...
  } catch (error) {
    // Log error and increment counter
    logger.error('Directory scan failed', {
      jobId: job.id,
      directory: job.payload.directoryPath,
      error: error.message
    });

    await db.execute(`
      UPDATE scan_jobs
      SET errors_count = errors_count + 1,
          last_error = ?
      WHERE id = ?
    `, [error.message, job.payload.scanJobId]);

    // Continue - don't block other directories
  }
}

// Scan completes even if some directories failed
// User sees error count in summary: "453 movies found, 12 errors"
```

**Rationale**: One bad directory shouldn't block scanning thousands of other movies. Errors are logged for investigation.

## Implementation Status

### ✅ Completed (Phase 1-2 Implementation)

#### Database Schema
- ✅ Updated `scan_jobs` table with phase-specific counters (20251015_001_clean_schema.ts)
- ✅ Added `keyart_id` and `landscape_id` columns to movies table
- ✅ Added `keyart_locked` and `landscape_locked` fields
- ✅ TypeScript interfaces updated (ScanJob, ScanOptions in types/models.ts)

#### Job Queue Integration
- ✅ Added `JobQueueService` to `LibraryScanService` constructor
- ✅ Updated `createApiRouter()` factory to pass JobQueueService
- ✅ Added job types: `directory-scan`, `cache-asset` (types.ts)

#### Phase 1: Discovery (Implemented)
- ✅ `LibraryScanService.scanMovieLibrary()` refactored to emit jobs
- ✅ Walks filesystem and queues `directory-scan` jobs for each directory
- ✅ Updates `directories_total`, `directories_queued` counters
- ✅ Transitions status from `discovering` → `scanning`
- ✅ Non-blocking return after job queuing

#### Phase 2: Directory Scanning (Implemented)
- ✅ `handleDirectoryScan()` implemented in jobHandlers.ts
- ✅ Calls `scanMovieDirectory()` for each directory
- ✅ Updates progress: `directories_scanned++`, `movies_found++`, `movies_new++`, `movies_updated++`
- ✅ Tracks asset counts: `assets_queued` incremented
- ✅ Error handling: Logs errors, increments `errors_count`, continues scan

#### Phase 3: Asset Caching (Implemented)
- ✅ `handleCacheAsset()` implemented in jobHandlers.ts
- ✅ SHA256 hashing of asset files
- ✅ Content-addressed storage: `data/cache/{entityType}/{entityId}/{assetType}_{hash}.ext`
- ✅ Deduplication: Checks if hash already exists before copying
- ✅ Updates database: stores `cache_path` in images/trailers/subtitles tables
- ✅ Updates progress: `assets_cached++`

#### Code Cleanup
- ✅ Removed inline TMDB API calls from `scanMovieDirectory()` (unifiedScanService.ts)
- ✅ Removed `tmdbService` import (no longer needed)
- ✅ Removed `mergeTmdbWithNfo()` helper function (100+ lines)
- ✅ Phase 2 now only does local work (NFO parsing, FFprobe, asset discovery)

### 🚧 In Progress

#### Phase 4: Enrichment (Not Yet Implemented)
- ⏳ Need to emit enrichment jobs after Phase 2 completes
- ⏳ `handleEnrichMetadata()` to fetch TMDB data
- ⏳ `handleFetchProviderAssets()` to download provider images
- ⏳ Asset selection algorithm integration

#### Phase Transition Logic (Partially Implemented)
- ✅ Phase 1 → Phase 2 transition (status updated in scanMovieLibrary)
- ⏳ Phase 2 → Phase 3 transition detection
- ⏳ Phase 3 → Phase 4 transition detection
- ⏳ Phase 4 → Completed transition

#### WebSocket Progress (Existing, Needs Update)
- ⏳ Update message format to match new schema
- ⏳ Broadcast phase-specific progress
- ⏳ No throttling (immediate broadcast as specified)

### 📋 Not Started

- [ ] Scan health monitoring
- [ ] Frontend UI updates for new progress format
- [ ] Phase-specific progress displays in UI
- [ ] "Library is ready!" notification after Phase 2
- [ ] Drill-down view (scan → movies → assets)
- [ ] Scan cancellation improvements

## Implementation Checklist

### Backend Changes

- [x] Update `scan_jobs` table schema (migration)
- [x] Create `directory-scan` job handler
- [x] Create `cache-asset` job handler
- [x] Refactor `scanMovieDirectory()` to emit jobs instead of inline processing
- [ ] Add phase transition logic
- [x] Add progress tracking updates to all handlers
- [ ] Create throttled WebSocket broadcaster
- [ ] Add scan health monitoring

### Frontend Changes

- [ ] Update scan progress UI to show phases
- [ ] Add WebSocket listener for `scan:progress` events
- [ ] Add phase-specific progress displays
- [ ] Add drill-down view (scan → movies → assets)
- [ ] Add "Library is ready!" notification when Phase 2 completes

### Testing

- [ ] Test with small library (10 movies)
- [ ] Test with medium library (100 movies)
- [ ] Test with large library (1000+ movies)
- [ ] Test phase transitions
- [ ] Test error handling (network failures, missing files, etc.)
- [ ] Test WebSocket reconnection during long scans
- [ ] Test scan cancellation

## Benefits of This Architecture

1. **Maximum Parallelization**: Thousands of directory scans can run concurrently
2. **Clear Progress**: Users see exactly what's happening at each phase
3. **Non-Blocking**: Library is usable after Phase 2 completes (minutes), enrichment continues in background
4. **Debuggable**: Each job can be inspected, retried, or cancelled independently
5. **Resilient**: One job failure doesn't cascade to others
6. **Scalable**: Handles libraries with 10,000+ movies
7. **Rate-Limit Friendly**: Phase 4 respects provider API limits
8. **User-Friendly**: Progress is reported in human terms (movies found, assets cached, not "jobs completed")

## Migration Path

### Step 1: Database Migration
- Add new columns to `scan_jobs` table
- Keep existing scanning code functional

### Step 2: Implement Job Handlers
- Create `directory-scan` handler
- Create `cache-asset` handler
- Test with small library

### Step 3: Refactor Scan Service
- Replace inline scanning with job emission
- Add progress tracking updates
- Test phase transitions

### Step 4: WebSocket Integration
- Add throttled broadcaster
- Update frontend to consume new messages
- Test real-time updates

### Step 5: User Testing
- Test with real-world libraries
- Gather feedback on progress clarity
- Tune throttling and batch sizes

## Future Enhancements

- **Priority Scanning**: User can mark specific directories for immediate scanning
- **Incremental Updates**: Detect changed directories only (inotify/fswatch)
- **Scan Scheduling**: Auto-scan libraries on schedule
- **Multi-Library Scans**: Queue scans for all libraries simultaneously
- **Scan Profiles**: Different scan depths (quick vs. full)
