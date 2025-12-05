/**
 * Trailer Job Handlers
 *
 * Handles trailer download jobs with sequential processing.
 * Downloads trailers one at a time to prevent overwhelming providers.
 */

import { DatabaseConnection } from '../../types/database.js';
import { DatabaseManager } from '../../database/DatabaseManager.js';
import { Job } from '../jobQueue/types.js';
import { JobQueueService } from '../jobQueue/JobQueueService.js';
import { TrailerDownloadService, DownloadProgress } from '../trailers/TrailerDownloadService.js';
import { TrailerService } from '../trailers/TrailerService.js';
import { websocketBroadcaster } from '../websocketBroadcaster.js';
import { logger } from '../../middleware/logging.js';
import * as path from 'path';
import * as crypto from 'crypto';
import fs from 'fs-extra';

/**
 * TrailerJobHandlers
 *
 * Handles the download-trailer job type which downloads trailer videos
 * from URLs (YouTube, Vimeo, etc.) and stores them in the cache.
 *
 * Key features:
 * - Sequential processing (one download at a time via job queue)
 * - Progress reporting via WebSocket for real-time UI updates
 * - Failure handling with oEmbed verification for error classification
 */
export class TrailerJobHandlers {
  private db: DatabaseConnection;
  private jobQueue: JobQueueService;
  private trailerDownloadService: TrailerDownloadService;
  private trailerService: TrailerService;

  constructor(
    db: DatabaseConnection,
    dbManager: DatabaseManager,
    jobQueue: JobQueueService
  ) {
    this.db = db;
    this.jobQueue = jobQueue;
    this.trailerDownloadService = new TrailerDownloadService();
    this.trailerService = new TrailerService(dbManager);
  }

  /**
   * Register all trailer handlers with job queue
   */
  registerHandlers(jobQueue: JobQueueService): void {
    jobQueue.registerHandler('download-trailer', this.handleDownloadTrailer.bind(this));
  }

  /**
   * Handle download-trailer job
   *
   * Downloads a trailer video from a URL and stores it in the cache.
   * Reports progress via WebSocket for real-time UI updates.
   *
   * Payload: {
   *   entityType: 'movie' | 'series' | 'episode',
   *   entityId: number,
   *   candidateId: number,
   *   sourceUrl: string,
   *   movieTitle?: string
   * }
   */
  private async handleDownloadTrailer(job: Job<'download-trailer'>): Promise<void> {
    const { entityType, entityId, candidateId, sourceUrl, movieTitle } = job.payload;

    logger.info('[TrailerJobHandlers] Starting trailer download', {
      service: 'TrailerJobHandlers',
      handler: 'handleDownloadTrailer',
      jobId: job.id,
      entityType,
      entityId,
      candidateId,
      sourceUrl,
      movieTitle,
    });

    // Generate output path (content-addressed by URL hash)
    const urlHash = crypto.createHash('sha256').update(sourceUrl).digest('hex');
    const cacheDir = path.join(process.cwd(), 'data', 'cache', 'videos', urlHash.substring(0, 2));
    await fs.ensureDir(cacheDir);
    const outputPath = path.join(cacheDir, `${urlHash}.mp4`);

    // Progress callback - broadcasts to WebSocket
    const onProgress = (progress: DownloadProgress) => {
      // Update job progress via WebSocket
      this.jobQueue.updateJobProgress(job.id, {
        current: progress.percentage,
        total: 100,
        percentage: progress.percentage,
        message: `Downloading trailer${movieTitle ? ` for ${movieTitle}` : ''}`,
        detail: `${progress.speed} - ETA ${this.formatEta(progress.eta)}`,
      });

      // Also broadcast trailer-specific progress event
      websocketBroadcaster.broadcast('trailer:progress', {
        entityType,
        entityId,
        candidateId,
        progress: {
          percentage: progress.percentage,
          downloadedBytes: progress.downloadedBytes,
          totalBytes: progress.totalBytes,
          speed: progress.speed,
          eta: progress.eta,
        },
      });
    };

    try {
      // Download with progress reporting
      const result = await this.trailerDownloadService.downloadVideoWithProgress(
        sourceUrl,
        outputPath,
        1080, // Max resolution
        onProgress
      );

      if (!result.success) {
        // Record failure
        logger.error('[TrailerJobHandlers] Trailer download failed', {
          jobId: job.id,
          entityId,
          candidateId,
          error: result.error,
          message: result.message,
        });

        await this.trailerService.recordFailure(candidateId, result.error);

        // Broadcast failure event
        websocketBroadcaster.broadcast('trailer:failed', {
          entityType,
          entityId,
          candidateId,
          error: result.error,
          message: result.message,
        });

        // Broadcast movie update
        if (entityType === 'movie') {
          websocketBroadcaster.broadcastMoviesUpdated([entityId]);
        }

        throw new Error(`Trailer download failed: ${result.message}`);
      }

      // Create cache_video_files entry
      const insertResult = await this.db.execute(
        `INSERT INTO cache_video_files (
          entity_type, entity_id, video_type, file_name, file_path,
          file_hash, file_size, discovered_at
        ) VALUES (?, ?, 'trailer', ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [entityType, entityId, path.basename(outputPath), outputPath, urlHash, result.fileSize]
      );

      const cacheFileId = insertResult.insertId!;

      // Link cache file to candidate
      await this.trailerService.linkCacheFile(candidateId, cacheFileId);

      logger.info('[TrailerJobHandlers] Trailer download completed', {
        service: 'TrailerJobHandlers',
        handler: 'handleDownloadTrailer',
        jobId: job.id,
        entityType,
        entityId,
        candidateId,
        cacheFileId,
        filePath: outputPath,
        fileSize: result.fileSize,
      });

      // Broadcast success event
      websocketBroadcaster.broadcast('trailer:completed', {
        entityType,
        entityId,
        candidateId,
        cacheFileId,
        filePath: outputPath,
        fileSize: result.fileSize,
      });

      // Broadcast movie update
      if (entityType === 'movie') {
        websocketBroadcaster.broadcastMoviesUpdated([entityId]);
      }
    } catch (error) {
      // If not already handled above, record generic failure
      if (!(error instanceof Error && error.message.startsWith('Trailer download failed:'))) {
        logger.error('[TrailerJobHandlers] Unexpected error during trailer download', {
          jobId: job.id,
          entityId,
          candidateId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        try {
          await this.trailerService.recordFailure(candidateId, 'download_error');
        } catch (recordError) {
          logger.error('Failed to record download failure', {
            candidateId,
            error: recordError instanceof Error ? recordError.message : 'Unknown error',
          });
        }

        // Broadcast failure
        websocketBroadcaster.broadcast('trailer:failed', {
          entityType,
          entityId,
          candidateId,
          error: 'download_error',
          message: error instanceof Error ? error.message : 'Unknown error',
        });

        // Broadcast movie update
        if (entityType === 'movie') {
          websocketBroadcaster.broadcastMoviesUpdated([entityId]);
        }
      }

      throw error;
    }
  }

  /**
   * Format ETA seconds to human-readable string
   * @param seconds - ETA in seconds
   * @returns Formatted string (e.g., "1:23" or "0:05")
   */
  private formatEta(seconds: number): string {
    if (seconds <= 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}
