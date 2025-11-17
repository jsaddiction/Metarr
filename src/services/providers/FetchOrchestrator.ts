/**
 * Fetch Orchestrator
 *
 * Coordinates concurrent fetching from multiple metadata providers with:
 * - Retry logic for rate limits and server errors
 * - Timeout handling
 * - Progress tracking for WebSocket updates
 * - Partial result handling
 */

import { BaseProvider } from './BaseProvider.js';
import { ProviderRegistry } from './ProviderRegistry.js';
import { ProviderConfigService } from '../providerConfigService.js';
import {
  ProviderResults,
  ProviderAssets,
  FailedProvider,
  MetadataRequest,
  AssetRequest,
  EntityType,
  AssetType,
  ProviderCapabilities,
} from '../../types/providers/index.js';
import {
  RateLimitError,
  ServerError,
  NotFoundError,
  AuthenticationError,
  NetworkError,
} from '../../errors/providerErrors.js';
import { ResourceNotFoundError } from '../../errors/index.js';
import { logger } from '../../middleware/logging.js';
import type { Movie, Series } from '../../types/models.js';
import { getErrorMessage } from '../../utils/errorHandling.js';

/**
 * Priority level for fetch operations
 */
export type FetchPriority = 'user' | 'background';

/**
 * Progress callback for WebSocket updates
 */
export interface ProgressCallback {
  onProviderStart?: (providerName: string) => void;
  onProviderComplete?: (providerName: string, success: boolean) => void;
  onProviderRetry?: (providerName: string, attempt: number, maxRetries: number) => void;
  onProviderTimeout?: (providerName: string) => void;
}

/**
 * Fetch configuration
 */
export interface FetchConfig {
  priority: FetchPriority;
  assetTypes?: AssetType[];
  progressCallback?: ProgressCallback;
}

/**
 * Internal provider fetch state
 */
interface ProviderFetchState {
  name: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'timeout';
  error?: string;
  retryable?: boolean;
  startTime?: number;
  endTime?: number;
}

export class FetchOrchestrator {
  // Timeout settings
  private readonly USER_TIMEOUT_MS = 10000; // 10 seconds for user actions
  private readonly BACKGROUND_TIMEOUT_MS = 60000; // 60 seconds for background

  // Retry settings
  private readonly USER_MAX_RETRIES = 2;
  private readonly BACKGROUND_MAX_RETRIES = 5;
  private readonly BASE_RETRY_DELAY_MS = 1000;
  private readonly MAX_RETRY_DELAY_MS = 30000;

  constructor(
    private registry: ProviderRegistry,
    private configService: ProviderConfigService
  ) {}

  /**
   * Fetch from all enabled providers concurrently
   */
  async fetchAllProviders(
    media: Movie | Series,
    entityType: EntityType,
    config: FetchConfig
  ): Promise<ProviderResults> {
    const startTime = Date.now();
    logger.info('Starting concurrent provider fetch', {
      entityType,
      priority: config.priority,
      mediaId: media.id,
      mediaTitle: media.title,
    });

    // Get enabled providers that support this entity type
    const enabledProviders = await this.getEnabledProviders();
    const compatibleProviders: string[] = [];

    for (const providerName of enabledProviders) {
      // Get capabilities
      const caps = this.registry.getCapabilities(providerName as any);
      if (!caps) {
        logger.debug(`Skipping ${providerName}: capabilities not found`);
        continue;
      }

      // Skip providers that don't support this entity type
      if (!caps.supportedEntityTypes.includes(entityType)) {
        logger.debug(`Skipping ${providerName}: doesn't support ${entityType}`);
        continue;
      }

      // Skip local provider for user-initiated searches (it needs filesystem access)
      if (providerName === 'local' && config.priority === 'user') {
        logger.debug('Skipping local provider: only used during library scans');
        continue;
      }

      compatibleProviders.push(providerName);
    }

    if (compatibleProviders.length === 0) {
      logger.info(`No compatible providers available for ${entityType}`);
      return this.createEmptyResults();
    }

    logger.info(`Fetching from ${compatibleProviders.length} compatible providers`, {
      providers: compatibleProviders,
    });

    // Initialize fetch states
    const fetchStates = new Map<string, ProviderFetchState>();
    for (const providerName of compatibleProviders) {
      fetchStates.set(providerName, {
        name: providerName,
        status: 'pending',
      });
    }

    // Fetch from all providers concurrently
    const timeout = this.getTimeout(config.priority);
    const maxRetries = this.getMaxRetries(config.priority);

    const fetchPromises = compatibleProviders.map(providerName =>
      this.fetchFromProviderWithTimeout(
        providerName,
        media,
        entityType,
        config,
        maxRetries,
        timeout,
        fetchStates
      )
    );

    // Wait for all fetches to complete (or timeout)
    const results = await Promise.allSettled(fetchPromises);

    // Aggregate results
    const providerResults: { [key: string]: ProviderAssets | null } = {};
    const completedProviders: string[] = [];
    const failedProviders: FailedProvider[] = [];
    const timedOutProviders: string[] = [];

    results.forEach((result, index) => {
      const providerName = compatibleProviders[index];
      const state = fetchStates.get(providerName)!;

      if (result.status === 'fulfilled' && result.value !== null) {
        providerResults[providerName] = result.value;
        completedProviders.push(providerName);
        state.status = 'success';
      } else if (state.status === 'timeout') {
        providerResults[providerName] = null;
        timedOutProviders.push(providerName);
      } else {
        providerResults[providerName] = null;
        failedProviders.push({
          name: providerName,
          error: state.error || 'Unknown error',
          retryable: state.retryable || false,
        });
        state.status = 'failed';
      }
    });

    const allFailed = completedProviders.length === 0;

    const duration = Date.now() - startTime;
    logger.info('Provider fetch complete', {
      duration,
      completed: completedProviders.length,
      failed: failedProviders.length,
      timedOut: timedOutProviders.length,
      allFailed,
    });

    return {
      providers: providerResults,
      metadata: {
        fetchedAt: new Date(),
        completedProviders,
        failedProviders,
        timedOutProviders,
      },
      allFailed,
    };
  }

  /**
   * Fetch from a single provider with timeout
   */
  private async fetchFromProviderWithTimeout(
    providerName: string,
    media: Movie | Series,
    entityType: EntityType,
    config: FetchConfig,
    maxRetries: number,
    timeoutMs: number,
    fetchStates: Map<string, ProviderFetchState>
  ): Promise<ProviderAssets | null> {
    const state = fetchStates.get(providerName)!;

    // Use a flag to track if fetch completed
    let fetchCompleted = false;
    let timeoutId: NodeJS.Timeout;

    // Create timeout promise that can be cancelled
    const timeoutPromise = new Promise<null>((resolve) => {
      timeoutId = setTimeout(() => {
        if (!fetchCompleted) {
          logger.warn(`Provider fetch timed out: ${providerName}`, { timeoutMs });
          if (state) {
            state.status = 'timeout';
            state.error = `Fetch timed out after ${timeoutMs}ms`;
          }
          config.progressCallback?.onProviderTimeout?.(providerName);
          resolve(null);
        }
      }, timeoutMs);
    });

    // Race between fetch and timeout
    const result = await Promise.race([
      this.fetchFromProvider(providerName, media, entityType, config, maxRetries, state)
        .then(assets => {
          fetchCompleted = true;
          clearTimeout(timeoutId); // Cancel timeout if fetch succeeds
          return assets;
        })
        .catch(() => {
          fetchCompleted = true;
          clearTimeout(timeoutId); // Cancel timeout even if fetch fails
          return null;
        }),
      timeoutPromise,
    ]);

    return result;
  }

  /**
   * Fetch from a single provider with retry logic
   */
  private async fetchFromProvider(
    providerName: string,
    media: Movie | Series,
    entityType: EntityType,
    config: FetchConfig,
    maxRetries: number,
    state: ProviderFetchState
  ): Promise<ProviderAssets | null> {
    state.status = 'running';
    state.startTime = Date.now();
    config.progressCallback?.onProviderStart?.(providerName);

    try {
      // Get provider instance
      const providerConfig = await this.configService.getByName(providerName);
      if (!providerConfig) {
        throw new ResourceNotFoundError('provider', providerName);
      }

      const provider = await this.registry.createProvider(providerConfig);

      // Fetch with retry
      const assets = await this.fetchWithRetry(
        provider,
        media,
        entityType,
        config,
        maxRetries,
        providerName
      );

      state.endTime = Date.now();
      config.progressCallback?.onProviderComplete?.(providerName, true);

      return assets;
    } catch (error) {
      state.endTime = Date.now();
      state.error = getErrorMessage(error);
      state.retryable = this.isRetryableError(error);

      // Only log as error if it's truly unexpected (not missing IDs or incompatibility)
      if (getErrorMessage(error)?.includes('No compatible external ID')) {
        logger.debug(`Provider ${providerName} skipped: ${getErrorMessage(error)}`);
      } else {
        logger.error(`Provider fetch failed: ${providerName}`, {
          error: getErrorMessage(error),
          retryable: state.retryable,
        });
      }

      config.progressCallback?.onProviderComplete?.(providerName, false);

      return null;
    }
  }

  /**
   * Fetch with retry logic for rate limits and server errors
   */
  private async fetchWithRetry(
    provider: BaseProvider,
    media: Movie | Series,
    entityType: EntityType,
    config: FetchConfig,
    maxRetries: number,
    providerName: string
  ): Promise<ProviderAssets | null> {
    let lastError: unknown = null;
    let attempt = 0;

    while (attempt <= maxRetries) {
      try {
        // Attempt fetch
        const assets = await this.performFetch(provider, media, entityType, config);
        return assets;
      } catch (error) {
        lastError = error;
        attempt++;

        // Determine if we should retry
        const shouldRetry = this.shouldRetryError(error, attempt, maxRetries);

        if (!shouldRetry) {
          throw error;
        }

        // Calculate backoff delay
        const delay = this.calculateBackoff(error, attempt);

        logger.info(`Retrying provider fetch: ${providerName}`, {
          attempt,
          maxRetries,
          delayMs: delay,
          error: getErrorMessage(error),
        });

        config.progressCallback?.onProviderRetry?.(providerName, attempt, maxRetries);

        // Wait before retry
        await this.delay(delay);
      }
    }

    // All retries exhausted
    throw lastError || new Error('Unknown error during fetch');
  }

  /**
   * Perform the actual fetch from provider
   */
  private async performFetch(
    provider: BaseProvider,
    media: Movie | Series,
    entityType: EntityType,
    config: FetchConfig
  ): Promise<ProviderAssets> {
    const caps = provider.getCapabilities();
    const assets: ProviderAssets = {};

    // Resolve provider ID from media external IDs using provider's capabilities
    const providerId = this.resolveProviderId(media, caps);
    if (!providerId) {
      throw new NotFoundError(
        caps.id,
        media.id,
        `No compatible external ID found for ${caps.id}`
      );
    }

    // Fetch metadata if supported
    const supportedMetadataFields = caps.supportedMetadataFields[entityType];
    if (supportedMetadataFields && supportedMetadataFields.length > 0) {
      try {
        const metadataRequest: MetadataRequest = {
          providerId: caps.id,
          providerResultId: providerId,
          entityType,
        };

        const metadataResponse = await provider.getMetadata(metadataRequest);
        assets.metadata = metadataResponse.fields;
      } catch (error) {
        // Expected failures (not implemented, not supported) are debug level
        if (getErrorMessage(error)?.includes('not yet implemented') || getErrorMessage(error)?.includes('not supported')) {
          logger.debug(`Metadata not available from ${caps.id}: ${getErrorMessage(error)}`);
        } else {
          logger.warn(`Metadata fetch failed for ${caps.id}`, { error: getErrorMessage(error) });
        }
        // Continue to try assets even if metadata fails
      }
    }

    // Fetch assets if supported and requested
    if (config.assetTypes && config.assetTypes.length > 0) {
      const supportedAssetTypes = caps.supportedAssetTypes[entityType] || [];
      const requestedAssetTypes = config.assetTypes.filter(type =>
        supportedAssetTypes.includes(type)
      );

      logger.info(`[${caps.id}] Asset type filtering`, {
        providerId: caps.id,
        entityType,
        requestedByUser: config.assetTypes,
        supportedByProvider: supportedAssetTypes,
        afterFiltering: requestedAssetTypes
      });

      if (requestedAssetTypes.length > 0) {
        try {
          const assetRequest: AssetRequest = {
            providerId: caps.id,
            providerResultId: providerId,
            entityType,
            assetTypes: requestedAssetTypes,
          };

          logger.info(`[${caps.id}] Calling getAssets with request`, { assetRequest });
          const assetCandidates = await provider.getAssets(assetRequest);
          logger.info(`[${caps.id}] getAssets returned ${assetCandidates.length} candidates`);

          // Group assets by type
          if (!assets.images) {
            assets.images = {};
          }
          if (!assets.videos) {
            assets.videos = {};
          }

          logger.info(`[${caps.id}] Processing ${assetCandidates.length} candidates`);
          for (const candidate of assetCandidates) {
            const assetType = candidate.assetType;

            // Categorize into images or videos
            if (this.isImageAsset(assetType)) {
              const category = this.getImageCategory(assetType);
              if (!assets.images[category]) {
                assets.images[category] = [];
              }
              assets.images[category].push(candidate);
              logger.info(`[${caps.id}] Added ${assetType} to images.${category}, total: ${assets.images[category].length}`);
            } else if (this.isVideoAsset(assetType)) {
              const category = this.getVideoCategory(assetType);
              if (!assets.videos[category]) {
                assets.videos[category] = [];
              }
              assets.videos[category].push(candidate);
            }
          }
        } catch (error) {
          // Expected failures are debug level
          if (getErrorMessage(error)?.includes('requires directoryPath') || getErrorMessage(error)?.includes('not yet implemented')) {
            logger.debug(`Assets not available from ${caps.id}: ${getErrorMessage(error)}`);
          } else {
            logger.warn(`Asset fetch failed for ${caps.id}`, { error: getErrorMessage(error) });
          }
          // Continue even if asset fetch fails
        }
      }
    }

    return assets;
  }

  /**
   * Determine if error should trigger retry
   */
  private shouldRetryError(error: unknown, attempt: number, maxRetries: number): boolean {
    if (attempt > maxRetries) {
      return false;
    }

    // Retry on rate limit errors
    if (error instanceof RateLimitError) {
      return true;
    }

    // Retry on server errors (5xx)
    if (error instanceof ServerError) {
      return true;
    }

    // Retry on network errors
    if (error instanceof NetworkError) {
      return true;
    }

    // Don't retry on 404
    if (error instanceof NotFoundError) {
      return false;
    }

    // Don't retry on auth errors
    if (error instanceof AuthenticationError) {
      return false;
    }

    // Don't retry other errors
    return false;
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: unknown): boolean {
    return (
      error instanceof RateLimitError ||
      error instanceof ServerError ||
      error instanceof NetworkError
    );
  }

  /**
   * Calculate backoff delay for retry
   */
  private calculateBackoff(error: unknown, attempt: number): number {
    // If rate limit error has retryAfter, use that
    if (error instanceof RateLimitError && error.retryAfter) {
      return error.retryAfter * 1000; // Convert to ms
    }

    // Exponential backoff
    const delay = Math.min(
      this.BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1),
      this.MAX_RETRY_DELAY_MS
    );

    // Add jitter (±20%)
    const jitter = delay * 0.2 * (Math.random() * 2 - 1);
    return Math.floor(delay + jitter);
  }

  /**
   * Resolve provider ID from media external IDs using provider capabilities
   *
   * Checks the provider's externalIdLookup field to see which external IDs it accepts,
   * then returns the first available matching ID from the media object.
   */
  private resolveProviderId(media: Movie | Series, capabilities: ProviderCapabilities): string | null {
    // If provider is a direct ID provider (tmdb, tvdb, imdb), check directly
    const providerId = capabilities.id;

    switch (providerId) {
      case 'tmdb':
        return media.tmdb_id ? String(media.tmdb_id) : null;
      case 'tvdb':
        return 'tvdb_id' in media && media.tvdb_id ? String(media.tvdb_id) : null;
      case 'imdb':
        return media.imdb_id ? String(media.imdb_id) : null;
    }

    // For other providers, check their externalIdLookup capability
    const externalIdLookup = capabilities.search?.externalIdLookup || [];

    for (const idType of externalIdLookup) {
      switch (idType) {
        case 'tmdb_id':
        case 'tmdb':
          if (media.tmdb_id) return String(media.tmdb_id);
          break;
        case 'tvdb_id':
        case 'tvdb':
          if ('tvdb_id' in media && media.tvdb_id) return String(media.tvdb_id);
          break;
        case 'imdb_id':
        case 'imdb':
          if (media.imdb_id) return String(media.imdb_id);
          break;
      }
    }

    return null;
  }

  /**
   * Get enabled provider names
   */
  private async getEnabledProviders(): Promise<string[]> {
    const configs = await this.configService.getAll();
    return configs.filter(c => c.enabled).map(c => c.providerName);
  }

  /**
   * Get timeout based on priority
   */
  private getTimeout(priority: FetchPriority): number {
    return priority === 'user' ? this.USER_TIMEOUT_MS : this.BACKGROUND_TIMEOUT_MS;
  }

  /**
   * Get max retries based on priority
   */
  private getMaxRetries(priority: FetchPriority): number {
    return priority === 'user' ? this.USER_MAX_RETRIES : this.BACKGROUND_MAX_RETRIES;
  }

  /**
   * Create empty results when no providers are available
   */
  private createEmptyResults(): ProviderResults {
    return {
      providers: {},
      metadata: {
        fetchedAt: new Date(),
        completedProviders: [],
        failedProviders: [],
        timedOutProviders: [],
      },
      allFailed: true,
    };
  }

  /**
   * Check if asset type is an image
   */
  private isImageAsset(assetType: AssetType): boolean {
    return [
      'poster',
      'fanart',
      'backdrop',
      'logo',
      'clearlogo',
      'banner',
      'thumb',
      'landscape',
      'clearart',
      'discart',
      'keyart',
      'characterart',
    ].includes(assetType);
  }

  /**
   * Check if asset type is a video
   */
  private isVideoAsset(assetType: AssetType): boolean {
    return ['trailer', 'teaser', 'clip'].includes(assetType);
  }

  /**
   * Get image category from asset type
   */
  private getImageCategory(assetType: AssetType): string {
    // Just return the asset type as-is, no pluralization
    return assetType;
  }

  /**
   * Get video category from asset type
   */
  private getVideoCategory(assetType: AssetType): string {
    // Just return the asset type as-is, no pluralization
    return assetType;
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
