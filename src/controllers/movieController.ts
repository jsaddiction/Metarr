import { Request, Response, NextFunction } from 'express';
import { MovieService } from '../services/movieService.js';
import { LibraryScanService } from '../services/libraryScanService.js';
import { websocketBroadcaster } from '../services/websocketBroadcaster.js';
import { FetchOrchestrator, ProgressCallback } from '../services/providers/FetchOrchestrator.js';
import { AutoSelectionService } from '../services/autoSelectionService.js';
import { AssetSaveService } from '../services/assetSaveService.js';
import { AssetType } from '../types/providers/capabilities.js';
import { logger } from '../middleware/logging.js';

export class MovieController {
  private assetSaveService?: AssetSaveService;

  constructor(
    private movieService: MovieService,
    private scanService: LibraryScanService,
    private fetchOrchestrator?: FetchOrchestrator,
    private autoSelectionService?: AutoSelectionService
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

  async getExtras(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const movieId = parseInt(req.params.id);
      const extras = await this.movieService.getExtras(movieId);
      res.json(extras);
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

  /**
   * Get provider results for a movie (scrape from all enabled providers)
   * Endpoint: GET /api/movies/:id/provider-results
   * Query params:
   *   - force: boolean - Force fresh fetch (bypass cache if implemented)
   *   - assetTypes: string - Comma-separated list of asset types
   */
  async getProviderResults(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const movieId = parseInt(req.params.id);
      const force = req.query.force === 'true';
      const assetTypesParam = req.query.assetTypes as string | undefined;

      // Check if dependencies are available
      if (!this.fetchOrchestrator || !this.autoSelectionService) {
        res.status(503).json({
          error: 'Provider scraping service not available',
          message: 'FetchOrchestrator or AutoSelectionService not initialized',
        });
        return;
      }

      // Validate movie exists
      const movie = await this.movieService.getById(movieId);
      if (!movie) {
        res.status(404).json({ error: 'Movie not found' });
        return;
      }

      logger.info('Starting provider scrape', {
        movieId,
        movieTitle: movie.title,
        tmdbId: movie.tmdbId,
        imdbId: movie.imdbId,
        force
      });

      // Parse asset types
      let assetTypes: AssetType[];
      if (assetTypesParam) {
        assetTypes = assetTypesParam.split(',').map(t => t.trim() as AssetType);
      } else {
        // Default to common asset types
        assetTypes = ['poster', 'fanart', 'banner', 'clearlogo', 'clearart'];
      }

      // Create progress callback that broadcasts WebSocket updates
      const progressCallback: ProgressCallback = {
        onProviderStart: (providerName: string) => {
          logger.debug('Provider fetch started', { movieId, provider: providerName });
          websocketBroadcaster.broadcastProviderScrapeProviderStart(movieId, providerName);
        },
        onProviderComplete: (providerName: string, success: boolean) => {
          logger.debug('Provider fetch completed', { movieId, provider: providerName, success });
          websocketBroadcaster.broadcastProviderScrapeProviderComplete(movieId, providerName, success);
        },
        onProviderRetry: (providerName: string, attempt: number, maxRetries: number) => {
          logger.debug('Provider fetch retry', { movieId, provider: providerName, attempt, maxRetries });
          websocketBroadcaster.broadcastProviderScrapeProviderRetry(movieId, providerName, attempt, maxRetries);
        },
        onProviderTimeout: (providerName: string) => {
          logger.warn('Provider fetch timeout', { movieId, provider: providerName });
          websocketBroadcaster.broadcastProviderScrapeProviderTimeout(movieId, providerName);
        },
      };

      // Broadcast scrape start
      const enabledProviders = await this.getEnabledProviderNames();
      websocketBroadcaster.broadcastProviderScrapeStart(movieId, enabledProviders);

      // Fetch from all providers
      const providerResults = await this.fetchOrchestrator.fetchAllProviders(
        movie,
        'movie',
        {
          priority: 'user',
          assetTypes,
          progressCallback,
        }
      );

      // Check if all providers failed
      if (providerResults.allFailed) {
        websocketBroadcaster.broadcastProviderScrapeError(movieId, 'All providers failed');
        res.status(500).json({
          error: 'All providers failed',
          movieId,
          movie,
          providers: providerResults.providers,
          metadata: {
            ...providerResults.metadata,
            fetchedAt: providerResults.metadata.fetchedAt.toISOString(),
          },
        });
        return;
      }

      // Auto-selection for webhook/automated workflows only
      // User-initiated searches let the user pick manually
      let recommendations: any = {};
      const isAutomated = force || req.query.force === 'true'; // Webhook or background job

      if (isAutomated && this.autoSelectionService) {
        // Convert provider results for auto-selection
        const assetCandidatesByProvider: import('../services/autoSelectionService.js').AssetCandidatesByProvider = {};

        for (const [providerName, assets] of Object.entries(providerResults.providers)) {
          if (!assets || !assets.images) continue;

          const candidates: import('../types/providers/requests.js').AssetCandidate[] = [];

          // Flatten all image categories into single array
          for (const assetList of Object.values(assets.images)) {
            if (Array.isArray(assetList)) {
              candidates.push(...assetList);
            }
          }

          if (candidates.length > 0) {
            assetCandidatesByProvider[providerName] = candidates;
          }
        }

        try {
          const selectedAssets = await this.autoSelectionService.selectBestAssets(
            assetCandidatesByProvider,
            'movie',
            {
              respectLocks: false,
              preferredLanguage: 'en',
            }
          );

          // Convert to recommendations format
          recommendations = selectedAssets.reduce((acc, selected) => {
            acc[selected.assetType] = {
              asset: selected.asset,
              provider: selected.providerName,
              score: selected.score,
              reason: selected.reason,
            };
            return acc;
          }, {} as Record<string, any>);

          logger.info('Auto-selected assets for automated workflow', {
            movieId,
            assetCount: Object.keys(recommendations).length,
          });
        } catch (error) {
          logger.error('Auto-selection failed', { error, movieId });
          // Continue without recommendations
        }
      }

      // Broadcast completion
      websocketBroadcaster.broadcastProviderScrapeComplete(
        movieId,
        providerResults.metadata.completedProviders,
        providerResults.metadata.failedProviders.map(f => f.name),
        providerResults.metadata.timedOutProviders
      );

      // Build response
      const response = {
        movieId,
        movie,
        providers: providerResults.providers,
        recommendations, // Only populated for automated workflows
        metadata: {
          fetchedAt: providerResults.metadata.fetchedAt.toISOString(),
          completedProviders: providerResults.metadata.completedProviders,
          failedProviders: providerResults.metadata.failedProviders,
          timedOutProviders: providerResults.metadata.timedOutProviders,
        },
      };

      // Return 206 Partial Content if some providers failed but at least one succeeded
      const hasPartialFailure =
        providerResults.metadata.failedProviders.length > 0 ||
        providerResults.metadata.timedOutProviders.length > 0;

      if (hasPartialFailure) {
        res.status(206).json(response);
      } else {
        res.status(200).json(response);
      }

      logger.info('Provider scrape completed', {
        movieId,
        completed: providerResults.metadata.completedProviders.length,
        failed: providerResults.metadata.failedProviders.length,
        timedOut: providerResults.metadata.timedOutProviders.length,
      });
    } catch (error) {
      logger.error('Provider scrape error', { error, movieId: req.params.id });

      const movieId = parseInt(req.params.id);
      websocketBroadcaster.broadcastProviderScrapeError(
        movieId,
        error instanceof Error ? error.message : 'Unknown error'
      );

      next(error);
    }
  }

  /**
   * Helper: Get enabled provider names
   */
  private async getEnabledProviderNames(): Promise<string[]> {
    // This is a placeholder - we'll need to access ProviderConfigService
    // For now, return common providers
    return ['tmdb', 'fanart_tv', 'tvdb'];
  }

  /**
   * Initialize asset save service (lazy initialization)
   */
  private getAssetSaveService(db: any): AssetSaveService {
    if (!this.assetSaveService) {
      this.assetSaveService = new AssetSaveService(db);
      this.assetSaveService.initialize().catch(err =>
        logger.error('Failed to initialize asset save service:', err)
      );
    }
    return this.assetSaveService;
  }

  /**
   * Save asset selections for a movie
   * Endpoint: POST /api/movies/:id/assets
   * Body:
   * {
   *   selections: {
   *     poster: { provider: 'tmdb', url: '...', assetType: 'poster', metadata: {...} },
   *     fanart: { provider: 'tmdb', url: '...', assetType: 'fanart', metadata: {...} }
   *   },
   *   metadata?: { title: '...', year: 2023, ... },
   *   unlocks?: ['clearlogo', 'banner'],
   *   publish?: true
   * }
   */
  async saveAssets(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const movieId = parseInt(req.params.id);
      const { selections, metadata, unlocks, publish } = req.body;

      // Validate request
      if (!selections || typeof selections !== 'object') {
        res.status(400).json({
          error: 'Invalid request',
          message: 'selections object is required'
        });
        return;
      }

      // Validate movie exists
      const movie = await this.movieService.getById(movieId);
      if (!movie) {
        res.status(404).json({ error: 'Movie not found' });
        return;
      }

      logger.info('Saving asset selections', {
        movieId,
        assetCount: Object.keys(selections).length,
        hasMetadata: !!metadata,
        unlockCount: unlocks?.length || 0,
        publish: !!publish
      });

      // Get database connection from movieService
      const db = (this.movieService as any).db?.getConnection();
      if (!db) {
        res.status(500).json({ error: 'Database connection not available' });
        return;
      }

      // Process asset save
      const assetSaveService = this.getAssetSaveService(db);
      const result = await assetSaveService.saveMovieAssets(movieId, {
        selections,
        metadata,
        unlocks,
        publish,
      });

      // Broadcast WebSocket update for cross-tab sync
      websocketBroadcaster.broadcastMoviesUpdated([movieId]);

      // Return result
      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }

      logger.info('Asset save complete', {
        movieId,
        success: result.success,
        savedCount: result.savedAssets.length,
        errorCount: result.errors.length
      });

    } catch (error: any) {
      logger.error('Asset save failed', {
        movieId: req.params.id,
        error: error.message
      });
      next(error);
    }
  }
}
