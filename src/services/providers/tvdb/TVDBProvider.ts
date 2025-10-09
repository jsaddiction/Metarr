/**
 * TVDB Provider
 *
 * Concrete implementation of BaseProvider for The TVDB (TheTVDB).
 * Wraps TVDBClient and provides standardized provider interface.
 */

import { BaseProvider } from '../BaseProvider.js';
import { TVDBClient } from './TVDBClient.js';
import { RateLimiter } from '../utils/RateLimiter.js';
import {
  ProviderCapabilities,
  ProviderOptions,
  SearchRequest,
  SearchResult,
  MetadataRequest,
  MetadataResponse,
  AssetRequest,
  AssetCandidate,
  MetadataField,
} from '../../../types/providers/index.js';
import { ProviderConfig } from '../../../types/provider.js';
import { logger } from '../../../middleware/logging.js';
import { TVDBImageType } from '../../../types/providers/tvdb.js';

export class TVDBProvider extends BaseProvider {
  private tvdbClient: TVDBClient;

  constructor(config: ProviderConfig, options?: ProviderOptions) {
    super(config, options);

    // Initialize TVDB client
    this.tvdbClient = new TVDBClient({
      apiKey: config.apiKey || '',
      baseUrl: (options?.baseUrl as string) || 'https://api4.thetvdb.com/v4',
      imageBaseUrl: (options?.imageBaseUrl as string) || 'https://artworks.thetvdb.com',
      language: 'eng',
      tokenRefreshBuffer: 2, // Refresh 2 hours before expiry
    });

    logger.info('TVDB Provider initialized', {
      providerId: this.capabilities.id,
      version: this.capabilities.version,
    });
  }

  /**
   * Create rate limiter for TVDB API
   * TVDB allows ~100 requests per 10 seconds, we'll be conservative with 10/sec
   */
  protected createRateLimiter(): RateLimiter {
    const capabilities = this.getCapabilities();
    return new RateLimiter({
      requestsPerSecond: capabilities.rateLimit.requestsPerSecond,
      burstCapacity: capabilities.rateLimit.burstCapacity,
      windowSeconds: 10,
    });
  }

  /**
   * Define TVDB provider capabilities
   */
  defineCapabilities(): ProviderCapabilities {
    return {
      id: 'tvdb',
      name: 'TheTVDB',
      version: '1.0.0',
      category: 'both',

      supportedEntityTypes: ['series', 'season', 'episode'],

      supportedMetadataFields: {
        series: [
          'title',
          'originalTitle',
          'plot',
          'releaseDate',
          'premiered',
          'status',
          'runtime',
          'ratings',
          'genres',
          'actors',
          'country',
          'trailer',
        ],
        season: ['title', 'plot'],
        episode: [
          'title',
          'plot',
          'releaseDate',
          'premiered',
          'runtime',
          'actors',
        ],
      },

      supportedAssetTypes: {
        series: ['poster', 'fanart', 'banner', 'clearlogo', 'clearart'],
        season: ['poster'],
        episode: ['thumb'],
      },

      authentication: {
        type: 'jwt',
        required: true,
        tokenLifetime: 24 * 60 * 60, // 24 hours
      },

      rateLimit: {
        requestsPerSecond: 10, // Conservative, actual limit is ~100/10sec
        burstCapacity: 50,
        webhookReservedCapacity: 10,
        enforcementType: 'client',
      },

      search: {
        supported: true,
        fuzzyMatching: true,
        multiLanguage: false,
        yearFilter: true,
        externalIdLookup: ['imdb_id', 'tvdb_id'],
      },

      dataQuality: {
        metadataCompleteness: 0.90,
        imageQuality: 0.85,
        updateFrequency: 'daily',
        userContributed: true,
        curatedContent: true,
      },

      assetProvision: {
        providesUrls: true,
        providesDirectDownload: false,
        thumbnailUrls: false,
        multipleQualities: false,
        maxResultsPerType: null,
        qualityHints: true,
        languagePerAsset: true,
      },

      specialFeatures: {
        multipleLanguageImages: true,
        voteSystemForImages: true,
      },
    };
  }

  /**
   * Search for series
   */
  async search(request: SearchRequest): Promise<SearchResult[]> {
    const { query, entityType, year, page = 1, limit = 20 } = request;

    // Only support series searches
    if (entityType !== 'series') {
      return [];
    }

    try {
      const searchResult = await this.tvdbClient.searchSeries(query, page - 1);

      if (!searchResult.data || searchResult.data.length === 0) {
        return [];
      }

      return searchResult.data.slice(0, limit).map((series) => ({
        providerId: 'tvdb',
        providerResultId: series.tvdb_id || series.id,
        entityType: 'series',
        title: series.name,
        originalTitle: series.name, // TVDB doesn't separate original title
        year: series.year ? parseInt(series.year) : undefined,
        plot: series.overview,
        confidence: this.calculateSearchConfidence(series, query, year),
        matchedBy: 'title',
      }));
    } catch (error: any) {
      logger.error('TVDB search failed', {
        query,
        entityType,
        error: error.message,
      });
      throw new Error(`TVDB search failed: ${error.message}`);
    }
  }

  /**
   * Get metadata for series/season/episode
   */
  async getMetadata(request: MetadataRequest): Promise<MetadataResponse> {
    const { providerResultId, entityType, fields } = request;

    try {
      if (entityType === 'series') {
        const series = await this.tvdbClient.getSeriesExtended(parseInt(providerResultId));

        const transformedData = this.transformSeriesMetadata(series, fields);
        const response: MetadataResponse = {
          providerId: 'tvdb',
          providerResultId,
          fields: transformedData.fields,
          completeness: this.calculateCompleteness(transformedData.fields, fields),
          confidence: 0.90, // TVDB is reliable for TV data
        };

        if (transformedData.externalIds) {
          response.externalIds = transformedData.externalIds;
        }

        return response;
      }

      if (entityType === 'season') {
        const season = await this.tvdbClient.getSeason(parseInt(providerResultId));

        const transformedData = this.transformSeasonMetadata(season, fields);
        return {
          providerId: 'tvdb',
          providerResultId,
          fields: transformedData.fields,
          completeness: this.calculateCompleteness(transformedData.fields, fields),
          confidence: 0.90,
        };
      }

      if (entityType === 'episode') {
        const episode = await this.tvdbClient.getEpisodeExtended(parseInt(providerResultId));

        const transformedData = this.transformEpisodeMetadata(episode, fields);
        const response: MetadataResponse = {
          providerId: 'tvdb',
          providerResultId,
          fields: transformedData.fields,
          completeness: this.calculateCompleteness(transformedData.fields, fields),
          confidence: 0.90,
        };

        if (transformedData.externalIds) {
          response.externalIds = transformedData.externalIds;
        }

        return response;
      }

      throw new Error(`TVDB provider does not support entity type: ${entityType}`);
    } catch (error: any) {
      logger.error('TVDB metadata fetch failed', {
        providerResultId,
        entityType,
        error: error.message,
      });
      throw new Error(`TVDB metadata fetch failed: ${error.message}`);
    }
  }

  /**
   * Get asset candidates for series/season/episode
   */
  async getAssets(request: AssetRequest): Promise<AssetCandidate[]> {
    const { providerResultId, entityType, assetTypes } = request;

    if (entityType !== 'series' && entityType !== 'season' && entityType !== 'episode') {
      return [];
    }

    try {
      const candidates: AssetCandidate[] = [];

      // For series, get artwork from series endpoint
      if (entityType === 'series') {
        const artworks = await this.tvdbClient.getSeriesArtwork(parseInt(providerResultId));

        for (const artwork of artworks) {
          const assetType = this.mapTVDBImageTypeToAssetType(artwork.type);
          if (!assetType || !assetTypes.includes(assetType)) {
            continue;
          }

          const candidate: AssetCandidate = {
            providerId: 'tvdb',
            providerResultId,
            assetType,
            url: this.tvdbClient.getImageUrl(artwork.image),
            language: artwork.language || 'null',
          };

          if (artwork.width) candidate.width = artwork.width;
          if (artwork.height) candidate.height = artwork.height;
          if (artwork.score) candidate.votes = artwork.score;

          candidates.push(candidate);
        }
      }

      // For seasons, get season-specific artwork
      if (entityType === 'season') {
        const season = await this.tvdbClient.getSeason(parseInt(providerResultId));

        if (season.artwork && assetTypes.includes('poster')) {
          for (const artwork of season.artwork) {
            if (artwork.type === TVDBImageType.SEASON_POSTER) {
              const candidate: AssetCandidate = {
                providerId: 'tvdb',
                providerResultId,
                assetType: 'poster',
                url: this.tvdbClient.getImageUrl(artwork.image),
                language: artwork.language || 'null',
              };

              if (artwork.width) candidate.width = artwork.width;
              if (artwork.height) candidate.height = artwork.height;
              if (artwork.score) candidate.votes = artwork.score;

              candidates.push(candidate);
            }
          }
        }
      }

      // For episodes, use episode image if available
      if (entityType === 'episode' && assetTypes.includes('thumb')) {
        const episode = await this.tvdbClient.getEpisode(parseInt(providerResultId));

        if (episode.image) {
          candidates.push({
            providerId: 'tvdb',
            providerResultId,
            assetType: 'thumb',
            url: this.tvdbClient.getImageUrl(episode.image),
            language: 'null',
          });
        }
      }

      logger.debug('TVDB assets fetched', {
        providerResultId,
        entityType,
        totalCandidates: candidates.length,
      });

      return candidates;
    } catch (error: any) {
      logger.error('TVDB asset fetch failed', {
        providerResultId,
        entityType,
        error: error.message,
      });
      throw new Error(`TVDB asset fetch failed: ${error.message}`);
    }
  }

  // ============================================
  // Private Helper Methods
  // ============================================

  /**
   * Map TVDB image type to Metarr asset type
   */
  private mapTVDBImageTypeToAssetType(tvdbType: number): 'poster' | 'banner' | 'fanart' | 'clearlogo' | 'clearart' | null {
    switch (tvdbType) {
      case TVDBImageType.POSTER:
        return 'poster';
      case TVDBImageType.BANNER:
      case TVDBImageType.SERIES_BANNER:
        return 'banner';
      case TVDBImageType.FANART:
        return 'fanart';
      case TVDBImageType.CLEARLOGO:
        return 'clearlogo';
      case TVDBImageType.CLEARART:
        return 'clearart';
      case TVDBImageType.SEASON_POSTER:
        return 'poster';
      default:
        return null;
    }
  }

  /**
   * Calculate search confidence score
   */
  private calculateSearchConfidence(series: any, query: string, year?: number): number {
    let confidence = 50;

    // Exact title match
    if (series.name?.toLowerCase() === query.toLowerCase()) {
      confidence += 30;
    } else if (series.name?.toLowerCase().includes(query.toLowerCase())) {
      confidence += 20;
    }

    // Year match
    if (year && series.year) {
      const seriesYear = parseInt(series.year);
      if (seriesYear === year) {
        confidence += 20;
      }
    }

    // Has image
    if (series.image_url) {
      confidence += 5;
    }

    // Has overview
    if (series.overview) {
      confidence += 5;
    }

    return Math.min(confidence, 100);
  }

  /**
   * Transform TVDB series to MetadataResponse format
   */
  private transformSeriesMetadata(
    series: any,
    requestedFields?: MetadataField[]
  ): { fields: Partial<Record<MetadataField, any>>; externalIds?: Record<string, any> } {
    const fields: Partial<Record<MetadataField, any>> = {};

    const shouldInclude = (field: MetadataField) =>
      !requestedFields || requestedFields.includes(field);

    if (shouldInclude('title')) fields.title = series.name;
    if (shouldInclude('originalTitle')) fields.originalTitle = series.name;
    if (shouldInclude('plot')) fields.plot = series.overview;
    if (shouldInclude('releaseDate')) fields.releaseDate = series.firstAired;
    if (shouldInclude('premiered')) fields.premiered = series.firstAired;
    if (shouldInclude('runtime')) fields.runtime = series.averageRuntime;
    if (shouldInclude('status')) fields.status = series.status?.name;

    if (shouldInclude('genres') && series.genres) {
      fields.genres = series.genres.map((g: any) => g.name);
    }

    if (shouldInclude('actors') && series.characters) {
      fields.actors = series.characters.slice(0, 20).map((char: any) => ({
        name: char.personName || char.name,
        role: char.name,
        thumb: char.personImgURL,
      }));
    }

    if (shouldInclude('country')) {
      fields.country = series.originalCountry ? [series.originalCountry] : undefined;
    }

    const result: { fields: Partial<Record<MetadataField, any>>; externalIds?: Record<string, any> } = { fields };

    // External IDs
    if (series.remoteIds) {
      const externalIds: Record<string, any> = {};
      for (const remoteId of series.remoteIds) {
        if (remoteId.sourceName === 'IMDB') {
          externalIds.imdb = remoteId.id;
        } else if (remoteId.sourceName === 'TheMovieDB.com') {
          externalIds.tmdb = remoteId.id;
        }
      }

      if (Object.keys(externalIds).length > 0) {
        result.externalIds = externalIds;
      }
    }

    return result;
  }

  /**
   * Transform TVDB season to MetadataResponse format
   */
  private transformSeasonMetadata(
    season: any,
    requestedFields?: MetadataField[]
  ): { fields: Partial<Record<MetadataField, any>> } {
    const fields: Partial<Record<MetadataField, any>> = {};

    const shouldInclude = (field: MetadataField) =>
      !requestedFields || requestedFields.includes(field);

    if (shouldInclude('title')) fields.title = season.name || `Season ${season.number}`;
    if (shouldInclude('plot')) fields.plot = season.overview;

    return { fields };
  }

  /**
   * Transform TVDB episode to MetadataResponse format
   */
  private transformEpisodeMetadata(
    episode: any,
    requestedFields?: MetadataField[]
  ): { fields: Partial<Record<MetadataField, any>>; externalIds?: Record<string, any> } {
    const fields: Partial<Record<MetadataField, any>> = {};

    const shouldInclude = (field: MetadataField) =>
      !requestedFields || requestedFields.includes(field);

    if (shouldInclude('title')) fields.title = episode.name;
    if (shouldInclude('plot')) fields.plot = episode.overview;
    if (shouldInclude('releaseDate')) fields.releaseDate = episode.aired;
    if (shouldInclude('premiered')) fields.premiered = episode.aired;
    if (shouldInclude('runtime')) fields.runtime = episode.runtime;

    if (shouldInclude('actors') && episode.characters) {
      fields.actors = episode.characters.map((char: any) => ({
        name: char.personName || char.name,
        role: char.name,
        thumb: char.personImgURL,
      }));
    }

    const result: { fields: Partial<Record<MetadataField, any>>; externalIds?: Record<string, any> } = { fields };

    // External IDs
    if (episode.remoteIds) {
      const externalIds: Record<string, any> = {};
      for (const remoteId of episode.remoteIds) {
        if (remoteId.sourceName === 'IMDB') {
          externalIds.imdb = remoteId.id;
        }
      }

      if (Object.keys(externalIds).length > 0) {
        result.externalIds = externalIds;
      }
    }

    return result;
  }

  /**
   * Calculate metadata completeness
   */
  private calculateCompleteness(
    fields: Partial<Record<MetadataField, any>>,
    requestedFields?: MetadataField[]
  ): number {
    if (!requestedFields || requestedFields.length === 0) {
      return Object.keys(fields).length > 0 ? 1.0 : 0.0;
    }

    const filled = requestedFields.filter((field) => fields[field] !== undefined).length;
    return filled / requestedFields.length;
  }
}
