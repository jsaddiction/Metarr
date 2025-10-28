import { Request, Response, NextFunction } from 'express';
import { MovieService } from '../../services/movieService.js';
import { FetchOrchestrator } from '../../services/providers/FetchOrchestrator.js';
import { ProviderCacheService } from '../../services/providerCacheService.js';
import { AssetSelectionService } from '../../services/assetSelectionService.js';
import { websocketBroadcaster } from '../../services/websocketBroadcaster.js';
import { logger } from '../../middleware/logging.js';
import { AssetType } from '../../types/providers/capabilities.js';
import { AssetCandidate } from '../../types/providers/requests.js';
import { getErrorMessage } from '../../utils/errorHandling.js';

// Import provider types for progress callbacks
interface ProgressCallback {
  onProviderStart?: (providerName: string) => void;
  onProviderComplete?: (providerName: string, success: boolean) => void;
  onProviderRetry?: (providerName: string, attempt: number, maxRetries: number) => void;
  onProviderTimeout?: (providerName: string) => void;
}

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
    private fetchOrchestrator: FetchOrchestrator,
    private providerCacheService: ProviderCacheService,
    private assetSelectionService?: AssetSelectionService
  ) {}

  /**
   * GET /api/movies/:id/provider-results
   * Scrape metadata and assets from all enabled providers
   *
   * Query params:
   * - force: boolean - Force fresh fetch (bypass cache)
   * - assetTypes: string - Comma-separated list of asset types
   *
   * This is the most complex endpoint with:
   * - Real-time WebSocket progress updates
   * - Multi-provider orchestration
   * - Asset recommendation generation
   * - Provider cache integration
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

      logger.info('Starting provider scrape', {
        movieId,
        movieTitle: movie.title,
        tmdbId: movie.tmdb_id,
        imdbId: movie.imdb_id,
        force,
      });

      // Parse asset types
      let assetTypes: AssetType[];
      if (assetTypesParam) {
        assetTypes = assetTypesParam.split(',').map((t) => t.trim() as AssetType);
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

      // Check cache freshness unless force=true
      if (!force) {
        const isStale = await this.providerCacheService.isCacheStale(movieId, 7);
        if (!isStale) {
          logger.info('Using cached provider data (fresh)', { movieId });
          // Return cached data instead of fetching
          // For now, we'll let it fetch anyway since the UI expects fresh results
          // In the future, we can return cached data here
        }
      } else {
        // Force refresh - clear existing cache
        logger.info('Force refresh requested, clearing cache', { movieId });
        await this.providerCacheService.clearMovieCache(movieId);
      }

      // Broadcast scrape start
      const enabledProviders = await this.getEnabledProviderNames();
      websocketBroadcaster.broadcastProviderScrapeStart(movieId, enabledProviders);

      // Fetch from all providers
      const providerResults = await this.fetchOrchestrator.fetchAllProviders(movie, 'movie', {
        priority: 'user',
        assetTypes,
        progressCallback,
      });

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
      const recommendations: Record<string, unknown> = {};

      if (this.assetSelectionService) {
        // Generate recommendations for each asset type that has candidates
        for (const assetType of assetTypes) {
          // Collect all assets of this type from all providers
          const providerAssets: AssetCandidate[] = [];
          const providerEntries = Object.values(providerResults.providers);
          for (const provider of providerEntries) {
            if (provider && provider.images?.[assetType]) {
              providerAssets.push(...provider.images[assetType]);
            }
          }

          if (providerAssets.length > 0) {
            // Get the highest scored asset (providers already score their assets)
            const sortedAssets = [...providerAssets].sort((a, b) => {
              const scoreA = (a as unknown as { score?: number }).score || 0;
              const scoreB = (b as unknown as { score?: number }).score || 0;
              return scoreB - scoreA;
            });

            recommendations[assetType] = {
              recommendedAsset: sortedAssets[0],
              confidence: sortedAssets[0] ? 'high' : 'none',
              reason: sortedAssets[0] ? 'Highest quality from provider' : 'No assets available',
              alternativeCount: sortedAssets.length - 1,
            };
          }
        }

        logger.debug('Generated asset recommendations', {
          movieId,
          assetTypes,
          recommendationCount: Object.keys(recommendations).length,
        });
      }

      // Save results to provider cache
      if (providerResults.metadata.completedProviders.length > 0) {
        try {
          // 1. Save metadata from all providers
          const mergedMetadata: Record<string, any> = {};
          for (const [providerName, providerData] of Object.entries(providerResults.providers)) {
            if (providerData?.metadata) {
              // Merge metadata from this provider
              Object.assign(mergedMetadata, providerData.metadata);
              logger.debug('Merged metadata from provider', {
                providerName,
                fieldCount: Object.keys(providerData.metadata).length,
              });
            }
          }

          if (Object.keys(mergedMetadata).length > 0) {
            await this.providerCacheService.saveMovieMetadata(movieId, mergedMetadata);
          }

          // 2. Save image assets
          for (const assetType of assetTypes) {
            // Collect all candidates for this asset type from all successful providers
            type CandidateRecord = {
              url: string;
              width?: number;
              height?: number;
              language?: string;
              provider_name: string;
              provider_score: number;
              provider_metadata: {
                votes?: number;
                voteAverage?: number;
              };
            };
            const candidates: CandidateRecord[] = [];

            for (const [providerName, providerData] of Object.entries(providerResults.providers)) {
              if (!providerData || !providerData.images?.[assetType]) continue;

              // Extract candidates from this provider
              for (const asset of providerData.images[assetType]) {
                candidates.push({
                  url: asset.url,
                  ...(asset.width !== undefined && { width: asset.width }),
                  ...(asset.height !== undefined && { height: asset.height }),
                  ...(asset.language !== undefined && { language: asset.language }),
                  provider_name: providerName,
                  provider_score: (asset as unknown as { score?: number }).score || 0,
                  provider_metadata: {
                    ...(asset.votes !== undefined && { votes: asset.votes }),
                    ...(asset.voteAverage !== undefined && { voteAverage: asset.voteAverage }),
                  },
                });
              }
            }

            // Save to cache (atomic replace)
            if (candidates.length > 0) {
              await this.providerCacheService.saveCandidates(movieId, 'movie', assetType, candidates);

              logger.debug('Saved provider results to cache', {
                movieId,
                assetType,
                candidateCount: candidates.length,
              });
            }
          }

          // 3. Save video assets (trailers, etc.) - store as special asset types
          for (const [providerName, providerData] of Object.entries(providerResults.providers)) {
            if (providerData?.videos) {
              for (const [videoType, videoList] of Object.entries(providerData.videos)) {
                const videoCandidates = videoList.map(video => ({
                  url: video.url,
                  provider_name: providerName,
                  provider_score: (video as any).score || 0,
                  provider_metadata: {
                    type: video.assetType,
                    site: (video as any).site,
                    key: (video as any).key,
                  },
                }));

                if (videoCandidates.length > 0) {
                  // Save videos as asset type 'trailer', 'featurette', etc.
                  await this.providerCacheService.saveCandidates(
                    movieId,
                    'movie',
                    videoType as any,
                    videoCandidates
                  );
                }
              }
            }
          }
        } catch (cacheError) {
          // Log but don't fail the request if cache save fails
          logger.error('Failed to save provider results to cache', {
            movieId,
            error: cacheError instanceof Error ? cacheError.message : 'Unknown error',
          });
        }
      }

      // Broadcast completion
      websocketBroadcaster.broadcastProviderScrapeComplete(
        movieId,
        providerResults.metadata.completedProviders,
        providerResults.metadata.failedProviders.map((f) => f.name),
        providerResults.metadata.timedOutProviders
      );

      // Build response
      const response = {
        movieId,
        movie,
        providers: providerResults.providers,
        recommendations,
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
        savedCount: result.savedAssets?.length || 0,
        errorCount: result.errors?.length || 0,
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
