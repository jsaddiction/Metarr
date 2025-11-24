/**
 * TMDB API Client
 * Handles all interactions with The Movie Database API
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { logger } from '../../../middleware/logging.js';
import { RateLimiter } from './RateLimiter.js';
import { CircuitBreaker } from '../utils/CircuitBreaker.js';
import {
  AuthenticationError,
  ResourceNotFoundError,
  RateLimitError,
  ProviderServerError,
  NetworkError,
  ValidationError,
  ErrorCode,
  NETWORK_RETRY_POLICY,
  RetryStrategy,
} from '../../../errors/index.js';
import {
  TMDBClientOptions,
  TMDBMovie,
  TMDBSearchOptions,
  TMDBMovieSearchResponse,
  TMDBMovieDetailsOptions,
  TMDBFindOptions,
  TMDBFindResponse,
  TMDBCollection,
  TMDBConfiguration,
  TMDBError,
  TMDBImageSize,
  TMDBImageType,
  TMDBImage,
  TMDBVideo,
  TMDBChangesAPIResponse,
  TMDBChangesResponse,
} from '../../../types/providers/tmdb.js';

export class TMDBClient {
  private readonly client: AxiosInstance;
  private readonly rateLimiter: RateLimiter;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly retryStrategy: RetryStrategy;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly imageBaseUrl: string;
  private readonly language: string;
  private readonly includeAdult: boolean;

  constructor(options: TMDBClientOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl || 'https://api.themoviedb.org/3';
    this.imageBaseUrl = options.imageBaseUrl || 'https://image.tmdb.org/t/p';
    this.language = options.language || 'en-US';
    this.includeAdult = options.includeAdult ?? false;

    // Initialize rate limiter (40 requests per 10 seconds)
    this.rateLimiter = new RateLimiter(40, 10);

    // Initialize circuit breaker
    this.circuitBreaker = new CircuitBreaker({
      threshold: 5,
      resetTimeoutMs: 5 * 60 * 1000, // 5 minutes
      providerName: 'TMDB',
    });

    // Initialize retry strategy with network-specific policy
    this.retryStrategy = new RetryStrategy({
      ...NETWORK_RETRY_POLICY,
      onRetry: (error, attemptNumber, delayMs) => {
        logger.info('Retrying TMDB request', {
          error: error.message,
          attemptNumber,
          delayMs,
        });
      },
    });

    // Initialize axios client
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json;charset=utf-8',
      },
      timeout: 10000, // 10 second timeout
    });
  }

  // ============================================
  // Public API Methods
  // ============================================

  /**
   * Search for movies by title and optional year
   */
  async searchMovies(options: TMDBSearchOptions): Promise<TMDBMovieSearchResponse> {
    const params: Record<string, unknown> = {
      query: options.query,
      language: options.language || this.language,
      include_adult: options.includeAdult ?? this.includeAdult,
      page: options.page || 1,
    };

    if (options.year) {
      params.year = options.year;
    }

    if (options.region) {
      params.region = options.region;
    }

    return this.request<TMDBMovieSearchResponse>('/search/movie', { params });
  }

  /**
   * Get detailed movie information by TMDB ID
   */
  async getMovie(
    movieId: number,
    options: TMDBMovieDetailsOptions = {}
  ): Promise<TMDBMovie> {
    const params: Record<string, unknown> = {
      language: options.language || this.language,
    };

    // Build append_to_response parameter
    if (options.appendToResponse && options.appendToResponse.length > 0) {
      params.append_to_response = options.appendToResponse.join(',');
    }

    return this.request<TMDBMovie>(`/movie/${movieId}`, { params });
  }

  /**
   * Find movie by external ID (IMDB, TVDB, etc.)
   */
  async findByExternalId(options: TMDBFindOptions): Promise<TMDBFindResponse> {
    const params = {
      external_source: options.externalSource,
      language: options.language || this.language,
    };

    return this.request<TMDBFindResponse>(`/find/${options.externalId}`, { params });
  }

  /**
   * Get collection details by ID
   */
  async getCollection(collectionId: number, language?: string): Promise<TMDBCollection> {
    const params = {
      language: language || this.language,
    };

    return this.request<TMDBCollection>(`/collection/${collectionId}`, { params });
  }

  /**
   * Get TMDB configuration (image sizes, etc.)
   */
  async getConfiguration(): Promise<TMDBConfiguration> {
    return this.request<TMDBConfiguration>('/configuration');
  }

  /**
   * Get all images for a movie (posters, backdrops, logos)
   */
  async getMovieImages(movieId: number, language?: string): Promise<{
    id: number;
    backdrops: TMDBImage[];
    posters: TMDBImage[];
    logos: TMDBImage[];
  }> {
    const params: Record<string, unknown> = {};
    if (language) {
      params.language = language;
    }
    return this.request(`/movie/${movieId}/images`, { params });
  }

  /**
   * Get videos for a movie (trailers, teasers, clips)
   */
  async getMovieVideos(movieId: number, language?: string): Promise<{
    id: number;
    results: TMDBVideo[];
  }> {
    const params = {
      language: language || this.language,
    };
    return this.request(`/movie/${movieId}/videos`, { params });
  }

  /**
   * Get changes for a movie since a specific date
   * @param tmdbId TMDB movie ID
   * @param sinceDate Date to check for changes since
   * @returns Object indicating if changes exist and which fields changed
   */
  async getMovieChanges(tmdbId: number, sinceDate: Date): Promise<TMDBChangesResponse> {
    try {
      // Format date as YYYY-MM-DD for TMDB API
      const startDate = this.formatDate(sinceDate);
      const endDate = this.formatDate(new Date());

      const params = {
        start_date: startDate,
        end_date: endDate,
      };

      const response = await this.request<TMDBChangesAPIResponse>(
        `/movie/${tmdbId}/changes`,
        { params }
      );

      // Process the response
      const changedFields = new Set<string>();
      let lastChangeDate: Date | undefined;

      for (const change of response.changes) {
        changedFields.add(change.key);

        // Find the most recent change timestamp
        for (const item of change.items) {
          const changeTime = new Date(item.time);
          if (!lastChangeDate || changeTime > lastChangeDate) {
            lastChangeDate = changeTime;
          }
        }
      }

      const hasChanges = changedFields.size > 0;

      logger.debug('TMDB changes check complete', {
        tmdbId,
        sinceDate: startDate,
        hasChanges,
        changedFields: Array.from(changedFields),
        lastChangeDate,
      });

      const result: TMDBChangesResponse = {
        hasChanges,
        changedFields: Array.from(changedFields),
      };

      if (lastChangeDate) {
        result.lastChangeDate = lastChangeDate;
      }

      return result;
    } catch (error) {
      // If the movie doesn't exist or changes endpoint fails, assume we should re-scrape
      logger.warn('TMDB changes check failed, assuming changes exist', {
        tmdbId,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        hasChanges: true,
        changedFields: ['unknown'],
        lastChangeDate: new Date(),
      };
    }
  }

  /**
   * Build full image URL from TMDB path
   */
  getImageUrl(path: string, size: TMDBImageSize = 'original'): string {
    if (!path) {
      throw new ValidationError('Image path is required');
    }
    // Remove leading slash if present
    const cleanPath = path.startsWith('/') ? path.substring(1) : path;
    return `${this.imageBaseUrl}/${size}/${cleanPath}`;
  }

  /**
   * Get optimal image size based on type and desired width
   */
  getOptimalImageSize(type: TMDBImageType, maxWidth?: number): TMDBImageSize {
    if (!maxWidth) {
      return 'original';
    }

    const posterSizes: TMDBImageSize[] = ['w92', 'w154', 'w185', 'w342', 'w500', 'w780', 'original'];
    const backdropSizes: TMDBImageSize[] = ['w300', 'w780', 'w1280', 'original'];
    const profileSizes: TMDBImageSize[] = ['w45', 'w185', 'h632', 'original'];

    let sizes: TMDBImageSize[];
    switch (type) {
      case 'poster':
        sizes = posterSizes;
        break;
      case 'backdrop':
        sizes = backdropSizes;
        break;
      case 'profile':
        sizes = profileSizes;
        break;
      default:
        return 'original';
    }

    // Find the smallest size that's >= maxWidth
    for (const size of sizes) {
      if (size === 'original') return 'original';
      const width = parseInt(size.substring(1));
      if (width >= maxWidth) return size;
    }

    return 'original';
  }

  /**
   * Get rate limiter stats
   */
  getRateLimiterStats() {
    return {
      requestsInWindow: this.rateLimiter.getRequestCount(),
      remainingRequests: this.rateLimiter.getRemainingRequests(),
    };
  }

  // ============================================
  // Private Helper Methods
  // ============================================

  /**
   * Make API request with rate limiting, retries, and circuit breaker
   */
  private async request<T>(
    endpoint: string,
    config: Record<string, unknown> = {}
  ): Promise<T> {
    // Execute through circuit breaker
    return this.circuitBreaker.execute(async () => {
      // Execute through retry strategy
      return this.retryStrategy.execute(async () => {
        // Execute through rate limiter
        return this.rateLimiter.execute(async () => {
          try {
            const response = await this.client.get<T>(endpoint, config);

            logger.debug('TMDB API request successful', {
              endpoint,
              status: response.status,
              rateLimiter: this.getRateLimiterStats(),
            });

            return response.data as T;
          } catch (error) {
            throw this.convertToApplicationError(error, endpoint);
          }
        });
      }, `TMDB ${endpoint}`);
    });
  }

  /**
   * Convert Axios errors to ApplicationError types
   */
  private convertToApplicationError(error: unknown, endpoint: string): Error {
    const axiosError = error as AxiosError<TMDBError>;
    const context = {
      service: 'TMDBClient',
      operation: 'request',
      metadata: { endpoint },
    };

    // Handle HTTP response errors
    if (axiosError.response) {
      const status = axiosError.response.status;
      const message = axiosError.response.data?.status_message || axiosError.message;

      switch (status) {
        case 401:
          // Invalid API key - not retryable
          return new AuthenticationError(
            `TMDB authentication failed: ${message}`,
            { ...context, metadata: { ...context.metadata, status } },
            axiosError
          );

        case 404:
          // Resource not found - not retryable
          return new ResourceNotFoundError(
            'TMDB resource',
            endpoint,
            `Resource not found: ${message}`,
            { ...context, metadata: { ...context.metadata, status } }
          );

        case 429: {
          // Rate limit - retryable with delay
          const retryAfter = axiosError.response.headers?.['retry-after'];
          return new RateLimitError(
            'TMDB',
            parseInt(retryAfter as string) || 60,
            `Rate limit exceeded: ${message}`,
            { ...context, metadata: { ...context.metadata, status, retryAfter } }
          );
        }

        case 500:
        case 502:
        case 503:
        case 504:
          // Server errors - retryable
          return new ProviderServerError(
            'TMDB',
            status,
            `Server error: ${message}`,
            { ...context, metadata: { ...context.metadata, status } },
            axiosError
          );

        default:
          // Other HTTP errors
          return new ProviderServerError(
            'TMDB',
            status,
            `API error (${status}): ${message}`,
            { ...context, metadata: { ...context.metadata, status } },
            axiosError
          );
      }
    }

    // Network errors (timeout, connection refused, etc.) - retryable
    if (axiosError.code === 'ECONNABORTED' || axiosError.code === 'ETIMEDOUT') {
      return new NetworkError(
        `TMDB request timeout: ${endpoint}`,
        ErrorCode.NETWORK_TIMEOUT,
        endpoint,
        { ...context, metadata: { ...context.metadata, code: axiosError.code } },
        axiosError
      );
    }

    return new NetworkError(
      `TMDB network error: ${axiosError.message}`,
      ErrorCode.NETWORK_CONNECTION_FAILED,
      endpoint,
      { ...context, metadata: { ...context.metadata, code: axiosError.code } },
      axiosError
    );
  }

  /**
   * Format date as YYYY-MM-DD for TMDB API
   */
  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
