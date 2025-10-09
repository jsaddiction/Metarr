/**
 * TMDB Provider Tests
 */

import { jest } from '@jest/globals';
import { TMDBProvider } from '../../src/services/providers/tmdb/TMDBProvider.js';
import { TMDBClient } from '../../src/services/providers/tmdb/TMDBClient.js';
import { createMockProviderConfig } from './helpers.js';

// Mock the TMDB client
const mockSearchMovies = jest.fn<() => Promise<any>>();
const mockGetMovie = jest.fn<() => Promise<any>>();
const mockGetMovieImages = jest.fn<() => Promise<any>>();
const mockGetConfiguration = jest.fn<() => Promise<any>>();

jest.spyOn(TMDBClient.prototype, 'searchMovies').mockImplementation(mockSearchMovies as any);
jest.spyOn(TMDBClient.prototype, 'getMovie').mockImplementation(mockGetMovie as any);
jest.spyOn(TMDBClient.prototype, 'getMovieImages').mockImplementation(mockGetMovieImages as any);
jest.spyOn(TMDBClient.prototype, 'getConfiguration').mockImplementation(mockGetConfiguration as any);

describe('TMDBProvider', () => {
  let provider: TMDBProvider;

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    // Mock the configuration endpoint (called during provider init)
    mockGetConfiguration.mockResolvedValue({
      images: {
        base_url: 'https://image.tmdb.org/t/p/',
        secure_base_url: 'https://image.tmdb.org/t/p/',
        poster_sizes: ['w185', 'w342', 'w500', 'w780', 'original'],
        backdrop_sizes: ['w300', 'w780', 'w1280', 'original'],
      },
    });

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
    it('should search for movies', async () => {
      mockSearchMovies.mockResolvedValue({
        results: [
          {
            id: 603,
            title: 'The Matrix',
            release_date: '1999-03-30',
            vote_average: 8.7,
          },
        ],
      });

      const searchRequest = {
        query: 'The Matrix',
        entityType: 'movie' as const,
      };

      const results = await provider.search(searchRequest);

      expect(mockSearchMovies).toHaveBeenCalledWith({ page: 1, query: 'The Matrix' });
      expect(results).toHaveLength(1);
      expect(results[0].providerResultId).toBe('603');
      expect(results[0].title).toBe('The Matrix');
    });
  });

  describe('Metadata', () => {
    it('should retrieve movie metadata', async () => {
      mockGetMovie.mockResolvedValue({
        id: 603,
        title: 'The Matrix',
        original_title: 'The Matrix',
        overview: 'A computer hacker learns about the true nature of reality.',
        release_date: '1999-03-30',
        runtime: 136,
        vote_average: 8.7,
        genres: [{ id: 28, name: 'Action' }, { id: 878, name: 'Science Fiction' }],
        imdb_id: 'tt0133093',
      });

      const metadataRequest = {
        providerId: 'tmdb' as const,
        providerResultId: '603',
        entityType: 'movie' as const,
      };

      const result = await provider.getMetadata(metadataRequest);

      expect(mockGetMovie).toHaveBeenCalledWith(603, {
        appendToResponse: ['credits', 'external_ids', 'release_dates'],
      });
      expect(result.fields.title).toBe('The Matrix');
      expect(result.fields.plot).toBe('A computer hacker learns about the true nature of reality.');
      expect(result.fields.releaseDate).toBe('1999-03-30');
      expect(result.fields.runtime).toBe(136);
      expect(result.fields.genres).toEqual(['Action', 'Science Fiction']);
    });
  });

  describe('Assets', () => {
    it('should retrieve movie assets', async () => {
      mockGetMovieImages.mockResolvedValue({
        posters: [
          {
            file_path: '/path/to/poster.jpg',
            width: 2000,
            height: 3000,
            vote_average: 8.5,
            vote_count: 10,
            iso_639_1: 'en',
          },
        ],
        backdrops: [
          {
            file_path: '/path/to/fanart.jpg',
            width: 3840,
            height: 2160,
            vote_average: 9.0,
            vote_count: 20,
            iso_639_1: null,
          },
        ],
      });

      const assetRequest = {
        providerId: 'tmdb' as const,
        providerResultId: '603',
        entityType: 'movie' as const,
        assetTypes: ['poster' as const, 'fanart' as const],
      };

      const results = await provider.getAssets(assetRequest);

      expect(mockGetMovieImages).toHaveBeenCalledWith(603);
      expect(results.length).toBeGreaterThan(0);

      const posterAssets = results.filter(r => r.assetType === 'poster');
      const fanartAssets = results.filter(r => r.assetType === 'fanart');

      expect(posterAssets.length).toBeGreaterThan(0);
      expect(fanartAssets.length).toBeGreaterThan(0);
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
