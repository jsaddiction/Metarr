/**
 * Rate Limiter Utility
 *
 * Enforces configurable rate limits with burst capacity and priority support.
 * Used by all providers to respect API rate limits.
 */

export interface RateLimiterConfig {
  requestsPerSecond: number;
  burstCapacity?: number;
  windowSeconds?: number;
}

export type RequestPriority = 'webhook' | 'user' | 'background';

export class RateLimiter {
  private requests: number[] = []; // Timestamps of requests in current window
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly burstCapacity: number;
  private readonly requestsPerSecond: number;

  constructor(config: RateLimiterConfig) {
    this.requestsPerSecond = config.requestsPerSecond;
    this.windowMs = (config.windowSeconds || 1) * 1000;
    this.maxRequests = config.requestsPerSecond * (config.windowSeconds || 1);
    this.burstCapacity = config.burstCapacity || this.maxRequests;
  }

  /**
   * Execute a function with rate limiting
   * Waits if necessary to respect rate limits, then proceeds
   */
  async execute<T>(fn: () => Promise<T>, priority: RequestPriority = 'background'): Promise<T> {
    await this.waitIfNeeded(priority);
    this.recordRequest();
    return fn();
  }

  /**
   * Check if we're at the rate limit
   */
  private isAtLimit(priority: RequestPriority = 'background'): boolean {
    this.cleanOldRequests();

    // Allow burst for high-priority requests
    const limit = priority === 'webhook' || priority === 'user'
      ? this.burstCapacity
      : this.maxRequests;

    return this.requests.length >= limit;
  }

  /**
   * Wait until we can make another request
   */
  private async waitIfNeeded(priority: RequestPriority = 'background'): Promise<void> {
    while (this.isAtLimit(priority)) {
      const oldestRequest = this.requests[0];
      const timeToWait = this.windowMs - (Date.now() - oldestRequest);

      if (timeToWait > 0) {
        // Wait until the oldest request expires from the window
        await this.delay(timeToWait + 100); // Add 100ms buffer
      }

      this.cleanOldRequests();
    }
  }

  /**
   * Record a new request timestamp
   */
  private recordRequest(): void {
    this.requests.push(Date.now());
  }

  /**
   * Remove requests outside the current window
   */
  private cleanOldRequests(): void {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    this.requests = this.requests.filter(timestamp => timestamp > cutoff);
  }

  /**
   * Get current request count in window
   */
  getRequestCount(): number {
    this.cleanOldRequests();
    return this.requests.length;
  }

  /**
   * Get remaining requests in current window
   */
  getRemainingRequests(): number {
    this.cleanOldRequests();
    return this.maxRequests - this.requests.length;
  }

  /**
   * Get rate limiter statistics
   */
  getStats() {
    return {
      requestsInWindow: this.getRequestCount(),
      remainingRequests: this.getRemainingRequests(),
      maxRequests: this.maxRequests,
      requestsPerSecond: this.requestsPerSecond,
      burstCapacity: this.burstCapacity,
    };
  }

  /**
   * Reset the rate limiter (for testing)
   */
  reset(): void {
    this.requests = [];
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
