import { Request, Response, NextFunction } from 'express';
import { MovieService } from '../../services/movieService.js';
import { ProviderCacheManager } from '../../services/providers/ProviderCacheManager.js';
import { websocketBroadcaster } from '../../services/websocketBroadcaster.js';
import { logger } from '../../middleware/logging.js';
import { AssetType } from '../../types/providers/capabilities.js';
import { getErrorMessage } from '../../utils/errorHandling.js';

/**
 * MovieProviderController
 *
 * Handles provider integration operations for movies:
 * - Fetch metadata and assets from external providers (TMDB, Fanart.tv, etc.)
 * - Search providers for movie identification
 * - Identify movie with specific provider result
 * - Save asset selections to cache and library
 *
 * Separated from MovieController to follow Single Responsibility Principle.
 * This controller focuses exclusively on external provider interactions.
 */
export class MovieProviderController {
  constructor(
    private movieService: MovieService,
    private providerCacheManager: ProviderCacheManager
  ) {}

  /**
   * GET /api/movies/:id/provider-results
   * Fetch metadata and assets from providers with intelligent caching
   *
   * Query params:
   * - force: boolean - Force fresh fetch (bypass 7-day cache)
   * - assetTypes: string - Comma-separated list of asset types
   *
   * Uses ProviderCacheManager for unified caching:
   * - Cache HIT (< 7 days) → Returns instantly
   * - Cache MISS/force=true → Fetches from network + saves cache
   */
  async getProviderResults(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const movieId = parseInt(req.params.id);
      const force = req.query.force === 'true';
      const assetTypesParam = req.query.assetTypes as string | undefined;

      // Validate movie exists
      const movie = await this.movieService.getById(movieId);
      if (!movie) {
        res.status(404).json({ error: 'Movie not found' });
        return;
      }

      logger.info('Provider fetch request', {
        movieId,
        movieTitle: movie.title,
        tmdbId: movie.tmdb_id,
        force,
      });

      // Parse asset types
      let assetTypes: AssetType[] | undefined;
      if (assetTypesParam) {
        assetTypes = assetTypesParam.split(',').map((t) => t.trim() as AssetType);
      }

      // Broadcast start (get provider names for UI)
      const enabledProviders = await this.getEnabledProviderNames();
      websocketBroadcaster.broadcastProviderScrapeStart(movieId, enabledProviders);

      // Call unified ProviderCacheManager
      const result = await this.providerCacheManager.fetchAssets({
        entityType: 'movie',
        entityId: movieId,
        externalIds: {
          tmdb_id: typeof movie.tmdb_id === 'number' ? movie.tmdb_id : undefined,
          imdb_id: typeof movie.imdb_id === 'string' ? movie.imdb_id : undefined,
        },
        assetTypes: assetTypes || undefined,
        force,
        priority: 'user',
      });

      // Broadcast completion
      websocketBroadcaster.broadcastProviderScrapeComplete(
        movieId,
        result.metadata.completedProviders,
        result.metadata.failedProviders.map((f) => f.name),
        result.metadata.timedOutProviders
      );

      // Build response
      const response = {
        movieId,
        movie,
        providers: result.providers,
        cached: result.cached,
        cacheAge: result.cacheAge,
        recommendations: {}, // TODO: Implement recommendations from ProviderAssetsRepository
        metadata: {
          fetchedAt: result.metadata.fetchedAt.toISOString(),
          completedProviders: result.metadata.completedProviders,
          failedProviders: result.metadata.failedProviders,
          timedOutProviders: result.metadata.timedOutProviders,
        },
      };

      // Return 206 Partial Content if some providers failed
      const hasPartialFailure =
        result.metadata.failedProviders.length > 0 ||
        result.metadata.timedOutProviders.length > 0;

      if (hasPartialFailure) {
        res.status(206).json(response);
      } else {
        res.status(200).json(response);
      }

      logger.info('Provider fetch complete', {
        movieId,
        cached: result.cached,
        cacheAge: result.cacheAge,
        completed: result.metadata.completedProviders.length,
        failed: result.metadata.failedProviders.length,
      });
    } catch (error) {
      logger.error('Provider fetch error', { error, movieId: req.params.id });

      const movieId = parseInt(req.params.id);
      websocketBroadcaster.broadcastProviderScrapeError(
        movieId,
        error instanceof Error ? getErrorMessage(error) : 'Unknown error'
      );

      next(error);
    }
  }

  /**
   * POST /api/movies/:id/assets
   * Save asset selections for a movie
   *
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
          message: 'selections object is required',
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
      });

      // Delegate to MovieService for the actual work
      const result = await this.movieService.saveAssets(movieId, selections, metadata);

      // Broadcast WebSocket update for cross-tab sync
      websocketBroadcaster.broadcastMoviesUpdated([movieId]);

      // Return result
      res.status(200).json(result);

      logger.info('Asset save complete', {
        movieId,
        savedCount: Array.isArray(result.savedAssets) ? result.savedAssets.length : 0,
        errorCount: Array.isArray(result.errors) ? result.errors.length : 0,
      });
    } catch (error) {
      logger.error('Asset save failed', {
        movieId: req.params.id,
        error: getErrorMessage(error),
      });
      next(error);
    }
  }

  /**
   * POST /api/movies/:id/search-tmdb
   * Search TMDB for movie identification
   *
   * Body: { query: string, year?: number }
   */
  async searchForIdentification(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const movieId = parseInt(req.params.id);
      const { query, year } = req.body;

      // Validate request
      if (!query) {
        res.status(400).json({ error: 'query is required' });
        return;
      }

      // Validate movie exists
      const movie = await this.movieService.getById(movieId);
      if (!movie) {
        res.status(404).json({ error: 'Movie not found' });
        return;
      }

      logger.info('Searching TMDB for identification', {
        movieId,
        query,
        year,
      });

      // Call service method
      const results = await this.movieService.searchForIdentification(movieId, query, year);

      res.json({ results });
    } catch (error) {
      logger.error('Search for identification failed', {
        movieId: req.params.id,
        error: error instanceof Error ? getErrorMessage(error) : 'Unknown error',
      });
      next(error);
    }
  }

  /**
   * POST /api/movies/:id/identify
   * Assign TMDB ID to movie
   *
   * Body: { tmdbId: number, title: string, year?: number, imdbId?: string }
   *
   * Updates movie with provider IDs and sets identification_status to 'identified'
   */
  async identifyMovie(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const movieId = parseInt(req.params.id);
      const { tmdbId, title, year, imdbId } = req.body;

      // Validate request
      if (!tmdbId || !title) {
        res.status(400).json({ error: 'tmdbId and title are required' });
        return;
      }

      // Validate movie exists
      const movie = await this.movieService.getById(movieId);
      if (!movie) {
        res.status(404).json({ error: 'Movie not found' });
        return;
      }

      logger.info('Identifying movie', {
        movieId,
        tmdbId,
        title,
        year,
      });

      // Call service method
      const result = await this.movieService.identifyMovie(movieId, { tmdbId, title, year, imdbId });

      // Broadcast WebSocket update
      websocketBroadcaster.broadcastMoviesUpdated([movieId]);

      res.json(result);
    } catch (error) {
      logger.error('Identify movie failed', {
        movieId: req.params.id,
        error: error instanceof Error ? getErrorMessage(error) : 'Unknown error',
      });
      next(error);
    }
  }

  /**
   * Helper: Get enabled provider names from configuration
   * TODO: Access ProviderConfigService for actual enabled providers
   */
  private async getEnabledProviderNames(): Promise<string[]> {
    // Placeholder - return common providers
    return ['tmdb', 'fanart_tv', 'tvdb'];
  }
}
