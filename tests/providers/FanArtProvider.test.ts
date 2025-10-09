/**
 * FanArt.tv Provider Tests
 */

import { jest } from '@jest/globals';
import { FanArtProvider } from '../../src/services/providers/fanart/FanArtProvider.js';
import { FanArtClient } from '../../src/services/providers/fanart/FanArtClient.js';
import { createMockProviderConfig } from './helpers.js';

// Mock the FanArt client
const mockGetMovieImages = jest.fn<() => Promise<any>>();
const mockGetTVImages = jest.fn<() => Promise<any>>();

jest.spyOn(FanArtClient.prototype, 'getMovieImages').mockImplementation(mockGetMovieImages as any);
jest.spyOn(FanArtClient.prototype, 'getTVImages').mockImplementation(mockGetTVImages as any);

describe('FanArtProvider', () => {
  let provider: FanArtProvider;

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    const config = createMockProviderConfig('fanart_tv', {
      apiKey: 'test_api_key',
    });

    provider = new FanArtProvider(config, {});
  });

  describe('Capabilities', () => {
    it('should have correct provider ID', () => {
      const capabilities = provider.getCapabilities();
      expect(capabilities.id).toBe('fanart_tv');
    });

    it('should support movie, series, and season entity types', () => {
      const capabilities = provider.getCapabilities();
      expect(capabilities.supportedEntityTypes).toContain('movie');
      expect(capabilities.supportedEntityTypes).toContain('series');
      expect(capabilities.supportedEntityTypes).toContain('season');
    });

    it('should be images-only provider', () => {
      const capabilities = provider.getCapabilities();
      expect(capabilities.category).toBe('images');
    });

    it('should have proper rate limits', () => {
      const capabilities = provider.getCapabilities();
      expect(capabilities.rateLimit.requestsPerSecond).toBeGreaterThan(0);
    });

    it('should not support search', () => {
      const capabilities = provider.getCapabilities();
      expect(capabilities.search.supported).toBe(false);
    });

    it('should support asset provision', () => {
      const capabilities = provider.getCapabilities();
      expect(capabilities.assetProvision.providesUrls).toBe(true);
    });
  });

  describe('Search', () => {
    it('should return empty array as search is not supported', async () => {
      const searchRequest = {
        query: 'The Matrix',
        entityType: 'movie' as const,
      };

      const results = await provider.search(searchRequest);

      expect(results).toEqual([]);
    });
  });

  describe('Metadata', () => {
    it('should throw error as metadata is not supported', async () => {
      const metadataRequest = {
        providerId: 'fanart_tv' as const,
        providerResultId: '603',
        entityType: 'movie' as const,
      };

      await expect(provider.getMetadata(metadataRequest)).rejects.toThrow(
        'FanArt.tv provider does not support metadata fetching'
      );
    });
  });

  describe('Assets', () => {
    it('should retrieve movie assets', async () => {
      mockGetMovieImages.mockResolvedValue({
        name: 'The Matrix',
        tmdb_id: '603',
        hdmovielogo: [
          {
            id: '1',
            url: 'https://assets.fanart.tv/fanart/movies/603/hdmovielogo/the-matrix-1.png',
            lang: 'en',
            likes: '5',
          },
        ],
        movieposter: [
          {
            id: '2',
            url: 'https://assets.fanart.tv/fanart/movies/603/movieposter/the-matrix-2.jpg',
            lang: 'en',
            likes: '10',
          },
        ],
        moviebackground: [
          {
            id: '3',
            url: 'https://assets.fanart.tv/fanart/movies/603/moviebackground/the-matrix-3.jpg',
            lang: 'en',
            likes: '8',
          },
        ],
      });

      const assetRequest = {
        providerId: 'fanart_tv' as const,
        providerResultId: '603',
        entityType: 'movie' as const,
        assetTypes: ['clearlogo' as const, 'poster' as const, 'fanart' as const],
      };

      const results = await provider.getAssets(assetRequest);

      expect(mockGetMovieImages).toHaveBeenCalledWith(603);
      expect(results.length).toBeGreaterThan(0);

      const logoAssets = results.filter(r => r.assetType === 'clearlogo');
      const posterAssets = results.filter(r => r.assetType === 'poster');
      const fanartAssets = results.filter(r => r.assetType === 'fanart');

      expect(logoAssets.length).toBeGreaterThan(0);
      expect(posterAssets.length).toBeGreaterThan(0);
      expect(fanartAssets.length).toBeGreaterThan(0);
    });

    it('should retrieve TV series assets', async () => {
      mockGetTVImages.mockResolvedValue({
        name: 'The Simpsons',
        thetvdb_id: '75978',
        hdtvlogo: [
          {
            id: '1',
            url: 'https://assets.fanart.tv/fanart/tv/75978/hdtvlogo/the-simpsons-1.png',
            lang: 'en',
            likes: '15',
          },
        ],
        tvposter: [
          {
            id: '2',
            url: 'https://assets.fanart.tv/fanart/tv/75978/tvposter/the-simpsons-2.jpg',
            lang: 'en',
            likes: '20',
          },
        ],
        showbackground: [
          {
            id: '3',
            url: 'https://assets.fanart.tv/fanart/tv/75978/showbackground/the-simpsons-3.jpg',
            lang: 'en',
            likes: '12',
          },
        ],
      });

      const assetRequest = {
        providerId: 'fanart_tv' as const,
        providerResultId: '75978',
        entityType: 'series' as const,
        assetTypes: ['clearlogo' as const, 'poster' as const, 'fanart' as const],
      };

      const results = await provider.getAssets(assetRequest);

      expect(mockGetTVImages).toHaveBeenCalledWith(75978);
      expect(results.length).toBeGreaterThan(0);
    });

    it('should return empty array when no images found', async () => {
      mockGetMovieImages.mockResolvedValue(null);

      const assetRequest = {
        providerId: 'fanart_tv' as const,
        providerResultId: '999999',
        entityType: 'movie' as const,
        assetTypes: ['poster' as const],
      };

      const results = await provider.getAssets(assetRequest);

      expect(results).toEqual([]);
    });
  });

  describe('Connection Test', () => {
    it('should return success when circuit breaker is closed', async () => {
      const result = await provider.testConnection();

      expect(result.success).toBe(true);
      expect(result.message).toBe('Provider is healthy');
    });
  });
});
