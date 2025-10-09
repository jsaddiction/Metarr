/**
 * CircuitBreaker Tests
 */

import { CircuitBreaker, CircuitState } from '../../src/services/providers/utils/CircuitBreaker.js';

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;
  let mockOnOpen: () => void;
  let mockOnClose: () => void;
  let openCalled: boolean;
  let closeCalled: boolean;

  beforeEach(() => {
    openCalled = false;
    closeCalled = false;
    mockOnOpen = () => { openCalled = true; };
    mockOnClose = () => { closeCalled = true; };

    circuitBreaker = new CircuitBreaker({
      threshold: 3,
      resetTimeoutMs: 1000,
      onOpen: mockOnOpen,
      onClose: mockOnClose,
    });
  });

  afterEach(() => {
    circuitBreaker.reset();
  });

  it('should start in closed state', () => {
    expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
    expect(circuitBreaker.isOpen()).toBe(false);
  });

  it('should allow successful requests', async () => {
    const result = await circuitBreaker.execute(async () => 'success');
    expect(result).toBe('success');
    expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
  });

  it('should open circuit after threshold failures', async () => {
    // Make 3 failing requests (threshold)
    for (let i = 0; i < 3; i++) {
      try {
        await circuitBreaker.execute(async () => {
          throw new Error('test failure');
        });
      } catch (error) {
        // Expected
      }
    }

    expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
    expect(circuitBreaker.isOpen()).toBe(true);
    expect(openCalled).toBe(true);
  });

  it('should reject requests when circuit is open', async () => {
    // Open the circuit
    for (let i = 0; i < 3; i++) {
      try {
        await circuitBreaker.execute(async () => {
          throw new Error('test failure');
        });
      } catch (error) {
        // Expected
      }
    }

    // Try to make a request
    await expect(
      circuitBreaker.execute(async () => 'should fail')
    ).rejects.toThrow('Circuit breaker is open');
  });

  it('should transition to half-open after timeout', async () => {
    // Open the circuit
    for (let i = 0; i < 3; i++) {
      try {
        await circuitBreaker.execute(async () => {
          throw new Error('test failure');
        });
      } catch (error) {
        // Expected
      }
    }

    expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);

    // Wait for reset timeout
    await new Promise(resolve => setTimeout(resolve, 1100));

    // Next request should transition to half-open
    const result = await circuitBreaker.execute(async () => 'success');
    expect(result).toBe('success');
  });

  it('should close circuit after successful recovery', async () => {
    // Open the circuit
    for (let i = 0; i < 3; i++) {
      try {
        await circuitBreaker.execute(async () => {
          throw new Error('test failure');
        });
      } catch (error) {
        // Expected
      }
    }

    // Wait for reset timeout
    await new Promise(resolve => setTimeout(resolve, 1100));

    // Make 2 successful requests to close circuit
    await circuitBreaker.execute(async () => 'success');
    await circuitBreaker.execute(async () => 'success');

    expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
    expect(closeCalled).toBe(true);
  });

  it('should reopen circuit if recovery fails', async () => {
    // Open the circuit
    for (let i = 0; i < 3; i++) {
      try {
        await circuitBreaker.execute(async () => {
          throw new Error('test failure');
        });
      } catch (error) {
        // Expected
      }
    }

    // Wait for reset timeout
    await new Promise(resolve => setTimeout(resolve, 1100));

    // Fail during recovery
    try {
      await circuitBreaker.execute(async () => {
        throw new Error('recovery failed');
      });
    } catch (error) {
      // Expected
    }

    expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
  });

  it('should provide statistics', () => {
    const stats = circuitBreaker.getStats();

    expect(stats.state).toBe(CircuitState.CLOSED);
    expect(stats.failureCount).toBe(0);
    expect(stats.threshold).toBe(3);
  });
});
