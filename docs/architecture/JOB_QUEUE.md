# Job Queue System

**Purpose**: Background task processing architecture for phase automation and workflow management.

**Related Docs**:
- Parent: [Architecture Overview](OVERVIEW.md)
- Database: [Jobs Table](DATABASE.md#job-queue-table)
- Phases: [Phase Documentation](../phases/)

## Quick Reference

- **Implementation**: SQLite/PostgreSQL-based job queue
- **Workers**: Configurable worker pool for concurrent processing
- **Priority**: 1-10 scale (1 = highest priority)
- **Retry Logic**: Automatic retry with exponential backoff
- **Job Chaining**: Phases trigger subsequent phases
- **Progress**: Real-time WebSocket updates

## System Overview

Metarr uses a database-backed job queue to manage all background processing. This provides reliable, persistent, and observable task execution.

### Why Database-Backed Queue?

**Advantages**:
- **Persistence**: Survives application restarts
- **Observability**: Query job status, history, errors
- **Priority-based**: Critical jobs execute first
- **Simple**: No external dependencies (Redis, RabbitMQ)
- **Transactional**: Job creation atomic with database changes

**Trade-offs**:
- Less throughput than dedicated queues (acceptable for media management)
- Database I/O overhead (minimal for typical workloads)

## Job States

```
     ┌─────────┐
     │ pending │
     └────┬────┘
          │
          ▼
     ┌─────────┐        ┌─────────┐
     │ running │───────▶│completed│
     └────┬────┘        └─────────┘
          │
          ▼
     ┌─────────┐        ┌─────────────────┐
     │ failed  │───────▶│permanently failed│
     └────┬────┘        └─────────────────┘
          │
          ▼
     ┌─────────┐
     │retrying │──┐
     └─────────┘  │
          ▲       │
          └───────┘
```

### State Transitions

| From State | To State | Trigger |
|-----------|----------|---------|
| `pending` | `running` | Worker picks up job |
| `running` | `completed` | Job succeeds |
| `running` | `failed` | Job throws error |
| `failed` | `retrying` | Retry attempt < max_attempts |
| `retrying` | `running` | Retry delay elapsed |
| `failed` | `permanently failed` | Retry attempts exhausted |

### State Details

**pending**: Job created, waiting for worker
- Priority determines execution order
- No worker assigned yet

**running**: Worker actively processing job
- `worker_id` assigned
- `started_at` timestamp set
- Progress emitted via WebSocket

**completed**: Job finished successfully
- `completed_at` timestamp set
- `result` contains output data
- Triggers next phase job (if configured)

**failed**: Job encountered error
- `error` contains error message
- `attempts` incremented
- Will retry if `attempts < max_attempts`

**retrying**: Job scheduled for retry
- `next_retry` timestamp calculated (exponential backoff)
- Returns to `running` state when retry time reached

**permanently failed**: All retry attempts exhausted
- Manual intervention required
- Job can be reset and retried manually

## Job Structure

### Job Fields

```typescript
interface Job {
  id: number;
  type: string;                  // 'scan', 'enrich', 'publish', etc.
  status: JobStatus;             // 'pending', 'running', 'completed', 'failed'
  priority: number;              // 1-10 (1 = highest)

  // Payload
  entity_type?: string;          // 'movie', 'series', etc.
  entity_id?: number;            // Entity ID
  payload: string;               // JSON-encoded job data

  // Execution
  attempts: number;              // Current attempt count
  max_attempts: number;          // Maximum retry attempts (default: 3)
  worker_id?: string;            // Worker processing this job

  // Timing
  created_at: Date;
  started_at?: Date;
  completed_at?: Date;
  next_retry?: Date;

  // Results
  result?: string;               // JSON-encoded result data
  error?: string;                // Error message if failed
}
```

### Common Job Types

| Type | Purpose | Entity | Triggers |
|------|---------|--------|----------|
| `scan-library` | Discover media files | library | Manual, webhook, schedule |
| `enrich-metadata` | Fetch metadata & assets | movie/series | Post-scan, manual |
| `publish-assets` | Deploy cache to library | movie/series | Post-enrich, manual |
| `sync-player` | Update media player | player | Post-publish, manual |
| `verify-cache` | Check cache consistency | - | Manual, schedule |
| `cleanup-orphans` | Remove orphaned files | - | Schedule |

## Worker Pool

### Worker Architecture

```
Job Queue (Database)
        ↓
   Worker Pool (N workers)
        ↓
  ┌──────────┬──────────┬──────────┐
  │ Worker 1 │ Worker 2 │ Worker N │
  └──────────┴──────────┴──────────┘
       ↓          ↓          ↓
  Process job  Process job  Process job
```

### Worker Behavior

```typescript
// Simplified worker loop
while (true) {
  // 1. Fetch highest priority pending job
  const job = await fetchNextJob();

  if (!job) {
    // No jobs available, wait
    await sleep(1000);
    continue;
  }

  // 2. Mark job as running
  await markJobRunning(job.id, workerId);

  try {
    // 3. Execute job handler
    const result = await executeJobHandler(job);

    // 4. Mark job completed
    await markJobCompleted(job.id, result);

    // 5. Emit success event
    emitJobComplete(job.id, result);

    // 6. Create next phase job (if configured)
    await createNextPhaseJob(job, result);

  } catch (error) {
    // 7. Handle failure
    await handleJobFailure(job.id, error);
  }
}
```

### Worker Configuration

```typescript
// Configuration
const workerConfig = {
  concurrency: 4,          // Number of parallel workers
  pollInterval: 1000,      // Milliseconds between queue checks
  timeout: 300000,         // Job timeout (5 minutes)
  retryDelay: 5000,        // Initial retry delay
  retryMultiplier: 2,      // Exponential backoff multiplier
  maxRetries: 3            // Maximum retry attempts
};
```

## Priority System

### Priority Levels

| Priority | Use Case | Examples |
|----------|----------|----------|
| 1 | Critical manual actions | Manual enrichment, manual publish |
| 2 | User-initiated operations | Asset selection, metadata edit |
| 3 | High-priority automation | Webhook-triggered scans |
| 4 | (unused) | - |
| 5 | Normal automation | Auto-enrich, auto-publish |
| 6 | (unused) | - |
| 7 | Low-priority background | Verification, cache cleanup |
| 8-10 | (reserved) | Future use |

### Priority Behavior

Workers fetch jobs by priority:

```sql
SELECT * FROM jobs
WHERE status = 'pending'
ORDER BY priority ASC, created_at ASC
LIMIT 1;
```

**Key Points**:
- Lower number = higher priority
- Same priority: FIFO (created_at)
- Running jobs don't block higher priority jobs

## Retry Logic

### Retry Strategy

**Exponential Backoff**:
```
Attempt 1: Immediate
Attempt 2: Wait 5 seconds (5 * 2^0)
Attempt 3: Wait 10 seconds (5 * 2^1)
Attempt 4: Wait 20 seconds (5 * 2^2)
```

### Retry Conditions

**Retry** (transient errors):
- Network timeouts
- Provider API rate limits
- Temporary file system issues
- Database connection errors

**Don't Retry** (permanent errors):
- Invalid entity ID (entity deleted)
- Malformed payload
- Permission denied (file system)
- Provider returns 404 (content not found)

### Implementation

```typescript
async function handleJobFailure(job: Job, error: Error): Promise<void> {
  job.attempts++;
  job.error = error.message;

  if (job.attempts >= job.max_attempts) {
    // Permanently failed
    job.status = 'failed';
    await updateJob(job);
    emitJobFailed(job.id, error);
  } else if (isRetryableError(error)) {
    // Schedule retry
    const delay = calculateRetryDelay(job.attempts);
    job.status = 'retrying';
    job.next_retry = new Date(Date.now() + delay);
    await updateJob(job);
  } else {
    // Permanent error, don't retry
    job.status = 'failed';
    await updateJob(job);
    emitJobFailed(job.id, error);
  }
}
```

## Job Chaining

Phases trigger subsequent phases by creating new jobs.

### Chaining Pattern

```
Job A (enrich-metadata) completes
         ↓
Check if next phase enabled (publishing)
         ↓
Create Job B (publish-assets)
         ↓
Job B enters queue with priority
         ↓
Worker picks up Job B
         ↓
Job B processes
```

### Chaining Logic

```typescript
// Enrichment job handler
async function handleEnrichMetadata(job: Job): Promise<void> {
  const { entity_type, entity_id } = job.payload;

  // 1. Execute enrichment
  const result = await enrichmentService.enrich(entity_type, entity_id);

  // 2. Check if next phase enabled
  const publishEnabled = await isPhaseEnabled('publishing');

  if (!publishEnabled) {
    logger.info('Publishing disabled, stopping chain');
    return result;
  }

  // 3. Create next phase job
  await createJob({
    type: 'publish-assets',
    priority: job.payload.manual ? 1 : 5,  // Inherit priority context
    entity_type,
    entity_id,
    payload: {
      libraryPath: result.libraryPath,
      // ... other data
    }
  });

  return result;
}
```

### Chain Configuration

Chaining controlled by phase configuration:

```typescript
// Phase config example
{
  enrichment: {
    enabled: true,
    chainToPublish: true    // Create publish job after enrichment
  },
  publishing: {
    enabled: true,
    chainToSync: false      // Don't auto-sync players
  }
}
```

## Progress Tracking

### WebSocket Events

Jobs emit progress events via WebSocket for real-time UI updates.

```typescript
// Job progress event
socket.emit('job:progress', {
  job_id: 123,
  type: 'enrich-metadata',
  status: 'running',
  progress: 45,              // Percentage (0-100)
  message: 'Downloading poster from TMDB'
});

// Job complete event
socket.emit('job:complete', {
  job_id: 123,
  type: 'enrich-metadata',
  result: {
    assetsDownloaded: 5,
    metadataUpdated: true
  }
});

// Job failed event
socket.emit('job:failed', {
  job_id: 123,
  type: 'enrich-metadata',
  error: 'TMDB API rate limit exceeded',
  attempts: 2,
  max_attempts: 3
});
```

### Progress Implementation

```typescript
async function enrichMovie(movieId: number, emitProgress: ProgressFn): Promise<void> {
  emitProgress(10, 'Fetching metadata from TMDB');
  const metadata = await tmdbApi.getMovieDetails(movieId);

  emitProgress(30, 'Fetching asset candidates');
  const assets = await fetchAssetCandidates(movieId);

  emitProgress(50, 'Downloading selected assets');
  await downloadAssets(assets, (downloaded, total) => {
    const percent = 50 + (downloaded / total) * 40;
    emitProgress(percent, `Downloaded ${downloaded}/${total} assets`);
  });

  emitProgress(90, 'Saving to database');
  await saveMetadata(movieId, metadata);

  emitProgress(100, 'Enrichment complete');
}
```

## Job Management API

### Create Job

```typescript
POST /api/v1/jobs
Body: {
  type: 'enrich-metadata',
  priority: 1,
  payload: {
    entity_type: 'movie',
    entity_id: 123,
    manual: true
  }
}
```

### List Jobs

```typescript
GET /api/v1/jobs?status=running&type=enrich
```

### Cancel Job

```typescript
DELETE /api/v1/jobs/:id
```

### Retry Failed Job

```typescript
POST /api/v1/jobs/:id/retry
```

## Performance Considerations

### Database Load

**Polling Impact**: Workers query database every second
- Use indexed queries (`idx_jobs_status_priority`)
- Minimal overhead (< 1ms per query)

**Job Cleanup**: Completed jobs archived periodically
- Retention: 30 days completed, 90 days failed
- Prevents table bloat

### Concurrency

**Worker Count**: Configurable based on workload
- **Low volume** (< 1000 items): 2-4 workers
- **Medium volume** (1000-10000 items): 4-8 workers
- **High volume** (> 10000 items): 8-16 workers

**Bottlenecks**:
- Provider API rate limits (throttling needed)
- Disk I/O for asset downloads
- Database write throughput

### Memory Management

**Worker Memory**: Each worker maintains minimal state
- Job payload in memory during processing
- Released after completion
- No memory accumulation

**Large Payloads**: Avoid storing large data in job payload
- Store in database, reference by ID
- Use streaming for large files

## Monitoring

### Metrics

**Queue Depth**: Number of pending jobs
```sql
SELECT COUNT(*) FROM jobs WHERE status = 'pending';
```

**Average Processing Time**: Per job type
```sql
SELECT type, AVG(JULIANDAY(completed_at) - JULIANDAY(started_at)) * 86400 as avg_seconds
FROM jobs
WHERE status = 'completed'
GROUP BY type;
```

**Failure Rate**: Per job type
```sql
SELECT type,
  COUNT(CASE WHEN status = 'failed' THEN 1 END) * 100.0 / COUNT(*) as failure_rate
FROM jobs
GROUP BY type;
```

### Health Checks

**Queue Health**:
- Pending jobs not stuck (started_at too old)
- Workers processing (recently completed jobs)
- Failure rate acceptable (< 5%)

**Worker Health**:
- All workers running
- No workers hung (job timeout)
- Even job distribution

## See Also

- [Architecture Overview](OVERVIEW.md) - System design
- [Database Schema](DATABASE.md) - Jobs table structure
- [Phase Documentation](../phases/) - Job handlers for each phase
- [API Architecture](API.md) - Job management endpoints
