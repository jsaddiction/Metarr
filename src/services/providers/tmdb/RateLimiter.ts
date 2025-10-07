/**
 * Rate Limiter for TMDB API
 * Enforces 40 requests per 10 seconds limit
 */

export class RateLimiter {
  private requests: number[] = []; // Timestamps of requests in current window
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests: number = 40, windowSeconds: number = 10) {
    this.maxRequests = maxRequests;
    this.windowMs = windowSeconds * 1000;
  }

  /**
   * Wait if necessary to respect rate limits, then proceed
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    await this.waitIfNeeded();
    this.recordRequest();
    return fn();
  }

  /**
   * Check if we're at the rate limit
   */
  private isAtLimit(): boolean {
    this.cleanOldRequests();
    return this.requests.length >= this.maxRequests;
  }

  /**
   * Wait until we can make another request
   */
  private async waitIfNeeded(): Promise<void> {
    while (this.isAtLimit()) {
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
    return this.maxRequests - this.getRequestCount();
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
