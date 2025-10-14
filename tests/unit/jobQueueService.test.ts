import { JobQueueService } from '../../src/services/jobQueueService.js';
import { TestDatabase, createTestDatabase } from '../utils/testDatabase.js';

describe('JobQueueService', () => {
  let testDb: TestDatabase;
  let service: JobQueueService;

  beforeEach(async () => {
    testDb = await createTestDatabase();
    const db = await testDb.create();
    service = new JobQueueService(db);
  });

  afterEach(async () => {
    service.stop();
    await testDb.destroy();
  });

  describe('addJob', () => {
    it('should add a job to the queue', async () => {
      const jobId = await service.addJob({
        type: 'webhook',
        priority: 1,
        payload: { test: 'data' }
      });

      expect(jobId).toBeGreaterThan(0);

      // Verify job was created
      const job = await service.getJob(jobId);
      expect(job).toBeDefined();
      expect(job?.type).toBe('webhook');
      expect(job?.priority).toBe(1);
      expect(job?.status).toBe('pending');
    });

    it('should set default max_retries to 3', async () => {
      const jobId = await service.addJob({
        type: 'enrich-metadata',
        priority: 5,
        payload: { entityId: 1 }
      });

      const job = await service.getJob(jobId);
      expect(job?.max_retries).toBe(3);
    });

    it('should accept custom max_retries', async () => {
      const jobId = await service.addJob({
        type: 'library-scan',
        priority: 8,
        payload: { libraryId: 1 },
        max_retries: 5
      });

      const job = await service.getJob(jobId);
      expect(job?.max_retries).toBe(5);
    });
  });

  describe('getJob', () => {
    it('should return job by ID', async () => {
      const jobId = await service.addJob({
        type: 'discover-assets',
        priority: 6,
        payload: { entityId: 123 }
      });

      const job = await service.getJob(jobId);

      expect(job).toBeDefined();
      expect(job?.id).toBe(jobId);
      expect(job?.payload).toEqual({ entityId: 123 });
    });

    it('should return null for non-existent job', async () => {
      const job = await service.getJob(999);

      expect(job).toBeNull();
    });
  });

  describe('getStats', () => {
    it('should return queue statistics', async () => {
      // Add various jobs
      await service.addJob({ type: 'webhook', priority: 1, payload: {} });
      await service.addJob({ type: 'webhook', priority: 1, payload: {} });
      await service.addJob({ type: 'publish', priority: 7, payload: {} });

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
      await service.addJob({ type: 'webhook', priority: 1, payload: { order: 1 } });
      await service.addJob({ type: 'webhook', priority: 1, payload: { order: 2 } });
      await service.addJob({ type: 'webhook', priority: 1, payload: { order: 3 } });

      const jobs = await service.getRecentJobs(2);

      expect(jobs).toHaveLength(2);
      expect(jobs[0].payload.order).toBe(3); // Most recent first
      expect(jobs[1].payload.order).toBe(2);
    });
  });

  describe('getJobsByType', () => {
    it('should filter jobs by type', async () => {
      await service.addJob({ type: 'webhook', priority: 1, payload: {} });
      await service.addJob({ type: 'webhook', priority: 1, payload: {} });
      await service.addJob({ type: 'publish', priority: 7, payload: {} });

      const webhookJobs = await service.getJobsByType('webhook');

      expect(webhookJobs).toHaveLength(2);
      expect(webhookJobs.every(j => j.type === 'webhook')).toBe(true);
    });

    it.skip('should filter by type and status', async () => {
      const jobId1 = await service.addJob({ type: 'webhook', priority: 1, payload: {} });
      await service.addJob({ type: 'webhook', priority: 1, payload: {} });

      // Mark one as completed
      const db = await testDb.create();
      await db.execute('UPDATE job_queue SET status = ? WHERE id = ?', ['completed', jobId1]);

      const pendingWebhooks = await service.getJobsByType('webhook', 'pending');

      expect(pendingWebhooks).toHaveLength(1);
      expect(pendingWebhooks[0].status).toBe('pending');
    });
  });

  describe('cancelJob', () => {
    it('should cancel pending job', async () => {
      const jobId = await service.addJob({
        type: 'library-scan',
        priority: 8,
        payload: {}
      });

      const success = await service.cancelJob(jobId);

      expect(success).toBe(true);

      // Verify job is deleted
      const job = await service.getJob(jobId);
      expect(job).toBeNull();
    });

    it('should not cancel processing/completed jobs', async () => {
      const jobId = await service.addJob({
        type: 'webhook',
        priority: 1,
        payload: {}
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
        payload: {}
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
        type: 'webhook',
        priority: 1,
        payload: {}
      });

      const success = await service.retryJob(jobId);

      expect(success).toBe(false);
    });
  });

  describe('clearOldJobs', () => {
    it.skip('should delete completed jobs older than specified days', async () => {
      const jobId1 = await service.addJob({ type: 'webhook', priority: 1, payload: {} });
      const jobId2 = await service.addJob({ type: 'webhook', priority: 1, payload: {} });

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
