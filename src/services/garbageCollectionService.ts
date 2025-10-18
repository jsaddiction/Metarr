import fs from 'fs/promises';
import path from 'path';
import { logger } from '../middleware/logging.js';
import { DatabaseManager } from '../database/DatabaseManager.js';
import { DatabaseConnection } from '../types/database.js';

/**
 * Garbage Collection Service
 *
 * Handles permanent deletion of expired items and cleanup of orphaned entities.
 *
 * Schedule: Daily at 3:00 AM
 * - Delete movies where deleted_at < NOW() (30-day recycle bin)
 * - Delete series where deleted_at < NOW() (30-day recycle bin)
 * - Delete orphaned cache files (not referenced in any file table)
 * - Delete orphaned database records (CASCADE handles this automatically)
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
      cacheFilesDeleted: 0,
      errors: [],
    };

    try {
      // Delete expired movies (30-day recycle bin)
      result.moviesDeleted = await this.deleteExpiredMovies(db);

      // Delete expired series (for future implementation)
      // result.seriesDeleted = await this.deleteExpiredSeries(db);

      // Clean up orphaned cache files (not referenced in database)
      result.cacheFilesDeleted = await this.cleanupOrphanedCacheFiles(db);

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
   * Delete movies where deleted_at has expired (30-day recycle bin)
   */
  private async deleteExpiredMovies(db: DatabaseConnection): Promise<number> {
    try {
      // Find expired movies (deleted_at is in the past)
      const expiredMovies = (await db.query(
        `SELECT id, title, file_path, deleted_at
         FROM movies
         WHERE deleted_at IS NOT NULL AND deleted_at < datetime('now')`,
        []
      )) as Array<{
        id: number;
        title: string;
        file_path: string;
        deleted_at: string;
      }>;

      if (expiredMovies.length === 0) {
        logger.debug('No expired movies to delete');
        return 0;
      }

      logger.info(`Found ${expiredMovies.length} expired movies to permanently delete`);

      // Delete each movie (CASCADE will handle related records)
      for (const movie of expiredMovies) {
        await db.execute(`DELETE FROM movies WHERE id = ?`, [movie.id]);

        logger.info('Permanently deleted expired movie', {
          movieId: movie.id,
          title: movie.title,
          filePath: movie.file_path,
          deletedAt: movie.deleted_at,
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
              expiredOn: movie.deleted_at,
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
   * Delete series where deleted_at has expired
   * Future implementation for TV shows
   */
  // @ts-ignore - db parameter will be used when series support is added
  private async deleteExpiredSeries(db: DatabaseConnection): Promise<number> {
    // TODO: Implement when series support is added
    return 0;
  }

  /**
   * Clean up orphaned cache files not referenced in database
   *
   * This is critical to prevent unbounded storage growth.
   * When entities are deleted, CASCADE removes DB records but leaves files on disk.
   */
  private async cleanupOrphanedCacheFiles(db: DatabaseConnection): Promise<number> {
    try {
      logger.info('Starting orphaned cache file cleanup');

      // Build set of all referenced cache paths from database
      const referencedPaths = new Set<string>();

      // Image files
      const imageFiles = await db.query<{ cache_path: string }>(
        'SELECT cache_path FROM image_files WHERE cache_path IS NOT NULL',
        []
      );
      imageFiles.forEach((f) => referencedPaths.add(f.cache_path));

      // Video files
      const videoFiles = await db.query<{ cache_path: string }>(
        'SELECT cache_path FROM video_files WHERE cache_path IS NOT NULL',
        []
      );
      videoFiles.forEach((f) => referencedPaths.add(f.cache_path));

      // Text files
      const textFiles = await db.query<{ cache_path: string }>(
        'SELECT cache_path FROM text_files WHERE cache_path IS NOT NULL',
        []
      );
      textFiles.forEach((f) => referencedPaths.add(f.cache_path));

      // Audio files
      const audioFiles = await db.query<{ cache_path: string }>(
        'SELECT cache_path FROM audio_files WHERE cache_path IS NOT NULL',
        []
      );
      audioFiles.forEach((f) => referencedPaths.add(f.cache_path));

      // Actor images (will be added later)
      // const actorImages = await db.query<{ image_cache_path: string }>(
      //   'SELECT image_cache_path FROM actors WHERE image_cache_path IS NOT NULL',
      //   []
      // );
      // actorImages.forEach((f) => referencedPaths.add(f.image_cache_path));

      logger.debug('Built referenced paths set', { count: referencedPaths.size });

      // Walk cache directory and delete orphaned files
      let deletedCount = 0;
      const cacheDir = path.join(process.cwd(), 'data', 'cache');

      // Check if cache directory exists
      try {
        await fs.access(cacheDir);
      } catch {
        logger.warn('Cache directory does not exist, skipping cleanup', { cacheDir });
        return 0;
      }

      // Recursively walk cache directory
      const walkDirectory = async (dir: string): Promise<void> => {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory()) {
            await walkDirectory(fullPath);
          } else if (entry.isFile()) {
            // Check if this file is referenced in database
            if (!referencedPaths.has(fullPath)) {
              try {
                await fs.unlink(fullPath);
                deletedCount++;
                logger.debug('Deleted orphaned cache file', { file: fullPath });
              } catch (error: any) {
                logger.error('Failed to delete orphaned cache file', {
                  file: fullPath,
                  error: error.message,
                });
              }
            }
          }
        }
      };

      await walkDirectory(cacheDir);

      logger.info('Orphaned cache file cleanup complete', { deletedCount });
      return deletedCount;
    } catch (error: any) {
      logger.error('Failed to cleanup orphaned cache files', {
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
  cacheFilesDeleted: number;
  errors: string[];
}
