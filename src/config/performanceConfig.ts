/**
 * Performance Configuration
 *
 * Centralized configuration for all performance-related tuning parameters.
 * All values are configurable via environment variables.
 *
 * Adjust these based on your deployment environment:
 * - Small home server: Use defaults (conservative)
 * - Medium deployment: 2-3x defaults
 * - Large deployment: 5-10x defaults + separate database server
 */

export interface PerformanceConfig {
  /** Job Queue Configuration */
  jobQueue: {
    /** Maximum concurrent job workers (default: 5) */
    maxWorkers: number;
    /** Job polling interval in milliseconds (default: 1000) */
    pollInterval: number;
    /** Maximum consecutive failures before circuit breaker opens (default: 5) */
    maxConsecutiveFailures: number;
    /** Circuit breaker reset delay in milliseconds (default: 60000) */
    circuitResetDelay: number;
  };

  /** Rate Limiter Configuration */
  rateLimiter: {
    /** Cleanup interval for request history in milliseconds (default: 60000) */
    cleanupInterval: number;
  };

  /** Provider Configuration */
  provider: {
    /** TMDB rate limit (requests per second) (default: 4) */
    tmdbRateLimit: number;
    /** TVDB rate limit (requests per second) (default: 4) */
    tvdbRateLimit: number;
    /** Fanart.tv rate limit (requests per second) (default: 2) */
    fanartRateLimit: number;
    /** Provider request timeout in milliseconds (default: 10000) */
    requestTimeout: number;
    /** Maximum retries per provider request (default: 3) */
    maxRetries: number;
  };

  /** Asset Processing Configuration */
  assetProcessing: {
    /** Maximum concurrent asset downloads per job (default: 5) */
    maxConcurrentDownloads: number;
    /** Maximum asset file size in bytes (default: 50MB) */
    maxAssetSize: number;
    /** Image processing timeout in milliseconds (default: 30000) */
    imageProcessingTimeout: number;
  };

  /** Database Configuration */
  database: {
    /** Connection pool size for SQLite WAL mode (default: 5) */
    poolSize: number;
    /** Query timeout in milliseconds (default: 30000) */
    queryTimeout: number;
    /** Enable WAL mode for SQLite (default: true) */
    enableWAL: boolean;
  };

  /** WebSocket Configuration */
  websocket: {
    /** Stats broadcast throttle in milliseconds (default: 2000) */
    statsBroadcastThrottle: number;
    /** Heartbeat interval in milliseconds (default: 30000) */
    heartbeatInterval: number;
  };
}

/**
 * Load performance configuration from environment variables
 */
export function loadPerformanceConfig(): PerformanceConfig {
  return {
    jobQueue: {
      maxWorkers: parseInt(process.env.JOB_QUEUE_WORKERS || '5', 10),
      pollInterval: parseInt(process.env.JOB_QUEUE_POLL_INTERVAL || '1000', 10),
      maxConsecutiveFailures: parseInt(process.env.JOB_QUEUE_MAX_FAILURES || '5', 10),
      circuitResetDelay: parseInt(process.env.JOB_QUEUE_CIRCUIT_RESET_DELAY || '60000', 10),
    },

    rateLimiter: {
      cleanupInterval: parseInt(process.env.RATE_LIMITER_CLEANUP_INTERVAL || '60000', 10),
    },

    provider: {
      tmdbRateLimit: parseInt(process.env.TMDB_RATE_LIMIT || '4', 10),
      tvdbRateLimit: parseInt(process.env.TVDB_RATE_LIMIT || '4', 10),
      fanartRateLimit: parseInt(process.env.FANART_RATE_LIMIT || '2', 10),
      requestTimeout: parseInt(process.env.PROVIDER_REQUEST_TIMEOUT || '10000', 10),
      maxRetries: parseInt(process.env.PROVIDER_MAX_RETRIES || '3', 10),
    },

    assetProcessing: {
      maxConcurrentDownloads: parseInt(process.env.ASSET_MAX_CONCURRENT_DOWNLOADS || '5', 10),
      maxAssetSize: parseInt(process.env.ASSET_MAX_SIZE || '52428800', 10), // 50MB
      imageProcessingTimeout: parseInt(process.env.IMAGE_PROCESSING_TIMEOUT || '30000', 10),
    },

    database: {
      poolSize: parseInt(process.env.DB_POOL_SIZE || '5', 10),
      queryTimeout: parseInt(process.env.DB_QUERY_TIMEOUT || '30000', 10),
      enableWAL: process.env.DB_ENABLE_WAL !== 'false', // Default true
    },

    websocket: {
      statsBroadcastThrottle: parseInt(process.env.WS_STATS_THROTTLE || '2000', 10),
      heartbeatInterval: parseInt(process.env.WS_HEARTBEAT_INTERVAL || '30000', 10),
    },
  };
}

/**
 * Global performance configuration instance
 */
export const performanceConfig = loadPerformanceConfig();
