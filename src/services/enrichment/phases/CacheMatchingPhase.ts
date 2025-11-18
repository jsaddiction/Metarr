/**
 * Cache Matching Phase (Phase 2)
 *
 * Matches existing cache files to provider assets via perceptual hash similarity:
 * 1. Query cache_image_files for entity
 * 2. Backfill missing metadata (difference_hash, has_alpha, foreground_ratio)
 * 3. Match to provider_assets via perceptual hash (≥85% similarity)
 * 4. Update provider_assets.is_downloaded and cache_image_files.provider_name
 */

import { DatabaseConnection } from '../../../types/database.js';
import { ProviderAssetsRepository } from '../ProviderAssetsRepository.js';
import { ImageProcessor } from '../../../utils/ImageProcessor.js';
import { EnrichmentConfig } from '../types.js';
import { logger } from '../../../middleware/logging.js';
import { getErrorMessage } from '../../../utils/errorHandling.js';
import { ProviderAsset } from '../ProviderAssetsRepository.js';

interface CacheFile {
  id: number;
  file_path: string;
  image_type: string;
  file_hash: string | null;
  perceptual_hash: string | null;
  difference_hash: string | null;
  has_alpha: number | null;
  foreground_ratio: number | null;
}

export class CacheMatchingPhase {
  private readonly providerAssetsRepo: ProviderAssetsRepository;
  private readonly imageProcessor: ImageProcessor;

  constructor(private readonly db: DatabaseConnection) {
    this.providerAssetsRepo = new ProviderAssetsRepository(db);
    this.imageProcessor = new ImageProcessor();
  }

  /**
   * Execute cache matching for an entity
   *
   * @param config - Enrichment configuration
   * @returns Number of assets matched
   */
  async execute(config: EnrichmentConfig): Promise<{ assetsMatched: number }> {
    try {
      const { entityId, entityType } = config;
      let assetsMatched = 0;

      // Step 1: Get all cache files for entity
      const cacheFiles = await this.db.query<CacheFile>(
        `SELECT id, file_path, image_type, file_hash, perceptual_hash, difference_hash, has_alpha, foreground_ratio
         FROM cache_image_files
         WHERE entity_type = ? AND entity_id = ? AND file_path IS NOT NULL`,
        [entityType, entityId]
      );

      logger.debug('[CacheMatchingPhase] Found cache files', {
        entityType,
        entityId,
        count: cacheFiles.length,
      });

      // Step 2: Match each cache file to provider assets
      for (const cacheFile of cacheFiles) {
        // Step 2A: Backfill missing metadata for old manual assets
        if (
          cacheFile.perceptual_hash &&
          (!cacheFile.difference_hash || cacheFile.has_alpha === null)
        ) {
          await this.backfillCacheFileMetadata(cacheFile);
        }

        // Step 2B: Skip files without perceptual hash
        if (!cacheFile.perceptual_hash) {
          logger.debug('[CacheMatchingPhase] Cache file missing perceptual hash, skipping', {
            cacheFileId: cacheFile.id,
          });
          continue;
        }

        // Step 2C: Find best matching provider asset
        const match = await this.findBestMatch(cacheFile, entityId, entityType);

        if (match) {
          // Link cache file to provider asset
          await this.linkCacheToProvider(cacheFile, match.asset);
          assetsMatched++;

          logger.debug('[CacheMatchingPhase] Matched cache file to provider asset', {
            cacheFileId: cacheFile.id,
            providerAssetId: match.asset.id,
            similarity: match.similarity.toFixed(3),
          });
        }
      }

      logger.info('[CacheMatchingPhase] Phase 2 complete', {
        entityType,
        entityId,
        assetsMatched,
      });

      return { assetsMatched };
    } catch (error) {
      logger.error('[CacheMatchingPhase] Phase 2 failed', {
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  /**
   * Backfill missing metadata for cache files (legacy support)
   */
  private async backfillCacheFileMetadata(cacheFile: CacheFile): Promise<void> {
    try {
      const analysis = await this.imageProcessor.analyzeImage(cacheFile.file_path);

      // Build dynamic UPDATE statement for fields that need backfilling
      const updates: string[] = [];
      const values: (string | number)[] = [];

      if (!cacheFile.difference_hash) {
        updates.push('difference_hash = ?');
        values.push(analysis.differenceHash);
        cacheFile.difference_hash = analysis.differenceHash;
      }

      if (cacheFile.has_alpha === null) {
        updates.push('has_alpha = ?');
        values.push(analysis.hasAlpha ? 1 : 0);
        cacheFile.has_alpha = analysis.hasAlpha ? 1 : 0;
      }

      if (cacheFile.foreground_ratio === null && analysis.foregroundRatio !== undefined) {
        updates.push('foreground_ratio = ?');
        values.push(analysis.foregroundRatio);
        cacheFile.foreground_ratio = analysis.foregroundRatio;
      }

      if (updates.length > 0) {
        values.push(cacheFile.id);
        await this.db.execute(
          `UPDATE cache_image_files SET ${updates.join(', ')} WHERE id = ?`,
          values
        );
        logger.debug('[CacheMatchingPhase] Backfilled image metadata for cache file', {
          cacheFileId: cacheFile.id,
          fields: updates.length,
        });
      }
    } catch (error) {
      logger.warn('[CacheMatchingPhase] Failed to backfill image metadata', {
        cacheFileId: cacheFile.id,
        error: getErrorMessage(error),
      });
    }
  }

  /**
   * Find best matching provider asset via perceptual hash similarity
   */
  private async findBestMatch(
    cacheFile: CacheFile,
    entityId: number,
    entityType: string
  ): Promise<{ asset: ProviderAsset; similarity: number } | null> {
    // Get all provider assets of the same type
    const candidates = await this.providerAssetsRepo.findByAssetType(
      entityId,
      entityType,
      cacheFile.image_type
    );

    let bestMatch: { asset: ProviderAsset; similarity: number } | null = null;

    for (const candidate of candidates) {
      if (!candidate.perceptual_hash) continue;

      // Use ImageProcessor for multi-hash similarity
      const similarity = ImageProcessor.hammingSimilarity(
        cacheFile.perceptual_hash!,
        candidate.perceptual_hash
      );

      // High similarity (>= 0.85 = ~10 bits difference out of 64)
      if (similarity >= 0.85 && (!bestMatch || similarity > bestMatch.similarity)) {
        bestMatch = { asset: candidate, similarity };
      }
    }

    return bestMatch;
  }

  /**
   * Link cache file to provider asset
   */
  private async linkCacheToProvider(cacheFile: CacheFile, providerAsset: ProviderAsset): Promise<void> {
    // Update provider asset with download status
    await this.providerAssetsRepo.update(providerAsset.id, {
      is_downloaded: 1,
      content_hash: cacheFile.file_hash ?? undefined,
      analyzed: 1,
      analyzed_at: new Date(),
    });

    // Update cache file with provider info
    await this.db.execute(
      `UPDATE cache_image_files
       SET provider_name = ?, source_url = ?
       WHERE id = ?`,
      [providerAsset.provider_name, providerAsset.provider_url, cacheFile.id]
    );
  }
}
