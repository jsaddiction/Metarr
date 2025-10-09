/**
 * MusicBrainz Provider Tests
 */

import { MusicBrainzProvider } from '../../src/services/providers/musicbrainz/MusicBrainzProvider.js';
import { createMockProviderConfig } from './helpers.js';

describe('MusicBrainzProvider', () => {
  let provider: MusicBrainzProvider;

  beforeEach(() => {
    const config = createMockProviderConfig('musicbrainz');

    provider = new MusicBrainzProvider(config, {
      contact: 'test@example.com',
    });
  });

  describe('Capabilities', () => {
    it('should have correct provider ID', () => {
      const capabilities = provider.getCapabilities();
      expect(capabilities.id).toBe('musicbrainz');
    });

    it('should support music entities', () => {
      const capabilities = provider.getCapabilities();
      expect(capabilities.supportedEntityTypes).toContain('artist');
      expect(capabilities.supportedEntityTypes).toContain('album');
      expect(capabilities.supportedEntityTypes).toContain('track');
    });

    it('should be metadata-only provider', () => {
      const capabilities = provider.getCapabilities();
      expect(capabilities.category).toBe('metadata');
    });

    it('should have strict rate limit of 1 req/sec', () => {
      const capabilities = provider.getCapabilities();
      expect(capabilities.rateLimit.requestsPerSecond).toBe(1);
      expect(capabilities.rateLimit.burstCapacity).toBe(1);
    });

    it('should support search with fuzzy matching', () => {
      const capabilities = provider.getCapabilities();
      expect(capabilities.search.supported).toBe(true);
      expect(capabilities.search.fuzzyMatching).toBe(true);
    });

    it('should not provide assets', () => {
      const capabilities = provider.getCapabilities();
      expect(capabilities.assetProvision.providesUrls).toBe(false);
    });
  });

  describe('Search', () => {
    it('should accept artist search requests', async () => {
      const searchRequest = {
        query: 'Radiohead',
        entityType: 'artist' as const,
      };

      await expect(async () => {
        await provider.search(searchRequest);
      }).not.toThrow();
    });

    it('should accept album search requests', async () => {
      const searchRequest = {
        query: 'OK Computer',
        entityType: 'album' as const,
      };

      await expect(async () => {
        await provider.search(searchRequest);
      }).not.toThrow();
    });

    it('should accept track search requests', async () => {
      const searchRequest = {
        query: 'Paranoid Android',
        entityType: 'track' as const,
      };

      await expect(async () => {
        await provider.search(searchRequest);
      }).not.toThrow();
    });
  });

  describe('Metadata', () => {
    it('should accept artist metadata requests', async () => {
      const metadataRequest = {
        providerId: 'musicbrainz' as const,
        providerResultId: 'test-mbid',
        entityType: 'artist' as const,
      };

      await expect(async () => {
        await provider.getMetadata(metadataRequest);
      }).not.toThrow();
    });

    it('should accept album metadata requests', async () => {
      const metadataRequest = {
        providerId: 'musicbrainz' as const,
        providerResultId: 'test-mbid',
        entityType: 'album' as const,
      };

      await expect(async () => {
        await provider.getMetadata(metadataRequest);
      }).not.toThrow();
    });
  });

  describe('Assets', () => {
    it('should return empty array for asset requests', async () => {
      const assetRequest = {
        providerId: 'musicbrainz' as const,
        providerResultId: 'test-mbid',
        entityType: 'artist' as const,
        assetTypes: ['artistthumb' as const],
      };

      const result = await provider.getAssets(assetRequest);
      expect(result).toEqual([]);
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
