import { DatabaseManager } from '../../database/DatabaseManager.js';
import { LibrarySchedulerConfigService } from '../librarySchedulerConfigService.js';
import { LibraryScanService } from '../libraryScanService.js';
import { logger } from '../../middleware/logging.js';

/**
 * File Scanner Scheduler
 *
 * Periodically checks for libraries that need filesystem scanning
 * and triggers scans to detect new/moved/deleted files by *arr.
 *
 * Does NOT make any provider API calls.
 */
export class FileScannerScheduler {
  private dbManager: DatabaseManager;
  private schedulerConfigService: LibrarySchedulerConfigService;
  private libraryScanService: LibraryScanService;
  private intervalId: NodeJS.Timeout | null = null;
  private checkIntervalMs: number;
  private isRunning = false;

  constructor(
    dbManager: DatabaseManager,
    checkIntervalMs: number = 60000 // Default: check every 60 seconds
  ) {
    this.dbManager = dbManager;
    this.schedulerConfigService = new LibrarySchedulerConfigService(dbManager.getConnection());
    this.libraryScanService = new LibraryScanService(dbManager);
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
    this.checkAndProcessLibraries().catch(error => {
      logger.error('FileScannerScheduler initial check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    });

    // Schedule periodic checks
    this.intervalId = setInterval(() => {
      this.checkAndProcessLibraries().catch(error => {
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
   * Check for libraries needing scans and process them
   */
  private async checkAndProcessLibraries(): Promise<void> {
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

      // Process each library
      for (const libraryId of libraryIds) {
        try {
          await this.processLibrary(libraryId);
        } catch (error) {
          logger.error('Failed to process library for file scanning', {
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
   * Process a single library
   */
  private async processLibrary(libraryId: number): Promise<void> {
    logger.info('Starting file scan for library', { libraryId });

    try {
      // Get library details
      const library = await this.dbManager.getConnection().get<{
        id: number;
        name: string;
        type: string;
        root_path: string;
      }>('SELECT id, name, type, root_path FROM libraries WHERE id = ?', [libraryId]);

      if (!library) {
        logger.error('Library not found', { libraryId });
        return;
      }

      // Trigger library scan
      const scanResult = await this.libraryScanService.startScan(library.id);

      logger.info('File scan completed for library', {
        libraryId,
        libraryName: library.name,
        scanJobId: scanResult.id,
      });

      // Update last run timestamp
      await this.schedulerConfigService.updateFileScannerLastRun(libraryId);

      logger.info('Updated file scanner last run timestamp', { libraryId });
    } catch (error) {
      logger.error('File scan failed for library', {
        libraryId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
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
