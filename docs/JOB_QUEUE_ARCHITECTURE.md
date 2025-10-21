# Job Queue Architecture

**Date**: 2025-10-15
**Status**: SQLite Implementation Complete

---

## Implementation Status

- ✅ **[Implemented]** - SQLite storage backend
- ✅ **[Implemented]** - Job state machine (pending → processing → completed/failed)
- ✅ **[Implemented]** - Crash recovery (reset stalled jobs on startup)
- ✅ **[Implemented]** - Job history archival
- ✅ **[Implemented]** - Modular storage interface (IJobQueueStorage)
- 📋 **[Planned]** - Redis storage backend (performance optimization)
- 📋 **[Planned]** - PostgreSQL storage backend (production scalability)

---

## 🎯 Design Goals

1. **Persistence**: Jobs survive crashes and restarts ✅
2. **Modularity**: Swap storage backends (SQLite → Redis → PostgreSQL) ✅ Interface ready
3. **State Machine**: Clear job lifecycle with automatic cleanup ✅
4. **Crash Recovery**: Resume interrupted jobs on startup ✅
5. **Separation of Concerns**: Producers create, consumers process ✅

---

## 📊 Job Lifecycle

### State Machine

```
┌──────────┐
│ pending  │ ← Job created, waiting to be picked
└────┬─────┘
     │ pickJob()
     ▼
┌──────────┐
│processing│ ← Job being worked on (can be restarted if app crashes)
└────┬─────┘
     │
     ├─ SUCCESS ──> Remove from queue → Insert into job_history (completed)
     │
     └─ FAILURE ──> retry_count++ → back to 'pending' (if retries left)
                                  → Remove from queue → Insert into job_history (failed)
```

### Key Principles

1. **Active Queue (job_queue table)**:
   - Only `pending` and `processing` jobs
   - Small, fast queries
   - Deleted when job completes or fails permanently

2. **History (job_history table)**:
   - Completed and permanently failed jobs
   - Retention policy (30-90 days)
   - Used for auditing and debugging

3. **No 'completed' status in queue**:
   - Completed jobs are immediately removed and archived
   - Queue only contains "work to be done"

---

## 🔌 Modular Storage Interface

### IJobQueueStorage Interface

Every storage backend must implement this interface:

```typescript
export interface IJobQueueStorage {
  /**
   * Add a new job to the queue
   * State: pending
   */
  addJob(job: Omit<Job, 'id' | 'created_at'>): Promise<number>; // Returns jobId

  /**
   * Pick next job for processing
   * Changes state: pending → processing
   * Returns null if no jobs available
   */
  pickNextJob(): Promise<Job | null>;

  /**
   * Mark job as completed and remove from queue
   * Archives to job_history table
   */
  completeJob(jobId: number, result?: any): Promise<void>;

  /**
   * Mark job as failed
   * If retries remaining: state → pending, increment retry_count
   * If no retries: remove from queue, archive to job_history
   */
  failJob(jobId: number, error: string): Promise<void>;

  /**
   * Get job by ID (for progress tracking)
   */
  getJob(jobId: number): Promise<Job | null>;

  /**
   * Get all jobs (for admin UI)
   * Optionally filter by type or status
   */
  listJobs(filters?: JobFilters): Promise<Job[]>;

  /**
   * Get job history (completed/failed jobs)
   */
  getJobHistory(filters?: JobHistoryFilters): Promise<JobHistoryRecord[]>;

  /**
   * Crash recovery: Reset all 'processing' jobs to 'pending'
   * Call this on application startup
   */
  resetStalledJobs(): Promise<number>; // Returns count of reset jobs

  /**
   * Cleanup old history records
   * Delete completed jobs older than X days
   */
  cleanupHistory(retentionDays: { completed: number; failed: number }): Promise<number>;

  /**
   * Health check: Get queue stats
   */
  getStats(): Promise<QueueStats>;
}

export interface Job {
  id: number;
  type: JobType;
  priority: number;
  payload: any;
  status: 'pending' | 'processing';
  error?: string | null;
  retry_count: number;
  max_retries: number;
  created_at: string;
  started_at?: string | null;
  updated_at?: string;
}

export interface JobHistoryRecord {
  id: number;
  job_id: number;
  type: JobType;
  priority: number;
  payload: any;
  status: 'completed' | 'failed';
  error?: string | null;
  retry_count: number;
  created_at: string;
  started_at: string;
  completed_at: string;
  duration_ms: number;
}

export interface QueueStats {
  pending: number;
  processing: number;
  totalActive: number;
  oldestPendingAge: number | null; // milliseconds
}
```

---

## 🗄️ Database Schema

### Active Queue Table

```sql
CREATE TABLE job_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  priority INTEGER NOT NULL,
  payload TEXT NOT NULL,         -- JSON
  status TEXT NOT NULL,           -- 'pending' | 'processing'
  error TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at DATETIME,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Index for pickNextJob() query
CREATE INDEX idx_job_queue_pickup
  ON job_queue(status, priority DESC, created_at ASC)
  WHERE status = 'pending';

-- Index for crash recovery
CREATE INDEX idx_job_queue_processing
  ON job_queue(status)
  WHERE status = 'processing';
```

### History Table

```sql
CREATE TABLE job_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL,        -- Original job ID from queue
  type TEXT NOT NULL,
  priority INTEGER NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL,           -- 'completed' | 'failed'
  error TEXT,
  retry_count INTEGER NOT NULL,
  created_at DATETIME NOT NULL,   -- When job was created
  started_at DATETIME NOT NULL,   -- When job started processing
  completed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, -- When archived
  duration_ms INTEGER             -- completed_at - started_at
);

-- Index for history queries (by type and date)
CREATE INDEX idx_job_history_type_date
  ON job_history(type, completed_at DESC);

-- Index for cleanup queries
CREATE INDEX idx_job_history_cleanup
  ON job_history(status, completed_at);
```

---

## 🔧 Implementation: SQLite Storage Adapter

**File**: `src/services/jobQueue/storage/SQLiteJobQueueStorage.ts`

```typescript
import { DatabaseConnection } from '../../../types/database.js';
import {
  IJobQueueStorage,
  Job,
  JobHistoryRecord,
  JobFilters,
  JobHistoryFilters,
  QueueStats
} from '../types.js';
import { logger } from '../../../middleware/logging.js';

export class SQLiteJobQueueStorage implements IJobQueueStorage {
  constructor(private db: DatabaseConnection) {}

  async addJob(job: Omit<Job, 'id' | 'created_at'>): Promise<number> {
    logger.debug('[SQLiteJobQueueStorage] Adding job', {
      type: job.type,
      priority: job.priority
    });

    const result = await this.db.execute(
      `INSERT INTO job_queue (
        type, priority, payload, status, retry_count, max_retries, created_at, updated_at
      ) VALUES (?, ?, ?, 'pending', 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [job.type, job.priority, JSON.stringify(job.payload), job.max_retries || 3]
    );

    const jobId = result.insertId!;

    logger.info('[SQLiteJobQueueStorage] Job created', {
      jobId,
      type: job.type,
      priority: job.priority
    });

    return jobId;
  }

  async pickNextJob(): Promise<Job | null> {
    // Transaction: SELECT + UPDATE atomically
    const jobs = await this.db.query<any>(
      `SELECT * FROM job_queue
       WHERE status = 'pending'
       ORDER BY priority ASC, created_at ASC
       LIMIT 1`
    );

    if (jobs.length === 0) {
      return null;
    }

    const job = jobs[0];

    // Mark as processing
    await this.db.execute(
      `UPDATE job_queue
       SET status = 'processing', started_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [job.id]
    );

    logger.info('[SQLiteJobQueueStorage] Job picked', {
      jobId: job.id,
      type: job.type,
      priority: job.priority,
      waitTime: Date.now() - new Date(job.created_at).getTime()
    });

    return {
      id: job.id,
      type: job.type,
      priority: job.priority,
      payload: JSON.parse(job.payload),
      status: 'processing',
      error: job.error,
      retry_count: job.retry_count,
      max_retries: job.max_retries,
      created_at: job.created_at,
      started_at: job.started_at,
      updated_at: job.updated_at
    };
  }

  async completeJob(jobId: number, result?: any): Promise<void> {
    // Get job data
    const jobs = await this.db.query<any>(
      'SELECT * FROM job_queue WHERE id = ?',
      [jobId]
    );

    if (jobs.length === 0) {
      logger.warn('[SQLiteJobQueueStorage] Job not found for completion', { jobId });
      return;
    }

    const job = jobs[0];
    const now = new Date();
    const startedAt = new Date(job.started_at);
    const duration = now.getTime() - startedAt.getTime();

    // Archive to history
    await this.db.execute(
      `INSERT INTO job_history (
        job_id, type, priority, payload, status, error, retry_count,
        created_at, started_at, completed_at, duration_ms
      ) VALUES (?, ?, ?, ?, 'completed', NULL, ?, ?, ?, CURRENT_TIMESTAMP, ?)`,
      [
        jobId,
        job.type,
        job.priority,
        job.payload,
        job.retry_count,
        job.created_at,
        job.started_at,
        duration
      ]
    );

    // Remove from active queue
    await this.db.execute('DELETE FROM job_queue WHERE id = ?', [jobId]);

    logger.info('[SQLiteJobQueueStorage] Job completed and archived', {
      jobId,
      type: job.type,
      duration: `${duration}ms`
    });
  }

  async failJob(jobId: number, error: string): Promise<void> {
    const jobs = await this.db.query<any>(
      'SELECT * FROM job_queue WHERE id = ?',
      [jobId]
    );

    if (jobs.length === 0) {
      logger.warn('[SQLiteJobQueueStorage] Job not found for failure', { jobId });
      return;
    }

    const job = jobs[0];
    const newRetryCount = job.retry_count + 1;
    const hasRetriesLeft = newRetryCount < job.max_retries;

    if (hasRetriesLeft) {
      // Retry: Reset to pending
      await this.db.execute(
        `UPDATE job_queue
         SET status = 'pending', retry_count = ?, error = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [newRetryCount, error, jobId]
      );

      logger.warn('[SQLiteJobQueueStorage] Job failed, will retry', {
        jobId,
        type: job.type,
        retryCount: newRetryCount,
        maxRetries: job.max_retries,
        error
      });
    } else {
      // No retries left: Archive and remove
      const now = new Date();
      const startedAt = new Date(job.started_at);
      const duration = now.getTime() - startedAt.getTime();

      await this.db.execute(
        `INSERT INTO job_history (
          job_id, type, priority, payload, status, error, retry_count,
          created_at, started_at, completed_at, duration_ms
        ) VALUES (?, ?, ?, ?, 'failed', ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`,
        [
          jobId,
          job.type,
          job.priority,
          job.payload,
          error,
          newRetryCount,
          job.created_at,
          job.started_at,
          duration
        ]
      );

      await this.db.execute('DELETE FROM job_queue WHERE id = ?', [jobId]);

      logger.error('[SQLiteJobQueueStorage] Job permanently failed and archived', {
        jobId,
        type: job.type,
        retryCount: newRetryCount,
        error
      });
    }
  }

  async getJob(jobId: number): Promise<Job | null> {
    const jobs = await this.db.query<any>(
      'SELECT * FROM job_queue WHERE id = ?',
      [jobId]
    );

    if (jobs.length === 0) {
      return null;
    }

    const job = jobs[0];
    return {
      id: job.id,
      type: job.type,
      priority: job.priority,
      payload: JSON.parse(job.payload),
      status: job.status,
      error: job.error,
      retry_count: job.retry_count,
      max_retries: job.max_retries,
      created_at: job.created_at,
      started_at: job.started_at,
      updated_at: job.updated_at
    };
  }

  async listJobs(filters?: JobFilters): Promise<Job[]> {
    let query = 'SELECT * FROM job_queue WHERE 1=1';
    const params: any[] = [];

    if (filters?.type) {
      query += ' AND type = ?';
      params.push(filters.type);
    }

    if (filters?.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }

    query += ' ORDER BY priority ASC, created_at ASC';

    if (filters?.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }

    const jobs = await this.db.query<any>(query, params);

    return jobs.map(job => ({
      id: job.id,
      type: job.type,
      priority: job.priority,
      payload: JSON.parse(job.payload),
      status: job.status,
      error: job.error,
      retry_count: job.retry_count,
      max_retries: job.max_retries,
      created_at: job.created_at,
      started_at: job.started_at,
      updated_at: job.updated_at
    }));
  }

  async getJobHistory(filters?: JobHistoryFilters): Promise<JobHistoryRecord[]> {
    let query = 'SELECT * FROM job_history WHERE 1=1';
    const params: any[] = [];

    if (filters?.type) {
      query += ' AND type = ?';
      params.push(filters.type);
    }

    if (filters?.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }

    query += ' ORDER BY completed_at DESC';

    if (filters?.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }

    const records = await this.db.query<any>(query, params);

    return records.map(record => ({
      id: record.id,
      job_id: record.job_id,
      type: record.type,
      priority: record.priority,
      payload: JSON.parse(record.payload),
      status: record.status,
      error: record.error,
      retry_count: record.retry_count,
      created_at: record.created_at,
      started_at: record.started_at,
      completed_at: record.completed_at,
      duration_ms: record.duration_ms
    }));
  }

  async resetStalledJobs(): Promise<number> {
    const result = await this.db.execute(
      `UPDATE job_queue
       SET status = 'pending', started_at = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE status = 'processing'`
    );

    const count = result.affectedRows || 0;

    if (count > 0) {
      logger.warn('[SQLiteJobQueueStorage] Reset stalled jobs on startup', {
        count
      });
    }

    return count;
  }

  async cleanupHistory(retentionDays: { completed: number; failed: number }): Promise<number> {
    const completedCutoff = new Date();
    completedCutoff.setDate(completedCutoff.getDate() - retentionDays.completed);

    const failedCutoff = new Date();
    failedCutoff.setDate(failedCutoff.getDate() - retentionDays.failed);

    const result1 = await this.db.execute(
      `DELETE FROM job_history
       WHERE status = 'completed' AND completed_at < ?`,
      [completedCutoff.toISOString()]
    );

    const result2 = await this.db.execute(
      `DELETE FROM job_history
       WHERE status = 'failed' AND completed_at < ?`,
      [failedCutoff.toISOString()]
    );

    const totalDeleted = (result1.affectedRows || 0) + (result2.affectedRows || 0);

    logger.info('[SQLiteJobQueueStorage] Cleaned up job history', {
      deleted: totalDeleted,
      retentionDays
    });

    return totalDeleted;
  }

  async getStats(): Promise<QueueStats> {
    const stats = await this.db.query<any>(
      `SELECT
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing,
        MIN(CASE WHEN status = 'pending'
          THEN (strftime('%s', 'now') - strftime('%s', created_at)) * 1000
          ELSE NULL END) as oldest_pending_age
       FROM job_queue`
    );

    const row = stats[0];

    return {
      pending: row.pending || 0,
      processing: row.processing || 0,
      totalActive: (row.pending || 0) + (row.processing || 0),
      oldestPendingAge: row.oldest_pending_age || null
    };
  }
}
```

---

## 📋 [Planned] Redis Storage Adapter

**Status**: Future enhancement for high-throughput production environments

**File**: `src/services/jobQueue/storage/RedisJobQueueStorage.ts` (not yet implemented)

**Why Redis?**
- Atomic operations (ZPOPMIN for picking next job)
- Lower latency than SQLite for high-frequency polling
- Better multi-worker support (distributed job processing)
- TTL support for automatic job expiry

**Planned Data Structures**:
```
queue:pending        → Sorted Set (score = priority, member = jobId)
queue:processing     → Set (jobIds currently being processed)
job:{id}             → Hash (job data: type, payload, status, etc.)
history:{id}         → Hash (completed/failed job data)
```

**Implementation Notes** (for future reference):
```typescript
/**
 * Redis-based job queue storage (PLANNED)
 *
 * Key operations:
 * - addJob(): ZADD queue:pending {priority} {jobId}, HSET job:{id} {...data}
 * - pickNextJob(): ZPOPMIN queue:pending → SADD queue:processing {jobId}
 * - completeJob(): SREM queue:processing {jobId}, HSET history:{id} {...data}
 * - failJob(): Increment retry_count, ZADD back to pending OR archive to history
 */
export class RedisJobQueueStorage implements IJobQueueStorage {
  constructor(private redis: RedisClient) {}

  // Implementation deferred - use SQLiteJobQueueStorage for now
}
```

**Migration Path**:
1. Implement RedisJobQueueStorage class (implements IJobQueueStorage)
2. Add config option: `JOB_QUEUE_STORAGE=redis|sqlite`
3. Swap storage backend in JobQueueService constructor
4. No application code changes required (interface abstraction)

---

## 🔧 Refactored Job Queue Service

**File**: `src/services/jobQueue/JobQueueService.ts`

```typescript
import { IJobQueueStorage, Job, JobType, QueueStats } from './types.js';
import { logger } from '../../middleware/logging.js';
import { websocketBroadcaster } from '../websocketBroadcaster.js';

export interface JobHandler {
  (job: Job): Promise<void>;
}

export class JobQueueService {
  private handlers: Map<JobType, JobHandler> = new Map();
  private isProcessing: boolean = false;
  private processingInterval: NodeJS.Timeout | null = null;
  private readonly POLL_INTERVAL = 1000; // 1 second

  // Circuit breaker
  private consecutiveFailures: number = 0;
  private readonly MAX_CONSECUTIVE_FAILURES = 5;
  private circuitBroken: boolean = false;

  constructor(private storage: IJobQueueStorage) {}

  /**
   * Initialize job queue (crash recovery)
   */
  async initialize(): Promise<void> {
    logger.info('[JobQueueService] Initializing job queue');

    // Reset stalled jobs (crash recovery)
    const resetCount = await this.storage.resetStalledJobs();

    if (resetCount > 0) {
      logger.warn('[JobQueueService] Recovered stalled jobs from previous crash', {
        count: resetCount
      });
    }

    // Get queue stats
    const stats = await this.storage.getStats();
    logger.info('[JobQueueService] Job queue initialized', stats);
  }

  /**
   * Register a job handler
   */
  registerHandler(type: JobType, handler: JobHandler): void {
    this.handlers.set(type, handler);
    logger.info('[JobQueueService] Registered job handler', { type });
  }

  /**
   * Add a job to the queue
   */
  async addJob(job: Omit<Job, 'id' | 'created_at' | 'status'>): Promise<number> {
    const jobId = await this.storage.addJob({
      ...job,
      status: 'pending'
    } as any);

    // Broadcast job created
    websocketBroadcaster.broadcast('job:created', {
      jobId,
      type: job.type,
      priority: job.priority
    });

    logger.info('[JobQueueService] Job added to queue', {
      jobId,
      type: job.type,
      priority: job.priority
    });

    return jobId;
  }

  /**
   * Start processing jobs
   */
  start(): void {
    if (this.isProcessing) {
      logger.warn('[JobQueueService] Already processing jobs');
      return;
    }

    this.isProcessing = true;
    this.processingInterval = setInterval(() => {
      this.processNextJob().catch(err => {
        logger.error('[JobQueueService] Error in processing loop', {
          error: err.message
        });
      });
    }, this.POLL_INTERVAL);

    logger.info('[JobQueueService] Started job processing');
  }

  /**
   * Stop processing jobs
   */
  stop(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }

    this.isProcessing = false;
    logger.info('[JobQueueService] Stopped job processing');
  }

  /**
   * Process next job in queue
   */
  private async processNextJob(): Promise<void> {
    if (this.circuitBroken) {
      return; // Circuit breaker is open
    }

    // Pick next job
    const job = await this.storage.pickNextJob();

    if (!job) {
      return; // No jobs available
    }

    const handler = this.handlers.get(job.type);

    if (!handler) {
      logger.error('[JobQueueService] No handler for job type', {
        jobId: job.id,
        type: job.type
      });

      await this.storage.failJob(job.id, `No handler registered for job type: ${job.type}`);
      return;
    }

    // Broadcast job started
    websocketBroadcaster.broadcast('job:started', {
      jobId: job.id,
      type: job.type,
      priority: job.priority
    });

    logger.info('[JobQueueService] Processing job', {
      jobId: job.id,
      type: job.type,
      priority: job.priority,
      retryCount: job.retry_count
    });

    const startTime = Date.now();

    try {
      // Execute handler
      await handler(job);

      // Mark as completed (removes from queue, archives to history)
      await this.storage.completeJob(job.id);

      const duration = Date.now() - startTime;

      // Broadcast job completed
      websocketBroadcaster.broadcast('job:completed', {
        jobId: job.id,
        type: job.type,
        duration
      });

      logger.info('[JobQueueService] Job completed', {
        jobId: job.id,
        type: job.type,
        duration: `${duration}ms`
      });

      // Reset circuit breaker on success
      this.consecutiveFailures = 0;

    } catch (error: any) {
      const duration = Date.now() - startTime;

      logger.error('[JobQueueService] Job failed', {
        jobId: job.id,
        type: job.type,
        error: error.message,
        retryCount: job.retry_count,
        maxRetries: job.max_retries
      });

      // Mark as failed (retries if possible, archives if not)
      await this.storage.failJob(job.id, error.message);

      // Broadcast job failed
      websocketBroadcaster.broadcast('job:failed', {
        jobId: job.id,
        type: job.type,
        error: error.message,
        willRetry: job.retry_count + 1 < job.max_retries,
        duration
      });

      // Circuit breaker logic
      this.consecutiveFailures++;

      if (this.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES) {
        this.circuitBroken = true;
        logger.error('[JobQueueService] Circuit breaker opened', {
          consecutiveFailures: this.consecutiveFailures
        });

        // Reset circuit after 1 minute
        setTimeout(() => {
          this.circuitBroken = false;
          this.consecutiveFailures = 0;
          logger.info('[JobQueueService] Circuit breaker reset');
        }, 60000);
      }
    }
  }

  /**
   * Get queue statistics
   */
  async getStats(): Promise<QueueStats> {
    return await this.storage.getStats();
  }

  /**
   * Get job history
   */
  async getJobHistory(filters?: any): Promise<any[]> {
    return await this.storage.getJobHistory(filters);
  }

  /**
   * Cleanup old history
   */
  async cleanupHistory(retentionDays = { completed: 30, failed: 90 }): Promise<number> {
    return await this.storage.cleanupHistory(retentionDays);
  }
}
```

---

## 📦 Type Definitions

**File**: `src/services/jobQueue/types.ts`

```typescript
export type JobType =
  | 'webhook'
  | 'scan-movie'
  | 'notify-players'
  | 'discover-assets'
  | 'fetch-provider-assets'
  | 'enrich-metadata'
  | 'select-assets'
  | 'publish'
  | 'library-scan'
  | 'scheduled-file-scan'
  | 'scheduled-provider-update'
  | 'cache-orphan-cleanup'         // [Planned - Post-v1.0]
  | 'cache-soft-delete-expiration'; // [Planned - Post-v1.0]

export interface Job {
  id: number;
  type: JobType;
  priority: number;
  payload: any;
  status: 'pending' | 'processing';
  error?: string | null;
  retry_count: number;
  max_retries: number;
  created_at: string;
  started_at?: string | null;
  updated_at?: string;
}

export interface JobHistoryRecord {
  id: number;
  job_id: number;
  type: JobType;
  priority: number;
  payload: any;
  status: 'completed' | 'failed';
  error?: string | null;
  retry_count: number;
  created_at: string;
  started_at: string;
  completed_at: string;
  duration_ms: number;
}

export interface JobFilters {
  type?: JobType;
  status?: 'pending' | 'processing';
  limit?: number;
}

export interface JobHistoryFilters {
  type?: JobType;
  status?: 'completed' | 'failed';
  limit?: number;
}

export interface QueueStats {
  pending: number;
  processing: number;
  totalActive: number;
  oldestPendingAge: number | null;
}

export interface IJobQueueStorage {
  addJob(job: Omit<Job, 'id' | 'created_at'>): Promise<number>;
  pickNextJob(): Promise<Job | null>;
  completeJob(jobId: number, result?: any): Promise<void>;
  failJob(jobId: number, error: string): Promise<void>;
  getJob(jobId: number): Promise<Job | null>;
  listJobs(filters?: JobFilters): Promise<Job[]>;
  getJobHistory(filters?: JobHistoryFilters): Promise<JobHistoryRecord[]>;
  resetStalledJobs(): Promise<number>;
  cleanupHistory(retentionDays: { completed: number; failed: number }): Promise<number>;
  getStats(): Promise<QueueStats>;
}
```

---

## 📋 Garbage Collection Jobs (Planned - Post-v1.0)

### Job Types

**`cache-orphan-cleanup`**:
- **Priority**: Low (10)
- **Schedule**: Daily at 3 AM
- **Purpose**: Remove unreferenced cache assets (no database references)
- **Payload**: `{ assetType: 'image' | 'video' | 'audio' | 'text' }`

**`cache-soft-delete-expiration`**:
- **Priority**: Low (10)
- **Schedule**: Daily at 3 AM
- **Purpose**: Hard delete expired soft-deleted assets
- **Payload**: `{ retentionDays: number }` (default: 30)

### Implementation Notes

See [ASSET_STORAGE_ARCHITECTURE.md](ASSET_STORAGE_ARCHITECTURE.md#garbage-collection) for complete GC strategy documentation.

---

## 🎯 Usage Examples

### Producer (Webhook Handler)

```typescript
// webhookController.ts
async handleRadarr(req: Request, res: Response): Promise<void> {
  const payload = req.body as RadarrWebhookPayload;

  // Create job (producer only, no processing)
  await jobQueue.addJob({
    type: 'webhook',
    priority: 1,
    payload: {
      source: 'radarr',
      eventType: payload.eventType,
      movie: payload.movie
    },
    max_retries: 3
  });

  // Return immediately
  res.json({ status: 'success', message: 'Webhook queued' });
}
```

### Consumer (Job Handler)

```typescript
// jobHandlers.ts
async handleWebhook(job: Job): Promise<void> {
  logger.info('[JobHandlers] Processing webhook', {
    jobId: job.id,
    source: job.payload.source,
    eventType: job.payload.eventType
  });

  // Do work...
  const result = await scanMovieDirectory(...);

  // Create follow-up job
  await this.jobQueue.addJob({
    type: 'notify-players',
    priority: 5,
    payload: { libraryId: result.libraryId },
    max_retries: 2
  });
}
```

---

## ✅ Benefits of This Design

1. **Modularity**: Swap storage backends without changing business logic
2. **Persistence**: Jobs survive crashes (no work lost)
3. **Crash Recovery**: Auto-restart stalled jobs on startup
4. **Clean Separation**: Producers create, consumers process
5. **History Tracking**: All completed/failed jobs archived
6. **Visibility**: Full job lifecycle logging
7. **Testability**: Mock storage interface for tests

---

## 🚀 Next Steps

1. Implement SQLite storage adapter
2. Create migration for job_history table
3. Refactor webhook controller to use job queue
4. Update job handlers to use new architecture
5. Add crash recovery on app startup
6. Implement history cleanup scheduler

---

**Status**: Design complete, ready for implementation
**Priority**: HIGH (critical for production)
