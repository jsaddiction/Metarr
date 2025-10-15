# Job Queue Refactor - Status Report

**Date**: 2025-10-15
**Status**: Foundation Complete, Integration In Progress

---

## ✅ Completed

### 1. Architecture Documentation
- **[ARCHITECTURE_AUDIT.md](./ARCHITECTURE_AUDIT.md)** - Identified architectural issues
- **[JOB_QUEUE_ARCHITECTURE.md](./JOB_QUEUE_ARCHITECTURE.md)** - Complete design specification

### 2. Database Migration
- **File**: `src/database/migrations/20251015_006_create_job_history.ts`
- **Features**:
  - Creates `job_history` table for completed/failed jobs
  - Adds indexes for fast queries (`idx_job_history_type_date`, `idx_job_history_cleanup`)
  - Adds `updated_at` column to `job_queue` table
  - Adds indexes for job picking (`idx_job_queue_pickup`, `idx_job_queue_processing`)
  - Supports rollback

### 3. Type Definitions
- **File**: `src/services/jobQueue/types.ts`
- **Exports**:
  - `JobType` - All job types (webhook, scan-movie, notify-players, etc.)
  - `Job` - Active job interface (pending/processing only)
  - `JobHistoryRecord` - Historical job interface (completed/failed)
  - `JobFilters` - Filters for listing active jobs
  - `JobHistoryFilters` - Filters for listing history
  - `QueueStats` - Queue statistics interface
  - `IJobQueueStorage` - **Storage interface** (key abstraction!)

### 4. SQLite Storage Adapter
- **File**: `src/services/jobQueue/storage/SQLiteJobQueueStorage.ts`
- **Implements**: `IJobQueueStorage` interface
- **Features**:
  - ✅ `addJob()` - Create job in pending state
  - ✅ `pickNextJob()` - Atomic pick with priority sorting
  - ✅ `completeJob()` - Archive and remove from queue
  - ✅ `failJob()` - Retry or archive based on retry_count
  - ✅ `getJob()` - Get job by ID
  - ✅ `listJobs()` - List active jobs with filters
  - ✅ `getJobHistory()` - List historical jobs with filters
  - ✅ `resetStalledJobs()` - Crash recovery (processing → pending)
  - ✅ `cleanupHistory()` - Delete old history records
  - ✅ `getStats()` - Queue statistics
- **Logging**: Service-specific context on all operations

### 5. Redis Storage Adapter (Stub)
- **File**: `src/services/jobQueue/storage/RedisJobQueueStorage.ts`
- **Status**: Not implemented (throws errors with clear message)
- **Documentation**: Includes implementation notes for future developer
- **Purpose**: Demonstrates modularity - swap storage without changing business logic

---

## 🎯 Design Highlights

### Job Lifecycle
```
1. Producer creates job → status = 'pending'
2. Consumer picks job → status = 'processing'
3a. Success → Archived to job_history (status = 'completed'), removed from queue
3b. Failure → If retries left: back to 'pending', else archived (status = 'failed')
```

### Key Design Decisions

1. **No 'completed' status in queue**
   - Completed jobs immediately removed and archived
   - Queue only contains "work to be done"
   - Keeps queries fast

2. **Separate history table**
   - Auditing and debugging
   - Retention policies (30 days completed, 90 days failed)
   - Doesn't slow down active queue

3. **Crash recovery**
   - On startup: All 'processing' → 'pending'
   - No work lost, everything restartable

4. **Storage abstraction**
   - `IJobQueueStorage` interface
   - Swap SQLite → Redis → PostgreSQL without changing business logic
   - Testable with mock storage

---

## ⏳ Next Steps

### Refactor JobQueueService
- **File**: `src/services/jobQueueService.ts` (EXISTING)
- **Changes Needed**:
  - Accept `IJobQueueStorage` in constructor (dependency injection)
  - Remove direct database access
  - Call `storage.addJob()`, `storage.pickNextJob()`, etc.
  - Add `initialize()` method that calls `storage.resetStalledJobs()`
  - Add service-specific logging context

### Update App Initialization
- **File**: `src/app.ts`
- **Changes Needed**:
  - Import `SQLiteJobQueueStorage`
  - Create storage instance: `const storage = new SQLiteJobQueueStorage(db)`
  - Pass storage to JobQueueService: `new JobQueueService(storage)`
  - Call `jobQueue.initialize()` for crash recovery
  - Start job queue: `jobQueue.start()`

### Refactor Webhook Controller
- **File**: `src/controllers/webhookController.ts`
- **Changes Needed**:
  - Accept `jobQueue` in constructor
  - In `handleRadarr()`: Create job instead of calling `webhookService`
  - Return 200 OK immediately (don't wait for processing)
  - Remove dependency on `webhookProcessingService`

### Update Job Handlers
- **File**: `src/services/jobHandlers.ts`
- **Changes Needed**:
  - Accept `jobQueue` in constructor
  - Update `handleWebhook()` to create `scan-movie` jobs
  - Create `handleScanMovie()` handler (calls `scanMovieDirectory`)
  - Create `handleNotifyPlayers()` handler (notifies media players)
  - Register new handlers: `jobQueue.registerHandler('scan-movie', ...)`
  - Add service-specific logging context

### Create Notification Service
- **File**: `src/services/mediaPlayerNotificationService.ts` (NEW)
- **Purpose**: Extract notification logic from `webhookProcessingService`
- **Methods**:
  - `notifyGroup(groupId, libraryPath)` - Notify one group
  - `notifyLibrary(libraryId)` - Notify all groups for library

---

## 🔄 Migration Path

### Phase 1: Infrastructure (DONE)
- [x] Database migration
- [x] Type definitions
- [x] Storage adapters
- [x] Documentation

### Phase 2: Core Refactor (IN PROGRESS)
- [ ] Refactor JobQueueService
- [ ] Update app initialization
- [ ] Update webhook controller
- [ ] Update job handlers

### Phase 3: Service Extraction
- [ ] Create mediaPlayerNotificationService
- [ ] Extract scan logic (already in unifiedScanService)
- [ ] Extract path mapping (already exists)
- [ ] Add service-specific logging everywhere

### Phase 4: Testing
- [ ] Unit tests for storage adapters
- [ ] Unit tests for isolated services
- [ ] Integration tests for job handlers
- [ ] End-to-end tests for webhook flow

### Phase 5: Cleanup
- [ ] Delete old `webhookProcessingService.ts` (replaced by jobs)
- [ ] Remove unused code
- [ ] Update documentation

---

## 📊 Benefits Achieved

### Before (Current)
```
Webhook → webhookProcessingService
          → scanMovieDirectory() [30+ seconds, blocks HTTP]
          → notifyMediaPlayers()
          → Return 200 OK (too late!)
```

**Problems**:
- ❌ Webhook timeouts
- ❌ No job tracking
- ❌ No retry capability
- ❌ Can't test components independently

### After (New Architecture)
```
Webhook → Create job → Return 200 OK [5ms]

Job Queue → Pick job → Process
            → scanMovieDirectory()
            → Create notification job
            → Mark complete

Job Queue → Pick notification job
            → notifyMediaPlayers()
            → Mark complete
```

**Benefits**:
- ✅ Instant webhook response
- ✅ Full job tracking and progress
- ✅ Automatic retry on failure
- ✅ Crash recovery (restart processing jobs)
- ✅ Testable components (isolated services)
- ✅ Modular storage (SQLite → Redis → PostgreSQL)
- ✅ Service-specific logging

---

## 🎯 Current State

**Foundation**: Complete ✅
**Integration**: In progress ⏳
**Testing**: Not started ⏸️

**Next Task**: Refactor `JobQueueService` to use `IJobQueueStorage`

---

## 📝 Notes for Implementation

### Service-Specific Logging Pattern
Every service should include its name in logs:

```typescript
logger.info('[ServiceName] Operation description', {
  service: 'ServiceName',
  operation: 'methodName',
  ...context
});
```

Examples:
- `[SQLiteJobQueueStorage] Job created`
- `[JobHandlers] Processing webhook`
- `[ScanService] Starting movie scan`
- `[MediaPlayerManager] Notifying players`

### Job Priority Guidelines
```
1-2:   CRITICAL (webhooks, user actions)
3-4:   HIGH (scans triggered by webhooks)
5-7:   NORMAL (notifications, enrichment)
8-10:  LOW (scheduled tasks, maintenance)
```

### Retry Strategy
```
Max retries: 3 (configurable per job)
Retry delay: Immediate (back to pending queue)
No exponential backoff (yet)
Circuit breaker: 5 consecutive failures → pause for 1 minute
```

---

**Status**: Ready for Phase 2 implementation
**Blocker**: None
**ETA**: 2-3 hours for complete refactor
