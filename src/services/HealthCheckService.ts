import { EventEmitter } from 'events';
import { logger } from '../middleware/logging.js';
import { ProviderRegistry } from './providers/ProviderRegistry.js';
import axios from 'axios';
import { getErrorMessage, getStatusCode } from '../utils/errorHandling.js';
import { ValidationError } from '../errors/index.js';

/**
 * Health check configuration constants
 */
const HEALTH_CHECK_CONFIG = {
  /** Interval between health checks (milliseconds) */
  CHECK_INTERVAL_MS: 60000, // 60 seconds

  /** Timeout for individual provider health checks (milliseconds) */
  PROVIDER_TIMEOUT_MS: 5000, // 5 seconds
} as const;

export interface ProviderHealth {
  name: string;
  displayName: string;
  healthy: boolean;
  responseTime: number | null; // milliseconds
  lastChecked: Date;
  lastError?: string;
}

/**
 * Background service that periodically checks provider health
 * Caches results to avoid blocking API requests
 */
export class HealthCheckService extends EventEmitter {
  private healthCache: Map<string, ProviderHealth> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;
  private readonly CHECK_INTERVAL_MS = HEALTH_CHECK_CONFIG.CHECK_INTERVAL_MS;

  constructor(readonly _providerRegistry: ProviderRegistry) {
    super();
    // Provider registry not currently used, but kept for future extensibility
  }

  /**
   * Start background health checking
   */
  start(): void {
    if (this.checkInterval) {
      logger.warn('[HealthCheckService] Already running');
      return;
    }

    logger.info('[HealthCheckService] Starting provider health checks');

    // Run initial check immediately
    this.runHealthChecks().catch(err =>
      logger.error('[HealthCheckService] Initial health check failed', { error: getErrorMessage(err) })
    );

    // Schedule periodic checks
    this.checkInterval = setInterval(() => {
      this.runHealthChecks().catch(err =>
        logger.error('[HealthCheckService] Health check failed', { error: getErrorMessage(err) })
      );
    }, this.CHECK_INTERVAL_MS);
  }

  /**
   * Stop background health checking
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      logger.info('[HealthCheckService] Stopped provider health checks');
    }
  }

  /**
   * Get cached health status for all providers
   */
  getProviderHealth(): ProviderHealth[] {
    return Array.from(this.healthCache.values());
  }

  /**
   * Get cached health status for a specific provider
   */
  getProviderHealthByName(name: string): ProviderHealth | undefined {
    return this.healthCache.get(name);
  }

  /**
   * Run health checks for all enabled providers
   */
  private async runHealthChecks(): Promise<void> {
    logger.debug('[HealthCheckService] Running provider health checks');

    // Check each provider in parallel
    const providers = [
      { name: 'tmdb', displayName: 'TMDB', check: () => this.checkTMDB() },
      { name: 'tvdb', displayName: 'TVDB', check: () => this.checkTVDB() },
      { name: 'fanart_tv', displayName: 'Fanart.tv', check: () => this.checkFanartTV() },
      { name: 'imdb', displayName: 'IMDb', check: () => this.checkIMDb() },
    ];

    const checks = providers.map(async provider => {
      try {
        const startTime = Date.now();
        const healthy = await provider.check();
        const responseTime = Date.now() - startTime;

        const health: ProviderHealth = {
          name: provider.name,
          displayName: provider.displayName,
          healthy,
          responseTime,
          lastChecked: new Date(),
        };

        this.healthCache.set(provider.name, health);
        this.emit('healthUpdate', health);
      } catch (error) {
        const health: ProviderHealth = {
          name: provider.name,
          displayName: provider.displayName,
          healthy: false,
          responseTime: null,
          lastChecked: new Date(),
          lastError: getErrorMessage(error),
        };

        this.healthCache.set(provider.name, health);
        this.emit('healthUpdate', health);
      }
    });

    await Promise.allSettled(checks);
  }

  /**
   * Check TMDB health via /configuration endpoint
   */
  private async checkTMDB(): Promise<boolean> {
    try {
      const { getDefaultApiKey } = await import('../config/providerDefaults.js');
      const apiKey = getDefaultApiKey('tmdb');

      if (!apiKey) {
        throw new ValidationError('No API key available');
      }

      const response = await axios.get('https://api.themoviedb.org/3/configuration', {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
        timeout: HEALTH_CHECK_CONFIG.PROVIDER_TIMEOUT_MS,
      });

      return response.status === 200;
    } catch (error) {
      logger.debug('[HealthCheckService] TMDB health check failed:', getErrorMessage(error));
      return false;
    }
  }

  /**
   * Check TVDB health - just verify we can reach the API
   * 401 Unauthorized is acceptable - it means API is up, just needs auth
   */
  private async checkTVDB(): Promise<boolean> {
    try {
      await axios.get('https://api4.thetvdb.com/v4/swagger', {
        timeout: HEALTH_CHECK_CONFIG.PROVIDER_TIMEOUT_MS,
        validateStatus: (status) => status < 500, // Accept all non-server-error responses
      });

      return true; // If we got ANY response (200, 401, etc), API is accessible
    } catch (error) {
      // Network error or timeout
      logger.debug('[HealthCheckService] TVDB health check failed:', getErrorMessage(error));
      return false;
    }
  }

  /**
   * Check Fanart.tv health via /movies/latest endpoint
   */
  private async checkFanartTV(): Promise<boolean> {
    try {
      const { getDefaultApiKey } = await import('../config/providerDefaults.js');
      const apiKey = getDefaultApiKey('fanart_tv');

      if (!apiKey) {
        throw new ValidationError('No API key available');
      }

      const response = await axios.get('https://webservice.fanart.tv/v3/movies/latest', {
        params: {
          api_key: apiKey,
        },
        timeout: HEALTH_CHECK_CONFIG.PROVIDER_TIMEOUT_MS,
      });

      return response.status === 200;
    } catch (error) {
      // 404 is acceptable - means API is reachable
      if (getStatusCode(error) === 404) {
        return true;
      }
      logger.debug('[HealthCheckService] Fanart.tv health check failed:', getErrorMessage(error));
      return false;
    }
  }

  /**
   * Check IMDb health via GET request
   * CloudFront blocks HEAD requests, so we use GET with proper User-Agent
   * Note: Downloads the full IMDb homepage (~500KB) but only runs every 60s
   */
  private async checkIMDb(): Promise<boolean> {
    try {
      const response = await axios.get('https://www.imdb.com', {
        timeout: HEALTH_CHECK_CONFIG.PROVIDER_TIMEOUT_MS,
        validateStatus: (status) => status < 500, // Accept all non-server-error responses
        headers: {
          'User-Agent': 'Metarr/1.0.0 (Health Check)',
        },
      });

      // 2xx, 3xx, or 4xx means site is up (403 is common for bots, but site is still up)
      return response.status >= 200 && response.status < 500;
    } catch (error) {
      // Check if we got a response despite error (axios throws on 4xx/5xx)
      const status = getStatusCode(error);
      if (status && status >= 200 && status < 500) {
        return true; // Site responded, even if it blocked us
      }
      logger.debug('[HealthCheckService] IMDb health check failed:', getErrorMessage(error));
      return false;
    }
  }
}
