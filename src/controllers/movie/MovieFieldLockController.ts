import { Request, Response, NextFunction } from 'express';
import { MovieService } from '../../services/movieService.js';
import { websocketBroadcaster } from '../../services/websocketBroadcaster.js';
import { logger } from '../../middleware/logging.js';

/**
 * MovieFieldLockController
 *
 * Handles field-level locking operations for movies:
 * - Lock field to prevent automation from modifying it
 * - Unlock field to allow automation again
 * - Reset all metadata locks and re-fetch from providers
 *
 * Separated from MovieController to follow Single Responsibility Principle.
 * This controller focuses exclusively on granular user control over automated enrichment.
 *
 * PHILOSOPHY:
 * "Intelligent Defaults with Manual Override Capability"
 * - Automation is smart but user edits are sacred
 * - Field locks preserve manual customizations forever
 * - Reset metadata allows users to discard their edits
 */
export class MovieFieldLockController {
  constructor(private movieService: MovieService) {}

  /**
   * POST /api/movies/:id/lock-field
   * Lock a field to prevent automation from modifying it
   *
   * Body: { fieldName: 'title' | 'plot' | 'year' | ... }
   *
   * When a field is locked, enrichment services MUST NOT modify it.
   * Locks are automatically set when user manually edits a field.
   */
  async lockField(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const movieId = parseInt(req.params.id);
      const { fieldName } = req.body;

      if (!fieldName) {
        res.status(400).json({ error: 'fieldName is required' });
        return;
      }

      // Validate movie exists
      const movie = await this.movieService.getById(movieId);
      if (!movie) {
        res.status(404).json({ error: 'Movie not found' });
        return;
      }

      // Lock the field
      const result = await this.movieService.lockField(movieId, fieldName);

      // Broadcast WebSocket update for cross-tab sync
      websocketBroadcaster.broadcastMoviesUpdated([movieId]);

      logger.info('Locked field', {
        movieId,
        movieTitle: movie.title,
        fieldName,
      });

      res.json(result);
    } catch (error) {
      logger.error('Lock field failed', {
        movieId: req.params.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      next(error);
    }
  }

  /**
   * POST /api/movies/:id/unlock-field
   * Unlock a field to allow automation to modify it
   *
   * Body: { fieldName: 'title' | 'plot' | 'year' | ... }
   *
   * Unlocks a previously locked field.
   * Use with "Reset to Provider" to re-fetch metadata.
   */
  async unlockField(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const movieId = parseInt(req.params.id);
      const { fieldName } = req.body;

      if (!fieldName) {
        res.status(400).json({ error: 'fieldName is required' });
        return;
      }

      // Validate movie exists
      const movie = await this.movieService.getById(movieId);
      if (!movie) {
        res.status(404).json({ error: 'Movie not found' });
        return;
      }

      // Unlock the field
      const result = await this.movieService.unlockField(movieId, fieldName);

      // Broadcast WebSocket update for cross-tab sync
      websocketBroadcaster.broadcastMoviesUpdated([movieId]);

      logger.info('Unlocked field', {
        movieId,
        movieTitle: movie.title,
        fieldName,
      });

      res.json(result);
    } catch (error) {
      logger.error('Unlock field failed', {
        movieId: req.params.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      next(error);
    }
  }

  /**
   * POST /api/movies/:id/reset-metadata
   * Reset all metadata locks and re-fetch from providers
   *
   * This "nuclear option" allows users to discard all manual edits and start fresh:
   * 1. Unlocks all metadata fields
   * 2. Triggers re-enrichment from providers
   * 3. Preserves assets and physical files
   *
   * Use case: User made incorrect manual edits and wants to revert to provider data
   */
  async resetMetadata(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const movieId = parseInt(req.params.id);

      // Validate movie exists
      const movie = await this.movieService.getById(movieId);
      if (!movie) {
        res.status(404).json({ error: 'Movie not found' });
        return;
      }

      // Reset metadata (unlock all + re-fetch)
      const result = await this.movieService.resetMetadata(movieId);

      // Broadcast WebSocket update for cross-tab sync
      websocketBroadcaster.broadcastMoviesUpdated([movieId]);

      logger.info('Reset metadata', {
        movieId,
        movieTitle: movie.title,
      });

      res.json(result);
    } catch (error) {
      logger.error('Reset metadata failed', {
        movieId: req.params.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      next(error);
    }
  }
}
