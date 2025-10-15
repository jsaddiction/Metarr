# Testing Fan-Out Architecture

**Date**: 2025-10-15
**Status**: Ready for Testing

---

## Overview

This document outlines the testing plan for the newly implemented fan-out webhook architecture with job queue and notification system.

---

## What We're Testing

1. **Job Queue with Modular Storage** (SQLite)
2. **Notification Config System**
3. **Fan-Out Webhook Handler**
4. **Notification Handlers** (Kodi complete, others stubbed)
5. **WebSocket Progress Tracking**
6. **Crash Recovery**

---

## Testing Strategy

### Phase 1: Database Migrations ✅
Ensure all new tables are created correctly.

### Phase 2: Service Initialization ✅
Ensure all services initialize without errors.

### Phase 3: Notification Config
Test notification configuration CRUD operations.

### Phase 4: Job Queue Operations
Test job creation, processing, completion, and failure handling.

### Phase 5: Fan-Out Webhook
Test webhook → multiple jobs flow.

### Phase 6: Crash Recovery
Test that jobs resume after simulated crash.

### Phase 7: WebSocket Progress
Test real-time progress updates (if possible).

---

## Test Plan

### Test 1: Backend Startup ✅

**Goal**: Ensure backend starts without errors and all migrations run.

**Steps**:
1. Start backend server
2. Check logs for migration success
3. Check logs for service initialization
4. Verify database tables created

**Expected Output**:
```
Migration 20251015_006_create_job_history complete
Migration 20251015_007_create_notification_config complete
Notification config service initialized
Media player group service initialized
Job handlers registered
Job queue service started
```

**Success Criteria**:
- No errors in logs
- `notification_config` table exists
- `job_history` table exists
- All services initialized

---

### Test 2: Notification Config - Query Enabled Services

**Goal**: Test `NotificationConfigService.getEnabledServices()`

**SQL Setup**:
```sql
-- Check default state (all disabled)
SELECT * FROM notification_config;

-- Enable Kodi
UPDATE notification_config SET enabled = 1 WHERE service = 'kodi';

-- Verify
SELECT * FROM notification_config WHERE enabled = 1;
```

**Expected Result**:
- Default: All services disabled (empty array)
- After update: `['kodi']`

**API Test** (if available):
```bash
# Get notification config
curl http://localhost:3000/api/notifications/config
```

---

### Test 3: Job Queue - Manual Job Creation

**Goal**: Test creating jobs directly via SQL and see them get processed.

**SQL**:
```sql
-- Create a test job (LOW priority, will process after other jobs)
INSERT INTO job_queue (type, priority, payload, state, retry_count, max_retries, created_at)
VALUES ('scheduled-cleanup', 8, '{}', 'pending', 0, 3, CURRENT_TIMESTAMP);

-- Check queue
SELECT id, type, priority, state, created_at FROM job_queue;

-- Wait a few seconds for processing...

-- Check history
SELECT id, job_id, type, status, completed_at FROM job_history ORDER BY completed_at DESC LIMIT 5;

-- Verify job removed from queue
SELECT COUNT(*) FROM job_queue WHERE type = 'scheduled-cleanup';
```

**Expected Behavior**:
1. Job appears in `job_queue` with state `pending`
2. Job picked up by queue worker (state changes to `processing`)
3. Handler runs: `handleScheduledCleanup` logs appear
4. Job removed from `job_queue`
5. Job archived to `job_history` with status `completed`

**Success Criteria**:
- Job processed within seconds
- Logs show handler execution
- Job in history table
- Queue is empty

---

### Test 4: Job Queue - Crash Recovery

**Goal**: Test that jobs marked as `processing` get reset to `pending` on startup.

**Steps**:
```sql
-- Simulate crashed job (manually set state to processing)
INSERT INTO job_queue (type, priority, payload, state, retry_count, max_retries, created_at, started_at)
VALUES ('scheduled-cleanup', 8, '{}', 'processing', 0, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Verify job is "stuck" in processing
SELECT id, type, state FROM job_queue;
```

**Then**: Restart backend server

**Check Logs**:
```
Job queue initialized (crash recovery complete)
Reset X stalled jobs from processing to pending
```

**SQL Verification**:
```sql
-- Job should be back to pending
SELECT id, type, state FROM job_queue;
```

**Expected**:
- Job state changed from `processing` to `pending`
- Job gets processed again
- Job completes and moves to history

---

### Test 5: Notification Handlers - Defensive Checks

**Goal**: Test that notification handlers check enabled state and no-op if disabled.

**Setup**:
```sql
-- Ensure all notifications are disabled
UPDATE notification_config SET enabled = 0;

-- Create a notify-kodi job
INSERT INTO job_queue (type, priority, payload, state, retry_count, max_retries, created_at)
VALUES ('notify-kodi', 5, '{"webhookPayload": {"source": "radarr", "eventType": "Download"}}', 'pending', 0, 2, CURRENT_TIMESTAMP);
```

**Expected Logs**:
```
[JobHandlers] Kodi notifications disabled, skipping
```

**Expected Behavior**:
- Job completes successfully (no error)
- Handler logs "skipping"
- No Kodi API calls made
- Job archived to history with status `completed`

**Then Enable Kodi**:
```sql
UPDATE notification_config SET enabled = 1 WHERE service = 'kodi';

-- Create another notify-kodi job
INSERT INTO job_queue (type, priority, payload, state, retry_count, max_retries, created_at)
VALUES ('notify-kodi', 5, '{"webhookPayload": {"source": "radarr", "eventType": "Download", "movie": {"path": "/movies/Test", "title": "Test Movie"}}}', 'pending', 0, 2, CURRENT_TIMESTAMP);
```

**Expected Logs**:
```
[JobHandlers] Sending Kodi notification
[MediaPlayerGroupService] Notifying all groups: movie added
[JobHandlers] Kodi notification sent
```

**Success Criteria**:
- First job: No-op (skipped)
- Second job: Actual Kodi notification sent

---

### Test 6: Fan-Out Webhook Handler

**Goal**: Test that `handleWebhookReceived` creates multiple jobs (scan + notifications).

**Setup**:
```sql
-- Enable Kodi and Discord notifications
UPDATE notification_config SET enabled = 1 WHERE service = 'kodi';
UPDATE notification_config SET enabled = 1 WHERE service = 'discord';
```

**Create Webhook Job**:
```sql
INSERT INTO job_queue (type, priority, payload, state, retry_count, max_retries, created_at)
VALUES ('webhook-received', 1, '{"source": "radarr", "eventType": "Download", "movie": {"id": 1, "title": "The Matrix", "year": 1999, "path": "/movies/The Matrix (1999)", "tmdbId": 603, "imdbId": "tt0133093"}}', 'pending', 0, 3, CURRENT_TIMESTAMP);
```

**Monitor Queue**:
```sql
-- Watch jobs being created
SELECT id, type, priority, state, created_at FROM job_queue ORDER BY priority, created_at;
```

**Expected Behavior**:
1. `webhook-received` job processes (priority 1, CRITICAL)
2. Handler creates 3 new jobs:
   - `scan-movie` (priority 3, HIGH)
   - `notify-kodi` (priority 5, NORMAL)
   - `notify-discord` (priority 5, NORMAL)
3. Jobs process in priority order

**Expected Logs**:
```
[JobHandlers] Processing webhook (fan-out coordinator)
[JobHandlers] Created scan-movie job, scanJobId: X
[JobHandlers] Creating notification jobs, enabledServices: ['kodi', 'discord']
[JobHandlers] Created notification job, notificationService: kodi
[JobHandlers] Created notification job, notificationService: discord
[JobHandlers] Webhook fan-out complete, jobsCreated: 3
```

**SQL Verification**:
```sql
-- Check all jobs were created
SELECT type, priority, state FROM job_queue ORDER BY priority, created_at;

-- Check history after processing
SELECT type, status FROM job_history ORDER BY completed_at DESC LIMIT 5;
```

**Success Criteria**:
- Webhook job completes
- Scan job created
- 2 notification jobs created (kodi, discord)
- All jobs process successfully
- All jobs in history

---

### Test 7: Job Priority Ordering

**Goal**: Verify jobs process in priority order.

**Setup**:
```sql
-- Create jobs with different priorities (insert in random order)
INSERT INTO job_queue (type, priority, payload, state, retry_count, max_retries, created_at)
VALUES
  ('scheduled-cleanup', 8, '{}', 'pending', 0, 3, CURRENT_TIMESTAMP),
  ('notify-kodi', 5, '{"webhookPayload": {}}', 'pending', 0, 2, CURRENT_TIMESTAMP),
  ('scan-movie', 3, '{"movie": {}}', 'pending', 0, 3, CURRENT_TIMESTAMP),
  ('webhook-received', 1, '{"source": "radarr"}', 'pending', 0, 3, CURRENT_TIMESTAMP);

-- Check order
SELECT id, type, priority, state FROM job_queue ORDER BY priority, created_at;
```

**Expected Processing Order**:
1. `webhook-received` (priority 1) - CRITICAL
2. `scan-movie` (priority 3) - HIGH
3. `notify-kodi` (priority 5) - NORMAL
4. `scheduled-cleanup` (priority 8) - LOW

**Monitor Logs**: Jobs should process in this order

---

### Test 8: Job Failure and Retry

**Goal**: Test that failed jobs retry up to max_retries.

**Setup**:
```sql
-- Create a job that will fail (invalid payload)
INSERT INTO job_queue (type, priority, payload, state, retry_count, max_retries, created_at)
VALUES ('scan-movie', 3, '{"movie": null}', 'pending', 0, 2, CURRENT_TIMESTAMP);
```

**Expected Behavior**:
1. Job processes and fails (error thrown)
2. Job retry_count incremented (1)
3. Job state back to `pending`
4. Job processes again and fails (2)
5. Job retry_count incremented (2)
6. Job processes again and fails (3)
7. Job moved to `job_history` with status `failed`

**SQL Verification**:
```sql
-- After all retries exhausted
SELECT job_id, type, status, error, retry_count FROM job_history WHERE type = 'scan-movie' ORDER BY completed_at DESC LIMIT 1;
```

**Expected**:
- `status = 'failed'`
- `retry_count = 2` (max_retries)
- `error` contains error message

---

### Test 9: Scheduled Task Handler - File Scan

**Goal**: Test `handleScheduledFileScan` creates library-scan jobs.

**Setup**:
```sql
-- Ensure we have enabled libraries
SELECT id, name, enabled FROM libraries;

-- If no libraries, create test library
INSERT INTO libraries (name, path, type, enabled)
VALUES ('Test Movies', '/movies', 'movie', 1);
```

**Create Job**:
```sql
INSERT INTO job_queue (type, priority, payload, state, retry_count, max_retries, created_at)
VALUES ('scheduled-file-scan', 8, '{}', 'pending', 0, 2, CURRENT_TIMESTAMP);
```

**Expected Logs**:
```
[JobHandlers] Starting scheduled file scan
[JobHandlers] Found enabled libraries, count: 1
[JobHandlers] Created library-scan job, libraryId: X, libraryName: Test Movies
[JobHandlers] Scheduled file scan complete, librariesScheduled: 1
```

**SQL Verification**:
```sql
-- Check library-scan jobs were created
SELECT id, type, priority, payload FROM job_queue WHERE type = 'library-scan';
```

**Success Criteria**:
- One `library-scan` job per enabled library
- Jobs have priority 8 (LOW)

---

### Test 10: WebSocket Progress Updates

**Goal**: Test that long-running jobs can report progress via WebSocket.

**Note**: This requires:
1. Frontend connected via WebSocket
2. Job handler calling `jobQueue.updateJobProgress()`

**Test Case** (for future):
```typescript
// In a handler like handleScanMovie
await this.jobQueue.updateJobProgress(job.id, {
  current: 50,
  total: 100,
  percentage: 50,
  message: 'Scanning assets',
  detail: 'Processing poster candidates'
});
```

**Expected**: WebSocket clients receive:
```json
{
  "event": "job:progress",
  "data": {
    "jobId": 123,
    "progress": {
      "current": 50,
      "total": 100,
      "percentage": 50,
      "message": "Scanning assets",
      "detail": "Processing poster candidates"
    }
  }
}
```

**Status**: Infrastructure ready, needs frontend implementation

---

## Testing Checklist

### Backend Startup
- [ ] Server starts without errors
- [ ] All migrations run successfully
- [ ] `notification_config` table created
- [ ] `job_history` table created
- [ ] NotificationConfigService initialized
- [ ] MediaPlayerGroupService initialized
- [ ] JobHandlers registered
- [ ] Job queue started

### Notification Config
- [ ] Default config: all services disabled
- [ ] Can enable service via SQL
- [ ] `getEnabledServices()` returns correct list
- [ ] `isServiceEnabled()` returns correct boolean

### Job Queue Operations
- [ ] Can create job via SQL
- [ ] Job gets picked up and processed
- [ ] Job removed from queue after completion
- [ ] Job archived to history
- [ ] Job history has correct status

### Crash Recovery
- [ ] Jobs in `processing` state reset to `pending` on startup
- [ ] Reset jobs process successfully

### Notification Handlers
- [ ] Disabled service → handler no-ops (completes successfully)
- [ ] Enabled service → handler executes
- [ ] Kodi notification sends to media player groups

### Fan-Out Webhook
- [ ] Webhook job creates scan job
- [ ] Webhook job creates notification jobs (one per enabled service)
- [ ] All jobs process in priority order
- [ ] Logs show fan-out coordinator messages

### Job Priority
- [ ] Jobs process in priority order (1=highest, 10=lowest)
- [ ] CRITICAL jobs process before HIGH jobs
- [ ] HIGH jobs process before NORMAL jobs
- [ ] NORMAL jobs process before LOW jobs

### Job Failure
- [ ] Failed jobs retry up to max_retries
- [ ] After max retries, job moves to history with status=failed
- [ ] Error message captured in history

### Scheduled Tasks
- [ ] `scheduled-file-scan` creates library-scan jobs
- [ ] `scheduled-cleanup` cleans job history

---

## SQL Queries for Testing

### Check Queue Status
```sql
-- Active jobs
SELECT id, type, priority, state, retry_count, created_at, started_at
FROM job_queue
ORDER BY priority, created_at;

-- Job history (recent)
SELECT id, job_id, type, status, error, retry_count, duration_ms, completed_at
FROM job_history
ORDER BY completed_at DESC
LIMIT 20;

-- Queue stats
SELECT state, COUNT(*) as count FROM job_queue GROUP BY state;
SELECT status, COUNT(*) as count FROM job_history GROUP BY status;
```

### Check Notification Config
```sql
-- All notification services
SELECT service, enabled, config FROM notification_config ORDER BY service;

-- Enabled services only
SELECT service FROM notification_config WHERE enabled = 1;
```

### Cleanup Test Data
```sql
-- Clear queue
DELETE FROM job_queue;

-- Clear history
DELETE FROM job_history;

-- Reset notification config
UPDATE notification_config SET enabled = 0;
```

---

## Next Steps After Testing

1. **Update Webhook Controller** - Make it create `webhook-received` jobs
2. **Remove webhookProcessingService** - No longer needed
3. **Implement Additional Notification Services** - Jellyfin, Plex, Discord, Pushover, Email
4. **Build Frontend UI** - Notification config management page
5. **Add API Endpoints** - CRUD for notification_config
6. **End-to-End Testing** - Real Radarr/Sonarr webhooks

---

## Success Criteria

✅ All backend services initialize without errors
✅ Job queue processes jobs in priority order
✅ Jobs complete and archive to history
✅ Crash recovery works (stalled jobs resume)
✅ Notification handlers respect enabled/disabled state
✅ Fan-out webhook creates multiple jobs
✅ Kodi notifications work end-to-end

Once these pass, the architecture is solid and ready for production use.
