import { Request, Response, NextFunction } from 'express';
import { MovieService } from '../services/movieService.js';
import { LibraryScanService } from '../services/libraryScanService.js';
import { websocketBroadcaster } from '../services/websocketBroadcaster.js';
import { FetchOrchestrator, ProgressCallback } from '../services/providers/FetchOrchestrator.js';
import { AssetType } from '../types/providers/capabilities.js';
import { AssetSelectionService } from '../services/assetSelectionService.js';
import { AssetCandidateService } from '../services/assetCandidateService.js';
import { logger } from '../middleware/logging.js';

export class MovieController {
  constructor(
    private movieService: MovieService,
    private scanService: LibraryScanService,
    private fetchOrchestrator?: FetchOrchestrator,
    private assetSelectionService?: AssetSelectionService,
    private assetCandidateService?: AssetCandidateService
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
      if (!this.fetchOrchestrator) {
        res.status(503).json({
          error: 'Provider scraping service not available',
          message: 'FetchOrchestrator not initialized',
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

      // Generate recommendations based on asset selection service
      const recommendations: Record<string, any> = {};

      if (this.assetSelectionService) {
        // Generate recommendations for each asset type that has candidates
        for (const assetType of assetTypes) {
          // Collect all assets of this type from all providers
          const providerAssets: any[] = [];
          const providerEntries = Object.values(providerResults.providers);
          for (const provider of providerEntries) {
            if (provider && provider.images?.[assetType]) {
              providerAssets.push(...provider.images[assetType]);
            }
          }

          if (providerAssets.length > 0) {
            // Get the highest scored asset (providers already score their assets)
            const sortedAssets = [...providerAssets].sort((a: any, b: any) => {
              const scoreA = a.score || 0;
              const scoreB = b.score || 0;
              return scoreB - scoreA;
            });

            recommendations[assetType] = {
              recommendedAsset: sortedAssets[0],
              confidence: sortedAssets[0] ? 'high' : 'none',
              reason: sortedAssets[0] ? 'Highest quality from provider' : 'No assets available',
              alternativeCount: sortedAssets.length - 1
            };
          }
        }

        logger.debug('Generated asset recommendations', {
          movieId,
          assetTypes,
          recommendationCount: Object.keys(recommendations).length
        });
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
   * Save asset selections for a movie
   * Endpoint: POST /api/movies/:id/assets
   * Body:
   * {
   *   selections: {
   *     poster: { provider: 'tmdb', url: '...', assetType: 'poster', metadata: {...} },
   *     fanart: { provider: 'tmdb', url: '...', assetType: 'fanart', metadata: {...} }
   *   },
   *   metadata?: { title: '...', year: 2023, ... },
   *   publish?: true
   * }
   */
  async saveAssets(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const movieId = parseInt(req.params.id);
      const { selections, metadata } = req.body;

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
        hasMetadata: !!metadata
      });

      // Delegate to MovieService for the actual work
      const result = await this.movieService.saveAssets(movieId, selections, metadata);

      // Broadcast WebSocket update for cross-tab sync
      websocketBroadcaster.broadcastMoviesUpdated([movieId]);

      // Return result
      res.status(200).json(result);

      logger.info('Asset save complete', {
        movieId,
        savedCount: result.savedAssets?.length || 0,
        errorCount: result.errors?.length || 0
      });

    } catch (error: any) {
      logger.error('Asset save failed', {
        movieId: req.params.id,
        error: error.message
      });
      next(error);
    }
  }

  /**
   * Toggle monitored status for a movie
   * Endpoint: POST /api/movies/:id/toggle-monitored
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
        newMonitoredStatus: result.monitored
      });

      res.json(result);
    } catch (error) {
      logger.error('Toggle monitored failed', {
        movieId: req.params.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      next(error);
    }
  }

  /**
   * Lock a field to prevent automation from modifying it
   * Endpoint: POST /api/movies/:id/lock-field
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
        fieldName
      });

      res.json(result);
    } catch (error) {
      logger.error('Lock field failed', {
        movieId: req.params.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      next(error);
    }
  }

  /**
   * Unlock a field to allow automation to modify it
   * Endpoint: POST /api/movies/:id/unlock-field
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
        fieldName
      });

      res.json(result);
    } catch (error) {
      logger.error('Unlock field failed', {
        movieId: req.params.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      next(error);
    }
  }

  /**
   * Reset all metadata locks and re-fetch from provider
   * Endpoint: POST /api/movies/:id/reset-metadata
   *
   * Unlocks all metadata fields and triggers re-enrichment.
   * Use this when user wants to discard their manual edits.
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
        movieTitle: movie.title
      });

      res.json(result);
    } catch (error) {
      logger.error('Reset metadata failed', {
        movieId: req.params.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      next(error);
    }
  }

  /**
   * Get asset candidates for a movie
   * Endpoint: GET /api/movies/:id/asset-candidates?type=poster
   * Query params:
   *   - type: 'poster' | 'fanart' | 'clearlogo' | etc.
   *   - includeBlocked: boolean (default: false) - Include blocked candidates
   *
   * Returns cached asset candidates with scores for instant browsing.
   */
  async getAssetCandidates(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const movieId = parseInt(req.params.id);
      const assetType = req.query.type as string;
      const includeBlocked = req.query.includeBlocked === 'true';

      // Check if service is available
      if (!this.assetCandidateService) {
        res.status(503).json({
          error: 'Asset candidate service not available',
          message: 'AssetCandidateService not initialized',
        });
        return;
      }

      // Validate parameters
      if (!assetType) {
        res.status(400).json({ error: 'type query parameter is required' });
        return;
      }

      // Validate movie exists
      const movie = await this.movieService.getById(movieId);
      if (!movie) {
        res.status(404).json({ error: 'Movie not found' });
        return;
      }

      // Get candidates
      const candidates = await this.assetCandidateService.getAssetCandidates(
        'movie',
        movieId,
        assetType,
        includeBlocked
      );

      res.json({ candidates });
    } catch (error) {
      logger.error('Get asset candidates failed', {
        movieId: req.params.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      next(error);
    }
  }

  /**
   * Select an asset candidate
   * Endpoint: POST /api/asset-candidates/:id/select
   * Body: { selectedBy?: 'user' | 'auto' }
   *
   * Marks candidate as selected, deselects all others of same type.
   */
  async selectAssetCandidate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const candidateId = parseInt(req.params.id);
      const { selectedBy = 'user' } = req.body;

      // Check if service is available
      if (!this.assetCandidateService) {
        res.status(503).json({
          error: 'Asset candidate service not available',
          message: 'AssetCandidateService not initialized',
        });
        return;
      }

      // Select the candidate
      const candidate = await this.assetCandidateService.selectAssetCandidate(candidateId, selectedBy);

      // Broadcast WebSocket update for cross-tab sync
      websocketBroadcaster.broadcastMoviesUpdated([candidate.entity_id]);

      logger.info('Selected asset candidate', {
        candidateId,
        entityId: candidate.entity_id,
        assetType: candidate.asset_type,
        provider: candidate.provider,
        selectedBy
      });

      res.json({ candidate });
    } catch (error) {
      logger.error('Select asset candidate failed', {
        candidateId: req.params.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      next(error);
    }
  }

  /**
   * Block an asset candidate (blacklist)
   * Endpoint: POST /api/asset-candidates/:id/block
   * Body: { blockedBy?: 'user' | 'auto' }
   *
   * Prevents candidate from being selected automatically.
   */
  async blockAssetCandidate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const candidateId = parseInt(req.params.id);
      const { blockedBy = 'user' } = req.body;

      // Check if service is available
      if (!this.assetCandidateService) {
        res.status(503).json({
          error: 'Asset candidate service not available',
          message: 'AssetCandidateService not initialized',
        });
        return;
      }

      // Block the candidate
      await this.assetCandidateService.blockAssetCandidate(candidateId, blockedBy);

      logger.info('Blocked asset candidate', {
        candidateId,
        blockedBy
      });

      res.json({ success: true });
    } catch (error) {
      logger.error('Block asset candidate failed', {
        candidateId: req.params.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      next(error);
    }
  }

  /**
   * Unblock an asset candidate
   * Endpoint: POST /api/asset-candidates/:id/unblock
   *
   * Removes blacklist, allows candidate to be selected again.
   */
  async unblockAssetCandidate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const candidateId = parseInt(req.params.id);

      // Check if service is available
      if (!this.assetCandidateService) {
        res.status(503).json({
          error: 'Asset candidate service not available',
          message: 'AssetCandidateService not initialized',
        });
        return;
      }

      // Unblock the candidate
      await this.assetCandidateService.unblockAssetCandidate(candidateId);

      logger.info('Unblocked asset candidate', {
        candidateId
      });

      res.json({ success: true });
    } catch (error) {
      logger.error('Unblock asset candidate failed', {
        candidateId: req.params.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      next(error);
    }
  }

  /**
   * Reset asset selection for a movie
   * Endpoint: POST /api/movies/:id/reset-asset
   * Body: { assetType: 'poster' | 'fanart' | etc. }
   *
   * Deselects all candidates for the specified asset type.
   */
  async resetAssetSelection(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const movieId = parseInt(req.params.id);
      const { assetType } = req.body;

      // Check if service is available
      if (!this.assetCandidateService) {
        res.status(503).json({
          error: 'Asset candidate service not available',
          message: 'AssetCandidateService not initialized',
        });
        return;
      }

      // Validate parameters
      if (!assetType) {
        res.status(400).json({ error: 'assetType is required' });
        return;
      }

      // Validate movie exists
      const movie = await this.movieService.getById(movieId);
      if (!movie) {
        res.status(404).json({ error: 'Movie not found' });
        return;
      }

      // Reset selection
      await this.assetCandidateService.resetAssetSelection('movie', movieId, assetType);

      // Broadcast WebSocket update for cross-tab sync
      websocketBroadcaster.broadcastMoviesUpdated([movieId]);

      logger.info('Reset asset selection', {
        movieId,
        movieTitle: movie.title,
        assetType
      });

      res.json({ success: true });
    } catch (error) {
      logger.error('Reset asset selection failed', {
        movieId: req.params.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      next(error);
    }
  }
}
