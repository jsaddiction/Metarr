import { DatabaseConnection } from '../../types/database.js';
import { DatabaseManager } from '../../database/DatabaseManager.js';
import { Job, JobQueueService } from '../jobQueueService.js';
import { EnrichAllScheduler } from '../enrichment/EnrichAllScheduler.js';
import { logger } from '../../middleware/logging.js';
import { websocketBroadcaster } from '../websocketBroadcaster.js';
import { getErrorMessage } from '../../utils/errorHandling.js';

/**
 * ScheduledJobHandlers
 *
 * Handles scheduled/automated tasks:
 * - Library Scan: Full library scan
 * - Scheduled File Scan: Periodic file system scanning
 * - Scheduled Provider Update: Refresh metadata from providers
 * - Scheduled Cleanup: Clean old cache/recycle bin items
 *
 * These handlers are typically triggered by cron-like schedulers rather than
 * user actions or webhooks.
 */
export class ScheduledJobHandlers {
  private db: DatabaseConnection;
  private jobQueue: JobQueueService;
  private enrichAllScheduler: EnrichAllScheduler;

  constructor(
    db: DatabaseConnection,
    _dbManager: DatabaseManager, // Kept for interface compatibility
    jobQueue: JobQueueService
  ) {
    this.db = db;
    this.jobQueue = jobQueue;
    this.enrichAllScheduler = new EnrichAllScheduler(db, jobQueue);
  }

  /**
   * Register all scheduled task handlers
   */
  registerHandlers(jobQueue: JobQueueService): void {
    jobQueue.registerHandler('library-scan', this.handleLibraryScan.bind(this));
    jobQueue.registerHandler('scheduled-file-scan', this.handleScheduledFileScan.bind(this));
    jobQueue.registerHandler('scheduled-provider-update', this.handleScheduledProviderUpdate.bind(this));
    jobQueue.registerHandler('scheduled-cleanup', this.handleScheduledCleanup.bind(this));
    jobQueue.registerHandler('bulk-enrich', this.handleBulkEnrich.bind(this));
  }

  /**
   * Handle library-scan job
   *
   * Payload: {
   *   libraryId: number,
   *   libraryPath: string,
   *   libraryType: 'movie' | 'series' | 'music'
   * }
   */
  private async handleLibraryScan(job: Job): Promise<void> {
    const { libraryId, libraryPath, libraryType } = job.payload as {
      libraryId: number;
      libraryPath: string;
      libraryType: string;
    };

    logger.info(`Scanning library ${libraryId}: ${libraryPath} (${libraryType})`);

    try {
      // Import fs for directory scanning
      const fs = await import('fs/promises');
      const path = await import('path');

      // Get all subdirectories (each should be a movie/series folder)
      const entries = await fs.readdir(libraryPath, { withFileTypes: true });
      const directories = entries.filter(e => e.isDirectory());

      logger.info(`Found ${directories.length} directories in library ${libraryId}`);

      let processed = 0;
      let errors = 0;

      for (const dir of directories) {
        try {
          const fullPath = path.join(libraryPath, dir.name);

          // Check if entity already exists in database
          const existing = await this.findEntityByPath(fullPath, libraryType);

          if (existing) {
            logger.debug(`Entity already exists for ${fullPath}, skipping`);
            continue;
          }

          // Look for media files in directory
          const files = await fs.readdir(fullPath);
          const videoExtensions = ['.mkv', '.mp4', '.avi', '.mov', '.m4v'];
          const videoFiles = files.filter(f => videoExtensions.includes(path.extname(f).toLowerCase()));

          if (videoFiles.length === 0) {
            logger.debug(`No video files found in ${fullPath}, skipping`);
            continue;
          }

          // For movies: create entity and schedule discovery
          if (libraryType === 'movie') {
            // Use the main video file name as the initial title
            // Sort to get the largest file (main movie file, not extras/samples)
            const videoFileStats = await Promise.all(
              videoFiles.map(async (file) => ({
                name: file,
                size: (await fs.stat(path.join(fullPath, file))).size
              }))
            );
            videoFileStats.sort((a, b) => b.size - a.size);
            const mainVideoFile = videoFileStats[0].name;

            // Remove extension and use as title
            const titleWithoutExt = path.basename(mainVideoFile, path.extname(mainVideoFile));

            // Try to extract year from filename
            const yearMatch = titleWithoutExt.match(/[([]?(\d{4})[)\]]?/);
            const year = yearMatch ? parseInt(yearMatch[1]) : null;

            // Insert movie into database with filename as title
            const result = await this.db.execute(
              `INSERT INTO movies (title, year, file_path, library_id, state)
               VALUES (?, ?, ?, ?, 'discovered')`,
              [titleWithoutExt, year, fullPath, libraryId]
            );

            const movieId = result.insertId!;

            // Schedule asset discovery job
            await this.db.execute(
              `INSERT INTO job_queue (type, priority, payload, state, retry_count, max_retries, created_at)
               VALUES ('discover-assets', 8, ?, 'pending', 0, 3, CURRENT_TIMESTAMP)`,
              [JSON.stringify({
                entityType: 'movie',
                entityId: movieId,
                directoryPath: fullPath
              })]
            );

            processed++;
            logger.info(`Created movie ${movieId}: ${titleWithoutExt}${year ? ` (${year})` : ''}`);

            // Broadcast to frontend that a new movie was added
            websocketBroadcaster.broadcastMoviesAdded([movieId]);
          }
          // Series handling would go here (more complex)
          else if (libraryType === 'series') {
            logger.debug(`Series library scanning not yet fully implemented`);
          }

        } catch (error) {
          logger.error(`Error processing directory ${dir.name}`, { error: getErrorMessage(error) });
          errors++;
        }
      }

      logger.info(`Library scan complete for ${libraryId}: ${processed} processed, ${errors} errors`);

    } catch (error) {
      logger.error(`Error scanning library ${libraryId}`, { error: getErrorMessage(error) });
      throw error;
    }
  }

  /**
   * Handle scheduled-file-scan job
   * Runs on schedule to scan all enabled libraries for new content
   */
  private async handleScheduledFileScan(job: Job): Promise<void> {
    logger.info('[ScheduledJobHandlers] Starting scheduled file scan', {
      service: 'ScheduledJobHandlers',
      handler: 'handleScheduledFileScan',
      jobId: job.id,
    });

    // Get all enabled libraries
    const libraries = await this.db.query<{
      id: number;
      name: string;
      path: string;
      type: string;
    }>('SELECT id, name, path, type FROM libraries WHERE enabled = 1');

    logger.info('[ScheduledJobHandlers] Found enabled libraries', {
      service: 'ScheduledJobHandlers',
      handler: 'handleScheduledFileScan',
      jobId: job.id,
      count: libraries.length,
    });

    // Create library-scan job for each enabled library
    for (const library of libraries) {
      await this.jobQueue.addJob({
        type: 'library-scan',
        priority: 8, // LOW priority (scheduled task)
        payload: {
          libraryId: library.id,
          libraryPath: library.path,
          libraryType: library.type,
        },
        retry_count: 0,
        max_retries: 2,
      });

      logger.info('[ScheduledJobHandlers] Created library-scan job', {
        service: 'ScheduledJobHandlers',
        handler: 'handleScheduledFileScan',
        libraryId: library.id,
        libraryName: library.name,
      });
    }

    logger.info('[ScheduledJobHandlers] Scheduled file scan complete', {
      service: 'ScheduledJobHandlers',
      handler: 'handleScheduledFileScan',
      jobId: job.id,
      librariesScheduled: libraries.length,
    });
  }

  /**
   * Handle scheduled-provider-update job
   * Runs on schedule to fetch updated metadata from providers
   */
  private async handleScheduledProviderUpdate(job: Job): Promise<void> {
    logger.info('[ScheduledJobHandlers] Scheduled provider update (not yet implemented)', {
      service: 'ScheduledJobHandlers',
      handler: 'handleScheduledProviderUpdate',
      jobId: job.id,
    });

    // TODO: Implement scheduled provider updates
    // - Find entities that haven't been updated in X days
    // - Re-fetch metadata from TMDB/TVDB
    // - Respect field locks (don't overwrite user changes)
  }

  /**
   * Handle scheduled-cleanup job
   * Runs on schedule to cleanup old history and temporary files
   */
  private async handleScheduledCleanup(job: Job): Promise<void> {
    logger.info('[ScheduledJobHandlers] Starting scheduled cleanup', {
      service: 'ScheduledJobHandlers',
      handler: 'handleScheduledCleanup',
      jobId: job.id,
    });

    try {
      // NOTE: Job history cleanup removed - using structured logs instead
      // See logs/app.log for job execution history

      logger.info('[ScheduledJobHandlers] Scheduled cleanup complete', {
        service: 'ScheduledJobHandlers',
        handler: 'handleScheduledCleanup',
        jobId: job.id,
        message: 'Job history cleanup removed - now using structured logs'
      });

      // TODO: Add cleanup tasks
      // - Remove orphaned cache files (no database reference)
      // - Remove temporary download files older than X days
      // - Cleanup old log files (rotate logs older than 30 days)
    } catch (error) {
      logger.error('[ScheduledJobHandlers] Scheduled cleanup failed', {
        service: 'ScheduledJobHandlers',
        handler: 'handleScheduledCleanup',
        jobId: job.id,
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  /**
   * Handle bulk enrichment job
   * Runs EnrichAllScheduler to process all monitored movies
   */
  private async handleBulkEnrich(job: Job): Promise<void> {
    logger.info('[ScheduledJobHandlers] Starting bulk enrichment', {
      service: 'ScheduledJobHandlers',
      handler: 'handleBulkEnrich',
      jobId: job.id,
    });

    try {
      const stats = await this.enrichAllScheduler.enrichAll();

      logger.info('[ScheduledJobHandlers] Bulk enrichment complete', {
        service: 'ScheduledJobHandlers',
        handler: 'handleBulkEnrich',
        jobId: job.id,
        ...stats,
      });

      // Broadcast results via WebSocket for UI
      websocketBroadcaster.broadcast('bulk-enrich-complete', {
        processed: stats.processed,
        updated: stats.updated,
        skipped: stats.skipped,
        stopped: stats.stopped,
        stopReason: stats.stopReason,
        startTime: stats.startTime.toISOString(),
        endTime: stats.endTime?.toISOString(),
      });
    } catch (error) {
      logger.error('[ScheduledJobHandlers] Bulk enrichment failed', {
        service: 'ScheduledJobHandlers',
        handler: 'handleBulkEnrich',
        jobId: job.id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  // ============================================
  // Helper Methods
  // ============================================

  /**
   * Find entity by file path
   */
  private async findEntityByPath(filePath: string, libraryType: string): Promise<boolean> {
    if (libraryType === 'movie') {
      const result = await this.db.query<{ id: number }>(
        `SELECT id FROM movies WHERE file_path = ?`,
        [filePath]
      );
      return result.length > 0;
    } else if (libraryType === 'series') {
      const result = await this.db.query<{ id: number }>(
        `SELECT id FROM series WHERE path = ?`,
        [filePath]
      );
      return result.length > 0;
    }
    return false;
  }
}
