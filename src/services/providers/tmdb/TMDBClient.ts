/**
 * TMDB API Client
 * Handles all interactions with The Movie Database API
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { logger } from '../../../middleware/logging.js';
import { RateLimiter } from './RateLimiter.js';
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
  private client: AxiosInstance;
  private rateLimiter: RateLimiter;
  private apiKey: string;
  private baseUrl: string;
  private imageBaseUrl: string;
  private language: string;
  private includeAdult: boolean;
  private circuitBreakerFailures: number = 0;
  private readonly CIRCUIT_BREAKER_THRESHOLD = 5;
  private circuitBreakerResetTime: number | null = null;

  constructor(options: TMDBClientOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl || 'https://api.themoviedb.org/3';
    this.imageBaseUrl = options.imageBaseUrl || 'https://image.tmdb.org/t/p';
    this.language = options.language || 'en-US';
    this.includeAdult = options.includeAdult ?? false;

    // Initialize rate limiter (40 requests per 10 seconds)
    this.rateLimiter = new RateLimiter(40, 10);

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
    const params: any = {
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
    const params: any = {
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
    const params: any = {};
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
    } catch (error: any) {
      // If the movie doesn't exist or changes endpoint fails, assume we should re-scrape
      logger.warn('TMDB changes check failed, assuming changes exist', {
        tmdbId,
        error: error.message,
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
      throw new Error('Image path is required');
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
    config: any = {},
    retries: number = 3
  ): Promise<T> {
    // Check circuit breaker
    if (this.isCircuitBreakerOpen()) {
      throw new Error('TMDB API circuit breaker is open - too many consecutive failures');
    }

    return this.rateLimiter.execute(async () => {
      try {
        const response = await this.client.get<T>(endpoint, config);

        // Success - reset circuit breaker
        this.circuitBreakerFailures = 0;
        this.circuitBreakerResetTime = null;

        logger.debug('TMDB API request successful', {
          endpoint,
          status: response.status,
          rateLimiter: this.getRateLimiterStats(),
        });

        return response.data;
      } catch (error) {
        return this.handleError(error, endpoint, config, retries);
      }
    });
  }

  /**
   * Handle API errors with retry logic
   */
  private async handleError(
    error: any,
    endpoint: string,
    config: any,
    retriesLeft: number
  ): Promise<any> {
    const axiosError = error as AxiosError<TMDBError>;

    // Log error details
    logger.error('TMDB API request failed', {
      endpoint,
      status: axiosError.response?.status,
      message: axiosError.response?.data?.status_message || axiosError.message,
      retriesLeft,
    });

    // Handle specific HTTP status codes
    if (axiosError.response) {
      const status = axiosError.response.status;

      switch (status) {
        case 401:
          // Invalid API key - don't retry
          this.incrementCircuitBreaker();
          throw new Error('TMDB API authentication failed - check API key');

        case 404:
          // Resource not found - don't retry
          throw new Error(`TMDB resource not found: ${endpoint}`);

        case 429:
          // Rate limit exceeded - wait and retry
          if (retriesLeft > 0) {
            logger.warn('TMDB rate limit exceeded, waiting before retry');
            await this.delay(5000); // Wait 5 seconds
            return this.request(endpoint, config, retriesLeft - 1);
          }
          throw new Error('TMDB rate limit exceeded');

        case 500:
        case 502:
        case 503:
        case 504:
          // Server error - retry with exponential backoff
          if (retriesLeft > 0) {
            const backoffMs = Math.pow(2, 3 - retriesLeft) * 1000; // 1s, 2s, 4s
            logger.warn('TMDB server error, retrying with backoff', { backoffMs });
            await this.delay(backoffMs);
            return this.request(endpoint, config, retriesLeft - 1);
          }
          this.incrementCircuitBreaker();
          throw new Error('TMDB server error');

        default:
          // Unknown error
          this.incrementCircuitBreaker();
          throw new Error(`TMDB API error: ${axiosError.response.data?.status_message}`);
      }
    }

    // Network error or timeout - retry
    if (retriesLeft > 0) {
      const backoffMs = Math.pow(2, 3 - retriesLeft) * 1000;
      logger.warn('TMDB network error, retrying', { backoffMs });
      await this.delay(backoffMs);
      return this.request(endpoint, config, retriesLeft - 1);
    }

    this.incrementCircuitBreaker();
    throw new Error(`TMDB network error: ${error.message}`);
  }

  /**
   * Circuit breaker: track consecutive failures
   */
  private incrementCircuitBreaker(): void {
    this.circuitBreakerFailures++;

    if (this.circuitBreakerFailures >= this.CIRCUIT_BREAKER_THRESHOLD) {
      // Open circuit breaker for 5 minutes
      this.circuitBreakerResetTime = Date.now() + 5 * 60 * 1000;
      logger.error('TMDB circuit breaker opened due to consecutive failures', {
        failures: this.circuitBreakerFailures,
        resetTime: new Date(this.circuitBreakerResetTime),
      });
    }
  }

  /**
   * Check if circuit breaker is open
   */
  private isCircuitBreakerOpen(): boolean {
    if (this.circuitBreakerResetTime && Date.now() < this.circuitBreakerResetTime) {
      return true;
    }

    // Reset circuit breaker after timeout
    if (this.circuitBreakerResetTime && Date.now() >= this.circuitBreakerResetTime) {
      logger.info('TMDB circuit breaker reset');
      this.circuitBreakerFailures = 0;
      this.circuitBreakerResetTime = null;
    }

    return false;
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
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
