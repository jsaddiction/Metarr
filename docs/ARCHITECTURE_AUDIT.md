# Metarr Architecture Audit

**Date**: 2025-10-15
**Purpose**: Document current architectural issues and design correct job queue-centric architecture

---

## 🔴 Critical Issues Identified

### Issue #1: Webhook Processing Bypasses Job Queue

**File**: `src/services/webhookProcessingService.ts`

**Current Flow** (WRONG):
```
WebhookController
  → webhookProcessingService.handleRadarrDownload()
    → scanMovieDirectory() [DIRECT CALL - 30+ seconds]
    → notifyMediaPlayers() [DIRECT CALL]
  → Returns 200 OK (TOO LATE - Radarr times out)
```

**Problems**:
- ❌ Synchronous execution blocks HTTP thread
- ❌ No job tracking/progress visibility
- ❌ No retry capability on failure
- ❌ No priority management
- ❌ Cannot test components independently

**Lines of concern**:
- Line 128: `await scanMovieDirectory(...)` - Direct service call
- Line 140: `await this.notifyMediaPlayers(...)` - Direct service call
- Line 197: `await scanMovieDirectory(...)` - Direct service call (Rename handler)
- Line 207: `await this.notifyMediaPlayers(...)` - Direct service call (Rename handler)

---

### Issue #2: Service Cross-Dependencies

**Direct Service-to-Service Calls Found**:

1. **webhookProcessingService.ts**:
   - Calls `scanMovieDirectory()` directly (unifiedScanService)
   - Calls `applyManagerPathMapping()` directly (pathMappingService)
   - Calls `applyGroupPathMapping()` directly (pathMappingService)
   - Calls `mediaPlayerManager.getHttpClient()` directly

2. **jobHandlers.ts**:
   - Creates service instances: AssetDiscoveryService, ProviderAssetService, etc.
   - This is OK (handlers coordinate services)
   - But the webhook handler is NOT being used!

**Problem**: Services call other services directly instead of creating jobs.

---

### Issue #3: Duplicate Webhook Implementations

**Two implementations exist**:

1. **webhookProcessingService.ts** (lines 82-615):
   - Full implementation with direct calls
   - ✅ Currently being used
   - ❌ Wrong architecture (bypasses queue)

2. **jobHandlers.ts** (lines 62-131):
   - Stub webhook handler in job queue
   - ✅ Correct architecture (job-based)
   - ❌ Not being used (old implementation)

**Problem**: The correct architecture exists but isn't being used!

---

## ✅ Correct Architecture: Job Queue as Central Hub

### Principle: All Async Work Goes Through Job Queue

```
┌─────────────────────────────────────────────────────────────┐
│                      JOB QUEUE                              │
│                   (Central Orchestrator)                    │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │
│  │  Webhook    │  │  Library    │  │  Enrich     │       │
│  │   Jobs      │  │  Scan Jobs  │  │  Metadata   │  ...  │
│  │ Priority: 1 │  │ Priority: 8 │  │ Priority: 5 │       │
│  └─────────────┘  └─────────────┘  └─────────────┘       │
│                                                             │
│  Job States: pending → processing → completed/failed       │
│  Features: Retry, Priority, Progress Tracking              │
└─────────────────────────────────────────────────────────────┘
                            │
           ┌────────────────┼────────────────┐
           ▼                ▼                ▼
    ┌────────────┐   ┌────────────┐   ┌────────────┐
    │  Service A │   │  Service B │   │  Service C │
    │  (Isolated)│   │  (Isolated)│   │  (Isolated)│
    └────────────┘   └────────────┘   └────────────┘
     No direct calls between services!
     All coordination through job queue.
```

### Rules:

1. **Services NEVER call other services directly**
   - Exception: Utility services (logger, database, cache)

2. **All async work creates a job**
   - Webhooks create jobs
   - User actions create jobs
   - Scheduled tasks create jobs

3. **JobHandlers coordinate services**
   - Handlers are the ONLY place services interact
   - Handlers create follow-up jobs if needed

4. **Services are pure functions**
   - Input: Job payload + dependencies
   - Output: Result (success/failure)
   - Side effects: Only through explicit job creation

---

## 🎯 Correct Flow Examples

### Example 1: Webhook Processing

**Current (WRONG)**:
```typescript
// webhookController.ts
await webhookService.handleRadarrDownload(payload);
res.json({ status: 'success' }); // Too late!

// webhookProcessingService.ts
async handleRadarrDownload(payload) {
  await scanMovieDirectory(...); // Direct call!
  await notifyMediaPlayers(...); // Direct call!
}
```

**Correct (JOB QUEUE)**:
```typescript
// webhookController.ts
await jobQueue.addJob({
  type: 'webhook',
  priority: 1,
  payload: { source: 'radarr', eventType: 'Download', ...payload }
});
res.json({ status: 'success' }); // Immediate!

// jobHandlers.ts
async handleWebhook(job: Job) {
  const { source, eventType, movie } = job.payload;

  // Create scan job
  await jobQueue.addJob({
    type: 'scan-movie',
    priority: 2,
    payload: { moviePath: movie.folderPath, tmdbId: movie.tmdbId }
  });
}

// Later, when scan completes...
async handleScanMovie(job: Job) {
  const result = await scanMovieDirectory(...);

  // Create notification job
  await jobQueue.addJob({
    type: 'notify-players',
    priority: 3,
    payload: { libraryId: result.libraryId }
  });
}
```

### Example 2: Service Isolation for Testing

**Current (HARD TO TEST)**:
```typescript
// webhookProcessingService.ts
async handleRadarrDownload(payload) {
  const mappedPath = await applyManagerPathMapping(...);
  const scanResult = await scanMovieDirectory(...);
  await this.notifyMediaPlayers(...);
}
// Can't test scanning without triggering notifications!
```

**Correct (ISOLATED TESTING)**:
```typescript
// Each service is independently testable:

// Test 1: Test ONLY scanning
test('scanMovieDirectory creates correct database records', async () => {
  const result = await scanMovieDirectory(mockDb, libraryId, path, context);
  expect(result.movieId).toBeDefined();
  expect(result.isNewMovie).toBe(true);
});

// Test 2: Test ONLY path mapping
test('applyManagerPathMapping translates Radarr to Metarr paths', async () => {
  const mapped = await applyManagerPathMapping(mockDb, 'radarr', '/movies/Matrix');
  expect(mapped).toBe('/data/movies/Matrix');
});

// Test 3: Test ONLY notification
test('notifyMediaPlayers triggers scan on Kodi', async () => {
  await notifyMediaPlayers(mockDb, mockPlayerManager, libraryId);
  expect(mockKodiClient.scanVideoLibrary).toHaveBeenCalledWith({ directory: '/movies' });
});

// Test 4: Test ONLY job coordination
test('webhook handler creates scan job', async () => {
  await jobHandlers.handleWebhook({ type: 'webhook', payload: radarrPayload });
  const jobs = await db.query('SELECT * FROM job_queue WHERE type = "scan-movie"');
  expect(jobs.length).toBe(1);
});
```

---

## 📊 Job Flow Visibility

### Job Lifecycle Logging

Each job should log at every stage:

```typescript
// Job created
logger.info('Job created', {
  jobId: 123,
  type: 'webhook',
  priority: 1,
  source: 'webhookController',
  context: { movieTitle: 'The Matrix' }
});

// Job picked for processing
logger.info('Job started', {
  jobId: 123,
  type: 'webhook',
  waitTime: '2.3s'
});

// Job progress (optional, for long-running jobs)
logger.info('Job progress', {
  jobId: 123,
  type: 'scan-movie',
  progress: '50%',
  detail: 'Assets discovered'
});

// Job completed
logger.info('Job completed', {
  jobId: 123,
  type: 'webhook',
  duration: '0.5s',
  result: { success: true, movieId: 456 }
});

// Job failed
logger.error('Job failed', {
  jobId: 123,
  type: 'webhook',
  error: 'TMDB API timeout',
  retryCount: 1,
  maxRetries: 3,
  willRetry: true
});
```

### Service-Specific Logging Context

Each service should include its name in logs:

```typescript
// scanService.ts
logger.info('[ScanService] Starting movie scan', {
  service: 'ScanService',
  operation: 'scanMovieDirectory',
  libraryId: 123,
  path: '/movies/Matrix'
});

// pathMappingService.ts
logger.info('[PathMappingService] Applying manager path mapping', {
  service: 'PathMappingService',
  operation: 'applyManagerPathMapping',
  manager: 'radarr',
  inputPath: '/downloads/Matrix',
  outputPath: '/movies/Matrix'
});

// mediaPlayerConnectionManager.ts
logger.info('[MediaPlayerManager] Notifying players', {
  service: 'MediaPlayerManager',
  operation: 'notifyMediaPlayers',
  groupId: 1,
  playerCount: 3
});
```

---

## 🔧 Refactoring Plan

### Phase 1: Add Job Types

**File**: `src/types/jobs.ts`

Add new job types:
```typescript
export type JobType =
  | 'webhook'
  | 'scan-movie'           // NEW
  | 'notify-players'       // NEW
  | 'discover-assets'
  | 'fetch-provider-assets'
  | 'enrich-metadata'
  | 'select-assets'
  | 'publish'
  | 'library-scan'
  | 'scheduled-file-scan'
  | 'scheduled-provider-update';
```

### Phase 2: Update WebhookController

**File**: `src/controllers/webhookController.ts`

Change from direct service calls to job creation:
```typescript
async handleRadarr(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const payload = req.body as RadarrWebhookPayload;
    this.validateRadarrPayload(payload);

    // Create webhook job (CRITICAL priority)
    await this.jobQueue.addJob({
      type: 'webhook',
      priority: 1,
      payload: {
        source: 'radarr',
        eventType: payload.eventType,
        movie: payload.movie,
        movieFile: payload.movieFile
      },
      max_retries: 3
    });

    // Return immediately (don't wait for processing)
    res.json({ status: 'success', message: 'Webhook queued for processing' });
  } catch (error) {
    next(error);
  }
}
```

### Phase 3: Implement Webhook Job Handler

**File**: `src/services/jobHandlers.ts`

Update webhook handler to coordinate services:
```typescript
async handleWebhook(job: Job): Promise<void> {
  const { source, eventType, movie, movieFile } = job.payload;

  logger.info('[JobHandlers] Processing webhook', {
    service: 'JobHandlers',
    handler: 'handleWebhook',
    jobId: job.id,
    source,
    eventType
  });

  if (eventType === 'Download' && source === 'radarr') {
    // Apply path mapping
    const mappedPath = await applyManagerPathMapping(
      this.db,
      'radarr',
      movie.folderPath
    );

    // Find library
    const libraryId = await this.findLibraryByPath(mappedPath);

    // Create scan job (HIGH priority)
    await this.jobQueue.addJob({
      type: 'scan-movie',
      priority: 2,
      payload: {
        libraryId,
        moviePath: mappedPath,
        tmdbId: movie.tmdbId,
        title: movie.title,
        year: movie.year
      },
      max_retries: 3
    });

    logger.info('[JobHandlers] Scan job created', {
      jobId: job.id,
      scanJobType: 'scan-movie',
      libraryId
    });
  }
  // Handle other event types...
}
```

### Phase 4: Create Scan Job Handler

**File**: `src/services/jobHandlers.ts`

New handler for scan jobs:
```typescript
async handleScanMovie(job: Job): Promise<void> {
  const { libraryId, moviePath, tmdbId, title, year } = job.payload;

  logger.info('[JobHandlers] Processing scan job', {
    service: 'JobHandlers',
    handler: 'handleScanMovie',
    jobId: job.id,
    libraryId,
    moviePath
  });

  // Build scan context
  const scanContext: ScanContext = {
    tmdbId,
    title,
    year,
    trigger: 'webhook'
  };

  // Execute scan (isolated service call)
  const scanResult = await scanMovieDirectory(
    this.dbManager,
    libraryId,
    moviePath,
    scanContext
  );

  logger.info('[JobHandlers] Scan completed', {
    jobId: job.id,
    movieId: scanResult.movieId,
    isNewMovie: scanResult.isNewMovie
  });

  // Create notification job (NORMAL priority)
  await this.jobQueue.addJob({
    type: 'notify-players',
    priority: 5,
    payload: {
      libraryId,
      movieId: scanResult.movieId
    },
    max_retries: 2
  });
}
```

### Phase 5: Create Notification Job Handler

**File**: `src/services/jobHandlers.ts`

New handler for player notifications:
```typescript
async handleNotifyPlayers(job: Job): Promise<void> {
  const { libraryId } = job.payload;

  logger.info('[JobHandlers] Processing notification job', {
    service: 'JobHandlers',
    handler: 'handleNotifyPlayers',
    jobId: job.id,
    libraryId
  });

  // Get library path
  const libraries = await this.db.query<{ path: string }>(
    'SELECT path FROM libraries WHERE id = ?',
    [libraryId]
  );

  if (libraries.length === 0) {
    throw new Error(`Library ${libraryId} not found`);
  }

  const libraryPath = libraries[0].path;

  // Get all groups for this library
  const groups = await this.db.query<{ id: number; name: string }>(
    `SELECT DISTINCT mpg.id, mpg.name
     FROM media_player_groups mpg
     INNER JOIN media_player_libraries mpl ON mpg.id = mpl.group_id
     WHERE mpl.library_id = ?`,
    [libraryId]
  );

  // Notify each group
  for (const group of groups) {
    try {
      await this.notifyGroup(group.id, libraryPath);
      logger.info('[JobHandlers] Group notified', {
        jobId: job.id,
        groupId: group.id,
        groupName: group.name
      });
    } catch (error: any) {
      logger.error('[JobHandlers] Failed to notify group', {
        jobId: job.id,
        groupId: group.id,
        error: error.message
      });
      // Continue with other groups
    }
  }
}
```

### Phase 6: Extract Media Player Notification Service

**File**: `src/services/mediaPlayerNotificationService.ts` (NEW)

Create dedicated service for notifications:
```typescript
export class MediaPlayerNotificationService {
  constructor(
    private db: DatabaseConnection,
    private mediaPlayerManager: MediaPlayerConnectionManager
  ) {}

  /**
   * Notify a media player group to scan their library
   */
  async notifyGroup(groupId: number, libraryPath: string): Promise<void> {
    logger.info('[MediaPlayerNotificationService] Notifying group', {
      service: 'MediaPlayerNotificationService',
      operation: 'notifyGroup',
      groupId,
      libraryPath
    });

    // Get enabled players in group
    const players = await this.db.query<{ id: number; name: string; type: string }>(
      `SELECT id, name, type FROM media_players
       WHERE group_id = ? AND enabled = 1
       ORDER BY id ASC`,
      [groupId]
    );

    if (players.length === 0) {
      logger.warn('[MediaPlayerNotificationService] No enabled players in group', {
        groupId
      });
      return;
    }

    // Apply group path mapping
    const mappedPath = await applyGroupPathMapping(this.db, groupId, libraryPath);

    // Try each player (with fallback)
    for (const player of players) {
      try {
        if (player.type !== 'kodi') {
          logger.warn('[MediaPlayerNotificationService] Unsupported player type', {
            playerId: player.id,
            type: player.type
          });
          continue;
        }

        const httpClient = this.mediaPlayerManager.getHttpClient(player.id);
        if (!httpClient) {
          logger.warn('[MediaPlayerNotificationService] HTTP client unavailable', {
            playerId: player.id
          });
          continue;
        }

        await httpClient.scanVideoLibrary({ directory: mappedPath });

        logger.info('[MediaPlayerNotificationService] Player notified', {
          playerId: player.id,
          playerName: player.name,
          path: mappedPath
        });

        return; // Success - exit
      } catch (error: any) {
        logger.warn('[MediaPlayerNotificationService] Player notification failed', {
          playerId: player.id,
          error: error.message
        });
        // Continue to next player
      }
    }

    throw new Error(`Failed to notify any player in group ${groupId}`);
  }
}
```

---

## 🧪 Testing Strategy

### Unit Tests (Isolated Services)

Test each service independently:

```typescript
// Test scanService
describe('scanMovieDirectory', () => {
  it('creates new movie when not exists', async () => {
    const result = await scanMovieDirectory(mockDb, 1, '/movies/Matrix', context);
    expect(result.isNewMovie).toBe(true);
  });

  it('updates existing movie when path changes', async () => {
    const result = await scanMovieDirectory(mockDb, 1, '/movies/Matrix', context);
    expect(result.pathChanged).toBe(true);
  });
});

// Test pathMappingService
describe('applyManagerPathMapping', () => {
  it('translates Radarr path to Metarr path', async () => {
    const mapped = await applyManagerPathMapping(mockDb, 'radarr', '/downloads/Matrix');
    expect(mapped).toBe('/data/movies/Matrix');
  });
});

// Test notificationService
describe('MediaPlayerNotificationService', () => {
  it('notifies first available player in group', async () => {
    await service.notifyGroup(1, '/movies');
    expect(mockKodiClient.scanVideoLibrary).toHaveBeenCalledWith({ directory: '/movies' });
  });

  it('falls back to second player if first fails', async () => {
    mockKodiClient.scanVideoLibrary.mockRejectedValueOnce(new Error('Offline'));
    await service.notifyGroup(1, '/movies');
    expect(mockKodiClient.scanVideoLibrary).toHaveBeenCalledTimes(2);
  });
});
```

### Integration Tests (Job Handlers)

Test job coordination:

```typescript
describe('JobHandlers', () => {
  it('webhook handler creates scan job', async () => {
    await jobHandlers.handleWebhook({
      type: 'webhook',
      payload: { source: 'radarr', eventType: 'Download', movie: {...} }
    });

    const scanJobs = await db.query('SELECT * FROM job_queue WHERE type = "scan-movie"');
    expect(scanJobs.length).toBe(1);
  });

  it('scan handler creates notification job', async () => {
    await jobHandlers.handleScanMovie({
      type: 'scan-movie',
      payload: { libraryId: 1, moviePath: '/movies/Matrix', ... }
    });

    const notifyJobs = await db.query('SELECT * FROM job_queue WHERE type = "notify-players"');
    expect(notifyJobs.length).toBe(1);
  });
});
```

### End-to-End Tests (Full Flow)

Test complete webhook flow:

```typescript
describe('Webhook Flow', () => {
  it('processes Radarr download webhook end-to-end', async () => {
    // 1. Send webhook
    const response = await request(app)
      .post('/api/webhooks/radarr')
      .send(radarrDownloadPayload);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('success');

    // 2. Verify webhook job created
    let jobs = await db.query('SELECT * FROM job_queue WHERE type = "webhook"');
    expect(jobs.length).toBe(1);

    // 3. Process webhook job
    await jobQueue.processNextJob();

    // 4. Verify scan job created
    jobs = await db.query('SELECT * FROM job_queue WHERE type = "scan-movie"');
    expect(jobs.length).toBe(1);

    // 5. Process scan job
    await jobQueue.processNextJob();

    // 6. Verify movie created in database
    const movies = await db.query('SELECT * FROM movies WHERE tmdb_id = ?', [tmdbId]);
    expect(movies.length).toBe(1);

    // 7. Verify notification job created
    jobs = await db.query('SELECT * FROM job_queue WHERE type = "notify-players"');
    expect(jobs.length).toBe(1);

    // 8. Process notification job
    await jobQueue.processNextJob();

    // 9. Verify Kodi notified
    expect(mockKodiClient.scanVideoLibrary).toHaveBeenCalled();
  });
});
```

---

## 📈 Job Queue Monitoring

### Database Schema

The `job_queue` table already exists. We need to ensure proper columns:

```sql
CREATE TABLE job_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  priority INTEGER NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  created_at DATETIME NOT NULL,
  started_at DATETIME,
  completed_at DATETIME
);

-- Index for job polling (priority-based)
CREATE INDEX idx_job_queue_status_priority
  ON job_queue(status, priority DESC, created_at ASC);
```

### WebSocket Progress Updates

**File**: `src/services/jobQueueService.ts`

Add progress broadcasting:

```typescript
async processNextJob(): Promise<void> {
  // ... existing code ...

  // Broadcast job started
  websocketBroadcaster.broadcast('job:started', {
    jobId: job.id,
    type: job.type,
    priority: job.priority
  });

  try {
    await handler(job);

    // Broadcast job completed
    websocketBroadcaster.broadcast('job:completed', {
      jobId: job.id,
      type: job.type,
      duration: Date.now() - startTime
    });
  } catch (error) {
    // Broadcast job failed
    websocketBroadcaster.broadcast('job:failed', {
      jobId: job.id,
      type: job.type,
      error: error.message,
      willRetry: job.retry_count < job.max_retries
    });
  }
}
```

### Frontend Job Monitoring (Future)

Display active jobs in UI:

```typescript
// System → Jobs page
const [activeJobs, setActiveJobs] = useState([]);

useWebSocket('job:started', (job) => {
  setActiveJobs(prev => [...prev, { ...job, status: 'processing' }]);
});

useWebSocket('job:completed', (job) => {
  setActiveJobs(prev => prev.filter(j => j.jobId !== job.jobId));
});

useWebSocket('job:failed', (job) => {
  setActiveJobs(prev => prev.map(j =>
    j.jobId === job.jobId ? { ...j, status: 'failed', error: job.error } : j
  ));
});
```

---

## 🎯 Summary: Job Queue as Central Hub

### Benefits of This Architecture

1. **Testability**: Each service is independently testable
2. **Visibility**: Every job logged and tracked
3. **Reliability**: Retry failed jobs automatically
4. **Performance**: Non-blocking webhook responses
5. **Priority**: Critical jobs (webhooks) processed first
6. **Scalability**: Easy to add workers/horizontal scaling
7. **Debugging**: Clear job history and error tracking

### Key Principles

1. **Services are pure functions**: Input → Process → Output
2. **Job queue coordinates**: Only place services interact
3. **No service-to-service calls**: Everything through jobs
4. **Logging with context**: Every log includes service name
5. **Job lifecycle tracking**: Created → Processing → Completed/Failed

### Next Steps

See [REFACTORING_PLAN.md](./REFACTORING_PLAN.md) for detailed implementation steps.

---

**Status**: Architecture documented, refactoring not yet started
**Owner**: Development team
**Priority**: HIGH (critical for production deployment)
