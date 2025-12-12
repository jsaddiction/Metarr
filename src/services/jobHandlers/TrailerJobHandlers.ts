/**
 * Trailer Job Handlers
 *
 * Handles trailer download jobs with sequential processing.
 * Downloads trailers one at a time to prevent overwhelming providers.
 *
 * Key Features:
 * - Automatic fallback to next best candidate on download failure
 * - Respects age_restricted status (skips unless cookies available)
 * - Progress reporting via WebSocket for real-time UI updates
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
 * Candidate row from database for fallback selection
 */
interface FallbackCandidate {
  id: number;
  source_url: string;
  score: number | null;
  failure_reason: string | null;
}

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
 * - Automatic fallback to next best candidate on download failure
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
   * On failure, automatically tries the next best candidate until one succeeds
   * or all candidates are exhausted.
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

    // Try the requested candidate first, then fallback to alternatives
    const triedCandidateIds: number[] = [];
    let currentCandidateId = candidateId;
    let currentSourceUrl = sourceUrl;
    let lastError: { error: string; message: string } | null = null;

    // Keep trying candidates until one succeeds or we run out
    while (true) {
      triedCandidateIds.push(currentCandidateId);

      const downloadResult = await this.attemptDownload(
        job,
        entityType,
        entityId,
        currentCandidateId,
        currentSourceUrl,
        movieTitle
      );

      if (downloadResult.success) {
        // Download succeeded - we're done
        return;
      }

      // Download failed - record error and try to find an alternative
      lastError = { error: downloadResult.error, message: downloadResult.message };

      logger.warn('[TrailerJobHandlers] Download failed, looking for alternative candidate', {
        jobId: job.id,
        entityType,
        entityId,
        failedCandidateId: currentCandidateId,
        failureReason: downloadResult.error,
        attemptNumber: triedCandidateIds.length,
      });

      // Find next best candidate that we haven't tried yet
      const nextCandidate = await this.findNextCandidate(entityType, entityId, triedCandidateIds);

      if (!nextCandidate) {
        logger.warn('[TrailerJobHandlers] No more candidates to try', {
          jobId: job.id,
          entityType,
          entityId,
          triedCandidates: triedCandidateIds,
        });
        throw new Error(`Trailer download failed after ${triedCandidateIds.length} attempt(s): ${lastError.message}`);
      }

      // Select the new candidate and try it
      logger.info('[TrailerJobHandlers] Trying next candidate', {
        jobId: job.id,
        entityType,
        entityId,
        newCandidateId: nextCandidate.id,
        newSourceUrl: nextCandidate.source_url,
        score: nextCandidate.score,
        nextAttempt: triedCandidateIds.length + 1,
      });

      // Update selection to the new candidate
      await this.trailerService.selectTrailer(
        entityType as 'movie' | 'episode',
        entityId,
        nextCandidate.id,
        'auto'
      );

      currentCandidateId = nextCandidate.id;
      currentSourceUrl = nextCandidate.source_url;
    }
  }

  /**
   * Attempt to download a single trailer candidate
   *
   * @returns Object with success flag and error details on failure
   */
  private async attemptDownload(
    job: Job<'download-trailer'>,
    entityType: string,
    entityId: number,
    candidateId: number,
    sourceUrl: string,
    movieTitle?: string
  ): Promise<{ success: true } | { success: false; error: string; message: string }> {
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

        // Broadcast failure event for this candidate
        websocketBroadcaster.broadcast('trailer:failed', {
          entityType,
          entityId,
          candidateId,
          error: result.error,
          message: result.message,
        });

        return { success: false, error: result.error, message: result.message };
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

      return { success: true };
    } catch (error) {
      // Record generic failure
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

      return {
        success: false,
        error: 'download_error',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Find the next best candidate to try
   *
   * Queries for analyzed candidates that:
   * - Haven't been tried yet in this job
   * - Don't have a permanent failure (unavailable, geo_blocked)
   * - Don't have age_restricted failure (unless cookies are available)
   * - Don't have download_error failure (user-initiated retry only)
   * - Have a source_url
   *
   * Failure reason handling:
   * - unavailable: Never retry (permanent - video removed/private/deleted)
   * - geo_blocked: Never retry (permanent - region restricted)
   * - age_restricted: Only retry if cookies available (semi-permanent)
   * - download_error: User-initiated retry only (unknown cause - don't retry automatically)
   * - rate_limited: Can retry (transient)
   *
   * @returns Next candidate or null if none available
   */
  private async findNextCandidate(
    entityType: string,
    entityId: number,
    excludeIds: number[]
  ): Promise<FallbackCandidate | null> {
    // Check if cookies are available for age_restricted videos
    const hasCookies = await this.trailerDownloadService.hasCookieFile();

    // Build exclusion list for query
    const excludePlaceholders = excludeIds.map(() => '?').join(', ');

    // Build list of failure reasons to exclude
    // Always exclude: unavailable (permanent), geo_blocked (permanent), download_error (user retry only)
    // Conditionally exclude: age_restricted (unless cookies available)
    const excludedReasons = ["'unavailable'", "'geo_blocked'", "'download_error'"];
    if (!hasCookies) {
      excludedReasons.push("'age_restricted'");
    }

    // Query for next best candidate
    const query = `
      SELECT id, source_url, score, failure_reason
      FROM trailer_candidates
      WHERE entity_type = ?
        AND entity_id = ?
        AND analyzed = 1
        AND source_url IS NOT NULL
        AND id NOT IN (${excludePlaceholders})
        AND (failure_reason IS NULL OR failure_reason NOT IN (${excludedReasons.join(', ')}))
      ORDER BY score DESC NULLS LAST
      LIMIT 1
    `;

    const params = [entityType, entityId, ...excludeIds];
    const candidate = await this.db.get<FallbackCandidate>(query, params);

    return candidate || null;
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
