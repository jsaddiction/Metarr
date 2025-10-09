/**
 * RateLimiter Tests
 */

import { RateLimiter } from '../../src/services/providers/utils/RateLimiter';

describe('RateLimiter', () => {
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    rateLimiter = new RateLimiter({
      requestsPerSecond: 10,
      burstCapacity: 15,
    });
  });

  afterEach(() => {
    rateLimiter.reset();
  });

  it('should allow requests within limit', async () => {
    const results: number[] = [];

    // Make 5 requests (well below limit of 10/sec)
    for (let i = 0; i < 5; i++) {
      await rateLimiter.execute(async () => {
        results.push(i);
      });
    }

    expect(results).toEqual([0, 1, 2, 3, 4]);
  });

  it('should delay requests exceeding limit', async () => {
    const start = Date.now();

    // Make 11 requests (exceeds limit of 10/sec)
    const promises = [];
    for (let i = 0; i < 11; i++) {
      promises.push(rateLimiter.execute(async () => i));
    }

    await Promise.all(promises);
    const elapsed = Date.now() - start;

    // Should take > 1 second due to rate limiting
    expect(elapsed).toBeGreaterThan(900); // Allow some timing variance
  });

  it('should track request count correctly', async () => {
    await rateLimiter.execute(async () => 'test');
    await rateLimiter.execute(async () => 'test');
    await rateLimiter.execute(async () => 'test');

    expect(rateLimiter.getRequestCount()).toBe(3);
  });

  it('should calculate remaining requests', async () => {
    await rateLimiter.execute(async () => 'test');
    await rateLimiter.execute(async () => 'test');

    expect(rateLimiter.getRemainingRequests()).toBe(8); // 10 - 2
  });

  it('should allow burst capacity for high-priority requests', async () => {
    // Make 15 high-priority requests (burst capacity)
    const promises = [];
    for (let i = 0; i < 15; i++) {
      promises.push(rateLimiter.execute(async () => i, 'webhook'));
    }

    const start = Date.now();
    await Promise.all(promises);
    const elapsed = Date.now() - start;

    // Should complete quickly (within burst capacity)
    expect(elapsed).toBeLessThan(500);
  });

  it('should provide statistics', async () => {
    await rateLimiter.execute(async () => 'test');

    const stats = rateLimiter.getStats();

    expect(stats.requestsInWindow).toBe(1);
    expect(stats.maxRequests).toBe(10);
    expect(stats.requestsPerSecond).toBe(10);
    expect(stats.burstCapacity).toBe(15);
  });

  it('should reset correctly', async () => {
    await rateLimiter.execute(async () => 'test');
    await rateLimiter.execute(async () => 'test');

    expect(rateLimiter.getRequestCount()).toBe(2);

    rateLimiter.reset();

    expect(rateLimiter.getRequestCount()).toBe(0);
  });
});
