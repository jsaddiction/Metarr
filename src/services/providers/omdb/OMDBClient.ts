/**
 * OMDB API Client
 * Handles all interactions with the OMDb API (Open Movie Database)
 *
 * Features:
 * - Dual plot fetching (short and full) with caching
 * - Rate limiting (1000/day free tier, 100K/day paid)
 * - Circuit breaker for fault tolerance
 * - Retry strategy with exponential backoff
 * - Comprehensive error handling
 *
 * @see https://www.omdbapi.com/
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { logger } from '../../../middleware/logging.js';
import { RateLimiter } from '../tmdb/RateLimiter.js';
import { CircuitBreaker } from '../utils/CircuitBreaker.js';
import {
  AuthenticationError,
  ResourceNotFoundError,
  RateLimitError,
  ProviderError,
  ProviderServerError,
  NetworkError,
  ValidationError,
  ErrorCode,
  NETWORK_RETRY_POLICY,
  RetryStrategy,
} from '../../../errors/index.js';
import {
  OMDBClientOptions,
  OMDBSearchOptions,
  OMDBSearchResponse,
  OMDBSearchResult,
  OMDBMovieData,
  OMDBEpisodeData,
  OMDBErrorResponse,
  OMDBPlotCache,
} from '../../../types/providers/omdb.js';

/**
 * OMDB API Client
 *
 * Implements dual plot fetching strategy to get both short and full plot descriptions
 * in a single getById() call, with intelligent caching to minimize API usage.
 */
export class OMDBClient {
  private readonly client: AxiosInstance;
  private readonly rateLimiter: RateLimiter;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly retryStrategy: RetryStrategy;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  // In-memory cache for plot data (7 day TTL like other providers)
  private readonly plotCache = new Map<string, OMDBPlotCache>();
  private readonly CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

  constructor(options: OMDBClientOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl || 'https://www.omdbapi.com';

    // Initialize rate limiter
    // Free tier: 1000/day = ~0.7/min = ~1/100sec
    // Paid tier: 100K/day = ~70/min = ~1.2/sec
    // Conservative: 10 requests per 15 seconds (40/min)
    this.rateLimiter = new RateLimiter(10, 15);

    // Initialize circuit breaker
    this.circuitBreaker = new CircuitBreaker({
      threshold: 5,
      resetTimeoutMs: 5 * 60 * 1000, // 5 minutes
      providerName: 'OMDB',
    });

    // Initialize retry strategy with network-specific policy
    this.retryStrategy = new RetryStrategy({
      ...NETWORK_RETRY_POLICY,
      onRetry: (error, attemptNumber, delayMs): void => {
        logger.info('Retrying OMDB request', {
          error: error.message,
          attemptNumber,
          delayMs,
        });
      },
    });

    // Initialize axios client
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: options.timeout || 10000, // 10 second timeout
      params: {
        apikey: this.apiKey,
      },
    });
  }

  // ============================================
  // Public API Methods
  // ============================================

  /**
   * Search for movies or series by title
   *
   * @param options Search parameters including query, type, year, and page
   * @returns Array of search results
   * @throws {ValidationError} If query is empty
   * @throws {ResourceNotFoundError} If no results found
   */
  async search(options: OMDBSearchOptions): Promise<OMDBSearchResult[]> {
    if (!options.query || options.query.trim().length === 0) {
      throw new ValidationError('Search query cannot be empty', {
        service: 'OMDBClient',
        operation: 'search',
        metadata: { field: 'query', value: options.query },
      });
    }

    const params: Record<string, string | number> = {
      s: options.query.trim(),
    };

    if (options.type) {
      params.type = options.type;
    }

    if (options.year) {
      params.y = options.year;
    }

    if (options.page) {
      params.page = options.page;
    }

    const response = await this.request<OMDBSearchResponse>(params);

    if (response.Response === 'False') {
      this.parseError(response as OMDBErrorResponse, options.query);
    }

    if (!response.Search || response.Search.length === 0) {
      throw new ResourceNotFoundError(
        'provider-resource',
        options.query,
        `No ${options.type || 'media'} found matching: ${options.query}`,
        {
          service: 'OMDBClient',
          operation: 'search',
          metadata: { options },
        }
      );
    }

    logger.debug('OMDB search successful', {
      query: options.query,
      resultCount: response.Search.length,
      totalResults: response.totalResults,
    });

    return response.Search;
  }

  /**
   * Get detailed movie/series data by IMDb ID
   *
   * This method fetches BOTH short and full plot descriptions in parallel,
   * caching the results to minimize API calls. The returned data includes:
   * - Plot: Full plot description
   * - Outline: Short plot description
   *
   * @param imdbId IMDb ID (e.g., "tt0111161")
   * @returns Complete movie/series data with both plot versions
   * @throws {ValidationError} If IMDb ID is invalid
   * @throws {ResourceNotFoundError} If movie/series not found
   */
  async getById(imdbId: string): Promise<OMDBMovieData> {
    // Validate IMDb ID format
    if (!imdbId || !imdbId.match(/^tt\d+$/)) {
      throw new ValidationError('Invalid IMDb ID format', {
        service: 'OMDBClient',
        operation: 'getById',
        metadata: {
          field: 'imdbId',
          value: imdbId,
          expected: 'tt followed by digits (e.g., tt0111161)',
        },
      });
    }

    // Check cache first
    const cached = this.plotCache.get(imdbId);
    const now = Date.now();

    if (cached && (now - cached.timestamp) < this.CACHE_TTL_MS) {
      logger.debug('Using cached plot data', { imdbId });

      // Fetch basic data with full plot (already cached)
      const data = await this.fetchByIdWithPlot(imdbId, 'full');
      return {
        ...data,
        Plot: cached.fullPlot,
        Outline: cached.shortPlot,
      };
    }

    // Cache miss - fetch both plots in parallel
    logger.debug('Fetching both plot versions', { imdbId });

    const [fullData, shortData] = await Promise.all([
      this.fetchByIdWithPlot(imdbId, 'full'),
      this.fetchByIdWithPlot(imdbId, 'short'),
    ]);

    // Cache the plots
    this.plotCache.set(imdbId, {
      fullPlot: fullData.Plot,
      shortPlot: shortData.Plot,
      timestamp: now,
    });

    // Clean old cache entries periodically (simple approach)
    this.cleanExpiredCache();

    logger.debug('OMDB data fetched and cached', {
      imdbId,
      title: fullData.Title,
      hasFullPlot: fullData.Plot !== 'N/A',
      hasShortPlot: shortData.Plot !== 'N/A',
    });

    // Return combined data with both plots
    return {
      ...fullData,
      Outline: shortData.Plot,
    };
  }

  /**
   * Get episode data by series IMDb ID, season, and episode number
   *
   * @param imdbId Series IMDb ID
   * @param season Season number
   * @param episode Episode number
   * @returns Episode data
   * @throws {ValidationError} If parameters are invalid
   * @throws {ResourceNotFoundError} If episode not found
   */
  async getEpisode(
    imdbId: string,
    season: number,
    episode: number
  ): Promise<OMDBEpisodeData> {
    // Validate inputs
    if (!imdbId || !imdbId.match(/^tt\d+$/)) {
      throw new ValidationError('Invalid IMDb ID format', {
        service: 'OMDBClient',
        operation: 'getEpisode',
        metadata: { field: 'imdbId', value: imdbId },
      });
    }

    if (!Number.isInteger(season) || season < 1) {
      throw new ValidationError('Invalid season number', {
        service: 'OMDBClient',
        operation: 'getEpisode',
        metadata: { field: 'season', value: season, expected: 'positive integer' },
      });
    }

    if (!Number.isInteger(episode) || episode < 1) {
      throw new ValidationError('Invalid episode number', {
        service: 'OMDBClient',
        operation: 'getEpisode',
        metadata: { field: 'episode', value: episode, expected: 'positive integer' },
      });
    }

    const params = {
      i: imdbId,
      Season: season.toString(),
      Episode: episode.toString(),
    };

    const response = await this.request<OMDBEpisodeData>(params);

    if (response.Response === 'False') {
      this.parseError(response as OMDBErrorResponse, imdbId);
    }

    logger.debug('OMDB episode fetched', {
      imdbId,
      season,
      episode,
      title: response.Title,
    });

    return response;
  }

  /**
   * Get rate limiter statistics
   */
  getRateLimiterStats(): {
    requestsInWindow: number;
    remainingRequests: number;
    cacheSize: number;
  } {
    return {
      requestsInWindow: this.rateLimiter.getRequestCount(),
      remainingRequests: this.rateLimiter.getRemainingRequests(),
      cacheSize: this.plotCache.size,
    };
  }

  /**
   * Clear the plot cache (useful for testing)
   */
  clearCache(): void {
    this.plotCache.clear();
    logger.debug('OMDB plot cache cleared');
  }

  // ============================================
  // Private Helper Methods
  // ============================================

  /**
   * Fetch movie/series data with specific plot type
   */
  private async fetchByIdWithPlot(
    imdbId: string,
    plot: 'short' | 'full'
  ): Promise<OMDBMovieData> {
    const params = {
      i: imdbId,
      plot,
    };

    const response = await this.request<OMDBMovieData>(params);

    if (response.Response === 'False') {
      this.parseError(response as OMDBErrorResponse, imdbId);
    }

    // Validate data completeness (reject if <60% of fields are "N/A")
    this.validateDataCompleteness(response, imdbId);

    return response;
  }

  /**
   * Make API request with rate limiting, retries, and circuit breaker
   */
  private async request<T>(params: Record<string, string | number>): Promise<T> {
    // Execute through circuit breaker
    return this.circuitBreaker.execute(async () => {
      // Execute through retry strategy
      return this.retryStrategy.execute(async () => {
        // Execute through rate limiter
        return this.rateLimiter.execute(async () => {
          try {
            const response = await this.client.get<T>('/', { params });

            logger.debug('OMDB API request successful', {
              params,
              status: response.status,
              rateLimiter: this.getRateLimiterStats(),
            });

            return response.data;
          } catch (error) {
            throw this.convertToApplicationError(error, params);
          }
        });
      }, 'OMDB request');
    });
  }

  /**
   * Parse OMDB error responses and throw appropriate application errors
   */
  private parseError(response: OMDBErrorResponse, identifier: string): never {
    const errorMsg = response.Error;

    // Invalid API key
    if (errorMsg === 'Invalid API key!' || errorMsg?.includes('API key')) {
      throw new AuthenticationError(
        'OMDB API key is invalid. Get yours at https://www.omdbapi.com/apikey.aspx',
        { service: 'OMDBClient', operation: 'request' }
      );
    }

    // Not found
    if (
      errorMsg === 'Movie not found!' ||
      errorMsg === 'Series not found!' ||
      errorMsg === 'Episode not found!' ||
      errorMsg === 'Incorrect IMDb ID.'
    ) {
      throw new ResourceNotFoundError(
        'provider-resource',
        identifier,
        `Not found in OMDB: ${errorMsg}`,
        { service: 'OMDBClient', operation: 'getById' }
      );
    }

    // Rate limit
    if (errorMsg === 'Daily limit reached!' || errorMsg?.includes('limit')) {
      throw new RateLimitError(
        'OMDB',
        86400, // Retry after 24 hours
        'OMDB daily request limit reached',
        { service: 'OMDBClient', operation: 'request' }
      );
    }

    // Generic error
    throw new ProviderError(
      errorMsg,
      'OMDB',
      ErrorCode.PROVIDER_INVALID_RESPONSE,
      400,
      false,
      { service: 'OMDBClient', operation: 'request' }
    );
  }

  /**
   * Convert Axios errors to ApplicationError types
   */
  private convertToApplicationError(
    error: unknown,
    params: Record<string, string | number>
  ): Error {
    const axiosError = error as AxiosError;
    const context = {
      service: 'OMDBClient',
      operation: 'request',
      metadata: { params },
    };

    // Handle HTTP response errors
    if (axiosError.response) {
      const status = axiosError.response.status;
      const message = axiosError.message;

      switch (status) {
        case 401:
          return new AuthenticationError(
            `OMDB authentication failed: ${message}`,
            { ...context, metadata: { ...context.metadata, status } },
            axiosError
          );

        case 404:
          return new ResourceNotFoundError(
            'OMDB resource',
            JSON.stringify(params),
            `Resource not found: ${message}`,
            { ...context, metadata: { ...context.metadata, status } }
          );

        case 429: {
          const retryAfter = axiosError.response.headers?.['retry-after'];
          return new RateLimitError(
            'OMDB',
            parseInt(retryAfter as string) || 86400,
            `Rate limit exceeded: ${message}`,
            { ...context, metadata: { ...context.metadata, status, retryAfter } }
          );
        }

        case 500:
        case 502:
        case 503:
        case 504:
          return new ProviderServerError(
            'OMDB',
            status,
            `Server error: ${message}`,
            { ...context, metadata: { ...context.metadata, status } },
            axiosError
          );

        default:
          return new ProviderServerError(
            'OMDB',
            status,
            `API error (${status}): ${message}`,
            { ...context, metadata: { ...context.metadata, status } },
            axiosError
          );
      }
    }

    // Network errors (timeout, connection refused, etc.)
    if (axiosError.code === 'ECONNABORTED' || axiosError.code === 'ETIMEDOUT') {
      return new NetworkError(
        `OMDB request timeout`,
        ErrorCode.NETWORK_TIMEOUT,
        this.baseUrl,
        { ...context, metadata: { ...context.metadata, code: axiosError.code } },
        axiosError
      );
    }

    return new NetworkError(
      `OMDB network error: ${axiosError.message}`,
      ErrorCode.NETWORK_CONNECTION_FAILED,
      this.baseUrl,
      { ...context, metadata: { ...context.metadata, code: axiosError.code } },
      axiosError
    );
  }

  /**
   * Validate that movie data is sufficiently complete
   * Rejects if more than 40% of fields are "N/A"
   */
  private validateDataCompleteness(data: OMDBMovieData, imdbId: string): void {
    const fields = [
      'Title',
      'Year',
      'Rated',
      'Released',
      'Runtime',
      'Genre',
      'Director',
      'Writer',
      'Actors',
      'Plot',
      'Language',
      'Country',
      'Poster',
      'imdbRating',
    ];

    const naCount = fields.filter(
      field => data[field as keyof OMDBMovieData] === 'N/A'
    ).length;

    const completeness = ((fields.length - naCount) / fields.length) * 100;

    if (completeness < 60) {
      logger.warn('OMDB data incomplete', {
        imdbId,
        completeness: `${completeness.toFixed(1)}%`,
        naCount,
        totalFields: fields.length,
      });

      throw new ValidationError(
        `OMDB data for ${imdbId} is incomplete (${completeness.toFixed(1)}% complete)`,
        {
          service: 'OMDBClient',
          operation: 'validateDataCompleteness',
          metadata: {
            field: 'data',
            value: imdbId,
            completeness,
            naCount,
            totalFields: fields.length,
          },
        }
      );
    }
  }

  /**
   * Clean expired entries from plot cache
   * Called periodically during cache operations
   */
  private cleanExpiredCache(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [imdbId, cache] of this.plotCache.entries()) {
      if (now - cache.timestamp >= this.CACHE_TTL_MS) {
        this.plotCache.delete(imdbId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.debug('Cleaned expired cache entries', {
        cleanedCount,
        remainingSize: this.plotCache.size,
      });
    }
  }
}
