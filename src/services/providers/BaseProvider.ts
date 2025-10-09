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

export abstract class BaseProvider {
  protected capabilities: ProviderCapabilities;
  protected config: ProviderConfig;
  protected options: ProviderOptions;
  protected rateLimiter: RateLimiter;
  protected circuitBreaker: CircuitBreaker;

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
    throw new Error(`${this.capabilities.id} does not support search`);
  }

  /**
   * Get metadata for an entity
   * Override if provider supports metadata retrieval
   */
  async getMetadata(_request: MetadataRequest): Promise<MetadataResponse> {
    throw new Error(`${this.capabilities.id} does not support metadata retrieval`);
  }

  /**
   * Get asset candidates for an entity
   * Override if provider supports asset retrieval
   */
  async getAssets(_request: AssetRequest): Promise<AssetCandidate[]> {
    throw new Error(`${this.capabilities.id} does not support asset retrieval`);
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

    return {
      healthy: !this.circuitBreaker.isOpen(),
      circuitState: cbStats.state,
      failureCount: cbStats.failureCount,
      rateLimitRemaining: rlStats.remainingRequests,
      rateLimitTotal: rlStats.maxRequests,
    };
  }

  /**
   * Update provider configuration
   * Used when user changes settings
   */
  updateConfig(config: Partial<ProviderConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info(`Updated configuration for provider: ${this.capabilities.id}`, config);
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
   * Execute a request with rate limiting and circuit breaker
   * Concrete providers should use this for all API calls
   */
  protected async executeRequest<T>(
    fn: () => Promise<T>,
    operation: string,
    priority: 'webhook' | 'user' | 'background' = 'background'
  ): Promise<T> {
    try {
      return await this.circuitBreaker.execute(async () => {
        return await this.rateLimiter.execute(fn, priority);
      });
    } catch (error: any) {
      logger.error(`Provider request failed: ${this.capabilities.id} - ${operation}`, {
        error: error.message,
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
  protected log(level: 'debug' | 'info' | 'warn' | 'error', message: string, metadata?: any): void {
    logger[level](`[${this.capabilities.id}] ${message}`, metadata);
  }
}
