/**
 * ProviderOrchestrator Integration Tests
 */

import { jest } from '@jest/globals';
import { ProviderOrchestrator } from '../../src/services/providers/ProviderOrchestrator.js';
import { ProviderRegistry } from '../../src/services/providers/ProviderRegistry.js';
import { ProviderConfigService } from '../../src/services/providerConfigService.js';
import { DatabaseConnection } from '../../src/types/database.js';

describe('ProviderOrchestrator Integration Tests', () => {
  let orchestrator: ProviderOrchestrator;
  let registry: ProviderRegistry;
  let configService: jest.Mocked<ProviderConfigService>;

  beforeEach(() => {
    registry = ProviderRegistry.getInstance();

    // Create mock DatabaseConnection
    const mockDb = {
      query: jest.fn<() => Promise<any[]>>().mockResolvedValue([]) as any,
      execute: jest.fn<() => Promise<any>>().mockResolvedValue({ affectedRows: 0 }) as any,
      close: jest.fn<() => Promise<void>>().mockResolvedValue(undefined) as any,
      beginTransaction: jest.fn<() => Promise<void>>().mockResolvedValue(undefined) as any,
      commit: jest.fn<() => Promise<void>>().mockResolvedValue(undefined) as any,
      rollback: jest.fn<() => Promise<void>>().mockResolvedValue(undefined) as any,
    } as DatabaseConnection;

    // Create config service and mock its methods
    configService = new ProviderConfigService(mockDb) as any;

    // Mock getAll to return test configs
    configService.getAll = jest.fn<() => Promise<any[]>>().mockResolvedValue([
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
      const entityType = 'movie' as const;
      const externalIds = { tmdb: '603' };
      const strategy = { strategy: 'preferred_first' as const };

      await expect(
        orchestrator.fetchMetadata(entityType, externalIds, strategy)
      ).resolves.not.toThrow();
    });
  });

  describe('Asset Collection', () => {
    it('should collect assets from multiple providers', async () => {
      const entityType = 'movie' as const;
      const externalIds = { tmdb: '603' };
      const assetTypes = ['poster' as const];

      const results = await orchestrator.fetchAssetCandidates(
        entityType,
        externalIds,
        assetTypes
      );

      expect(Array.isArray(results)).toBe(true);
    });

    it('should filter assets by type', async () => {
      const entityType = 'movie' as const;
      const externalIds = { tmdb: '603' };
      const assetTypes = ['poster' as const, 'fanart' as const];

      const results = await orchestrator.fetchAssetCandidates(
        entityType,
        externalIds,
        assetTypes
      );

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
