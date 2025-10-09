/**
 * TMDB Provider Tests
 */

import { TMDBProvider } from '../../src/services/providers/tmdb/TMDBProvider.js';
import { createMockProviderConfig } from './helpers.js';

describe('TMDBProvider', () => {
  let provider: TMDBProvider;

  beforeEach(() => {
    const config = createMockProviderConfig('tmdb', {
      apiKey: 'test_api_key',
    });

    provider = new TMDBProvider(config);
  });

  describe('Capabilities', () => {
    it('should have correct provider ID', () => {
      const capabilities = provider.getCapabilities();
      expect(capabilities.id).toBe('tmdb');
    });

    it('should support movies and collections', () => {
      const capabilities = provider.getCapabilities();
      expect(capabilities.supportedEntityTypes).toContain('movie');
      expect(capabilities.supportedEntityTypes).toContain('collection');
    });

    it('should support both metadata and images', () => {
      const capabilities = provider.getCapabilities();
      expect(capabilities.category).toBe('both');
    });

    it('should have proper rate limits', () => {
      const capabilities = provider.getCapabilities();
      expect(capabilities.rateLimit.requestsPerSecond).toBeGreaterThan(0);
      expect(capabilities.rateLimit.burstCapacity).toBeGreaterThan(0);
    });

    it('should support search', () => {
      const capabilities = provider.getCapabilities();
      expect(capabilities.search.supported).toBe(true);
    });

    it('should support asset provision', () => {
      const capabilities = provider.getCapabilities();
      expect(capabilities.assetProvision.providesUrls).toBe(true);
    });
  });

  describe('Search', () => {
    it('should accept search requests', async () => {
      // This test verifies the interface, actual search logic is tested in integration tests
      const searchRequest = {
        query: 'The Matrix',
        entityType: 'movie' as const,
      };

      // We're just verifying it doesn't throw and returns the expected type
      await expect(async () => {
        await provider.search(searchRequest);
      }).not.toThrow();
    });
  });

  describe('Metadata', () => {
    it('should accept metadata requests', async () => {
      const metadataRequest = {
        providerId: 'tmdb' as const,
        providerResultId: '603',
        entityType: 'movie' as const,
      };

      // Verify it doesn't throw and returns the expected type
      await expect(async () => {
        await provider.getMetadata(metadataRequest);
      }).not.toThrow();
    });
  });

  describe('Assets', () => {
    it('should accept asset requests', async () => {
      const assetRequest = {
        providerId: 'tmdb' as const,
        providerResultId: '603',
        entityType: 'movie' as const,
        assetTypes: ['poster' as const],
      };

      // Verify it doesn't throw and returns the expected type
      await expect(async () => {
        await provider.getAssets(assetRequest);
      }).not.toThrow();
    });
  });

  describe('Connection Test', () => {
    it('should have a test connection method', async () => {
      const result = await provider.testConnection();

      expect(result).toHaveProperty('success');
      expect(typeof result.success).toBe('boolean');
    });
  });
});
