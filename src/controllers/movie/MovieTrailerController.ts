import { Request, Response, NextFunction } from 'express';
import { MovieService } from '../../services/movieService.js';
import { TrailerService } from '../../services/trailers/TrailerService.js';
import { TrailerDownloadService } from '../../services/trailers/TrailerDownloadService.js';
import { JobQueueService } from '../../services/jobQueue/JobQueueService.js';
import { JOB_PRIORITY } from '../../services/jobQueue/types.js';
import { websocketBroadcaster } from '../../services/websocketBroadcaster.js';
import { logger } from '../../middleware/logging.js';
import multer from 'multer';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as crypto from 'crypto';
import { DatabaseManager } from '../../database/DatabaseManager.js';

// Configure multer for video upload with memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB limit for video files
  },
  fileFilter: (_req, file, cb) => {
    const allowedMimes = [
      'video/mp4',
      'video/x-matroska',
      'video/webm',
      'video/quicktime',
      'video/x-msvideo',
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only video files are allowed (MP4, MKV, WebM, MOV, AVI).'));
    }
  },
});

/**
 * MovieTrailerController
 *
 * Handles all trailer-related operations for movies:
 * - Get current selected trailer
 * - Stream trailer video with range support
 * - Get trailer candidates
 * - Select a trailer candidate
 * - Add trailer from URL
 * - Upload custom trailer file
 * - Delete trailer
 * - Unlock trailer for automation
 *
 * Separated from MovieController to follow Single Responsibility Principle.
 * This controller focuses exclusively on trailer management.
 *
 * PHILOSOPHY:
 * "Intelligent Defaults with Manual Override Capability"
 * - Automation populates trailers but user selections are locked
 * - User-provided URLs and uploads are auto-locked
 * - Lock prevents automation from replacing user choices
 */
export class MovieTrailerController {
  public upload = upload;
  private jobQueue: JobQueueService | null = null;

  constructor(
    private movieService: MovieService,
    private trailerService: TrailerService,
    private trailerDownloadService: TrailerDownloadService,
    private db: DatabaseManager,
    jobQueue?: JobQueueService
  ) {
    this.jobQueue = jobQueue || null;
  }

  /**
   * GET /api/movies/:id/trailer
   * Get current selected trailer for movie
   *
   * Returns:
   * {
   *   id: number,
   *   source_type: 'provider' | 'user' | 'upload',
   *   source_url: string | null,
   *   provider_name: string | null,
   *   title: string | null,
   *   duration_seconds: number | null,
   *   is_locked: boolean,
   *   cache_video_file_id: number | null,
   *   cache_file_path: string | null,
   *   is_downloaded: boolean
   * }
   *
   * Returns 404 if movie not found
   * Returns null if no trailer selected
   */
  async getTrailer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const movieId = parseInt(req.params.id);

      // Validate movie exists
      const movie = await this.movieService.getById(movieId);
      if (!movie) {
        res.status(404).json({ error: 'Movie not found' });
        return;
      }

      // Get current trailer
      const trailer = await this.trailerService.getTrailer('movie', movieId);

      if (!trailer) {
        res.json(null);
        return;
      }

      // Add is_downloaded flag for frontend convenience
      res.json({
        ...trailer,
        is_downloaded: !!trailer.cache_video_file_id,
      });
    } catch (error) {
      logger.error('Get trailer failed', {
        movieId: req.params.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      next(error);
    }
  }

  /**
   * GET /api/movies/:id/trailer/stream
   * Stream trailer video from cache with HTTP Range support
   *
   * Supports video seeking via HTTP Range headers (206 Partial Content).
   * Returns 404 if no cached trailer exists.
   */
  async streamTrailer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const movieId = parseInt(req.params.id);

      // Validate movie exists
      const movie = await this.movieService.getById(movieId);
      if (!movie) {
        res.status(404).json({ error: 'Movie not found' });
        return;
      }

      // Get current trailer
      const trailer = await this.trailerService.getTrailer('movie', movieId);

      if (!trailer || !trailer.cache_file_path) {
        res.status(404).json({ error: 'No cached trailer available for streaming' });
        return;
      }

      const videoPath = trailer.cache_file_path;

      // Verify file exists
      if (!await fs.pathExists(videoPath)) {
        logger.error('Trailer file not found on disk', {
          movieId,
          trailerId: trailer.id,
          videoPath,
        });
        res.status(404).json({ error: 'Trailer file not found on disk' });
        return;
      }

      // Get file stats
      const stat = await fs.stat(videoPath);
      const fileSize = stat.size;

      // Determine MIME type from file extension
      const ext = path.extname(videoPath).toLowerCase();
      const mimeTypes: Record<string, string> = {
        '.mp4': 'video/mp4',
        '.mkv': 'video/x-matroska',
        '.webm': 'video/webm',
        '.mov': 'video/quicktime',
        '.avi': 'video/x-msvideo',
      };
      const contentType = mimeTypes[ext] || 'video/mp4';

      // Handle HTTP Range header for video seeking
      const range = req.headers.range;

      if (range) {
        // Parse range header (e.g., "bytes=0-1023")
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunkSize = end - start + 1;

        // Validate range
        if (start >= fileSize || end >= fileSize) {
          res.status(416).json({ error: 'Range not satisfiable' });
          return;
        }

        // Create read stream with range
        const stream = fs.createReadStream(videoPath, { start, end });

        // Set 206 Partial Content headers
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize,
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=31536000', // Cache for 1 year
        });

        // Handle stream errors
        stream.on('error', (streamError) => {
          stream.destroy();
          logger.error('Stream error during trailer playback', {
            movieId,
            error: streamError.message,
          });
          if (!res.headersSent) {
            next(streamError);
          }
        });

        // Clean up stream when response finishes
        res.on('close', () => {
          stream.destroy();
        });

        // Pipe stream to response
        stream.pipe(res);
      } else {
        // No range header - stream entire file
        const stream = fs.createReadStream(videoPath);

        res.writeHead(200, {
          'Content-Length': fileSize,
          'Content-Type': contentType,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=31536000', // Cache for 1 year
        });

        // Handle stream errors
        stream.on('error', (streamError) => {
          stream.destroy();
          logger.error('Stream error during trailer playback', {
            movieId,
            error: streamError.message,
          });
          if (!res.headersSent) {
            next(streamError);
          }
        });

        // Clean up stream when response finishes
        res.on('close', () => {
          stream.destroy();
        });

        // Pipe stream to response
        stream.pipe(res);
      }
    } catch (error) {
      logger.error('Stream trailer failed', {
        movieId: req.params.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      next(error);
    }
  }

  /**
   * GET /api/movies/:id/trailer/candidates
   * Get all trailer candidates for movie
   *
   * Returns array of candidates with metadata, scores, and selection state:
   * [
   *   {
   *     id, source_type, source_url, provider_name, title,
   *     duration_seconds, best_width, best_height, estimated_size_bytes,
   *     score, is_selected, is_locked, cache_video_file_id, downloaded_at,
   *     failed_at, failure_reason
   *   }
   * ]
   */
  async getCandidates(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const movieId = parseInt(req.params.id);

      // Validate movie exists
      const movie = await this.movieService.getById(movieId);
      if (!movie) {
        res.status(404).json({ error: 'Movie not found' });
        return;
      }

      // Get all candidates
      const candidates = await this.trailerService.getCandidates('movie', movieId);

      res.json({ candidates });
    } catch (error) {
      logger.error('Get trailer candidates failed', {
        movieId: req.params.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      next(error);
    }
  }

  /**
   * POST /api/movies/:id/trailer/select
   * Select a trailer candidate
   *
   * Body: { candidateId: number }
   *
   * Marks the candidate as selected and triggers download job if not downloaded.
   * Broadcasts WebSocket update for cross-tab sync.
   */
  async selectTrailer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const movieId = parseInt(req.params.id);
      const { candidateId } = req.body;

      // Validate parameters
      if (!candidateId || typeof candidateId !== 'number') {
        res.status(400).json({ error: 'candidateId is required and must be a number' });
        return;
      }

      // Validate movie exists
      const movie = await this.movieService.getById(movieId);
      if (!movie) {
        res.status(404).json({ error: 'Movie not found' });
        return;
      }

      // Select the trailer
      await this.trailerService.selectTrailer('movie', movieId, candidateId, 'user');

      // Lock the trailer field on the movie (user selection = auto-lock)
      await this.trailerService.lockTrailerField('movie', movieId);

      // Check if download is needed
      const candidates = await this.trailerService.getCandidates('movie', movieId);
      const selected = candidates.find(c => c.id === candidateId);

      // Broadcast WebSocket update for cross-tab sync (selection made)
      websocketBroadcaster.broadcastMoviesUpdated([movieId]);

      logger.info('Trailer selected', {
        movieId,
        movieTitle: movie.title,
        candidateId,
        needsDownload: selected && !selected.cache_video_file_id && selected.source_url,
      });

      // Queue download job if needed
      let jobId: number | null = null;
      if (selected && !selected.cache_video_file_id && selected.source_url) {
        if (this.jobQueue) {
          // Use job queue for sequential downloads with progress
          jobId = await this.jobQueue.addJob({
            type: 'download-trailer',
            priority: JOB_PRIORITY.HIGH, // User-initiated
            payload: {
              entityType: 'movie',
              entityId: movieId,
              candidateId,
              sourceUrl: selected.source_url,
              movieTitle: movie.title as string,
            },
            retry_count: 0,
            max_retries: 2,
          });

          logger.info('Created download-trailer job', {
            movieId,
            candidateId,
            jobId,
          });
        } else {
          // Fallback to background download if job queue not available
          this.downloadTrailerInBackground(movieId, candidateId, selected.source_url);
        }
      }

      // Respond immediately - download will happen via job queue
      res.json({ success: true, candidateId, jobId });
    } catch (error) {
      logger.error('Select trailer failed', {
        movieId: req.params.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      next(error);
    }
  }

  /**
   * POST /api/movies/:id/trailer/url
   * Add trailer from user-provided URL
   *
   * Body: { url: string }
   *
   * Validates URL, gets metadata via yt-dlp, creates candidate,
   * auto-selects with lock, and triggers download job.
   *
   * Returns:
   * {
   *   success: true,
   *   candidateId: number,
   *   isNew: boolean,
   *   metadata: { title, duration, width, height, estimatedSize }
   * }
   */
  async addUrl(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const movieId = parseInt(req.params.id);
      const { url } = req.body;

      // Validate parameters
      if (!url || typeof url !== 'string') {
        res.status(400).json({ error: 'url is required and must be a string' });
        return;
      }

      // Validate movie exists
      const movie = await this.movieService.getById(movieId);
      if (!movie) {
        res.status(404).json({ error: 'Movie not found' });
        return;
      }

      // Validate URL with yt-dlp
      const isValid = await this.trailerDownloadService.validateUrl(url);
      if (!isValid) {
        res.status(400).json({ error: 'Invalid or unsupported video URL' });
        return;
      }

      // Get video metadata
      const videoInfo = await this.trailerDownloadService.getVideoInfo(url);
      if (!videoInfo) {
        res.status(400).json({ error: 'Unable to fetch video metadata. Video may be unavailable or private.' });
        return;
      }

      // Add URL as candidate (auto-selects and locks)
      const result = await this.trailerService.addUrl('movie', movieId, url, 'user');

      // Update candidate metadata
      await this.trailerService.updateCandidateMetadata(result.candidateId, {
        ytdlp_metadata: JSON.stringify(videoInfo),
        title: videoInfo.title,
        duration_seconds: videoInfo.duration,
        best_width: videoInfo.bestWidth,
        best_height: videoInfo.bestHeight,
        estimated_size_bytes: videoInfo.estimatedSize,
        thumbnail_url: videoInfo.thumbnail,
      });

      // TODO: Trigger download job
      // This would be handled by a job queue service in future implementation

      // Broadcast WebSocket update for cross-tab sync
      websocketBroadcaster.broadcastMoviesUpdated([movieId]);

      logger.info('Trailer URL added', {
        movieId,
        movieTitle: movie.title,
        candidateId: result.candidateId,
        url,
        isNew: result.isNew,
      });

      res.json({
        success: true,
        candidateId: result.candidateId,
        isNew: result.isNew,
        metadata: {
          title: videoInfo.title,
          duration: videoInfo.duration,
          width: videoInfo.bestWidth,
          height: videoInfo.bestHeight,
          estimatedSize: videoInfo.estimatedSize,
        },
      });
    } catch (error) {
      logger.error('Add trailer URL failed', {
        movieId: req.params.id,
        url: req.body.url,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      next(error);
    }
  }

  /**
   * POST /api/movies/:id/trailer/upload
   * Upload custom trailer file
   *
   * Multipart form with video file.
   * Stores in cache, creates candidate, auto-selects with lock.
   *
   * Returns:
   * {
   *   success: true,
   *   candidateId: number,
   *   cacheFileId: number,
   *   filePath: string
   * }
   */
  async uploadTrailer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const movieId = parseInt(req.params.id);

      // Validate movie exists
      const movie = await this.movieService.getById(movieId);
      if (!movie) {
        res.status(404).json({ error: 'Movie not found' });
        return;
      }

      // Validate file upload
      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }

      const fileName = req.file.originalname;
      const fileBuffer = req.file.buffer;

      // Calculate file hash
      const fileHash = crypto
        .createHash('sha256')
        .update(fileBuffer)
        .digest('hex');

      // Determine cache storage path (content-addressed)
      const cacheDir = path.join(process.cwd(), 'data', 'cache', 'videos', fileHash.substring(0, 2));
      await fs.ensureDir(cacheDir);

      const ext = path.extname(fileName);
      const cacheFilePath = path.join(cacheDir, `${fileHash}${ext}`);

      // Write file to cache
      await fs.writeFile(cacheFilePath, fileBuffer);

      logger.info('Trailer file written to cache', {
        movieId,
        fileName,
        fileHash,
        fileSize: fileBuffer.length,
        cacheFilePath,
      });

      // Insert into cache_video_files table
      const insertResult = await this.db.getConnection().execute(
        `INSERT INTO cache_video_files (
          entity_type, entity_id, video_type, file_name, file_path,
          file_hash, file_size, discovered_at, created_at, updated_at
        ) VALUES (?, ?, 'trailer', ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        ['movie', movieId, fileName, cacheFilePath, fileHash, fileBuffer.length]
      );

      const cacheFileId = insertResult.insertId!;

      // Create trailer candidate with upload source
      const uploadResult = await this.trailerService.uploadTrailer(
        'movie',
        movieId,
        cacheFileId,
        fileName,
        'user'
      );

      // Broadcast WebSocket update for cross-tab sync
      websocketBroadcaster.broadcastMoviesUpdated([movieId]);

      logger.info('Trailer uploaded successfully', {
        movieId,
        movieTitle: movie.title,
        candidateId: uploadResult.candidateId,
        cacheFileId: uploadResult.cacheFileId,
        fileName,
      });

      res.json({
        success: true,
        candidateId: uploadResult.candidateId,
        cacheFileId: uploadResult.cacheFileId,
        filePath: uploadResult.filePath,
      });
    } catch (error) {
      logger.error('Upload trailer failed', {
        movieId: req.params.id,
        fileName: req.file?.originalname,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      next(error);
    }
  }

  /**
   * POST /api/movies/:id/trailer/candidates/verify
   * Verify availability of all trailer candidates via oEmbed
   *
   * Called when trailer selection modal opens to check which candidates
   * are still available. Uses parallel oEmbed requests for speed.
   *
   * Returns:
   * {
   *   results: {
   *     [candidateId: number]: 'available' | 'unavailable' | 'unknown'
   *   }
   * }
   */
  async verifyCandidates(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const movieId = parseInt(req.params.id);

      // Validate movie exists
      const movie = await this.movieService.getById(movieId);
      if (!movie) {
        res.status(404).json({ error: 'Movie not found' });
        return;
      }

      // Get all candidates
      const candidates = await this.trailerService.getCandidates('movie', movieId);

      // Filter to only candidates with source URLs (skip uploads)
      const candidatesWithUrls = candidates.filter(c => c.source_url);

      // Parallel oEmbed verification
      const results: Record<number, 'available' | 'unavailable' | 'unknown'> = {};

      await Promise.all(
        candidatesWithUrls.map(async (candidate) => {
          try {
            const result = await this.trailerDownloadService.verifyVideoExists(candidate.source_url!);
            results[candidate.id] = result === 'exists' ? 'available' :
                                    result === 'not_found' ? 'unavailable' : 'unknown';
          } catch (error) {
            results[candidate.id] = 'unknown';
          }
        })
      );

      // Mark uploads as available (they're local files)
      for (const candidate of candidates) {
        if (candidate.source_type === 'upload') {
          results[candidate.id] = 'available';
        }
      }

      logger.debug('Verified trailer candidates', {
        movieId,
        totalCandidates: candidates.length,
        verified: Object.keys(results).length,
      });

      res.json({ results });
    } catch (error) {
      logger.error('Verify candidates failed', {
        movieId: req.params.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      next(error);
    }
  }

  /**
   * POST /api/movies/:id/trailer/candidates/:candidateId/test
   * Test if a specific trailer candidate can be downloaded
   *
   * Uses yt-dlp --simulate to test the full download chain without
   * actually downloading. Catches region blocks, format issues, etc.
   *
   * Body: { maxResolution?: number } (default: 1080)
   *
   * Returns:
   * { success: true } or
   * { success: false, error: string, message: string }
   */
  async testCandidate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const movieId = parseInt(req.params.id);
      const candidateId = parseInt(req.params.candidateId);
      const maxResolution = req.body.maxResolution || 1080;

      // Validate movie exists
      const movie = await this.movieService.getById(movieId);
      if (!movie) {
        res.status(404).json({ error: 'Movie not found' });
        return;
      }

      // Get candidate
      const candidates = await this.trailerService.getCandidates('movie', movieId);
      const candidate = candidates.find(c => c.id === candidateId);

      if (!candidate) {
        res.status(404).json({ error: 'Trailer candidate not found' });
        return;
      }

      if (!candidate.source_url) {
        // Uploads don't need testing
        if (candidate.source_type === 'upload') {
          res.json({ success: true });
          return;
        }
        res.status(400).json({ error: 'Candidate has no source URL to test' });
        return;
      }

      logger.debug('Testing trailer candidate download', {
        movieId,
        candidateId,
        sourceUrl: candidate.source_url,
        maxResolution,
      });

      // Run simulation
      const result = await this.trailerDownloadService.simulateDownload(
        candidate.source_url,
        maxResolution
      );

      if (!result.success) {
        // Update candidate failure state in database
        await this.trailerService.recordFailure(candidateId, result.error);

        logger.info('Trailer candidate test failed', {
          movieId,
          candidateId,
          error: result.error,
          message: result.message,
        });

        res.json({
          success: false,
          error: result.error,
          message: result.message,
        });
        return;
      }

      logger.info('Trailer candidate test passed', {
        movieId,
        candidateId,
      });

      res.json({ success: true });
    } catch (error) {
      logger.error('Test candidate failed', {
        movieId: req.params.id,
        candidateId: req.params.candidateId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      next(error);
    }
  }

  /**
   * DELETE /api/movies/:id/trailer
   * Remove selected trailer
   *
   * Deletes the currently selected trailer candidate.
   * Broadcasts WebSocket update for cross-tab sync.
   */
  async deleteTrailer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const movieId = parseInt(req.params.id);

      // Validate movie exists
      const movie = await this.movieService.getById(movieId);
      if (!movie) {
        res.status(404).json({ error: 'Movie not found' });
        return;
      }

      // Delete the selected trailer
      await this.trailerService.deleteTrailer('movie', movieId);

      // Broadcast WebSocket update for cross-tab sync
      websocketBroadcaster.broadcastMoviesUpdated([movieId]);

      logger.info('Trailer deleted', {
        movieId,
        movieTitle: movie.title,
      });

      res.json({ success: true });
    } catch (error) {
      logger.error('Delete trailer failed', {
        movieId: req.params.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      next(error);
    }
  }

  /**
   * POST /api/movies/:id/trailer/lock
   * Lock the trailer field to prevent automation
   *
   * Locks the trailer field on the movie, preventing automated enrichment
   * from changing the trailer selection.
   */
  async lockTrailer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const movieId = parseInt(req.params.id);

      // Validate movie exists
      const movie = await this.movieService.getById(movieId);
      if (!movie) {
        res.status(404).json({ error: 'Movie not found' });
        return;
      }

      // Lock the trailer field on the movie
      await this.trailerService.lockTrailerField('movie', movieId);

      // Broadcast WebSocket update for cross-tab sync
      websocketBroadcaster.broadcastMoviesUpdated([movieId]);

      logger.info('Trailer field locked', {
        movieId,
        movieTitle: movie.title,
      });

      res.json({ success: true });
    } catch (error) {
      logger.error('Lock trailer failed', {
        movieId: req.params.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      next(error);
    }
  }

  /**
   * POST /api/movies/:id/trailer/unlock
   * Unlock trailer field to allow automation
   *
   * Unlocks the trailer field on the movie, allowing automated enrichment
   * to find and select better trailer candidates.
   */
  async unlockTrailer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const movieId = parseInt(req.params.id);

      // Validate movie exists
      const movie = await this.movieService.getById(movieId);
      if (!movie) {
        res.status(404).json({ error: 'Movie not found' });
        return;
      }

      // Unlock the trailer field on the movie
      await this.trailerService.unlockTrailerField('movie', movieId);

      // Broadcast WebSocket update for cross-tab sync
      websocketBroadcaster.broadcastMoviesUpdated([movieId]);

      logger.info('Trailer field unlocked', {
        movieId,
        movieTitle: movie.title,
      });

      res.json({ success: true });
    } catch (error) {
      logger.error('Unlock trailer failed', {
        movieId: req.params.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      next(error);
    }
  }

  /**
   * POST /api/movies/:id/trailer/candidates/:candidateId/retry
   * Retry downloading a failed trailer candidate
   *
   * Clears the failure state and triggers a new download attempt.
   * For unavailable videos, warns the user that the video may no longer exist.
   *
   * Returns:
   * {
   *   success: true,
   *   message: string,
   *   wasUnavailable: boolean
   * }
   */
  async retryDownload(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const movieId = parseInt(req.params.id);
      const candidateId = parseInt(req.params.candidateId);

      // Validate movie exists
      const movie = await this.movieService.getById(movieId);
      if (!movie) {
        res.status(404).json({ error: 'Movie not found' });
        return;
      }

      // Get candidate to check current state
      const candidates = await this.trailerService.getCandidates('movie', movieId);
      const candidate = candidates.find(c => c.id === candidateId);

      if (!candidate) {
        res.status(404).json({ error: 'Trailer candidate not found' });
        return;
      }

      if (!candidate.source_url) {
        res.status(400).json({ error: 'Candidate has no source URL to retry' });
        return;
      }

      const wasUnavailable = candidate.failure_reason === 'unavailable';

      // Clear failure state
      await this.trailerService.clearFailure(candidateId);

      logger.info('Retrying trailer download', {
        movieId,
        candidateId,
        wasUnavailable,
        previousFailureReason: candidate.failure_reason,
      });

      // Respond immediately
      res.json({
        success: true,
        message: wasUnavailable
          ? 'Retry initiated. Note: This video was previously marked as unavailable.'
          : 'Retry initiated.',
        wasUnavailable,
      });

      // Trigger download in background
      this.downloadTrailerInBackground(movieId, candidateId, candidate.source_url);
    } catch (error) {
      logger.error('Retry trailer download failed', {
        movieId: req.params.id,
        candidateId: req.params.candidateId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      next(error);
    }
  }

  /**
   * Download a trailer in the background
   *
   * This method runs asynchronously after the API response is sent.
   * Downloads the video, stores in cache, and updates the candidate record.
   *
   * @param movieId - Movie ID for logging and WebSocket updates
   * @param candidateId - Trailer candidate ID to update
   * @param sourceUrl - Video URL to download
   */
  private async downloadTrailerInBackground(
    movieId: number,
    candidateId: number,
    sourceUrl: string
  ): Promise<void> {
    try {
      logger.info('Starting background trailer download', {
        movieId,
        candidateId,
        sourceUrl,
      });

      // Generate output path (content-addressed by URL hash for now)
      const urlHash = crypto.createHash('sha256').update(sourceUrl).digest('hex');
      const cacheDir = path.join(process.cwd(), 'data', 'cache', 'videos', urlHash.substring(0, 2));
      await fs.ensureDir(cacheDir);
      const outputPath = path.join(cacheDir, `${urlHash}.mp4`);

      // Download the video (max 1080p)
      const result = await this.trailerDownloadService.downloadVideo(sourceUrl, outputPath, 1080);

      if (!result.success) {
        // Record failure - the error type is already determined by downloadVideo
        // which does oEmbed verification to distinguish permanent vs transient failures
        logger.error('Trailer download failed', {
          movieId,
          candidateId,
          error: result.error,
          message: result.message,
        });

        await this.trailerService.recordFailure(candidateId, result.error);

        // Broadcast failure update
        websocketBroadcaster.broadcastMoviesUpdated([movieId]);
        return;
      }

      // Create cache_video_files entry
      const conn = this.db.getConnection();
      const insertResult = await conn.execute(
        `INSERT INTO cache_video_files (
          entity_type, entity_id, video_type, file_name, file_path,
          file_hash, file_size, discovered_at, created_at, updated_at
        ) VALUES (?, ?, 'trailer', ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        ['movie', movieId, path.basename(outputPath), outputPath, urlHash, result.fileSize]
      );

      const cacheFileId = insertResult.insertId!;

      // Link cache file to candidate
      await this.trailerService.linkCacheFile(candidateId, cacheFileId);

      logger.info('Trailer download completed', {
        movieId,
        candidateId,
        cacheFileId,
        filePath: outputPath,
        fileSize: result.fileSize,
      });

      // Broadcast success update
      websocketBroadcaster.broadcastMoviesUpdated([movieId]);
    } catch (error) {
      logger.error('Background trailer download error', {
        movieId,
        candidateId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Record generic failure
      try {
        await this.trailerService.recordFailure(candidateId, 'download_error');
      } catch (recordError) {
        logger.error('Failed to record download failure', {
          candidateId,
          error: recordError instanceof Error ? recordError.message : 'Unknown error',
        });
      }

      // Broadcast failure update
      websocketBroadcaster.broadcastMoviesUpdated([movieId]);
    }
  }
}
