/**
 * Local Provider
 *
 * Handles NFO parsing, local asset discovery, and backup management.
 * Unlike remote providers, this operates on the local filesystem without API calls.
 */

import { BaseProvider } from '../BaseProvider.js';
import { RateLimiter } from '../utils/index.js';
import {
  ProviderCapabilities,
  ProviderOptions,
  SearchRequest,
  SearchResult,
  MetadataRequest,
  MetadataResponse,
  AssetRequest,
  AssetCandidate,
  // AssetType, // Commented out - unused until getAssets is re-implemented
} from '../../../types/providers/index.js';
import { ProviderConfig } from '../../../types/provider.js';
import { parseMovieNfos } from '../../nfo/nfoParser.js';
// TODO: Replace with new assetDiscoveryService.ts when integrating local provider
// import { discoverAssets } from '../../media/assetDiscovery.js';
// Commented out until getAssets is re-implemented
/*
import {
  computePerceptualHash,
  computeContentHash,
  getImageDimensions,
  getFileSize,
} from '../../../utils/imageHash.js';
*/
import { logger } from '../../../middleware/logging.js';
import path from 'path';
import { promises as fs } from 'fs';
import { getErrorMessage } from '../../../utils/errorHandling.js';
import { ValidationError, NotImplementedError } from '../../../errors/index.js';

// Extended request types for LocalProvider
export interface LocalSearchRequest extends SearchRequest {
  directoryPath?: string;
}

export interface LocalAssetRequest extends AssetRequest {
  directoryPath?: string;
  entityId?: number;
}

export class LocalProvider extends BaseProvider {
  constructor(config: ProviderConfig, options?: ProviderOptions) {
    super(config, options);

    logger.info('Local Provider initialized', {
      providerId: this.capabilities.id,
      version: this.capabilities.version,
    });
  }

  /**
   * Create rate limiter (effectively unlimited for filesystem access)
   */
  protected createRateLimiter(): RateLimiter {
    return new RateLimiter({
      requestsPerSecond: 1000, // Effectively unlimited
      burstCapacity: 10000,
      windowSeconds: 1,
    });
  }

  /**
   * Define Local Provider capabilities
   */
  defineCapabilities(): ProviderCapabilities {
    return {
      id: 'local',
      name: 'Local Files',
      version: '1.0.0',
      category: 'both',

      supportedEntityTypes: ['movie', 'series', 'season', 'episode'],

      supportedMetadataFields: {
        movie: [
          'title',
          'originalTitle',
          'plot',
          'tagline',
          'releaseDate',
          'runtime',
          'ratings',
          'genres',
          'studios',
          'country',
          'directors',
          'writers',
          'actors',
          'certification',
          'trailer',
        ],
        series: [
          'title',
          'originalTitle',
          'plot',
          'premiered',
          'genres',
          'studios',
          'actors',
          'certification',
        ],
        episode: ['title', 'plot', 'directors', 'writers', 'actors'],
      },

      supportedAssetTypes: {
        movie: [
          'poster',
          'fanart',
          'banner',
          'clearlogo',
          'clearart',
          'discart',
          'landscape',
          'keyart',
        ],
        series: ['poster', 'fanart', 'banner', 'clearlogo'],
        season: ['poster', 'fanart'],
        episode: ['thumb'],
      },

      authentication: {
        type: 'none',
        required: false,
      },

      rateLimit: {
        requestsPerSecond: 1000, // No real limit for filesystem
        burstCapacity: 10000,
        webhookReservedCapacity: 0,
        enforcementType: 'client',
      },

      search: {
        supported: true,
        fuzzyMatching: false, // Exact ID matching from NFO
        multiLanguage: false,
        yearFilter: false,
        externalIdLookup: ['tmdb_id', 'imdb_id', 'tvdb_id'],
      },

      dataQuality: {
        metadataCompleteness: 0.50, // Depends on user's NFO files
        imageQuality: 0.70, // User's local images may vary
        updateFrequency: 'weekly', // Local files don't auto-update, but check weekly
        userContributed: true,
        curatedContent: false,
      },

      assetProvision: {
        providesUrls: false, // Local files, not URLs
        providesDirectDownload: false,
        thumbnailUrls: false,
        multipleQualities: false,
        maxResultsPerType: 10, // Limit local asset discovery
        qualityHints: false,
        languagePerAsset: false,
      },

      specialFeatures: {},
    };
  }

  /**
   * Search by parsing NFO files in a directory
   * Returns IDs that can be used to search remote providers
   */
  async search(request: SearchRequest): Promise<SearchResult[]> {
    const localRequest = request as LocalSearchRequest;
    const { directoryPath, entityType } = localRequest;

    if (!directoryPath) {
      throw new ValidationError('Local provider requires directoryPath for search');
    }

    try {
      // Find NFO files in directory
      const nfoPaths = await this.findNfoFiles(directoryPath);

      if (nfoPaths.length === 0) {
        logger.debug(`No NFO files found in ${directoryPath}`);
        return [];
      }

      // Parse NFO files based on entity type
      if (entityType === 'movie') {
        const parsed = await parseMovieNfos(nfoPaths);

        if (!parsed.valid) {
          logger.warn(`Invalid NFO data in ${directoryPath}`, {
            error: parsed.error,
            ambiguous: parsed.ambiguous,
          });
          return [];
        }

        // Return search result with extracted IDs
        const result: SearchResult = {
          providerId: 'local',
          providerResultId: 'nfo_data',
          title: '', // NFO parser doesn't return title in ParsedMovieNFO
          confidence: 1.0, // NFO data is authoritative (0-1 scale)
          metadata: { matchedBy: 'nfo' },
        };

        // Add external IDs if available
        if (parsed.tmdbId || parsed.imdbId) {
          result.externalIds = {};
          if (parsed.tmdbId) result.externalIds.tmdb = parsed.tmdbId;
          if (parsed.imdbId) result.externalIds.imdb = parsed.imdbId;
        }

        return [result];
      }

      // TODO: Add support for series/episode NFO parsing
      logger.warn(`Local provider does not yet support ${entityType} NFO parsing`);
      return [];
    } catch (error) {
      logger.error(`Local provider search failed`, {
        directoryPath,
        error: getErrorMessage(error),
      });
      return [];
    }
  }

  /**
   * Get metadata from NFO files
   * Not fully implemented - use remote providers for complete metadata
   */
  async getMetadata(_request: MetadataRequest): Promise<MetadataResponse> {
    throw new NotImplementedError('Local provider metadata retrieval not yet implemented');
    // TODO: Implement full NFO parsing that returns MetadataResponse
    // For now, use search() to get IDs, then use remote providers for metadata
  }

  /**
   * Get asset candidates from local filesystem
   *
   * TODO: Re-implement using AssetDiscoveryService after removing legacy assetDiscovery.ts
   */
  async getAssets(request: AssetRequest): Promise<AssetCandidate[]> {
    const localRequest = request as LocalAssetRequest;
    const { entityId, directoryPath } = localRequest;
    // entityType and assetTypes unused until re-implementation

    if (!directoryPath) {
      throw new ValidationError('Local provider requires directoryPath for asset discovery');
    }

    if (!entityId) {
      throw new ValidationError('Local provider requires entityId for asset discovery');
    }

    // TODO: Replace with new AssetDiscoveryService.scanDirectory()
    throw new NotImplementedError('LocalProvider.getAssets() temporarily disabled - needs migration to new AssetDiscoveryService');

    /* LEGACY CODE - Remove after migration
    try {
      const discovered = await discoverAssets(directoryPath);
      const candidates: AssetCandidate[] = [];

      for (const image of discovered.images) {
        const imageType = image.type as AssetType;

        // Filter by requested asset types if specified
        if (assetTypes && !assetTypes.includes(imageType)) {
          continue;
        }

        // Check if this asset type is supported for this entity type
        const supportedTypes = this.capabilities.supportedAssetTypes[entityType];
        if (!supportedTypes?.includes(imageType)) {
          continue;
        }

        try {
          // Get file properties
          const dimensions = await getImageDimensions(image.filePath);
          const fileSize = await getFileSize(image.filePath);
          const contentHash = await computeContentHash(image.filePath);
          const perceptualHash = await computePerceptualHash(image.filePath);

          candidates.push({
            providerId: 'local',
            providerResultId: `local_${entityId}_${imageType}`,
            assetType: imageType,
            url: '', // Local files don't have URLs (required field)
            width: dimensions.width,
            height: dimensions.height,
            language: '', // Required field, empty for local
            voteAverage: 0,
            votes: 0,
            // Additional fields not in base interface
            fileSize,
            metadata: {
              source: 'local',
              discoveredAt: new Date().toISOString(),
              localPath: image.filePath,
              contentHash,
              perceptualHash,
              isAlreadyDownloaded: true,
            },
          });
        } catch (error) {
          logger.warn(`Failed to process local asset ${image.filePath}`, {
            error: getErrorMessage(error),
          });
        }
      }

      logger.info(
        `Discovered ${candidates.length} local assets in ${directoryPath}`,
        { entityType, assetTypes }
      );

      return candidates;
    } catch (error) {
      logger.error(`Local asset discovery failed`, {
        directoryPath,
        error: getErrorMessage(error),
      });
      return [];
    }
    */
  }

  /**
   * Find all NFO files in a directory
   */
  private async findNfoFiles(dirPath: string): Promise<string[]> {
    const nfoFiles: string[] = [];

    try {
      const files = await fs.readdir(dirPath);

      for (const file of files) {
        if (file.toLowerCase().endsWith('.nfo')) {
          nfoFiles.push(path.join(dirPath, file));
        }
      }
    } catch (error) {
      logger.warn(`Failed to read directory ${dirPath}`, {
        error: getErrorMessage(error),
      });
    }

    return nfoFiles;
  }

  /**
   * Test connection (always succeeds for local filesystem)
   */
  async testConnection() {
    return {
      success: true,
      message: 'Local filesystem is accessible',
    };
  }
}
