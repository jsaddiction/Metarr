/**
 * Asset Selection Phase (Phase 5)
 *
 * Intelligent asset selection with deduplication:
 * 1. Score all provider assets (uses AssetScoringPhase)
 * 2. Sort by quality score descending
 * 3. Deduplicate visually similar images (O(n) hash bucketing)
 * 4. Select top N per asset type
 * 5. Update database selection flags
 * 6. Download new selections to cache
 * 7. Delete evicted cache files
 */

import { DatabaseConnection } from '../../../types/database.js';
import { DatabaseManager } from '../../../database/DatabaseManager.js';
import { ProviderAssetsRepository } from '../ProviderAssetsRepository.js';
import { AssetScoringPhase } from './AssetScoringPhase.js';
import { AssetConfigService } from '../../assetConfigService.js';
import { PhaseConfigService } from '../../PhaseConfigService.js';
import { ImageProcessor } from '../../../utils/ImageProcessor.js';
import { EnrichmentConfig, ScoredAsset } from '../types.js';
import { logger } from '../../../middleware/logging.js';
import { getErrorMessage } from '../../../utils/errorHandling.js';
import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';

export class AssetSelectionPhase {
  private readonly providerAssetsRepo: ProviderAssetsRepository;
  private readonly scoringPhase: AssetScoringPhase;
  private readonly phaseConfigService: PhaseConfigService;

  private readonly PHASH_SIMILARITY_THRESHOLD = 0.9; // 90% similarity = duplicate

  constructor(
    private readonly db: DatabaseConnection,
    private readonly dbManager: DatabaseManager,
    private readonly cacheDir: string
  ) {
    this.providerAssetsRepo = new ProviderAssetsRepository(db);
    this.scoringPhase = new AssetScoringPhase();
    this.phaseConfigService = new PhaseConfigService(db);
  }

  /**
   * Execute intelligent asset selection for an entity
   *
   * @param config - Enrichment configuration
   * @returns Number of assets selected
   */
  async execute(config: EnrichmentConfig): Promise<{ assetsSelected: number }> {
    try {
      const { entityId, entityType } = config;

      // Get asset limits from config
      const assetConfigService = new AssetConfigService(this.dbManager);
      const assetLimits = await assetConfigService.getAllAssetLimits();

      // Get user preferred language from phase config
      const phaseConfig = await this.phaseConfigService.getConfig('enrichment');
      const userPreferredLanguage = phaseConfig.preferredLanguage;

      let totalSelected = 0;

      // Process each asset type independently
      for (const [assetType, maxAllowable] of Object.entries(assetLimits)) {
        if (maxAllowable === 0) {
          continue; // Asset type disabled
        }

        // Check if asset type is locked
        const isLocked = await this.isAssetTypeLocked(entityId, entityType, assetType);
        if (isLocked) {
          logger.debug('[AssetSelectionPhase] Asset type locked, skipping auto-selection', {
            entityType,
            entityId,
            assetType,
          });
          continue;
        }

        const selected = await this.selectAssetsForType(
          entityId,
          entityType,
          assetType,
          maxAllowable,
          userPreferredLanguage
        );

        totalSelected += selected;
      }

      logger.info('[AssetSelectionPhase] Phase 5 complete', {
        entityType,
        entityId,
        assetsSelected: totalSelected,
      });

      return { assetsSelected: totalSelected };
    } catch (error) {
      logger.error('[AssetSelectionPhase] Phase 5 failed', {
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  /**
   * Select assets for a specific asset type
   */
  private async selectAssetsForType(
    entityId: number,
    entityType: string,
    assetType: string,
    maxAllowable: number,
    userPreferredLanguage: string
  ): Promise<number> {
    // STEP 1: Gather all provider assets
    const providerAssets = await this.db.query<{
      id: number;
      asset_type: string;
      provider_name: string;
      provider_url: string;
      provider_metadata: string | null;
      width: number | null;
      height: number | null;
      content_hash: string | null;
      perceptual_hash: string | null;
      is_selected: number;
    }>(
      `SELECT id, asset_type, provider_name, provider_url, provider_metadata,
              width, height, content_hash, perceptual_hash, is_selected
       FROM provider_assets
       WHERE entity_type = ? AND entity_id = ? AND asset_type = ? AND is_rejected = 0`,
      [entityType, entityId, assetType]
    );

    if (providerAssets.length === 0) {
      logger.info('[AssetSelectionPhase] No provider assets found', {
        assetType,
      });
      return 0;
    }

    logger.info('[AssetSelectionPhase] Gathered provider assets', {
      assetType,
      providerCount: providerAssets.length,
    });

    // STEP 2: Score all provider assets
    const scoredAssets: ScoredAsset[] = [];

    for (const provider of providerAssets) {
      const assetForScoring = {
        asset_type: assetType,
        width: provider.width,
        height: provider.height,
        provider_name: provider.provider_name,
        provider_metadata: provider.provider_metadata,
      };

      const score = this.scoringPhase.calculateScore(assetForScoring, userPreferredLanguage);

      scoredAssets.push({
        id: provider.id,
        provider_url: provider.provider_url,
        provider_name: provider.provider_name,
        content_hash: provider.content_hash,
        perceptual_hash: provider.perceptual_hash,
        score,
      });
    }

    // STEP 3: Sort by score descending
    scoredAssets.sort((a, b) => b.score - a.score);

    // STEP 4: Deduplicate by perceptual hash (optimized O(n) algorithm)
    const uniqueAssets = this.deduplicateAssets(scoredAssets, assetType);

    // STEP 5: Take top N
    const topN = uniqueAssets.slice(0, maxAllowable);

    logger.info('[AssetSelectionPhase] Selected top N after deduplication', {
      assetType,
      total: scoredAssets.length,
      unique: uniqueAssets.length,
      selected: topN.length,
    });

    // STEP 6: Determine what changed
    const oldSelectedIds = providerAssets.filter((p) => p.is_selected === 1).map((p) => p.id);
    const newSelectedIds = topN.map((a) => a.id);

    const noChanges = this.arraysEqual(oldSelectedIds, newSelectedIds);

    if (noChanges) {
      logger.info('[AssetSelectionPhase] No selection changes detected, skipping cache updates', {
        assetType,
      });
      return 0;
    }

    // STEP 7: Update is_selected flags
    await this.updateSelectionFlags(entityType, entityId, assetType, topN);

    // STEP 8: Update cache (download new, delete evicted)
    await this.updateCache(
      entityType,
      entityId,
      assetType,
      topN,
      oldSelectedIds,
      newSelectedIds,
      providerAssets
    );

    logger.info('[AssetSelectionPhase] Phase 5 complete for asset type', {
      assetType,
      selectedCount: topN.length,
    });

    return topN.length;
  }

  /**
   * Deduplicate assets using optimized O(n) hash bucketing algorithm
   */
  private deduplicateAssets(scoredAssets: ScoredAsset[], assetType: string): ScoredAsset[] {
    const uniqueAssets: ScoredAsset[] = [];
    const hashBuckets = new Map<string, ScoredAsset[]>();

    for (const asset of scoredAssets) {
      if (!asset.perceptual_hash) {
        uniqueAssets.push(asset); // No phash = can't dedupe, include it
        continue;
      }

      // Use first 8 chars as bucket key (50% of hash)
      // Similar images (90%+) will often share this prefix
      const bucketKey = asset.perceptual_hash.substring(0, 8);

      let isDuplicate = false;

      // Only check assets in same bucket + adjacent buckets (handle edge cases)
      const bucketsToCheck: string[] = [bucketKey];
      const adjacentBuckets = this.getAdjacentBuckets(bucketKey);
      bucketsToCheck.push(...adjacentBuckets);

      for (const checkBucket of bucketsToCheck) {
        const candidates = hashBuckets.get(checkBucket) || [];

        for (const candidate of candidates) {
          const similarity = ImageProcessor.hammingSimilarity(
            asset.perceptual_hash,
            candidate.perceptual_hash!
          );

          if (similarity >= this.PHASH_SIMILARITY_THRESHOLD) {
            isDuplicate = true;
            logger.debug('[AssetSelectionPhase] Duplicate detected, keeping higher-scored', {
              assetType,
              url: asset.provider_url,
              score: asset.score,
              similarity: (similarity * 100).toFixed(2) + '%',
              candidateScore: candidate.score,
            });
            break;
          }
        }

        if (isDuplicate) break;
      }

      if (!isDuplicate) {
        uniqueAssets.push(asset);

        // Add to bucket for future comparisons
        if (!hashBuckets.has(bucketKey)) {
          hashBuckets.set(bucketKey, []);
        }
        hashBuckets.get(bucketKey)!.push(asset);
      }
    }

    return uniqueAssets;
  }

  /**
   * Get adjacent hash bucket keys for similarity matching
   * Generates variations with single-bit flips to catch edge cases
   */
  private getAdjacentBuckets(bucketKey: string): string[] {
    const adjacent: string[] = [];

    // Generate buckets with 1-bit flip in each hex position
    for (let i = 0; i < bucketKey.length; i++) {
      const hexChar = parseInt(bucketKey[i], 16);

      // Flip each of the 4 bits in this hex char
      for (let bit = 0; bit < 4; bit++) {
        const flipped = hexChar ^ (1 << bit);
        const newKey = bucketKey.substring(0, i) + flipped.toString(16) + bucketKey.substring(i + 1);
        adjacent.push(newKey);
      }
    }

    // Limit to prevent excessive checks
    return [...new Set(adjacent)].slice(0, 16);
  }

  /**
   * Update is_selected flags in database
   */
  private async updateSelectionFlags(
    entityType: string,
    entityId: number,
    assetType: string,
    topN: ScoredAsset[]
  ): Promise<void> {
    // Reset all selections for this asset type
    await this.db.execute(
      `UPDATE provider_assets
       SET is_selected = 0, selected_at = NULL, selected_by = NULL
       WHERE entity_type = ? AND entity_id = ? AND asset_type = ?`,
      [entityType, entityId, assetType]
    );

    // Set new selections
    for (const asset of topN) {
      await this.providerAssetsRepo.update(asset.id, {
        is_selected: 1,
        selected_at: new Date(),
        selected_by: 'auto',
      });
    }

    logger.info('[AssetSelectionPhase] Updated is_selected flags', {
      assetType,
      newSelections: topN.length,
    });
  }

  /**
   * Update cache: download new selections, delete evicted
   */
  private async updateCache(
    entityType: string,
    entityId: number,
    assetType: string,
    topN: ScoredAsset[],
    oldSelectedIds: number[],
    newSelectedIds: number[],
    providerAssets: Array<{ id: number; content_hash: string | null }>
  ): Promise<void> {
    const cacheTable = this.getCacheTableForAssetType(assetType);
    if (!cacheTable) {
      logger.warn('[AssetSelectionPhase] No cache table for asset type, skipping cache updates', {
        assetType,
      });
      return;
    }

    const toDownload = newSelectedIds.filter((id) => !oldSelectedIds.includes(id));
    const toDelete = oldSelectedIds.filter((id) => !newSelectedIds.includes(id));

    // Download new selections to cache
    for (const id of toDownload) {
      const asset = topN.find((a) => a.id === id);
      if (!asset || !asset.content_hash) continue;

      await this.downloadAssetToCache(entityType, entityId, assetType, asset, cacheTable);
    }

    // Delete evicted cache files
    for (const id of toDelete) {
      const provider = providerAssets.find((p) => p.id === id);
      if (!provider || !provider.content_hash) continue;

      await this.deleteAssetFromCache(entityType, entityId, provider.content_hash, cacheTable);
    }

    // Delete all scanned assets (source_type = 'local')
    await this.deleteScannedAssets(entityType, entityId, assetType, cacheTable);

    logger.info('[AssetSelectionPhase] Cache updated', {
      assetType,
      downloaded: toDownload.length,
      evicted: toDelete.length,
    });
  }

  /**
   * Download asset to cache
   */
  private async downloadAssetToCache(
    entityType: string,
    entityId: number,
    assetType: string,
    asset: ScoredAsset,
    cacheTable: string
  ): Promise<void> {
    try {
      const ext = path.extname(new URL(asset.provider_url).pathname) || '.jpg';
      const cachePath = path.join(
        this.cacheDir,
        assetType,
        asset.content_hash!.slice(0, 2),
        `${asset.content_hash}${ext}`
      );

      await fs.mkdir(path.dirname(cachePath), { recursive: true });
      await this.downloadFile(asset.provider_url, cachePath);

      // Get image metadata
      const metadata = await sharp(cachePath).metadata();

      await this.db.execute(
        `INSERT INTO ${cacheTable} (
          entity_type, entity_id, file_path, file_name, file_size,
          file_hash, perceptual_hash, image_type, width, height, format,
          source_type, source_url, provider_name, discovered_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          entityType,
          entityId,
          cachePath,
          path.basename(cachePath),
          (await fs.stat(cachePath)).size,
          asset.content_hash,
          asset.perceptual_hash,
          assetType,
          metadata.width,
          metadata.height,
          metadata.format,
          'provider',
          asset.provider_url,
          asset.provider_name,
        ]
      );

      logger.debug('[AssetSelectionPhase] Downloaded new selection to cache', {
        assetType,
        providerId: asset.id,
        cachePath,
      });
    } catch (error) {
      logger.error('[AssetSelectionPhase] Failed to download asset to cache', {
        assetType,
        providerId: asset.id,
        url: asset.provider_url,
        error: getErrorMessage(error),
      });
    }
  }

  /**
   * Delete asset from cache
   */
  private async deleteAssetFromCache(
    entityType: string,
    entityId: number,
    contentHash: string,
    cacheTable: string
  ): Promise<void> {
    const cacheAsset = await this.db.get<{ id: number; file_path: string }>(
      `SELECT id, file_path FROM ${cacheTable}
       WHERE entity_type = ? AND entity_id = ? AND file_hash = ?`,
      [entityType, entityId, contentHash]
    );

    if (cacheAsset) {
      try {
        await fs.unlink(cacheAsset.file_path);
      } catch (error) {
        logger.warn('[AssetSelectionPhase] Failed to delete evicted cache file', {
          filePath: cacheAsset.file_path,
          error: getErrorMessage(error),
        });
      }

      await this.db.execute(`DELETE FROM ${cacheTable} WHERE id = ?`, [cacheAsset.id]);

      logger.debug('[AssetSelectionPhase] Deleted evicted cache file', {
        cachePath: cacheAsset.file_path,
      });
    }
  }

  /**
   * Delete scanned assets (local source)
   */
  private async deleteScannedAssets(
    entityType: string,
    entityId: number,
    assetType: string,
    cacheTable: string
  ): Promise<void> {
    const scannedAssets = await this.db.query<{ id: number; file_path: string }>(
      `SELECT id, file_path FROM ${cacheTable}
       WHERE entity_type = ? AND entity_id = ? AND image_type = ? AND source_type = 'local'`,
      [entityType, entityId, assetType]
    );

    for (const scanned of scannedAssets) {
      try {
        await fs.unlink(scanned.file_path);
      } catch (error) {
        logger.warn('[AssetSelectionPhase] Failed to delete scanned asset', {
          filePath: scanned.file_path,
          error: getErrorMessage(error),
        });
      }

      await this.db.execute(`DELETE FROM ${cacheTable} WHERE id = ?`, [scanned.id]);

      logger.debug('[AssetSelectionPhase] Deleted scanned asset', {
        assetType,
        filePath: scanned.file_path,
      });
    }

    if (scannedAssets.length > 0) {
      logger.info('[AssetSelectionPhase] Deleted scanned assets', {
        assetType,
        count: scannedAssets.length,
      });
    }
  }

  /**
   * Download file from URL
   */
  private async downloadFile(url: string, destPath: string): Promise<void> {
    const axios = (await import('axios')).default;
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    await fs.writeFile(destPath, response.data);
  }

  /**
   * Check if asset type is locked
   */
  private async isAssetTypeLocked(
    entityId: number,
    entityType: string,
    assetType: string
  ): Promise<boolean> {
    const lockColumn = `${assetType}_locked`;

    if (entityType === 'movie') {
      const result = await this.db.get<{ [key: string]: number }>(
        `SELECT ${lockColumn} FROM movies WHERE id = ?`,
        [entityId]
      );
      return result?.[lockColumn] === 1;
    }

    // Add other entity types as needed
    return false;
  }

  /**
   * Get cache table name for asset type
   */
  private getCacheTableForAssetType(assetType: string): string | null {
    // Images (posters, fanart, etc.)
    if (
      [
        'poster',
        'fanart',
        'banner',
        'clearlogo',
        'clearart',
        'discart',
        'landscape',
        'keyart',
        'thumb',
      ].includes(assetType)
    ) {
      return 'cache_image_files';
    }
    // Videos (trailers, samples)
    if (['trailer', 'sample'].includes(assetType)) {
      return 'cache_video_files';
    }
    return null;
  }

  /**
   * Compare two arrays for equality
   */
  private arraysEqual(a: number[], b: number[]): boolean {
    if (a.length !== b.length) return false;
    const sortedA = [...a].sort((x, y) => x - y);
    const sortedB = [...b].sort((x, y) => x - y);
    return sortedA.every((val, idx) => val === sortedB[idx]);
  }
}
