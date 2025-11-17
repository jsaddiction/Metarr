import { DatabaseManager } from '../../database/DatabaseManager.js';
import { LibrarySchedulerConfigService } from '../librarySchedulerConfigService.js';
import { JobQueueService } from '../jobQueueService.js';
import { logger } from '../../middleware/logging.js';

/**
 * File Scanner Scheduler
 *
 * Periodically checks for libraries that need filesystem scanning
 * and submits jobs to the queue for processing.
 *
 * Jobs are submitted with priority 9 (low priority, automated).
 * Does NOT make any provider API calls.
 */
export class FileScannerScheduler {
  private readonly schedulerConfigService: LibrarySchedulerConfigService;
  private readonly jobQueueService: JobQueueService;
  private intervalId: NodeJS.Timeout | null = null;
  private checkIntervalMs: number;
  private isRunning = false;

  constructor(
    dbManager: DatabaseManager,
    jobQueueService: JobQueueService,
    checkIntervalMs: number = 60000 // Default: check every 60 seconds
  ) {
    this.schedulerConfigService = new LibrarySchedulerConfigService(dbManager.getConnection());
    this.jobQueueService = jobQueueService;
    this.checkIntervalMs = checkIntervalMs;
  }

  /**
   * Start the scheduler
   */
  start(): void {
    if (this.intervalId) {
      logger.warn('FileScannerScheduler already running');
      return;
    }

    logger.info('Starting FileScannerScheduler', {
      checkIntervalMs: this.checkIntervalMs,
    });

    // Run immediately on start
    this.checkAndQueueJobs().catch(error => {
      logger.error('FileScannerScheduler initial check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    });

    // Schedule periodic checks
    this.intervalId = setInterval(() => {
      this.checkAndQueueJobs().catch(error => {
        logger.error('FileScannerScheduler periodic check failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, this.checkIntervalMs);
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('FileScannerScheduler stopped');
    }
  }

  /**
   * Check for libraries needing scans and queue jobs
   */
  private async checkAndQueueJobs(): Promise<void> {
    if (this.isRunning) {
      logger.debug('FileScannerScheduler check already in progress, skipping');
      return;
    }

    this.isRunning = true;

    try {
      // Get libraries that need scanning based on interval
      const libraryIds = await this.schedulerConfigService.getLibrariesNeedingFileScan();

      if (libraryIds.length === 0) {
        logger.debug('No libraries need file scanning at this time');
        return;
      }

      logger.info('Found libraries needing file scanning', {
        libraryIds,
        count: libraryIds.length,
      });

      for (const libraryId of libraryIds) {
        try {
          const jobId = await this.jobQueueService.addJob({
            type: 'scheduled-file-scan',
            priority: 9, // Low priority (automated maintenance)
            payload: {
              taskId: 'file-scan',
              manual: false,
            },
            retry_count: 0,
            max_retries: 3,
          });

          logger.info('Queued file scan job for library', {
            libraryId,
            jobId,
          });

          // Update last_run timestamp IMMEDIATELY when job is queued
          // This ensures the next run is based on the START time, not completion time
          await this.schedulerConfigService.updateFileScannerLastRun(libraryId);
        } catch (error) {
          logger.error('Failed to queue file scan job for library', {
            libraryId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Manually trigger a file scan for a specific library
   * (Used when user clicks "Force Scan" button)
   */
  async triggerScan(libraryId: number): Promise<number> {
    logger.info('Manually triggering file scan', { libraryId });

    // Queue job with higher priority for manual triggers
    const jobId = await this.jobQueueService.addJob({
      type: 'scheduled-file-scan',
      priority: 4, // Higher priority for manual triggers
      payload: {
        taskId: 'file-scan',
        manual: true,
      },
      retry_count: 0,
      max_retries: 3,
    });

    // Update last_run timestamp so next scheduled scan waits full interval
    await this.schedulerConfigService.updateFileScannerLastRun(libraryId);

    return jobId;
  }

  /**
   * Get scheduler status
   */
  getStatus(): {
    isRunning: boolean;
    checkIntervalMs: number;
    hasActiveInterval: boolean;
  } {
    return {
      isRunning: this.isRunning,
      checkIntervalMs: this.checkIntervalMs,
      hasActiveInterval: this.intervalId !== null,
    };
  }
}
