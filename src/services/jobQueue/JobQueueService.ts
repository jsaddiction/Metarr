import { IJobQueueStorage, Job, JobType, JobProgress, QueueStats } from './types.js';
import { logger } from '../../middleware/logging.js';
import { websocketBroadcaster } from '../websocketBroadcaster.js';

/**
 * Job Queue Service
 *
 * Background job processing with priority-based execution.
 * Uses pluggable storage backends (SQLite, Redis, PostgreSQL, etc.)
 *
 * Priority Levels (1-10):
 * 1-2:   CRITICAL (Webhooks from Radarr/Sonarr, user actions)
 * 3-4:   HIGH (Scans triggered by webhooks)
 * 5-7:   NORMAL (Notifications, enrichment)
 * 8-10:  LOW (Scheduled tasks, maintenance)
 */

export interface JobHandler {
  (job: Job): Promise<void>;
}

export class JobQueueService {
  private storage: IJobQueueStorage;
  private handlers: Map<JobType, JobHandler> = new Map();
  private isProcessing: boolean = false;
  private processingInterval: NodeJS.Timeout | null = null;
  private readonly POLL_INTERVAL = 1000; // 1 second

  // Circuit breaker state
  private consecutiveFailures: number = 0;
  private readonly MAX_CONSECUTIVE_FAILURES = 5;
  private circuitBroken: boolean = false;
  private circuitResetTimeout: NodeJS.Timeout | null = null;
  private readonly CIRCUIT_RESET_DELAY_MS = 60000; // 1 minute

  constructor(storage: IJobQueueStorage) {
    this.storage = storage;
  }

  /**
   * Initialize job queue
   * - Reset stalled jobs (crash recovery)
   * - Log queue statistics
   */
  async initialize(): Promise<void> {
    logger.info('[JobQueueService] Initializing job queue', {
      service: 'JobQueueService',
      operation: 'initialize',
    });

    // Crash recovery: Reset all 'processing' jobs to 'pending'
    const resetCount = await this.storage.resetStalledJobs();

    if (resetCount > 0) {
      logger.warn('[JobQueueService] Recovered stalled jobs from previous crash', {
        service: 'JobQueueService',
        operation: 'initialize',
        count: resetCount,
      });
    }

    // Get queue statistics
    const stats = await this.storage.getStats();
    logger.info('[JobQueueService] Job queue initialized', {
      service: 'JobQueueService',
      operation: 'initialize',
      ...stats,
    });
  }

  /**
   * Register a job handler
   */
  registerHandler(type: JobType, handler: JobHandler): void {
    this.handlers.set(type, handler);
    logger.info('[JobQueueService] Registered job handler', {
      service: 'JobQueueService',
      operation: 'registerHandler',
      type,
    });
  }

  /**
   * Add a job to the queue
   */
  async addJob(job: Omit<Job, 'id' | 'created_at' | 'status'>): Promise<number> {
    const jobId = await this.storage.addJob({
      ...job,
      status: 'pending',
    } as any);

    // Broadcast job created
    websocketBroadcaster.broadcast('job:created', {
      jobId,
      type: job.type,
      priority: job.priority,
    });

    logger.info('[JobQueueService] Job added to queue', {
      service: 'JobQueueService',
      operation: 'addJob',
      jobId,
      type: job.type,
      priority: job.priority,
    });

    return jobId;
  }

  /**
   * Start processing jobs
   */
  start(): void {
    if (this.isProcessing) {
      logger.warn('[JobQueueService] Job queue processor already running', {
        service: 'JobQueueService',
        operation: 'start',
      });
      return;
    }

    this.isProcessing = true;
    this.processingInterval = setInterval(() => {
      // Check circuit breaker state
      if (this.circuitBroken) {
        return; // Skip processing while circuit is open
      }

      this.processNextJob().catch((error) => {
        logger.error('[JobQueueService] Error in job processing loop', {
          service: 'JobQueueService',
          operation: 'processNextJob',
          error: error.message,
        });
        this.handleProcessingLoopError(error);
      });
    }, this.POLL_INTERVAL);

    logger.info('[JobQueueService] Job queue processor started', {
      service: 'JobQueueService',
      operation: 'start',
    });
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

    logger.info('[JobQueueService] Job queue processor stopped', {
      service: 'JobQueueService',
      operation: 'stop',
    });
  }

  /**
   * Process next job in queue
   */
  private async processNextJob(): Promise<void> {
    // Pick next job (atomic operation)
    const job = await this.storage.pickNextJob();

    if (!job) {
      return; // No jobs available
    }

    const handler = this.handlers.get(job.type);

    if (!handler) {
      logger.error('[JobQueueService] No handler for job type', {
        service: 'JobQueueService',
        operation: 'processNextJob',
        jobId: job.id,
        type: job.type,
      });

      await this.storage.failJob(job.id, `No handler registered for job type: ${job.type}`);
      return;
    }

    // Broadcast job started
    websocketBroadcaster.broadcast('job:started', {
      jobId: job.id,
      type: job.type,
      priority: job.priority,
    });

    logger.info('[JobQueueService] Processing job', {
      service: 'JobQueueService',
      operation: 'processNextJob',
      jobId: job.id,
      type: job.type,
      priority: job.priority,
      retryCount: job.retry_count,
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
        duration,
      });

      logger.info('[JobQueueService] Job completed', {
        service: 'JobQueueService',
        operation: 'processNextJob',
        jobId: job.id,
        type: job.type,
        duration: `${duration}ms`,
      });

      // Reset circuit breaker on success
      this.consecutiveFailures = 0;
    } catch (error: any) {
      const duration = Date.now() - startTime;

      logger.error('[JobQueueService] Job failed', {
        service: 'JobQueueService',
        operation: 'processNextJob',
        jobId: job.id,
        type: job.type,
        error: error.message,
        retryCount: job.retry_count,
        maxRetries: job.max_retries,
      });

      // Mark as failed (retries if possible, archives if not)
      await this.storage.failJob(job.id, error.message);

      // Broadcast job failed
      websocketBroadcaster.broadcast('job:failed', {
        jobId: job.id,
        type: job.type,
        error: error.message,
        willRetry: job.retry_count + 1 < job.max_retries,
        duration,
      });

      // Note: Don't increment consecutiveFailures for individual job failures
      // Circuit breaker is for processing loop errors only
    }
  }

  /**
   * Get job by ID
   */
  async getJob(jobId: number): Promise<Job | null> {
    return await this.storage.getJob(jobId);
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
   * Cleanup old history records
   */
  async cleanupHistory(retentionDays = { completed: 30, failed: 90 }): Promise<number> {
    const deletedCount = await this.storage.cleanupHistory(retentionDays);

    logger.info('[JobQueueService] Cleaned up job history', {
      service: 'JobQueueService',
      operation: 'cleanupHistory',
      deletedCount,
      retentionDays,
    });

    return deletedCount;
  }

  /**
   * Update job progress and broadcast via WebSocket
   * Use this in long-running job handlers to report progress
   *
   * @example
   * await jobQueue.updateJobProgress(job.id, {
   *   current: 5,
   *   total: 10,
   *   percentage: 50,
   *   message: 'Scanning directory 5 of 10',
   *   detail: '/movies/The Matrix'
   * });
   */
  async updateJobProgress(jobId: number, progress: JobProgress): Promise<void> {
    // Broadcast progress via WebSocket (don't store in DB)
    websocketBroadcaster.broadcast('job:progress', {
      jobId,
      progress,
    });

    logger.debug('[JobQueueService] Job progress updated', {
      service: 'JobQueueService',
      operation: 'updateJobProgress',
      jobId,
      percentage: progress.percentage,
      message: progress.message,
    });
  }

  /**
   * Broadcast queue statistics via WebSocket
   */
  async broadcastQueueStats(): Promise<void> {
    try {
      const stats = await this.getStats();
      websocketBroadcaster.broadcast('queue:stats', stats);
    } catch (error: any) {
      logger.error('[JobQueueService] Failed to broadcast queue stats', {
        service: 'JobQueueService',
        operation: 'broadcastQueueStats',
        error: error.message,
      });
    }
  }

  /**
   * Handle error in processing loop (circuit breaker)
   */
  private handleProcessingLoopError(error: Error): void {
    this.consecutiveFailures++;

    logger.error('[JobQueueService] Job processing loop error', {
      service: 'JobQueueService',
      operation: 'handleProcessingLoopError',
      consecutiveFailures: this.consecutiveFailures,
      maxConsecutiveFailures: this.MAX_CONSECUTIVE_FAILURES,
      error: error.message,
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

    logger.error('[JobQueueService] Circuit breaker OPENED - stopping job processing', {
      service: 'JobQueueService',
      operation: 'openCircuitBreaker',
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
    logger.info('[JobQueueService] Circuit breaker RESET - resuming job processing', {
      service: 'JobQueueService',
      operation: 'resetCircuitBreaker',
    });

    this.circuitBroken = false;
    this.consecutiveFailures = 0;
    this.circuitResetTimeout = null;
  }
}
