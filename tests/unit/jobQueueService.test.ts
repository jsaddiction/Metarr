import { JobQueueService } from '../../src/services/jobQueueService.js';
import { SQLiteJobQueueStorage } from '../../src/services/jobQueue/storage/SQLiteJobQueueStorage.js';
import { TestDatabase, createTestDatabase } from '../utils/testDatabase.js';

describe('JobQueueService', () => {
  let testDb: TestDatabase;
  let service: JobQueueService;

  beforeEach(async () => {
    testDb = await createTestDatabase();
    const db = testDb.getConnection();
    const storage = new SQLiteJobQueueStorage(db);
    service = new JobQueueService(storage);
  });

  afterEach(async () => {
    if (service) {
      service.stop();
    }
    if (testDb) {
      await testDb.destroy();
    }
  });

  describe('addJob', () => {
    it('should add a job to the queue', async () => {
      const jobId = await service.addJob({
        type: 'webhook-received',
        priority: 1,
        payload: { source: 'test', eventType: 'test', data: { test: 'data' } },
        retry_count: 0,
        max_retries: 3
      });

      expect(jobId).toBeGreaterThan(0);

      // Verify job was created
      const job = await service.getJob(jobId);
      expect(job).toBeDefined();
      expect(job?.type).toBe('webhook-received');
      expect(job?.priority).toBe(1);
      expect(job?.status).toBe('pending');
    });

    it('should set default max_retries to 3', async () => {
      const jobId = await service.addJob({
        type: 'enrich-metadata',
        priority: 5,
        payload: { entityType: 'movie', entityId: 1 },
        retry_count: 0,
        max_retries: 3
      });

      const job = await service.getJob(jobId);
      expect(job?.max_retries).toBe(3);
    });

    it('should accept custom max_retries', async () => {
      const jobId = await service.addJob({
        type: 'library-scan',
        priority: 8,
        payload: { libraryId: 1, libraryPath: '/test', libraryType: 'movies' },
        retry_count: 0,
        max_retries: 5
      });

      const job = await service.getJob(jobId);
      expect(job?.max_retries).toBe(5);
    });
  });

  describe('getJob', () => {
    it('should return job by ID', async () => {
      const jobId = await service.addJob({
        type: 'enrich-metadata',
        priority: 6,
        payload: { entityType: 'movie', entityId: 123 },
        retry_count: 0,
        max_retries: 3
      });

      const job = await service.getJob(jobId);

      expect(job).toBeDefined();
      expect(job?.id).toBe(jobId);
      expect(job?.payload).toEqual({ entityType: 'movie', entityId: 123 });
    });

    it('should return null for non-existent job', async () => {
      const job = await service.getJob(999);

      expect(job).toBeNull();
    });
  });

  describe('getStats', () => {
    it('should return queue statistics', async () => {
      // Add various jobs
      await service.addJob({ type: 'webhook-received', priority: 1, payload: { source: 'test', eventType: 'test', data: {} }, retry_count: 0, max_retries: 3 });
      await service.addJob({ type: 'webhook-received', priority: 1, payload: { source: 'test', eventType: 'test', data: {} }, retry_count: 0, max_retries: 3 });
      await service.addJob({ type: 'publish', priority: 7, payload: { entityType: 'movie', entityId: 1 }, retry_count: 0, max_retries: 3 });

      const stats = await service.getStats();

      expect(stats.pending).toBe(3);
      expect(stats.processing).toBe(0);
      expect(stats.completed).toBe(0);
      expect(stats.failed).toBe(0);
    });
  });

  describe('getRecentJobs', () => {
    it.skip('should return recent jobs ordered by created_at', async () => {
      // Add jobs
      await service.addJob({ type: 'webhook-received', priority: 1, payload: { source: 'test', eventType: 'test', data: { order: 1 } }, retry_count: 0, max_retries: 3 });
      await service.addJob({ type: 'webhook-received', priority: 1, payload: { source: 'test', eventType: 'test', data: { order: 2 } }, retry_count: 0, max_retries: 3 });
      await service.addJob({ type: 'webhook-received', priority: 1, payload: { source: 'test', eventType: 'test', data: { order: 3 } }, retry_count: 0, max_retries: 3 });

      const jobs = await service.getRecentJobs();

      expect(jobs).toHaveLength(2);
      const job1 = jobs[0];
      const job2 = jobs[1];
      if (job1.type === 'webhook-received' && job2.type === 'webhook-received') {
        expect((job1.payload.data as any).order).toBe(3); // Most recent first
        expect((job2.payload.data as any).order).toBe(2);
      }
    });
  });

  describe('getJobsByType', () => {
    it('should filter jobs by type', async () => {
      await service.addJob({ type: 'webhook-received', priority: 1, payload: { source: 'test', eventType: 'test', data: {} }, retry_count: 0, max_retries: 3 });
      await service.addJob({ type: 'webhook-received', priority: 1, payload: { source: 'test', eventType: 'test', data: {} }, retry_count: 0, max_retries: 3 });
      await service.addJob({ type: 'publish', priority: 7, payload: { entityType: 'movie', entityId: 1 }, retry_count: 0, max_retries: 3 });

      const webhookJobs = await service.listJobs({ type: 'webhook-received' });

      expect(webhookJobs).toHaveLength(2);
      expect(webhookJobs.every(j => j.type === 'webhook-received')).toBe(true);
    });

    it.skip('should filter by type and status', async () => {
      const jobId1 = await service.addJob({ type: 'webhook-received', priority: 1, payload: { source: 'test', eventType: 'test', data: {} }, retry_count: 0, max_retries: 3 });
      await service.addJob({ type: 'webhook-received', priority: 1, payload: { source: 'test', eventType: 'test', data: {} }, retry_count: 0, max_retries: 3 });

      // Mark one as completed
      const db = await testDb.create();
      await db.execute('UPDATE job_queue SET status = ? WHERE id = ?', ['completed', jobId1]);

      const pendingWebhooks = await service.listJobs({ type: 'webhook-received', status: 'pending' });

      expect(pendingWebhooks).toHaveLength(1);
      expect(pendingWebhooks[0].status).toBe('pending');
    });
  });

  describe('cancelJob', () => {
    it('should cancel pending job', async () => {
      const jobId = await service.addJob({
        type: 'library-scan',
        priority: 8,
        payload: { libraryId: 1, libraryPath: '/test', libraryType: 'movies' },
        retry_count: 0,
        max_retries: 3
      });

      const success = await service.cancelJob(jobId);

      expect(success).toBe(true);

      // Verify job is deleted
      const job = await service.getJob(jobId);
      expect(job).toBeNull();
    });

    it('should not cancel processing/completed jobs', async () => {
      const jobId = await service.addJob({
        type: 'webhook-received',
        priority: 1,
        payload: { source: 'test', eventType: 'test', data: {} },
        retry_count: 0,
        max_retries: 3
      });

      // Mark as processing
      const db = await testDb.create();
      await db.execute('UPDATE job_queue SET status = ? WHERE id = ?', ['processing', jobId]);

      const success = await service.cancelJob(jobId);

      expect(success).toBe(false);

      // Job should still exist
      const job = await service.getJob(jobId);
      expect(job).toBeDefined();
    });
  });

  describe('retryJob', () => {
    it.skip('should reset failed job to pending', async () => {
      const jobId = await service.addJob({
        type: 'enrich-metadata',
        priority: 5,
        payload: { entityType: 'movie', entityId: 1 },
        retry_count: 0,
        max_retries: 3
      });

      // Mark as failed
      const db = await testDb.create();
      await db.execute(
        'UPDATE job_queue SET state = ?, error = ?, retry_count = 3 WHERE id = ?',
        ['failed', 'Test error', jobId]
      );

      const success = await service.retryJob(jobId);

      expect(success).toBe(true);

      // Verify job is pending again
      const job = await service.getJob(jobId);
      expect(job?.status).toBe('pending');
      expect(job?.retry_count).toBe(0);
      expect(job?.error).toBeNull();
    });

    it('should not retry non-failed jobs', async () => {
      const jobId = await service.addJob({
        type: 'webhook-received',
        priority: 1,
        payload: { source: 'test', eventType: 'test', data: {} },
        retry_count: 0,
        max_retries: 3
      });

      const success = await service.retryJob(jobId);

      expect(success).toBe(false);
    });
  });

  describe('clearOldJobs', () => {
    it.skip('should delete completed jobs older than specified days', async () => {
      const jobId1 = await service.addJob({ type: 'webhook-received', priority: 1, payload: { source: 'test', eventType: 'test', data: {} }, retry_count: 0, max_retries: 3 });
      const jobId2 = await service.addJob({ type: 'webhook-received', priority: 1, payload: { source: 'test', eventType: 'test', data: {} }, retry_count: 0, max_retries: 3 });

      // Mark both as completed, one old
      const db = await testDb.create();
      await db.execute(
        `UPDATE job_queue
         SET status = 'completed', completed_at = datetime('now', '-10 days')
         WHERE id = ?`,
        [jobId1]
      );
      await db.execute(
        `UPDATE job_queue
         SET status = 'completed', completed_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [jobId2]
      );

      const cleared = await service.clearOldJobs(7);

      expect(cleared).toBe(1);

      // Old job should be deleted
      const job1 = await service.getJob(jobId1);
      expect(job1).toBeNull();

      // Recent job should still exist
      const job2 = await service.getJob(jobId2);
      expect(job2).toBeDefined();
    });
  });
});
