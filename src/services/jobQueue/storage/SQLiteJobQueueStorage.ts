import { DatabaseConnection } from '../../../types/database.js';
import {
  IJobQueueStorage,
  Job,
  JobHistoryRecord,
  JobFilters,
  JobHistoryFilters,
  QueueStats,
} from '../types.js';
import { logger } from '../../../middleware/logging.js';

/**
 * SQLite-based job queue storage
 *
 * Implements persistent job queue with:
 * - Active queue (job_queue table): pending and processing jobs
 * - History (job_history table): completed and failed jobs
 * - Crash recovery: Reset processing jobs on startup
 * - Automatic archival: Completed jobs removed from queue
 */
export class SQLiteJobQueueStorage implements IJobQueueStorage {
  constructor(private db: DatabaseConnection) {}

  async addJob(job: Omit<Job, 'id' | 'created_at'>): Promise<number> {
    logger.debug('[SQLiteJobQueueStorage] Adding job', {
      service: 'SQLiteJobQueueStorage',
      operation: 'addJob',
      type: job.type,
      priority: job.priority,
    });

    const result = await this.db.execute(
      `INSERT INTO job_queue (
        type, priority, payload, status, retry_count, max_retries, created_at, updated_at
      ) VALUES (?, ?, ?, 'pending', 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [job.type, job.priority, JSON.stringify(job.payload), job.max_retries || 3]
    );

    const jobId = result.insertId!;

    logger.info('[SQLiteJobQueueStorage] Job created', {
      service: 'SQLiteJobQueueStorage',
      operation: 'addJob',
      jobId,
      type: job.type,
      priority: job.priority,
    });

    return jobId;
  }

  async pickNextJob(): Promise<Job | null> {
    // Pick highest priority job (lowest number = highest priority)
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
    };
  }

  async completeJob(jobId: number, _result?: any): Promise<void> {
    // Get job data
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
    const now = Date.now();
    const startedAt = new Date(job.started_at).getTime();
    const duration = now - startedAt;

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
        duration,
      ]
    );

    // Remove from active queue
    await this.db.execute('DELETE FROM job_queue WHERE id = ?', [jobId]);

    logger.info('[SQLiteJobQueueStorage] Job completed and archived', {
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
      // No retries left: Archive and remove
      const now = Date.now();
      const startedAt = job.started_at ? new Date(job.started_at).getTime() : now;
      const duration = now - startedAt;

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
          job.started_at || new Date().toISOString(),
          duration,
        ]
      );

      await this.db.execute('DELETE FROM job_queue WHERE id = ?', [jobId]);

      logger.error('[SQLiteJobQueueStorage] Job permanently failed and archived', {
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

    return records.map((record) => ({
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
      duration_ms: record.duration_ms,
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

  async cleanupHistory(retentionDays: {
    completed: number;
    failed: number;
  }): Promise<number> {
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

    if (totalDeleted > 0) {
      logger.info('[SQLiteJobQueueStorage] Cleaned up job history', {
        service: 'SQLiteJobQueueStorage',
        operation: 'cleanupHistory',
        deleted: totalDeleted,
        retentionDays,
      });
    }

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
      oldestPendingAge: row.oldest_pending_age || null,
    };
  }
}
