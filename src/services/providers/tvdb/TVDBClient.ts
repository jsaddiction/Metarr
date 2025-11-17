/**
 * TVDB API Client
 * Handles all interactions with The TVDB API v4
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { logger } from '../../../middleware/logging.js';
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
  TVDBClientOptions,
  TVDBLoginResponse,
  TVDBResponse,
  TVDBSeries,
  TVDBSeriesExtended,
  TVDBSeason,
  TVDBEpisode,
  TVDBEpisodeExtended,
  TVDBSearchResponse,
  TVDBError,
  TVDBArtwork,
} from '../../../types/providers/tvdb.js';

export class TVDBClient {
  private readonly client: AxiosInstance;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly retryStrategy: RetryStrategy;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly imageBaseUrl: string;
  private token: string | null = null;
  private tokenExpiry: number | null = null;
  private tokenRefreshBuffer: number; // Hours before expiry to refresh

  constructor(options: TVDBClientOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl || 'https://api4.thetvdb.com/v4';
    this.imageBaseUrl = options.imageBaseUrl || 'https://artworks.thetvdb.com';
    this.tokenRefreshBuffer = options.tokenRefreshBuffer || 2; // Refresh 2 hours before expiry

    // Initialize circuit breaker
    this.circuitBreaker = new CircuitBreaker({
      threshold: 5,
      resetTimeoutMs: 5 * 60 * 1000, // 5 minutes
      providerName: 'TVDB',
    });

    // Initialize retry strategy with network-specific policy
    this.retryStrategy = new RetryStrategy({
      ...NETWORK_RETRY_POLICY,
      onRetry: (error, attemptNumber, delayMs) => {
        logger.info('Retrying TVDB request', {
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
        'Content-Type': 'application/json',
      },
      timeout: 10000, // 10 second timeout
    });
  }

  // ============================================
  // Authentication
  // ============================================

  /**
   * Login and get JWT token
   */
  async login(): Promise<void> {
    try {
      const response = await this.client.post<TVDBLoginResponse>('/login', {
        apikey: this.apiKey,
      });

      this.token = response.data.data.token;
      // JWT tokens expire after 24 hours
      this.tokenExpiry = Date.now() + 24 * 60 * 60 * 1000;

      logger.info('TVDB authentication successful', {
        expiresAt: new Date(this.tokenExpiry),
      });
    } catch (error) {
      const axiosError = error as AxiosError<TVDBError>;
      const message = axiosError.response?.data?.message || axiosError.message;

      throw new AuthenticationError(
        `TVDB authentication failed: ${message}`,
        {
          service: 'TVDBClient',
          operation: 'login',
          metadata: { status: axiosError.response?.status },
        },
        axiosError instanceof Error ? axiosError : undefined
      );
    }
  }

  /**
   * Check if token is valid and refresh if needed
   */
  private async ensureValidToken(): Promise<void> {
    if (!this.token || !this.tokenExpiry) {
      await this.login();
      return;
    }

    // Refresh token if within buffer window
    const bufferMs = this.tokenRefreshBuffer * 60 * 60 * 1000;
    if (Date.now() + bufferMs >= this.tokenExpiry) {
      logger.info('TVDB token expiring soon, refreshing');
      await this.login();
    }
  }

  /**
   * Make authenticated request with retry and circuit breaker
   */
  private async request<T>(
    method: 'get' | 'post',
    endpoint: string,
    data?: unknown
  ): Promise<T> {
    // Execute through circuit breaker
    return this.circuitBreaker.execute(async () => {
      // Execute through retry strategy
      return this.retryStrategy.execute(async () => {
        await this.ensureValidToken();

        try {
          const response = await this.client.request<TVDBResponse<T>>({
            method,
            url: endpoint,
            headers: {
              Authorization: `Bearer ${this.token}`,
            },
            data,
          });

          return response.data.data as T;
        } catch (error) {
          throw this.convertToApplicationError(error, endpoint);
        }
      }, `TVDB ${method.toUpperCase()} ${endpoint}`);
    });
  }

  /**
   * Convert Axios errors to ApplicationError types
   */
  private convertToApplicationError(error: unknown, endpoint: string): Error {
    const axiosError = error as AxiosError<TVDBError>;
    const context = {
      service: 'TVDBClient',
      operation: 'request',
      metadata: { endpoint },
    };

    // Handle HTTP response errors
    if (axiosError.response) {
      const status = axiosError.response.status;
      const message = axiosError.response.data?.message || axiosError.message;

      switch (status) {
        case 401:
          // Token expired - invalidate and let retry logic handle re-auth
          this.token = null;
          this.tokenExpiry = null;
          return new AuthenticationError(
            `TVDB authentication failed: ${message}`,
            { ...context, metadata: { ...context.metadata, status } },
            axiosError
          );

        case 404:
          // Resource not found - not retryable
          return new ResourceNotFoundError(
            'TVDB resource',
            endpoint,
            `Resource not found: ${message}`,
            { ...context, metadata: { ...context.metadata, status } }
          );

        case 429:
          // Rate limit - retryable with delay
          return new RateLimitError(
            'TVDB',
            60, // Default 60 seconds
            `Rate limit exceeded: ${message}`,
            { ...context, metadata: { ...context.metadata, status } }
          );

        case 500:
        case 502:
        case 503:
        case 504:
          // Server errors - retryable
          return new ProviderServerError(
            'TVDB',
            status,
            `Server error: ${message}`,
            { ...context, metadata: { ...context.metadata, status } },
            axiosError
          );

        default:
          // Other HTTP errors
          return new ProviderServerError(
            'TVDB',
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
        `TVDB request timeout: ${endpoint}`,
        ErrorCode.NETWORK_TIMEOUT,
        endpoint,
        { ...context, metadata: { ...context.metadata, code: axiosError.code } },
        axiosError
      );
    }

    return new NetworkError(
      `TVDB network error: ${axiosError.message}`,
      ErrorCode.NETWORK_CONNECTION_FAILED,
      endpoint,
      { ...context, metadata: { ...context.metadata, code: axiosError.code } },
      axiosError
    );
  }

  // ============================================
  // Public API Methods
  // ============================================

  /**
   * Search for series
   */
  async searchSeries(query: string, page = 0): Promise<TVDBSearchResponse> {
    const params = new URLSearchParams({
      query,
      type: 'series',
    });

    if (page > 0) {
      params.append('offset', (page * 20).toString());
    }

    // Need to use direct axios call due to type constraints on request method
    await this.ensureValidToken();

    const response = await this.client.get<TVDBResponse<TVDBSearchResponse>>(
      `/search?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      }
    );

    return response.data.data;
  }

  /**
   * Get series by ID (basic info)
   */
  async getSeries(seriesId: number): Promise<TVDBSeries> {
    return this.request<TVDBSeries>('get' as const, `/series/${seriesId}`);
  }

  /**
   * Get series by ID (extended info with all metadata)
   */
  async getSeriesExtended(seriesId: number): Promise<TVDBSeriesExtended> {
    return this.request<TVDBSeriesExtended>('get' as const, `/series/${seriesId}/extended`);
  }

  /**
   * Get season by ID (extended with episodes)
   */
  async getSeason(seasonId: number): Promise<TVDBSeason> {
    return this.request<TVDBSeason>('get' as const, `/seasons/${seasonId}/extended`);
  }

  /**
   * Get episode by ID
   */
  async getEpisode(episodeId: number): Promise<TVDBEpisode> {
    return this.request<TVDBEpisode>('get' as const, `/episodes/${episodeId}`);
  }

  /**
   * Get episode by ID (extended with all metadata)
   */
  async getEpisodeExtended(episodeId: number): Promise<TVDBEpisodeExtended> {
    return this.request<TVDBEpisodeExtended>('get' as const, `/episodes/${episodeId}/extended`);
  }

  /**
   * Get artwork for a series
   */
  async getSeriesArtwork(seriesId: number): Promise<TVDBArtwork[]> {
    const response = await this.request<{ artworks: TVDBArtwork[] }>('get' as const, `/series/${seriesId}/artworks`);
    return response.artworks || [];
  }

  /**
   * Build full image URL from TVDB path
   */
  getImageUrl(path: string): string {
    if (!path) {
      throw new ValidationError(
        'Image path is required',
        { service: 'TVDBClient', operation: 'getImageUrl', metadata: { path } }
      );
    }
    // TVDB paths can be full URLs or paths
    if (path.startsWith('http')) {
      return path;
    }
    // Remove leading slash if present
    const cleanPath = path.startsWith('/') ? path.substring(1) : path;
    return `${this.imageBaseUrl}/${cleanPath}`;
  }

  /**
   * Get current token (for debugging)
   */
  getToken(): string | null {
    return this.token;
  }

  /**
   * Check if token is valid
   */
  isTokenValid(): boolean {
    return !!(this.token && this.tokenExpiry && Date.now() < this.tokenExpiry);
  }
}
