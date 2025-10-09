/**
 * ProviderRegistry Tests
 */

import { ProviderRegistry } from '../../src/services/providers/ProviderRegistry.js';
import { TMDBProvider } from '../../src/services/providers/tmdb/TMDBProvider.js';
import { TVDBProvider } from '../../src/services/providers/tvdb/TVDBProvider.js';
import { MusicBrainzProvider } from '../../src/services/providers/musicbrainz/MusicBrainzProvider.js';
import { createMockProviderConfig } from './helpers.js';

describe('ProviderRegistry', () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = new ProviderRegistry();
  });

  describe('Provider Registration', () => {
    it('should register a provider', () => {
      const mockCapabilities = {
        id: 'test' as any,
        name: 'Test Provider',
        version: '1.0.0',
        category: 'metadata' as const,
        supportedEntityTypes: ['movie' as const],
        supportedMetadataFields: {},
        supportedAssetTypes: {},
        authentication: { type: 'none' as const, required: false },
        rateLimit: {
          requestsPerSecond: 1,
          burstCapacity: 1,
          webhookReservedCapacity: 0,
          enforcementType: 'client' as const,
        },
        search: {
          supported: true,
          fuzzyMatching: false,
          multiLanguage: false,
          yearFilter: false,
          externalIdLookup: [],
        },
        dataQuality: {
          metadataCompleteness: 0.9,
          imageQuality: 0.9,
          updateFrequency: 'daily' as const,
          userContributed: false,
          curatedContent: true,
        },
        assetProvision: {
          providesUrls: false,
          providesDirectDownload: false,
          thumbnailUrls: false,
          multipleQualities: false,
          maxResultsPerType: 0,
          qualityHints: false,
          languagePerAsset: false,
        },
        specialFeatures: {},
      };

      registry.registerProvider('test' as any, TMDBProvider as any, mockCapabilities);

      expect(registry.isProviderRegistered('test' as any)).toBe(true);
    });

    it('should get provider capabilities', () => {
      const mockCapabilities = {
        id: 'test' as any,
        name: 'Test Provider',
        version: '1.0.0',
        category: 'metadata' as const,
        supportedEntityTypes: ['movie' as const],
        supportedMetadataFields: {},
        supportedAssetTypes: {},
        authentication: { type: 'none' as const, required: false },
        rateLimit: {
          requestsPerSecond: 1,
          burstCapacity: 1,
          webhookReservedCapacity: 0,
          enforcementType: 'client' as const,
        },
        search: {
          supported: true,
          fuzzyMatching: false,
          multiLanguage: false,
          yearFilter: false,
          externalIdLookup: [],
        },
        dataQuality: {
          metadataCompleteness: 0.9,
          imageQuality: 0.9,
          updateFrequency: 'daily' as const,
          userContributed: false,
          curatedContent: true,
        },
        assetProvision: {
          providesUrls: false,
          providesDirectDownload: false,
          thumbnailUrls: false,
          multipleQualities: false,
          maxResultsPerType: 0,
          qualityHints: false,
          languagePerAsset: false,
        },
        specialFeatures: {},
      };

      registry.registerProvider('test' as any, TMDBProvider as any, mockCapabilities);

      const capabilities = registry.getCapabilities('test' as any);
      expect(capabilities).toBeDefined();
      expect(capabilities?.id).toBe('test');
      expect(capabilities?.name).toBe('Test Provider');
    });

    it('should list all registered providers', () => {
      // Registry should already have providers registered from imports
      const providers = registry.listProviders();

      expect(providers.length).toBeGreaterThan(0);
      expect(providers).toContain('tmdb');
      expect(providers).toContain('tvdb');
      expect(providers).toContain('musicbrainz');
    });
  });

  describe('Provider Creation', () => {
    it('should create a provider instance', async () => {
      const config = createMockProviderConfig('tmdb', {
        apiKey: 'test_api_key',
      });

      const provider = await registry.createProvider(config);

      expect(provider).toBeDefined();
      expect(provider).toBeInstanceOf(TMDBProvider);
    });

    it('should throw error for unregistered provider', async () => {
      const config = createMockProviderConfig('nonexistent' as any);

      await expect(registry.createProvider(config)).rejects.toThrow(
        'Provider nonexistent is not registered'
      );
    });
  });

  describe('Provider Filtering', () => {
    it('should get providers by entity type', () => {
      const movieProviders = registry.getProvidersForEntityType('movie');

      expect(movieProviders.length).toBeGreaterThan(0);
      expect(movieProviders).toContain('tmdb');
    });

    it('should get providers by category', () => {
      const metadataProviders = registry.getProvidersByCategory('metadata');

      expect(metadataProviders.length).toBeGreaterThan(0);
      expect(metadataProviders).toContain('musicbrainz');
    });

    it('should get providers that support specific asset type', () => {
      const posterProviders = registry.getProvidersForAssetType('poster', 'movie');

      expect(posterProviders.length).toBeGreaterThan(0);
      expect(posterProviders).toContain('tmdb');
    });
  });
});
