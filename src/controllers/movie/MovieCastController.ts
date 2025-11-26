import { Request, Response, NextFunction } from 'express';
import { MovieService } from '../../services/movieService.js';
import { websocketBroadcaster } from '../../services/websocketBroadcaster.js';
import { logger } from '../../middleware/logging.js';

/**
 * MovieCastController
 *
 * Handles cast (actors) management operations for movies:
 * - Get cast list with order lock status
 * - Update cast list (order, roles, additions/removals)
 *
 * Separated from MovieController to follow Single Responsibility Principle.
 * This controller focuses exclusively on cast management and ordering.
 *
 * PHILOSOPHY:
 * "Intelligent Defaults with Manual Override Capability"
 * - Automation populates cast but user edits are preserved
 * - Cast order lock prevents automation from reordering actors
 * - Individual role locks preserve manual role edits
 */
export class MovieCastController {
  constructor(private movieService: MovieService) {}

  /**
   * GET /api/movies/:id/cast
   * Get cast list with order lock status
   *
   * Returns:
   * {
   *   actors: [{ actor_id, actor_name, role, actor_order, role_locked, removed }],
   *   actors_order_locked: boolean
   * }
   */
  async getCast(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const movieId = parseInt(req.params.id);

      // Validate movie exists
      const movie = await this.movieService.getById(movieId);
      if (!movie) {
        res.status(404).json({ error: 'Movie not found' });
        return;
      }

      // Get cast using dedicated service method (returns proper actor_name field)
      const actors = await this.movieService.getCast(movieId);
      const actors_order_locked = movie.actors_order_locked === 1;

      logger.debug('Retrieved cast for movie', {
        movieId,
        movieTitle: movie.title,
        actorCount: actors.length,
        actors_order_locked,
      });

      res.json({
        actors,
        actors_order_locked,
      });
    } catch (error) {
      logger.error('Get cast failed', {
        movieId: req.params.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      next(error);
    }
  }

  /**
   * PUT /api/movies/:id/cast
   * Update cast list
   *
   * Body: {
   *   actors: [{ name, role, order }],
   *   actors_order_locked?: boolean
   * }
   *
   * This endpoint allows complete cast management:
   * - Reordering actors
   * - Adding new actors
   * - Removing actors
   * - Updating roles
   * - Toggling order lock
   */
  async updateCast(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const movieId = parseInt(req.params.id);
      const { actors, actors_order_locked } = req.body;

      // Validate request body
      if (!actors || !Array.isArray(actors)) {
        res.status(400).json({ error: 'actors array is required' });
        return;
      }

      // Validate movie exists
      const movie = await this.movieService.getById(movieId);
      if (!movie) {
        res.status(404).json({ error: 'Movie not found' });
        return;
      }

      // Call service method to update cast
      // Note: This method needs to be implemented in MovieService
      const result = await this.movieService.updateCast(movieId, {
        actors,
        actors_order_locked,
      });

      // Broadcast WebSocket update for cross-tab sync
      websocketBroadcaster.broadcastMoviesUpdated([movieId]);

      logger.info('Updated cast', {
        movieId,
        movieTitle: movie.title,
        actorCount: actors.length,
        actors_order_locked,
      });

      res.json(result);
    } catch (error) {
      logger.error('Update cast failed', {
        movieId: req.params.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      next(error);
    }
  }
}
