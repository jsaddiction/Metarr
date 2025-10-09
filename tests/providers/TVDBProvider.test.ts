/**
 * TVDB Provider Tests
 */

import { jest } from '@jest/globals';
import { TVDBProvider } from '../../src/services/providers/tvdb/TVDBProvider.js';
import { TVDBClient } from '../../src/services/providers/tvdb/TVDBClient.js';
import { createMockProviderConfig } from './helpers.js';

// Mock the TVDB client
const mockSearchSeries = jest.fn<() => Promise<any>>();
const mockGetSeriesExtended = jest.fn<() => Promise<any>>();
const mockGetSeriesArtwork = jest.fn<() => Promise<any>>();

jest.spyOn(TVDBClient.prototype, 'searchSeries').mockImplementation(mockSearchSeries as any);
jest.spyOn(TVDBClient.prototype, 'getSeriesExtended').mockImplementation(mockGetSeriesExtended as any);
jest.spyOn(TVDBClient.prototype, 'getSeriesArtwork').mockImplementation(mockGetSeriesArtwork as any);

describe('TVDBProvider', () => {
  let provider: TVDBProvider;

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    const config = createMockProviderConfig('tvdb', {
      apiKey: 'test_api_key',
    });

    provider = new TVDBProvider(config);
  });

  describe('Capabilities', () => {
    it('should have correct provider ID', () => {
      const capabilities = provider.getCapabilities();
      expect(capabilities.id).toBe('tvdb');
    });

    it('should support series, season, and episode entity types', () => {
      const capabilities = provider.getCapabilities();
      expect(capabilities.supportedEntityTypes).toContain('series');
      expect(capabilities.supportedEntityTypes).toContain('season');
      expect(capabilities.supportedEntityTypes).toContain('episode');
    });

    it('should support both metadata and images', () => {
      const capabilities = provider.getCapabilities();
      expect(capabilities.category).toBe('both');
    });

    it('should have proper rate limits', () => {
      const capabilities = provider.getCapabilities();
      expect(capabilities.rateLimit.requestsPerSecond).toBe(10);
      expect(capabilities.rateLimit.burstCapacity).toBe(50);
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
    it('should search for series', async () => {
      mockSearchSeries.mockResolvedValue({
        status: 'success',
        data: [
          {
            tvdb_id: '75978',
            id: '75978',
            name: 'The Simpsons',
            overview: 'Animated sitcom about the Simpson family.',
            year: '1989',
            image_url: 'https://artworks.thetvdb.com/banners/posters/75978-1.jpg',
          },
        ],
      });

      const searchRequest = {
        query: 'The Simpsons',
        entityType: 'series' as const,
      };

      const results = await provider.search(searchRequest);

      expect(mockSearchSeries).toHaveBeenCalledWith('The Simpsons', 0);
      expect(results).toHaveLength(1);
      expect(results[0].providerResultId).toBe('75978');
      expect(results[0].title).toBe('The Simpsons');
    });

    it('should return empty array for non-series entity types', async () => {
      const searchRequest = {
        query: 'Test',
        entityType: 'movie' as const,
      };

      const results = await provider.search(searchRequest);

      expect(mockSearchSeries).not.toHaveBeenCalled();
      expect(results).toEqual([]);
    });
  });

  describe('Metadata', () => {
    it('should retrieve series metadata', async () => {
      mockGetSeriesExtended.mockResolvedValue({
        id: 75978,
        name: 'The Simpsons',
        overview: 'Animated sitcom about the Simpson family.',
        firstAired: '1989-12-17',
        status: {
          name: 'Continuing',
        },
        averageRuntime: 22,
        genres: [{ name: 'Comedy' }, { name: 'Animation' }],
        characters: [
          {
            name: 'Homer Simpson',
            peopleId: 12345,
            personName: 'Dan Castellaneta',
          },
        ],
        remoteIds: [
          { id: 'tt0096697', type: 2, sourceName: 'IMDB' },
        ],
        trailers: [
          {
            url: 'https://www.youtube.com/watch?v=abc123',
            language: 'eng',
          },
        ],
      });

      const metadataRequest = {
        providerId: 'tvdb' as const,
        providerResultId: '75978',
        entityType: 'series' as const,
      };

      const result = await provider.getMetadata(metadataRequest);

      expect(mockGetSeriesExtended).toHaveBeenCalledWith(75978);
      expect(result.fields.title).toBe('The Simpsons');
      expect(result.fields.plot).toBe('Animated sitcom about the Simpson family.');
      expect(result.fields.premiered).toBe('1989-12-17');
      expect(result.fields.status).toBe('Continuing');
      expect(result.fields.runtime).toBe(22);
      expect(result.fields.genres).toEqual(['Comedy', 'Animation']);
    });
  });

  describe('Assets', () => {
    it('should retrieve series assets', async () => {
      mockGetSeriesArtwork.mockResolvedValue([
        {
          id: 1,
          image: '/banners/posters/75978-1.jpg',
          thumbnail: '/banners/_cache/posters/75978-1.jpg',
          type: 2, // poster (TVDBImageType.POSTER)
          width: 680,
          height: 1000,
          language: 'eng',
          score: 9.5,
        },
        {
          id: 2,
          image: '/banners/fanart/original/75978-2.jpg',
          thumbnail: '/banners/_cache/fanart/original/75978-2.jpg',
          type: 3, // fanart (TVDBImageType.FANART)
          width: 1920,
          height: 1080,
          language: null,
          score: 8.7,
        },
      ]);

      const assetRequest = {
        providerId: 'tvdb' as const,
        providerResultId: '75978',
        entityType: 'series' as const,
        assetTypes: ['poster' as const, 'fanart' as const],
      };

      const results = await provider.getAssets(assetRequest);

      expect(mockGetSeriesArtwork).toHaveBeenCalledWith(75978);
      expect(results.length).toBeGreaterThan(0);

      const posterAssets = results.filter(r => r.assetType === 'poster');
      const fanartAssets = results.filter(r => r.assetType === 'fanart');

      expect(posterAssets.length).toBeGreaterThan(0);
      expect(fanartAssets.length).toBeGreaterThan(0);
    });

    it('should return empty array for unsupported entity types', async () => {
      const assetRequest = {
        providerId: 'tvdb' as const,
        providerResultId: '123',
        entityType: 'movie' as const,
        assetTypes: ['poster' as const],
      };

      const results = await provider.getAssets(assetRequest);

      expect(mockGetSeriesArtwork).not.toHaveBeenCalled();
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
