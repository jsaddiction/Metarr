# Automation & Webhooks

**Related Docs**: [ARCHITECTURE.md](ARCHITECTURE.md), [WEBHOOKS.md](WEBHOOKS.md), [WORKFLOWS.md](WORKFLOWS.md), [ASSET_MANAGEMENT.md](ASSET_MANAGEMENT.md)

This document describes Metarr's automation system, including automation levels, webhook handling, and the philosophy behind automated vs. manual workflows.

---

## Core Philosophy

```
┌─────────────────────────────────────────────────────────────┐
│       "Intelligent Defaults with Manual Override"           │
└─────────────────────────────────────────────────────────────┘

1. INITIAL SETUP: User chooses their automation preference
   - Manual: MediaElch-style (full control, no automation)
   - YOLO: Full automation (trust the algorithm)
   - Hybrid: Auto-process, but require user review before publish

2. WEBHOOKS: If enabled, always fully automated
   - User opted in because they want automation
   - New downloads auto-publish to players
   - Upgrades seamlessly restore from cache
   - User can manually fix mistakes later

3. MANUAL EDITS: Sacred and permanent
   - Any user change locks that field/asset forever
   - Locked fields excluded from all future automation
   - Visual indicator: 🔒 User Selected vs 🤖 Auto Selected
```

---

## Automation Levels

User selects automation level per library during initial setup (or anytime in settings).

### Level 1: Manual (MediaElch-Style)

**Target User**: Wants full control, no surprises, reviews everything before publishing.

**Behavior**:

| Phase | Action | Trigger |
|-------|--------|---------|
| **Discovery** | Scan filesystem, parse NFO, FFprobe | User clicks "Scan Library" |
| **Enrichment** | Fetch provider metadata | User clicks "Enrich" on specific items |
| **Selection** | Display asset options | User manually selects each asset |
| **Publishing** | Write to library, notify players | User clicks "Publish" |

**Webhooks**: Disabled or set to manual mode (notify only, don't auto-process)

**Example Workflow**:
```
1. User clicks "Scan Library"
   → Metarr discovers 50 new movies
   → State: 'identified' (if has NFO with IDs) or 'needs_identification'

2. User opens first movie
   → Clicks "Enrich from TMDB"
   → Fetches metadata, stores asset candidate URLs
   → State: 'enriched'

3. User reviews:
   → Edits plot (locks plot field)
   → Selects poster #3 of 15 (locks poster)
   → Selects fanart #1, #5, #8 (locks fanart)
   → State: 'selected', has_unpublished_changes = 1

4. User clicks "Publish"
   → Writes NFO + assets to library
   → Triggers Kodi scan
   → State: 'published', has_unpublished_changes = 0
```

**Configuration**:
```sql
INSERT INTO library_automation_config (library_id, automation_mode, auto_enrich, auto_select_assets, auto_publish, webhook_enabled)
VALUES (1, 'manual', 0, 0, 0, 0);
```

---

### Level 2: YOLO (Full Automation)

**Target User**: Trusts the algorithm, wants hands-off operation, willing to manually fix rare mistakes.

**Behavior**:

| Phase | Action | Trigger |
|-------|--------|---------|
| **Discovery** | Scan filesystem, parse NFO, FFprobe | User clicks "Scan Library" or webhook |
| **Enrichment** | Fetch provider metadata | Automatic (background job) |
| **Selection** | Algorithm selects best assets | Automatic (based on scoring config) |
| **Publishing** | Write to library, notify players | Automatic (immediately after selection) |

**Webhooks**: Fully enabled and automated

**Example Workflow (Initial Scan)**:
```
1. User clicks "YOLO My Library"
   → Phase 1: Discovers 2,000 movies (3-5 hours)
   → Phase 2: Enriches in background (rate-limited, could take days)

2. For each movie:
   → Fetch TMDB metadata
   → Fetch 15 poster candidates, 20 fanart candidates
   → Score each candidate (resolution, votes, language)
   → Select top 1 poster, top 3 fanarts
   → Download to cache
   → Publish to library (NFO + assets)
   → Trigger Kodi scan
   → State: 'published'

3. User browses Kodi:
   → All 2,000 movies appear with posters/fanart
   → 95% look great
   → 5% have suboptimal posters

4. User manually fixes the 5%:
   → Opens movie in Metarr
   → Clicks "Replace Image"
   → Selects better poster
   → Locks poster (prevents future auto-changes)
   → Publishes
```

**Example Workflow (Webhook)**:
```
1. Radarr downloads "The Matrix 4"
   → Sends webhook to Metarr (eventType: Download)

2. Metarr (automatic):
   → Scans directory (NFO, FFprobe)
   → Enriches from TMDB
   → Scores and selects assets
   → Downloads top 1 poster, top 3 fanarts
   → Publishes to library
   → Triggers Kodi scan
   → State: 'published'

3. User sees in Kodi (30-60 seconds later):
   → "The Matrix 4" appears with poster/fanart
   → Ready to watch
```

**Configuration**:
```sql
INSERT INTO library_automation_config (library_id, automation_mode, auto_enrich, auto_select_assets, auto_publish, webhook_enabled, webhook_auto_publish)
VALUES (1, 'yolo', 1, 1, 1, 1, 1);
```

---

### Level 3: Hybrid (Recommended Default)

**Target User**: Wants automation, but likes to review before publishing. Best of both worlds.

**Behavior**:

| Phase | Action | Trigger |
|-------|--------|---------|
| **Discovery** | Scan filesystem, parse NFO, FFprobe | User clicks "Scan Library" |
| **Enrichment** | Fetch provider metadata | Automatic (background job) |
| **Selection** | Algorithm selects best assets | Automatic (based on scoring config) |
| **Publishing** | Write to library, notify players | **User clicks "Publish" after review** |

**Webhooks**: Fully automated (user wants automation for new downloads)

**Example Workflow (Initial Scan)**:
```
1. User clicks "Scan Library"
   → Phase 1: Discovers 2,000 movies (3-5 hours)
   → Phase 2: Enriches in background (rate-limited)

2. For each movie:
   → Fetch TMDB metadata
   → Fetch asset candidates
   → Score and select best assets
   → Download to cache
   → State: 'selected', has_unpublished_changes = 1

3. UI shows "Pending Review" queue:
   → 2,000 movies with orange "Unpublished" badge
   → User can review individually or bulk-publish

4. User reviews first 50 movies:
   → 45 look great → Bulk publish
   → 5 need better posters → Replace, then publish

5. User clicks "Publish All Remaining":
   → Bulk publishes 1,950 movies
   → Triggers Kodi scans
   → State: 'published'
```

**Example Workflow (Webhook)**:
```
Same as YOLO mode - webhooks always auto-publish
(user enabled webhooks because they want automation)
```

**Configuration**:
```sql
INSERT INTO library_automation_config (library_id, automation_mode, auto_enrich, auto_select_assets, auto_publish, webhook_enabled, webhook_auto_publish)
VALUES (1, 'hybrid', 1, 1, 0, 1, 1);
```

---

## Webhook Automation

### Webhook Philosophy

**Key Principle**: If user enabled webhooks, they want automation. Don't ask for permission.

**Rationale**:
- User explicitly configured webhook URL in Radarr/Sonarr
- User wants new downloads to appear in their player automatically
- Manual review defeats the purpose of automation
- User can manually fix mistakes later (locks protect future changes)

### Webhook Events

See [WEBHOOKS.md](WEBHOOKS.md) for complete webhook payload documentation.

| Event | Action | Priority |
|-------|--------|----------|
| **Download** (new) | Full pipeline: Scan → Enrich → Select → Publish | Critical (1) |
| **Download** (upgrade) | Restore cache → Re-scan streams → Publish | Critical (1) |
| **Rename** | Update file_path, republish if needed | High (2) |
| **Delete** | Soft delete (90-day grace period) | Normal (5) |
| **Grab** | Notify only (download starting) | Low (7) |

### Webhook Workflow - New Download

```
┌─────────────────────────────────────────────────────────────┐
│         WEBHOOK: NEW DOWNLOAD (FULLY AUTOMATED)              │
└─────────────────────────────────────────────────────────────┘

1. Radarr sends webhook
   ├─ eventType: Download
   ├─ tmdb_id: 603
   ├─ imdb_id: tt0133093
   ├─ title: "The Matrix"
   └─ path: "/movies/The Matrix (1999)/The Matrix.mkv"

2. Metarr receives webhook (critical priority)
   ├─ Check if movie exists in DB (by tmdb_id)
   └─ If not found → New download workflow

3. Scan directory
   ├─ Parse NFO (if exists)
   ├─ FFprobe video file
   ├─ Discover local assets
   └─ Insert to database (state = 'identified')

4. Enrich from TMDB (high priority queue)
   ├─ Fetch metadata (plot, genres, actors, etc.)
   ├─ Respect locks (skip any locked fields)
   ├─ Fetch asset candidates (posters, fanarts)
   └─ State: 'enriching' → 'enriched'

5. Auto-select assets
   ├─ Score all candidates
   ├─ Filter duplicates (pHash)
   ├─ Select top N (based on config)
   └─ Download to cache

6. Publish to library
   ├─ Generate NFO from database
   ├─ Copy assets from cache → library
   ├─ Write NFO to library
   └─ State: 'published'

7. Notify players
   ├─ Trigger Kodi scan (via WebSocket)
   ├─ Trigger Jellyfin scan (via REST API)
   └─ User sees movie in player (30-60 seconds)

RESULT: Fully automated, user sees new movie in Kodi within 1 minute
```

**Implementation**:
```typescript
async function handleDownloadWebhook(payload: WebhookPayload): Promise<void> {
  // 1. Check if movie exists
  const existing = await db.query(`
    SELECT * FROM movies WHERE tmdb_id = ?
  `, [payload.tmdbId]);

  if (existing.length > 0) {
    // Upgrade workflow (see next section)
    return handleUpgradeWebhook(payload, existing[0]);
  }

  // 2. Scan directory
  const scanResult = await scanService.scanDirectory(payload.path);

  // 3. Enrich (high priority)
  await jobQueue.add({
    type: 'enrich',
    priority: 2,  // High priority (webhooks jump queue)
    payload: {
      entityType: 'movie',
      entityId: scanResult.movieId
    }
  });

  // 4. Auto-select (runs after enrichment)
  await jobQueue.add({
    type: 'auto_select',
    priority: 2,
    payload: {
      entityType: 'movie',
      entityId: scanResult.movieId
    }
  });

  // 5. Auto-publish (runs after selection)
  await jobQueue.add({
    type: 'publish',
    priority: 2,
    payload: {
      entityType: 'movie',
      entityId: scanResult.movieId
    }
  });

  // Jobs run sequentially (each depends on previous)
}
```

### Webhook Workflow - Upgrade

```
┌─────────────────────────────────────────────────────────────┐
│         WEBHOOK: UPGRADE (DISASTER RECOVERY)                 │
└─────────────────────────────────────────────────────────────┘

SCENARIO: Radarr upgrades 720p → 1080p, deletes entire directory

1. Radarr sends webhook
   ├─ eventType: Download
   ├─ isUpgrade: true
   ├─ tmdb_id: 603
   └─ path: "/movies/The Matrix (1999)/The Matrix.mkv"

2. Metarr detects existing movie
   ├─ Query: SELECT * FROM movies WHERE tmdb_id = 603
   └─ Found movie ID 123

3. Check for missing assets
   ├─ Load published assets from publish_log
   ├─ Check if NFO exists → Missing
   ├─ Check if poster exists → Missing
   └─ Conclusion: Directory was deleted

4. Restore from cache
   ├─ Ensure directory exists
   ├─ Copy poster from cache → library
   ├─ Copy fanarts from cache → library
   └─ Regenerate NFO from database

5. Update video file path
   └─ UPDATE movies SET file_path = ? WHERE id = 123

6. Re-scan stream details (new file)
   ├─ FFprobe new 1080p file
   ├─ Update video_streams (resolution, bitrate, etc.)
   └─ Update audio/subtitle streams

7. Regenerate NFO (updated stream details)
   └─ Write NFO with new <fileinfo><streamdetails>

8. Trigger player scan
   └─ Kodi scans, sees updated quality, same metadata

RESULT: Seamless upgrade, user sees no data loss
```

**Implementation**:
```typescript
async function handleUpgradeWebhook(
  payload: WebhookPayload,
  existingMovie: Movie
): Promise<void> {
  const libraryPath = path.dirname(payload.path);

  // 1. Check for missing assets
  const nfoPath = path.join(libraryPath, 'movie.nfo');
  const nfoMissing = !await fs.pathExists(nfoPath);

  if (nfoMissing) {
    console.log(`Detected missing NFO for movie ${existingMovie.id}, restoring from cache...`);

    // 2. Restore from cache
    await disasterRecoveryService.restoreFromCache(
      'movie',
      existingMovie.id,
      libraryPath
    );
  }

  // 3. Update file path
  await db.execute(`
    UPDATE movies
    SET file_path = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [payload.path, existingMovie.id]);

  // 4. Re-scan stream details
  await streamDetailsService.scanVideoFile(existingMovie.id, payload.path);

  // 5. Republish (regenerate NFO with updated streams)
  await publishService.publishEntity('movie', existingMovie.id, { force: true });

  // 6. Notify players
  await publishService.notifyPlayers('movie', existingMovie.id, libraryPath);

  console.log(`Successfully restored and upgraded movie ${existingMovie.id}`);
}
```

---

## Field & Asset Locking

### Locking Philosophy

**Rule**: Manual edit = permanent lock, automation respects locks.

**Purpose**: Preserve user intent, prevent automation from overwriting custom changes.

### Field Locking

**Trigger**: User manually edits any field in UI

```typescript
// User changes plot via UI
await db.execute(`
  UPDATE movies
  SET plot = ?,
      plot_locked = 1,           -- Lock the field
      has_unpublished_changes = 1
  WHERE id = ?
`, [newPlot, movieId]);
```

**Enrichment Respects Locks**:
```typescript
async function enrichMovie(movieId: number): Promise<void> {
  const movie = await db.getMovie(movieId);
  const tmdbData = await tmdb.getMovieDetails(movie.tmdb_id);

  // Build update object, skipping locked fields
  const updates: any = {};

  if (!movie.plot_locked && tmdbData.overview) {
    updates.plot = tmdbData.overview;
  }

  if (!movie.tagline_locked && tmdbData.tagline) {
    updates.tagline = tmdbData.tagline;
  }

  // ... (repeat for all fields)

  if (Object.keys(updates).length > 0) {
    await db.updateMovie(movieId, updates);
  }
}
```

### Asset Locking

**Trigger**: User manually selects asset or replaces auto-selected asset

```typescript
// User manually selects poster
await db.transaction(async () => {
  // Deselect old
  await db.execute(`
    UPDATE asset_candidates
    SET is_selected = 0
    WHERE entity_type = 'movie'
      AND entity_id = ?
      AND asset_type = 'poster'
  `, [movieId]);

  // Select new
  await db.execute(`
    UPDATE asset_candidates
    SET is_selected = 1,
        selected_by = 'manual',  -- Key: marked as manual
        selected_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [newCandidateId]);

  // Lock at entity level
  await db.execute(`
    UPDATE movies
    SET poster_locked = 1,
        has_unpublished_changes = 1
    WHERE id = ?
  `, [movieId]);
});
```

**Auto-Selection Respects Locks**:
```typescript
// Check if poster is locked before auto-selecting
const movie = await db.getMovie(movieId);

if (!movie.poster_locked) {
  await assetSelector.autoSelectAssets(movieId, 'movie', 'poster');
}
```

### Unlock UI

**Purpose**: Allow user to re-enable automation for specific fields/assets

```typescript
// User clicks "Unlock All Fields"
await db.execute(`
  UPDATE movies SET
    plot_locked = 0,
    tagline_locked = 0,
    poster_locked = 0,
    fanart_locked = 0,
    actors_locked = 0,
    genres_locked = 0
  WHERE id = ?
`, [movieId]);

// User can then click "Re-enrich" to fetch latest data
```

**UI Design**:
```
┌────────────────────────────────────────────────────────┐
│ Movie: The Matrix                                      │
├────────────────────────────────────────────────────────┤
│                                                        │
│ Plot: [Text field]                     🔒 User Locked │
│                                                        │
│ Tagline: [Text field]                  🤖 Auto        │
│                                                        │
│ Poster: [Image]                        🔒 User Locked │
│   [Replace Image] [Unlock]                            │
│                                                        │
│ Fanart: [Images]                       🤖 Auto        │
│   [Replace Images] [Unlock]                           │
│                                                        │
│ [Unlock All Fields]          [Re-enrich from TMDB]    │
│                                                        │
└────────────────────────────────────────────────────────┘
```

---

## Background Job Queue

### Purpose

Process long-running tasks (enrichment, asset selection, publishing) without blocking UI.

### Job Types

| Job Type | Priority | Pauseable | Typical Duration |
|----------|----------|-----------|------------------|
| `webhook_process` | 1 (Critical) | No | 5-30 seconds |
| `user_publish` | 2 (High) | No | 1-5 seconds |
| `user_enrich` | 3 (High) | No | 2-10 seconds |
| `auto_enrich` | 5 (Normal) | Yes | 2-10 seconds |
| `auto_select` | 5 (Normal) | Yes | 1-5 seconds |
| `library_scan` | 7 (Low) | Yes | Hours (pauseable) |
| `garbage_collect` | 10 (Background) | Yes | Minutes |

### Database Schema

```sql
CREATE TABLE job_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_type TEXT NOT NULL,
  priority INTEGER NOT NULL,

  payload TEXT NOT NULL,  -- JSON: { entityId, options, ... }

  status TEXT DEFAULT 'pending',  -- 'pending', 'processing', 'completed', 'failed', 'cancelled'

  -- Progress tracking
  progress_current INTEGER DEFAULT 0,
  progress_total INTEGER DEFAULT 0,
  progress_message TEXT,

  -- Retry logic
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  next_retry_at TIMESTAMP,

  -- Timing
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,

  -- Error handling
  error_message TEXT,
  error_stack TEXT,

  -- Cancellation
  is_cancellable BOOLEAN DEFAULT 1,
  cancelled_at TIMESTAMP
);

CREATE INDEX idx_job_queue_processing
  ON job_queue(status, priority, created_at)
  WHERE status = 'pending';
```

### Worker Implementation

```typescript
class JobWorker {
  private isRunning = false;
  private currentJob: Job | null = null;

  async start(): Promise<void> {
    this.isRunning = true;

    while (this.isRunning) {
      // 1. Fetch next job (highest priority, oldest first)
      const job = await db.query(`
        SELECT * FROM job_queue
        WHERE status = 'pending'
        ORDER BY priority ASC, created_at ASC
        LIMIT 1
      `);

      if (job.length === 0) {
        // No jobs, wait 100ms
        await sleep(100);
        continue;
      }

      this.currentJob = job[0];

      // 2. Mark as processing
      await db.execute(`
        UPDATE job_queue
        SET status = 'processing',
            started_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [this.currentJob.id]);

      // 3. Execute job
      try {
        await this.executeJob(this.currentJob);

        // Mark as completed
        await db.execute(`
          UPDATE job_queue
          SET status = 'completed',
              completed_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [this.currentJob.id]);

      } catch (error) {
        // Handle failure
        await this.handleJobFailure(this.currentJob, error);
      }

      this.currentJob = null;
    }
  }

  async executeJob(job: Job): Promise<void> {
    const payload = JSON.parse(job.payload);

    switch (job.job_type) {
      case 'enrich':
        await enrichmentService.enrichEntity(
          payload.entityType,
          payload.entityId
        );
        break;

      case 'auto_select':
        await assetSelector.autoSelectAssets(
          payload.entityId,
          payload.entityType,
          payload.assetType
        );
        break;

      case 'publish':
        await publishService.publishEntity(
          payload.entityType,
          payload.entityId
        );
        break;

      case 'library_scan':
        await scanService.scanLibrary(payload.libraryId);
        break;

      default:
        throw new Error(`Unknown job type: ${job.job_type}`);
    }
  }

  async handleJobFailure(job: Job, error: Error): Promise<void> {
    const retryCount = job.retry_count + 1;

    if (retryCount <= job.max_retries) {
      // Retry with exponential backoff
      const backoffMs = Math.pow(2, retryCount) * 1000;  // 2s, 4s, 8s

      await db.execute(`
        UPDATE job_queue
        SET status = 'pending',
            retry_count = ?,
            next_retry_at = DATETIME('now', '+${backoffMs} milliseconds'),
            error_message = ?
        WHERE id = ?
      `, [retryCount, error.message, job.id]);

    } else {
      // Max retries exceeded, mark as failed
      await db.execute(`
        UPDATE job_queue
        SET status = 'failed',
            completed_at = CURRENT_TIMESTAMP,
            error_message = ?,
            error_stack = ?
        WHERE id = ?
      `, [error.message, error.stack, job.id]);
    }
  }

  async stop(): Promise<void> {
    this.isRunning = false;

    // Wait for current job to finish
    while (this.currentJob !== null) {
      await sleep(100);
    }
  }
}
```

### Job Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│                      JOB LIFECYCLE                           │
└─────────────────────────────────────────────────────────────┘

PENDING
  │
  │ Worker picks up job (highest priority, oldest first)
  ↓
PROCESSING
  │
  ├─ Success → COMPLETED
  │
  ├─ Failure (retry_count < max_retries) → PENDING (with backoff)
  │
  └─ Failure (retry_count >= max_retries) → FAILED
```

---

## Rate Limiting

### Purpose

Prevent hammering provider APIs, respect API quotas.

### Provider Limits

| Provider | Limit | Window | Reserved Capacity |
|----------|-------|--------|-------------------|
| TMDB | 50 requests | 1 second | 10 (for webhooks) |
| TVDB | 1 request | 1 second | 0 |
| Fanart.tv | 2 requests | 1 second | 0 |

### Implementation

```typescript
class RateLimiter {
  private requestsInWindow = 0;
  private windowStart = Date.now();

  constructor(
    private maxRequests: number,
    private windowMs: number,
    private reservedCapacity: number = 0
  ) {}

  canMakeRequest(priority: number): boolean {
    this.resetWindowIfExpired();

    const availableCapacity = priority <= 2
      ? this.maxRequests  // High priority gets full capacity
      : this.maxRequests - this.reservedCapacity;  // Normal priority gets reduced capacity

    return this.requestsInWindow < availableCapacity;
  }

  async executeWithWait<T>(
    fn: () => Promise<T>,
    priority: number = 5
  ): Promise<T> {
    while (!this.canMakeRequest(priority)) {
      await this.waitForNextWindow();
    }

    this.requestsInWindow++;
    return fn();
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
}

// Global rate limiters
const tmdbLimiter = new RateLimiter(50, 1000, 10);  // 50/sec, reserve 10 for webhooks
const tvdbLimiter = new RateLimiter(1, 1000, 0);     // 1/sec, no reservation
```

**Usage in Enrichment**:
```typescript
async function enrichFromTMDB(movieId: number, priority: number = 5): Promise<void> {
  const movie = await db.getMovie(movieId);

  // Respect rate limit
  const data = await tmdbLimiter.executeWithWait(
    () => tmdb.getMovieDetails(movie.tmdb_id, { append_to_response: 'credits,images' }),
    priority
  );

  // Process data...
}
```

---

## Configuration Reference

### Library Automation Config

```sql
CREATE TABLE library_automation_config (
  library_id INTEGER PRIMARY KEY,

  -- Automation mode
  automation_mode TEXT DEFAULT 'hybrid',  -- 'manual', 'yolo', 'hybrid'

  -- Phase 2 behavior
  auto_enrich BOOLEAN DEFAULT 1,
  auto_select_assets BOOLEAN DEFAULT 1,
  auto_publish BOOLEAN DEFAULT 0,         -- Only true for 'yolo' mode

  -- Webhook behavior
  webhook_enabled BOOLEAN DEFAULT 1,
  webhook_auto_publish BOOLEAN DEFAULT 1,  -- Always publish on webhook

  FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE
);
```

### Asset Selection Config

```sql
CREATE TABLE asset_selection_config (
  library_id INTEGER PRIMARY KEY,
  asset_type TEXT NOT NULL,

  -- Quantity
  min_count INTEGER DEFAULT 1,
  max_count INTEGER DEFAULT 3,

  -- Quality filters
  min_width INTEGER,
  min_height INTEGER,
  prefer_language TEXT DEFAULT 'en',

  -- Scoring weights (must sum to 1.0)
  weight_resolution REAL DEFAULT 0.3,
  weight_votes REAL DEFAULT 0.4,
  weight_language REAL DEFAULT 0.2,
  weight_provider REAL DEFAULT 0.1,

  -- Duplicate detection
  phash_similarity_threshold REAL DEFAULT 0.90,

  FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE,
  UNIQUE(library_id, asset_type)
);
```

---

## Related Documentation

- **[ARCHITECTURE.md](ARCHITECTURE.md)** - Overall system design
- **[WORKFLOWS.md](WORKFLOWS.md)** - Detailed operational workflows
- **[WEBHOOKS.md](WEBHOOKS.md)** - Webhook payload reference
- **[ASSET_MANAGEMENT.md](ASSET_MANAGEMENT.md)** - Three-tier asset system
- **[PUBLISHING_WORKFLOW.md](PUBLISHING_WORKFLOW.md)** - Dirty state and publishing
- **[FIELD_LOCKING.md](FIELD_LOCKING.md)** - Field-level locking details
