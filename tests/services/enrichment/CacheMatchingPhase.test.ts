/**
 * Cache Matching Phase Tests
 *
 * Validates cache file matching to provider assets via perceptual hash similarity
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { CacheMatchingPhase } from '../../../src/services/enrichment/phases/CacheMatchingPhase.js';
import { EnrichmentConfig } from '../../../src/services/enrichment/types.js';

// Mock dependencies
const mockDb = {
  prepare: jest.fn(),
  query: jest.fn(),
  exec: jest.fn(),
} as any;

const mockImageProcessor = {
  analyzeImage: jest.fn(),
} as any;

const mockProviderAssetsRepo = {
  findByAssetType: jest.fn(),
  markAsDownloaded: jest.fn(),
} as any;

describe('CacheMatchingPhase', () => {
  let phase: CacheMatchingPhase;
  let mockRun: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRun = jest.fn();

    mockDb.prepare.mockReturnValue({
      run: mockRun,
      get: jest.fn(),
      all: jest.fn(() => []),
    });

    phase = new CacheMatchingPhase(mockDb);

    // Inject mocks
    (phase as any).imageProcessor = mockImageProcessor;
    (phase as any).providerAssetsRepo = mockProviderAssetsRepo;
  });

  describe('Cache File Discovery', () => {
    it('should query cache files for entity', async () => {
      mockDb.query.mockResolvedValueOnce([]);

      const config: EnrichmentConfig = {
        entityId: 1,
        entityType: 'movie',
        manual: false,
        forceRefresh: false,
      };

      await phase.execute(config);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM cache_image_files'),
        ['movie', 1]
      );
    });

    it('should return 0 for entities with no cache files', async () => {
      mockDb.query.mockResolvedValueOnce([]);

      const config: EnrichmentConfig = {
        entityId: 1,
        entityType: 'movie',
        manual: false,
        forceRefresh: false,
      };

      const result = await phase.execute(config);

      expect(result.assetsMatched).toBe(0);
    });

    it('should only process cache files with file_path', async () => {
      mockDb.query.mockResolvedValueOnce([
        {
          id: 1,
          file_path: '/cache/ab/cd/abcdef123.jpg',
          image_type: 'poster',
          perceptual_hash: 'abc123',
        },
      ]);

      const config: EnrichmentConfig = {
        entityId: 1,
        entityType: 'movie',
        manual: false,
        forceRefresh: false,
      };

      await phase.execute(config);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('file_path IS NOT NULL'),
        expect.any(Array)
      );
    });
  });

  describe('Perceptual Hash Requirements', () => {
    it('should skip cache files without perceptual hash', async () => {
      mockDb.query.mockResolvedValueOnce([
        {
          id: 1,
          file_path: '/cache/ab/cd/abcdef123.jpg',
          image_type: 'poster',
          perceptual_hash: null, // Missing
          difference_hash: null,
        },
      ]);

      mockProviderAssetsRepo.findByAssetType.mockResolvedValueOnce([]);

      const config: EnrichmentConfig = {
        entityId: 1,
        entityType: 'movie',
        manual: false,
        forceRefresh: false,
      };

      const result = await phase.execute(config);

      expect(result.assetsMatched).toBe(0);
      // Should not attempt to match
      expect(mockProviderAssetsRepo.findByAssetType).not.toHaveBeenCalled();
    });

    it('should process cache files with perceptual hash', async () => {
      mockDb.query.mockResolvedValueOnce([
        {
          id: 1,
          file_path: '/cache/ab/cd/abcdef123.jpg',
          image_type: 'poster',
          perceptual_hash: 'abc123def456',
          difference_hash: 'def789',
          has_alpha: 0,
        },
      ]);

      mockProviderAssetsRepo.findByAssetType.mockResolvedValueOnce([
        {
          id: 10,
          asset_type: 'poster',
          perceptual_hash: 'abc123def456', // Exact match
          provider_name: 'tmdb',
        },
      ]);

      const config: EnrichmentConfig = {
        entityId: 1,
        entityType: 'movie',
        manual: false,
        forceRefresh: false,
      };

      const result = await phase.execute(config);

      expect(result.assetsMatched).toBeGreaterThan(0);
    });
  });

  describe('Metadata Backfilling', () => {
    it('should backfill missing difference_hash', async () => {
      const cacheFile = {
        id: 1,
        file_path: '/cache/ab/cd/abcdef123.jpg',
        image_type: 'poster',
        perceptual_hash: 'abc123',
        difference_hash: null, // Missing
        has_alpha: 0,
      };

      mockDb.query.mockResolvedValueOnce([cacheFile]);
      mockProviderAssetsRepo.findByAssetType.mockResolvedValueOnce([]);

      mockImageProcessor.analyzeImage.mockResolvedValueOnce({
        perceptual_hash: 'abc123',
        difference_hash: 'newdiff123',
        has_alpha: false,
        foreground_ratio: 0.85,
      });

      const config: EnrichmentConfig = {
        entityId: 1,
        entityType: 'movie',
        manual: false,
        forceRefresh: false,
      };

      await phase.execute(config);

      expect(mockImageProcessor.analyzeImage).toHaveBeenCalledWith(cacheFile.file_path);
      expect(mockRun).toHaveBeenCalledWith(
        expect.objectContaining({
          difference_hash: 'newdiff123',
        })
      );
    });

    it('should backfill missing has_alpha', async () => {
      const cacheFile = {
        id: 1,
        file_path: '/cache/ab/cd/abcdef123.png',
        image_type: 'logo',
        perceptual_hash: 'abc123',
        difference_hash: 'diff123',
        has_alpha: null, // Missing
      };

      mockDb.query.mockResolvedValueOnce([cacheFile]);
      mockProviderAssetsRepo.findByAssetType.mockResolvedValueOnce([]);

      mockImageProcessor.analyzeImage.mockResolvedValueOnce({
        perceptual_hash: 'abc123',
        difference_hash: 'diff123',
        has_alpha: true,
        foreground_ratio: 0.65,
      });

      const config: EnrichmentConfig = {
        entityId: 1,
        entityType: 'movie',
        manual: false,
        forceRefresh: false,
      };

      await phase.execute(config);

      expect(mockImageProcessor.analyzeImage).toHaveBeenCalled();
      expect(mockRun).toHaveBeenCalledWith(
        expect.objectContaining({
          has_alpha: 1,
        })
      );
    });

    it('should skip backfilling if all metadata exists', async () => {
      const cacheFile = {
        id: 1,
        file_path: '/cache/ab/cd/abcdef123.jpg',
        image_type: 'poster',
        perceptual_hash: 'abc123',
        difference_hash: 'diff123',
        has_alpha: 0,
        foreground_ratio: 0.9,
      };

      mockDb.query.mockResolvedValueOnce([cacheFile]);
      mockProviderAssetsRepo.findByAssetType.mockResolvedValueOnce([]);

      const config: EnrichmentConfig = {
        entityId: 1,
        entityType: 'movie',
        manual: false,
        forceRefresh: false,
      };

      await phase.execute(config);

      // Should not analyze if metadata complete
      expect(mockImageProcessor.analyzeImage).not.toHaveBeenCalled();
    });
  });

  describe('Similarity Matching', () => {
    it('should match cache file to provider asset with ≥85% similarity', async () => {
      const cacheFile = {
        id: 1,
        file_path: '/cache/ab/cd/abcdef123.jpg',
        image_type: 'poster',
        perceptual_hash: 'abcdef123456',
        difference_hash: 'diff123',
        has_alpha: 0,
      };

      mockDb.query.mockResolvedValueOnce([cacheFile]);

      mockProviderAssetsRepo.findByAssetType.mockResolvedValueOnce([
        {
          id: 10,
          asset_type: 'poster',
          perceptual_hash: 'abcdef123456', // Exact match (100%)
          provider_name: 'tmdb',
        },
      ]);

      const config: EnrichmentConfig = {
        entityId: 1,
        entityType: 'movie',
        manual: false,
        forceRefresh: false,
      };

      const result = await phase.execute(config);

      expect(result.assetsMatched).toBe(1);
      expect(mockProviderAssetsRepo.markAsDownloaded).toHaveBeenCalled();
    });

    it('should reject matches below 85% similarity threshold', async () => {
      const cacheFile = {
        id: 1,
        file_path: '/cache/ab/cd/abcdef123.jpg',
        image_type: 'poster',
        perceptual_hash: '0000000000000000', // Very different
        difference_hash: 'diff123',
        has_alpha: 0,
      };

      mockDb.query.mockResolvedValueOnce([cacheFile]);

      mockProviderAssetsRepo.findByAssetType.mockResolvedValueOnce([
        {
          id: 10,
          asset_type: 'poster',
          perceptual_hash: 'ffffffffffffffff', // Completely different
          provider_name: 'tmdb',
        },
      ]);

      const config: EnrichmentConfig = {
        entityId: 1,
        entityType: 'movie',
        manual: false,
        forceRefresh: false,
      };

      const result = await phase.execute(config);

      expect(result.assetsMatched).toBe(0);
      expect(mockProviderAssetsRepo.markAsDownloaded).not.toHaveBeenCalled();
    });

    it('should select best match when multiple candidates exist', async () => {
      const cacheFile = {
        id: 1,
        file_path: '/cache/ab/cd/abcdef123.jpg',
        image_type: 'poster',
        perceptual_hash: 'abc000000000',
        difference_hash: 'diff123',
        has_alpha: 0,
      };

      mockDb.query.mockResolvedValueOnce([cacheFile]);

      mockProviderAssetsRepo.findByAssetType.mockResolvedValueOnce([
        {
          id: 10,
          asset_type: 'poster',
          perceptual_hash: 'abc111111111', // Good match
          provider_name: 'tmdb',
        },
        {
          id: 11,
          asset_type: 'poster',
          perceptual_hash: 'abc000000000', // Perfect match
          provider_name: 'fanart',
        },
      ]);

      const config: EnrichmentConfig = {
        entityId: 1,
        entityType: 'movie',
        manual: false,
        forceRefresh: false,
      };

      await phase.execute(config);

      // Should select asset with highest similarity (id: 11)
      expect(mockProviderAssetsRepo.markAsDownloaded).toHaveBeenCalledWith(11);
    });
  });

  describe('Asset Type Matching', () => {
    it('should only match cache file to same asset type', async () => {
      const cacheFile = {
        id: 1,
        file_path: '/cache/ab/cd/abcdef123.jpg',
        image_type: 'poster',
        perceptual_hash: 'abc123',
        difference_hash: 'diff123',
        has_alpha: 0,
      };

      mockDb.query.mockResolvedValueOnce([cacheFile]);

      mockProviderAssetsRepo.findByAssetType.mockResolvedValueOnce([
        {
          id: 10,
          asset_type: 'fanart', // Different type
          perceptual_hash: 'abc123', // Exact hash match
          provider_name: 'tmdb',
        },
      ]);

      const config: EnrichmentConfig = {
        entityId: 1,
        entityType: 'movie',
        manual: false,
        forceRefresh: false,
      };

      const result = await phase.execute(config);

      // Should not match different asset types
      expect(result.assetsMatched).toBe(0);
    });

    it('should match poster to poster', async () => {
      const cacheFile = {
        id: 1,
        file_path: '/cache/ab/cd/abcdef123.jpg',
        image_type: 'poster',
        perceptual_hash: 'abc123',
        difference_hash: 'diff123',
        has_alpha: 0,
      };

      mockDb.query.mockResolvedValueOnce([cacheFile]);

      mockProviderAssetsRepo.findByAssetType.mockResolvedValueOnce([
        {
          id: 10,
          asset_type: 'poster',
          perceptual_hash: 'abc123',
          provider_name: 'tmdb',
        },
      ]);

      const config: EnrichmentConfig = {
        entityId: 1,
        entityType: 'movie',
        manual: false,
        forceRefresh: false,
      };

      const result = await phase.execute(config);

      expect(result.assetsMatched).toBe(1);
    });
  });

  describe('Database Updates', () => {
    it('should update cache_image_files with provider name', async () => {
      const cacheFile = {
        id: 1,
        file_path: '/cache/ab/cd/abcdef123.jpg',
        image_type: 'poster',
        perceptual_hash: 'abc123',
        difference_hash: 'diff123',
        has_alpha: 0,
      };

      mockDb.query.mockResolvedValueOnce([cacheFile]);

      mockProviderAssetsRepo.findByAssetType.mockResolvedValueOnce([
        {
          id: 10,
          asset_type: 'poster',
          perceptual_hash: 'abc123',
          provider_name: 'fanart',
        },
      ]);

      const config: EnrichmentConfig = {
        entityId: 1,
        entityType: 'movie',
        manual: false,
        forceRefresh: false,
      };

      await phase.execute(config);

      expect(mockRun).toHaveBeenCalledWith(
        expect.objectContaining({
          provider_name: 'fanart',
        })
      );
    });

    it('should mark provider asset as downloaded', async () => {
      const cacheFile = {
        id: 1,
        file_path: '/cache/ab/cd/abcdef123.jpg',
        image_type: 'poster',
        perceptual_hash: 'abc123',
        difference_hash: 'diff123',
        has_alpha: 0,
      };

      mockDb.query.mockResolvedValueOnce([cacheFile]);

      mockProviderAssetsRepo.findByAssetType.mockResolvedValueOnce([
        {
          id: 10,
          asset_type: 'poster',
          perceptual_hash: 'abc123',
          provider_name: 'tmdb',
        },
      ]);

      const config: EnrichmentConfig = {
        entityId: 1,
        entityType: 'movie',
        manual: false,
        forceRefresh: false,
      };

      await phase.execute(config);

      expect(mockProviderAssetsRepo.markAsDownloaded).toHaveBeenCalledWith(10);
    });
  });

  describe('Error Handling', () => {
    it('should handle image analysis errors gracefully', async () => {
      const cacheFile = {
        id: 1,
        file_path: '/cache/ab/cd/corrupt.jpg',
        image_type: 'poster',
        perceptual_hash: 'abc123',
        difference_hash: null,
        has_alpha: null,
      };

      mockDb.query.mockResolvedValueOnce([cacheFile]);
      mockProviderAssetsRepo.findByAssetType.mockResolvedValueOnce([]);

      mockImageProcessor.analyzeImage.mockRejectedValueOnce(
        new Error('Corrupt image file')
      );

      const config: EnrichmentConfig = {
        entityId: 1,
        entityType: 'movie',
        manual: false,
        forceRefresh: false,
      };

      // Should not throw, just log and continue
      const result = await phase.execute(config);

      expect(result.assetsMatched).toBe(0);
    });

    it('should handle database query errors', async () => {
      mockDb.query.mockRejectedValueOnce(new Error('Database unavailable'));

      const config: EnrichmentConfig = {
        entityId: 1,
        entityType: 'movie',
        manual: false,
        forceRefresh: false,
      };

      await expect(phase.execute(config)).rejects.toThrow('Database unavailable');
    });
  });
});
