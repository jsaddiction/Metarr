/**
 * ProviderCacheManager
 *
 * SINGLE SOURCE OF TRUTH for all provider interactions.
 * Unified cache layer wrapping FetchOrchestrator.
 *
 * Responsibilities:
 * 1. fetchAssets()       - Get metadata & assets with intelligent 7-day caching
 * 2. search()            - Search providers for identification (NOT cached)
 * 3. getCachedAssets()   - Read cached assets for UI display (READ-ONLY)
 *
 * Cache Strategy:
 * - All fetched assets saved to provider_assets table
 * - 7-day TTL: automation reuses cache if < 7 days old
 * - force=true: always bypasses cache and fetches fresh
 * - Cache organized by: entity_type, entity_id, asset_type, provider_name
 *
 * Used By:
 * - MovieProviderController (UI manual actions)
 * - EnrichmentService (automation jobs)
 * - MovieAssetController (asset browser UI)
 * - MovieWorkflowService (search for identification)
 * - ScheduledJobHandlers (weekly provider updates)
 *
 * Architecture:
 * ┌──────────────────────────────┐
 * │  ProviderCacheManager        │ ← All consumers call this
 * │  (Cache + Routing Logic)     │
 * └──────────┬───────────────────┘
 *            │
 *    ┌───────┴────────┐
 *    ▼                ▼
 * ┌──────────┐   ┌────────────────┐
 * │ provider │   │ FetchOrchestrator│
 * │ _assets  │   │ (Network layer)  │
 * │ (cache)  │   └─────────┬────────┘
 * └──────────┘             │
 *                   ┌──────┴──────┐
 *                   ▼             ▼
 *              Providers    Providers
 */

import { DatabaseConnection } from '../../types/database.js';
import { FetchOrchestrator } from './FetchOrchestrator.js';
import { ProviderOrchestrator } from './ProviderOrchestrator.js';
import { ProviderAssetsRepository } from '../enrichment/ProviderAssetsRepository.js';
import { logger } from '../../middleware/logging.js';
import { getErrorMessage } from '../../utils/errorHandling.js';
import { AssetType, EntityType as CapabilitiesEntityType } from '../../types/providers/capabilities.js';
import { ProviderAssets, SearchRequest as ProviderSearchRequest } from '../../types/providers/requests.js';
import { SearchResult } from '../../types/providers/index.js';

// ============================================================================
// Request/Response Interfaces
// ============================================================================

export type EntityType = 'movie' | 'tv' | 'music' | 'episode' | 'season';

/**
 * Parameters for fetchAssets()
 */
export interface FetchAssetsParams {
  /** Entity type (movie, tv, music, episode, season) */
  entityType: EntityType;

  /** Entity ID from local database */
  entityId: number;

  /** External IDs for provider lookups */
  externalIds?: {
    tmdb_id?: number | undefined;
    imdb_id?: string | undefined;
    tvdb_id?: number | undefined;
    musicbrainz_id?: string | undefined;
  } | undefined;

  /** Asset types to fetch (default: all types for this entity) */
  assetTypes?: AssetType[] | undefined;

  /** Force refresh, bypass cache (default: false) */
  force?: boolean | undefined;

  /** Request priority for logging/metrics */
  priority?: 'user' | 'automation' | undefined;
}

/**
 * Result from fetchAssets()
 */
export interface FetchAssetsResult {
  /** Whether result came from cache */
  cached: boolean;

  /** Cache age in days (only present if cached=true) */
  cacheAge?: number;

  /** Provider results (same structure as FetchOrchestrator) */
  providers: {
    [providerName: string]: ProviderAssets | null;
  };

  /** Fetch metadata */
  metadata: {
    fetchedAt: Date;
    completedProviders: string[];
    failedProviders: Array<{ name: string; error: string }>;
    timedOutProviders: string[];
  };
}

/**
 * Parameters for getCachedAssets()
 */
export interface GetCachedAssetsParams {
  /** Entity type */
  entityType: EntityType;

  /** Entity ID */
  entityId: number;

  /** Asset type to retrieve */
  assetType: AssetType;
}

/**
 * Cached asset for UI display
 */
export interface CachedAsset {
  id: number;
  url: string;
  width: number | null;
  height: number | null;
  language: string | null;
  provider_name: string;
  score: number | null;
  analyzed: boolean;
  is_selected: boolean;
  provider_metadata: {
    votes?: number;
    voteAverage?: number;
    [key: string]: unknown;
  } | null;
  fetched_at: string;
}

// ============================================================================
// ProviderCacheManager Class
// ============================================================================

export class ProviderCacheManager {
  private providerAssetsRepo: ProviderAssetsRepository;
  private providerOrchestrator: ProviderOrchestrator;

  constructor(
    db: DatabaseConnection,
    private fetchOrchestrator: FetchOrchestrator,
    providerOrchestrator?: ProviderOrchestrator
  ) {
    this.providerAssetsRepo = new ProviderAssetsRepository(db);

    // Use injected ProviderOrchestrator or create one
    if (providerOrchestrator) {
      this.providerOrchestrator = providerOrchestrator;
    } else {
      // Fallback: create our own (needs registry from fetchOrchestrator)
      this.providerOrchestrator = new ProviderOrchestrator(
        (fetchOrchestrator as any).registry,
        (fetchOrchestrator as any).configService
      );
    }
  }

  /**
   * Fetch assets and metadata with intelligent 7-day caching
   *
   * CACHING BEHAVIOR:
   * - If cache exists and is fresh (< 7 days) and !force → return cache instantly
   * - If cache is stale or missing or force=true → fetch from network, save, return
   *
   * USED BY:
   * - MovieProviderController.getProviderResults() (UI manual)
   * - EnrichmentService.phase1() (automation)
   * - ScheduledJobHandlers (weekly updates)
   *
   * @param params - Fetch parameters
   * @returns Asset results (cached or fresh)
   */
  async fetchAssets(params: FetchAssetsParams): Promise<FetchAssetsResult> {
    const startTime = Date.now();

    logger.info('[ProviderCacheManager] Fetch assets request', {
      entityType: params.entityType,
      entityId: params.entityId,
      force: params.force || false,
      priority: params.priority || 'user',
    });

    try {
      // Step 1: Check cache (unless force=true)
      if (!params.force) {
        const cacheResult = await this.checkCache(params);
        if (cacheResult) {
          logger.info('[ProviderCacheManager] Cache HIT', {
            entityId: params.entityId,
            cacheAge: cacheResult.cacheAge,
            duration: Date.now() - startTime,
          });
          return cacheResult;
        }
      }

      // Step 2: Cache miss/stale/forced - fetch from network
      logger.info('[ProviderCacheManager] Cache MISS - fetching from network', {
        entityId: params.entityId,
        reason: params.force ? 'forced' : 'stale/missing',
      });

      const networkResult = await this.fetchFromNetwork(params);

      // Step 3: Save to cache
      await this.saveToCache(params, networkResult);

      logger.info('[ProviderCacheManager] Network fetch complete', {
        entityId: params.entityId,
        cached: false,
        duration: Date.now() - startTime,
      });

      return {
        cached: false,
        providers: networkResult.providers,
        metadata: networkResult.metadata,
      };
    } catch (error) {
      logger.error('[ProviderCacheManager] Fetch assets failed', {
        entityType: params.entityType,
        entityId: params.entityId,
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  /**
   * Search providers for entity identification
   *
   * NOT CACHED - search results are ephemeral and change over time
   *
   * USED BY:
   * - MovieProviderController.searchForIdentification() (UI manual)
   * - MovieWorkflowService.searchForIdentification()
   *
   * @param params - Search parameters
   * @returns Search results from all providers
   */
  async search(request: ProviderSearchRequest): Promise<SearchResult[]> {
    const startTime = Date.now();

    logger.info('[ProviderCacheManager] Search request', {
      query: request.query,
      entityType: request.entityType,
      year: request.year,
    });

    try {
      // Delegate to ProviderOrchestrator (handles parallel search across providers)
      const results = await this.providerOrchestrator.searchAcrossProviders(request);

      logger.info('[ProviderCacheManager] Search complete', {
        query: request.query,
        resultCount: results.length,
        duration: Date.now() - startTime,
      });

      return results;
    } catch (error) {
      logger.error('[ProviderCacheManager] Search failed', {
        query: request.query,
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  /**
   * Get cached assets for UI display (READ-ONLY)
   *
   * Does NOT trigger network calls - only reads from cache.
   * If no cache exists, returns empty array.
   *
   * USED BY:
   * - MovieAssetController.getAssetCandidates() (asset browser UI)
   *
   * @param params - Cache query parameters
   * @returns Cached assets for display
   */
  async getCachedAssets(params: GetCachedAssetsParams): Promise<CachedAsset[]> {
    logger.debug('[ProviderCacheManager] Get cached assets', {
      entityType: params.entityType,
      entityId: params.entityId,
      assetType: params.assetType,
    });

    try {
      // Query provider_assets table
      const assets = await this.providerAssetsRepo.findByType(
        params.entityId,
        params.entityType,
        params.assetType
      );

      // Transform to UI format
      const cachedAssets: CachedAsset[] = assets.map(asset => ({
        id: asset.id,
        url: asset.provider_url,
        width: asset.width,
        height: asset.height,
        language: asset.provider_metadata
          ? JSON.parse(asset.provider_metadata).language || null
          : null,
        provider_name: asset.provider_name,
        score: asset.score,
        analyzed: asset.analyzed === 1,
        is_selected: asset.is_selected === 1,
        provider_metadata: asset.provider_metadata
          ? JSON.parse(asset.provider_metadata)
          : null,
        fetched_at: asset.fetched_at,
      }));

      logger.debug('[ProviderCacheManager] Cached assets retrieved', {
        entityId: params.entityId,
        assetType: params.assetType,
        count: cachedAssets.length,
      });

      return cachedAssets;
    } catch (error) {
      logger.error('[ProviderCacheManager] Get cached assets failed', {
        entityType: params.entityType,
        entityId: params.entityId,
        assetType: params.assetType,
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  // ==========================================================================
  // Private Helper Methods
  // ==========================================================================

  /**
   * Check if cache exists and is fresh (< 7 days)
   */
  private async checkCache(params: FetchAssetsParams): Promise<FetchAssetsResult | null> {
    // Check if cache is stale
    const isStale = await this.providerAssetsRepo.isCacheStale(
      params.entityId,
      params.entityType,
      7 // 7-day TTL
    );

    if (isStale) {
      return null; // Cache miss
    }

    // Get cached assets
    const cachedAssets = await this.providerAssetsRepo.findAllByEntity(
      params.entityId,
      params.entityType
    );

    if (cachedAssets.length === 0) {
      return null; // Cache miss
    }

    // Calculate cache age
    const oldestFetch = cachedAssets.reduce((oldest, asset) => {
      const fetchedAt = new Date(asset.fetched_at);
      return fetchedAt < oldest ? fetchedAt : oldest;
    }, new Date());

    const cacheAge = (Date.now() - oldestFetch.getTime()) / (1000 * 60 * 60 * 24);

    // Group by provider and asset type
    const providers: Record<string, ProviderAssets> = {};

    for (const asset of cachedAssets) {
      if (!providers[asset.provider_name]) {
        providers[asset.provider_name] = {
          metadata: {},
          images: {},
          videos: {},
        };
      }

      // Group assets by type
      if (!providers[asset.provider_name].images![asset.asset_type]) {
        providers[asset.provider_name].images![asset.asset_type] = [];
      }

      const metadata = asset.provider_metadata
        ? JSON.parse(asset.provider_metadata)
        : {};

      const assetCandidate: any = {
        url: asset.provider_url,
        width: asset.width !== null ? asset.width : undefined,
        height: asset.height !== null ? asset.height : undefined,
        language: metadata.language !== null ? metadata.language : undefined,
        votes: metadata.votes !== null ? metadata.votes : undefined,
        voteAverage: metadata.voteAverage !== null ? metadata.voteAverage : undefined,
      };
      providers[asset.provider_name].images![asset.asset_type]!.push(assetCandidate);
    }

    return {
      cached: true,
      cacheAge,
      providers,
      metadata: {
        fetchedAt: oldestFetch,
        completedProviders: Object.keys(providers),
        failedProviders: [],
        timedOutProviders: [],
      },
    };
  }

  /**
   * Fetch from network via FetchOrchestrator
   */
  private async fetchFromNetwork(params: FetchAssetsParams): Promise<{
    providers: Record<string, ProviderAssets | null>;
    metadata: FetchAssetsResult['metadata'];
  }> {
    // Build entity object for FetchOrchestrator
    const entity: any = {
      id: params.entityId,
      tmdb_id: params.externalIds?.tmdb_id || undefined,
      imdb_id: params.externalIds?.imdb_id || undefined,
      tvdb_id: params.externalIds?.tvdb_id || undefined,
      musicbrainz_id: params.externalIds?.musicbrainz_id || undefined,
      title: '', // FetchOrchestrator requires this but doesn't use it for asset fetching
    };

    // Call FetchOrchestrator
    const fetchConfig: any = {
      priority: (params.priority === 'automation' ? 'background' : 'user') as 'user' | 'background',
      assetTypes: params.assetTypes,
    };

    const result = await this.fetchOrchestrator.fetchAllProviders(
      entity,
      params.entityType as CapabilitiesEntityType,
      fetchConfig
    );

    return {
      providers: result.providers,
      metadata: result.metadata,
    };
  }

  /**
   * Save network results to provider_assets cache
   */
  private async saveToCache(
    params: FetchAssetsParams,
    networkResult: {
      providers: Record<string, ProviderAssets | null>;
      metadata: FetchAssetsResult['metadata'];
    }
  ): Promise<void> {
    try {
      // Determine which asset types to save
      const assetTypesToSave = params.assetTypes || [
        'poster',
        'fanart',
        'banner',
        'clearlogo',
        'clearart',
        'thumb',
        'backdrop',
        'discart',
        'logo',
      ];

      for (const assetType of assetTypesToSave) {
        const providerAssets = [];

        // Collect assets from all providers
        for (const [providerName, providerData] of Object.entries(networkResult.providers)) {
          if (!providerData?.images?.[assetType]) continue;

          for (const asset of providerData.images[assetType]) {
            providerAssets.push({
              entity_type: params.entityType,
              entity_id: params.entityId,
              asset_type: assetType,
              provider_name: providerName,
              provider_url: asset.url,
              provider_metadata: JSON.stringify({
                votes: asset.votes,
                voteAverage: asset.voteAverage,
                language: asset.language,
              }),
              width: asset.width,
              height: asset.height,
            });
          }
        }

        // Atomic upsert
        if (providerAssets.length > 0) {
          await this.providerAssetsRepo.upsertBatch(
            params.entityId,
            params.entityType,
            assetType,
            providerAssets
          );
        }
      }

      // Also save video assets (trailers, etc.)
      for (const [providerName, providerData] of Object.entries(networkResult.providers)) {
        if (!providerData?.videos) continue;

        for (const [videoType, videoList] of Object.entries(providerData.videos)) {
          if (!Array.isArray(videoList)) continue;

          const videoAssets = videoList.map((video: any) => ({
            entity_type: params.entityType,
            entity_id: params.entityId,
            asset_type: videoType,
            provider_name: providerName,
            provider_url: video.url,
            provider_metadata: JSON.stringify({
              type: video.assetType,
              site: (video as any).site,
              key: (video as any).key,
            }),
          }));

          if (videoAssets.length > 0) {
            await this.providerAssetsRepo.upsertBatch(
              params.entityId,
              params.entityType,
              videoType,
              videoAssets
            );
          }
        }
      }

      logger.debug('[ProviderCacheManager] Saved to cache', {
        entityId: params.entityId,
        assetTypes: assetTypesToSave,
      });
    } catch (error) {
      // Log but don't fail - cache save is not critical
      logger.error('[ProviderCacheManager] Failed to save to cache', {
        entityId: params.entityId,
        error: getErrorMessage(error),
      });
    }
  }
}
