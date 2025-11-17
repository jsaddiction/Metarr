/**
 * Application-wide Constants
 *
 * Centralized location for magic numbers and configuration values.
 * This improves maintainability and makes values easier to tune.
 */

/**
 * Time durations in milliseconds
 */
export const TIME = {
  /** 1 second */
  ONE_SECOND: 1000,
  /** 5 seconds */
  FIVE_SECONDS: 5000,
  /** 15 seconds */
  FIFTEEN_SECONDS: 15000,
  /** 30 seconds */
  THIRTY_SECONDS: 30000,
  /** 1 minute */
  ONE_MINUTE: 60000,
  /** 5 minutes */
  FIVE_MINUTES: 300000,
  /** 1 hour */
  ONE_HOUR: 3600000,
  /** 1 day */
  ONE_DAY: 86400000,
} as const;

/**
 * WebSocket configuration
 */
export const WEBSOCKET = {
  /** Ping interval to keep connection alive */
  PING_INTERVAL: TIME.THIRTY_SECONDS,
  /** Timeout waiting for pong response */
  PING_TIMEOUT: TIME.FIVE_SECONDS,
  /** Heartbeat interval for SSE streams */
  HEARTBEAT_INTERVAL: TIME.FIFTEEN_SECONDS,
} as const;

/**
 * Rate limiting configuration
 */
export const RATE_LIMITS = {
  /** API rate limit window */
  API_WINDOW: TIME.ONE_MINUTE,
  /** Max API requests per window */
  API_MAX_REQUESTS: 1000,
  /** Webhook rate limit window */
  WEBHOOK_WINDOW: TIME.ONE_MINUTE,
  /** Max webhook requests per window */
  WEBHOOK_MAX_REQUESTS: 30,
  /** Max IPs to track in rate limiter */
  MAX_TRACKED_IPS: 10000,
} as const;

/**
 * Database configuration
 */
export const DATABASE = {
  /** Health check interval */
  HEALTH_CHECK_INTERVAL: TIME.THIRTY_SECONDS,
  /** Connection pool size */
  POOL_SIZE: 10,
} as const;

/**
 * Job queue configuration
 */
export const JOB_QUEUE = {
  /** Retry delays for failed jobs (in ms) */
  RETRY_DELAYS: [TIME.ONE_SECOND, TIME.FIVE_SECONDS, TIME.THIRTY_SECONDS],
  /** Default max retry count */
  MAX_RETRIES: 3,
  /** Processing timeout */
  PROCESSING_TIMEOUT: TIME.FIVE_MINUTES,
  /** Health check interval */
  HEALTH_CHECK_INTERVAL: TIME.ONE_MINUTE,
  /** Verification interval */
  VERIFICATION_INTERVAL: TIME.FIVE_MINUTES,
} as const;

/**
 * Media player configuration
 */
export const MEDIA_PLAYER = {
  /** Status update interval */
  STATUS_UPDATE_INTERVAL: TIME.FIVE_SECONDS,
  /** Connection timeout */
  CONNECTION_TIMEOUT: TIME.THIRTY_SECONDS,
} as const;

/**
 * Image quality configuration
 */
export const IMAGE_QUALITY = {
  /** Ideal pixels for poster (2000x3000) */
  POSTER_IDEAL_PIXELS: 6000000,
  /** Ideal pixels for fanart (1920x1080) */
  FANART_IDEAL_PIXELS: 2073600,
  /** Generic fallback ideal pixels */
  GENERIC_IDEAL_PIXELS: 1000000,
} as const;

/**
 * Query limits
 */
export const QUERY_LIMITS = {
  /** Default max results for bulk queries */
  MAX_BULK_QUERY: 10000,
  /** Default page size */
  DEFAULT_PAGE_SIZE: 50,
  /** Max page size */
  MAX_PAGE_SIZE: 1000,
} as const;

/**
 * HTTP configuration
 */
export const HTTP = {
  /** Default request timeout */
  REQUEST_TIMEOUT: TIME.THIRTY_SECONDS,
  /** Download timeout */
  DOWNLOAD_TIMEOUT: TIME.THIRTY_SECONDS,
} as const;

/**
 * Server configuration defaults
 */
export const SERVER = {
  /** Default API port */
  DEFAULT_PORT: 3000,
  /** Default frontend port (dev) */
  DEFAULT_FRONTEND_PORT: 3001,
} as const;
