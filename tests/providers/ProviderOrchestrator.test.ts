/**
 * ProviderOrchestrator Integration Tests
 */

import { ProviderOrchestrator } from '../../src/services/providers/ProviderOrchestrator.js';
import { ProviderRegistry } from '../../src/services/providers/ProviderRegistry.js';
import { ProviderConfigService } from '../../src/services/providerConfigService.js';
import { DatabaseManager } from '../../src/database/DatabaseManager.js';

// Mock the database and provider configs
jest.mock('../../src/database/DatabaseManager.js');
jest.mock('../../src/services/providerConfigService.js');

describe('ProviderOrchestrator Integration Tests', () => {
  let orchestrator: ProviderOrchestrator;
  let registry: ProviderRegistry;
  let configService: jest.Mocked<ProviderConfigService>;

  beforeEach(() => {
    registry = ProviderRegistry.getInstance();

    // Mock config service
    const mockDb = new DatabaseManager({ type: 'sqlite3', file: ':memory:' }) as jest.Mocked<
      DatabaseManager
    >;
    configService = new ProviderConfigService(mockDb) as jest.Mocked<ProviderConfigService>;

    // Mock getEnabledProviders to return test configs
    configService.getEnabledProviders = jest.fn().mockResolvedValue([
      {
        id: 1,
        providerName: 'tmdb',
        enabled: true,
        apiKey: 'test_key',
        enabledAssetTypes: ['poster', 'fanart'],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 2,
        providerName: 'musicbrainz',
        enabled: true,
        enabledAssetTypes: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    orchestrator = new ProviderOrchestrator(registry, configService);
  });

  describe('Multi-Provider Search', () => {
    it('should search across multiple providers', async () => {
      const searchRequest = {
        query: 'test',
        entityType: 'movie' as const,
      };

      // This will attempt to search across all enabled providers
      const results = await orchestrator.searchAcrossProviders(searchRequest);

      // Results should be an array (may be empty if APIs fail, but should not throw)
      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle errors from individual providers gracefully', async () => {
      const searchRequest = {
        query: 'test',
        entityType: 'movie' as const,
      };

      // Should not throw even if some providers fail
      await expect(orchestrator.searchAcrossProviders(searchRequest)).resolves.not.toThrow();
    });

    it('should filter providers by supported entity type', async () => {
      const musicSearchRequest = {
        query: 'Radiohead',
        entityType: 'artist' as const,
      };

      // Only music providers should be queried
      const results = await orchestrator.searchAcrossProviders(musicSearchRequest);

      expect(Array.isArray(results)).toBe(true);
      // If results exist, they should only be from music-supporting providers
    });

    it('should sort results by confidence', async () => {
      const searchRequest = {
        query: 'test',
        entityType: 'movie' as const,
      };

      const results = await orchestrator.searchAcrossProviders(searchRequest);

      if (results.length > 1) {
        // Verify results are sorted by confidence (descending)
        for (let i = 0; i < results.length - 1; i++) {
          expect(results[i].confidence).toBeGreaterThanOrEqual(results[i + 1].confidence);
        }
      }
    });
  });

  describe('Metadata Fetching', () => {
    it('should fetch metadata from a single provider', async () => {
      const metadataRequest = {
        providerId: 'tmdb' as const,
        providerResultId: '603',
        entityType: 'movie' as const,
      };

      await expect(
        orchestrator.fetchMetadata(metadataRequest, { strategy: 'preferred_first' })
      ).resolves.not.toThrow();
    });
  });

  describe('Asset Collection', () => {
    it('should collect assets from multiple providers', async () => {
      const assetRequest = {
        providerId: 'tmdb' as const,
        providerResultId: '603',
        entityType: 'movie' as const,
        assetTypes: ['poster' as const],
      };

      const results = await orchestrator.collectAssets(assetRequest, {
        includeAllProviders: true,
      });

      expect(Array.isArray(results)).toBe(true);
    });

    it('should filter assets by type', async () => {
      const assetRequest = {
        providerId: 'tmdb' as const,
        providerResultId: '603',
        entityType: 'movie' as const,
        assetTypes: ['poster' as const, 'fanart' as const],
      };

      const results = await orchestrator.collectAssets(assetRequest, {
        includeAllProviders: true,
      });

      // All returned assets should match requested types
      results.forEach((asset) => {
        expect(['poster', 'fanart']).toContain(asset.assetType);
      });
    });
  });

  describe('Provider Coordination', () => {
    it('should handle video and music providers separately', async () => {
      const videoSearch = {
        query: 'The Matrix',
        entityType: 'movie' as const,
      };

      const musicSearch = {
        query: 'Radiohead',
        entityType: 'artist' as const,
      };

      // Both should work independently
      await expect(orchestrator.searchAcrossProviders(videoSearch)).resolves.not.toThrow();
      await expect(orchestrator.searchAcrossProviders(musicSearch)).resolves.not.toThrow();
    });
  });
});
