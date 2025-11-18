import { DatabaseConnection } from '../../../types/database.js';
import {
  IJobQueueStorage,
  Job,
  JobFilters,
  QueueStats,
} from '../types.js';
import { logger } from '../../../middleware/logging.js';
import { SqlParam } from '../../../types/database.js';

/**
 * SQLite-based job queue storage
 *
 * Implements persistent job queue with:
 * - Active queue (job_queue table): pending and processing jobs
 * - Crash recovery: Reset processing jobs on startup
 * - Simple completion: Completed jobs removed from queue (use logs for history)
 */
export class SQLiteJobQueueStorage implements IJobQueueStorage {
  constructor(private readonly db: DatabaseConnection) {}

  async addJob(job: Omit<Job, 'id' | 'created_at'>): Promise<number> {
    logger.debug('[SQLiteJobQueueStorage] Adding job', {
      service: 'SQLiteJobQueueStorage',
      operation: 'addJob',
      type: job.type,
      priority: job.priority,
      manual: job.manual || false,
    });

    const result = await this.db.execute(
      `INSERT INTO job_queue (
        type, priority, payload, status, retry_count, max_retries, manual, created_at, updated_at
      ) VALUES (?, ?, ?, 'pending', 0, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [job.type, job.priority, JSON.stringify(job.payload), job.max_retries || 3, job.manual ? 1 : 0]
    );

    const jobId = result.insertId!;

    logger.info('[SQLiteJobQueueStorage] Job created', {
      service: 'SQLiteJobQueueStorage',
      operation: 'addJob',
      jobId,
      type: job.type,
      priority: job.priority,
      manual: job.manual || false,
    });

    return jobId;
  }

  async pickNextJob(): Promise<Job | null> {
    // Atomic UPDATE...RETURNING to prevent race conditions
    // SQLite 3.35+ supports RETURNING clause for atomic operations
    const jobs = await this.db.query<any>(
      `UPDATE job_queue
       SET status = 'processing',
           started_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = (
         SELECT id FROM job_queue
         WHERE status = 'pending'
         ORDER BY priority ASC, created_at ASC
         LIMIT 1
       )
       RETURNING *`
    );

    if (jobs.length === 0) {
      return null;
    }

    const job = jobs[0];
    const waitTime = Date.now() - new Date(job.created_at).getTime();

    logger.info('[SQLiteJobQueueStorage] Job picked', {
      service: 'SQLiteJobQueueStorage',
      operation: 'pickNextJob',
      jobId: job.id,
      type: job.type,
      priority: job.priority,
      waitTime: `${waitTime}ms`,
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
      updated_at: job.updated_at,
      manual: job.manual === 1,
    };
  }

  async completeJob(jobId: number, _result?: unknown): Promise<void> {
    // Get job data for logging
    const jobs = await this.db.query<any>('SELECT * FROM job_queue WHERE id = ?', [jobId]);

    if (jobs.length === 0) {
      logger.warn('[SQLiteJobQueueStorage] Job not found for completion', {
        service: 'SQLiteJobQueueStorage',
        operation: 'completeJob',
        jobId,
      });
      return;
    }

    const job = jobs[0];

    // Calculate duration if started_at is available
    const duration = job.started_at
      ? Date.now() - new Date(job.started_at).getTime()
      : 0;

    // Simply remove from active queue (no history archival)
    await this.db.execute('DELETE FROM job_queue WHERE id = ?', [jobId]);

    logger.info('[SQLiteJobQueueStorage] Job completed and removed from queue', {
      service: 'SQLiteJobQueueStorage',
      operation: 'completeJob',
      jobId,
      type: job.type,
      duration: `${duration}ms`,
    });
  }

  async failJob(jobId: number, error: string): Promise<void> {
    const jobs = await this.db.query<any>('SELECT * FROM job_queue WHERE id = ?', [jobId]);

    if (jobs.length === 0) {
      logger.warn('[SQLiteJobQueueStorage] Job not found for failure', {
        service: 'SQLiteJobQueueStorage',
        operation: 'failJob',
        jobId,
      });
      return;
    }

    const job = jobs[0];
    const newRetryCount = job.retry_count + 1;
    const hasRetriesLeft = newRetryCount < job.max_retries;

    if (hasRetriesLeft) {
      // Retry: Reset to pending
      await this.db.execute(
        `UPDATE job_queue
         SET status = 'pending', retry_count = ?, error = ?, started_at = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [newRetryCount, error, jobId]
      );

      logger.warn('[SQLiteJobQueueStorage] Job failed, will retry', {
        service: 'SQLiteJobQueueStorage',
        operation: 'failJob',
        jobId,
        type: job.type,
        retryCount: newRetryCount,
        maxRetries: job.max_retries,
        error,
      });
    } else {
      // No retries left: Simply remove from queue (logged but not archived)
      await this.db.execute('DELETE FROM job_queue WHERE id = ?', [jobId]);

      logger.error('[SQLiteJobQueueStorage] Job permanently failed and removed from queue', {
        service: 'SQLiteJobQueueStorage',
        operation: 'failJob',
        jobId,
        type: job.type,
        retryCount: newRetryCount,
        error,
      });
    }
  }

  async getJob(jobId: number): Promise<Job | null> {
    const jobs = await this.db.query<any>('SELECT * FROM job_queue WHERE id = ?', [jobId]);

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
      updated_at: job.updated_at,
      manual: job.manual === 1,
    };
  }

  async listJobs(filters?: JobFilters): Promise<Job[]> {
    let query = 'SELECT * FROM job_queue WHERE 1=1';
    const params: SqlParam[] = [];

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

    return jobs.map((job) => ({
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
      updated_at: job.updated_at,
      manual: job.manual === 1,
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
        service: 'SQLiteJobQueueStorage',
        operation: 'resetStalledJobs',
        count,
      });
    } else {
      logger.info('[SQLiteJobQueueStorage] No stalled jobs found', {
        service: 'SQLiteJobQueueStorage',
        operation: 'resetStalledJobs',
      });
    }

    return count;
  }


  async getStats(): Promise<QueueStats> {
    // Get active queue stats only (no history table)
    const queueStats = await this.db.query<any>(
      `SELECT
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing,
        MIN(CASE WHEN status = 'pending'
          THEN (strftime('%s', 'now') - strftime('%s', created_at)) * 1000
          ELSE NULL END) as oldest_pending_age
       FROM job_queue`
    );

    const queueRow = queueStats[0];

    return {
      pending: queueRow.pending || 0,
      processing: queueRow.processing || 0,
      totalActive: (queueRow.pending || 0) + (queueRow.processing || 0),
      oldestPendingAge: queueRow.oldest_pending_age || null,
      // completed/failed stats removed - use logs for historical data
    };
  }

  /**
   * Get recent jobs (active jobs only, no history)
   * Used by frontend to show current job activity
   */
  async getRecentJobs(): Promise<Job[]> {
    // Simply return all active jobs (no history table)
    return await this.listJobs();
  }
}
