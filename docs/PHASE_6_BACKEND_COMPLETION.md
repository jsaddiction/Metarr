# Phase 6: Backend Completion - Scheduled Services & Job Queue Integration

## Overview

Phase 6 completes the critical backend infrastructure for Metarr by implementing:

1. **Scheduled Background Services** - Automated file scanning and provider updates
2. **Job Queue Integration** - Unified job processing with priority management
3. **WebSocket Broadcasting** - Real-time progress updates to frontend
4. **Manual Job Triggers** - User-initiated background jobs via API
5. **Scheduler Configuration** - Per-library scheduler settings

## Architecture

### Three-Layer System

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (API Calls)                     │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                    Scheduler Controller                          │
│  - Manual job triggers                                           │
│  - Configuration management                                      │
└────────────┬───────────────────────────────┬────────────────────┘
             │                               │
┌────────────▼────────────┐     ┌───────────▼──────────────┐
│  FileScannerScheduler   │     │ ProviderUpdaterScheduler │
│  - Check interval: 60s  │     │  - Check interval: 5min  │
│  - Queues jobs          │     │  - Queues jobs           │
└────────────┬────────────┘     └───────────┬──────────────┘
             │                               │
             └───────────┬───────────────────┘
                         ▼
              ┌─────────────────────┐
              │   JobQueueService   │
              │  - Priority-based   │
              │  - Auto-retry       │
              │  - WebSocket bcast  │
              └──────────┬──────────┘
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
┌───────────────┐ ┌────────────────┐ ┌──────────────┐
│   File Scan   │ │ Provider Update│ │  Other Jobs  │
│    Handler    │ │     Handler    │ │   (future)   │
└───────────────┘ └────────────────┘ └──────────────┘
```

### Job Priority System

| Priority | Type | Use Case | Examples |
|----------|------|----------|----------|
| 1 | Critical | Webhooks from *arr | Immediate processing of new downloads |
| 2-4 | High | User-initiated | Manual scans, manual provider updates |
| 5-7 | Normal | Scheduled automated | Provider update scheduler |
| 8-10 | Low | Background maintenance | File scanner scheduler |

## Key Features

### 1. Scheduled Background Services

#### File Scanner Scheduler (`src/services/schedulers/FileScannerScheduler.ts`)

**Purpose:** Periodically scans libraries for filesystem changes (new/moved/deleted files)

**Configuration:**
- Default interval: 4 hours
- Check frequency: Every 60 seconds
- Default state: Disabled (user must enable)

**Job Flow:**
1. Scheduler checks if library needs scanning based on interval
2. If needed, queues `scheduled-file-scan` job with priority 9
3. Updates `last_run` timestamp IMMEDIATELY (before job starts)
4. Job handler runs actual file scan logic

**Manual Trigger:**
- API: `POST /api/libraries/:id/scheduler/file-scan/trigger`
- Priority: 4 (higher than automated)
- Resets interval timer

#### Provider Updater Scheduler (`src/services/schedulers/ProviderUpdaterScheduler.ts`)

**Purpose:** Periodically fetches updated metadata and assets from providers

**Configuration:**
- Default interval: 168 hours (weekly)
- Check frequency: Every 5 minutes
- Default state: Disabled (user must enable)

**Job Flow:**
1. Scheduler checks if library needs provider updates
2. If needed, queues `scheduled-provider-update` job with priority 7
3. Updates `last_run` timestamp IMMEDIATELY (before job starts)
4. Job handler processes up to 100 movies per run

**Manual Trigger:**
- API: `POST /api/libraries/:id/scheduler/provider-update/trigger`
- Priority: 4 (higher than automated)
- Resets interval timer

**Efficient Provider Updates:**
- Fetches metadata + assets in ONE API call per movie
- Respects field locks (won't overwrite user edits)
- Only processes movies with `tmdb_id` (already identified)
- Updates `last_scraped_at` timestamp after processing

### 2. Job Queue Integration

#### New Job Types

```typescript
export type JobType =
  | 'webhook'
  | 'discover-assets'
  | 'fetch-provider-assets'
  | 'enrich-metadata'
  | 'select-assets'
  | 'publish'
  | 'library-scan'
  | 'scheduled-file-scan'      // NEW - Automated file scanning
  | 'scheduled-provider-update'; // NEW - Automated provider updates
```

#### WebSocket Broadcasting

Job status updates are automatically broadcast to all connected clients:

```typescript
interface JobStatusMessage {
  type: 'jobStatus';
  timestamp: string;
  jobId: number;
  jobType: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'retrying';
  progress?: {
    current: number;
    total: number;
    message?: string;
  };
  error?: string;
  payload?: any;
}

interface JobQueueStatsMessage {
  type: 'jobQueueStats';
  timestamp: string;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  retrying: number;
}
```

**Frontend Integration:**
```typescript
// Connect to WebSocket
const ws = new WebSocket('ws://localhost:3000/ws');

// Listen for job status updates
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);

  if (message.type === 'jobStatus') {
    // Update UI with job progress
    console.log(`Job ${message.jobId}: ${message.status}`);
  }

  if (message.type === 'jobQueueStats') {
    // Update queue statistics display
    console.log(`Queue: ${message.processing} processing, ${message.pending} pending`);
  }
};
```

### 3. API Endpoints

#### Scheduler Status

```
GET /api/scheduler/status
```

**Response:**
```json
{
  "fileScanner": {
    "isRunning": false,
    "hasActiveInterval": true,
    "checkIntervalMs": 60000
  },
  "providerUpdater": {
    "isRunning": false,
    "hasActiveInterval": true,
    "checkIntervalMs": 300000
  }
}
```

#### Library Scheduler Configuration

```
GET /api/libraries/:libraryId/scheduler
```

**Response:**
```json
{
  "libraryId": 1,
  "fileScannerEnabled": true,
  "fileScannerIntervalHours": 4,
  "fileScannerLastRun": "2025-10-13T10:30:00Z",
  "providerUpdaterEnabled": true,
  "providerUpdaterIntervalHours": 168,
  "providerUpdaterLastRun": "2025-10-10T14:00:00Z"
}
```

```
PUT /api/libraries/:libraryId/scheduler
```

**Request Body:**
```json
{
  "fileScannerEnabled": true,
  "fileScannerIntervalHours": 6,
  "providerUpdaterEnabled": true,
  "providerUpdaterIntervalHours": 72
}
```

**Response:** Same as GET (updated config)

#### Manual Job Triggers

```
POST /api/libraries/:libraryId/scheduler/file-scan/trigger
```

**Response:**
```json
{
  "message": "File scan job queued successfully",
  "jobId": 42,
  "libraryId": 1
}
```

```
POST /api/libraries/:libraryId/scheduler/provider-update/trigger
```

**Response:**
```json
{
  "message": "Provider update job queued successfully",
  "jobId": 43,
  "libraryId": 1
}
```

## Database Schema

### library_scheduler_config

Stores per-library scheduler settings:

```sql
CREATE TABLE library_scheduler_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  library_id INTEGER NOT NULL UNIQUE,

  -- File Scanner configuration
  file_scanner_enabled BOOLEAN NOT NULL DEFAULT 0,
  file_scanner_interval_hours INTEGER NOT NULL DEFAULT 4,
  file_scanner_last_run DATETIME,

  -- Provider Updater configuration (metadata + assets combined)
  provider_updater_enabled BOOLEAN NOT NULL DEFAULT 0,
  provider_updater_interval_hours INTEGER NOT NULL DEFAULT 168,
  provider_updater_last_run DATETIME,

  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE
);
```

## Implementation Details

### Timestamp Strategy (Critical)

**Why timestamp when queuing (not when completing)?**

The user requirement: *"The next job should be scheduled based on the start time of the last run of a job so that if a user forces a start, then the next job appropriately waits the configured periodicity."*

**Without this strategy:**
```
User manually triggers job at 10:00 AM
Job completes at 10:05 AM
last_run updated to 10:05 AM
Next automatic run: 10:05 AM + 4 hours = 2:05 PM
Result: Only 4 hours from manual trigger START
```

**With our strategy:**
```
User manually triggers job at 10:00 AM
last_run IMMEDIATELY updated to 10:00 AM
Job completes at 10:05 AM (doesn't update timestamp)
Next automatic run: 10:00 AM + 4 hours = 2:00 PM
Result: Full 4 hours from manual trigger START ✓
```

**Implementation:**
```typescript
// In scheduler
const jobId = await this.jobQueueService.addJob({
  type: 'scheduled-file-scan',
  priority: 4,
  payload: { libraryId, manual: true },
});

// Update timestamp IMMEDIATELY (critical!)
await this.schedulerConfigService.updateFileScannerLastRun(libraryId);
```

### Separation of Concerns

**Schedulers (Lightweight):**
- Check if libraries need processing
- Queue jobs to the job queue
- Update timestamps
- No heavy logic

**Handlers (Heavy):**
- Actual processing logic
- Database operations
- Provider API calls
- Error handling

**Benefits:**
- Clean architecture
- Easy testing
- Reusable handlers
- Consistent job processing

### Provider Update Efficiency

The provider updater combines metadata and asset fetching in ONE API call:

```typescript
// Fetch full movie details (includes metadata + images)
const tmdbMovie = await tmdbClient.getMovie(movie.tmdb_id);

// Update metadata (respects field locks)
await updateMovieMetadata(dbManager, movie.id, tmdbMovie);

// Update asset candidates
await updateMovieAssets(dbManager, movie.id, movie.tmdb_id);

// Update timestamp
await dbManager.getConnection().execute(
  'UPDATE movies SET last_scraped_at = CURRENT_TIMESTAMP WHERE id = ?',
  [movie.id]
);
```

**Benefits:**
- 50% reduction in API calls vs separate fetches
- Respects TMDB rate limits
- User's manual edits preserved
- New candidates added without removing selections

## Frontend TODO

### Required UI Components

1. **Scheduler Configuration Panel** (Settings page)
   - Enable/disable schedulers per library
   - Configure intervals (hours)
   - Show last run timestamp
   - Show next run estimate

2. **Manual Job Trigger Buttons** (Library page)
   - "Force File Scan" button
   - "Force Provider Update" button
   - Show current job status
   - Disable buttons while job running

3. **Job Progress Display** (Dashboard)
   - Real-time job status updates via WebSocket
   - Progress bars for running jobs
   - Queue statistics (pending, processing, completed, failed)
   - Job history with filtering

4. **Job Status Indicators** (Library cards)
   - Visual indicator when scheduled job is running
   - Last successful run timestamp
   - Error count badge

### WebSocket Integration

```typescript
// Example React hook
function useJobStatus() {
  const [jobs, setJobs] = useState<Map<number, JobStatus>>(new Map());

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:3000/ws');

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);

      if (message.type === 'jobStatus') {
        setJobs(prev => new Map(prev).set(message.jobId, message));
      }
    };

    return () => ws.close();
  }, []);

  return jobs;
}
```

## Testing

### Manual Testing Checklist

- [ ] Create library with scheduler config
- [ ] Enable file scanner, verify it runs on schedule
- [ ] Enable provider updater, verify it runs on schedule
- [ ] Manually trigger file scan, verify higher priority
- [ ] Manually trigger provider update, verify higher priority
- [ ] Verify timestamp updates immediately when job queued
- [ ] Verify WebSocket broadcasts job status updates
- [ ] Verify scheduler config persists across restarts
- [ ] Verify field locks respected during provider updates
- [ ] Verify batch processing (100 movies per run)

### API Testing

```bash
# Get scheduler status
curl http://localhost:3000/api/scheduler/status

# Get library scheduler config
curl http://localhost:3000/api/libraries/1/scheduler

# Update library scheduler config
curl -X PUT http://localhost:3000/api/libraries/1/scheduler \
  -H "Content-Type: application/json" \
  -d '{
    "fileScannerEnabled": true,
    "fileScannerIntervalHours": 6,
    "providerUpdaterEnabled": true,
    "providerUpdaterIntervalHours": 72
  }'

# Manually trigger file scan
curl -X POST http://localhost:3000/api/libraries/1/scheduler/file-scan/trigger

# Manually trigger provider update
curl -X POST http://localhost:3000/api/libraries/1/scheduler/provider-update/trigger
```

## Future Enhancements

1. **Per-library job concurrency limits**
   - Prevent multiple scans of same library
   - Queue management per library

2. **Job scheduling UI**
   - Visual timeline of scheduled jobs
   - Estimated completion times
   - Job dependencies

3. **Advanced scheduling**
   - Cron-like expressions
   - Time-of-day restrictions
   - Rate limiting per provider

4. **Job result caching**
   - Cache successful job results
   - Skip unchanged files
   - Incremental updates only

5. **Multi-tenant support**
   - Per-user job queues
   - User-specific rate limits
   - Priority boosting for premium users

## Commits

- `feat: Phase 6 - Implement scheduled background services` (2663bc5)
- `feat: Phase 6 - Integrate scheduled services with job queue and WebSocket` (1db0d17)
- `feat(scheduler): add API endpoints for manual job triggers and scheduler configuration` (292b2fe)

## Related Documentation

- [WORKFLOWS.md](WORKFLOWS.md) - Two-phase scanning workflow
- [API_ARCHITECTURE.md](API_ARCHITECTURE.md) - REST API design
- [AUTOMATION_AND_WEBHOOKS.md](AUTOMATION_AND_WEBHOOKS.md) - Automation system
- [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) - Database tables

## Summary

Phase 6 completes the backend infrastructure for Metarr by implementing a robust scheduled job system with:

✅ **Two background schedulers** (file scanning + provider updates)
✅ **Unified job queue** with priority management
✅ **Real-time WebSocket broadcasting** for progress updates
✅ **Manual job triggers** via REST API
✅ **Per-library configuration** for scheduler settings
✅ **Efficient provider updates** (one API call per movie)
✅ **Field lock respect** (preserves user edits)
✅ **Proper timestamp management** (interval timing based on queue time)

The backend is now feature-complete and ready for frontend integration. All scheduled jobs report progress via WebSocket, can be manually triggered via API, and respect user configuration settings.
