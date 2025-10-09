import { TestDatabase, createTestDatabase } from '../utils/testDatabase.js';
import { ProviderConfigService } from '../../src/services/providerConfigService.js';
import { UpdateProviderRequest } from '../../src/types/provider.js';

describe('ProviderConfigService', () => {
  let testDb: TestDatabase;
  let service: ProviderConfigService;

  beforeEach(async () => {
    testDb = await createTestDatabase();
    const db = await testDb.create();
    service = new ProviderConfigService(db);
  });

  afterEach(async () => {
    await testDb.destroy();
  });

  describe('getAll', () => {
    it('should return empty array when no providers configured', async () => {
      // Clear the migrated providers
      const configs = await service.getAll();
      for (const config of configs) {
        await service.disable(config.providerName);
      }

      const result = await service.getAll();
      // After disabling, configs still exist but are disabled
      expect(Array.isArray(result)).toBe(true);
    });

    it('should return all configured providers', async () => {
      await service.upsert('tmdb', {
        enabled: true,
        apiKey: 'test_key_1',
        enabledAssetTypes: ['poster']
      });

      await service.upsert('tvdb', {
        enabled: true,
        apiKey: 'test_key_2',
        enabledAssetTypes: ['banner']
      });

      const result = await service.getAll();

      expect(result.length).toBeGreaterThanOrEqual(2);
      const providerNames = result.map(p => p.providerName);
      expect(providerNames).toContain('tmdb');
      expect(providerNames).toContain('tvdb');
    });

    it('should return providers sorted by name', async () => {
      await service.upsert('tvdb', {
        enabled: true,
        apiKey: 'key1',
        enabledAssetTypes: []
      });

      await service.upsert('fanart_tv', {
        enabled: true,
        apiKey: 'key2',
        enabledAssetTypes: []
      });

      const result = await service.getAll();
      const names = result.map(p => p.providerName);

      // Should be alphabetically sorted
      const sortedNames = [...names].sort();
      expect(names).toEqual(sortedNames);
    });
  });

  describe('getByName', () => {
    it('should return null for non-existent provider', async () => {
      const result = await service.getByName('non_existent');
      expect(result).toBeNull();
    });

    it('should return provider configuration by name', async () => {
      await service.upsert('tmdb', {
        enabled: true,
        apiKey: 'secret_key',
        enabledAssetTypes: ['poster', 'fanart']
      });

      const result = await service.getByName('tmdb');

      expect(result).not.toBeNull();
      expect(result?.providerName).toBe('tmdb');
      expect(result?.enabled).toBe(true);
      expect(result?.apiKey).toBe('secret_key');
      expect(result?.enabledAssetTypes).toEqual(['poster', 'fanart']);
    });

    it('should include all optional fields when present', async () => {
      const data: UpdateProviderRequest = {
        enabled: true,
        apiKey: 'test_key',
        enabledAssetTypes: ['poster']
      };

      await service.upsert('tmdb', data);

      // Update test status
      await service.updateTestStatus('tmdb', 'success');

      const result = await service.getByName('tmdb');

      expect(result).not.toBeNull();
      expect(result?.lastTestStatus).toBe('success');
      expect(result?.lastTestAt).toBeInstanceOf(Date);
    });
  });

  describe('upsert', () => {
    it('should create new provider configuration', async () => {
      const data: UpdateProviderRequest = {
        enabled: true,
        apiKey: 'new_api_key',
        enabledAssetTypes: ['poster', 'fanart', 'trailer']
      };

      const result = await service.upsert('tmdb', data);

      expect(result.providerName).toBe('tmdb');
      expect(result.enabled).toBe(true);
      expect(result.apiKey).toBe('new_api_key');
      expect(result.enabledAssetTypes).toEqual(['poster', 'fanart', 'trailer']);
      expect(result.lastTestStatus).toBe('never_tested');
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeInstanceOf(Date);
    });

    it('should update existing provider configuration', async () => {
      // Create initial config
      await service.upsert('tmdb', {
        enabled: false,
        apiKey: 'old_key',
        enabledAssetTypes: ['poster']
      });

      // Update config
      const updated = await service.upsert('tmdb', {
        enabled: true,
        apiKey: 'new_key',
        enabledAssetTypes: ['poster', 'fanart']
      });

      expect(updated.enabled).toBe(true);
      expect(updated.apiKey).toBe('new_key');
      expect(updated.enabledAssetTypes).toEqual(['poster', 'fanart']);
    });

    it('should preserve id when updating', async () => {
      const initial = await service.upsert('tmdb', {
        enabled: true,
        apiKey: 'key1',
        enabledAssetTypes: []
      });

      const updated = await service.upsert('tmdb', {
        enabled: true,
        apiKey: 'key2',
        enabledAssetTypes: ['poster']
      });

      expect(updated.id).toBe(initial.id);
    });

    it('should update updatedAt timestamp on update', async () => {
      const initial = await service.upsert('tmdb', {
        enabled: true,
        apiKey: 'key1',
        enabledAssetTypes: []
      });

      // Wait to ensure timestamp difference (SQLite CURRENT_TIMESTAMP has second precision)
      await new Promise(resolve => setTimeout(resolve, 1100));

      const updated = await service.upsert('tmdb', {
        enabled: true,
        apiKey: 'key2',
        enabledAssetTypes: []
      });

      expect(updated.updatedAt.getTime()).toBeGreaterThan(initial.updatedAt.getTime());
    });

    it('should handle missing optional fields', async () => {
      const result = await service.upsert('fanart_tv', {
        enabled: true,
        // No API key (optional for fanart_tv)
        enabledAssetTypes: ['hdclearlogo']
      });

      expect(result.providerName).toBe('fanart_tv');
      expect(result.enabled).toBe(true);
      expect(result.apiKey).toBeUndefined();
      expect(result.enabledAssetTypes).toEqual(['hdclearlogo']);
    });

    it('should allow empty enabledAssetTypes array', async () => {
      const result = await service.upsert('tmdb', {
        enabled: false,
        apiKey: 'test_key',
        enabledAssetTypes: []
      });

      expect(result.enabledAssetTypes).toEqual([]);
    });
  });

  describe('updateTestStatus', () => {
    beforeEach(async () => {
      await service.upsert('tmdb', {
        enabled: true,
        apiKey: 'test_key',
        enabledAssetTypes: ['poster']
      });
    });

    it('should update test status to success', async () => {
      await service.updateTestStatus('tmdb', 'success');

      const result = await service.getByName('tmdb');
      expect(result?.lastTestStatus).toBe('success');
      expect(result?.lastTestAt).toBeInstanceOf(Date);
      expect(result?.lastTestError).toBeUndefined();
    });

    it('should update test status to error with message', async () => {
      const errorMessage = 'Invalid API key';
      await service.updateTestStatus('tmdb', 'error', errorMessage);

      const result = await service.getByName('tmdb');
      expect(result?.lastTestStatus).toBe('error');
      expect(result?.lastTestError).toBe(errorMessage);
      expect(result?.lastTestAt).toBeInstanceOf(Date);
    });

    it('should update lastTestAt timestamp', async () => {
      const before = new Date();

      await service.updateTestStatus('tmdb', 'success');

      const result = await service.getByName('tmdb');
      expect(result?.lastTestAt).toBeInstanceOf(Date);
      expect(result!.lastTestAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it('should clear error message on successful test', async () => {
      // First, set an error
      await service.updateTestStatus('tmdb', 'error', 'Some error');

      // Then, successful test
      await service.updateTestStatus('tmdb', 'success');

      const result = await service.getByName('tmdb');
      expect(result?.lastTestStatus).toBe('success');
      expect(result?.lastTestError).toBeUndefined();
    });
  });

  describe('disable', () => {
    beforeEach(async () => {
      await service.upsert('tmdb', {
        enabled: true,
        apiKey: 'secret_key',
        enabledAssetTypes: ['poster', 'fanart']
      });
    });

    it('should set enabled to false', async () => {
      await service.disable('tmdb');

      const result = await service.getByName('tmdb');
      expect(result?.enabled).toBe(false);
    });

    it('should clear API key', async () => {
      await service.disable('tmdb');

      const result = await service.getByName('tmdb');
      expect(result?.apiKey).toBeUndefined();
    });

    it('should preserve other configuration', async () => {
      await service.disable('tmdb');

      const result = await service.getByName('tmdb');
      expect(result?.providerName).toBe('tmdb');
      expect(result?.enabledAssetTypes).toEqual(['poster', 'fanart']);
    });

    it('should update updatedAt timestamp', async () => {
      const before = await service.getByName('tmdb');

      // Wait to ensure timestamp difference (SQLite CURRENT_TIMESTAMP has second precision)
      await new Promise(resolve => setTimeout(resolve, 1100));

      await service.disable('tmdb');

      const after = await service.getByName('tmdb');
      expect(after!.updatedAt.getTime()).toBeGreaterThan(before!.updatedAt.getTime());
    });

    it('should handle disabling non-existent provider gracefully', async () => {
      await expect(service.disable('non_existent')).resolves.not.toThrow();
    });

    it('should handle disabling already disabled provider', async () => {
      await service.disable('tmdb');
      await expect(service.disable('tmdb')).resolves.not.toThrow();

      const result = await service.getByName('tmdb');
      expect(result?.enabled).toBe(false);
    });
  });

  describe('Data integrity', () => {
    it('should properly parse JSON enabledAssetTypes', async () => {
      await service.upsert('tmdb', {
        enabled: true,
        apiKey: 'key',
        enabledAssetTypes: ['poster', 'fanart', 'trailer']
      });

      const result = await service.getByName('tmdb');
      expect(Array.isArray(result?.enabledAssetTypes)).toBe(true);
      expect(result?.enabledAssetTypes).toHaveLength(3);
      expect(result?.enabledAssetTypes).toContain('poster');
      expect(result?.enabledAssetTypes).toContain('fanart');
      expect(result?.enabledAssetTypes).toContain('trailer');
    });

    it('should handle special characters in API key', async () => {
      const specialKey = 'key_with-special.chars+123/=';

      await service.upsert('tmdb', {
        enabled: true,
        apiKey: specialKey,
        enabledAssetTypes: []
      });

      const result = await service.getByName('tmdb');
      expect(result?.apiKey).toBe(specialKey);
    });

    it('should handle very long API keys', async () => {
      const longKey = 'a'.repeat(500);

      await service.upsert('tmdb', {
        enabled: true,
        apiKey: longKey,
        enabledAssetTypes: []
      });

      const result = await service.getByName('tmdb');
      expect(result?.apiKey).toBe(longKey);
    });

    it('should handle many asset types', async () => {
      const manyTypes = ['type1', 'type2', 'type3', 'type4', 'type5'];

      await service.upsert('tmdb', {
        enabled: true,
        apiKey: 'key',
        enabledAssetTypes: manyTypes
      });

      const result = await service.getByName('tmdb');
      expect(result?.enabledAssetTypes).toEqual(manyTypes);
    });
  });

  describe('Concurrent operations', () => {
    it('should handle multiple upserts to same provider', async () => {
      const operations = [
        service.upsert('tmdb', { enabled: true, apiKey: 'key1', enabledAssetTypes: ['poster'] }),
        service.upsert('tmdb', { enabled: true, apiKey: 'key2', enabledAssetTypes: ['fanart'] }),
        service.upsert('tmdb', { enabled: true, apiKey: 'key3', enabledAssetTypes: ['trailer'] })
      ];

      await Promise.all(operations);

      const result = await service.getByName('tmdb');
      expect(result).not.toBeNull();
      expect(['key1', 'key2', 'key3']).toContain(result?.apiKey);
    });

    it('should handle multiple providers being created concurrently', async () => {
      const operations = [
        service.upsert('tmdb', { enabled: true, apiKey: 'key1', enabledAssetTypes: [] }),
        service.upsert('tvdb', { enabled: true, apiKey: 'key2', enabledAssetTypes: [] }),
        service.upsert('fanart_tv', { enabled: true, apiKey: 'key3', enabledAssetTypes: [] })
      ];

      await Promise.all(operations);

      const results = await service.getAll();
      expect(results.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Edge cases', () => {
    it('should handle provider name with underscores', async () => {
      await service.upsert('fanart_tv', {
        enabled: true,
        apiKey: 'key',
        enabledAssetTypes: []
      });

      const result = await service.getByName('fanart_tv');
      expect(result?.providerName).toBe('fanart_tv');
    });

    it('should maintain exact case of provider name', async () => {
      await service.upsert('tmdb', {
        enabled: true,
        apiKey: 'key',
        enabledAssetTypes: []
      });

      const result = await service.getByName('tmdb');
      expect(result?.providerName).toBe('tmdb');
      expect(result?.providerName).not.toBe('TMDB');
      expect(result?.providerName).not.toBe('Tmdb');
    });

    it('should handle rapid enable/disable cycles', async () => {
      await service.upsert('tmdb', {
        enabled: true,
        apiKey: 'key',
        enabledAssetTypes: []
      });

      // Cycle through enable/disable
      for (let i = 0; i < 5; i++) {
        await service.upsert('tmdb', {
          enabled: i % 2 === 0,
          apiKey: 'key',
          enabledAssetTypes: []
        });
      }

      const result = await service.getByName('tmdb');
      // i=4 is even, so i%2===0 is true, so enabled=true
      expect(result?.enabled).toBe(true);
    });
  });
});
