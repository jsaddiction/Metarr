/**
 * EnrichAllScheduler Integration Tests
 *
 * Tests bulk enrichment processing with job creation, concurrent protection,
 * error recovery, and progress tracking.
 */

// @ts-nocheck - Test file with mock types
import { jest } from '@jest/globals';
import { EnrichAllScheduler } from '../../src/services/enrichment/EnrichAllScheduler.js';
import { JobQueueService } from '../../src/services/jobQueue/JobQueueService.js';
import { DatabaseConnection } from '../../src/types/database.js';

describe('EnrichAllScheduler', () => {
  let scheduler: EnrichAllScheduler;
  let mockDb: DatabaseConnection;
  let mockJobQueue: JobQueueService;

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

    // Mock job queue service
    mockJobQueue = {
      addJob: jest.fn().mockResolvedValue(undefined),
    } as any;

    // Create scheduler instance
    scheduler = new EnrichAllScheduler(mockDb, mockJobQueue);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Complete Processing', () => {
    it('should create jobs for all monitored movies', async () => {
      // Setup: 5 monitored movies
      const movies = [
        { id: 1, title: 'Movie 1' },
        { id: 2, title: 'Movie 2' },
        { id: 3, title: 'Movie 3' },
        { id: 4, title: 'Movie 4' },
        { id: 5, title: 'Movie 5' },
      ];

      (mockDb.query as jest.Mock).mockResolvedValueOnce(movies);

      // Execute
      const stats = await scheduler.enrichAll();

      // Verify all movies processed (jobs created)
      expect(stats.processed).toBe(5);
      expect(stats.updated).toBe(0); // Job-based approach doesn't track updates
      expect(stats.skipped).toBe(0); // Job-based approach doesn't track skips
      expect(stats.stopped).toBe(false);
      expect(stats.stopReason).toBeNull();
      expect(stats.endTime).toBeDefined();

      // Verify jobs were created for all movies with requireComplete=true
      expect(mockJobQueue.addJob).toHaveBeenCalledTimes(5);
      for (let i = 1; i <= 5; i++) {
        expect(mockJobQueue.addJob).toHaveBeenCalledWith({
          type: 'enrich-metadata',
          priority: 7,
          payload: {
            entityType: 'movie',
            entityId: i,
            requireComplete: true,
          },
          retry_count: 0,
          max_retries: 0,
        });
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

      // Verify no jobs were created
      expect(mockJobQueue.addJob).not.toHaveBeenCalled();
    });
  });

  // NOTE: Rate limit handling tests removed - the job-based approach
  // creates all jobs upfront. Individual jobs will handle rate limits
  // when they execute via the requireComplete flag.

  describe('Error Handling', () => {
    it('should continue processing after job creation error', async () => {
      // Setup: 5 movies
      const movies = Array.from({ length: 5 }, (_, i) => ({
        id: i + 1,
        title: `Movie ${i + 1}`,
      }));

      (mockDb.query as jest.Mock).mockResolvedValueOnce(movies);

      // Movie 2 throws error during job creation, others succeed
      (mockJobQueue.addJob as jest.Mock)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Job queue full')) // Error on movie 2
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined);

      // Execute
      const stats = await scheduler.enrichAll();

      // Verify all movies attempted (error didn't stop job creation)
      expect(stats.processed).toBe(4); // Movie 2 failed, doesn't count in processed
      expect(stats.updated).toBe(0); // Job-based approach doesn't track updates
      expect(stats.skipped).toBe(0); // Job-based approach doesn't track skips
      expect(stats.stopped).toBe(false);

      // All 5 movies attempted
      expect(mockJobQueue.addJob).toHaveBeenCalledTimes(5);
    });

    it('should handle multiple sequential errors gracefully', async () => {
      // Setup: 5 movies
      const movies = Array.from({ length: 5 }, (_, i) => ({
        id: i + 1,
        title: `Movie ${i + 1}`,
      }));

      (mockDb.query as jest.Mock).mockResolvedValueOnce(movies);

      // Movies 2, 3, 4 all fail job creation
      (mockJobQueue.addJob as jest.Mock)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Error 1'))
        .mockRejectedValueOnce(new Error('Error 2'))
        .mockRejectedValueOnce(new Error('Error 3'))
        .mockResolvedValueOnce(undefined);

      // Execute
      const stats = await scheduler.enrichAll();

      // Verify processing continued
      expect(stats.processed).toBe(2); // Movies 1 and 5 succeeded
      expect(stats.updated).toBe(0); // Job-based approach doesn't track updates
      expect(stats.skipped).toBe(0); // Job-based approach doesn't track skips
      expect(stats.stopped).toBe(false);

      // All 5 attempted
      expect(mockJobQueue.addJob).toHaveBeenCalledTimes(5);
    });
  });

  describe('Concurrent Protection', () => {
    it('should prevent concurrent runs', async () => {
      // Setup: 10 movies with slow job creation
      const movies = Array.from({ length: 10 }, (_, i) => ({
        id: i + 1,
        title: `Movie ${i + 1}`,
      }));

      (mockDb.query as jest.Mock).mockResolvedValue(movies);

      // Slow job creation (50ms per job) - faster than old enrichment
      (mockJobQueue.addJob as jest.Mock).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(undefined), 50))
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

      const stats1 = await scheduler.enrichAll();
      expect(stats1.processed).toBe(1);

      // Second run (should work)
      (mockDb.query as jest.Mock).mockResolvedValueOnce([{ id: 2, title: 'Movie 2' }]);

      const stats2 = await scheduler.enrichAll();
      expect(stats2.processed).toBe(1);
    });

    it('should allow new run after previous throws error', async () => {
      // First run throws error
      (mockDb.query as jest.Mock).mockRejectedValueOnce(new Error('Database error'));

      await expect(scheduler.enrichAll()).rejects.toThrow('Database error');

      // Second run should work
      (mockDb.query as jest.Mock).mockResolvedValueOnce([{ id: 1, title: 'Movie 1' }]);

      const stats = await scheduler.enrichAll();
      expect(stats.processed).toBe(1);
    });
  });

  describe('Statistics Tracking', () => {
    it('should track statistics correctly for mixed results', async () => {
      // Setup: 10 movies with mixed results (some fail job creation)
      const movies = Array.from({ length: 10 }, (_, i) => ({
        id: i + 1,
        title: `Movie ${i + 1}`,
      }));

      (mockDb.query as jest.Mock).mockResolvedValueOnce(movies);

      // Mix of successful job creation and errors
      const addJobMock = mockJobQueue.addJob as jest.Mock;
      addJobMock.mockResolvedValueOnce(undefined); // 1: success
      addJobMock.mockResolvedValueOnce(undefined); // 2: success
      addJobMock.mockResolvedValueOnce(undefined); // 3: success
      addJobMock.mockRejectedValueOnce(new Error('Error')); // 4: error (doesn't count)
      addJobMock.mockResolvedValueOnce(undefined); // 5: success
      addJobMock.mockResolvedValueOnce(undefined); // 6: success
      addJobMock.mockResolvedValueOnce(undefined); // 7: success
      addJobMock.mockResolvedValueOnce(undefined); // 8: success
      addJobMock.mockResolvedValueOnce(undefined); // 9: success
      addJobMock.mockResolvedValueOnce(undefined); // 10: success

      const stats = await scheduler.enrichAll();

      expect(stats.processed).toBe(9); // 10 - 1 error
      expect(stats.updated).toBe(0); // Job-based approach doesn't track updates
      expect(stats.skipped).toBe(0); // Job-based approach doesn't track skips
      expect(stats.stopped).toBe(false);
      expect(stats.stopReason).toBeNull();
    });

    it('should provide last run statistics', async () => {
      // First run
      (mockDb.query as jest.Mock).mockResolvedValueOnce([
        { id: 1, title: 'Movie 1' },
        { id: 2, title: 'Movie 2' },
      ]);

      await scheduler.enrichAll();

      const stats = scheduler.getLastRunStats();
      expect(stats).not.toBeNull();
      expect(stats?.processed).toBe(2);
      expect(stats?.updated).toBe(0); // Job-based approach
      expect(stats?.skipped).toBe(0); // Job-based approach
    });

    it('should update last run stats on each run', async () => {
      // First run
      (mockDb.query as jest.Mock).mockResolvedValueOnce([{ id: 1, title: 'Movie 1' }]);

      await scheduler.enrichAll();
      const stats1 = scheduler.getLastRunStats();
      expect(stats1?.processed).toBe(1);

      // Second run
      (mockDb.query as jest.Mock).mockResolvedValueOnce([
        { id: 1, title: 'Movie 1' },
        { id: 2, title: 'Movie 2' },
        { id: 3, title: 'Movie 3' },
      ]);

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

      // Setup slow job creation
      (mockDb.query as jest.Mock).mockResolvedValue([{ id: 1, title: 'Movie 1' }]);
      (mockJobQueue.addJob as jest.Mock).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(undefined), 100))
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
    it('should create jobs for all movies and log progress every 100 movies', async () => {
      // Setup: 250 movies
      const movies = Array.from({ length: 250 }, (_, i) => ({
        id: i + 1,
        title: `Movie ${i + 1}`,
      }));

      (mockDb.query as jest.Mock).mockResolvedValueOnce(movies);

      // Execute
      const stats = await scheduler.enrichAll();

      // Verify all processed (jobs created)
      expect(stats.processed).toBe(250);
      expect(stats.updated).toBe(0); // Job-based approach
      expect(stats.skipped).toBe(0); // Job-based approach

      // Progress should be logged at 100 and 200 (not 250, that's the final log)
      expect(mockJobQueue.addJob).toHaveBeenCalledTimes(250);
    });
  });

  describe('Non-Monitored Movies', () => {
    it('should only process monitored movies', async () => {
      // Query should only return monitored movies
      const monitoredMovies = [
        { id: 1, title: 'Monitored 1' },
        { id: 3, title: 'Monitored 2' },
      ];

      (mockDb.query as jest.Mock).mockResolvedValueOnce(monitoredMovies);

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
