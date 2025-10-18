import { Request, Response, NextFunction } from 'express';
import { ActorService } from '../services/actorService.js';
import { DatabaseManager } from '../database/DatabaseManager.js';
import { logger } from '../middleware/logging.js';
import fs from 'fs';
import path from 'path';

export class ActorController {
  private actorService: ActorService;

  constructor(db: DatabaseManager) {
    this.actorService = new ActorService(db);
  }

  /**
   * GET /api/actors
   * Get all actors with optional filters
   */
  async getAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const filters: any = {};

      if (req.query.search) {
        filters.search = req.query.search as string;
      }

      if (req.query.movieId) {
        filters.movieId = parseInt(req.query.movieId as string);
      }

      if (req.query.limit) {
        filters.limit = parseInt(req.query.limit as string);
      }

      if (req.query.offset) {
        filters.offset = parseInt(req.query.offset as string);
      }

      const result = await this.actorService.getAll(filters);
      res.json(result);
    } catch (error) {
      logger.error('Failed to get actors', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      next(error);
    }
  }

  /**
   * GET /api/actors/:id
   * Get actor by ID
   */
  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actorId = parseInt(req.params.id);
      const actor = await this.actorService.getById(actorId);

      if (!actor) {
        res.status(404).json({ error: 'Actor not found' });
        return;
      }

      res.json(actor);
    } catch (error) {
      logger.error('Failed to get actor', {
        actorId: req.params.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      next(error);
    }
  }

  /**
   * GET /api/actors/:id/movies
   * Get movies for an actor
   */
  async getMovies(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actorId = parseInt(req.params.id);
      const movies = await this.actorService.getMoviesForActor(actorId);
      res.json(movies);
    } catch (error) {
      logger.error('Failed to get movies for actor', {
        actorId: req.params.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      next(error);
    }
  }

  /**
   * PATCH /api/actors/:id
   * Update actor information
   */
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actorId = parseInt(req.params.id);
      const actor = await this.actorService.updateActor(actorId, req.body);

      if (!actor) {
        res.status(404).json({ error: 'Actor not found' });
        return;
      }

      res.json(actor);
    } catch (error) {
      logger.error('Failed to update actor', {
        actorId: req.params.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      next(error);
    }
  }

  /**
   * DELETE /api/actors/:id
   * Delete actor (only if not linked to any movies)
   */
  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actorId = parseInt(req.params.id);
      const result = await this.actorService.deleteActor(actorId);
      res.json(result);
    } catch (error) {
      logger.error('Failed to delete actor', {
        actorId: req.params.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      next(error);
    }
  }

  /**
   * POST /api/actors/:id/merge
   * Merge source actor into target actor
   */
  async merge(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const sourceActorId = parseInt(req.params.id);
      const targetActorId = parseInt(req.body.targetActorId);

      if (!targetActorId) {
        res.status(400).json({ error: 'targetActorId is required' });
        return;
      }

      const result = await this.actorService.mergeActors(sourceActorId, targetActorId);
      res.json(result);
    } catch (error) {
      logger.error('Failed to merge actors', {
        sourceActorId: req.params.id,
        targetActorId: req.body.targetActorId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      next(error);
    }
  }

  /**
   * GET /api/actors/:id/image
   * Serve actor image from cache
   */
  async serveImage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actorId = parseInt(req.params.id);

      if (isNaN(actorId)) {
        res.status(404).send('Actor not found');
        return;
      }

      // Get actor with image path
      const actor = await this.actorService.getById(actorId);

      if (!actor || !actor.image_cache_path) {
        res.status(404).send('Actor image not found');
        return;
      }

      // Check if file exists
      if (!fs.existsSync(actor.image_cache_path)) {
        logger.warn('Actor image file not found on disk', {
          actorId,
          path: actor.image_cache_path,
        });
        res.status(404).send('Image file not found');
        return;
      }

      // Determine content type from file extension
      const ext = path.extname(actor.image_cache_path).toLowerCase();
      const contentTypeMap: Record<string, string> = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.gif': 'image/gif',
      };

      const contentType = contentTypeMap[ext] || 'application/octet-stream';

      // Set headers for caching (1 year)
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

      // Stream the file
      const stream = fs.createReadStream(actor.image_cache_path);
      stream.pipe(res);

      stream.on('error', (error) => {
        logger.error('Error streaming actor image', {
          actorId,
          error: error.message,
        });
        if (!res.headersSent) {
          res.status(500).send('Error serving image');
        }
      });
    } catch (error) {
      logger.error('Failed to serve actor image', {
        actorId: req.params.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      next(error);
    }
  }
}
