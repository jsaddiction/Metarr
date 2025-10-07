import { logger } from '../middleware/logging.js';
import { DatabaseManager } from '../database/DatabaseManager.js';
import { DatabaseConnection } from '../types/database.js';

/**
 * Garbage Collection Service
 *
 * Handles permanent deletion of expired items and cleanup of orphaned entities.
 *
 * Schedule: Daily at 3:00 AM
 * - Delete movies where deleted_on < NOW()
 * - Delete series where deleted_on < NOW()
 * - Delete orphaned images (CASCADE handles this automatically)
 * - Delete orphaned unknown files (CASCADE handles this automatically)
 */

export class GarbageCollectionService {
  private dbManager: DatabaseManager;
  private intervalId: NodeJS.Timeout | null = null;

  constructor(dbManager: DatabaseManager) {
    this.dbManager = dbManager;
  }

  /**
   * Start the garbage collection scheduler
   * Runs daily at 3:00 AM
   */
  start(): void {
    if (this.intervalId) {
      logger.warn('Garbage collection scheduler already running');
      return;
    }

    logger.info('Starting garbage collection scheduler (daily at 3:00 AM)');

    // Calculate time until next 3:00 AM
    const scheduleNextRun = () => {
      const now = new Date();
      const next3AM = new Date();
      next3AM.setHours(3, 0, 0, 0);

      // If 3:00 AM has already passed today, schedule for tomorrow
      if (now > next3AM) {
        next3AM.setDate(next3AM.getDate() + 1);
      }

      const msUntilNext = next3AM.getTime() - now.getTime();

      logger.info('Next garbage collection scheduled', {
        scheduledFor: next3AM.toISOString(),
        msUntil: msUntilNext,
      });

      this.intervalId = setTimeout(async () => {
        await this.runCollection();
        scheduleNextRun(); // Schedule next run after completion
      }, msUntilNext);
    };

    scheduleNextRun();
  }

  /**
   * Stop the garbage collection scheduler
   */
  stop(): void {
    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
      logger.info('Garbage collection scheduler stopped');
    }
  }

  /**
   * Manually trigger garbage collection
   * For testing or admin-initiated cleanup
   */
  async runCollection(): Promise<GarbageCollectionResult> {
    const db = this.dbManager.getConnection();

    logger.info('Starting garbage collection');

    const result: GarbageCollectionResult = {
      startTime: new Date().toISOString(),
      moviesDeleted: 0,
      seriesDeleted: 0,
      imagesDeleted: 0,
      unknownFilesDeleted: 0,
      errors: [],
    };

    try {
      // Delete expired movies
      result.moviesDeleted = await this.deleteExpiredMovies(db);

      // Delete expired series (for future implementation)
      // result.seriesDeleted = await this.deleteExpiredSeries(db);

      // Orphaned cleanup happens automatically via CASCADE DELETE
      // But we log the counts for visibility
      result.imagesDeleted = await this.countOrphanedImages(db);
      result.unknownFilesDeleted = await this.countOrphanedUnknownFiles(db);

      logger.info('Garbage collection complete', result);
    } catch (error: any) {
      logger.error('Garbage collection failed', {
        error: error.message,
      });
      result.errors.push(error.message);
    }

    result.endTime = new Date().toISOString();
    return result;
  }

  /**
   * Delete movies where deleted_on has expired
   */
  private async deleteExpiredMovies(db: DatabaseConnection): Promise<number> {
    try {
      // Find expired movies
      const expiredMovies = (await db.query(
        `SELECT id, title, file_path, deleted_on
         FROM movies
         WHERE deleted_on IS NOT NULL AND deleted_on < datetime('now')`,
        []
      )) as Array<{
        id: number;
        title: string;
        file_path: string;
        deleted_on: string;
      }>;

      if (expiredMovies.length === 0) {
        logger.debug('No expired movies to delete');
        return 0;
      }

      logger.info(`Found ${expiredMovies.length} expired movies to delete`);

      // Delete each movie (CASCADE will handle related records)
      for (const movie of expiredMovies) {
        await db.execute(`DELETE FROM movies WHERE id = ?`, [movie.id]);

        logger.info('Permanently deleted expired movie', {
          movieId: movie.id,
          title: movie.title,
          filePath: movie.file_path,
          deletedOn: movie.deleted_on,
        });

        // Log to activity_log
        await db.execute(
          `INSERT INTO activity_log (
            event_type,
            source,
            description,
            metadata,
            created_at
          ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          [
            'garbage_collection',
            'system',
            `Permanently deleted expired movie: ${movie.title}`,
            JSON.stringify({
              movieId: movie.id,
              title: movie.title,
              filePath: movie.file_path,
              expiredOn: movie.deleted_on,
            }),
          ]
        );
      }

      return expiredMovies.length;
    } catch (error: any) {
      logger.error('Failed to delete expired movies', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Delete series where deleted_on has expired
   * Future implementation for TV shows
   */
  // @ts-ignore - db parameter will be used when series support is added
  private async deleteExpiredSeries(db: DatabaseConnection): Promise<number> {
    // TODO: Implement when series support is added
    return 0;
  }

  /**
   * Count orphaned images (for logging purposes)
   * CASCADE DELETE handles automatic cleanup
   */
  private async countOrphanedImages(db: DatabaseConnection): Promise<number> {
    try {
      const result = (await db.query(
        `SELECT COUNT(*) as count FROM images
         WHERE deleted_on IS NOT NULL AND deleted_on < datetime('now')`,
        []
      )) as Array<{ count: number }>;

      return result[0]?.count || 0;
    } catch (error: any) {
      logger.error('Failed to count orphaned images', {
        error: error.message,
      });
      return 0;
    }
  }

  /**
   * Count orphaned unknown files (for logging purposes)
   * CASCADE DELETE handles automatic cleanup
   */
  private async countOrphanedUnknownFiles(db: DatabaseConnection): Promise<number> {
    try {
      const result = (await db.query(
        `SELECT COUNT(*) as count FROM unknown_files
         WHERE entity_id NOT IN (SELECT id FROM movies)`,
        []
      )) as Array<{ count: number }>;

      return result[0]?.count || 0;
    } catch (error: any) {
      logger.error('Failed to count orphaned unknown files', {
        error: error.message,
      });
      return 0;
    }
  }
}

export interface GarbageCollectionResult {
  startTime: string;
  endTime?: string;
  moviesDeleted: number;
  seriesDeleted: number;
  imagesDeleted: number;
  unknownFilesDeleted: number;
  errors: string[];
}
