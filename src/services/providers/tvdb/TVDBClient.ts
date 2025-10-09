/**
 * TVDB API Client
 * Handles all interactions with The TVDB API v4
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { logger } from '../../../middleware/logging.js';
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
  private client: AxiosInstance;
  private apiKey: string;
  private baseUrl: string;
  private imageBaseUrl: string;
  private token: string | null = null;
  private tokenExpiry: number | null = null;
  private tokenRefreshBuffer: number; // Hours before expiry to refresh

  constructor(options: TVDBClientOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl || 'https://api4.thetvdb.com/v4';
    this.imageBaseUrl = options.imageBaseUrl || 'https://artworks.thetvdb.com';
    this.tokenRefreshBuffer = options.tokenRefreshBuffer || 2; // Refresh 2 hours before expiry

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
    } catch (error: any) {
      logger.error('TVDB login failed', { error: error.message });
      throw new Error(`TVDB authentication failed: ${error.message}`);
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
   * Make authenticated request
   */
  private async request<T>(
    method: 'get' | 'post',
    endpoint: string,
    data?: any,
    retries = 3
  ): Promise<T> {
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

      return response.data.data;
    } catch (error) {
      return this.handleError(error, method, endpoint, data, retries);
    }
  }

  /**
   * Handle API errors with retry logic
   */
  private async handleError(
    error: any,
    method: 'get' | 'post',
    endpoint: string,
    data: any,
    retriesLeft: number
  ): Promise<any> {
    const axiosError = error as AxiosError<TVDBError>;

    logger.error('TVDB API request failed', {
      endpoint,
      status: axiosError.response?.status,
      message: axiosError.response?.data?.message || axiosError.message,
      retriesLeft,
    });

    if (axiosError.response) {
      const status = axiosError.response.status;

      switch (status) {
        case 401:
          // Token expired, try to re-login once
          if (retriesLeft > 0) {
            logger.warn('TVDB token expired, re-authenticating');
            this.token = null;
            this.tokenExpiry = null;
            await this.ensureValidToken();
            return this.request(method as 'get' | 'post', endpoint, data, retriesLeft - 1);
          }
          throw new Error('TVDB authentication failed');

        case 404:
          throw new Error(`TVDB resource not found: ${endpoint}`);

        case 429:
          // Rate limit exceeded
          if (retriesLeft > 0) {
            const delay = 5000; // Wait 5 seconds
            logger.warn('TVDB rate limit exceeded, waiting', { delay });
            await this.delay(delay);
            return this.request(method as 'get' | 'post', endpoint, data, retriesLeft - 1);
          }
          throw new Error('TVDB rate limit exceeded');

        case 500:
        case 502:
        case 503:
        case 504:
          // Server error - retry with backoff
          if (retriesLeft > 0) {
            const backoffMs = Math.pow(2, 3 - retriesLeft) * 1000;
            logger.warn('TVDB server error, retrying', { backoffMs });
            await this.delay(backoffMs);
            return this.request(method as 'get' | 'post', endpoint, data, retriesLeft - 1);
          }
          throw new Error('TVDB server error');

        default:
          throw new Error(
            `TVDB API error: ${axiosError.response.data?.message || 'Unknown error'}`
          );
      }
    }

    // Network error or timeout - retry
    if (retriesLeft > 0) {
      const backoffMs = Math.pow(2, 3 - retriesLeft) * 1000;
      logger.warn('TVDB network error, retrying', { backoffMs });
      await this.delay(backoffMs);
      return this.request(method as 'get' | 'post', endpoint, data, retriesLeft - 1);
    }

    throw new Error(`TVDB network error: ${error.message}`);
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
      throw new Error('Image path is required');
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
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
