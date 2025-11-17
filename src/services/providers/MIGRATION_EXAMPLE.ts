/**
 * Example: Migrating a Provider to Use New Rate Limit Handling
 *
 * This file shows before/after examples of how to update provider implementations
 * to use the new BaseProvider error handling and rate limit backoff.
 */

import { BaseProvider } from './BaseProvider.js';
import axios from 'axios';

// ============================================
// BEFORE: Old pattern with manual 429 handling
// ============================================

class OldStyleProvider extends BaseProvider {
  async getMovieOldStyle(movieId: number): Promise<unknown> {
    return this.requestWithRetry(`/movie/${movieId}`, 3);
  }

  private async requestWithRetry(endpoint: string, retriesLeft: number): Promise<unknown> {
    try {
      const response = await axios.get(endpoint);
      return response.data;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      // Manual 429 handling - NOT RECOMMENDED
      if ((error as { response?: { status?: number } }).response?.status === 429 && retriesLeft > 0) {
        console.log('Rate limited, waiting 5 seconds...');
        await this.delay(5000);
        return this.requestWithRetry(endpoint, retriesLeft - 1);
      }

      // Manual 404 handling
      if ((error as { response?: { status?: number } }).response?.status === 404) {
        throw new Error('Movie not found');
      }

      // Generic error
      throw new Error(`Request failed: ${errorMessage}`);
    }
  }

  protected delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Required abstract methods...
  // @ts-expect-error - Example code only, not implementing full interface
  defineCapabilities() { return {} as unknown; }
  // @ts-expect-error - Example code only, not implementing full interface
  protected createRateLimiter() { return {} as unknown; }
}

// ============================================
// AFTER: New pattern using BaseProvider features
// ============================================

class NewStyleProvider extends BaseProvider {
  /**
   * Approach 1: Use executeRequest (Recommended)
   * - Automatic rate limit handling
   * - Automatic circuit breaker
   * - Built-in error handling
   */
  async getMovieWithExecuteRequest(movieId: number): Promise<unknown> {
    return this.executeRequest(
      async () => {
        const response = await axios.get(`/movie/${movieId}`);
        return response.data;
      },
      'getMovie', // Operation name for logging
      'user' // Priority: 'webhook' | 'user' | 'background'
    );
  }

  /**
   * Approach 2: Use parseHttpError for custom error handling
   * - More control over the request
   * - Still gets standardized errors
   * - Can add custom logic before/after request
   */
  async getMovieWithParseError(movieId: number): Promise<unknown> {
    try {
      // Custom pre-request logic
      this.log('info', `Fetching movie ${movieId}`);

      // Make request
      const response = await axios.get(`/movie/${movieId}`);

      // Custom post-request logic
      this.log('info', `Successfully fetched movie ${movieId}`);

      return response.data;
    } catch (error) {
      // Convert to standardized error - this handles 429, 404, 500+, etc.
      throw this.parseHttpError(error, movieId);
    }
  }

  /**
   * Approach 3: Combine both for maximum flexibility
   * - Use executeRequest for rate limiting and circuit breaker
   * - Use parseHttpError inside for consistent error handling
   */
  async getMovieBestPractice(movieId: number): Promise<Record<string, unknown>> {
    return this.executeRequest(
      async () => {
        try {
          const response = await axios.get(`/movie/${movieId}`);
          return this.transformResponse(response.data);
        } catch (error) {
          // Parse error before throwing
          throw this.parseHttpError(error, movieId);
        }
      },
      'getMovie',
      'user'
    );
  }

  private transformResponse(data: Record<string, unknown>): Record<string, unknown> {
    // Transform provider response to internal format
    const releaseDate = data.release_date as string | undefined;
    return {
      id: data.id,
      title: data.title,
      year: releaseDate?.split('-')[0],
      // ... etc
    };
  }

  // Required abstract methods...
  // @ts-expect-error - Example code only, not implementing full interface
  defineCapabilities() { return {} as unknown; }
  // @ts-expect-error - Example code only, not implementing full interface
  protected createRateLimiter() { return {} as unknown; }
}

// ============================================
// Error Handling Example
// ============================================

import {
  RateLimitError,
  NotFoundError,
  ServerError,
  AuthenticationError,
} from '../../errors/providerErrors.js';

async function callerExample(provider: NewStyleProvider) {
  try {
    const movie = await provider.getMovieBestPractice(12345);
    console.log('Success:', movie);
  } catch (error) {
    // Type-safe error handling
    if (error instanceof RateLimitError) {
      console.log('Rate limited!');
      console.log('Retry after:', error.retryAfter, 'seconds');
      console.log('Provider:', error.providerName);
      // BaseProvider already waited, can retry immediately
      // OR wait longer if you want
    } else if (error instanceof NotFoundError) {
      console.log('Movie not found:', error.resourceId);
      // Don't retry - the resource doesn't exist
    } else if (error instanceof ServerError) {
      console.log('Provider having issues:', error.statusCode);
      // Can retry with backoff
    } else if (error instanceof AuthenticationError) {
      console.log('Invalid API key!');
      // Don't retry - need to fix configuration
    } else {
      console.log('Unknown error:', error);
    }
  }
}

// ============================================
// Key Benefits of New Approach
// ============================================

/**
 * 1. NO MORE MANUAL 429 HANDLING
 *    - BaseProvider handles it automatically
 *    - Exponential backoff is built-in
 *    - Respects Retry-After headers
 *
 * 2. CONSISTENT ERROR TYPES
 *    - All providers use the same error classes
 *    - Type-safe error handling
 *    - Better error messages with context
 *
 * 3. AUTOMATIC BACKOFF RESET
 *    - Successful requests reset the backoff counter
 *    - Self-healing behavior
 *
 * 4. OBSERVABLE STATE
 *    - provider.getRateLimitBackoffStats()
 *    - provider.getHealthStatus()
 *    - See exactly what's happening
 *
 * 5. NO PRE-EMPTIVE THROTTLING
 *    - Requests proceed normally until 429
 *    - Only reacts to actual rate limits
 *    - More responsive than queue-based approaches
 */

export { OldStyleProvider, NewStyleProvider, callerExample };
