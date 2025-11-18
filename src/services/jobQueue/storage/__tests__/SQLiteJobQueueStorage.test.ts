/**
 * SQLiteJobQueueStorage Tests
 *
 * Comprehensive tests for the race condition fix in pickNextJob()
 * which changed from SELECT-then-UPDATE to atomic UPDATE...RETURNING
 *
 * Critical test: Multiple concurrent workers should each get unique jobs (no duplicates)
 */

import { jest } from '@jest/globals';
import { SqliteConnection } from '../../../../database/connections/SqliteConnection.js';
import { SQLiteJobQueueStorage } from '../SQLiteJobQueueStorage.js';
import { Job, JOB_PRIORITY } from '../../types.js';
import { DatabaseConnection } from '../../../../types/database.js';
import path from 'path';
import fs from 'fs';

describe('SQLiteJobQueueStorage', () => {
  let db: DatabaseConnection;
  let storage: SQLiteJobQueueStorage;
  let testDbPath: string;

  beforeEach(async () => {
    // Create a fresh in-memory SQLite database for each test
    testDbPath = path.join(process.cwd(), 'data', `test-job-queue-${Date.now()}.sqlite`);

    // Ensure data directory exists
    const dataDir = path.dirname(testDbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    db = new SqliteConnection({
      type: 'sqlite3',
      database: 'test',
      filename: testDbPath,
    });

    await db.connect!();

    // Create job_queue table
    await db.execute(`
      CREATE TABLE job_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 5,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'processing')),
        payload TEXT NOT NULL,
        error TEXT,
        retry_count INTEGER DEFAULT 0,
        max_retries INTEGER DEFAULT 3,
        manual INTEGER DEFAULT 0,
        started_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.execute('CREATE INDEX idx_jobs_status_priority ON job_queue(status, priority)');
    await db.execute('CREATE INDEX idx_jobs_type ON job_queue(type)');

    storage = new SQLiteJobQueueStorage(db);
  });

  afterEach(async () => {
    await db.close();

    // Clean up test database file
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('Race Condition Prevention (CRITICAL)', () => {
    it('should not assign the same job to multiple concurrent workers', async () => {
      // Create 5 pending jobs
      const jobIds: number[] = [];
      for (let i = 0; i < 5; i++) {
        const jobId = await storage.addJob({
          type: 'scan-movie',
          priority: JOB_PRIORITY.NORMAL,
          payload: {
            libraryId: 1,
            directoryPath: `/movies/test-${i}`,
            manual: false,
          },
          status: 'pending',
          retry_count: 0,
          max_retries: 3,
          manual: false,
        });
        jobIds.push(jobId);
      }

      // Simulate 10 concurrent workers trying to pick jobs
      const pickPromises: Promise<Job | null>[] = [];
      for (let i = 0; i < 10; i++) {
        pickPromises.push(storage.pickNextJob());
      }

      // Wait for all workers to complete
      const results = await Promise.all(pickPromises);

      // Filter out nulls (workers that got nothing)
      const pickedJobs = results.filter((job): job is Job => job !== null);

      // Count nulls (workers that correctly got nothing)
      const nullCount = results.filter(job => job === null).length;

      // CRITICAL ASSERTIONS:
      // 1. Exactly 5 jobs should be picked (we only have 5 jobs)
      expect(pickedJobs).toHaveLength(5);

      // 2. Exactly 5 workers should get null (no jobs left for them)
      expect(nullCount).toBe(5);

      // 3. All picked jobs should have unique IDs (NO DUPLICATES)
      const pickedJobIds = pickedJobs.map(job => job.id);
      const uniqueJobIds = new Set(pickedJobIds);
      expect(uniqueJobIds.size).toBe(5);
      expect(pickedJobIds).toHaveLength(5);

      // 4. All picked jobs should be in 'processing' state
      for (const job of pickedJobs) {
        expect(job.status).toBe('processing');
        expect(job.started_at).toBeTruthy();
      }

      // 5. Verify database state - all jobs should be 'processing'
      const dbJobs = await storage.listJobs({ status: 'processing' });
      expect(dbJobs).toHaveLength(5);

      // 6. No pending jobs should remain
      const pendingJobs = await storage.listJobs({ status: 'pending' });
      expect(pendingJobs).toHaveLength(0);
    });

    it('should handle extreme concurrency (100 workers, 10 jobs)', async () => {
      // Create 10 jobs
      for (let i = 0; i < 10; i++) {
        await storage.addJob({
          type: 'enrich-metadata',
          priority: JOB_PRIORITY.NORMAL,
          payload: {
            entityType: 'movie',
            entityId: i + 1,
          },
          status: 'pending',
          retry_count: 0,
          max_retries: 3,
          manual: false,
        });
      }

      // Simulate 100 concurrent workers
      const pickPromises: Promise<Job | null>[] = [];
      for (let i = 0; i < 100; i++) {
        pickPromises.push(storage.pickNextJob());
      }

      const results = await Promise.all(pickPromises);
      const pickedJobs = results.filter((job): job is Job => job !== null);
      const nullCount = results.filter(job => job === null).length;

      // Exactly 10 jobs picked, 90 nulls
      expect(pickedJobs).toHaveLength(10);
      expect(nullCount).toBe(90);

      // All picked jobs unique
      const pickedJobIds = pickedJobs.map(job => job.id);
      const uniqueJobIds = new Set(pickedJobIds);
      expect(uniqueJobIds.size).toBe(10);
    });

    it('should handle sequential picks without duplication', async () => {
      // Create 3 jobs
      await storage.addJob({
        type: 'publish',
        priority: JOB_PRIORITY.HIGH,
        payload: { entityType: 'movie', entityId: 1 },
        status: 'pending',
        retry_count: 0,
        max_retries: 3,
      });
      await storage.addJob({
        type: 'publish',
        priority: JOB_PRIORITY.NORMAL,
        payload: { entityType: 'movie', entityId: 2 },
        status: 'pending',
        retry_count: 0,
        max_retries: 3,
      });
      await storage.addJob({
        type: 'publish',
        priority: JOB_PRIORITY.LOW,
        payload: { entityType: 'movie', entityId: 3 },
        status: 'pending',
        retry_count: 0,
        max_retries: 3,
      });

      // Pick jobs sequentially
      const job1 = await storage.pickNextJob();
      const job2 = await storage.pickNextJob();
      const job3 = await storage.pickNextJob();
      const job4 = await storage.pickNextJob();

      // First 3 picks should get jobs
      expect(job1).not.toBeNull();
      expect(job2).not.toBeNull();
      expect(job3).not.toBeNull();

      // Fourth pick should get null
      expect(job4).toBeNull();

      // All should have unique IDs
      const ids = [job1!.id, job2!.id, job3!.id];
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(3);
    });
  });

  describe('Atomic Operation', () => {
    it('should atomically transition job from pending to processing', async () => {
      const jobId = await storage.addJob({
        type: 'scan-movie',
        priority: JOB_PRIORITY.NORMAL,
        payload: {
          libraryId: 1,
          directoryPath: '/movies/test',
          manual: true,
        },
        status: 'pending',
        retry_count: 0,
        max_retries: 3,
        manual: true,
      });

      // Verify initial state
      const initialJob = await storage.getJob(jobId);
      expect(initialJob?.status).toBe('pending');
      expect(initialJob?.started_at).toBeFalsy();

      // Pick the job
      const pickedJob = await storage.pickNextJob();

      // Verify atomic state change
      expect(pickedJob).not.toBeNull();
      expect(pickedJob!.id).toBe(jobId);
      expect(pickedJob!.status).toBe('processing');
      expect(pickedJob!.started_at).toBeTruthy();

      // Verify database state
      const dbJob = await storage.getJob(jobId);
      expect(dbJob?.status).toBe('processing');
      expect(dbJob?.started_at).toBeTruthy();
    });

    it('should preserve job metadata during atomic update', async () => {
      const originalPayload = {
        libraryId: 42,
        directoryPath: '/movies/the-matrix',
        manual: true,
      };

      const jobId = await storage.addJob({
        type: 'scan-movie',
        priority: JOB_PRIORITY.HIGH,
        payload: originalPayload,
        status: 'pending',
        retry_count: 2,
        max_retries: 5,
        manual: true,
      });

      const pickedJob = await storage.pickNextJob();

      // Verify all metadata preserved
      expect(pickedJob).not.toBeNull();
      expect(pickedJob!.id).toBe(jobId);
      expect(pickedJob!.type).toBe('scan-movie');
      expect(pickedJob!.priority).toBe(JOB_PRIORITY.HIGH);
      expect(pickedJob!.payload).toEqual(originalPayload);
      expect(pickedJob!.retry_count).toBe(2);
      expect(pickedJob!.max_retries).toBe(5);
      expect(pickedJob!.manual).toBe(true);
      expect(pickedJob!.status).toBe('processing');
    });

    it('should set started_at timestamp during atomic update', async () => {
      const beforePick = new Date();

      await storage.addJob({
        type: 'enrich-metadata',
        priority: JOB_PRIORITY.NORMAL,
        payload: { entityType: 'movie', entityId: 1 },
        status: 'pending',
        retry_count: 0,
        max_retries: 3,
      });

      const pickedJob = await storage.pickNextJob();
      const afterPick = new Date();

      expect(pickedJob).not.toBeNull();
      expect(pickedJob!.started_at).toBeTruthy();

      // Verify timestamp is within reasonable range
      const startedAt = new Date(pickedJob!.started_at!);
      expect(startedAt.getTime()).toBeGreaterThanOrEqual(beforePick.getTime());
      expect(startedAt.getTime()).toBeLessThanOrEqual(afterPick.getTime());
    });
  });

  describe('Priority Ordering', () => {
    it('should pick higher priority jobs first (lower number = higher priority)', async () => {
      // Add jobs in reverse priority order
      const lowPriorityId = await storage.addJob({
        type: 'publish',
        priority: JOB_PRIORITY.LOW, // 8
        payload: { entityType: 'movie', entityId: 1 },
        status: 'pending',
        retry_count: 0,
        max_retries: 3,
      });

      const normalPriorityId = await storage.addJob({
        type: 'publish',
        priority: JOB_PRIORITY.NORMAL, // 5
        payload: { entityType: 'movie', entityId: 2 },
        status: 'pending',
        retry_count: 0,
        max_retries: 3,
      });

      const highPriorityId = await storage.addJob({
        type: 'publish',
        priority: JOB_PRIORITY.HIGH, // 3
        payload: { entityType: 'movie', entityId: 3 },
        status: 'pending',
        retry_count: 0,
        max_retries: 3,
      });

      const criticalPriorityId = await storage.addJob({
        type: 'webhook-received',
        priority: JOB_PRIORITY.CRITICAL, // 1
        payload: { source: 'radarr', eventType: 'Download', data: {} },
        status: 'pending',
        retry_count: 0,
        max_retries: 3,
      });

      // Pick jobs - should come out in priority order
      const job1 = await storage.pickNextJob();
      const job2 = await storage.pickNextJob();
      const job3 = await storage.pickNextJob();
      const job4 = await storage.pickNextJob();

      // Verify priority order (CRITICAL → HIGH → NORMAL → LOW)
      expect(job1!.id).toBe(criticalPriorityId);
      expect(job1!.priority).toBe(JOB_PRIORITY.CRITICAL);

      expect(job2!.id).toBe(highPriorityId);
      expect(job2!.priority).toBe(JOB_PRIORITY.HIGH);

      expect(job3!.id).toBe(normalPriorityId);
      expect(job3!.priority).toBe(JOB_PRIORITY.NORMAL);

      expect(job4!.id).toBe(lowPriorityId);
      expect(job4!.priority).toBe(JOB_PRIORITY.LOW);
    });

    it('should use created_at as tiebreaker for same priority', async () => {
      // Add 3 jobs with same priority
      const firstJobId = await storage.addJob({
        type: 'publish',
        priority: JOB_PRIORITY.NORMAL,
        payload: { entityType: 'movie', entityId: 1 },
        status: 'pending',
        retry_count: 0,
        max_retries: 3,
      });

      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));

      const secondJobId = await storage.addJob({
        type: 'publish',
        priority: JOB_PRIORITY.NORMAL,
        payload: { entityType: 'movie', entityId: 2 },
        status: 'pending',
        retry_count: 0,
        max_retries: 3,
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      const thirdJobId = await storage.addJob({
        type: 'publish',
        priority: JOB_PRIORITY.NORMAL,
        payload: { entityType: 'movie', entityId: 3 },
        status: 'pending',
        retry_count: 0,
        max_retries: 3,
      });

      // Pick jobs - should come in creation order
      const job1 = await storage.pickNextJob();
      const job2 = await storage.pickNextJob();
      const job3 = await storage.pickNextJob();

      expect(job1!.id).toBe(firstJobId);
      expect(job2!.id).toBe(secondJobId);
      expect(job3!.id).toBe(thirdJobId);
    });
  });

  describe('Empty Queue Behavior', () => {
    it('should return null when no pending jobs exist', async () => {
      const job = await storage.pickNextJob();
      expect(job).toBeNull();
    });

    it('should return null when all jobs are processing', async () => {
      // Add and immediately pick a job
      await storage.addJob({
        type: 'scan-movie',
        priority: JOB_PRIORITY.NORMAL,
        payload: {
          libraryId: 1,
          directoryPath: '/movies/test',
          manual: false,
        },
        status: 'pending',
        retry_count: 0,
        max_retries: 3,
      });

      const job1 = await storage.pickNextJob();
      expect(job1).not.toBeNull();

      // Try to pick again - should get null
      const job2 = await storage.pickNextJob();
      expect(job2).toBeNull();
    });

    it('should handle rapid consecutive picks on empty queue', async () => {
      // Pick 100 times from empty queue
      const picks: Promise<Job | null>[] = [];
      for (let i = 0; i < 100; i++) {
        picks.push(storage.pickNextJob());
      }

      const results = await Promise.all(picks);

      // All should be null
      expect(results.every(job => job === null)).toBe(true);
    });
  });

  describe('Job Lifecycle', () => {
    it('should complete a job and remove it from queue', async () => {
      const jobId = await storage.addJob({
        type: 'publish',
        priority: JOB_PRIORITY.NORMAL,
        payload: { entityType: 'movie', entityId: 1 },
        status: 'pending',
        retry_count: 0,
        max_retries: 3,
      });

      const pickedJob = await storage.pickNextJob();
      expect(pickedJob!.id).toBe(jobId);

      await storage.completeJob(jobId);

      // Job should no longer exist
      const job = await storage.getJob(jobId);
      expect(job).toBeNull();

      // Should not be in any listing
      const allJobs = await storage.listJobs();
      expect(allJobs).toHaveLength(0);
    });

    it('should fail a job and reset to pending if retries remain', async () => {
      const jobId = await storage.addJob({
        type: 'scan-movie',
        priority: JOB_PRIORITY.NORMAL,
        payload: {
          libraryId: 1,
          directoryPath: '/movies/test',
          manual: false,
        },
        status: 'pending',
        retry_count: 0,
        max_retries: 3,
      });

      const pickedJob = await storage.pickNextJob();
      expect(pickedJob).not.toBeNull();

      await storage.failJob(jobId, 'Test error');

      // Job should be back to pending with incremented retry count
      const job = await storage.getJob(jobId);
      expect(job).not.toBeNull();
      expect(job!.status).toBe('pending');
      expect(job!.retry_count).toBe(1);
      expect(job!.error).toBe('Test error');
      expect(job!.started_at).toBeNull();
    });

    it('should remove job when max retries exceeded', async () => {
      const jobId = await storage.addJob({
        type: 'publish',
        priority: JOB_PRIORITY.NORMAL,
        payload: { entityType: 'movie', entityId: 1 },
        status: 'pending',
        retry_count: 2, // Already failed twice
        max_retries: 3,
      });

      await storage.pickNextJob();
      await storage.failJob(jobId, 'Final failure');

      // Job should be removed
      const job = await storage.getJob(jobId);
      expect(job).toBeNull();
    });

    it('should reset stalled jobs from processing to pending', async () => {
      // Add jobs and mark them as processing manually
      await storage.addJob({
        type: 'scan-movie',
        priority: JOB_PRIORITY.NORMAL,
        payload: {
          libraryId: 1,
          directoryPath: '/movies/test1',
          manual: false,
        },
        status: 'processing', // Simulate stalled job
        retry_count: 0,
        max_retries: 3,
      });

      await storage.addJob({
        type: 'scan-movie',
        priority: JOB_PRIORITY.NORMAL,
        payload: {
          libraryId: 1,
          directoryPath: '/movies/test2',
          manual: false,
        },
        status: 'processing', // Simulate stalled job
        retry_count: 0,
        max_retries: 3,
      });

      const resetCount = await storage.resetStalledJobs();

      expect(resetCount).toBe(2);

      // All jobs should now be pending
      const pendingJobs = await storage.listJobs({ status: 'pending' });
      expect(pendingJobs).toHaveLength(2);

      const processingJobs = await storage.listJobs({ status: 'processing' });
      expect(processingJobs).toHaveLength(0);
    });
  });

  describe('Job Queries', () => {
    it('should get job by ID', async () => {
      const jobId = await storage.addJob({
        type: 'enrich-metadata',
        priority: JOB_PRIORITY.HIGH,
        payload: { entityType: 'movie', entityId: 42 },
        status: 'pending',
        retry_count: 0,
        max_retries: 3,
        manual: true,
      });

      const job = await storage.getJob(jobId);

      expect(job).not.toBeNull();
      expect(job!.id).toBe(jobId);
      expect(job!.type).toBe('enrich-metadata');
      expect(job!.payload.entityId).toBe(42);
      expect(job!.manual).toBe(true);
    });

    it('should list jobs with status filter', async () => {
      await storage.addJob({
        type: 'publish',
        priority: JOB_PRIORITY.NORMAL,
        payload: { entityType: 'movie', entityId: 1 },
        status: 'pending',
        retry_count: 0,
        max_retries: 3,
      });

      await storage.addJob({
        type: 'publish',
        priority: JOB_PRIORITY.NORMAL,
        payload: { entityType: 'movie', entityId: 2 },
        status: 'pending',
        retry_count: 0,
        max_retries: 3,
      });

      // Pick one job
      await storage.pickNextJob();

      const pendingJobs = await storage.listJobs({ status: 'pending' });
      expect(pendingJobs).toHaveLength(1);

      const processingJobs = await storage.listJobs({ status: 'processing' });
      expect(processingJobs).toHaveLength(1);
    });

    it('should list jobs with type filter', async () => {
      await storage.addJob({
        type: 'scan-movie',
        priority: JOB_PRIORITY.NORMAL,
        payload: {
          libraryId: 1,
          directoryPath: '/movies/test',
          manual: false,
        },
        status: 'pending',
        retry_count: 0,
        max_retries: 3,
      });

      await storage.addJob({
        type: 'publish',
        priority: JOB_PRIORITY.NORMAL,
        payload: { entityType: 'movie', entityId: 1 },
        status: 'pending',
        retry_count: 0,
        max_retries: 3,
      });

      const scanJobs = await storage.listJobs({ type: 'scan-movie' });
      expect(scanJobs).toHaveLength(1);
      expect(scanJobs[0].type).toBe('scan-movie');

      const publishJobs = await storage.listJobs({ type: 'publish' });
      expect(publishJobs).toHaveLength(1);
      expect(publishJobs[0].type).toBe('publish');
    });

    it('should list jobs with limit', async () => {
      for (let i = 0; i < 10; i++) {
        await storage.addJob({
          type: 'publish',
          priority: JOB_PRIORITY.NORMAL,
          payload: { entityType: 'movie', entityId: i },
          status: 'pending',
          retry_count: 0,
          max_retries: 3,
        });
      }

      const limitedJobs = await storage.listJobs({ limit: 5 });
      expect(limitedJobs).toHaveLength(5);
    });

    it('should get queue stats', async () => {
      // Add various jobs
      await storage.addJob({
        type: 'publish',
        priority: JOB_PRIORITY.NORMAL,
        payload: { entityType: 'movie', entityId: 1 },
        status: 'pending',
        retry_count: 0,
        max_retries: 3,
      });

      await storage.addJob({
        type: 'publish',
        priority: JOB_PRIORITY.NORMAL,
        payload: { entityType: 'movie', entityId: 2 },
        status: 'pending',
        retry_count: 0,
        max_retries: 3,
      });

      // Pick one
      await storage.pickNextJob();

      const stats = await storage.getStats();

      expect(stats.pending).toBe(1);
      expect(stats.processing).toBe(1);
      expect(stats.totalActive).toBe(2);
      expect(stats.oldestPendingAge).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle completing non-existent job gracefully', async () => {
      await expect(storage.completeJob(99999)).resolves.not.toThrow();
    });

    it('should handle failing non-existent job gracefully', async () => {
      await expect(storage.failJob(99999, 'Test error')).resolves.not.toThrow();
    });

    it('should return null when getting non-existent job', async () => {
      const job = await storage.getJob(99999);
      expect(job).toBeNull();
    });
  });

  describe('Concurrent Stress Test', () => {
    it('should handle mixed concurrent operations without corruption', async () => {
      // Create 20 jobs
      for (let i = 0; i < 20; i++) {
        await storage.addJob({
          type: 'publish',
          priority: JOB_PRIORITY.NORMAL,
          payload: { entityType: 'movie', entityId: i },
          status: 'pending',
          retry_count: 0,
          max_retries: 3,
        });
      }

      // Simulate chaotic concurrent operations:
      // - 30 workers picking jobs
      // - 5 workers adding new jobs
      // - 3 workers querying stats
      const operations: Promise<any>[] = [];

      // 30 pick operations
      for (let i = 0; i < 30; i++) {
        operations.push(storage.pickNextJob());
      }

      // 5 add operations
      for (let i = 0; i < 5; i++) {
        operations.push(
          storage.addJob({
            type: 'enrich-metadata',
            priority: JOB_PRIORITY.HIGH,
            payload: { entityType: 'movie', entityId: 100 + i },
            status: 'pending',
            retry_count: 0,
            max_retries: 3,
          })
        );
      }

      // 3 stats queries
      for (let i = 0; i < 3; i++) {
        operations.push(storage.getStats());
      }

      // Wait for all operations
      const results = await Promise.all(operations);

      // Verify results
      const pickedJobs = results
        .slice(0, 30)
        .filter((job): job is Job => job !== null);

      // Should have picked 20 jobs (all initial jobs)
      expect(pickedJobs.length).toBeLessThanOrEqual(20);

      // All picked jobs should have unique IDs
      const pickedJobIds = pickedJobs.map(job => job.id);
      const uniqueJobIds = new Set(pickedJobIds);
      expect(uniqueJobIds.size).toBe(pickedJobIds.length);

      // Final state: 5 new jobs should be pending
      const finalStats = await storage.getStats();
      expect(finalStats.pending).toBeGreaterThanOrEqual(5);
      expect(finalStats.totalActive).toBeGreaterThanOrEqual(5);
    });
  });
});
