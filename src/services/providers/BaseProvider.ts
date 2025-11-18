/**
 * BaseProvider Abstract Class
 *
 * Base class that all metadata providers must extend.
 * Provides common functionality for rate limiting, circuit breaking,
 * error handling, and health monitoring.
 */

import { ProviderConfig } from '../../types/provider.js';
import {
  ProviderCapabilities,
  SearchRequest,
  SearchResult,
  MetadataRequest,
  MetadataResponse,
  AssetRequest,
  AssetCandidate,
  TestConnectionResponse,
  ProviderOptions,
} from '../../types/providers/index.js';
import { RateLimiter, CircuitBreaker } from './utils/index.js';
import { logger } from '../../middleware/logging.js';
import { getErrorMessage, isError } from '../../utils/errorHandling.js';
import {
  NotImplementedError,
  RateLimitError,
  ProviderServerError,
  AuthenticationError,
  NetworkError,
  ProviderError,
  ResourceNotFoundError,
  ErrorCode,
} from '../../errors/index.js';

export abstract class BaseProvider {
  protected readonly capabilities: ProviderCapabilities;
  protected config: ProviderConfig;
  protected options: ProviderOptions;
  protected readonly rateLimiter: RateLimiter;
  protected readonly circuitBreaker: CircuitBreaker;

  // Rate limit backoff state
  private lastRequestTime: number = 0;
  private rateLimitBackoffMs: number = 0;
  private consecutiveRateLimits: number = 0;
  private readonly MAX_BACKOFF_MS = 30000; // 30 seconds
  private readonly BASE_BACKOFF_MS = 1000; // 1 second

  constructor(config: ProviderConfig, options: ProviderOptions = {}) {
    this.config = config;
    this.options = options;
    this.capabilities = this.defineCapabilities();
    this.rateLimiter = this.createRateLimiter();
    this.circuitBreaker = this.createCircuitBreaker();
  }

  // ============================================
  // ABSTRACT METHODS (Must be implemented by concrete providers)
  // ============================================

  /**
   * Define provider capabilities
   * This declares what the provider can do
   */
  abstract defineCapabilities(): ProviderCapabilities;

  /**
   * Create rate limiter based on provider's rate limits
   */
  protected abstract createRateLimiter(): RateLimiter;

  // ============================================
  // OPTIONAL METHODS (Override if provider supports these operations)
  // ============================================

  /**
   * Search for entities
   * Override if provider supports search (capabilities.search.supported = true)
   */
  async search(_request: SearchRequest): Promise<SearchResult[]> {
    throw new NotImplementedError(`${this.capabilities.id} does not support search`);
  }

  /**
   * Get metadata for an entity
   * Override if provider supports metadata retrieval
   */
  async getMetadata(_request: MetadataRequest): Promise<MetadataResponse> {
    throw new NotImplementedError(`${this.capabilities.id} does not support metadata retrieval`);
  }

  /**
   * Get asset candidates for an entity
   * Override if provider supports asset retrieval
   */
  async getAssets(_request: AssetRequest): Promise<AssetCandidate[]> {
    throw new NotImplementedError(`${this.capabilities.id} does not support asset retrieval`);
  }

  /**
   * Test connection to provider
   * Override for custom health checks
   */
  async testConnection(): Promise<TestConnectionResponse> {
    // Default implementation: provider is healthy if circuit is closed
    if (this.circuitBreaker.isOpen()) {
      return {
        success: false,
        error: 'Circuit breaker is open - provider experiencing failures',
      };
    }

    return {
      success: true,
      message: 'Provider is healthy',
    };
  }

  // ============================================
  // COMMON METHODS (Available to all providers)
  // ============================================

  /**
   * Get provider capabilities
   */
  getCapabilities(): ProviderCapabilities {
    return this.capabilities;
  }

  /**
   * Get provider configuration
   */
  getConfig(): ProviderConfig {
    return this.config;
  }

  /**
   * Get provider options
   */
  getOptions(): ProviderOptions {
    return this.options;
  }

  /**
   * Get rate limiter statistics
   */
  getRateLimiterStats() {
    return this.rateLimiter.getStats();
  }

  /**
   * Get circuit breaker statistics
   */
  getCircuitBreakerStats() {
    return this.circuitBreaker.getStats();
  }

  /**
   * Get rate limit backoff statistics
   */
  getRateLimitBackoffStats() {
    return {
      consecutiveRateLimits: this.consecutiveRateLimits,
      currentBackoffMs: this.rateLimitBackoffMs,
      lastRequestTime: this.lastRequestTime > 0 ? new Date(this.lastRequestTime).toISOString() : null,
      isInBackoff: this.rateLimitBackoffMs > 0 && (Date.now() - this.lastRequestTime) < this.rateLimitBackoffMs,
    };
  }

  /**
   * Check if provider is healthy
   */
  isHealthy(): boolean {
    return !this.circuitBreaker.isOpen();
  }

  /**
   * Get provider health status
   */
  getHealthStatus() {
    const cbStats = this.circuitBreaker.getStats();
    const rlStats = this.rateLimiter.getStats();
    const backoffStats = this.getRateLimitBackoffStats();

    return {
      healthy: !this.circuitBreaker.isOpen() && !backoffStats.isInBackoff,
      circuitState: cbStats.state,
      failureCount: cbStats.failureCount,
      rateLimitRemaining: rlStats.remainingRequests,
      rateLimitTotal: rlStats.maxRequests,
      rateLimitBackoff: backoffStats,
    };
  }

  /**
   * Update provider configuration
   * Used when user changes settings
   */
  updateConfig(config: Partial<ProviderConfig>): void {
    // Only update and log if config actually changed
    const hasChanged = Object.keys(config).some(key => {
      const configKey = key as keyof ProviderConfig;
      return this.config[configKey] !== config[configKey];
    });

    if (hasChanged) {
      this.config = { ...this.config, ...config };
      logger.debug(`Updated configuration for provider: ${this.capabilities.id}`, config);
    }
  }

  /**
   * Update provider options
   */
  updateOptions(options: Partial<ProviderOptions>): void {
    this.options = { ...this.options, ...options };
    logger.info(`Updated options for provider: ${this.capabilities.id}`, options);
  }

  // ============================================
  // PROTECTED HELPERS (Available to concrete providers)
  // ============================================

  /**
   * Create default circuit breaker
   * Can be overridden by concrete providers
   */
  protected createCircuitBreaker(): CircuitBreaker {
    return new CircuitBreaker({
      threshold: 5,
      resetTimeoutMs: 5 * 60 * 1000, // 5 minutes
      onOpen: () => this.handleCircuitBreakerOpen(),
      onClose: () => this.handleCircuitBreakerClose(),
    });
  }

  /**
   * Handle circuit breaker opening
   */
  protected handleCircuitBreakerOpen(): void {
    logger.error(`Circuit breaker opened for provider: ${this.capabilities.id}`);
    // Could emit event for UI notification
  }

  /**
   * Handle circuit breaker closing
   */
  protected handleCircuitBreakerClose(): void {
    logger.info(`Circuit breaker closed for provider: ${this.capabilities.id}`);
    // Could emit event for UI notification
  }

  /**
   * Check if we need to wait due to rate limit backoff
   * Called before making any request
   */
  private async checkRateLimitBackoff(): Promise<void> {
    if (this.rateLimitBackoffMs === 0) {
      return; // No backoff needed
    }

    const timeSinceLastRequest = Date.now() - this.lastRequestTime;
    const remainingBackoff = this.rateLimitBackoffMs - timeSinceLastRequest;

    if (remainingBackoff > 0) {
      this.log('warn', `Rate limit backoff active, waiting ${remainingBackoff}ms`, {
        consecutiveRateLimits: this.consecutiveRateLimits,
        totalBackoff: this.rateLimitBackoffMs,
      });
      await this.delay(remainingBackoff);
    }
  }

  /**
   * Handle a 429 rate limit response
   * Sets exponential backoff based on consecutive rate limits
   */
  private handleRateLimitResponse(retryAfter?: number): void {
    this.consecutiveRateLimits++;

    if (retryAfter !== undefined && retryAfter > 0) {
      // Provider specified a Retry-After value (in seconds), use it
      this.rateLimitBackoffMs = retryAfter * 1000;
      this.log('warn', `Rate limit hit, using Retry-After: ${retryAfter}s`, {
        consecutiveRateLimits: this.consecutiveRateLimits,
      });
    } else {
      // Calculate exponential backoff: 1s, 2s, 4s, 8s, 30s (capped)
      const backoffMs = Math.min(
        this.BASE_BACKOFF_MS * Math.pow(2, this.consecutiveRateLimits - 1),
        this.MAX_BACKOFF_MS
      );
      this.rateLimitBackoffMs = backoffMs;
      this.log('warn', `Rate limit hit, applying exponential backoff: ${backoffMs}ms`, {
        consecutiveRateLimits: this.consecutiveRateLimits,
      });
    }

    this.lastRequestTime = Date.now();
  }

  /**
   * Reset rate limit backoff state on successful request
   */
  private resetRateLimitBackoff(): void {
    if (this.consecutiveRateLimits > 0) {
      this.log('info', 'Rate limit backoff reset after successful request', {
        previousConsecutiveRateLimits: this.consecutiveRateLimits,
      });
    }
    this.consecutiveRateLimits = 0;
    this.rateLimitBackoffMs = 0;
  }

  /**
   * Parse HTTP error response into appropriate error class
   * Concrete providers should use this to standardize error handling
   *
   * @param error - The error object (typically from axios or fetch)
   * @param resourceId - Optional resource identifier for context
   * @returns Standardized ApplicationError subclass
   */
  protected parseHttpError(error: unknown, resourceId?: string | number): ProviderError | ResourceNotFoundError | AuthenticationError | NetworkError {
    const providerName = this.capabilities.id;

    // Check if it's already an ApplicationError
    if (error instanceof ProviderError || error instanceof ResourceNotFoundError || error instanceof AuthenticationError || error instanceof NetworkError) {
      return error;
    }

    // Handle axios-style errors
    const err = error as { response?: { status: number; data?: { message?: string; status_message?: string }; headers: Record<string, string> } };
    if (err.response) {
      const status = err.response.status;
      const message = err.response.data?.message || err.response.data?.status_message || getErrorMessage(error);

      switch (status) {
        case 429: {
          // Rate limit exceeded
          // Try to extract Retry-After header (can be in seconds or HTTP date)
          const retryAfter = err.response.headers['retry-after'];
          let retryAfterSeconds: number | undefined;

          if (retryAfter) {
            const parsed = parseInt(retryAfter, 10);
            if (!isNaN(parsed)) {
              retryAfterSeconds = parsed;
            } else {
              // Try parsing as HTTP date
              const retryDate = new Date(retryAfter);
              if (!isNaN(retryDate.getTime())) {
                retryAfterSeconds = Math.ceil((retryDate.getTime() - Date.now()) / 1000);
              }
            }
          }

          return new RateLimitError(
            providerName,
            retryAfterSeconds,
            message,
            { service: 'BaseProvider', operation: 'parseHttpError', metadata: { statusCode: status } }
          );
        }

        case 404:
          // Not found
          return new ResourceNotFoundError(
            'provider-resource',
            resourceId || 'unknown',
            message,
            { service: 'BaseProvider', operation: 'parseHttpError', metadata: { provider: providerName } }
          );

        case 401:
        case 403:
          // Authentication/authorization error
          return new AuthenticationError(
            message,
            { service: 'BaseProvider', operation: 'parseHttpError', metadata: { statusCode: status, provider: providerName } }
          );

        case 500:
        case 502:
        case 503:
        case 504:
          // Server error
          return new ProviderServerError(
            providerName,
            status,
            message,
            { service: 'BaseProvider', operation: 'parseHttpError' }
          );

        default:
          // Generic provider error
          return new ProviderError(
            message || `HTTP ${status} error`,
            providerName,
            ErrorCode.PROVIDER_INVALID_RESPONSE,
            status,
            false, // Not retryable by default
            { service: 'BaseProvider', operation: 'parseHttpError' }
          );
      }
    }

    // Handle network errors (no response received)
    if ((error as { request?: unknown }).request) {
      return new NetworkError(
        `Network error connecting to provider ${providerName}`,
        ErrorCode.NETWORK_CONNECTION_FAILED,
        undefined,
        { service: 'BaseProvider', operation: 'parseHttpError', metadata: { provider: providerName } },
        error as Error
      );
    }

    // Generic error
    return new ProviderError(
      getErrorMessage(error) || 'Unknown error',
      providerName,
      ErrorCode.PROVIDER_INVALID_RESPONSE,
      500,
      false, // Not retryable by default
      { service: 'BaseProvider', operation: 'parseHttpError' }
    );
  }

  /**
   * Execute a request with rate limiting and circuit breaker
   * Concrete providers should use this for all API calls
   */
  protected async executeRequest<T>(
    fn: () => Promise<T>,
    operation: string,
    priority: 'webhook' | 'user' | 'background' = 'background'
  ): Promise<T> {
    // Check if we need to wait due to previous rate limits
    await this.checkRateLimitBackoff();

    try {
      const result = await this.circuitBreaker.execute(async () => {
        return await this.rateLimiter.execute(fn, priority);
      });

      // Success - reset rate limit backoff
      this.resetRateLimitBackoff();
      return result;
    } catch (error) {
      // Handle rate limit errors specially
      if (error instanceof RateLimitError) {
        this.handleRateLimitResponse(error.retryAfter);
      }

      logger.error(`Provider request failed: ${this.capabilities.id} - ${operation}`, {
        error: getErrorMessage(error),
        errorType: isError(error) ? error.name : 'Unknown',
        priority,
      });
      throw error;
    }
  }

  /**
   * Delay helper for retry logic
   */
  protected delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Exponential backoff delay calculation
   */
  protected getBackoffDelay(attempt: number, baseDelayMs: number = 1000): number {
    return Math.min(baseDelayMs * Math.pow(2, attempt), 30000); // Max 30 seconds
  }

  /**
   * Log provider activity
   */
  protected log(level: 'debug' | 'info' | 'warn' | 'error', message: string, metadata?: unknown): void {
    logger[level](`[${this.capabilities.id}] ${message}`, metadata);
  }
}
