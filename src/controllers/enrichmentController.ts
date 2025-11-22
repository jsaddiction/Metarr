import { Request, Response } from 'express';
import { EnrichmentStatsService } from '../services/enrichment/EnrichmentStatsService.js';
import { JobQueueService } from '../services/jobQueue/JobQueueService.js';
import { DatabaseConnection } from '../types/database.js';
import { logger } from '../middleware/logging.js';
import { getErrorMessage } from '../utils/errorHandling.js';

/**
 * EnrichmentController
 *
 * Handles HTTP requests for enrichment status and manual enrichment triggers:
 * - Library-wide completeness statistics
 * - Movie-specific enrichment status
 * - Manual movie enrichment triggers
 * - Bulk enrichment status and triggers
 */

export class EnrichmentController {
  constructor(
    private readonly statsService: EnrichmentStatsService,
    private readonly jobQueue: JobQueueService,
    private readonly db: DatabaseConnection
  ) {}

  /**
   * GET /api/movies/enrichment/stats
   * Get library-wide completeness statistics
   */
  getLibraryStats = async (_req: Request, res: Response): Promise<void> => {
    try {
      logger.debug('[EnrichmentController] Getting library stats');

      const stats = await this.statsService.getLibraryStats();

      res.json({ success: true, data: stats });
    } catch (error) {
      logger.error('[EnrichmentController] Failed to get library stats', {
        error: getErrorMessage(error),
      });
      res.status(500).json({
        success: false,
        error: 'Failed to get library statistics',
      });
    }
  };

  /**
   * GET /api/movies/:id/enrichment-status
   * Get movie-specific enrichment status
   */
  getMovieStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      const movieId = parseInt(req.params.id);

      if (isNaN(movieId)) {
        res.status(400).json({
          success: false,
          error: 'Invalid movie ID',
        });
        return;
      }

      logger.debug('[EnrichmentController] Getting movie enrichment status', { movieId });

      const status = await this.statsService.getMovieEnrichmentStatus(movieId);

      if (!status) {
        res.status(404).json({
          success: false,
          error: 'Movie not found',
        });
        return;
      }

      res.json({ success: true, data: status });
    } catch (error) {
      logger.error('[EnrichmentController] Failed to get movie enrichment status', {
        movieId: req.params.id,
        error: getErrorMessage(error),
      });
      res.status(500).json({
        success: false,
        error: 'Failed to get movie enrichment status',
      });
    }
  };

  /**
   * POST /api/movies/:id/enrich
   * Trigger manual movie enrichment
   */
  triggerMovieEnrich = async (req: Request, res: Response): Promise<void> => {
    try {
      const movieId = parseInt(req.params.id);
      const { force = false } = req.body;

      if (isNaN(movieId)) {
        res.status(400).json({
          success: false,
          error: 'Invalid movie ID',
        });
        return;
      }

      logger.debug('[EnrichmentController] Triggering movie enrichment', { movieId, force });

      // Check if movie exists
      const movie = await this.db.get<{ id: number; title: string }>(
        'SELECT id, title FROM movies WHERE id = ? AND deleted_at IS NULL',
        [movieId]
      );

      if (!movie) {
        res.status(404).json({
          success: false,
          error: 'Movie not found',
        });
        return;
      }

      // Check if there's already an enrichment job pending/processing for this movie
      const existingJobs = await this.jobQueue.getRecentJobs();
      const hasActiveEnrichJob = existingJobs.some((job) => {
        if (job.type !== 'enrich-metadata') return false;
        if (job.status !== 'pending' && job.status !== 'processing') return false;

        // Type guard: narrow the payload type
        const payload = job.payload as { entityType: string; entityId: number; requireComplete?: boolean };
        return payload.entityType === 'movie' && payload.entityId === movieId;
      });

      if (hasActiveEnrichJob) {
        res.status(409).json({
          success: false,
          error: 'Enrichment already in progress for this movie',
        });
        return;
      }

      // Create enrichment job (requireComplete: false for manual enrichment)
      const jobId = await this.jobQueue.addJob({
        type: 'enrich-metadata',
        priority: 3, // HIGH priority (user-initiated)
        payload: {
          entityType: 'movie',
          entityId: movieId,
          requireComplete: false, // Best effort for manual enrichment
        },
        retry_count: 0,
        max_retries: 3,
      });

      logger.info('[EnrichmentController] Enrichment job queued', {
        jobId,
        movieId,
        movieTitle: movie.title,
      });

      res.status(202).json({
        success: true,
        data: {
          jobId,
          message: 'Enrichment job queued',
          estimatedDuration: 3, // seconds (rough estimate for single movie)
        },
      });
    } catch (error) {
      logger.error('[EnrichmentController] Failed to trigger enrichment', {
        movieId: req.params.id,
        error: getErrorMessage(error),
      });
      res.status(500).json({
        success: false,
        error: 'Failed to queue enrichment job',
      });
    }
  };

  /**
   * GET /api/enrichment/bulk-status
   * Get last bulk job statistics and next scheduled run
   */
  getBulkStatus = async (_req: Request, res: Response): Promise<void> => {
    try {
      logger.debug('[EnrichmentController] Getting bulk enrichment status');

      // TODO: Implement bulk enrichment tracking
      // For now, return placeholder data indicating feature not yet implemented

      // Get recent bulk enrichment jobs from queue
      const recentJobs = await this.jobQueue.getRecentJobs();
      const bulkJobs = recentJobs
        .filter((job) => job.type === 'bulk-enrich')
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      const currentRunning = bulkJobs.find(
        (job) => job.status === 'processing' || job.status === 'pending'
      );
      // Note: Jobs are removed from queue when completed/failed, so we won't find them
      // This is a limitation - we'd need a separate tracking table for historical data
      const lastCompleted = bulkJobs.find(
        (job) => job.status === 'pending' && job.created_at // Fallback: no completed/failed in queue
      );

      // Build response based on available data
      const response: any = {
        lastRun: lastCompleted
          ? {
              startedAt: lastCompleted.created_at,
              completedAt: lastCompleted.started_at || null, // Jobs don't have completed_at
              status: 'completed', // Placeholder - we don't track this yet
              stats: {
                totalMovies: 0,
                processed: 0,
                skipped: 0,
                failed: 0,
              },
              rateLimitHit: false,
              rateLimitedProviders: [],
            }
          : null,
        nextRun: {
          scheduledAt: null, // TODO: Get from scheduler config
          timeUntil: null,
        },
        currentRun: currentRunning
          ? {
              jobId: currentRunning.id,
              startedAt: currentRunning.created_at,
              progress: 0, // TODO: Track progress
              processedMovies: 0,
              totalMovies: 0,
              currentMovie: null,
              rateLimitedProviders: [],
            }
          : null,
      };

      res.json({ success: true, data: response });
    } catch (error) {
      logger.error('[EnrichmentController] Failed to get bulk status', {
        error: getErrorMessage(error),
      });
      res.status(500).json({
        success: false,
        error: 'Failed to get bulk enrichment status',
      });
    }
  };

  /**
   * POST /api/enrichment/bulk-run
   * Trigger manual bulk enrichment
   */
  triggerBulkEnrich = async (req: Request, res: Response): Promise<void> => {
    try {
      const { force = false } = req.body;

      logger.debug('[EnrichmentController] Triggering bulk enrichment', { force });

      // Check if there's already a bulk enrichment job running
      const recentJobs = await this.jobQueue.getRecentJobs();
      const hasActiveBulkJob = recentJobs.some(
        (job) =>
          job.type === 'bulk-enrich' && (job.status === 'pending' || job.status === 'processing')
      );

      if (hasActiveBulkJob) {
        res.status(409).json({
          success: false,
          error: 'Bulk enrichment already running',
        });
        return;
      }

      // Get total movie count for estimate
      const movieCount = await this.db.get<{ count: number }>(
        'SELECT COUNT(*) as count FROM movies WHERE monitored = 1 AND deleted_at IS NULL'
      );

      const totalMovies = movieCount?.count || 0;

      // Create bulk enrichment job
      const jobId = await this.jobQueue.addJob({
        type: 'bulk-enrich',
        priority: 4, // NORMAL priority (background task, even if user-initiated)
        payload: {
          taskId: 'bulk-enrich',
          manual: true, // User-initiated
        },
        retry_count: 0,
        max_retries: 1, // Don't retry bulk jobs
      });

      logger.info('[EnrichmentController] Bulk enrichment job started', {
        jobId,
        totalMovies,
      });

      // Estimate duration: ~2 seconds per movie (conservative)
      const estimatedDuration = totalMovies * 2;

      res.status(202).json({
        success: true,
        data: {
          jobId,
          message: 'Bulk enrichment job started',
          estimatedDuration, // seconds
        },
      });
    } catch (error) {
      logger.error('[EnrichmentController] Failed to trigger bulk enrichment', {
        error: getErrorMessage(error),
      });
      res.status(500).json({
        success: false,
        error: 'Failed to start bulk enrichment job',
      });
    }
  };
}
