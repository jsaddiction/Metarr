/**
 * TMDB Service - Singleton wrapper for TMDBClient
 * Integrates with ConfigManager and provides application-wide TMDB access
 */

import { TMDBClient } from './tmdb/TMDBClient.js';
import { ConfigManager } from '../../config/ConfigManager.js';
import { logger } from '../../middleware/logging.js';

class TMDBService {
  private client: TMDBClient | null = null;
  private config: ConfigManager;
  private enabled: boolean = false;

  constructor() {
    this.config = ConfigManager.getInstance();
    this.initialize();
  }

  /**
   * Initialize TMDB client from configuration
   */
  private initialize(): void {
    const fullConfig = this.config['config'] as any; // Access private config property
    const tmdbConfig = fullConfig?.providers?.tmdb;

    if (!tmdbConfig || !tmdbConfig.apiKey) {
      logger.warn('TMDB API key not provided - TMDB provider will be disabled');
      this.enabled = false;
      return;
    }

    try {
      this.client = new TMDBClient({
        apiKey: tmdbConfig.apiKey,
        baseUrl: tmdbConfig.baseUrl,
        language: 'en-US', // TODO: Make configurable
        includeAdult: false, // TODO: Make configurable
      });

      this.enabled = true;
      logger.info('TMDB provider initialized successfully');
    } catch (error: any) {
      logger.error('Failed to initialize TMDB provider', { error: error.message });
      this.enabled = false;
    }
  }

  /**
   * Get TMDB client instance
   */
  getClient(): TMDBClient {
    if (!this.enabled || !this.client) {
      throw new Error('TMDB provider is not enabled or initialized');
    }
    return this.client;
  }

  /**
   * Check if TMDB provider is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Reinitialize TMDB client (useful after config changes)
   */
  reinitialize(): void {
    this.client = null;
    this.initialize();
  }
}

// Export singleton instance
export const tmdbService = new TMDBService();
