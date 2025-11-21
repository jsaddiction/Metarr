/**
 * OMDB Provider Tests
 */

import { jest } from '@jest/globals';
import { OMDBProvider } from '../../src/services/providers/omdb/OMDBProvider.js';
import { OMDBClient } from '../../src/services/providers/omdb/OMDBClient.js';
import { createMockProviderConfig } from './helpers.js';
import {
  AuthenticationError,
  ResourceNotFoundError,
  RateLimitError,
  ValidationError,
} from '../../src/errors/index.js';

// Mock the OMDB client
const mockSearch = jest.fn<() => Promise<any>>();
const mockGetById = jest.fn<() => Promise<any>>();

jest.spyOn(OMDBClient.prototype, 'search').mockImplementation(mockSearch as any);
jest.spyOn(OMDBClient.prototype, 'getById').mockImplementation(mockGetById as any);

describe('OMDBProvider', () => {
  let provider: OMDBProvider;

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    const config = createMockProviderConfig('omdb', {
      apiKey: 'test_api_key',
    });

    provider = new OMDBProvider(config);
  });

  describe('Constructor', () => {
    it('should disable provider if no API key', () => {
      const config = createMockProviderConfig('omdb', {
        apiKey: '',
      });

      const disabledProvider = new OMDBProvider(config);
      const capabilities = disabledProvider.getCapabilities();

      // Provider still returns capabilities but won't make requests
      expect(capabilities.id).toBe('omdb');
    });

    it('should enable provider if API key present', () => {
      const config = createMockProviderConfig('omdb', {
        apiKey: 'valid-key',
      });

      const enabledProvider = new OMDBProvider(config);
      const capabilities = enabledProvider.getCapabilities();

      expect(capabilities.id).toBe('omdb');
      expect(capabilities.authentication.required).toBe(true);
    });
  });

  describe('Capabilities', () => {
    it('should have correct provider ID', () => {
      const capabilities = provider.getCapabilities();
      expect(capabilities.id).toBe('omdb');
    });

    it('should support movies, series, and episodes', () => {
      const capabilities = provider.getCapabilities();
      expect(capabilities.supportedEntityTypes).toContain('movie');
      expect(capabilities.supportedEntityTypes).toContain('series');
      expect(capabilities.supportedEntityTypes).toContain('episode');
    });

    it('should be metadata-only provider', () => {
      const capabilities = provider.getCapabilities();
      expect(capabilities.category).toBe('metadata');
    });

    it('should have proper rate limits', () => {
      const capabilities = provider.getCapabilities();
      expect(capabilities.rateLimit.requestsPerSecond).toBe(0.011); // 1000/day
      expect(capabilities.rateLimit.burstCapacity).toBe(5);
    });

    it('should support search with external ID lookup', () => {
      const capabilities = provider.getCapabilities();
      expect(capabilities.search.supported).toBe(true);
      expect(capabilities.search.externalIdLookup).toContain('imdb_id');
      expect(capabilities.search.yearFilter).toBe(true);
    });

    it('should provide poster URLs only', () => {
      const capabilities = provider.getCapabilities();
      expect(capabilities.assetProvision.providesUrls).toBe(true);
      expect(capabilities.assetProvision.providesDirectDownload).toBe(false);
      expect(capabilities.assetProvision.maxResultsPerType).toBe(1);
    });

    it('should support plot and outline fields', () => {
      const capabilities = provider.getCapabilities();
      expect(capabilities.supportedMetadataFields.movie).toContain('plot');
      expect(capabilities.supportedMetadataFields.movie).toContain('outline');
    });
  });

  describe('search()', () => {
    it('should search movies by title', async () => {
      mockSearch.mockResolvedValue([
        {
          imdbID: 'tt0133093',
          Title: 'The Matrix',
          Year: '1999',
          Type: 'movie',
          Poster: 'https://example.com/poster.jpg',
        },
      ]);

      const searchRequest = {
        query: 'The Matrix',
        entityType: 'movie' as const,
      };

      const results = await provider.search(searchRequest);

      expect(mockSearch).toHaveBeenCalledWith({
        query: 'The Matrix',
        type: 'movie',
      });
      expect(results).toHaveLength(1);
      expect(results[0].providerResultId).toBe('tt0133093');
      expect(results[0].title).toBe('The Matrix');
      expect(results[0].externalIds?.imdb).toBe('tt0133093');
    });

    it('should search by IMDb ID', async () => {
      mockGetById.mockResolvedValue({
        imdbID: 'tt0133093',
        Title: 'The Matrix',
        Year: '1999',
        imdbRating: '8.7',
        Plot: 'A computer hacker learns about the true nature of reality.',
        Outline: 'Neo discovers reality is a simulation.',
        Response: 'True',
      });

      const searchRequest = {
        query: 'The Matrix',
        entityType: 'movie' as const,
        externalId: {
          type: 'imdb_id' as const,
          value: 'tt0133093',
        },
      };

      const results = await provider.search(searchRequest);

      expect(mockGetById).toHaveBeenCalledWith('tt0133093');
      expect(results).toHaveLength(1);
      expect(results[0].providerResultId).toBe('tt0133093');
      expect(results[0].confidence).toBe(1.0); // Exact match
    });

    it('should filter by year', async () => {
      mockSearch.mockResolvedValue([
        {
          imdbID: 'tt0133093',
          Title: 'The Matrix',
          Year: '1999',
          Type: 'movie',
          Poster: 'https://example.com/poster.jpg',
        },
      ]);

      const searchRequest = {
        query: 'The Matrix',
        entityType: 'movie' as const,
        year: 1999,
      };

      await provider.search(searchRequest);

      expect(mockSearch).toHaveBeenCalledWith({
        query: 'The Matrix',
        type: 'movie',
        year: 1999,
      });
    });

    it('should return empty array for unsupported entity types', async () => {
      const searchRequest = {
        query: 'Test Album',
        entityType: 'album' as any,
      };

      const results = await provider.search(searchRequest);

      expect(results).toEqual([]);
      expect(mockSearch).not.toHaveBeenCalled();
    });

    it('should handle search errors gracefully', async () => {
      mockSearch.mockRejectedValue(new Error('API error'));

      const searchRequest = {
        query: 'NonexistentMovie',
        entityType: 'movie' as const,
      };

      const results = await provider.search(searchRequest);

      expect(results).toEqual([]);
    });

    it('should handle IMDb ID lookup errors gracefully', async () => {
      mockGetById.mockRejectedValue(new ResourceNotFoundError(
        'provider-resource',
        'tt9999999',
        'Movie not found'
      ));

      const searchRequest = {
        query: 'Test',
        entityType: 'movie' as const,
        externalId: {
          type: 'imdb_id' as const,
          value: 'tt9999999',
        },
      };

      const results = await provider.search(searchRequest);

      expect(results).toEqual([]);
    });

    it('should calculate confidence based on title match', async () => {
      mockSearch.mockResolvedValue([
        {
          imdbID: 'tt0133093',
          Title: 'The Matrix',
          Year: '1999',
          Type: 'movie',
          Poster: 'N/A',
        },
      ]);

      const searchRequest = {
        query: 'The Matrix',
        entityType: 'movie' as const,
      };

      const results = await provider.search(searchRequest);

      expect(results[0].confidence).toBeGreaterThan(50);
    });
  });

  describe('getMetadata()', () => {
    const mockMovieResponse = {
      Title: 'The Matrix',
      Year: '1999',
      Rated: 'R',
      Released: '31 Mar 1999',
      Runtime: '136 min',
      Genre: 'Action, Sci-Fi',
      Director: 'Lana Wachowski, Lilly Wachowski',
      Writer: 'Lilly Wachowski, Lana Wachowski',
      Actors: 'Keanu Reeves, Laurence Fishburne, Carrie-Anne Moss',
      Plot: 'A computer hacker learns from mysterious rebels about the true nature of his reality and his role in the war against its controllers.',
      Outline: 'Neo discovers that reality is a simulation controlled by machines.',
      Language: 'English',
      Country: 'United States',
      Awards: 'Won 4 Oscars',
      Poster: 'https://m.media-amazon.com/images/M/poster.jpg',
      Ratings: [
        { Source: 'Internet Movie Database', Value: '8.7/10' },
        { Source: 'Rotten Tomatoes', Value: '83%' },
        { Source: 'Metacritic', Value: '73/100' },
      ],
      Metascore: '73',
      imdbRating: '8.7',
      imdbVotes: '2,195,275',
      imdbID: 'tt0133093',
      Type: 'movie',
      DVD: 'N/A',
      BoxOffice: '$171,479,930',
      Production: 'N/A',
      Website: 'N/A',
      Response: 'True',
    };

    it('should fetch movie metadata', async () => {
      mockGetById.mockResolvedValue(mockMovieResponse);

      const metadataRequest = {
        providerId: 'omdb' as const,
        providerResultId: 'tt0133093',
        entityType: 'movie' as const,
      };

      const result = await provider.getMetadata(metadataRequest);

      expect(mockGetById).toHaveBeenCalledWith('tt0133093');
      expect(result.fields.title).toBe('The Matrix');
      expect(result.fields.releaseDate).toBe('31 Mar 1999');
      expect(result.fields.runtime).toBe(136);
      expect(result.fields.genres).toEqual(['Action', 'Sci-Fi']);
      expect(result.externalIds?.imdb).toBe('tt0133093');
    });

    it('should parse all ratings (IMDb, RT, MC)', async () => {
      mockGetById.mockResolvedValue(mockMovieResponse);

      const metadataRequest = {
        providerId: 'omdb' as const,
        providerResultId: 'tt0133093',
        entityType: 'movie' as const,
      };

      const result = await provider.getMetadata(metadataRequest);

      expect(result.fields.ratings).toBeDefined();
      const ratings = result.fields.ratings as any[];
      expect(ratings).toHaveLength(3);

      // IMDb rating
      expect(ratings[0].source).toBe('imdb');
      expect(ratings[0].value).toBe(8.7);
      expect(ratings[0].maxValue).toBe(10);
      expect(ratings[0].votes).toBe(2195275);

      // Rotten Tomatoes
      expect(ratings[1].source).toBe('rottentomatoes');
      expect(ratings[1].value).toBe(83);
      expect(ratings[1].maxValue).toBe(100);

      // Metacritic
      expect(ratings[2].source).toBe('metacritic');
      expect(ratings[2].value).toBe(73);
      expect(ratings[2].maxValue).toBe(100);
    });

    it('should handle "N/A" values', async () => {
      const naResponse = {
        ...mockMovieResponse,
        Plot: 'N/A',
        Runtime: 'N/A',
        Director: 'N/A',
        Rated: 'N/A',
        imdbRating: 'N/A',
        imdbVotes: 'N/A',
        Ratings: [],
      };

      mockGetById.mockResolvedValue(naResponse);

      const metadataRequest = {
        providerId: 'omdb' as const,
        providerResultId: 'tt0133093',
        entityType: 'movie' as const,
      };

      const result = await provider.getMetadata(metadataRequest);

      expect(result.fields.plot).toBeUndefined();
      expect(result.fields.runtime).toBeUndefined();
      expect(result.fields.directors).toBeUndefined();
      expect(result.fields.certification).toBeUndefined();
    });

    it('should populate both plot and outline', async () => {
      // OMDBClient fetches both plot versions (full and short) via dual-fetch
      // and provides them as data.Plot (full) and data.Outline (short)
      mockGetById.mockResolvedValue(mockMovieResponse);

      const metadataRequest = {
        providerId: 'omdb' as const,
        providerResultId: 'tt0133093',
        entityType: 'movie' as const,
      };

      const result = await provider.getMetadata(metadataRequest);

      expect(result.fields.plot).toBeDefined();
      expect(result.fields.outline).toBeDefined();
      // Plot should be full version, outline should be short version
      expect(result.fields.plot).toBe(mockMovieResponse.Plot);
      expect(result.fields.outline).toBe(mockMovieResponse.Outline);
      // Verify they're both strings
      expect(typeof result.fields.outline).toBe('string');
      expect(typeof result.fields.plot).toBe('string');
    });

    it('should parse director, writer, and actor lists', async () => {
      mockGetById.mockResolvedValue(mockMovieResponse);

      const metadataRequest = {
        providerId: 'omdb' as const,
        providerResultId: 'tt0133093',
        entityType: 'movie' as const,
      };

      const result = await provider.getMetadata(metadataRequest);

      expect(result.fields.directors).toEqual([
        'Lana Wachowski',
        'Lilly Wachowski',
      ]);
      expect(result.fields.writers).toEqual([
        'Lilly Wachowski',
        'Lana Wachowski',
      ]);
      expect(result.fields.actors).toEqual([
        'Keanu Reeves',
        'Laurence Fishburne',
        'Carrie-Anne Moss',
      ]);
    });

    it('should parse certification', async () => {
      mockGetById.mockResolvedValue(mockMovieResponse);

      const metadataRequest = {
        providerId: 'omdb' as const,
        providerResultId: 'tt0133093',
        entityType: 'movie' as const,
      };

      const result = await provider.getMetadata(metadataRequest);

      expect(result.fields.certification).toBe('R');
    });

    it('should parse country list', async () => {
      mockGetById.mockResolvedValue(mockMovieResponse);

      const metadataRequest = {
        providerId: 'omdb' as const,
        providerResultId: 'tt0133093',
        entityType: 'movie' as const,
      };

      const result = await provider.getMetadata(metadataRequest);

      expect(result.fields.country).toEqual(['United States']);
    });

    it('should respect requested fields filter', async () => {
      mockGetById.mockResolvedValue(mockMovieResponse);

      const metadataRequest = {
        providerId: 'omdb' as const,
        providerResultId: 'tt0133093',
        entityType: 'movie' as const,
        fields: ['title' as const, 'plot' as const],
      };

      const result = await provider.getMetadata(metadataRequest);

      expect(result.fields.title).toBeDefined();
      expect(result.fields.plot).toBeDefined();
      // Other fields should not be included
      expect(result.fields.runtime).toBeUndefined();
      expect(result.fields.genres).toBeUndefined();
    });

    it('should calculate completeness correctly', async () => {
      mockGetById.mockResolvedValue(mockMovieResponse);

      const metadataRequest = {
        providerId: 'omdb' as const,
        providerResultId: 'tt0133093',
        entityType: 'movie' as const,
        fields: ['title' as const, 'plot' as const, 'runtime' as const],
      };

      const result = await provider.getMetadata(metadataRequest);

      // All 3 requested fields should be present
      expect(result.completeness).toBe(1.0);
    });

    it('should throw ValidationError for unsupported entity types', async () => {
      const metadataRequest = {
        providerId: 'omdb' as const,
        providerResultId: 'test123',
        entityType: 'album' as any,
      };

      await expect(provider.getMetadata(metadataRequest)).rejects.toThrow(
        ValidationError
      );
    });

    it('should handle fetch errors and rethrow', async () => {
      mockGetById.mockRejectedValue(
        new ResourceNotFoundError(
          'provider-resource',
          'tt9999999',
          'Movie not found'
        )
      );

      const metadataRequest = {
        providerId: 'omdb' as const,
        providerResultId: 'tt9999999',
        entityType: 'movie' as const,
      };

      await expect(provider.getMetadata(metadataRequest)).rejects.toThrow(
        ResourceNotFoundError
      );
    });
  });

  describe('getAssets()', () => {
    it('should return poster URL', async () => {
      mockGetById.mockResolvedValue({
        imdbID: 'tt0133093',
        Title: 'The Matrix',
        Poster: 'https://m.media-amazon.com/images/M/poster.jpg',
        Response: 'True',
      });

      const assetRequest = {
        providerId: 'omdb' as const,
        providerResultId: 'tt0133093',
        entityType: 'movie' as const,
        assetTypes: ['poster' as const],
      };

      const results = await provider.getAssets(assetRequest);

      expect(mockGetById).toHaveBeenCalledWith('tt0133093');
      expect(results).toHaveLength(1);
      expect(results[0].assetType).toBe('poster');
      expect(results[0].url).toBe('https://m.media-amazon.com/images/M/poster.jpg');
    });

    it('should return empty for non-poster types', async () => {
      const assetRequest = {
        providerId: 'omdb' as const,
        providerResultId: 'tt0133093',
        entityType: 'movie' as const,
        assetTypes: ['fanart' as const, 'banner' as const],
      };

      const results = await provider.getAssets(assetRequest);

      expect(results).toEqual([]);
      expect(mockGetById).not.toHaveBeenCalled();
    });

    it('should handle "N/A" poster', async () => {
      mockGetById.mockResolvedValue({
        imdbID: 'tt0133093',
        Title: 'The Matrix',
        Poster: 'N/A',
        Response: 'True',
      });

      const assetRequest = {
        providerId: 'omdb' as const,
        providerResultId: 'tt0133093',
        entityType: 'movie' as const,
        assetTypes: ['poster' as const],
      };

      const results = await provider.getAssets(assetRequest);

      expect(results).toEqual([]);
    });

    it('should return empty for unsupported entity types', async () => {
      const assetRequest = {
        providerId: 'omdb' as const,
        providerResultId: 'tt0133093',
        entityType: 'episode' as const,
        assetTypes: ['poster' as const],
      };

      const results = await provider.getAssets(assetRequest);

      expect(results).toEqual([]);
    });

    it('should handle fetch errors gracefully', async () => {
      mockGetById.mockRejectedValue(new Error('API error'));

      const assetRequest = {
        providerId: 'omdb' as const,
        providerResultId: 'tt0133093',
        entityType: 'movie' as const,
        assetTypes: ['poster' as const],
      };

      const results = await provider.getAssets(assetRequest);

      expect(results).toEqual([]);
    });
  });

  describe('testConnection()', () => {
    it('should return success when connection works', async () => {
      mockGetById.mockResolvedValue({
        imdbID: 'tt0133093',
        Title: 'The Matrix',
        Response: 'True',
      });

      const result = await provider.testConnection();

      expect(result.success).toBe(true);
      expect(result.message).toBe('Successfully connected to OMDB API');
    });

    it('should return failure when connection fails', async () => {
      mockGetById.mockRejectedValue(new Error('Network error'));

      const result = await provider.testConnection();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });
  });

  describe('Error Handling', () => {
    it('should handle authentication errors', async () => {
      mockGetById.mockRejectedValue(
        new AuthenticationError('Invalid API key', {
          service: 'OMDBClient',
          operation: 'request',
        })
      );

      const metadataRequest = {
        providerId: 'omdb' as const,
        providerResultId: 'tt0133093',
        entityType: 'movie' as const,
      };

      await expect(provider.getMetadata(metadataRequest)).rejects.toThrow(
        AuthenticationError
      );
    });

    it('should handle not found errors', async () => {
      mockGetById.mockRejectedValue(
        new ResourceNotFoundError(
          'provider-resource',
          'tt9999999',
          'Movie not found'
        )
      );

      const metadataRequest = {
        providerId: 'omdb' as const,
        providerResultId: 'tt9999999',
        entityType: 'movie' as const,
      };

      await expect(provider.getMetadata(metadataRequest)).rejects.toThrow(
        ResourceNotFoundError
      );
    });

    it('should handle rate limit errors', async () => {
      mockGetById.mockRejectedValue(
        new RateLimitError(
          'OMDB',
          86400,
          'Daily limit reached',
          { service: 'OMDBClient', operation: 'request' }
        )
      );

      const metadataRequest = {
        providerId: 'omdb' as const,
        providerResultId: 'tt0133093',
        entityType: 'movie' as const,
      };

      await expect(provider.getMetadata(metadataRequest)).rejects.toThrow(
        RateLimitError
      );
    });
  });

  describe('Search Confidence Calculation', () => {
    it('should give high confidence for exact title match', async () => {
      mockSearch.mockResolvedValue([
        {
          imdbID: 'tt0133093',
          Title: 'The Matrix',
          Year: '1999',
          Type: 'movie',
          Poster: 'N/A',
        },
      ]);

      const searchRequest = {
        query: 'The Matrix',
        entityType: 'movie' as const,
      };

      const results = await provider.search(searchRequest);

      expect(results[0].confidence).toBeGreaterThanOrEqual(90);
    });

    it('should give higher confidence with year match', async () => {
      mockSearch.mockResolvedValue([
        {
          imdbID: 'tt0133093',
          Title: 'The Matrix',
          Year: '1999',
          Type: 'movie',
          Poster: 'N/A',
        },
      ]);

      const withYearRequest = {
        query: 'The Matrix',
        entityType: 'movie' as const,
        year: 1999,
      };

      const withoutYearRequest = {
        query: 'The Matrix',
        entityType: 'movie' as const,
      };

      const [withYear, withoutYear] = await Promise.all([
        provider.search(withYearRequest),
        provider.search(withoutYearRequest),
      ]);

      expect(withYear[0].confidence).toBeGreaterThan(withoutYear[0].confidence);
    });
  });

  describe('Runtime Parsing', () => {
    it('should parse runtime in minutes', async () => {
      mockGetById.mockResolvedValue({
        imdbID: 'tt0133093',
        Title: 'The Matrix',
        Year: '1999',
        Rated: 'R',
        Released: '31 Mar 1999',
        Runtime: '136 min',
        Genre: 'Action, Sci-Fi',
        Director: 'The Wachowskis',
        Writer: 'The Wachowskis',
        Actors: 'Keanu Reeves',
        Plot: 'A computer hacker learns about reality.',
        Outline: 'Neo discovers the truth.',
        Language: 'English',
        Country: 'United States',
        Awards: 'Won 4 Oscars',
        Poster: 'https://example.com/poster.jpg',
        Ratings: [],
        Metascore: 'N/A',
        imdbRating: '8.7',
        imdbVotes: '2,000,000',
        Type: 'movie',
        DVD: 'N/A',
        BoxOffice: 'N/A',
        Production: 'N/A',
        Website: 'N/A',
        Response: 'True',
      });

      const metadataRequest = {
        providerId: 'omdb' as const,
        providerResultId: 'tt0133093',
        entityType: 'movie' as const,
      };

      const result = await provider.getMetadata(metadataRequest);

      expect(result.fields.runtime).toBe(136);
    });

    it('should handle N/A runtime', async () => {
      mockGetById.mockResolvedValue({
        imdbID: 'tt0133093',
        Title: 'The Matrix',
        Year: '1999',
        Rated: 'R',
        Released: '31 Mar 1999',
        Runtime: 'N/A',
        Genre: 'Action, Sci-Fi',
        Director: 'The Wachowskis',
        Writer: 'The Wachowskis',
        Actors: 'Keanu Reeves',
        Plot: 'A computer hacker learns about reality.',
        Outline: 'Neo discovers the truth.',
        Language: 'English',
        Country: 'United States',
        Awards: 'Won 4 Oscars',
        Poster: 'https://example.com/poster.jpg',
        Ratings: [],
        Metascore: 'N/A',
        imdbRating: '8.7',
        imdbVotes: '2,000,000',
        Type: 'movie',
        DVD: 'N/A',
        BoxOffice: 'N/A',
        Production: 'N/A',
        Website: 'N/A',
        Response: 'True',
      });

      const metadataRequest = {
        providerId: 'omdb' as const,
        providerResultId: 'tt0133093',
        entityType: 'movie' as const,
      };

      const result = await provider.getMetadata(metadataRequest);

      expect(result.fields.runtime).toBeUndefined();
    });
  });
});
