import { Request, Response, NextFunction } from 'express';
import { MovieService } from '../../services/movieService.js';
import { MovieFilters } from '../../services/movie/MovieQueryService.js';
import { websocketBroadcaster } from '../../services/websocketBroadcaster.js';

/**
 * MovieCrudController
 *
 * Handles basic CRUD operations for movies:
 * - List all movies (with filtering)
 * - Get movie by ID
 * - Update movie metadata
 * - Delete movie
 * - Restore deleted movie
 * - Refresh movie (rescan)
 *
 * Separated from MovieController to follow Single Responsibility Principle.
 * Each controller now has a focused, testable responsibility.
 */
export class MovieCrudController {
  constructor(private movieService: MovieService) {}

  /**
   * GET /api/movies
   * List all movies with optional filtering
   */
  async getAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const filters: MovieFilters = {};

      if (req.query.status) filters.status = req.query.status as string;
      if (req.query.identificationStatus) {
        filters.identificationStatus = req.query.identificationStatus as 'unidentified' | 'identified' | 'enriched';
      }
      if (req.query.libraryId) filters.libraryId = parseInt(req.query.libraryId as string);
      if (req.query.limit) filters.limit = parseInt(req.query.limit as string);
      if (req.query.offset) filters.offset = parseInt(req.query.offset as string);

      const result = await this.movieService.getAll(filters);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/movies/:id
   * Get movie by ID with optional includes
   */
  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const movieId = parseInt(req.params.id);

      // Parse ?include query parameter (comma-separated list: files,candidates,locks)
      const includeParam = req.query.include as string;
      const include = includeParam ? includeParam.split(',').map(s => s.trim()) : ['files'];

      const movie = await this.movieService.getById(movieId, include);

      if (!movie) {
        res.status(404).json({ error: 'Movie not found' });
        return;
      }

      res.json(movie);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/movies/:id/metadata
   * Update movie metadata
   */
  async updateMetadata(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const movieId = parseInt(req.params.id);
      const metadata = req.body;

      const result = await this.movieService.updateMetadata(movieId, metadata);

      // Broadcast WebSocket update for cross-tab sync
      websocketBroadcaster.broadcastMoviesUpdated([movieId]);

      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/movies/:id/refresh
   * Rescan a specific movie directory
   */
  async refreshMovie(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const movieId = parseInt(req.params.id);
      const movie = await this.movieService.getById(movieId);

      if (!movie) {
        res.status(404).json({ error: 'Movie not found' });
        return;
      }

      // Trigger rescan of movie directory via movieService
      const result = await this.movieService.refreshMovie(movieId);

      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/movies/:id
   * Soft delete a movie
   */
  async deleteMovie(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const movieId = parseInt(req.params.id);

      const result = await this.movieService.softDeleteMovie(movieId);

      // Broadcast WebSocket update for cross-tab sync
      websocketBroadcaster.broadcastMoviesUpdated([movieId]);

      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/movies/:id/restore
   * Restore a soft-deleted movie
   */
  async restoreMovie(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const movieId = parseInt(req.params.id);

      await this.movieService.restoreMovie(movieId);

      // Broadcast WebSocket update for cross-tab sync
      websocketBroadcaster.broadcastMoviesUpdated([movieId]);

      res.json({ message: 'Movie restored successfully' });
    } catch (error) {
      next(error);
    }
  }
}
