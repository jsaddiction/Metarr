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
  query: jest.fn(),
  execute: jest.fn(),
} as any;

const mockImageProcessor = {
  analyzeImage: jest.fn(),
} as any;

const mockProviderAssetsRepo = {
  findByAssetType: jest.fn(),
  update: jest.fn(),
} as any;

describe('CacheMatchingPhase', () => {
  let phase: CacheMatchingPhase;

  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock responses
    mockDb.execute.mockResolvedValue({ affectedRows: 1 });

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
          perceptual_hash: 'abc1234567890123', // 16 chars
          file_hash: 'sha256hash',
        },
      ]);

      mockProviderAssetsRepo.findByAssetType.mockResolvedValueOnce([]);

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
          perceptual_hash: 'abc123def4567890', // 16 chars
          difference_hash: 'def78901234567890', // 16 chars
          has_alpha: 0,
          file_hash: 'sha256hash',
        },
      ]);

      mockProviderAssetsRepo.findByAssetType.mockResolvedValueOnce([
        {
          id: 10,
          asset_type: 'poster',
          perceptual_hash: 'abc123def4567890', // Exact match (16 chars)
          provider_name: 'tmdb',
          provider_url: 'https://image.tmdb.org/t/p/original/poster.jpg',
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

  describe('Metadata Backfilling', () => {
    it('should backfill missing difference_hash', async () => {
      const cacheFile = {
        id: 1,
        file_path: '/cache/ab/cd/abcdef123.jpg',
        image_type: 'poster',
        perceptual_hash: 'abc1234567890123', // 16 chars
        difference_hash: null, // Missing
        has_alpha: 0,
        file_hash: 'sha256hash',
      };

      mockDb.query.mockResolvedValueOnce([cacheFile]);
      mockProviderAssetsRepo.findByAssetType.mockResolvedValueOnce([]);

      mockImageProcessor.analyzeImage.mockResolvedValueOnce({
        perceptualHash: 'abc123',
        differenceHash: 'newdiff123',
        hasAlpha: false,
        foregroundRatio: 0.85,
        width: 1000,
        height: 1500,
        format: 'jpeg',
        aspectRatio: 0.67,
        isLowVariance: false,
      });

      const config: EnrichmentConfig = {
        entityId: 1,
        entityType: 'movie',
        manual: false,
        forceRefresh: false,
      };

      await phase.execute(config);

      expect(mockImageProcessor.analyzeImage).toHaveBeenCalledWith(cacheFile.file_path);
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE cache_image_files'),
        expect.arrayContaining(['newdiff123'])
      );
    });

    it('should backfill missing has_alpha', async () => {
      const cacheFile = {
        id: 1,
        file_path: '/cache/ab/cd/abcdef123.png',
        image_type: 'logo',
        perceptual_hash: 'abc1234567890123', // 16 chars
        difference_hash: 'diff123456789012', // 16 chars
        has_alpha: null, // Missing
        file_hash: 'sha256hash',
      };

      mockDb.query.mockResolvedValueOnce([cacheFile]);
      mockProviderAssetsRepo.findByAssetType.mockResolvedValueOnce([]);

      mockImageProcessor.analyzeImage.mockResolvedValueOnce({
        perceptualHash: 'abc123',
        differenceHash: 'diff123',
        hasAlpha: true,
        foregroundRatio: 0.65,
        width: 800,
        height: 800,
        format: 'png',
        aspectRatio: 1.0,
        isLowVariance: false,
      });

      const config: EnrichmentConfig = {
        entityId: 1,
        entityType: 'movie',
        manual: false,
        forceRefresh: false,
      };

      await phase.execute(config);

      expect(mockImageProcessor.analyzeImage).toHaveBeenCalled();
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE cache_image_files'),
        expect.arrayContaining([1])
      );
    });

    it('should skip backfilling if all metadata exists', async () => {
      const cacheFile = {
        id: 1,
        file_path: '/cache/ab/cd/abcdef123.jpg',
        image_type: 'poster',
        perceptual_hash: 'abc1234567890123', // 16 chars
        difference_hash: 'diff123456789012', // 16 chars
        has_alpha: 0,
        foreground_ratio: 0.9,
        file_hash: 'sha256hash',
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
        perceptual_hash: 'abcdef1234567890', // 16 chars
        difference_hash: 'diff123456789012', // 16 chars
        has_alpha: 0,
        file_hash: 'sha256hash',
      };

      mockDb.query.mockResolvedValueOnce([cacheFile]);

      mockProviderAssetsRepo.findByAssetType.mockResolvedValueOnce([
        {
          id: 10,
          asset_type: 'poster',
          perceptual_hash: 'abcdef1234567890', // Exact match (100%, 16 chars)
          provider_name: 'tmdb',
          provider_url: 'https://image.tmdb.org/t/p/original/poster.jpg',
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
      expect(mockProviderAssetsRepo.update).toHaveBeenCalledWith(
        10,
        expect.objectContaining({
          is_downloaded: 1,
          analyzed: 1,
        })
      );
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
      expect(mockProviderAssetsRepo.update).not.toHaveBeenCalled();
    });

    it('should select best match when multiple candidates exist', async () => {
      const cacheFile = {
        id: 1,
        file_path: '/cache/ab/cd/abcdef123.jpg',
        image_type: 'poster',
        perceptual_hash: 'abc0000000000000', // 16 chars
        difference_hash: 'diff123456789012', // 16 chars
        has_alpha: 0,
        file_hash: 'sha256hash',
      };

      mockDb.query.mockResolvedValueOnce([cacheFile]);

      mockProviderAssetsRepo.findByAssetType.mockResolvedValueOnce([
        {
          id: 10,
          asset_type: 'poster',
          perceptual_hash: 'abc1111111111111', // Good match (15/16 chars match = 93.75%)
          provider_name: 'tmdb',
          provider_url: 'https://image.tmdb.org/t/p/original/poster1.jpg',
        },
        {
          id: 11,
          asset_type: 'poster',
          perceptual_hash: 'abc0000000000000', // Perfect match (100%, 16 chars)
          provider_name: 'fanart',
          provider_url: 'https://assets.fanart.tv/fanart/poster.jpg',
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
      expect(mockProviderAssetsRepo.update).toHaveBeenCalledWith(
        11,
        expect.objectContaining({
          is_downloaded: 1,
          analyzed: 1,
        })
      );
    });
  });

  describe('Asset Type Matching', () => {
    it('should only match cache file to same asset type', async () => {
      const cacheFile = {
        id: 1,
        file_path: '/cache/ab/cd/abcdef123.jpg',
        image_type: 'poster',
        perceptual_hash: 'abc1234567890123', // 16 chars
        difference_hash: 'diff123456789012', // 16 chars
        has_alpha: 0,
        file_hash: 'sha256hash',
      };

      mockDb.query.mockResolvedValueOnce([cacheFile]);

      mockProviderAssetsRepo.findByAssetType.mockResolvedValueOnce([
        {
          id: 10,
          asset_type: 'fanart', // Different type
          perceptual_hash: 'abc1234567890123', // Exact hash match (16 chars)
          provider_name: 'tmdb',
          provider_url: 'https://image.tmdb.org/t/p/original/fanart.jpg',
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
        perceptual_hash: 'abc1234567890123', // 16 chars
        difference_hash: 'diff123456789012', // 16 chars
        has_alpha: 0,
        file_hash: 'sha256hash',
      };

      mockDb.query.mockResolvedValueOnce([cacheFile]);

      mockProviderAssetsRepo.findByAssetType.mockResolvedValueOnce([
        {
          id: 10,
          asset_type: 'poster',
          perceptual_hash: 'abc1234567890123', // 16 chars
          provider_name: 'tmdb',
          provider_url: 'https://image.tmdb.org/t/p/original/poster.jpg',
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
        perceptual_hash: 'abc1234567890123', // 16 chars
        difference_hash: 'diff123456789012', // 16 chars
        has_alpha: 0,
        file_hash: 'sha256hash',
      };

      mockDb.query.mockResolvedValueOnce([cacheFile]);

      mockProviderAssetsRepo.findByAssetType.mockResolvedValueOnce([
        {
          id: 10,
          asset_type: 'poster',
          perceptual_hash: 'abc1234567890123', // 16 chars
          provider_name: 'fanart',
          provider_url: 'https://assets.fanart.tv/fanart/poster.jpg',
        },
      ]);

      const config: EnrichmentConfig = {
        entityId: 1,
        entityType: 'movie',
        manual: false,
        forceRefresh: false,
      };

      await phase.execute(config);

      // Check the last call to db.execute (for cache_image_files update)
      const executeCalls = mockDb.execute.mock.calls;
      const lastCall = executeCalls[executeCalls.length - 1];
      expect(lastCall[0]).toContain('UPDATE cache_image_files');
      expect(lastCall[1]).toContain('fanart');
      expect(lastCall[1]).toContain('https://assets.fanart.tv/fanart/poster.jpg');
    });

    it('should mark provider asset as downloaded', async () => {
      const cacheFile = {
        id: 1,
        file_path: '/cache/ab/cd/abcdef123.jpg',
        image_type: 'poster',
        perceptual_hash: 'abc1234567890123', // 16 chars
        difference_hash: 'diff123456789012', // 16 chars
        has_alpha: 0,
        file_hash: 'sha256hash',
      };

      mockDb.query.mockResolvedValueOnce([cacheFile]);

      mockProviderAssetsRepo.findByAssetType.mockResolvedValueOnce([
        {
          id: 10,
          asset_type: 'poster',
          perceptual_hash: 'abc1234567890123', // 16 chars
          provider_name: 'tmdb',
          provider_url: 'https://image.tmdb.org/t/p/original/poster.jpg',
        },
      ]);

      const config: EnrichmentConfig = {
        entityId: 1,
        entityType: 'movie',
        manual: false,
        forceRefresh: false,
      };

      await phase.execute(config);

      expect(mockProviderAssetsRepo.update).toHaveBeenCalledWith(
        10,
        expect.objectContaining({
          is_downloaded: 1,
          analyzed: 1,
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle image analysis errors gracefully', async () => {
      const cacheFile = {
        id: 1,
        file_path: '/cache/ab/cd/corrupt.jpg',
        image_type: 'poster',
        perceptual_hash: 'abc1234567890123', // 16 chars
        difference_hash: null,
        has_alpha: null,
        file_hash: 'sha256hash',
      };

      mockDb.query.mockResolvedValueOnce([cacheFile]);

      // Even with backfill error, matching should continue if hash exists
      mockProviderAssetsRepo.findByAssetType.mockResolvedValueOnce([
        {
          id: 10,
          asset_type: 'poster',
          perceptual_hash: 'abc1234567890123', // 16 chars
          provider_name: 'tmdb',
          provider_url: 'https://image.tmdb.org/t/p/original/poster.jpg',
        },
      ]);

      mockImageProcessor.analyzeImage.mockRejectedValueOnce(
        new Error('Corrupt image file')
      );

      const config: EnrichmentConfig = {
        entityId: 1,
        entityType: 'movie',
        manual: false,
        forceRefresh: false,
      };

      // Should not throw, just log and continue - matching still succeeds
      const result = await phase.execute(config);

      expect(result.assetsMatched).toBe(1);
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
