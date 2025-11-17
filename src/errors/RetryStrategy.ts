/**
 * Retry Strategy System
 *
 * Provides configurable retry policies for handling transient failures.
 * Works in conjunction with the ApplicationError hierarchy to make
 * intelligent retry decisions based on error type and context.
 *
 * @see docs/architecture/ERROR_HANDLING.md for usage guidelines
 */

import { ApplicationError, ErrorCode } from './ApplicationError.js';
import { logger } from '../middleware/logging.js';

// ============================================
// RETRY POLICY CONFIGURATION
// ============================================

export interface RetryPolicy {
  /**
   * Maximum number of retry attempts
   */
  maxAttempts: number;

  /**
   * Initial delay in milliseconds before first retry
   */
  initialDelayMs: number;

  /**
   * Maximum delay in milliseconds between retries
   */
  maxDelayMs: number;

  /**
   * Backoff multiplier (e.g., 2 for exponential backoff)
   */
  backoffMultiplier: number;

  /**
   * Jitter factor (0-1) to randomize retry delays
   * Helps prevent thundering herd problem
   */
  jitterFactor: number;

  /**
   * Error codes that should be retried
   */
  retryableErrorCodes?: ErrorCode[];

  /**
   * Custom function to determine if error is retryable
   * If provided, this overrides the error's built-in retryable flag
   */
  shouldRetry?: (error: Error, attemptNumber: number) => boolean;

  /**
   * Callback invoked before each retry attempt
   */
  onRetry?: (error: Error, attemptNumber: number, delayMs: number) => void;
}

export interface RetryResult<T> {
  success: boolean;
  value?: T;
  error?: Error | undefined;
  attemptCount: number;
  totalDelayMs: number;
}

// ============================================
// PREDEFINED RETRY POLICIES
// ============================================

/**
 * Default retry policy for general operational errors
 */
export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  initialDelayMs: 1000, // 1 second
  maxDelayMs: 30000, // 30 seconds
  backoffMultiplier: 2,
  jitterFactor: 0.1,
};

/**
 * Aggressive retry policy for critical operations
 */
export const AGGRESSIVE_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 5,
  initialDelayMs: 500,
  maxDelayMs: 60000, // 1 minute
  backoffMultiplier: 2,
  jitterFactor: 0.2,
};

/**
 * Conservative retry policy for expensive operations
 */
export const CONSERVATIVE_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 2,
  initialDelayMs: 2000, // 2 seconds
  maxDelayMs: 10000, // 10 seconds
  backoffMultiplier: 2,
  jitterFactor: 0.1,
};

/**
 * Network-specific retry policy with longer delays
 */
export const NETWORK_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 4,
  initialDelayMs: 2000,
  maxDelayMs: 60000,
  backoffMultiplier: 2,
  jitterFactor: 0.3,
  retryableErrorCodes: [
    ErrorCode.NETWORK_CONNECTION_FAILED,
    ErrorCode.NETWORK_TIMEOUT,
    ErrorCode.PROVIDER_RATE_LIMIT,
    ErrorCode.PROVIDER_SERVER_ERROR,
    ErrorCode.PROVIDER_UNAVAILABLE,
  ],
};

/**
 * Database-specific retry policy
 */
export const DATABASE_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  initialDelayMs: 100, // Fast retry for DB locks
  maxDelayMs: 5000,
  backoffMultiplier: 2,
  jitterFactor: 0.1,
  retryableErrorCodes: [
    ErrorCode.DATABASE_QUERY_FAILED,
    ErrorCode.DATABASE_CONNECTION_FAILED,
  ],
};

// ============================================
// RETRY STRATEGY CLASS
// ============================================

export class RetryStrategy {
  constructor(private readonly policy: RetryPolicy = DEFAULT_RETRY_POLICY) {}

  /**
   * Execute an operation with retry logic
   */
  async execute<T>(
    operation: () => Promise<T>,
    operationName: string = 'operation'
  ): Promise<T> {
    const result = await this.executeWithResult(operation, operationName);
    if (result.success && result.value !== undefined) {
      return result.value;
    }
    throw result.error || new Error('Operation failed with no error');
  }

  /**
   * Execute an operation and return detailed result
   */
  async executeWithResult<T>(
    operation: () => Promise<T>,
    operationName: string = 'operation'
  ): Promise<RetryResult<T>> {
    let attemptCount = 0;
    let totalDelayMs = 0;
    let lastError: Error | undefined;

    while (attemptCount < this.policy.maxAttempts) {
      attemptCount++;

      try {
        const value = await operation();
        return {
          success: true,
          value,
          attemptCount,
          totalDelayMs,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if we should retry
        const shouldRetry = this.shouldRetryError(lastError, attemptCount);

        if (!shouldRetry || attemptCount >= this.policy.maxAttempts) {
          logger.warn(`${operationName} failed after ${attemptCount} attempt(s)`, {
            error: lastError.message,
            attemptCount,
            totalDelayMs,
          });

          return {
            success: false,
            error: lastError,
            attemptCount,
            totalDelayMs,
          };
        }

        // Calculate delay before next retry
        const delayMs = this.calculateDelay(attemptCount);
        totalDelayMs += delayMs;

        // Invoke retry callback if provided
        if (this.policy.onRetry) {
          this.policy.onRetry(lastError, attemptCount, delayMs);
        }

        logger.info(`Retrying ${operationName} after error`, {
          error: lastError.message,
          attemptNumber: attemptCount,
          nextAttemptIn: delayMs,
          totalAttempts: this.policy.maxAttempts,
        });

        // Wait before retrying
        await this.sleep(delayMs);
      }
    }

    // Should never reach here, but TypeScript requires it
    return {
      success: false,
      error: lastError,
      attemptCount,
      totalDelayMs,
    };
  }

  /**
   * Determine if an error should be retried
   */
  private shouldRetryError(error: Error, attemptNumber: number): boolean {
    // Custom retry logic takes precedence
    if (this.policy.shouldRetry) {
      return this.policy.shouldRetry(error, attemptNumber);
    }

    // Check if error is an ApplicationError
    if (error instanceof ApplicationError) {
      // Use error's built-in retryable flag
      if (!error.retryable) {
        return false;
      }

      // If specific error codes are configured, check against them
      if (this.policy.retryableErrorCodes) {
        return this.policy.retryableErrorCodes.includes(error.code);
      }

      return true;
    }

    // For non-ApplicationErrors, default to not retrying
    // unless a custom shouldRetry function is provided
    return false;
  }

  /**
   * Calculate delay before next retry using exponential backoff with jitter
   */
  private calculateDelay(attemptNumber: number): number {
    // Exponential backoff: initialDelay * (multiplier ^ (attempt - 1))
    const exponentialDelay =
      this.policy.initialDelayMs *
      Math.pow(this.policy.backoffMultiplier, attemptNumber - 1);

    // Cap at max delay
    const cappedDelay = Math.min(exponentialDelay, this.policy.maxDelayMs);

    // Add jitter to prevent thundering herd
    const jitter = cappedDelay * this.policy.jitterFactor * (Math.random() - 0.5);
    const delayWithJitter = cappedDelay + jitter;

    return Math.max(0, Math.floor(delayWithJitter));
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get the current policy configuration
   */
  getPolicy(): Readonly<RetryPolicy> {
    return { ...this.policy };
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Create a retry strategy with custom policy
 */
export function createRetryStrategy(
  policy: Partial<RetryPolicy>
): RetryStrategy {
  return new RetryStrategy({ ...DEFAULT_RETRY_POLICY, ...policy });
}

/**
 * Convenience function to retry an operation with default policy
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  operationName?: string
): Promise<T> {
  const strategy = new RetryStrategy(DEFAULT_RETRY_POLICY);
  return strategy.execute(operation, operationName);
}

/**
 * Convenience function to retry with network policy
 */
export async function withNetworkRetry<T>(
  operation: () => Promise<T>,
  operationName?: string
): Promise<T> {
  const strategy = new RetryStrategy(NETWORK_RETRY_POLICY);
  return strategy.execute(operation, operationName);
}

/**
 * Convenience function to retry with database policy
 */
export async function withDatabaseRetry<T>(
  operation: () => Promise<T>,
  operationName?: string
): Promise<T> {
  const strategy = new RetryStrategy(DATABASE_RETRY_POLICY);
  return strategy.execute(operation, operationName);
}

/**
 * Extract retry-after delay from RateLimitError or HTTP headers
 */
export function extractRetryAfter(error: Error): number | undefined {
  if (error instanceof ApplicationError) {
    const retryAfter = error.context.metadata?.retryAfter;
    if (typeof retryAfter === 'number') {
      return retryAfter * 1000; // Convert seconds to ms
    }
  }
  return undefined;
}
