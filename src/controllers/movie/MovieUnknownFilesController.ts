import { Request, Response, NextFunction } from 'express';
import { MovieService } from '../../services/movieService.js';
import { websocketBroadcaster } from '../../services/websocketBroadcaster.js';
import { logger } from '../../middleware/logging.js';

/**
 * MovieUnknownFilesController
 *
 * Handles unknown file operations for movies:
 * - Assign unknown file to a specific asset type
 * - Ignore unknown file (mark as intentionally unclassified)
 * - Delete unknown file (move to recycle bin)
 *
 * Separated from MovieController to follow Single Responsibility Principle.
 * This controller focuses exclusively on handling files that the scanner couldn't classify.
 *
 * CONTEXT:
 * During library scanning, some files cannot be automatically classified as
 * posters, fanart, subtitles, etc. These are marked as "unknown" and require
 * user intervention to either:
 * 1. Assign to correct type (becomes a tracked asset)
 * 2. Ignore (mark as intentional, like README.txt)
 * 3. Delete (probably junk, move to recycle bin)
 */
export class MovieUnknownFilesController {
  constructor(private movieService: MovieService) {}

  /**
   * POST /api/movies/:id/unknown-files/:fileId/assign
   * Assign unknown file to a specific asset type
   *
   * Body: { fileType: 'poster' | 'fanart' | 'subtitle' | ... }
   *
   * This promotes the unknown file to a tracked asset of the specified type.
   * The file is moved/renamed to match Kodi naming conventions and tracked
   * in the appropriate cache table (cache_image_files, cache_video_files, etc.)
   */
  async assignUnknownFile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const movieId = parseInt(req.params.id);
      const fileId = parseInt(req.params.fileId);
      const { fileType } = req.body;

      // Validate required fields
      if (!fileType) {
        res.status(400).json({ error: 'fileType is required' });
        return;
      }

      // Validate movie exists
      const movie = await this.movieService.getById(movieId);
      if (!movie) {
        res.status(404).json({ error: 'Movie not found' });
        return;
      }

      logger.info('Assigning unknown file', {
        movieId,
        fileId,
        fileType,
      });

      // Assign the file
      const result = await this.movieService.assignUnknownFile(movieId, fileId, fileType);

      // Broadcast WebSocket update for cross-tab sync (movie assets changed)
      websocketBroadcaster.broadcastMoviesUpdated([movieId]);

      logger.info('Unknown file assigned successfully', {
        movieId,
        fileId,
        fileType,
      });

      res.json(result);
    } catch (error) {
      logger.error('Assign unknown file failed', {
        movieId: req.params.id,
        fileId: req.params.fileId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      next(error);
    }
  }

  /**
   * POST /api/movies/:id/unknown-files/:fileId/ignore
   * Mark unknown file as ignored (intentionally unclassified)
   *
   * Use this for files that should remain in the directory but don't need
   * to be tracked as assets. Examples:
   * - README.txt
   * - .nfo files from other tools
   * - Custom scripts or metadata
   *
   * Ignored files won't show up in the "unknown files" list anymore.
   */
  async ignoreUnknownFile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const movieId = parseInt(req.params.id);
      const fileId = parseInt(req.params.fileId);

      // Validate movie exists
      const movie = await this.movieService.getById(movieId);
      if (!movie) {
        res.status(404).json({ error: 'Movie not found' });
        return;
      }

      logger.info('Ignoring unknown file', {
        movieId,
        fileId,
      });

      // Ignore the file
      const result = await this.movieService.ignoreUnknownFile(movieId, fileId);

      logger.info('Unknown file ignored successfully', {
        movieId,
        fileId,
      });

      res.json(result);
    } catch (error) {
      logger.error('Ignore unknown file failed', {
        movieId: req.params.id,
        fileId: req.params.fileId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      next(error);
    }
  }

  /**
   * DELETE /api/movies/:id/unknown-files/:fileId
   * Delete unknown file (move to recycle bin)
   *
   * Safely removes the file from the movie directory by moving it to
   * the recycle bin. The file can be restored within 30 days before
   * permanent deletion.
   *
   * Use this for junk files that shouldn't be in the movie directory.
   */
  async deleteUnknownFile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const movieId = parseInt(req.params.id);
      const fileId = parseInt(req.params.fileId);

      // Validate movie exists
      const movie = await this.movieService.getById(movieId);
      if (!movie) {
        res.status(404).json({ error: 'Movie not found' });
        return;
      }

      logger.info('Deleting unknown file', {
        movieId,
        fileId,
      });

      // Delete the file (move to recycle bin)
      const result = await this.movieService.deleteUnknownFile(movieId, fileId);

      logger.info('Unknown file deleted successfully', {
        movieId,
        fileId,
      });

      res.json(result);
    } catch (error) {
      logger.error('Delete unknown file failed', {
        movieId: req.params.id,
        fileId: req.params.fileId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      next(error);
    }
  }
}
