/**
 * Circuit Breaker Utility
 *
 * Prevents cascading failures by temporarily stopping requests to a failing provider.
 * Implements the circuit breaker pattern with automatic recovery.
 */

import { logger } from '../../../middleware/logging.js';

export interface CircuitBreakerConfig {
  threshold: number; // Number of consecutive failures before opening
  resetTimeoutMs: number; // Time to wait before attempting recovery
  onOpen?: () => void; // Callback when circuit opens
  onClose?: () => void; // Callback when circuit closes
  onHalfOpen?: () => void; // Callback when entering half-open state
}

export enum CircuitState {
  CLOSED = 'closed', // Normal operation
  OPEN = 'open', // Failing, rejecting requests
  HALF_OPEN = 'half_open', // Testing if service recovered
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime: number | null = null;
  private resetTimer: NodeJS.Timeout | null = null;

  private readonly threshold: number;
  private readonly resetTimeoutMs: number;
  private readonly onOpen?: () => void;
  private readonly onClose?: () => void;
  private readonly onHalfOpen?: () => void;

  constructor(config: CircuitBreakerConfig) {
    this.threshold = config.threshold;
    this.resetTimeoutMs = config.resetTimeoutMs;
    this.onOpen = config.onOpen;
    this.onClose = config.onClose;
    this.onHalfOpen = config.onHalfOpen;
  }

  /**
   * Execute a function through the circuit breaker
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      // Check if we should transition to half-open
      if (this.shouldAttemptReset()) {
        this.transitionToHalfOpen();
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Record a successful request
   */
  private onSuccess(): void {
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;

      // Require 2 successful requests to close circuit
      if (this.successCount >= 2) {
        this.transitionToClosed();
      }
    }
  }

  /**
   * Record a failed request
   */
  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      // Failed during recovery attempt, reopen circuit
      this.transitionToOpen();
    } else if (this.failureCount >= this.threshold) {
      this.transitionToOpen();
    }
  }

  /**
   * Transition to OPEN state
   */
  private transitionToOpen(): void {
    this.state = CircuitState.OPEN;
    this.successCount = 0;

    logger.warn('Circuit breaker opened', {
      failureCount: this.failureCount,
      threshold: this.threshold,
    });

    if (this.onOpen) {
      this.onOpen();
    }

    // Schedule reset attempt
    this.scheduleReset();
  }

  /**
   * Transition to HALF_OPEN state
   */
  private transitionToHalfOpen(): void {
    this.state = CircuitState.HALF_OPEN;
    this.successCount = 0;

    logger.info('Circuit breaker half-open, attempting recovery');

    if (this.onHalfOpen) {
      this.onHalfOpen();
    }
  }

  /**
   * Transition to CLOSED state
   */
  private transitionToClosed(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;

    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }

    logger.info('Circuit breaker closed, normal operation resumed');

    if (this.onClose) {
      this.onClose();
    }
  }

  /**
   * Check if we should attempt to reset the circuit
   */
  private shouldAttemptReset(): boolean {
    if (!this.lastFailureTime) {
      return false;
    }

    const timeSinceLastFailure = Date.now() - this.lastFailureTime;
    return timeSinceLastFailure >= this.resetTimeoutMs;
  }

  /**
   * Schedule automatic reset attempt
   */
  private scheduleReset(): void {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
    }

    this.resetTimer = setTimeout(() => {
      if (this.state === CircuitState.OPEN) {
        this.transitionToHalfOpen();
      }
    }, this.resetTimeoutMs);
  }

  /**
   * Check if circuit is open
   */
  isOpen(): boolean {
    return this.state === CircuitState.OPEN;
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get circuit breaker statistics
   */
  getStats() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      threshold: this.threshold,
      lastFailureTime: this.lastFailureTime
        ? new Date(this.lastFailureTime).toISOString()
        : null,
    };
  }

  /**
   * Manually reset the circuit breaker (for testing)
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;

    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }
  }
}
