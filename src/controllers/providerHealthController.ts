/**
 * Provider Health Controller
 *
 * Exposes provider health metrics for monitoring and debugging.
 * Helps users diagnose enrichment failures by showing:
 * - Circuit breaker state (open/closed)
 * - Rate limit statistics
 * - Recent error counts
 * - Backoff state
 */

import { Request, Response } from 'express';
import { ProviderRegistry } from '../services/providers/ProviderRegistry.js';
import { logger } from '../middleware/logging.js';
import { getErrorMessage } from '../utils/errorHandling.js';

/**
 * GET /api/providers/health
 *
 * Returns comprehensive health metrics for all registered providers.
 *
 * Response format:
 * {
 *   timestamp: "2025-11-18T12:34:56.789Z",
 *   providers: [
 *     {
 *       providerId: "tmdb",
 *       providerName: "The Movie Database",
 *       healthy: true,
 *       circuitBreaker: {
 *         state: "closed",
 *         isOpen: false,
 *         failureCount: 0,
 *         successCount: 142,
 *         lastFailureTime: null,
 *         nextRetryTime: null
 *       },
 *       rateLimiter: {
 *         requestsInWindow: 3,
 *         remainingRequests: 37,
 *         maxRequests: 40,
 *         requestsPerSecond: 4
 *       },
 *       backoff: {
 *         consecutiveRateLimits: 0,
 *         currentBackoffMs: 0,
 *         maxBackoffMs: 30000
 *       }
 *     },
 *     // ... other providers
 *   ],
 *   summary: {
 *     total: 3,
 *     healthy: 2,
 *     unhealthy: 1
 *   }
 * }
 */
export async function getProviderHealth(_req: Request, res: Response): Promise<void> {
  try {
    const providerRegistry = ProviderRegistry.getInstance();
    const allProviders = providerRegistry.getAllProviders();

    const providerMetrics = allProviders.map((provider) => provider.getHealthMetrics());

    const summary = {
      total: providerMetrics.length,
      healthy: providerMetrics.filter((p: { healthy: boolean }) => p.healthy).length,
      unhealthy: providerMetrics.filter((p: { healthy: boolean }) => !p.healthy).length,
    };

    res.json({
      timestamp: new Date().toISOString(),
      providers: providerMetrics,
      summary,
    });

    logger.debug('Provider health metrics retrieved', {
      service: 'providerHealthController',
      operation: 'getProviderHealth',
      summary,
    });
  } catch (error) {
    logger.error('Failed to retrieve provider health metrics', {
      service: 'providerHealthController',
      operation: 'getProviderHealth',
      error: getErrorMessage(error),
    });

    res.status(500).json({
      error: 'Failed to retrieve provider health metrics',
      message: getErrorMessage(error),
    });
  }
}

/**
 * GET /api/providers/:providerId/health
 *
 * Returns health metrics for a specific provider.
 *
 * @param providerId - Provider ID (e.g., "tmdb", "tvdb", "fanart")
 */
export async function getProviderHealthById(req: Request, res: Response): Promise<void> {
  try {
    const { providerId } = req.params;

    const providerRegistry = ProviderRegistry.getInstance();
    const provider = providerRegistry.getProvider(providerId);

    if (!provider) {
      res.status(404).json({
        error: 'Provider not found',
        message: `Provider '${providerId}' is not registered`,
      });
      return;
    }

    const metrics = provider.getHealthMetrics();

    res.json({
      timestamp: new Date().toISOString(),
      ...metrics,
    });

    logger.debug('Provider health metrics retrieved', {
      service: 'providerHealthController',
      operation: 'getProviderHealthById',
      providerId,
      healthy: metrics.healthy,
    });
  } catch (error) {
    logger.error('Failed to retrieve provider health metrics', {
      service: 'providerHealthController',
      operation: 'getProviderHealthById',
      providerId: req.params.providerId,
      error: getErrorMessage(error),
    });

    res.status(500).json({
      error: 'Failed to retrieve provider health metrics',
      message: getErrorMessage(error),
    });
  }
}
