/**
 * FanArt.tv API Client
 * Handles all interactions with the FanArt.tv API v3
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { logger } from '../../../middleware/logging.js';
import { CircuitBreaker } from '../utils/CircuitBreaker.js';
import {
  AuthenticationError,
  RateLimitError,
  ProviderServerError,
  NetworkError,
  ErrorCode,
  NETWORK_RETRY_POLICY,
  RetryStrategy,
} from '../../../errors/index.js';
import {
  FanArtClientOptions,
  FanArtMovieImages,
  FanArtTVImages,
  FanArtError,
} from '../../../types/providers/fanart.js';

export class FanArtClient {
  private readonly client: AxiosInstance;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly retryStrategy: RetryStrategy;
  private readonly apiKey: string;
  private personalApiKey?: string;
  private readonly baseUrl: string;
  private lastRequestTime: number = 0;
  private requestDelay: number; // Milliseconds between requests

  constructor(options: FanArtClientOptions) {
    this.apiKey = options.apiKey;
    if (options.personalApiKey) {
      this.personalApiKey = options.personalApiKey;
    }
    this.baseUrl = options.baseUrl || 'https://webservice.fanart.tv/v3';

    // Personal API key allows 2 req/sec, free key allows 1 req/sec
    this.requestDelay = this.personalApiKey ? 500 : 1000;

    // Initialize circuit breaker
    this.circuitBreaker = new CircuitBreaker({
      threshold: 5,
      resetTimeoutMs: 5 * 60 * 1000, // 5 minutes
      providerName: 'FanArt.tv',
    });

    // Initialize retry strategy
    this.retryStrategy = new RetryStrategy({
      ...NETWORK_RETRY_POLICY,
      onRetry: (error, attemptNumber, delayMs) => {
        logger.info('Retrying FanArt.tv request', {
          error: error.message,
          attemptNumber,
          delayMs,
        });
      },
    });

    // Initialize axios client
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000, // 10 second timeout
    });
  }

  // ============================================
  // Rate Limiting
  // ============================================

  /**
   * Enforce rate limiting (1 req/sec or 2 req/sec with personal key)
   */
  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.requestDelay) {
      const waitTime = this.requestDelay - timeSinceLastRequest;
      logger.debug('FanArt.tv rate limit: waiting', { waitTime });
      await this.delay(waitTime);
    }

    this.lastRequestTime = Date.now();
  }

  /**
   * Make API request with rate limiting, retry and circuit breaker
   */
  private async request<T>(endpoint: string): Promise<T | null> {
    // Execute through circuit breaker
    return this.circuitBreaker.execute(async () => {
      // Execute through retry strategy
      return this.retryStrategy.execute(async () => {
        await this.enforceRateLimit();

        const url = `${endpoint}?api_key=${this.apiKey}${
          this.personalApiKey ? `&client_key=${this.personalApiKey}` : ''
        }`;

        try {
          const response = await this.client.get<T>(url);

          logger.debug('FanArt.tv API request successful', {
            endpoint,
            status: response.status,
            hasPersonalKey: !!this.personalApiKey,
          });

          return response.data;
        } catch (error) {
          throw this.convertToApplicationError(error, endpoint);
        }
      }, `FanArt.tv ${endpoint}`);
    });
  }

  /**
   * Convert Axios errors to ApplicationError types
   * Note: For 404 errors, returns null instead of throwing (FanArt.tv often doesn't have artwork)
   */
  private convertToApplicationError(error: unknown, endpoint: string): Error | null {
    const axiosError = error as AxiosError<FanArtError>;
    const context = {
      service: 'FanArtClient',
      operation: 'request',
      metadata: { endpoint },
    };

    // Handle HTTP response errors
    if (axiosError.response) {
      const status = axiosError.response.status;
      const message = axiosError.response.data?.error?.message || axiosError.message;

      switch (status) {
        case 401:
          // Invalid API key - not retryable
          return new AuthenticationError(
            `FanArt.tv authentication failed: ${message}`,
            { ...context, metadata: { ...context.metadata, status } },
            axiosError
          );

        case 404:
          // Resource not found - this is common for FanArt.tv (not all content has fanart)
          // Return null instead of throwing
          logger.debug('FanArt.tv resource not found', { endpoint });
          return null;

        case 429:
          // Rate limit - retryable with delay
          return new RateLimitError(
            'FanArt.tv',
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
            'FanArt.tv',
            status,
            `Server error: ${message}`,
            { ...context, metadata: { ...context.metadata, status } },
            axiosError
          );

        default:
          // Other HTTP errors
          return new ProviderServerError(
            'FanArt.tv',
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
        `FanArt.tv request timeout: ${endpoint}`,
        ErrorCode.NETWORK_TIMEOUT,
        endpoint,
        { ...context, metadata: { ...context.metadata, code: axiosError.code } },
        axiosError
      );
    }

    return new NetworkError(
      `FanArt.tv network error: ${axiosError.message}`,
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
   * Get movie images by TMDB ID
   */
  async getMovieImages(tmdbId: number): Promise<FanArtMovieImages | null> {
    return this.request<FanArtMovieImages>(`/movies/${tmdbId}`);
  }

  /**
   * Get TV show images by TVDB ID
   */
  async getTVImages(tvdbId: number): Promise<FanArtTVImages | null> {
    return this.request<FanArtTVImages>(`/tv/${tvdbId}`);
  }

  /**
   * Check if using personal API key (for rate limit info)
   */
  hasPersonalKey(): boolean {
    return !!this.personalApiKey;
  }

  /**
   * Get current rate limit (requests per second)
   */
  getRateLimit(): number {
    return this.personalApiKey ? 2 : 1;
  }

  /**
   * Delay helper for rate limiting
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
