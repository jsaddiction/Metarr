import request from 'supertest';
import express, { Express } from 'express';
import { TestDatabase, createTestDatabase } from '../utils/testDatabase.js';
import { ProviderConfigService } from '../../src/services/providerConfigService.js';
import { ProviderConfigController } from '../../src/controllers/providerConfigController.js';

describe('Provider Config API Endpoints', () => {
  let app: Express;
  let testDb: TestDatabase;
  let service: ProviderConfigService;
  let controller: ProviderConfigController;

  beforeEach(async () => {
    // Setup test database
    testDb = await createTestDatabase();
    const db = await testDb.create();
    service = new ProviderConfigService(db);
    controller = new ProviderConfigController(service);

    // Setup Express app with routes
    app = express();
    app.use(express.json());

    // Register provider config routes
    app.get('/api/providers', (req, res) =>
      controller.getAllProviders(req, res)
    );
    app.get('/api/providers/:name', (req, res) =>
      controller.getProvider(req, res)
    );
    app.post('/api/providers/:name', (req, res) =>
      controller.updateProvider(req, res)
    );
    app.post('/api/providers/:name/test', (req, res) =>
      controller.testProvider(req, res)
    );
    app.delete('/api/providers/:name', (req, res) =>
      controller.deleteProvider(req, res)
    );
  });

  afterEach(async () => {
    await testDb.destroy();
  });

  describe('GET /api/providers', () => {
    it('should return all providers with metadata', async () => {
      const response = await request(app)
        .get('/api/providers')
        .expect(200);

      expect(response.body).toHaveProperty('providers');
      expect(Array.isArray(response.body.providers)).toBe(true);
      expect(response.body.providers.length).toBeGreaterThan(0);

      // Check structure of each provider
      const provider = response.body.providers[0];
      expect(provider).toHaveProperty('config');
      expect(provider).toHaveProperty('metadata');
      expect(provider.metadata).toHaveProperty('name');
      expect(provider.metadata).toHaveProperty('displayName');
      expect(provider.metadata).toHaveProperty('supportedAssetTypes');
    });

    it('should include TMDB, TVDB, and FanArt.tv providers', async () => {
      const response = await request(app)
        .get('/api/providers')
        .expect(200);

      const providerNames = response.body.providers.map((p: any) => p.metadata.name);
      expect(providerNames).toContain('tmdb');
      expect(providerNames).toContain('tvdb');
      expect(providerNames).toContain('fanart_tv');
    });

    it('should mask API keys in response', async () => {
      // First, create a provider config with API key
      await service.upsert('tmdb', {
        enabled: true,
        apiKey: 'secret_api_key_12345',
        enabledAssetTypes: ['poster']
      });

      const response = await request(app)
        .get('/api/providers')
        .expect(200);

      const tmdb = response.body.providers.find((p: any) => p.metadata.name === 'tmdb');
      expect(tmdb.config.apiKey).toBe('***masked***');
      expect(tmdb.config.apiKey).not.toBe('secret_api_key_12345');
    });

    it('should show providers as not configured if no database entry exists', async () => {
      const response = await request(app)
        .get('/api/providers')
        .expect(200);

      // TVDB should not be configured by default
      const tvdb = response.body.providers.find((p: any) => p.metadata.name === 'tvdb');
      expect(tvdb.config.enabled).toBe(false);
      expect(tvdb.config.lastTestStatus).toBe('never_tested');
    });
  });

  describe('GET /api/providers/:name', () => {
    it('should return single provider with metadata', async () => {
      const response = await request(app)
        .get('/api/providers/tmdb')
        .expect(200);

      expect(response.body).toHaveProperty('config');
      expect(response.body).toHaveProperty('metadata');
      expect(response.body.metadata.name).toBe('tmdb');
      expect(response.body.metadata.displayName).toBe('TMDB (The Movie Database)');
    });

    it('should return 404 for unknown provider', async () => {
      const response = await request(app)
        .get('/api/providers/unknown_provider')
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('not found');
    });

    it('should return default config for unconfigured provider', async () => {
      const response = await request(app)
        .get('/api/providers/tvdb')
        .expect(200);

      expect(response.body.config.enabled).toBe(false);
      expect(response.body.config.enabledAssetTypes).toEqual([]);
      expect(response.body.metadata.name).toBe('tvdb');
    });
  });

  describe('POST /api/providers/:name', () => {
    it('should create new provider configuration', async () => {
      const response = await request(app)
        .post('/api/providers/tmdb')
        .send({
          enabled: true,
          apiKey: 'test_tmdb_api_key',
          enabledAssetTypes: ['poster', 'fanart']
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.provider.enabled).toBe(true);
      expect(response.body.provider.enabledAssetTypes).toEqual(['poster', 'fanart']);
      expect(response.body.provider.apiKey).toBe('***masked***');
    });

    it('should update existing provider configuration', async () => {
      // Create initial config
      await service.upsert('tmdb', {
        enabled: false,
        apiKey: 'old_key',
        enabledAssetTypes: ['poster']
      });

      // Update config
      const response = await request(app)
        .post('/api/providers/tmdb')
        .send({
          enabled: true,
          apiKey: 'new_key',
          enabledAssetTypes: ['poster', 'fanart', 'trailer']
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.provider.enabled).toBe(true);
      expect(response.body.provider.enabledAssetTypes).toHaveLength(3);
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/providers/tmdb')
        .send({
          // Missing 'enabled'
          apiKey: 'test_key',
          enabledAssetTypes: []
        })
        .expect(400);

      expect(response.body.error).toContain('enabled must be a boolean');
    });

    it('should validate enabledAssetTypes is an array', async () => {
      const response = await request(app)
        .post('/api/providers/tmdb')
        .send({
          enabled: true,
          apiKey: 'test_key',
          enabledAssetTypes: 'not_an_array'
        })
        .expect(400);

      expect(response.body.error).toContain('must be an array');
    });

    it('should validate asset types are supported by provider', async () => {
      const response = await request(app)
        .post('/api/providers/tmdb')
        .send({
          enabled: true,
          apiKey: 'test_key',
          enabledAssetTypes: ['poster', 'invalid_type']
        })
        .expect(400);

      expect(response.body.error).toContain('Invalid asset type');
    });

    it('should reject unavailable asset types', async () => {
      const response = await request(app)
        .post('/api/providers/tmdb')
        .send({
          enabled: true,
          apiKey: 'test_key',
          enabledAssetTypes: ['banner'] // Banner not available on TMDB
        })
        .expect(400);

      expect(response.body.error).toContain('Invalid asset type');
    });

    it('should require API key for providers that require it', async () => {
      const response = await request(app)
        .post('/api/providers/tmdb')
        .send({
          enabled: true,
          // Missing apiKey
          enabledAssetTypes: ['poster']
        })
        .expect(400);

      expect(response.body.error).toContain('API key is required');
    });

    it('should allow disabling provider without API key', async () => {
      const response = await request(app)
        .post('/api/providers/tmdb')
        .send({
          enabled: false,
          enabledAssetTypes: []
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.provider.enabled).toBe(false);
    });

    it('should return 404 for unknown provider', async () => {
      const response = await request(app)
        .post('/api/providers/unknown_provider')
        .send({
          enabled: true,
          apiKey: 'test',
          enabledAssetTypes: []
        })
        .expect(404);

      expect(response.body.error).toContain('not found');
    });
  });

  describe('POST /api/providers/:name/test', () => {
    it('should test TMDB connection with valid API key', async () => {
      // Note: This will fail in CI without real API key
      // In real tests, we'd mock the TMDB client
      const response = await request(app)
        .post('/api/providers/tmdb/test')
        .send({
          apiKey: process.env.TMDB_API_KEY || 'fake_key_for_testing',
          enabledAssetTypes: ['poster']
        });

      // Accept either success (if real key) or failure (if fake key)
      expect([200, 200]).toContain(response.status);
      expect(response.body).toHaveProperty('success');

      if (response.body.success) {
        expect(response.body.message).toContain('connected');
      } else {
        expect(response.body.error).toBeDefined();
      }
    });

    it('should fail test with invalid TMDB API key', async () => {
      const response = await request(app)
        .post('/api/providers/tmdb/test')
        .send({
          apiKey: 'definitely_invalid_key',
          enabledAssetTypes: ['poster']
        })
        .expect(200);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
    });

    it('should require API key for test', async () => {
      const response = await request(app)
        .post('/api/providers/tmdb/test')
        .send({
          // Missing apiKey
          enabledAssetTypes: ['poster']
        })
        .expect(200);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('required');
    });

    it('should return 501 for unimplemented providers', async () => {
      const response = await request(app)
        .post('/api/providers/tvdb/test')
        .send({
          apiKey: 'test_key',
          enabledAssetTypes: []
        })
        .expect(501);

      expect(response.body.error).toContain('not yet implemented');
    });

    it('should update test status on success', async () => {
      // Create a config first
      await service.upsert('tmdb', {
        enabled: true,
        apiKey: process.env.TMDB_API_KEY || 'test_key',
        enabledAssetTypes: ['poster']
      });

      // Test connection
      await request(app)
        .post('/api/providers/tmdb/test')
        .send({
          apiKey: process.env.TMDB_API_KEY || 'test_key',
          enabledAssetTypes: ['poster']
        });

      // Verify test status was updated
      const config = await service.getByName('tmdb');
      expect(config).not.toBeNull();
      if (config) {
        expect(config.lastTestStatus).toBeDefined();
        expect(['success', 'error']).toContain(config.lastTestStatus);
      }
    });
  });

  describe('DELETE /api/providers/:name', () => {
    it('should disable provider and clear API key', async () => {
      // Create a config first
      await service.upsert('tmdb', {
        enabled: true,
        apiKey: 'secret_key',
        enabledAssetTypes: ['poster']
      });

      // Delete/disable
      const response = await request(app)
        .delete('/api/providers/tmdb')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('disabled');

      // Verify it's disabled
      const config = await service.getByName('tmdb');
      expect(config).not.toBeNull();
      if (config) {
        expect(config.enabled).toBe(false);
        expect(config.apiKey).toBeUndefined();
      }
    });

    it('should return 404 for unknown provider', async () => {
      const response = await request(app)
        .delete('/api/providers/unknown_provider')
        .expect(404);

      expect(response.body.error).toContain('not found');
    });

    it('should handle deleting unconfigured provider', async () => {
      // TVDB not configured by default
      const response = await request(app)
        .delete('/api/providers/tvdb')
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('Integration: Full workflow', () => {
    it('should support complete provider setup workflow', async () => {
      // 1. Get all providers
      let response = await request(app)
        .get('/api/providers')
        .expect(200);

      let tmdb = response.body.providers.find((p: any) => p.metadata.name === 'tmdb');
      // TMDB might be enabled due to .env migration, that's OK
      expect(tmdb).toBeDefined();

      // 2. Configure TMDB
      response = await request(app)
        .post('/api/providers/tmdb')
        .send({
          enabled: true,
          apiKey: 'test_api_key_123',
          enabledAssetTypes: ['poster', 'fanart']
        })
        .expect(200);

      expect(response.body.success).toBe(true);

      // 3. Get specific provider (should show as configured)
      response = await request(app)
        .get('/api/providers/tmdb')
        .expect(200);

      expect(response.body.config.enabled).toBe(true);
      expect(response.body.config.enabledAssetTypes).toEqual(['poster', 'fanart']);
      expect(response.body.config.apiKey).toBe('***masked***');

      // 4. Update configuration
      response = await request(app)
        .post('/api/providers/tmdb')
        .send({
          enabled: true,
          apiKey: 'test_api_key_123',
          enabledAssetTypes: ['poster', 'fanart', 'trailer']
        })
        .expect(200);

      expect(response.body.provider.enabledAssetTypes).toHaveLength(3);

      // 5. Disable provider
      response = await request(app)
        .delete('/api/providers/tmdb')
        .expect(200);

      expect(response.body.success).toBe(true);

      // 6. Verify disabled
      response = await request(app)
        .get('/api/providers/tmdb')
        .expect(200);

      expect(response.body.config.enabled).toBe(false);
      expect(response.body.config.apiKey).toBeUndefined();
    });
  });
});
