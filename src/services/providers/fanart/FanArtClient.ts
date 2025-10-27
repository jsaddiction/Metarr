/**
 * FanArt.tv API Client
 * Handles all interactions with the FanArt.tv API v3
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { logger } from '../../../middleware/logging.js';
import {
  FanArtClientOptions,
  FanArtMovieImages,
  FanArtTVImages,
  FanArtError,
} from '../../../types/providers/fanart.js';

export class FanArtClient {
  private client: AxiosInstance;
  private apiKey: string;
  private personalApiKey?: string;
  private baseUrl: string;
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
   * Make API request with rate limiting
   */
  private async request<T>(endpoint: string, retries = 3): Promise<T> {
    await this.enforceRateLimit();

    try {
      const url = `${endpoint}?api_key=${this.apiKey}${
        this.personalApiKey ? `&client_key=${this.personalApiKey}` : ''
      }`;

      const response = await this.client.get<T>(url);

      logger.debug('FanArt.tv API request successful', {
        endpoint,
        status: response.status,
        hasPersonalKey: !!this.personalApiKey,
      });

      return response.data;
    } catch (error) {
      return this.handleError(error, endpoint, retries);
    }
  }

  /**
   * Handle API errors with retry logic
   */
  private async handleError(error: unknown, endpoint: string, retriesLeft: number): Promise<any> {
    const axiosError = error as AxiosError<FanArtError>;

    logger.error('FanArt.tv API request failed', {
      endpoint,
      status: axiosError.response?.status,
      message: axiosError.response?.data?.error?.message || axiosError.message,
      retriesLeft,
    });

    if (axiosError.response) {
      const status = axiosError.response.status;

      switch (status) {
        case 401:
          throw new Error('FanArt.tv API key invalid');

        case 404:
          // Resource not found - this is common for FanArt.tv (not all content has fanart)
          logger.debug('FanArt.tv resource not found', { endpoint });
          return null; // Return null instead of throwing

        case 429:
          // Rate limit exceeded
          if (retriesLeft > 0) {
            const delay = 5000; // Wait 5 seconds
            logger.warn('FanArt.tv rate limit exceeded, waiting', { delay });
            await this.delay(delay);
            return this.request(endpoint, retriesLeft - 1);
          }
          throw new Error('FanArt.tv rate limit exceeded');

        case 500:
        case 502:
        case 503:
        case 504:
          // Server error - retry with backoff
          if (retriesLeft > 0) {
            const backoffMs = Math.pow(2, 3 - retriesLeft) * 1000;
            logger.warn('FanArt.tv server error, retrying', { backoffMs });
            await this.delay(backoffMs);
            return this.request(endpoint, retriesLeft - 1);
          }
          throw new Error('FanArt.tv server error');

        default:
          throw new Error(
            `FanArt.tv API error: ${axiosError.response.data?.error?.message || 'Unknown error'}`
          );
      }
    }

    // Network error or timeout - retry
    if (retriesLeft > 0) {
      const backoffMs = Math.pow(2, 3 - retriesLeft) * 1000;
      logger.warn('FanArt.tv network error, retrying', { backoffMs });
      await this.delay(backoffMs);
      return this.request(endpoint, retriesLeft - 1);
    }

    throw new Error(`FanArt.tv network error: ${(error as { message?: string }).message}`);
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
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
