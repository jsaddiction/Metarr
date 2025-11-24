import fs from 'fs/promises';
import path from 'path';
import { logger } from '../middleware/logging.js';
import { DatabaseManager } from '../database/DatabaseManager.js';
import { DatabaseConnection } from '../types/database.js';
import { getErrorMessage, getErrorCode } from '../utils/errorHandling.js';

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
  private intervalId: NodeJS.Timeout | null = null;

  constructor(private readonly dbManager: DatabaseManager) {}

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
      emptyDirectoriesRemoved: 0,
      errors: [],
    };

    try {
      // 1. Delete expired movies (soft-deleted with retention period)
      result.moviesDeleted = await this.deleteExpiredMovies(db);

      // 2. Delete expired series (for future implementation)
      // result.seriesDeleted = await this.deleteExpiredSeries(db);

      // 3. Clean up orphaned cache files (not referenced in database)
      result.cacheFilesDeleted = await this.cleanupOrphanedCacheFiles(db);

      // 4. Remove empty cache directories
      result.emptyDirectoriesRemoved = await this.cleanupEmptyDirectories();

      logger.info('Garbage collection complete', result);
    } catch (error) {
      logger.error('Garbage collection failed', {
        error: getErrorMessage(error),
      });
      result.errors.push(getErrorMessage(error));
    }

    result.endTime = new Date().toISOString();
    return result;
  }

  /**
   * Delete movies where deleted_at has expired (soft-delete retention period)
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

      for (const movie of expiredMovies) {
        await db.execute(`DELETE FROM movies WHERE id = ?`, [movie.id]);

        logger.info('Permanently deleted expired movie', {
          movieId: movie.id,
          title: movie.title,
          filePath: movie.file_path,
          deletedAt: movie.deleted_at,
        });

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
    } catch (error) {
      logger.error('Failed to delete expired movies', {
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  /**
   * Delete series where deleted_at has expired
   * Future implementation for TV shows
   */
  // @ts-ignore - db parameter will be used when series support is added
  private async deleteExpiredSeries(_db: DatabaseConnection): Promise<number> {
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

      // Image files (cache only)
      const imageFiles = await db.query<{ file_path: string }>(
        'SELECT file_path FROM cache_image_files WHERE file_path IS NOT NULL',
        []
      );
      imageFiles.forEach((f) => referencedPaths.add(f.file_path));

      // Video files (cache only)
      const videoFiles = await db.query<{ file_path: string }>(
        'SELECT file_path FROM cache_video_files WHERE file_path IS NOT NULL',
        []
      );
      videoFiles.forEach((f) => referencedPaths.add(f.file_path));

      // Text files (cache only)
      const textFiles = await db.query<{ file_path: string }>(
        'SELECT file_path FROM cache_text_files WHERE file_path IS NOT NULL',
        []
      );
      textFiles.forEach((f) => referencedPaths.add(f.file_path));

      // Audio files (cache only)
      const audioFiles = await db.query<{ file_path: string }>(
        'SELECT file_path FROM cache_audio_files WHERE file_path IS NOT NULL',
        []
      );
      audioFiles.forEach((f) => referencedPaths.add(f.file_path));

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
            if (!referencedPaths.has(fullPath)) {
              try {
                await fs.unlink(fullPath);
                deletedCount++;
                logger.debug('Deleted orphaned cache file', { file: fullPath });
              } catch (error) {
                logger.error('Failed to delete orphaned cache file', {
                  file: fullPath,
                  error: getErrorMessage(error),
                });
              }
            }
          }
        }
      };

      await walkDirectory(cacheDir);

      logger.info('Orphaned cache file cleanup complete', { deletedCount });
      return deletedCount;
    } catch (error) {
      logger.error('Failed to cleanup orphaned cache files', {
        error: getErrorMessage(error),
      });
      return 0;
    }
  }

  /**
   * Remove empty directories from cache
   *
   * Recursively walks cache directories and removes empty subdirectories.
   * Protects top-level cache type directories (images/, videos/, etc.)
   */
  private async cleanupEmptyDirectories(): Promise<number> {
    try {
      logger.info('Starting empty directory cleanup');

      const cacheRoot = path.join(process.cwd(), 'data', 'cache');
      const cacheTypes = ['images', 'videos', 'text', 'audio', 'actors'];
      let totalRemoved = 0;

      for (const cacheType of cacheTypes) {
        const cachePath = path.join(cacheRoot, cacheType);

        try {
          await fs.access(cachePath);
          const removed = await this.removeEmptyDirectoriesRecursive(cachePath, cacheRoot);
          totalRemoved += removed;

          if (removed > 0) {
            logger.info('Cleaned empty directories', {
              cacheType,
              removed
            });
          }
        } catch (error) {
          if (getErrorCode(error) !== 'ENOENT') {
            logger.warn('Error accessing cache directory', {
              cacheType,
              error: getErrorMessage(error)
            });
          }
        }
      }

      logger.info('Empty directory cleanup complete', { totalRemoved });
      return totalRemoved;
    } catch (error) {
      logger.error('Failed to cleanup empty directories', {
        error: getErrorMessage(error)
      });
      return 0;
    }
  }

  /**
   * Recursively remove empty directories
   */
  private async removeEmptyDirectoriesRecursive(
    dirPath: string,
    rootPath: string
  ): Promise<number> {
    let removed = 0;

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      // Recursively process subdirectories first
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const subDirPath = path.join(dirPath, entry.name);
          removed += await this.removeEmptyDirectoriesRecursive(subDirPath, rootPath);
        }
      }

      // After processing subdirectories, check if this directory is now empty
      const remainingEntries = await fs.readdir(dirPath);

      if (remainingEntries.length === 0) {
        // Calculate depth to protect top-level directories
        const relativePath = path.relative(rootPath, dirPath);
        const depth = relativePath.split(path.sep).length;

        // Only remove subdirectories (depth > 1), not top-level cache dirs
        if (depth > 1 && dirPath.startsWith(rootPath)) {
          await fs.rmdir(dirPath);
          logger.debug('Removed empty cache directory', { directory: dirPath });
          removed++;
        }
      }
    } catch (error) {
      if (getErrorCode(error) !== 'ENOENT') {
        logger.debug('Error during directory cleanup', {
          directory: dirPath,
          error: getErrorMessage(error)
        });
      }
    }

    return removed;
  }
}

export interface GarbageCollectionResult {
  startTime: string;
  endTime?: string;
  moviesDeleted: number;
  seriesDeleted: number;
  cacheFilesDeleted: number;
  emptyDirectoriesRemoved: number;
  errors: string[];
}
