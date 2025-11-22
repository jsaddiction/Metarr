/**
 * EnrichAllScheduler Integration Tests
 *
 * Tests bulk enrichment processing with dynamic batching, rate limit handling,
 * error recovery, and progress tracking.
 */

// @ts-nocheck - Test file with mock types
import { jest } from '@jest/globals';
import { EnrichAllScheduler } from '../../src/services/enrichment/EnrichAllScheduler.js';
import { MetadataEnrichmentService } from '../../src/services/enrichment/MetadataEnrichmentService.js';
import { DatabaseConnection } from '../../src/types/database.js';

describe('EnrichAllScheduler', () => {
  let scheduler: EnrichAllScheduler;
  let mockDb: DatabaseConnection;
  let mockEnrichmentService: MetadataEnrichmentService;

  beforeEach(() => {
    // Mock database
    mockDb = {
      get: jest.fn(),
      execute: jest.fn(),
      query: jest.fn(),
      close: jest.fn(),
      beginTransaction: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn(),
    } as any;

    // Mock enrichment service
    mockEnrichmentService = {
      enrichMovie: jest.fn(),
    } as any;

    // Create scheduler instance
    scheduler = new EnrichAllScheduler(mockDb, mockEnrichmentService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Complete Processing', () => {
    it('should process all monitored movies until completion', async () => {
      // Setup: 5 monitored movies
      const movies = [
        { id: 1, title: 'Movie 1' },
        { id: 2, title: 'Movie 2' },
        { id: 3, title: 'Movie 3' },
        { id: 4, title: 'Movie 4' },
        { id: 5, title: 'Movie 5' },
      ];

      (mockDb.query as jest.Mock).mockResolvedValueOnce(movies);

      // All enrichments succeed
      (mockEnrichmentService.enrichMovie as jest.Mock)
        .mockResolvedValueOnce({
          updated: true,
          partial: false,
          rateLimitedProviders: [],
          changedFields: ['plot', 'tagline'],
          completeness: 85,
        })
        .mockResolvedValueOnce({
          updated: false,
          partial: false,
          rateLimitedProviders: [],
        })
        .mockResolvedValueOnce({
          updated: true,
          partial: false,
          rateLimitedProviders: [],
          changedFields: ['runtime'],
          completeness: 90,
        })
        .mockResolvedValueOnce({
          updated: false,
          partial: false,
          rateLimitedProviders: [],
        })
        .mockResolvedValueOnce({
          updated: true,
          partial: false,
          rateLimitedProviders: [],
          changedFields: ['imdb_rating'],
          completeness: 95,
        });

      // Execute
      const stats = await scheduler.enrichAll();

      // Verify all movies processed
      expect(stats.processed).toBe(5);
      expect(stats.updated).toBe(3); // Movies 1, 3, 5 updated
      expect(stats.skipped).toBe(2); // Movies 2, 4 skipped
      expect(stats.stopped).toBe(false);
      expect(stats.stopReason).toBeNull();
      expect(stats.endTime).toBeDefined();

      // Verify all movies were enriched with requireComplete=true
      expect(mockEnrichmentService.enrichMovie).toHaveBeenCalledTimes(5);
      for (let i = 1; i <= 5; i++) {
        expect(mockEnrichmentService.enrichMovie).toHaveBeenCalledWith(i, true);
      }
    });

    it('should handle empty monitored movies list', async () => {
      // No monitored movies
      (mockDb.query as jest.Mock).mockResolvedValueOnce([]);

      // Execute
      const stats = await scheduler.enrichAll();

      // Verify no processing occurred
      expect(stats.processed).toBe(0);
      expect(stats.updated).toBe(0);
      expect(stats.skipped).toBe(0);
      expect(stats.stopped).toBe(false);
      expect(stats.endTime).toBeDefined();

      // Verify enrichMovie was never called
      expect(mockEnrichmentService.enrichMovie).not.toHaveBeenCalled();
    });
  });

  describe('Rate Limit Handling', () => {
    it('should stop when provider is rate limited', async () => {
      // Setup: 10 monitored movies
      const movies = Array.from({ length: 10 }, (_, i) => ({
        id: i + 1,
        title: `Movie ${i + 1}`,
      }));

      (mockDb.query as jest.Mock).mockResolvedValueOnce(movies);

      // First 3 succeed, 4th is rate limited
      (mockEnrichmentService.enrichMovie as jest.Mock)
        .mockResolvedValueOnce({
          updated: true,
          partial: false,
          rateLimitedProviders: [],
        })
        .mockResolvedValueOnce({
          updated: true,
          partial: false,
          rateLimitedProviders: [],
        })
        .mockResolvedValueOnce({
          updated: false,
          partial: false,
          rateLimitedProviders: [],
        })
        .mockResolvedValueOnce({
          updated: false,
          partial: false,
          rateLimitedProviders: ['omdb'], // Rate limited!
        });

      // Execute
      const stats = await scheduler.enrichAll();

      // Verify stopped after 4 movies
      expect(stats.processed).toBe(4);
      expect(stats.updated).toBe(2);
      expect(stats.skipped).toBe(1);
      expect(stats.stopped).toBe(true);
      expect(stats.stopReason).toBe('Provider rate limited: omdb');

      // Verify only 4 movies were processed (not all 10)
      expect(mockEnrichmentService.enrichMovie).toHaveBeenCalledTimes(4);
    });

    it('should continue if rate limited but movie was still updated', async () => {
      // Setup: 5 movies
      const movies = Array.from({ length: 5 }, (_, i) => ({
        id: i + 1,
        title: `Movie ${i + 1}`,
      }));

      (mockDb.query as jest.Mock).mockResolvedValueOnce(movies);

      // Movie 3 is partially rate limited but still updated (from cache)
      (mockEnrichmentService.enrichMovie as jest.Mock)
        .mockResolvedValueOnce({
          updated: true,
          partial: false,
          rateLimitedProviders: [],
        })
        .mockResolvedValueOnce({
          updated: true,
          partial: false,
          rateLimitedProviders: [],
        })
        .mockResolvedValueOnce({
          updated: true, // STILL UPDATED (cache hit)
          partial: true,
          rateLimitedProviders: ['tmdb'], // Rate limited but updated from cache
        })
        .mockResolvedValueOnce({
          updated: true,
          partial: false,
          rateLimitedProviders: [],
        })
        .mockResolvedValueOnce({
          updated: false,
          partial: false,
          rateLimitedProviders: [],
        });

      // Execute
      const stats = await scheduler.enrichAll();

      // Verify all movies processed (didn't stop)
      expect(stats.processed).toBe(5);
      expect(stats.updated).toBe(4);
      expect(stats.skipped).toBe(1);
      expect(stats.stopped).toBe(false);
      expect(stats.stopReason).toBeNull();

      // All movies processed
      expect(mockEnrichmentService.enrichMovie).toHaveBeenCalledTimes(5);
    });

    it('should stop immediately on rate limit without update', async () => {
      // Setup: 100 movies
      const movies = Array.from({ length: 100 }, (_, i) => ({
        id: i + 1,
        title: `Movie ${i + 1}`,
      }));

      (mockDb.query as jest.Mock).mockResolvedValueOnce(movies);

      // First movie is rate limited
      (mockEnrichmentService.enrichMovie as jest.Mock).mockResolvedValueOnce({
        updated: false,
        partial: false,
        rateLimitedProviders: ['omdb'],
      });

      // Execute
      const stats = await scheduler.enrichAll();

      // Verify stopped after 1 movie
      expect(stats.processed).toBe(1);
      expect(stats.updated).toBe(0);
      expect(stats.skipped).toBe(0);
      expect(stats.stopped).toBe(true);
      expect(stats.stopReason).toBe('Provider rate limited: omdb');

      // Only 1 movie processed
      expect(mockEnrichmentService.enrichMovie).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error Handling', () => {
    it('should continue processing after enrichment error', async () => {
      // Setup: 5 movies
      const movies = Array.from({ length: 5 }, (_, i) => ({
        id: i + 1,
        title: `Movie ${i + 1}`,
      }));

      (mockDb.query as jest.Mock).mockResolvedValueOnce(movies);

      // Movie 2 throws error, others succeed
      (mockEnrichmentService.enrichMovie as jest.Mock)
        .mockResolvedValueOnce({
          updated: true,
          partial: false,
          rateLimitedProviders: [],
        })
        .mockRejectedValueOnce(new Error('Transient error')) // Error on movie 2
        .mockResolvedValueOnce({
          updated: true,
          partial: false,
          rateLimitedProviders: [],
        })
        .mockResolvedValueOnce({
          updated: false,
          partial: false,
          rateLimitedProviders: [],
        })
        .mockResolvedValueOnce({
          updated: true,
          partial: false,
          rateLimitedProviders: [],
        });

      // Execute
      const stats = await scheduler.enrichAll();

      // Verify all movies attempted (error didn't stop job)
      expect(stats.processed).toBe(4); // Movie 2 failed, doesn't count
      expect(stats.updated).toBe(3);
      expect(stats.skipped).toBe(1);
      expect(stats.stopped).toBe(false);

      // All 5 movies attempted
      expect(mockEnrichmentService.enrichMovie).toHaveBeenCalledTimes(5);
    });

    it('should handle multiple sequential errors gracefully', async () => {
      // Setup: 5 movies
      const movies = Array.from({ length: 5 }, (_, i) => ({
        id: i + 1,
        title: `Movie ${i + 1}`,
      }));

      (mockDb.query as jest.Mock).mockResolvedValueOnce(movies);

      // Movies 2, 3, 4 all fail
      (mockEnrichmentService.enrichMovie as jest.Mock)
        .mockResolvedValueOnce({ updated: true, partial: false, rateLimitedProviders: [] })
        .mockRejectedValueOnce(new Error('Error 1'))
        .mockRejectedValueOnce(new Error('Error 2'))
        .mockRejectedValueOnce(new Error('Error 3'))
        .mockResolvedValueOnce({ updated: true, partial: false, rateLimitedProviders: [] });

      // Execute
      const stats = await scheduler.enrichAll();

      // Verify processing continued
      expect(stats.processed).toBe(2); // Movies 1 and 5 succeeded
      expect(stats.updated).toBe(2);
      expect(stats.skipped).toBe(0);
      expect(stats.stopped).toBe(false);

      // All 5 attempted
      expect(mockEnrichmentService.enrichMovie).toHaveBeenCalledTimes(5);
    });
  });

  describe('Concurrent Protection', () => {
    it('should prevent concurrent runs', async () => {
      // Setup: 10 movies with slow processing
      const movies = Array.from({ length: 10 }, (_, i) => ({
        id: i + 1,
        title: `Movie ${i + 1}`,
      }));

      (mockDb.query as jest.Mock).mockResolvedValue(movies);

      // Slow enrichment (100ms per movie)
      (mockEnrichmentService.enrichMovie as jest.Mock).mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  updated: true,
                  partial: false,
                  rateLimitedProviders: [],
                }),
              100
            )
          )
      );

      // Start first run
      const firstRun = scheduler.enrichAll();

      // Try to start second run while first is running
      await expect(scheduler.enrichAll()).rejects.toThrow('Enrichment job already in progress');

      // Wait for first run to complete
      await firstRun;

      // Now second run should succeed
      await expect(scheduler.enrichAll()).resolves.toBeDefined();
    });

    it('should allow new run after previous completes', async () => {
      // First run
      (mockDb.query as jest.Mock).mockResolvedValueOnce([{ id: 1, title: 'Movie 1' }]);
      (mockEnrichmentService.enrichMovie as jest.Mock).mockResolvedValueOnce({
        updated: true,
        partial: false,
        rateLimitedProviders: [],
      });

      const stats1 = await scheduler.enrichAll();
      expect(stats1.processed).toBe(1);

      // Second run (should work)
      (mockDb.query as jest.Mock).mockResolvedValueOnce([{ id: 2, title: 'Movie 2' }]);
      (mockEnrichmentService.enrichMovie as jest.Mock).mockResolvedValueOnce({
        updated: true,
        partial: false,
        rateLimitedProviders: [],
      });

      const stats2 = await scheduler.enrichAll();
      expect(stats2.processed).toBe(1);
    });

    it('should allow new run after previous throws error', async () => {
      // First run throws error
      (mockDb.query as jest.Mock).mockRejectedValueOnce(new Error('Database error'));

      await expect(scheduler.enrichAll()).rejects.toThrow('Database error');

      // Second run should work
      (mockDb.query as jest.Mock).mockResolvedValueOnce([{ id: 1, title: 'Movie 1' }]);
      (mockEnrichmentService.enrichMovie as jest.Mock).mockResolvedValueOnce({
        updated: true,
        partial: false,
        rateLimitedProviders: [],
      });

      const stats = await scheduler.enrichAll();
      expect(stats.processed).toBe(1);
    });
  });

  describe('Statistics Tracking', () => {
    it('should track statistics correctly for mixed results', async () => {
      // Setup: 10 movies with mixed results
      const movies = Array.from({ length: 10 }, (_, i) => ({
        id: i + 1,
        title: `Movie ${i + 1}`,
      }));

      (mockDb.query as jest.Mock).mockResolvedValueOnce(movies);

      // Mix of updated, skipped, and errors
      const enrichMock = mockEnrichmentService.enrichMovie as jest.Mock;
      enrichMock.mockResolvedValueOnce({ updated: true, partial: false, rateLimitedProviders: [] }); // 1: updated
      enrichMock.mockResolvedValueOnce({ updated: false, partial: false, rateLimitedProviders: [] }); // 2: skipped
      enrichMock.mockResolvedValueOnce({ updated: true, partial: false, rateLimitedProviders: [] }); // 3: updated
      enrichMock.mockRejectedValueOnce(new Error('Error')); // 4: error (doesn't count)
      enrichMock.mockResolvedValueOnce({ updated: false, partial: false, rateLimitedProviders: [] }); // 5: skipped
      enrichMock.mockResolvedValueOnce({ updated: true, partial: false, rateLimitedProviders: [] }); // 6: updated
      enrichMock.mockResolvedValueOnce({ updated: true, partial: false, rateLimitedProviders: [] }); // 7: updated
      enrichMock.mockResolvedValueOnce({ updated: false, partial: false, rateLimitedProviders: [] }); // 8: skipped
      enrichMock.mockResolvedValueOnce({ updated: true, partial: false, rateLimitedProviders: [] }); // 9: updated
      enrichMock.mockResolvedValueOnce({ updated: false, partial: false, rateLimitedProviders: [] }); // 10: skipped

      const stats = await scheduler.enrichAll();

      expect(stats.processed).toBe(9); // 10 - 1 error
      expect(stats.updated).toBe(5); // Movies 1, 3, 6, 7, 9
      expect(stats.skipped).toBe(4); // Movies 2, 5, 8, 10
      expect(stats.stopped).toBe(false);
      expect(stats.stopReason).toBeNull();
    });

    it('should provide last run statistics', async () => {
      // First run
      (mockDb.query as jest.Mock).mockResolvedValueOnce([
        { id: 1, title: 'Movie 1' },
        { id: 2, title: 'Movie 2' },
      ]);
      (mockEnrichmentService.enrichMovie as jest.Mock)
        .mockResolvedValueOnce({ updated: true, partial: false, rateLimitedProviders: [] })
        .mockResolvedValueOnce({ updated: false, partial: false, rateLimitedProviders: [] });

      await scheduler.enrichAll();

      const stats = scheduler.getLastRunStats();
      expect(stats).not.toBeNull();
      expect(stats?.processed).toBe(2);
      expect(stats?.updated).toBe(1);
      expect(stats?.skipped).toBe(1);
    });

    it('should update last run stats on each run', async () => {
      // First run
      (mockDb.query as jest.Mock).mockResolvedValueOnce([{ id: 1, title: 'Movie 1' }]);
      (mockEnrichmentService.enrichMovie as jest.Mock).mockResolvedValueOnce({
        updated: true,
        partial: false,
        rateLimitedProviders: [],
      });

      await scheduler.enrichAll();
      const stats1 = scheduler.getLastRunStats();
      expect(stats1?.processed).toBe(1);

      // Second run
      (mockDb.query as jest.Mock).mockResolvedValueOnce([
        { id: 1, title: 'Movie 1' },
        { id: 2, title: 'Movie 2' },
        { id: 3, title: 'Movie 3' },
      ]);
      (mockEnrichmentService.enrichMovie as jest.Mock)
        .mockResolvedValueOnce({ updated: true, partial: false, rateLimitedProviders: [] })
        .mockResolvedValueOnce({ updated: true, partial: false, rateLimitedProviders: [] })
        .mockResolvedValueOnce({ updated: false, partial: false, rateLimitedProviders: [] });

      await scheduler.enrichAll();
      const stats2 = scheduler.getLastRunStats();
      expect(stats2?.processed).toBe(3);
    });

    it('should return null for last run stats if never run', () => {
      const stats = scheduler.getLastRunStats();
      expect(stats).toBeNull();
    });

    it('should track running state correctly', async () => {
      expect(scheduler.isJobRunning()).toBe(false);

      // Setup slow processing
      (mockDb.query as jest.Mock).mockResolvedValue([{ id: 1, title: 'Movie 1' }]);
      (mockEnrichmentService.enrichMovie as jest.Mock).mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  updated: true,
                  partial: false,
                  rateLimitedProviders: [],
                }),
              100
            )
          )
      );

      // Start run
      const runPromise = scheduler.enrichAll();

      // Should be running
      expect(scheduler.isJobRunning()).toBe(true);

      // Wait for completion
      await runPromise;

      // Should be done
      expect(scheduler.isJobRunning()).toBe(false);
    });
  });

  describe('Progress Logging', () => {
    it('should log progress every 100 movies', async () => {
      // Setup: 250 movies
      const movies = Array.from({ length: 250 }, (_, i) => ({
        id: i + 1,
        title: `Movie ${i + 1}`,
      }));

      (mockDb.query as jest.Mock).mockResolvedValueOnce(movies);

      // All succeed
      (mockEnrichmentService.enrichMovie as jest.Mock).mockResolvedValue({
        updated: true,
        partial: false,
        rateLimitedProviders: [],
      });

      // Execute
      const stats = await scheduler.enrichAll();

      // Verify all processed
      expect(stats.processed).toBe(250);
      expect(stats.updated).toBe(250);

      // Progress should be logged at 100 and 200 (not 250, that's the final log)
      expect(mockEnrichmentService.enrichMovie).toHaveBeenCalledTimes(250);
    });
  });

  describe('Non-Monitored Movies', () => {
    it('should skip non-monitored movies', async () => {
      // Query should only return monitored movies
      const monitoredMovies = [
        { id: 1, title: 'Monitored 1' },
        { id: 3, title: 'Monitored 2' },
      ];

      (mockDb.query as jest.Mock).mockResolvedValueOnce(monitoredMovies);
      (mockEnrichmentService.enrichMovie as jest.Mock).mockResolvedValue({
        updated: true,
        partial: false,
        rateLimitedProviders: [],
      });

      const stats = await scheduler.enrichAll();

      // Only monitored movies processed
      expect(stats.processed).toBe(2);

      // Verify query filtered for monitored=1
      expect(mockDb.query).toHaveBeenCalledWith(
        'SELECT id, title FROM movies WHERE monitored = 1 ORDER BY id ASC'
      );
    });
  });
});
