import request from 'supertest';
import express, { Express } from 'express';
import { TestDatabase, createTestDatabase } from '../utils/testDatabase.js';
import { JobController } from '../../src/controllers/jobController.js';
import { JobQueueService } from '../../src/services/jobQueueService.js';

describe('Job API Endpoints', () => {
  let app: Express;
  let testDb: TestDatabase;
  let jobQueue: JobQueueService;

  beforeEach(async () => {
    // Setup test database
    testDb = await createTestDatabase();
    const db = await testDb.create();
    jobQueue = new JobQueueService(db);

    // Setup Express app with routes
    app = express();
    app.use(express.json());

    const jobController = new JobController(jobQueue);

    // Register routes
    app.get('/api/jobs/stats', (req, res) => jobController.getStats(req, res));
    app.get('/api/jobs/recent', (req, res) => jobController.getRecent(req, res));
    app.get('/api/jobs/:id', (req, res) => jobController.getJob(req, res));
    app.post('/api/jobs/:id/cancel', (req, res) => jobController.cancel(req, res));
    app.post('/api/jobs/:id/retry', (req, res) => jobController.retry(req, res));
    app.delete('/api/jobs/old', (req, res) => jobController.clearOld(req, res));
    app.get('/api/jobs/type/:type', (req, res) => jobController.getByType(req, res));

    // Seed jobs
    await jobQueue.addJob({
      type: 'webhook',
      priority: 1,
      payload: { test: 'data1' }
    });

    await jobQueue.addJob({
      type: 'enrich-metadata',
      priority: 5,
      payload: { test: 'data2' }
    });
  });

  afterEach(async () => {
    jobQueue.stop();
    await testDb.destroy();
  });

  describe('GET /api/jobs/stats', () => {
    it('should return queue statistics', async () => {
      const response = await request(app)
        .get('/api/jobs/stats')
        .expect(200);

      expect(response.body).toHaveProperty('pending');
      expect(response.body).toHaveProperty('processing');
      expect(response.body).toHaveProperty('completed');
      expect(response.body).toHaveProperty('failed');
      expect(response.body.pending).toBeGreaterThanOrEqual(0);
    });

    it('should return valid numbers for all stats', async () => {
      const response = await request(app)
        .get('/api/jobs/stats')
        .expect(200);

      expect(typeof response.body.pending).toBe('number');
      expect(typeof response.body.processing).toBe('number');
      expect(typeof response.body.completed).toBe('number');
      expect(typeof response.body.failed).toBe('number');
    });
  });

  describe('GET /api/jobs/recent', () => {
    it('should return recent jobs', async () => {
      const response = await request(app)
        .get('/api/jobs/recent')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0]).toHaveProperty('id');
      expect(response.body[0]).toHaveProperty('type');
      expect(response.body[0]).toHaveProperty('state');
    });

    it('should support limit parameter', async () => {
      const response = await request(app)
        .get('/api/jobs/recent')
        .query({ limit: 1 })
        .expect(200);

      expect(response.body.length).toBeLessThanOrEqual(1);
    });

    it('should default to reasonable limit', async () => {
      const response = await request(app)
        .get('/api/jobs/recent')
        .expect(200);

      expect(response.body.length).toBeLessThanOrEqual(50); // Default limit
    });
  });

  describe('GET /api/jobs/:id', () => {
    it('should return specific job', async () => {
      const response = await request(app)
        .get('/api/jobs/1')
        .expect(200);

      expect(response.body.id).toBe(1);
      expect(response.body.type).toBe('webhook');
      expect(response.body.priority).toBe(1);
    });

    it('should return 404 for non-existent job', async () => {
      await request(app)
        .get('/api/jobs/999')
        .expect(404);
    });

    it('should return 400 for invalid job ID', async () => {
      await request(app)
        .get('/api/jobs/abc')
        .expect(400);
    });
  });

  describe('POST /api/jobs/:id/cancel', () => {
    it('should cancel pending job', async () => {
      const response = await request(app)
        .post('/api/jobs/1/cancel')
        .expect(200);

      expect(response.body.cancelled).toBe(true);
    });

    it('should return 404 for non-existent job', async () => {
      await request(app)
        .post('/api/jobs/999/cancel')
        .expect(404);
    });

    it('should return 400 for invalid job ID', async () => {
      await request(app)
        .post('/api/jobs/abc/cancel')
        .expect(400);
    });
  });

  describe('POST /api/jobs/:id/retry', () => {
    it('should handle retry request', async () => {
      // Mark job as failed first
      const db = (jobQueue as any).db;
      await db.execute(
        `UPDATE job_queue SET state = 'failed', error = 'Test error' WHERE id = 1`
      );

      const response = await request(app)
        .post('/api/jobs/1/retry')
        .expect(200);

      expect(response.body).toHaveProperty('retried');
    });

    it('should return 404 for non-existent job', async () => {
      await request(app)
        .post('/api/jobs/999/retry')
        .expect(404);
    });

    it('should return error for non-failed jobs', async () => {
      const response = await request(app)
        .post('/api/jobs/2/retry') // Job 2 is pending
        .expect(200);

      expect(response.body.retried).toBe(false);
    });
  });

  describe('DELETE /api/jobs/old', () => {
    it('should clear old completed jobs', async () => {
      const response = await request(app)
        .delete('/api/jobs/old')
        .query({ days: 7 })
        .expect(200);

      expect(response.body).toHaveProperty('deleted');
      expect(typeof response.body.deleted).toBe('number');
    });

    it('should use default days if not specified', async () => {
      const response = await request(app)
        .delete('/api/jobs/old')
        .expect(200);

      expect(response.body).toHaveProperty('deleted');
    });

    it('should validate days parameter', async () => {
      await request(app)
        .delete('/api/jobs/old')
        .query({ days: -1 })
        .expect(400);
    });
  });

  describe('GET /api/jobs/type/:type', () => {
    it('should filter jobs by type', async () => {
      const response = await request(app)
        .get('/api/jobs/type/webhook')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      if (response.body.length > 0) {
        expect(response.body.every((j: any) => j.type === 'webhook')).toBe(true);
      }
    });

    it('should return empty array for unused type', async () => {
      const response = await request(app)
        .get('/api/jobs/type/unknown-type')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should support state filter', async () => {
      const response = await request(app)
        .get('/api/jobs/type/webhook')
        .query({ state: 'pending' })
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      if (response.body.length > 0) {
        expect(response.body.every((j: any) => j.state === 'pending')).toBe(true);
      }
    });

    it('should support limit parameter', async () => {
      const response = await request(app)
        .get('/api/jobs/type/webhook')
        .query({ limit: 5 })
        .expect(200);

      expect(response.body.length).toBeLessThanOrEqual(5);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // Stop the database to simulate error
      await testDb.destroy();

      await request(app)
        .get('/api/jobs/stats')
        .expect(500);
    });

    it('should validate request parameters', async () => {
      await request(app)
        .post('/api/jobs/invalid/cancel')
        .expect(400);
    });
  });

  describe('Response Format', () => {
    it('should return JSON content type', async () => {
      const response = await request(app)
        .get('/api/jobs/stats');

      expect(response.headers['content-type']).toMatch(/json/);
    });

    it('should include proper status codes', async () => {
      await request(app)
        .get('/api/jobs/1')
        .expect(200);

      await request(app)
        .get('/api/jobs/999')
        .expect(404);
    });
  });

  describe('Job Payload', () => {
    it('should return parsed payload objects', async () => {
      const response = await request(app)
        .get('/api/jobs/1')
        .expect(200);

      expect(typeof response.body.payload).toBe('object');
      expect(response.body.payload).toHaveProperty('test');
    });

    it('should handle complex payloads', async () => {
      const complexPayload = {
        nested: {
          data: {
            array: [1, 2, 3],
            string: 'test'
          }
        }
      };

      const jobId = await jobQueue.addJob({
        type: 'publish',
        priority: 7,
        payload: complexPayload
      });

      const response = await request(app)
        .get(`/api/jobs/${jobId}`)
        .expect(200);

      expect(response.body.payload).toEqual(complexPayload);
    });
  });
});
