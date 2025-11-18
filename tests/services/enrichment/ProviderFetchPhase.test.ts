/**
 * Provider Fetch Phase Tests
 *
 * Validates provider data fetching, metadata copying, and field locking behavior
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ProviderFetchPhase } from '../../../src/services/enrichment/phases/ProviderFetchPhase.js';
import { EnrichmentConfig } from '../../../src/services/enrichment/types.js';
import { ResourceNotFoundError } from '../../../src/errors/index.js';

// Mock dependencies
const mockDb = {
  prepare: jest.fn(),
  exec: jest.fn(),
  transaction: jest.fn(),
} as any;

const mockDbManager = {
  getConnection: jest.fn(() => mockDb),
} as any;

const mockProviderCacheOrchestrator = {
  getMovieData: jest.fn(),
} as any;

const mockProviderAssetsRepo = {
  insertProviderAssets: jest.fn(),
} as any;

describe('ProviderFetchPhase', () => {
  let phase: ProviderFetchPhase;
  let mockGet: jest.Mock;
  let mockRun: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    mockGet = jest.fn();
    mockRun = jest.fn();

    mockDb.prepare.mockReturnValue({
      get: mockGet,
      run: mockRun,
      all: jest.fn(() => []),
    });

    phase = new ProviderFetchPhase(mockDb, mockDbManager);

    // Inject mocks
    (phase as any).providerCacheOrchestrator = mockProviderCacheOrchestrator;
    (phase as any).providerAssetsRepo = mockProviderAssetsRepo;
  });

  describe('Entity Type Support', () => {
    it('should only process movies (not TV or music)', async () => {
      const config: EnrichmentConfig = {
        entityId: 1,
        entityType: 'show' as any,
        manual: false,
        forceRefresh: false,
      };

      const result = await phase.execute(config);

      expect(result.assetsFetched).toBe(0);
      expect(mockProviderCacheOrchestrator.getMovieData).not.toHaveBeenCalled();
    });

    it('should process movies', async () => {
      mockGet.mockReturnValueOnce({
        id: 1,
        tmdb_id: 550,
        monitored: 1,
        title: 'Fight Club',
      });

      mockProviderCacheOrchestrator.getMovieData.mockResolvedValueOnce({
        data: {
          title: 'Fight Club',
          overview: 'A ticking-time-bomb insomniac...',
          tmdb_id: 550,
          posters: [],
          backdrops: [],
          logos: [],
        },
        cached: false,
      });

      const config: EnrichmentConfig = {
        entityId: 1,
        entityType: 'movie',
        manual: false,
        forceRefresh: false,
      };

      const result = await phase.execute(config);

      expect(mockProviderCacheOrchestrator.getMovieData).toHaveBeenCalled();
    });
  });

  describe('Entity Existence', () => {
    it('should throw ResourceNotFoundError if entity does not exist', async () => {
      mockGet.mockReturnValueOnce(undefined);

      const config: EnrichmentConfig = {
        entityId: 999,
        entityType: 'movie',
        manual: false,
        forceRefresh: false,
      };

      await expect(phase.execute(config)).rejects.toThrow(ResourceNotFoundError);
    });

    it('should fetch existing entity by ID', async () => {
      const mockMovie = {
        id: 1,
        tmdb_id: 550,
        imdb_id: 'tt0137523',
        monitored: 1,
        title: 'Fight Club',
      };

      mockGet.mockReturnValueOnce(mockMovie);
      mockProviderCacheOrchestrator.getMovieData.mockResolvedValueOnce({
        data: { title: 'Fight Club', tmdb_id: 550, posters: [] },
        cached: false,
      });

      const config: EnrichmentConfig = {
        entityId: 1,
        entityType: 'movie',
        manual: false,
        forceRefresh: false,
      };

      await phase.execute(config);

      expect(mockGet).toHaveBeenCalled();
    });
  });

  describe('Monitored Status', () => {
    it('should skip unmonitored entities for automated jobs', async () => {
      mockGet.mockReturnValueOnce({
        id: 1,
        tmdb_id: 550,
        monitored: 0, // Not monitored
        title: 'Fight Club',
      });

      const config: EnrichmentConfig = {
        entityId: 1,
        entityType: 'movie',
        manual: false, // Automated job
        forceRefresh: false,
      };

      const result = await phase.execute(config);

      expect(result.assetsFetched).toBe(0);
      expect(mockProviderCacheOrchestrator.getMovieData).not.toHaveBeenCalled();
    });

    it('should process unmonitored entities for manual jobs', async () => {
      mockGet.mockReturnValueOnce({
        id: 1,
        tmdb_id: 550,
        monitored: 0, // Not monitored
        title: 'Fight Club',
      });

      mockProviderCacheOrchestrator.getMovieData.mockResolvedValueOnce({
        data: {
          title: 'Fight Club',
          tmdb_id: 550,
          posters: [],
          backdrops: [],
        },
        cached: false,
      });

      const config: EnrichmentConfig = {
        entityId: 1,
        entityType: 'movie',
        manual: true, // Manual job
        forceRefresh: false,
      };

      const result = await phase.execute(config);

      expect(mockProviderCacheOrchestrator.getMovieData).toHaveBeenCalled();
    });
  });

  describe('Provider Cache Orchestration', () => {
    it('should pass forceRefresh flag to provider cache', async () => {
      mockGet.mockReturnValueOnce({
        id: 1,
        tmdb_id: 550,
        monitored: 1,
        title: 'Fight Club',
      });

      mockProviderCacheOrchestrator.getMovieData.mockResolvedValueOnce({
        data: { title: 'Fight Club', tmdb_id: 550, posters: [] },
        cached: false,
      });

      const config: EnrichmentConfig = {
        entityId: 1,
        entityType: 'movie',
        manual: true,
        forceRefresh: true,
      };

      await phase.execute(config);

      expect(mockProviderCacheOrchestrator.getMovieData).toHaveBeenCalledWith(
        expect.objectContaining({ tmdb_id: 550 }),
        expect.objectContaining({ forceRefresh: true })
      );
    });

    it('should include all optional data (images, videos, cast, crew)', async () => {
      mockGet.mockReturnValueOnce({
        id: 1,
        tmdb_id: 550,
        monitored: 1,
      });

      mockProviderCacheOrchestrator.getMovieData.mockResolvedValueOnce({
        data: { title: 'Fight Club', tmdb_id: 550, posters: [] },
        cached: false,
      });

      const config: EnrichmentConfig = {
        entityId: 1,
        entityType: 'movie',
        manual: false,
        forceRefresh: false,
      };

      await phase.execute(config);

      expect(mockProviderCacheOrchestrator.getMovieData).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          includeImages: true,
          includeVideos: true,
          includeCast: true,
          includeCrew: true,
        })
      );
    });

    it('should handle empty provider cache response', async () => {
      mockGet.mockReturnValueOnce({
        id: 1,
        tmdb_id: 550,
        monitored: 1,
      });

      mockProviderCacheOrchestrator.getMovieData.mockResolvedValueOnce({
        data: null,
        cached: false,
      });

      const config: EnrichmentConfig = {
        entityId: 1,
        entityType: 'movie',
        manual: false,
        forceRefresh: false,
      };

      const result = await phase.execute(config);

      expect(result.assetsFetched).toBe(0);
    });
  });

  describe('Lookup Parameters', () => {
    it('should use TMDB ID if available', async () => {
      mockGet.mockReturnValueOnce({
        id: 1,
        tmdb_id: 550,
        imdb_id: null,
        monitored: 1,
      });

      mockProviderCacheOrchestrator.getMovieData.mockResolvedValueOnce({
        data: { title: 'Fight Club', posters: [] },
        cached: false,
      });

      const config: EnrichmentConfig = {
        entityId: 1,
        entityType: 'movie',
        manual: false,
        forceRefresh: false,
      };

      await phase.execute(config);

      expect(mockProviderCacheOrchestrator.getMovieData).toHaveBeenCalledWith(
        { tmdb_id: 550 },
        expect.any(Object)
      );
    });

    it('should use IMDB ID if available', async () => {
      mockGet.mockReturnValueOnce({
        id: 1,
        tmdb_id: null,
        imdb_id: 'tt0137523',
        monitored: 1,
      });

      mockProviderCacheOrchestrator.getMovieData.mockResolvedValueOnce({
        data: { title: 'Fight Club', posters: [] },
        cached: false,
      });

      const config: EnrichmentConfig = {
        entityId: 1,
        entityType: 'movie',
        manual: false,
        forceRefresh: false,
      };

      await phase.execute(config);

      expect(mockProviderCacheOrchestrator.getMovieData).toHaveBeenCalledWith(
        { imdb_id: 'tt0137523' },
        expect.any(Object)
      );
    });

    it('should use both TMDB and IMDB IDs if available', async () => {
      mockGet.mockReturnValueOnce({
        id: 1,
        tmdb_id: 550,
        imdb_id: 'tt0137523',
        tvdb_id: null,
        monitored: 1,
      });

      mockProviderCacheOrchestrator.getMovieData.mockResolvedValueOnce({
        data: { title: 'Fight Club', posters: [] },
        cached: false,
      });

      const config: EnrichmentConfig = {
        entityId: 1,
        entityType: 'movie',
        manual: false,
        forceRefresh: false,
      };

      await phase.execute(config);

      expect(mockProviderCacheOrchestrator.getMovieData).toHaveBeenCalledWith(
        { tmdb_id: 550, imdb_id: 'tt0137523' },
        expect.any(Object)
      );
    });
  });

  describe('Asset Counting', () => {
    it('should count all asset types from provider response', async () => {
      mockGet.mockReturnValueOnce({
        id: 1,
        tmdb_id: 550,
        monitored: 1,
      });

      mockProviderCacheOrchestrator.getMovieData.mockResolvedValueOnce({
        data: {
          title: 'Fight Club',
          tmdb_id: 550,
          posters: [
            { url: 'http://example.com/poster1.jpg', provider: 'tmdb' },
            { url: 'http://example.com/poster2.jpg', provider: 'tmdb' },
          ],
          backdrops: [
            { url: 'http://example.com/backdrop1.jpg', provider: 'tmdb' },
          ],
          logos: [
            { url: 'http://example.com/logo1.png', provider: 'fanart' },
          ],
        },
        cached: false,
      });

      mockProviderAssetsRepo.insertProviderAssets.mockResolvedValueOnce(undefined);

      const config: EnrichmentConfig = {
        entityId: 1,
        entityType: 'movie',
        manual: false,
        forceRefresh: false,
      };

      const result = await phase.execute(config);

      // 2 posters + 1 backdrop + 1 logo = 4 assets
      expect(result.assetsFetched).toBe(4);
    });

    it('should return 0 for entities with no assets', async () => {
      mockGet.mockReturnValueOnce({
        id: 1,
        tmdb_id: 550,
        monitored: 1,
      });

      mockProviderCacheOrchestrator.getMovieData.mockResolvedValueOnce({
        data: {
          title: 'Fight Club',
          tmdb_id: 550,
          posters: [],
          backdrops: [],
          logos: [],
        },
        cached: false,
      });

      const config: EnrichmentConfig = {
        entityId: 1,
        entityType: 'movie',
        manual: false,
        forceRefresh: false,
      };

      const result = await phase.execute(config);

      expect(result.assetsFetched).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should propagate provider cache errors', async () => {
      mockGet.mockReturnValueOnce({
        id: 1,
        tmdb_id: 550,
        monitored: 1,
      });

      const cacheError = new Error('Provider unavailable');
      mockProviderCacheOrchestrator.getMovieData.mockRejectedValueOnce(cacheError);

      const config: EnrichmentConfig = {
        entityId: 1,
        entityType: 'movie',
        manual: false,
        forceRefresh: false,
      };

      await expect(phase.execute(config)).rejects.toThrow('Provider unavailable');
    });

    it('should handle database errors gracefully', async () => {
      const dbError = new Error('Database connection lost');
      mockGet.mockImplementationOnce(() => {
        throw dbError;
      });

      const config: EnrichmentConfig = {
        entityId: 1,
        entityType: 'movie',
        manual: false,
        forceRefresh: false,
      };

      await expect(phase.execute(config)).rejects.toThrow('Database connection lost');
    });
  });
});
