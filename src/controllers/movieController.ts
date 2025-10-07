import { Request, Response, NextFunction } from 'express';
import { MovieService } from '../services/movieService.js';
import { LibraryScanService } from '../services/libraryScanService.js';
import { websocketBroadcaster } from '../services/websocketBroadcaster.js';

export class MovieController {
  constructor(
    private movieService: MovieService,
    private scanService: LibraryScanService
  ) {}

  async getAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const filters: any = {};

      if (req.query.status) filters.status = req.query.status as string;
      if (req.query.libraryId) filters.libraryId = parseInt(req.query.libraryId as string);
      if (req.query.limit) filters.limit = parseInt(req.query.limit as string);
      if (req.query.offset) filters.offset = parseInt(req.query.offset as string);

      const result = await this.movieService.getAll(filters);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const movieId = parseInt(req.params.id);
      const movie = await this.movieService.getById(movieId);

      if (!movie) {
        res.status(404).json({ error: 'Movie not found' });
        return;
      }

      res.json(movie);
    } catch (error) {
      next(error);
    }
  }

  async getUnknownFiles(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const movieId = parseInt(req.params.id);
      const unknownFiles = await this.movieService.getUnknownFiles(movieId);
      res.json({ unknownFiles });
    } catch (error) {
      next(error);
    }
  }

  async assignUnknownFile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const movieId = parseInt(req.params.id);
      const fileId = parseInt(req.params.fileId);
      const { fileType } = req.body;

      const result = await this.movieService.assignUnknownFile(movieId, fileId, fileType);

      // Broadcast WebSocket update for cross-tab sync (movie assets changed)
      websocketBroadcaster.broadcastMoviesUpdated([movieId]);

      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async ignoreUnknownFile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const movieId = parseInt(req.params.id);
      const fileId = parseInt(req.params.fileId);

      const result = await this.movieService.ignoreUnknownFile(movieId, fileId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async deleteUnknownFile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const movieId = parseInt(req.params.id);
      const fileId = parseInt(req.params.fileId);

      const result = await this.movieService.deleteUnknownFile(movieId, fileId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async rebuildAssets(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const movieId = parseInt(req.params.id);
      const result = await this.movieService.rebuildMovieAssets(movieId);

      // Broadcast WebSocket update for cross-tab sync (movie assets rebuilt)
      websocketBroadcaster.broadcastMoviesUpdated([movieId]);

      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async verifyAssets(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const movieId = parseInt(req.params.id);
      const result = await this.movieService.verifyMovieAssets(movieId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async getImages(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const movieId = parseInt(req.params.id);
      const images = await this.movieService.getImages(movieId);

      // Add cache_url for frontend display
      const imagesWithUrl = images.map(img => ({
        ...img,
        cache_url: `/api/images/${img.id}/file`
      }));

      res.json({ images: imagesWithUrl });
    } catch (error) {
      next(error);
    }
  }

  async refreshMovie(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const movieId = parseInt(req.params.id);
      const result = await this.movieService.refreshMovie(movieId);

      // Broadcast WebSocket update for cross-tab sync (movie refreshed from provider)
      websocketBroadcaster.broadcastMoviesUpdated([movieId]);

      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async updateMetadata(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const movieId = parseInt(req.params.id);
      const metadata = req.body;

      const result = await this.movieService.updateMetadata(movieId, metadata);

      // Broadcast WebSocket update to all connected clients for cross-tab sync
      websocketBroadcaster.broadcastMoviesUpdated([movieId]);

      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  streamMovieUpdates(req: Request, res: Response): void {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Send initial comment to establish connection
    res.write(': connected\n\n');

    // Batch movie updates to avoid overwhelming the client
    let movieAddedBatch: number[] = [];
    let batchTimer: NodeJS.Timeout | null = null;

    const flushBatch = async () => {
      if (movieAddedBatch.length === 0) return;

      try {
        // Fetch all movies in batch
        const result = await this.movieService.getAll({});
        const movies = result.movies.filter(m => movieAddedBatch.includes(m.id));

        if (movies.length > 0) {
          res.write(`event: moviesAdded\ndata: ${JSON.stringify(movies)}\n\n`);
        }

        movieAddedBatch = [];
      } catch (error) {
        console.error('Error sending batch movie update:', error);
      }
    };

    const handleMovieAdded = (movieId: number) => {
      movieAddedBatch.push(movieId);

      // Clear existing timer
      if (batchTimer) {
        clearTimeout(batchTimer);
      }

      // Flush batch after 500ms of no new additions
      batchTimer = setTimeout(() => {
        flushBatch();
        batchTimer = null;
      }, 500);
    };

    const handleMovieUpdated = async (movieId: number) => {
      try {
        const result = await this.movieService.getAll({});
        const movie = result.movies.find(m => m.id === movieId);
        if (movie) {
          res.write(`event: movieUpdated\ndata: ${JSON.stringify(movie)}\n\n`);
        }
      } catch (error) {
        console.error('Error sending movie update:', error);
      }
    };

    const handleMovieRemoved = (movieId: number) => {
      res.write(`event: movieRemoved\ndata: ${JSON.stringify({ id: movieId })}\n\n`);
    };

    // Subscribe to scan service events
    this.scanService.on('movieAdded', handleMovieAdded);
    this.scanService.on('movieUpdated', handleMovieUpdated);
    this.scanService.on('movieRemoved', handleMovieRemoved);

    // Cleanup on client disconnect
    req.on('close', () => {
      if (batchTimer) {
        clearTimeout(batchTimer);
      }
      this.scanService.off('movieAdded', handleMovieAdded);
      this.scanService.off('movieUpdated', handleMovieUpdated);
      this.scanService.off('movieRemoved', handleMovieRemoved);
    });
  }
}
