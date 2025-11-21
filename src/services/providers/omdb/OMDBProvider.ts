/**
 * OMDB Provider
 *
 * Concrete implementation of BaseProvider for the Open Movie Database (OMDb API).
 * Provides metadata enrichment with a focus on ratings and detailed plot information.
 */

import { BaseProvider } from '../BaseProvider.js';
import { OMDBClient } from './OMDBClient.js';
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
import { ValidationError } from '../../../errors/index.js';
import {
  OMDBMovieData,
  OMDBSearchResult,
  OMDBSearchOptions,
} from '../../../types/providers/omdb.js';

/**
 * Rating structure for Metarr
 */
interface Rating {
  source: string;
  value: number;
  votes?: number;
  maxValue: number;
}

export class OMDBProvider extends BaseProvider {
  private omdbClient: OMDBClient;

  constructor(config: ProviderConfig, options?: ProviderOptions) {
    super(config, options);

    // Disable if no API key
    if (!config.apiKey || config.apiKey === '') {
      // Mark as not enabled - provider cannot function without API key
      // Note: enabled property is managed by parent class
      logger.info('OMDB provider disabled: No API key configured');
      return;
    }

    // Initialize OMDB client
    this.omdbClient = new OMDBClient({
      apiKey: config.apiKey,
      baseUrl: (options?.baseUrl as string) || 'https://www.omdbapi.com',
      timeout: (options?.timeout as number) || 10000,
    });

    logger.info('OMDB Provider initialized', {
      providerId: this.capabilities.id,
      version: this.capabilities.version,
    });
  }

  /**
   * Create rate limiter for OMDB API
   * OMDB free tier: 1000 requests/day ≈ 0.011 requests/second
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
   * Define OMDB provider capabilities
   */
  defineCapabilities(): ProviderCapabilities {
    return {
      id: 'omdb',
      name: 'OMDb API',
      version: '1.0.0',
      category: 'metadata',

      supportedEntityTypes: ['movie', 'series', 'episode'],

      supportedMetadataFields: {
        movie: [
          'title',
          'originalTitle',
          'plot',
          'outline',
          'releaseDate',
          'runtime',
          'ratings',
          'genres',
          'directors',
          'writers',
          'actors',
          'certification',
          'country',
        ],
        series: [
          'title',
          'plot',
          'outline',
          'ratings',
          'genres',
          'actors',
          'premiered',
          'certification',
        ],
        episode: ['title', 'plot', 'directors', 'writers', 'actors'],
      },

      supportedAssetTypes: {
        movie: ['poster'],
        series: ['poster'],
        episode: [],
      },

      authentication: {
        type: 'api_key',
        required: true,
      },

      rateLimit: {
        requestsPerSecond: 0.011, // 1000 requests/day ≈ 0.011/sec
        burstCapacity: 5,
        webhookReservedCapacity: 0,
        enforcementType: 'client',
      },

      search: {
        supported: true,
        fuzzyMatching: true,
        multiLanguage: false,
        yearFilter: true,
        externalIdLookup: ['imdb_id'],
      },

      dataQuality: {
        metadataCompleteness: 1.0, // Excellent text metadata
        imageQuality: 0.3, // Low-res posters only
        updateFrequency: 'daily',
        userContributed: true,
        curatedContent: false,
      },

      assetProvision: {
        providesUrls: true,
        providesDirectDownload: false,
        thumbnailUrls: false,
        multipleQualities: false,
        maxResultsPerType: 1, // Single poster per entity
        qualityHints: false,
        languagePerAsset: false,
      },
    };
  }

  /**
   * Search for movies/series
   */
  async search(request: SearchRequest): Promise<SearchResult[]> {
    const { query, entityType, year, externalId } = request;

    // Only support movie and series searches
    if (entityType !== 'movie' && entityType !== 'series') {
      return [];
    }

    // Direct IMDb ID lookup
    if (externalId?.type === 'imdb_id' && externalId.value) {
      try {
        const data = await this.executeRequest(
          () => this.omdbClient.getById(externalId.value),
          'search-by-imdb-id',
          'user'
        );

        return [
          {
            providerId: 'omdb',
            providerResultId: data.imdbID,
            title: data.Title,
            confidence: 1.0, // Exact match via IMDb ID
            externalIds: { imdb: data.imdbID },
            metadata: {
              year: data.Year !== 'N/A' ? parseInt(data.Year, 10) : undefined,
              rating: data.imdbRating !== 'N/A' ? parseFloat(data.imdbRating) : undefined,
            },
          },
        ];
      } catch (error) {
        logger.error('OMDB search by IMDb ID failed', {
          imdbId: externalId.value,
          error: error instanceof Error ? error.message : String(error),
        });
        return [];
      }
    }

    // Title search
    try {
      const searchOptions: OMDBSearchOptions = {
        query,
        type: entityType === 'series' ? 'series' : 'movie',
      };

      if (year) {
        searchOptions.year = year;
      }

      const results = await this.executeRequest(
        () => this.omdbClient.search(searchOptions),
        'search-by-title',
        'user'
      );

      return results.map(
        (r): SearchResult => ({
          providerId: 'omdb',
          providerResultId: r.imdbID,
          title: r.Title,
          confidence: this.calculateSearchConfidence(r, query, year),
          externalIds: { imdb: r.imdbID },
          metadata: {
            year: r.Year !== 'N/A' ? parseInt(r.Year, 10) : undefined,
          },
          ...(r.Poster && r.Poster !== 'N/A' && { posterUrl: r.Poster }),
        })
      );
    } catch (error) {
      logger.error('OMDB title search failed', {
        query,
        entityType,
        year,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Get metadata for a movie/series/episode
   */
  async getMetadata(request: MetadataRequest): Promise<MetadataResponse> {
    const { providerResultId, entityType, fields } = request;

    if (entityType !== 'movie' && entityType !== 'series' && entityType !== 'episode') {
      throw new ValidationError(`OMDB provider does not support entity type: ${entityType}`);
    }

    try {
      const data = await this.executeRequest(
        () => this.omdbClient.getById(providerResultId),
        'get-metadata',
        'user'
      );

      const transformedData = this.transformMetadata(data, fields);

      return {
        providerId: 'omdb',
        providerResultId: data.imdbID,
        fields: transformedData.fields,
        externalIds: transformedData.externalIds,
        completeness: this.calculateCompleteness(transformedData.fields, fields),
        confidence: 1.0, // OMDB is highly reliable for its data
      };
    } catch (error) {
      const parsedError = this.parseHttpError(error, providerResultId);
      logger.error('OMDB metadata fetch failed', {
        providerResultId,
        entityType,
        error: parsedError.message,
      });
      throw parsedError;
    }
  }

  /**
   * Get asset candidates (posters only) for a movie/series
   */
  async getAssets(request: AssetRequest): Promise<AssetCandidate[]> {
    const { providerResultId, entityType, assetTypes } = request;

    if (entityType !== 'movie' && entityType !== 'series') {
      return [];
    }

    // OMDB only provides posters
    if (!assetTypes.includes('poster')) {
      return [];
    }

    try {
      const data = await this.executeRequest(
        () => this.omdbClient.getById(providerResultId),
        'get-assets',
        'background'
      );

      if (!data.Poster || data.Poster === 'N/A') {
        return [];
      }

      return [
        {
          providerId: 'omdb',
          providerResultId: data.imdbID,
          assetType: 'poster',
          url: data.Poster,
          // OMDB doesn't provide dimensions or quality metrics
          // Scoring will naturally rank 300px posters lower than HD alternatives
        },
      ];
    } catch (error) {
      logger.error('OMDB asset fetch failed', {
        providerResultId,
        entityType,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Test connection to OMDB API
   */
  async testConnection(): Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }> {
    try {
      // Test with a known good IMDb ID (The Matrix)
      await this.executeRequest(
        () => this.omdbClient.getById('tt0133093'),
        'test-connection',
        'user'
      );

      return {
        success: true,
        message: 'Successfully connected to OMDB API',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ============================================
  // Private Helper Methods
  // ============================================

  /**
   * Calculate search confidence score based on title match and year
   */
  private calculateSearchConfidence(
    result: OMDBSearchResult,
    query: string,
    year?: number
  ): number {
    let confidence = 50; // Base confidence

    // Exact title match
    if (result.Title.toLowerCase() === query.toLowerCase()) {
      confidence += 40;
    } else if (result.Title.toLowerCase().includes(query.toLowerCase())) {
      confidence += 25;
    } else if (query.toLowerCase().includes(result.Title.toLowerCase())) {
      confidence += 20;
    }

    // Year match
    if (year && result.Year !== 'N/A') {
      const resultYear = parseInt(result.Year, 10);
      if (resultYear === year) {
        confidence += 30;
      } else if (Math.abs(resultYear - year) === 1) {
        // Off by one year
        confidence += 10;
      }
    }

    return Math.min(confidence, 100);
  }

  /**
   * Transform OMDB response to MetadataResponse format
   */
  private transformMetadata(
    data: OMDBMovieData,
    requestedFields?: MetadataField[]
  ): {
    fields: Partial<Record<MetadataField, unknown>>;
    externalIds: Record<string, string | number>;
  } {
    const fields: Partial<Record<MetadataField, unknown>> = {};

    // Only include requested fields if specified
    const shouldInclude = (field: MetadataField): boolean =>
      !requestedFields || requestedFields.includes(field);

    // Basic fields
    if (shouldInclude('title')) fields.title = data.Title;
    if (shouldInclude('originalTitle')) fields.originalTitle = data.Title;

    // Plot and outline
    if (shouldInclude('plot')) {
      fields.plot = data.Plot !== 'N/A' ? data.Plot : undefined;
    }
    if (shouldInclude('outline')) {
      // OMDBClient fetches short plot separately and provides it as Outline
      fields.outline = data.Outline !== 'N/A' ? data.Outline : undefined;
    }

    // Release date
    if (shouldInclude('releaseDate') && data.Released !== 'N/A') {
      fields.releaseDate = data.Released;
    }

    // Runtime
    if (shouldInclude('runtime') && data.Runtime !== 'N/A') {
      fields.runtime = this.parseRuntime(data.Runtime);
    }

    // Genres
    if (shouldInclude('genres') && data.Genre !== 'N/A') {
      fields.genres = data.Genre.split(', ').map((g) => g.trim());
    }

    // Directors
    if (shouldInclude('directors') && data.Director !== 'N/A') {
      fields.directors = data.Director.split(', ').map((d) => d.trim());
    }

    // Writers
    if (shouldInclude('writers') && data.Writer !== 'N/A') {
      fields.writers = data.Writer.split(', ').map((w) => w.trim());
    }

    // Actors
    if (shouldInclude('actors') && data.Actors !== 'N/A') {
      fields.actors = data.Actors.split(', ').map((a) => a.trim());
    }

    // Certification
    if (shouldInclude('certification') && data.Rated !== 'N/A') {
      fields.certification = data.Rated;
    }

    // Country
    if (shouldInclude('country') && data.Country !== 'N/A') {
      fields.country = data.Country.split(', ').map((c) => c.trim());
    }

    // Ratings (IMDb + Rotten Tomatoes + Metacritic)
    if (shouldInclude('ratings')) {
      fields.ratings = this.parseRatings(data);
    }

    return {
      fields,
      externalIds: { imdb: data.imdbID },
    };
  }

  /**
   * Parse ratings from OMDB response
   * Includes IMDb, Rotten Tomatoes, and Metacritic ratings
   */
  private parseRatings(data: OMDBMovieData): Rating[] {
    const ratings: Rating[] = [];

    // IMDb rating
    if (data.imdbRating && data.imdbRating !== 'N/A') {
      const rating: Rating = {
        source: 'imdb',
        value: parseFloat(data.imdbRating),
        maxValue: 10,
      };

      // Add votes if available
      if (data.imdbVotes !== 'N/A') {
        rating.votes = parseInt(data.imdbVotes.replace(/,/g, ''), 10);
      }

      ratings.push(rating);
    }

    // Additional ratings (Rotten Tomatoes, Metacritic)
    if (data.Ratings && Array.isArray(data.Ratings)) {
      data.Ratings.forEach((r) => {
        if (r.Source === 'Rotten Tomatoes') {
          const value = parseInt(r.Value.replace('%', ''), 10);
          if (!isNaN(value)) {
            ratings.push({
              source: 'rottentomatoes',
              value,
              maxValue: 100,
            });
          }
        } else if (r.Source === 'Metacritic') {
          const match = r.Value.match(/^(\d+)/);
          if (match) {
            const value = parseInt(match[1], 10);
            if (!isNaN(value)) {
              ratings.push({
                source: 'metacritic',
                value,
                maxValue: 100,
              });
            }
          }
        }
      });
    }

    return ratings;
  }

  /**
   * Parse runtime string to minutes
   * Example: "136 min" → 136
   */
  private parseRuntime(runtime: string): number | undefined {
    const match = runtime.match(/^(\d+)/);
    if (match) {
      return parseInt(match[1], 10);
    }
    return undefined;
  }

  /**
   * Calculate metadata completeness (0-1)
   */
  private calculateCompleteness(
    fields: Partial<Record<MetadataField, unknown>>,
    requestedFields?: MetadataField[]
  ): number {
    if (!requestedFields || requestedFields.length === 0) {
      // No specific fields requested, count filled fields
      const filledFields = Object.values(fields).filter((v) => v !== undefined).length;
      return filledFields > 0 ? 1.0 : 0.0;
    }

    // Count how many requested fields were filled
    const filled = requestedFields.filter((field) => fields[field] !== undefined).length;
    return filled / requestedFields.length;
  }
}
