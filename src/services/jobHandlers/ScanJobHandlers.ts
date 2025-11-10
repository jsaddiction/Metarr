import { DatabaseConnection } from '../../types/database.js';
import { Job, JobQueueService } from '../jobQueueService.js';
import { websocketBroadcaster } from '../websocketBroadcaster.js';
import { logger } from '../../middleware/logging.js';
import { getErrorMessage, getErrorStack } from '../../utils/errorHandling.js';

/**
 * ScanJobHandlers
 *
 * Handles low-level scanning operations for the new multi-phase architecture:
 * - Directory scanning (file system traversal)
 * - Asset caching (copy assets from library to protected cache)
 *
 * These handlers are part of the new unified scan service architecture and work
 * together with the libraryScanService to provide atomic, resumable scanning.
 */
export class ScanJobHandlers {
  constructor(
    private db: DatabaseConnection,
    private dbManager: any, // DatabaseManager - using any to avoid circular dependency
    private jobQueue: JobQueueService
  ) {}

  /**
   * Register all scan-related handlers
   */
  registerHandlers(jobQueue: JobQueueService): void {
    jobQueue.registerHandler('directory-scan', this.handleDirectoryScan.bind(this));
    jobQueue.registerHandler('cache-asset', this.handleCacheAsset.bind(this));
  }

  /**
   * Handle directory-scan job (NEW multi-phase architecture)
   *
   * Scans a single movie directory for metadata and assets.
   * This is part of the atomic scanning pipeline where each directory
   * scan is a separate job for better parallelization and error isolation.
   *
   * Payload: {
   *   scanJobId: number,        // Parent scan job for progress tracking
   *   libraryId: number,
   *   directoryPath: string,
   *   options?: ScanOptions     // Skip flags, etc.
   * }
   */
  private async handleDirectoryScan(job: Job): Promise<void> {
    const { scanJobId, libraryId, directoryPath } = job.payload as {
      scanJobId: number;
      libraryId: number;
      directoryPath: string;
    };
    // const { options } = job.payload; // TODO: Use options when implementing skip flags

    logger.info('[ScanJobHandlers] Starting directory scan', {
      service: 'ScanJobHandlers',
      handler: 'handleDirectoryScan',
      jobId: job.id,
      scanJobId,
      directoryPath,
    });

    try {
      // Import unified scan service dynamically
      const { scanMovieDirectory } = await import('../scan/unifiedScanService.js');

      // Update current operation
      await this.db.execute(
        `
        UPDATE scan_jobs
        SET current_operation = ?
        WHERE id = ?
      `,
        [`Scanning ${directoryPath}`, scanJobId]
      );

      // Scan the directory (NO provider API calls)
      const scanResult = await scanMovieDirectory(this.dbManager, libraryId, directoryPath, {
        trigger: 'scheduled_scan',
      });

      // Update scan_jobs progress
      const isNew = scanResult.isNewMovie ? 1 : 0;
      const isUpdated = scanResult.directoryChanged ? 1 : 0;

      await this.db.execute(
        `
        UPDATE scan_jobs
        SET directories_scanned = directories_scanned + 1,
            movies_found = movies_found + 1,
            movies_new = movies_new + ?,
            movies_updated = movies_updated + ?,
            assets_queued = assets_queued + ?,
            current_operation = ?
        WHERE id = ?
      `,
        [
          isNew,
          isUpdated,
          scanResult.assetsFound.images +
            scanResult.assetsFound.trailers +
            scanResult.assetsFound.subtitles,
          `Scanned ${directoryPath}`,
          scanJobId,
        ]
      );

      logger.info('[ScanJobHandlers] Directory scan complete', {
        service: 'ScanJobHandlers',
        handler: 'handleDirectoryScan',
        jobId: job.id,
        movieId: scanResult.movieId,
        isNew: scanResult.isNewMovie,
        assetsFound: scanResult.assetsFound,
      });

      // Broadcast to frontend when new movie is added for real-time UI updates
      if (scanResult.isNewMovie && scanResult.movieId) {
        websocketBroadcaster.broadcastMoviesAdded([scanResult.movieId]);
      }

      // Check library auto-enrich setting
      if (scanResult.movieId) {
        const movie = await this.db.query<{ id: number; library_id: number }>(
          `SELECT id, library_id FROM movies WHERE id = ?`,
          [scanResult.movieId]
        );

        if (movie.length > 0) {
          const library = await this.db.query<{ id: number; name: string; auto_enrich: number }>(
            `SELECT id, name, auto_enrich FROM libraries WHERE id = ?`,
            [movie[0].library_id]
          );

          if (library.length > 0) {
            const autoEnrich = Boolean(library[0].auto_enrich);

            if (autoEnrich) {
              // Chain to enrich-metadata job
              const enrichJobId = await this.jobQueue.addJob({
                type: 'enrich-metadata',
                priority: job.priority, // Maintain priority from scan
                payload: {
                  entityType: 'movie',
                  entityId: scanResult.movieId,
                },
                retry_count: 0,
                max_retries: 3,
              });

              logger.info('[ScanJobHandlers] Library has auto-enrich enabled, chained to enrich-metadata', {
                service: 'ScanJobHandlers',
                handler: 'handleDirectoryScan',
                jobId: job.id,
                movieId: scanResult.movieId,
                libraryId: library[0].id,
                libraryName: library[0].name,
                enrichJobId,
              });
            } else {
              logger.info('[ScanJobHandlers] Library has auto-enrich disabled, stopping workflow', {
                service: 'ScanJobHandlers',
                handler: 'handleDirectoryScan',
                jobId: job.id,
                movieId: scanResult.movieId,
                libraryId: library[0].id,
                libraryName: library[0].name,
              });
            }
          }
        }
      }
    } catch (error) {
      logger.error('[ScanJobHandlers] Directory scan failed', {
        service: 'ScanJobHandlers',
        handler: 'handleDirectoryScan',
        jobId: job.id,
        directoryPath,
        error: getErrorMessage(error),
        stack: getErrorStack(error),
      });

      // Update error count in scan_jobs
      await this.db.execute(
        `
        UPDATE scan_jobs
        SET errors_count = errors_count + 1,
            last_error = ?
        WHERE id = ?
      `,
        [getErrorMessage(error), scanJobId]
      );

      // Don't throw - let other directory scans continue
    }
  }

  /**
   * Handle cache-asset job (NEW multi-phase architecture)
   *
   * Copies an asset from library to cache directory.
   * The cache is the protected source of truth that survives library deletions.
   *
   * Payload: {
   *   scanJobId: number,      // Parent scan job for progress tracking
   *   entityType: 'movie' | 'series' | 'episode',
   *   entityId: number,
   *   assetType: 'poster' | 'fanart' | 'trailer' | 'subtitle',
   *   sourcePath: string,     // Path to asset in library
   *   language?: string       // For subtitles
   * }
   */
  private async handleCacheAsset(job: Job): Promise<void> {
    const { scanJobId, entityType, entityId, assetType, sourcePath, language } = job.payload as {
      scanJobId: number;
      entityType: string;
      entityId: number;
      assetType: string;
      sourcePath: string;
      language?: string;
    };

    logger.info('[ScanJobHandlers] Starting asset caching', {
      service: 'ScanJobHandlers',
      handler: 'handleCacheAsset',
      jobId: job.id,
      scanJobId,
      assetType,
      sourcePath,
    });

    try {
      // Import required modules
      const fs = await import('fs/promises');
      const path = await import('path');
      const crypto = await import('crypto');

      // Read source file
      const fileBuffer = await fs.readFile(sourcePath);

      // Calculate SHA256 hash
      const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
      const ext = path.extname(sourcePath);

      // Determine cache directory structure
      // data/cache/{entityType}/{entityId}/{assetType}_{hash}.ext
      const cacheDir = path.join('data', 'cache', entityType, String(entityId));
      await fs.mkdir(cacheDir, { recursive: true });

      // Build cache filename
      let cacheFilename = `${assetType}_${hash}${ext}`;
      if (language && assetType === 'subtitle') {
        cacheFilename = `subtitle_${language}_${hash}${ext}`;
      }

      const cachePath = path.join(cacheDir, cacheFilename);

      // Copy file to cache (only if not already exists)
      try {
        await fs.access(cachePath);
        logger.debug('[ScanJobHandlers] Asset already cached', {
          service: 'ScanJobHandlers',
          handler: 'handleCacheAsset',
          cachePath,
        });
      } catch {
        // File doesn't exist, copy it
        await fs.copyFile(sourcePath, cachePath);
        logger.info('[ScanJobHandlers] Asset copied to cache', {
          service: 'ScanJobHandlers',
          handler: 'handleCacheAsset',
          sourcePath,
          cachePath,
          hash,
        });
      }

      // Store cache path in database based on asset type
      if (assetType === 'poster' || assetType === 'fanart') {
        // Check if image already exists in database
        const existing = await this.db.query<{ id: number }>(
          `SELECT id FROM images WHERE entity_type = ? AND entity_id = ? AND asset_type = ? AND cache_path = ?`,
          [entityType, entityId, assetType, cachePath]
        );

        if (existing.length === 0) {
          await this.db.execute(
            `INSERT INTO images (entity_type, entity_id, asset_type, cache_path, library_path, source, hash, discovered_at)
             VALUES (?, ?, ?, ?, ?, 'local', ?, CURRENT_TIMESTAMP)`,
            [entityType, entityId, assetType, cachePath, sourcePath, hash]
          );
        }
      } else if (assetType === 'trailer') {
        const existing = await this.db.query<{ id: number }>(
          `SELECT id FROM trailers WHERE entity_type = ? AND entity_id = ? AND cache_path = ?`,
          [entityType, entityId, cachePath]
        );

        if (existing.length === 0) {
          await this.db.execute(
            `INSERT INTO trailers (entity_type, entity_id, cache_path, local_path, source, hash, discovered_at)
             VALUES (?, ?, ?, ?, 'local', ?, CURRENT_TIMESTAMP)`,
            [entityType, entityId, cachePath, sourcePath, hash]
          );
        }
      } else if (assetType === 'subtitle') {
        const existing = await this.db.query<{ id: number }>(
          `SELECT id FROM subtitle_streams WHERE movie_id = ? AND cache_path = ?`,
          [entityId, cachePath]
        );

        if (existing.length === 0) {
          await this.db.execute(
            `INSERT INTO subtitle_streams (movie_id, cache_path, file_path, language, hash)
             VALUES (?, ?, ?, ?, ?)`,
            [entityId, cachePath, sourcePath, language || 'unknown', hash]
          );
        }
      }

      // Update scan_jobs progress
      if (scanJobId) {
        await this.db.execute(
          `
          UPDATE scan_jobs
          SET assets_cached = assets_cached + 1
          WHERE id = ?
        `,
          [scanJobId]
        );
      }

      logger.info('[ScanJobHandlers] Asset caching complete', {
        service: 'ScanJobHandlers',
        handler: 'handleCacheAsset',
        jobId: job.id,
        cachePath,
      });
    } catch (error) {
      logger.error('[ScanJobHandlers] Asset caching failed', {
        service: 'ScanJobHandlers',
        handler: 'handleCacheAsset',
        jobId: job.id,
        assetType,
        sourcePath,
        error: getErrorMessage(error),
        stack: getErrorStack(error),
      });

      // Update error count
      if (scanJobId) {
        await this.db.execute(
          `
          UPDATE scan_jobs
          SET errors_count = errors_count + 1,
              last_error = ?
          WHERE id = ?
        `,
          [getErrorMessage(error), scanJobId]
        );
      }

      // Don't throw - let other asset caching jobs continue
    }
  }
}
