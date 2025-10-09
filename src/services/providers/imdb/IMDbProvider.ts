/**
 * IMDb Provider
 *
 * LEGAL DISCLAIMER:
 * This provider uses web scraping to extract data from IMDb.com, which violates
 * IMDb's Terms of Service. Use at your own risk and legal responsibility.
 *
 * Concrete implementation of BaseProvider for IMDb (web scraping).
 * Provides ratings, vote counts, and supplementary metadata.
 */

import { BaseProvider } from '../BaseProvider.js';
import { IMDbClient } from './IMDbClient.js';
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
} from '../../../types/providers/index.js';
import { ProviderConfig } from '../../../types/provider.js';
import { logger } from '../../../middleware/logging.js';

export class IMDbProvider extends BaseProvider {
  private imdbClient: IMDbClient;

  constructor(config: ProviderConfig, options?: ProviderOptions) {
    super(config, options);

    // Initialize IMDb scraping client
    this.imdbClient = new IMDbClient();

    logger.info('IMDb Provider initialized (web scraping - violates IMDb ToS)', {
      providerId: this.capabilities.id,
      version: this.capabilities.version,
    });
  }

  /**
   * Create rate limiter for IMDb scraping
   * Conservative rate limiting to avoid IP bans
   */
  protected createRateLimiter(): RateLimiter {
    const capabilities = this.getCapabilities();
    return new RateLimiter({
      requestsPerSecond: capabilities.rateLimit.requestsPerSecond,
      burstCapacity: capabilities.rateLimit.burstCapacity,
      windowSeconds: 60, // 1-minute window
    });
  }

  /**
   * Define IMDb provider capabilities
   */
  defineCapabilities(): ProviderCapabilities {
    return {
      id: 'imdb',
      name: 'Internet Movie Database (IMDb)',
      version: '1.0.0',
      category: 'metadata',

      supportedEntityTypes: ['movie', 'series', 'episode'],

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
        // IMDb scraping does not provide downloadable assets
        // Only metadata and URLs to images (which we don't download due to ToS)
      },

      authentication: {
        type: 'none',
        required: false,
      },

      rateLimit: {
        requestsPerSecond: 1, // Very conservative to avoid bans
        burstCapacity: 3,
        webhookReservedCapacity: 0,
        enforcementType: 'client',
      },

      search: {
        supported: true,
        fuzzyMatching: true,
        multiLanguage: false, // IMDb defaults to English
        yearFilter: false, // Filtering done client-side
        externalIdLookup: ['imdb_id'], // Can search by IMDb ID
      },

      dataQuality: {
        metadataCompleteness: 0.95, // Very complete metadata
        imageQuality: 0.0, // We don't provide images due to ToS
        updateFrequency: 'realtime', // IMDb updates frequently
        userContributed: true,
        curatedContent: false,
      },

      assetProvision: {
        providesUrls: false, // Don't provide image URLs due to ToS
        providesDirectDownload: false,
        thumbnailUrls: false,
        multipleQualities: false,
        maxResultsPerType: 0,
        qualityHints: false,
        languagePerAsset: false,
      },

      specialFeatures: {
        // No special features
      },
    };
  }

  /**
   * Search for movies/series by title or IMDb ID
   */
  async search(request: SearchRequest): Promise<SearchResult[]> {
    const { query, entityType, year, externalId } = request;

    try {
      // If IMDb ID is provided, return direct match
      if (externalId?.type === 'imdb_id' && externalId.value) {
        const imdbId = externalId.value;
        logger.debug(`Direct IMDb ID lookup: ${imdbId}`);

        // Fetch details to get title for search result
        let details;
        if (entityType === 'series') {
          details = await this.imdbClient.getSeriesDetails(imdbId);
        } else {
          details = await this.imdbClient.getMovieDetails(imdbId);
        }

        return [
          {
            providerId: 'imdb',
            providerResultId: imdbId,
            title: details.title,
            confidence: 1.0, // Exact ID match
            externalIds: { imdb: imdbId },
            metadata: {
              year: details.year,
              originalTitle: details.originalTitle,
              rating: details.rating,
              voteCount: details.voteCount,
            },
          },
        ];
      }

      // Search by title
      if (!query) {
        throw new Error('Query or IMDb ID required for search');
      }

      const searchType = entityType === 'series' ? 'tv' : 'movie';
      const searchResults = await this.imdbClient.search(query, searchType);

      // Convert to SearchResult format
      const results: SearchResult[] = searchResults.map((result) => {
        let confidence = 0.5; // Base confidence for search results

        // Boost confidence for exact title match
        if (result.title.toLowerCase() === query.toLowerCase()) {
          confidence = 0.95;
        } else if (result.title.toLowerCase().includes(query.toLowerCase())) {
          confidence = 0.75;
        }

        // Boost confidence for year match
        if (year && result.year === year) {
          confidence = Math.min(confidence + 0.1, 1.0);
        }

        return {
          providerId: 'imdb',
          providerResultId: result.imdbId,
          title: result.title,
          confidence,
          externalIds: { imdb: result.imdbId },
          metadata: {
            year: result.year,
            type: result.type,
            imageUrl: result.imageUrl,
          },
        };
      });

      logger.info(`IMDb search for "${query}" returned ${results.length} results`);
      return results;
    } catch (error: any) {
      logger.error('IMDb search failed', {
        query,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get detailed metadata for a movie or series
   */
  async getMetadata(request: MetadataRequest): Promise<MetadataResponse> {
    const { providerResultId, entityType } = request;

    // Determine IMDb ID
    const imdbId = providerResultId;
    if (!imdbId) {
      throw new Error('IMDb ID required for metadata request');
    }

    try {
      let details;
      if (entityType === 'series') {
        details = await this.imdbClient.getSeriesDetails(imdbId);
      } else {
        details = await this.imdbClient.getMovieDetails(imdbId);
      }

      // Build metadata response using fields structure
      const fields: Partial<Record<string, any>> = {
        title: details.title,
      };

      if (details.originalTitle) fields.originalTitle = details.originalTitle;
      if (details.plot) fields.plot = details.plot;
      if (details.tagline) fields.tagline = details.tagline;
      if (details.genres) fields.genres = details.genres;
      if (details.certification) fields.certification = details.certification;
      if (details.studios) fields.studios = details.studios;
      if (details.countries) fields.country = details.countries;
      if (details.releaseDate) fields.releaseDate = details.releaseDate;

      // Add ratings
      if (details.rating && details.voteCount) {
        fields.ratings = [
          {
            source: 'imdb',
            value: details.rating,
            votes: details.voteCount,
            maxValue: 10,
          },
        ];
      }

      // Add cast and crew
      if (details.directors && details.directors.length > 0) {
        fields.directors = details.directors;
      }
      if (details.writers && details.writers.length > 0) {
        fields.writers = details.writers;
      }
      if (details.cast && details.cast.length > 0) {
        fields.actors = details.cast.map((c) => c.name);
      }

      // Add runtime for movies
      if ('runtime' in details && details.runtime) {
        fields.runtime = details.runtime;
      }

      // Add series-specific fields
      if ('type' in details && details.type === 'tvSeries') {
        if (details.premiered) fields.premiered = details.premiered;
      }

      const metadata: MetadataResponse = {
        providerId: 'imdb',
        providerResultId: imdbId,
        fields,
        externalIds: { imdb: imdbId },
        completeness: 0.9, // IMDb provides very complete metadata
        confidence: 1.0, // Direct ID lookup is authoritative
      };

      logger.info(`Retrieved IMDb metadata for ${imdbId}`, { title: details.title });
      return metadata;
    } catch (error: any) {
      logger.error('IMDb metadata retrieval failed', {
        imdbId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get assets - IMDb provider does not provide downloadable assets
   */
  async getAssets(_request: AssetRequest): Promise<AssetCandidate[]> {
    logger.debug('IMDb provider does not provide downloadable assets (ToS compliance)');
    return [];
  }

  /**
   * Test connection - always succeeds for web scraping
   */
  async testConnection() {
    try {
      // Try a simple search to verify IMDb is accessible
      await this.imdbClient.search('test', 'movie');
      return {
        success: true,
        message: 'IMDb is accessible (WARNING: Web scraping violates IMDb ToS)',
      };
    } catch (error: any) {
      return {
        success: false,
        message: `IMDb access failed: ${error.message}`,
        error: error.message,
      };
    }
  }
}
