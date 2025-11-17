import { DatabaseManager } from '../../database/DatabaseManager.js';
import { LibrarySchedulerConfigService } from '../librarySchedulerConfigService.js';
import { JobQueueService } from '../jobQueueService.js';
import { logger } from '../../middleware/logging.js';

/**
 * Provider Updater Scheduler
 *
 * Periodically checks for libraries that need provider updates
 * and submits jobs to the queue for processing.
 *
 * Jobs are submitted with priority 7 (normal priority, automated).
 * Fetches metadata + assets in ONE API call per provider (efficient).
 */
export class ProviderUpdaterScheduler {
  private schedulerConfigService: LibrarySchedulerConfigService;
  private jobQueueService: JobQueueService;
  private intervalId: NodeJS.Timeout | null = null;
  private checkIntervalMs: number;
  private isRunning = false;

  constructor(
    dbManager: DatabaseManager,
    jobQueueService: JobQueueService,
    checkIntervalMs: number = 300000 // Default: check every 5 minutes
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
      logger.warn('ProviderUpdaterScheduler already running');
      return;
    }

    logger.info('Starting ProviderUpdaterScheduler', {
      checkIntervalMs: this.checkIntervalMs,
    });

    // Run immediately on start
    this.checkAndQueueJobs().catch(error => {
      logger.error('ProviderUpdaterScheduler initial check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    });

    // Schedule periodic checks
    this.intervalId = setInterval(() => {
      this.checkAndQueueJobs().catch(error => {
        logger.error('ProviderUpdaterScheduler periodic check failed', {
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
      logger.info('ProviderUpdaterScheduler stopped');
    }
  }

  /**
   * Check for libraries needing provider updates and queue jobs
   */
  private async checkAndQueueJobs(): Promise<void> {
    if (this.isRunning) {
      logger.debug('ProviderUpdaterScheduler check already in progress, skipping');
      return;
    }

    this.isRunning = true;

    try {
      // Get libraries that need provider updates based on interval
      const libraryIds = await this.schedulerConfigService.getLibrariesNeedingProviderUpdate();

      if (libraryIds.length === 0) {
        logger.debug('No libraries need provider updates at this time');
        return;
      }

      logger.info('Found libraries needing provider updates', {
        libraryIds,
        count: libraryIds.length,
      });

      for (const libraryId of libraryIds) {
        try {
          const jobId = await this.jobQueueService.addJob({
            type: 'scheduled-provider-update',
            priority: 7, // Normal priority (automated, but important)
            payload: {
              taskId: 'provider-refresh',
              manual: false,
            },
            retry_count: 0,
            max_retries: 3,
          });

          logger.info('Queued provider update job for library', {
            libraryId,
            jobId,
          });

          // Update last_run timestamp IMMEDIATELY when job is queued
          // This ensures the next run is based on the START time, not completion time
          await this.schedulerConfigService.updateProviderUpdaterLastRun(libraryId);
        } catch (error) {
          logger.error('Failed to queue provider update job for library', {
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
   * Manually trigger a provider update for a specific library
   * (Used when user clicks "Force Update" button)
   */
  async triggerUpdate(libraryId: number): Promise<number> {
    logger.info('Manually triggering provider update', { libraryId });

    // Queue job with higher priority for manual triggers
    const jobId = await this.jobQueueService.addJob({
      type: 'scheduled-provider-update',
      priority: 4, // Higher priority for manual triggers
      payload: {
        taskId: 'provider-refresh',
        manual: true,
      },
      retry_count: 0,
      max_retries: 3,
    });

    // Update last_run timestamp so next scheduled update waits full interval
    await this.schedulerConfigService.updateProviderUpdaterLastRun(libraryId);

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
