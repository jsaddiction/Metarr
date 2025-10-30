import { Request, Response, NextFunction } from 'express';
import { MovieService } from '../../services/movieService.js';
import { ProviderCacheManager } from '../../services/providers/ProviderCacheManager.js';
import { websocketBroadcaster } from '../../services/websocketBroadcaster.js';
import { logger } from '../../middleware/logging.js';

/**
 * MovieAssetController
 *
 * Handles all asset-related operations for movies:
 * - Get asset candidates from provider cache
 * - Get current assets by type
 * - Replace all assets of a type (atomic operation)
 * - Add single asset
 * - Remove single asset
 * - Toggle asset type lock
 * - Select/block/unblock asset candidates
 * - Reset asset selection
 *
 * Separated from MovieController to follow Single Responsibility Principle.
 * This controller focuses exclusively on asset management and selection.
 */
export class MovieAssetController {
  constructor(
    private movieService: MovieService,
    private providerCacheManager: ProviderCacheManager
  ) {}

  /**
   * GET /api/movies/:id/asset-candidates?type=poster
   * Get cached asset candidates from provider_assets table
   *
   * Cache is populated by:
   * - User-initiated provider fetches (getProviderResults)
   * - Automated enrichment jobs
   * - Weekly scheduled refreshes
   */
  async getAssetCandidates(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const movieId = parseInt(req.params.id);
      const assetType = req.query.type as string;

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

      // Get cached candidates from unified ProviderCacheManager
      const cachedAssets = await this.providerCacheManager.getCachedAssets({
        entityType: 'movie',
        entityId: movieId,
        assetType: assetType as any, // Query param - validated by provider
      });

      // Map to frontend-compatible format
      const candidates = cachedAssets.map((asset) => ({
        id: asset.id, // For React keys
        provider: asset.provider_name,
        url: asset.url,
        width: asset.width,
        height: asset.height,
        language: asset.language,
        vote_count: asset.provider_metadata?.votes,
        vote_average: asset.provider_metadata?.voteAverage,
        score: asset.score,
        analyzed: asset.analyzed,
        is_selected: asset.is_selected,
        // Additional fields for compatibility
        providerId: asset.provider_name as any,
        providerResultId: asset.id.toString(),
        assetType: assetType as any,
      }));

      // Calculate cache metadata
      const providers = [...new Set(cachedAssets.map((a) => a.provider_name))];
      const newestFetchedAt = cachedAssets.length > 0
        ? cachedAssets.reduce((newest, asset) =>
            asset.fetched_at > newest ? asset.fetched_at : newest,
            cachedAssets[0].fetched_at
          )
        : null;

      res.json({
        candidates,
        cached: candidates.length > 0,
        metadata: candidates.length > 0
          ? {
              count: candidates.length,
              providers,
              cachedAt: newestFetchedAt,
            }
          : null,
      });
    } catch (error) {
      logger.error('Get asset candidates failed', {
        movieId: req.params.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      next(error);
    }
  }

  /**
   * GET /api/movies/:id/assets/:assetType
   * Get all assets of a specific type for slot-based UI
   */
  async getAssetsByType(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const movieId = parseInt(req.params.id);
      const assetType = req.params.assetType;

      // Validate movie exists
      const movie = await this.movieService.getById(movieId);
      if (!movie) {
        res.status(404).json({ error: 'Movie not found' });
        return;
      }

      // Get assets
      const assets = await this.movieService.getAssetsByType(movieId, assetType);

      res.json({ assets });
    } catch (error) {
      logger.error('Get assets by type failed', {
        movieId: req.params.id,
        assetType: req.params.assetType,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      next(error);
    }
  }

  /**
   * PUT /api/movies/:id/assets/:assetType
   * Replace all assets of a specific type (atomic operation)
   *
   * This smart endpoint:
   * 1. Validates aspect ratios and dimensions
   * 2. Checks asset limits
   * 3. Removes old assets not in new selection
   * 4. Adds new assets not in current selection
   * 5. Returns intelligent error messages
   */
  async replaceAssets(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const movieId = parseInt(req.params.id);
      const assetType = req.params.assetType;
      const { assets } = req.body;

      // Validate required fields
      if (!Array.isArray(assets)) {
        res.status(400).json({ error: 'assets array is required' });
        return;
      }

      // Validate movie exists
      const movie = await this.movieService.getById(movieId);
      if (!movie) {
        res.status(404).json({ error: 'Movie not found' });
        return;
      }

      // Replace the assets (manual user edit - no lock check needed)
      const result = await this.movieService.replaceAssets(movieId, assetType, assets);

      // Broadcast WebSocket update for cross-tab sync
      websocketBroadcaster.broadcastMoviesUpdated([movieId]);

      logger.info('Replaced assets for movie', {
        movieId,
        assetType,
        newCount: result.added,
        removedCount: result.removed,
        keptCount: result.kept,
      });

      res.json(result);
    } catch (error) {
      logger.error('Replace assets failed', {
        movieId: req.params.id,
        assetType: req.params.assetType,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      next(error);
    }
  }

  /**
   * POST /api/movies/:id/assets/:assetType/add
   * Add a single asset to a movie
   */
  async addAsset(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const movieId = parseInt(req.params.id);
      const assetType = req.params.assetType;
      const assetData = req.body;

      // Validate required fields
      if (!assetData.url || !assetData.provider) {
        res.status(400).json({ error: 'url and provider are required' });
        return;
      }

      // Validate movie exists
      const movie = await this.movieService.getById(movieId);
      if (!movie) {
        res.status(404).json({ error: 'Movie not found' });
        return;
      }

      // Add the asset
      const result = await this.movieService.addAsset(movieId, assetType, assetData);

      // Broadcast WebSocket update for cross-tab sync
      websocketBroadcaster.broadcastMoviesUpdated([movieId]);

      logger.info('Added asset to movie', {
        movieId,
        assetType,
        provider: assetData.provider,
        imageFileId: result.imageFileId,
      });

      res.json(result);
    } catch (error) {
      logger.error('Add asset failed', {
        movieId: req.params.id,
        assetType: req.params.assetType,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      next(error);
    }
  }

  /**
   * DELETE /api/movies/:id/assets/:imageFileId
   * Remove a single asset from a movie
   */
  async removeAsset(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const movieId = parseInt(req.params.id);
      const imageFileId = parseInt(req.params.imageFileId);

      // Validate movie exists
      const movie = await this.movieService.getById(movieId);
      if (!movie) {
        res.status(404).json({ error: 'Movie not found' });
        return;
      }

      // Remove the asset
      const result = await this.movieService.removeAsset(movieId, imageFileId);

      // Broadcast WebSocket update for cross-tab sync
      websocketBroadcaster.broadcastMoviesUpdated([movieId]);

      logger.info('Removed asset from movie', {
        movieId,
        imageFileId,
      });

      res.json(result);
    } catch (error) {
      logger.error('Remove asset failed', {
        movieId: req.params.id,
        imageFileId: req.params.imageFileId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      next(error);
    }
  }

  /**
   * PATCH /api/movies/:id/assets/:assetType/lock
   * Toggle asset type lock for a movie
   */
  async toggleAssetLock(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const movieId = parseInt(req.params.id);
      const assetType = req.params.assetType;
      const { locked } = req.body;

      // Validate parameters
      if (typeof locked !== 'boolean') {
        res.status(400).json({ error: 'locked must be a boolean' });
        return;
      }

      // Validate movie exists
      const movie = await this.movieService.getById(movieId);
      if (!movie) {
        res.status(404).json({ error: 'Movie not found' });
        return;
      }

      // Toggle the lock
      const result = await this.movieService.toggleAssetLock(movieId, assetType, locked);

      // Broadcast WebSocket update for cross-tab sync
      websocketBroadcaster.broadcastMoviesUpdated([movieId]);

      logger.info('Toggled asset lock', {
        movieId,
        assetType,
        locked,
      });

      res.json(result);
    } catch (error) {
      logger.error('Toggle asset lock failed', {
        movieId: req.params.id,
        assetType: req.params.assetType,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      next(error);
    }
  }

  /**
   * POST /api/asset-candidates/:id/select
   * Select an asset candidate
   *
   * NOTE: This endpoint uses AssetCandidateService which is being deprecated
   * in favor of the cache-aside pattern. Consider this method for future removal.
   */
  async selectAssetCandidate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(410).json({
        error: 'Asset candidate selection is deprecated',
        message: 'Use the cache-aside pattern with provider_cache_assets table instead',
      });
    } catch (error) {
      logger.error('Failed to select asset candidate', {
        candidateId: req.params.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      next(error);
    }
  }

  /**
   * POST /api/asset-candidates/:id/block
   * Block an asset candidate
   *
   * NOTE: This endpoint uses AssetCandidateService which is being deprecated
   * in favor of the cache-aside pattern. Consider this method for future removal.
   */
  async blockAssetCandidate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(410).json({
        error: 'Asset candidate blocking is deprecated',
        message: 'Use the cache-aside pattern with provider_cache_assets table instead',
      });
    } catch (error) {
      logger.error('Failed to block asset candidate', {
        candidateId: req.params.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      next(error);
    }
  }

  /**
   * POST /api/asset-candidates/:id/unblock
   * Unblock an asset candidate
   *
   * NOTE: This endpoint uses AssetCandidateService which is being deprecated
   * in favor of the cache-aside pattern. Consider this method for future removal.
   */
  async unblockAssetCandidate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(410).json({
        error: 'Asset candidate unblocking is deprecated',
        message: 'Use the cache-aside pattern with provider_cache_assets table instead',
      });
    } catch (error) {
      logger.error('Failed to unblock asset candidate', {
        candidateId: req.params.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      next(error);
    }
  }

  /**
   * POST /api/movies/:id/reset-asset
   * Reset asset selection for a movie
   *
   * NOTE: This endpoint uses AssetCandidateService which is being deprecated
   * in favor of the cache-aside pattern. Consider this method for future removal.
   */
  async resetAssetSelection(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { assetType } = req.body;

      if (!assetType) {
        res.status(400).json({ error: 'assetType is required' });
        return;
      }

      res.status(410).json({
        error: 'Asset selection reset is deprecated',
        message: 'Use the cache-aside pattern with provider_cache_assets table instead',
      });
    } catch (error) {
      logger.error('Failed to reset asset selection', {
        movieId: req.params.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      next(error);
    }
  }
}
