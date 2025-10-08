import request from 'supertest';
import express, { Express } from 'express';
import { TestDatabase, createTestDatabase } from '../utils/testDatabase.js';
import { AssetController } from '../../src/controllers/assetController.js';
import { AssetSelectionService } from '../../src/services/assetSelectionService.js';

describe('Asset API Endpoints', () => {
  let app: Express;
  let testDb: TestDatabase;
  let service: AssetSelectionService;

  beforeEach(async () => {
    // Setup test database
    testDb = await createTestDatabase();
    const db = await testDb.create();
    service = new AssetSelectionService(db);

    // Setup Express app with routes
    app = express();
    app.use(express.json());

    const assetController = new AssetController(db);

    // Register routes (simplified for testing)
    app.get('/api/assets/candidates/:entityType/:entityId',
      (req, res) => assetController.getCandidates(req, res));
    app.post('/api/assets/select/manual',
      (req, res) => assetController.selectManual(req, res));
    app.post('/api/assets/reject',
      (req, res) => assetController.rejectAsset(req, res));
    app.delete('/api/assets/unlock/:entityType/:entityId/:assetType',
      (req, res) => assetController.unlockAssetType(req, res));
    app.get('/api/assets/selected/:entityType/:entityId',
      (req, res) => assetController.getSelected(req, res));

    // Seed test data
    await testDb.seed({
      movies: [
        { title: 'Test Movie', year: 2023, tmdb_id: 550 }
      ],
      assetCandidates: [
        { entity_type: 'movie', entity_id: 1, asset_type: 'poster', provider: 'tmdb', provider_url: 'http://image1.jpg' },
        { entity_type: 'movie', entity_id: 1, asset_type: 'poster', provider: 'tmdb', provider_url: 'http://image2.jpg' },
        { entity_type: 'movie', entity_id: 1, asset_type: 'fanart', provider: 'tmdb', provider_url: 'http://fanart1.jpg' }
      ]
    });
  });

  afterEach(async () => {
    await testDb.destroy();
  });

  describe('GET /api/assets/candidates/:entityType/:entityId', () => {
    it('should return asset candidates', async () => {
      const response = await request(app)
        .get('/api/assets/candidates/movie/1')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0]).toHaveProperty('asset_type');
      expect(response.body[0]).toHaveProperty('provider');
    });

    it('should filter by asset type via query param', async () => {
      const response = await request(app)
        .get('/api/assets/candidates/movie/1')
        .query({ assetType: 'poster' })
        .expect(200);

      expect(response.body).toHaveLength(2);
      expect(response.body.every((c: any) => c.asset_type === 'poster')).toBe(true);
    });

    it('should return 404 for invalid entity type', async () => {
      await request(app)
        .get('/api/assets/candidates/invalid/1')
        .expect(404);
    });

    it('should return empty array for non-existent entity', async () => {
      const response = await request(app)
        .get('/api/assets/candidates/movie/999')
        .expect(200);

      expect(response.body).toHaveLength(0);
    });
  });

  describe('POST /api/assets/select', () => {
    it('should select an asset', async () => {
      const response = await request(app)
        .post('/api/assets/select')
        .send({
          candidateId: 1,
          userId: 'test-user'
        })
        .expect(200);

      expect(response.body.selected).toBe(true);
      expect(response.body.candidateId).toBe(1);
    });

    it('should return 400 for missing candidateId', async () => {
      await request(app)
        .post('/api/assets/select')
        .send({ userId: 'test-user' })
        .expect(400);
    });

    it('should return 400 for missing userId', async () => {
      await request(app)
        .post('/api/assets/select')
        .send({ candidateId: 1 })
        .expect(400);
    });

    it('should return error for non-existent candidate', async () => {
      const response = await request(app)
        .post('/api/assets/select')
        .send({
          candidateId: 999,
          userId: 'test-user'
        })
        .expect(200);

      expect(response.body.selected).toBe(false);
      expect(response.body.reason).toBeDefined();
    });
  });

  describe('POST /api/assets/reject', () => {
    it('should reject an asset', async () => {
      const response = await request(app)
        .post('/api/assets/reject')
        .send({
          candidateId: 1,
          userId: 'test-user',
          reason: 'Low quality'
        })
        .expect(200);

      expect(response.body.rejected).toBe(true);
    });

    it('should return 400 for missing candidateId', async () => {
      await request(app)
        .post('/api/assets/reject')
        .send({
          userId: 'test-user',
          reason: 'Test'
        })
        .expect(400);
    });

    it('should allow optional reason', async () => {
      const response = await request(app)
        .post('/api/assets/reject')
        .send({
          candidateId: 2,
          userId: 'test-user'
        })
        .expect(200);

      expect(response.body.rejected).toBe(true);
    });
  });

  describe('DELETE /api/assets/unlock/:entityType/:entityId/:assetType', () => {
    it('should unlock asset type', async () => {
      // First select an asset to lock it
      await service.selectAssetManually(1, 'test-user');

      const response = await request(app)
        .delete('/api/assets/unlock/movie/1/poster')
        .expect(200);

      expect(response.body.unlocked).toBe(true);
      expect(response.body.assetType).toBe('poster');
    });

    it('should return 404 for invalid entity type', async () => {
      await request(app)
        .delete('/api/assets/unlock/invalid/1/poster')
        .expect(404);
    });

    it('should handle unlocking already unlocked type', async () => {
      const response = await request(app)
        .delete('/api/assets/unlock/movie/1/poster')
        .expect(200);

      expect(response.body.unlocked).toBe(true);
    });
  });

  describe('GET /api/assets/selected/:entityType/:entityId', () => {
    it('should return selected assets', async () => {
      // Select an asset first
      await service.selectAssetManually(1, 'test-user');

      const response = await request(app)
        .get('/api/assets/selected/movie/1')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0].is_selected).toBe(1);
    });

    it('should return empty array when no selections', async () => {
      const response = await request(app)
        .get('/api/assets/selected/movie/1')
        .expect(200);

      expect(response.body).toHaveLength(0);
    });

    it('should return 404 for invalid entity type', async () => {
      await request(app)
        .get('/api/assets/selected/invalid/1')
        .expect(404);
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON', async () => {
      await request(app)
        .post('/api/assets/select')
        .set('Content-Type', 'application/json')
        .send('invalid json')
        .expect(400);
    });

    it('should handle invalid entity ID', async () => {
      await request(app)
        .get('/api/assets/candidates/movie/abc')
        .expect(400);
    });
  });

  describe('CORS and Headers', () => {
    it('should accept JSON content type', async () => {
      const response = await request(app)
        .post('/api/assets/select')
        .set('Content-Type', 'application/json')
        .send({
          candidateId: 1,
          userId: 'test-user'
        });

      expect(response.status).not.toBe(415); // Not unsupported media type
    });
  });
});
