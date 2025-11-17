/**
 * Provider Configuration Constants
 *
 * Centralized configuration values for all provider clients including:
 * - HTTP timeout values
 * - Circuit breaker thresholds
 * - Rate limiter configurations
 * - Token management settings
 */

/**
 * HTTP timeout values (milliseconds)
 */
export const PROVIDER_TIMEOUTS = {
  /** Standard timeout for most providers (TMDB, TVDB, FanArt.tv) */
  STANDARD: 10000, // 10 seconds

  /** Extended timeout for slower providers (IMDb, MusicBrainz, TheAudioDB) */
  EXTENDED: 30000, // 30 seconds
} as const;

/**
 * Circuit breaker configuration
 * Prevents cascading failures by opening circuit after repeated failures
 */
export const CIRCUIT_BREAKER_CONFIG = {
  /** Number of consecutive failures before opening circuit */
  FAILURE_THRESHOLD: 5,

  /** Time to wait before attempting to close circuit (milliseconds) */
  RESET_TIMEOUT_MS: 5 * 60 * 1000, // 5 minutes

  /** Number of successful requests required to close circuit */
  REQUIRED_SUCCESS_COUNT_TO_CLOSE: 2,
} as const;

/**
 * Rate limiter configurations per provider
 * Based on documented API limits with conservative buffers
 */
export const RATE_LIMITER_CONFIG = {
  /** TMDB: 40 requests per 10 seconds */
  TMDB: {
    requestsPerSecond: 40,
    windowSeconds: 10,
  },

  /** TVDB: Conservative 10 req/sec (actual limit ~100 per 10 seconds) */
  TVDB: {
    requestsPerSecond: 10,
    burstCapacity: 50,
  },

  /** FanArt.tv: Varies by API key type */
  FANART_TV: {
    /** Personal API key: 2 requests per second */
    withPersonalKey: 500, // milliseconds between requests

    /** Free tier: 1 request per second */
    withoutPersonalKey: 1000, // milliseconds between requests
  },

  /** Safety buffer added to rate limit calculations */
  BUFFER_MS: 100,
} as const;

/**
 * Token management configuration
 * For providers requiring authentication tokens (e.g., TVDB)
 */
export const TOKEN_CONFIG = {
  /** TVDB token lifetime */
  TVDB_LIFETIME_SECONDS: 24 * 60 * 60, // 24 hours
  TVDB_LIFETIME_MS: 24 * 60 * 60 * 1000, // 24 hours

  /** Refresh token this many hours before expiry */
  TVDB_REFRESH_BUFFER_HOURS: 2,
} as const;

/**
 * Retry and backoff configuration
 */
export const RETRY_CONFIG = {
  /** Base delay for exponential backoff (milliseconds) */
  BASE_BACKOFF_MS: 1000, // 1 second

  /** Maximum backoff delay (milliseconds) */
  MAX_BACKOFF_MS: 30000, // 30 seconds

  /** Exponential backoff multiplier base */
  BACKOFF_BASE: 2, // 2^attempt

  /** Maximum retry attempts for user-initiated requests */
  USER_MAX_RETRIES: 2,

  /** Maximum retry attempts for background jobs */
  BACKGROUND_MAX_RETRIES: 5,
} as const;

/**
 * Orchestrator timeout configuration
 * For high-level operations coordinating multiple providers
 */
export const ORCHESTRATOR_TIMEOUTS = {
  /** Timeout for user-initiated actions (milliseconds) */
  USER_TIMEOUT_MS: 10000, // 10 seconds

  /** Timeout for background operations (milliseconds) */
  BACKGROUND_TIMEOUT_MS: 60000, // 60 seconds

  /** Total timeout when fetching from all providers */
  PROVIDER_FETCH_TIMEOUT: 30000, // 30 seconds
} as const;
