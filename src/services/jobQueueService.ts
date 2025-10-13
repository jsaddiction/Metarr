import { DatabaseConnection } from '../types/database.js';
import { logger } from '../middleware/logging.js';
import { websocketBroadcaster } from './websocketBroadcaster.js';

/**
 * Job Queue Service
 *
 * Background job processing with priority-based execution.
 *
 * Priority Levels (1-10):
 * 1 = Critical (Webhooks from Sonarr/Radarr - immediate processing)
 * 2-4 = High (User-initiated actions - manual selections, publishing)
 * 5-7 = Normal (Scheduled enrichment, asset discovery)
 * 8-10 = Low (Library scans, maintenance tasks)
 *
 * Job Types:
 * - webhook: Process webhook from Sonarr/Radarr/Lidarr
 * - discover-assets: Scan filesystem for assets
 * - fetch-provider-assets: Fetch assets from TMDB/TVDB
 * - enrich-metadata: Fetch metadata from providers
 * - select-assets: Auto-select assets (YOLO/Hybrid mode)
 * - publish: Publish entity to library
 * - library-scan: Full library scan (user-initiated)
 * - scheduled-file-scan: Scheduled filesystem scan (automatic)
 * - scheduled-provider-update: Scheduled provider metadata/asset update (automatic)
 *
 * Job States:
 * - pending: Waiting to be processed
 * - processing: Currently being processed
 * - completed: Successfully completed
 * - failed: Failed with error
 * - retrying: Failed but will retry
 */

export interface Job {
  id?: number;
  type: JobType;
  priority: number;
  payload: any;
  state?: JobState;
  error?: string | null;
  retry_count?: number;
  max_retries?: number;
  created_at?: string;
  started_at?: string | null;
  completed_at?: string | null;
}

export type JobType =
  | 'webhook'
  | 'discover-assets'
  | 'fetch-provider-assets'
  | 'enrich-metadata'
  | 'select-assets'
  | 'publish'
  | 'library-scan'
  | 'scheduled-file-scan'
  | 'scheduled-provider-update';

export type JobState = 'pending' | 'processing' | 'completed' | 'failed' | 'retrying';

export interface JobHandler {
  (job: Job): Promise<void>;
}

export class JobQueueService {
  private db: DatabaseConnection;
  private handlers: Map<JobType, JobHandler>;
  private isProcessing: boolean = false;
  private processingInterval: NodeJS.Timeout | null = null;
  private readonly POLL_INTERVAL = 1000; // 1 second
  private readonly MAX_RETRIES = 3;

  // Circuit breaker state
  private consecutiveFailures: number = 0;
  private readonly MAX_CONSECUTIVE_FAILURES = 5;
  private circuitBroken: boolean = false;
  private circuitResetTimeout: NodeJS.Timeout | null = null;
  private readonly CIRCUIT_RESET_DELAY_MS = 60000; // 1 minute

  constructor(db: DatabaseConnection) {
    this.db = db;
    this.handlers = new Map();
  }

  /**
   * Register a job handler
   */
  registerHandler(type: JobType, handler: JobHandler): void {
    this.handlers.set(type, handler);
    logger.info(`Registered job handler: ${type}`);
  }

  /**
   * Add a job to the queue
   */
  async addJob(job: Omit<Job, 'id' | 'created_at'>): Promise<number> {
    const result = await this.db.execute(
      `INSERT INTO job_queue (
        type, priority, payload, state, retry_count, max_retries, created_at
      ) VALUES (?, ?, ?, 'pending', 0, ?, CURRENT_TIMESTAMP)`,
      [
        job.type,
        job.priority,
        JSON.stringify(job.payload),
        job.max_retries || this.MAX_RETRIES
      ]
    );

    logger.info(`Job added to queue: ${job.type} (priority ${job.priority})`, {
      jobId: result.insertId
    });

    return result.insertId!;
  }

  /**
   * Start processing jobs
   */
  start(): void {
    if (this.isProcessing) {
      logger.warn('Job queue processor already running');
      return;
    }

    this.isProcessing = true;
    this.processingInterval = setInterval(() => {
      // Check circuit breaker state
      if (this.circuitBroken) {
        logger.warn('Job queue circuit breaker is OPEN - not processing jobs', {
          consecutiveFailures: this.consecutiveFailures,
        });
        return;
      }

      this.processNextJob().catch(error => {
        logger.error('Error in job processing loop:', error);
        this.handleProcessingLoopError(error);
      });
    }, this.POLL_INTERVAL);

    logger.info('Job queue processor started');
  }

  /**
   * Stop processing jobs
   */
  stop(): void {
    if (!this.isProcessing) {
      return;
    }

    this.isProcessing = false;
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }

    logger.info('Job queue processor stopped');
  }

  /**
   * Process next job in queue (highest priority first)
   */
  private async processNextJob(): Promise<void> {
    let job: Job | undefined;

    try {
      // Get next pending job (ordered by priority ASC, then created_at ASC)
      const jobs = await this.db.query<Job>(
        `SELECT * FROM job_queue
         WHERE state IN ('pending', 'retrying')
         ORDER BY priority ASC, created_at ASC
         LIMIT 1`
      );

      if (jobs.length === 0) {
        return; // No jobs to process
      }

      job = jobs[0];

      // Mark as processing
      await this.db.execute(
        `UPDATE job_queue
         SET state = 'processing', started_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [job.id]
      );

      logger.info(`Processing job ${job.id}: ${job.type}`, {
        priority: job.priority,
        retryCount: job.retry_count
      });

      // Broadcast job status update
      this.broadcastJobStatus(job.id!, job.type, 'processing', job.payload);

      // Execute job handler
      const handler = this.handlers.get(job.type);
      if (!handler) {
        throw new Error(`No handler registered for job type: ${job.type}`);
      }

      // Parse payload
      job.payload = typeof job.payload === 'string' ? JSON.parse(job.payload) : job.payload;

      await handler(job);

      // Mark as completed
      await this.db.execute(
        `UPDATE job_queue
         SET state = 'completed', completed_at = CURRENT_TIMESTAMP, error = NULL
         WHERE id = ?`,
        [job.id]
      );

      logger.info(`Job ${job.id} completed successfully`);

      // Broadcast job completion
      this.broadcastJobStatus(job.id!, job.type, 'completed', job.payload);

      // Record success (reset circuit breaker failure counter)
      this.recordSuccess();

    } catch (error: any) {
      logger.error('Error processing job:', error);
      if (job) {
        await this.handleJobError(job, error);
      }
      // Note: Don't increment consecutiveFailures here - that's for loop errors only
      // Individual job failures are handled by retry logic
    }
  }

  /**
   * Handle job error (retry or mark as failed)
   */
  private async handleJobError(job: Job, error: Error): Promise<void> {
    const retryCount = (job.retry_count || 0) + 1;
    const maxRetries = job.max_retries || this.MAX_RETRIES;

    if (retryCount < maxRetries) {
      // Retry
      await this.db.execute(
        `UPDATE job_queue
         SET state = 'retrying', retry_count = ?, error = ?
         WHERE id = ?`,
        [retryCount, error.message, job.id]
      );

      logger.warn(`Job ${job.id} failed, will retry (${retryCount}/${maxRetries})`, {
        error: error.message
      });
    } else {
      // Max retries reached, mark as failed
      await this.db.execute(
        `UPDATE job_queue
         SET state = 'failed', completed_at = CURRENT_TIMESTAMP, error = ?
         WHERE id = ?`,
        [error.message, job.id]
      );

      logger.error(`Job ${job.id} failed permanently after ${retryCount} retries`, {
        error: error.message
      });
    }
  }

  /**
   * Get job status
   */
  async getJob(jobId: number): Promise<Job | null> {
    const jobs = await this.db.query<Job>(
      `SELECT * FROM job_queue WHERE id = ?`,
      [jobId]
    );

    if (jobs.length === 0) {
      return null;
    }

    const job = jobs[0];
    job.payload = typeof job.payload === 'string' ? JSON.parse(job.payload) : job.payload;
    return job;
  }

  /**
   * Get queue statistics
   */
  async getStats(): Promise<{
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    retrying: number;
  }> {
    const result = await this.db.query<{
      state: JobState;
      count: number;
    }>(
      `SELECT state, COUNT(*) as count FROM job_queue GROUP BY state`
    );

    const stats = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      retrying: 0
    };

    for (const row of result) {
      stats[row.state] = row.count;
    }

    return stats;
  }

  /**
   * Clear completed jobs older than specified days
   */
  async clearOldJobs(daysOld: number = 7): Promise<number> {
    const result = await this.db.execute(
      `DELETE FROM job_queue
       WHERE state = 'completed'
       AND completed_at < datetime('now', '-' || ? || ' days')`,
      [daysOld]
    );

    logger.info(`Cleared ${result.affectedRows} old completed jobs`);
    return result.affectedRows;
  }

  /**
   * Retry failed job
   */
  async retryJob(jobId: number): Promise<boolean> {
    const result = await this.db.execute(
      `UPDATE job_queue
       SET state = 'pending', retry_count = 0, error = NULL, started_at = NULL, completed_at = NULL
       WHERE id = ? AND state = 'failed'`,
      [jobId]
    );

    if (result.affectedRows > 0) {
      logger.info(`Job ${jobId} marked for retry`);
      return true;
    }

    return false;
  }

  /**
   * Cancel pending job
   */
  async cancelJob(jobId: number): Promise<boolean> {
    const result = await this.db.execute(
      `DELETE FROM job_queue WHERE id = ? AND state = 'pending'`,
      [jobId]
    );

    if (result.affectedRows > 0) {
      logger.info(`Job ${jobId} cancelled`);
      return true;
    }

    return false;
  }

  /**
   * Get recent jobs (for UI display)
   */
  async getRecentJobs(limit: number = 50): Promise<Job[]> {
    const jobs = await this.db.query<Job>(
      `SELECT * FROM job_queue
       ORDER BY created_at DESC
       LIMIT ?`,
      [limit]
    );

    // Parse payloads
    for (const job of jobs) {
      job.payload = typeof job.payload === 'string' ? JSON.parse(job.payload) : job.payload;
    }

    return jobs;
  }

  /**
   * Get jobs by type
   */
  async getJobsByType(type: JobType, state?: JobState, limit: number = 50): Promise<Job[]> {
    const sql = state
      ? `SELECT * FROM job_queue WHERE type = ? AND state = ? ORDER BY created_at DESC LIMIT ?`
      : `SELECT * FROM job_queue WHERE type = ? ORDER BY created_at DESC LIMIT ?`;

    const params = state ? [type, state, limit] : [type, limit];

    const jobs = await this.db.query<Job>(sql, params);

    // Parse payloads
    for (const job of jobs) {
      job.payload = typeof job.payload === 'string' ? JSON.parse(job.payload) : job.payload;
    }

    return jobs;
  }

  /**
   * Broadcast job status update via WebSocket
   */
  private broadcastJobStatus(
    jobId: number,
    jobType: JobType,
    status: JobState,
    payload?: any,
    error?: string
  ): void {
    try {
      websocketBroadcaster.broadcastJobStatus(jobId, jobType, status, payload, error);
    } catch (error: any) {
      logger.error('Failed to broadcast job status', {
        jobId,
        error: error.message
      });
    }
  }

  /**
   * Broadcast queue statistics via WebSocket
   */
  async broadcastQueueStats(): Promise<void> {
    try {
      const stats = await this.getStats();
      websocketBroadcaster.broadcastJobQueueStats(stats);
    } catch (error: any) {
      logger.error('Failed to broadcast queue stats', {
        error: error.message
      });
    }
  }

  /**
   * Handle error in processing loop (circuit breaker)
   */
  private handleProcessingLoopError(error: Error): void {
    this.consecutiveFailures++;

    logger.error('Job processing loop error', {
      consecutiveFailures: this.consecutiveFailures,
      maxConsecutiveFailures: this.MAX_CONSECUTIVE_FAILURES,
      error: error.message,
      stack: error.stack,
    });

    // Open circuit breaker if threshold reached
    if (this.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES && !this.circuitBroken) {
      this.openCircuitBreaker();
    }
  }

  /**
   * Open circuit breaker (stop processing jobs temporarily)
   */
  private openCircuitBreaker(): void {
    this.circuitBroken = true;
    logger.error('Job queue circuit breaker OPENED - stopping job processing', {
      consecutiveFailures: this.consecutiveFailures,
      resetDelayMs: this.CIRCUIT_RESET_DELAY_MS,
    });

    // Schedule circuit reset
    if (this.circuitResetTimeout) {
      clearTimeout(this.circuitResetTimeout);
    }

    this.circuitResetTimeout = setTimeout(() => {
      this.resetCircuitBreaker();
    }, this.CIRCUIT_RESET_DELAY_MS);
  }

  /**
   * Reset circuit breaker (allow jobs to process again)
   */
  private resetCircuitBreaker(): void {
    logger.info('Job queue circuit breaker RESET - resuming job processing');
    this.circuitBroken = false;
    this.consecutiveFailures = 0;
    this.circuitResetTimeout = null;
  }

  /**
   * Record successful job processing (reset failure counter)
   */
  private recordSuccess(): void {
    if (this.consecutiveFailures > 0) {
      logger.debug('Job processed successfully, resetting failure counter', {
        previousFailures: this.consecutiveFailures,
      });
      this.consecutiveFailures = 0;
    }
  }
}
