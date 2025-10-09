/**
 * IMDb Provider Tests
 */

import { jest } from '@jest/globals';
import { IMDbProvider } from '../../src/services/providers/imdb/IMDbProvider.js';
import { IMDbClient } from '../../src/services/providers/imdb/IMDbClient.js';
import { createMockProviderConfig } from './helpers.js';

const mockSearch = jest.fn<() => Promise<any>>();
const mockGetMovieDetails = jest.fn<() => Promise<any>>();

jest.spyOn(IMDbClient.prototype, 'search').mockImplementation(mockSearch as any);
jest.spyOn(IMDbClient.prototype, 'getMovieDetails').mockImplementation(mockGetMovieDetails as any);

describe('IMDbProvider', () => {
  let provider: IMDbProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    const config = createMockProviderConfig('imdb');
    provider = new IMDbProvider(config);
  });

  describe('Capabilities', () => {
    it('should have correct provider ID', () => {
      expect(provider.getCapabilities().id).toBe('imdb');
    });

    it('should be metadata-only provider', () => {
      expect(provider.getCapabilities().category).toBe('metadata');
    });

    it('should support movie, series, and episode', () => {
      const capabilities = provider.getCapabilities();
      expect(capabilities.supportedEntityTypes).toContain('movie');
      expect(capabilities.supportedEntityTypes).toContain('series');
      expect(capabilities.supportedEntityTypes).toContain('episode');
    });

    it('should have conservative rate limit', () => {
      expect(provider.getCapabilities().rateLimit.requestsPerSecond).toBe(1);
    });
  });

  describe('Search', () => {
    it('should search for titles', async () => {
      mockSearch.mockResolvedValue([
        { imdbId: 'tt0133093', title: 'The Matrix', year: 1999, type: 'movie' },
      ]);

      const results = await provider.search({ query: 'The Matrix', entityType: 'movie' });

      expect(results).toHaveLength(1);
      expect(results[0].providerResultId).toBe('tt0133093');
    });
  });

  describe('Metadata', () => {
    it('should retrieve title metadata', async () => {
      mockGetMovieDetails.mockResolvedValue({
        imdbId: 'tt0133093',
        title: 'The Matrix',
        plot: 'A computer hacker learns about reality.',
        rating: 8.7,
        voteCount: 1900000,
        genres: ['Action', 'Sci-Fi'],
        releaseDate: '1999-03-31',
      });

      const result = await provider.getMetadata({
        providerId: 'imdb',
        providerResultId: 'tt0133093',
        entityType: 'movie',
      });

      expect(result.fields.title).toBe('The Matrix');
      expect(result.fields.ratings).toBeDefined();
    });
  });

  describe('Assets', () => {
    it('should return empty array as IMDb does not provide assets', async () => {
      const results = await provider.getAssets({
        providerId: 'imdb',
        providerResultId: 'tt0133093',
        entityType: 'movie',
        assetTypes: ['poster'],
      });

      expect(results).toEqual([]);
    });
  });

  describe('Connection Test', () => {
    it('should return success', async () => {
      const result = await provider.testConnection();
      expect(result.success).toBe(true);
    });
  });
});
