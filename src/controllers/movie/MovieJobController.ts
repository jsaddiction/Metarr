import { Request, Response, NextFunction } from 'express';
import { MovieService } from '../../services/movieService.js';
import { websocketBroadcaster } from '../../services/websocketBroadcaster.js';
import { logger } from '../../middleware/logging.js';

/**
 * MovieJobController
 *
 * Handles job queue operations for movies:
 * - Toggle monitored status (enable/disable automation)
 * - Trigger verification job (cache ↔ library consistency)
 * - Trigger enrichment job (fetch metadata from providers)
 * - Trigger publish job (deploy assets to library)
 *
 * Separated from MovieController to follow Single Responsibility Principle.
 * This controller focuses exclusively on job queue interactions and automation control.
 */
export class MovieJobController {
  constructor(private movieService: MovieService) {}

  /**
   * POST /api/movies/:id/toggle-monitored
   * Toggle monitored status for a movie
   *
   * Monitored = 1: Automation enabled, respects field locks
   * Monitored = 0: Automation STOPPED, everything frozen
   */
  async toggleMonitored(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const movieId = parseInt(req.params.id);

      // Validate movie exists
      const movie = await this.movieService.getById(movieId);
      if (!movie) {
        res.status(404).json({ error: 'Movie not found' });
        return;
      }

      // Toggle monitored status
      const result = await this.movieService.toggleMonitored(movieId);

      // Broadcast WebSocket update for cross-tab sync
      websocketBroadcaster.broadcastMoviesUpdated([movieId]);

      logger.info('Toggled monitored status', {
        movieId,
        movieTitle: movie.title,
        newMonitoredStatus: result.monitored,
      });

      res.json(result);
    } catch (error) {
      logger.error('Toggle monitored failed', {
        movieId: req.params.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      next(error);
    }
  }

  /**
   * POST /api/movies/:id/jobs/verify
   * Trigger verification job for a movie
   *
   * Queues verify-movie job with priority 3 to ensure:
   * - Cache assets exist on disk
   * - Library assets match cache (no external modifications)
   * - Database references are valid
   */
  async triggerVerify(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const movieId = parseInt(req.params.id);

      // Validate movie exists
      const movie = await this.movieService.getById(movieId);
      if (!movie) {
        res.status(404).json({ error: 'Movie not found' });
        return;
      }

      logger.info('Triggering verify job', {
        movieId,
        movieTitle: movie.title,
      });

      // Call service method
      const result = await this.movieService.triggerVerify(movieId);

      res.json(result);
    } catch (error) {
      logger.error('Trigger verify failed', {
        movieId: req.params.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      next(error);
    }
  }

  /**
   * POST /api/movies/:id/jobs/enrich
   * Trigger enrichment job for a movie
   *
   * Queues fetch-provider-assets job using ProviderOrchestrator with priority 3
   * This will:
   * - Fetch metadata from all enabled providers
   * - Populate provider cache with asset candidates
   * - Respect field locks (don't overwrite manual edits)
   */
  async triggerEnrich(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const movieId = parseInt(req.params.id);

      // Validate movie exists
      const movie = await this.movieService.getById(movieId);
      if (!movie) {
        res.status(404).json({ error: 'Movie not found' });
        return;
      }

      logger.info('Triggering enrichment job', {
        movieId,
        movieTitle: movie.title,
      });

      // Call service method
      const result = await this.movieService.triggerEnrich(movieId);

      res.json(result);
    } catch (error) {
      logger.error('Trigger enrich failed', {
        movieId: req.params.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      next(error);
    }
  }

  /**
   * POST /api/movies/:id/jobs/publish
   * Trigger publish job for a movie
   *
   * Queues publish job with priority 3 to:
   * - Copy cache assets to library (Kodi naming convention)
   * - Generate NFO files
   * - Trigger player library updates
   * - Send notifications if configured
   */
  async triggerPublish(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const movieId = parseInt(req.params.id);

      // Validate movie exists
      const movie = await this.movieService.getById(movieId);
      if (!movie) {
        res.status(404).json({ error: 'Movie not found' });
        return;
      }

      logger.info('Triggering publish job', {
        movieId,
        movieTitle: movie.title,
      });

      // Call service method
      const result = await this.movieService.triggerPublish(movieId);

      res.json(result);
    } catch (error) {
      logger.error('Trigger publish failed', {
        movieId: req.params.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      next(error);
    }
  }
}
