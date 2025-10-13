import { Request, Response, NextFunction } from 'express';
import { DatabaseManager } from '../database/DatabaseManager.js';
import { FileScannerScheduler } from '../services/schedulers/FileScannerScheduler.js';
import { ProviderUpdaterScheduler } from '../services/schedulers/ProviderUpdaterScheduler.js';
import { LibrarySchedulerConfigService } from '../services/librarySchedulerConfigService.js';
import { logger } from '../middleware/logging.js';

/**
 * Scheduler Controller
 *
 * Manages scheduled background services:
 * - Manual job triggering
 * - Scheduler configuration (intervals, enable/disable)
 * - Status information
 */
export class SchedulerController {
  private schedulerConfigService: LibrarySchedulerConfigService;
  private fileScannerScheduler: FileScannerScheduler;
  private providerUpdaterScheduler: ProviderUpdaterScheduler;

  constructor(
    dbManager: DatabaseManager,
    fileScannerScheduler: FileScannerScheduler,
    providerUpdaterScheduler: ProviderUpdaterScheduler
  ) {
    this.schedulerConfigService = new LibrarySchedulerConfigService(dbManager.getConnection());
    this.fileScannerScheduler = fileScannerScheduler;
    this.providerUpdaterScheduler = providerUpdaterScheduler;
  }

  /**
   * GET /api/scheduler/status
   * Get scheduler status information
   */
  getStatus = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const fileScannerStatus = this.fileScannerScheduler.getStatus();
      const providerUpdaterStatus = this.providerUpdaterScheduler.getStatus();

      res.json({
        fileScanner: {
          isRunning: fileScannerStatus.isRunning,
          hasActiveInterval: fileScannerStatus.hasActiveInterval,
          checkIntervalMs: fileScannerStatus.checkIntervalMs,
        },
        providerUpdater: {
          isRunning: providerUpdaterStatus.isRunning,
          hasActiveInterval: providerUpdaterStatus.hasActiveInterval,
          checkIntervalMs: providerUpdaterStatus.checkIntervalMs,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/libraries/:libraryId/scheduler
   * Get scheduler configuration for a library
   */
  getLibraryConfig = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const libraryId = parseInt(req.params.libraryId, 10);

      if (isNaN(libraryId)) {
        res.status(400).json({ error: 'Invalid library ID' });
        return;
      }

      let config = await this.schedulerConfigService.getSchedulerConfig(libraryId);

      // If no config exists, return default config (without creating it)
      if (!config) {
        config = this.schedulerConfigService.getDefaultSchedulerConfig(libraryId);
      }

      res.json(config);
    } catch (error) {
      next(error);
    }
  };

  /**
   * PUT /api/libraries/:libraryId/scheduler
   * Update scheduler configuration for a library
   */
  updateLibraryConfig = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const libraryId = parseInt(req.params.libraryId, 10);

      if (isNaN(libraryId)) {
        res.status(400).json({ error: 'Invalid library ID' });
        return;
      }

      const {
        fileScannerEnabled,
        fileScannerIntervalHours,
        providerUpdaterEnabled,
        providerUpdaterIntervalHours,
      } = req.body;

      // Validation
      if (typeof fileScannerEnabled !== 'boolean') {
        res.status(400).json({ error: 'fileScannerEnabled must be a boolean' });
        return;
      }

      if (typeof fileScannerIntervalHours !== 'number' || fileScannerIntervalHours <= 0) {
        res.status(400).json({ error: 'fileScannerIntervalHours must be a positive number' });
        return;
      }

      if (typeof providerUpdaterEnabled !== 'boolean') {
        res.status(400).json({ error: 'providerUpdaterEnabled must be a boolean' });
        return;
      }

      if (typeof providerUpdaterIntervalHours !== 'number' || providerUpdaterIntervalHours <= 0) {
        res.status(400).json({ error: 'providerUpdaterIntervalHours must be a positive number' });
        return;
      }

      // Update config
      await this.schedulerConfigService.setSchedulerConfig({
        libraryId,
        fileScannerEnabled,
        fileScannerIntervalHours,
        providerUpdaterEnabled,
        providerUpdaterIntervalHours,
        fileScannerLastRun: null, // Preserve existing value
        providerUpdaterLastRun: null, // Preserve existing value
      });

      // Return updated config
      const updatedConfig = await this.schedulerConfigService.getSchedulerConfig(libraryId);
      res.json(updatedConfig);

      logger.info('Scheduler config updated via API', {
        libraryId,
        fileScannerEnabled,
        fileScannerIntervalHours,
        providerUpdaterEnabled,
        providerUpdaterIntervalHours,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/libraries/:libraryId/scheduler/file-scan/trigger
   * Manually trigger a file scan for a library
   */
  triggerFileScan = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const libraryId = parseInt(req.params.libraryId, 10);

      if (isNaN(libraryId)) {
        res.status(400).json({ error: 'Invalid library ID' });
        return;
      }

      logger.info('Manual file scan triggered via API', { libraryId });

      // Trigger the scan (queues job with higher priority)
      const jobId = await this.fileScannerScheduler.triggerScan(libraryId);

      res.json({
        message: 'File scan job queued successfully',
        jobId,
        libraryId,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/libraries/:libraryId/scheduler/provider-update/trigger
   * Manually trigger a provider update for a library
   */
  triggerProviderUpdate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const libraryId = parseInt(req.params.libraryId, 10);

      if (isNaN(libraryId)) {
        res.status(400).json({ error: 'Invalid library ID' });
        return;
      }

      logger.info('Manual provider update triggered via API', { libraryId });

      // Trigger the update (queues job with higher priority)
      const jobId = await this.providerUpdaterScheduler.triggerUpdate(libraryId);

      res.json({
        message: 'Provider update job queued successfully',
        jobId,
        libraryId,
      });
    } catch (error) {
      next(error);
    }
  };
}
