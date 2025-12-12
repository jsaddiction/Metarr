/**
 * Asset Selection Phase (Phase 2: DOWNLOADING + CACHING)
 *
 * Implements docs/concepts/Enrichment/DOWNLOADING.md:
 * 1. Score all candidates using PROVIDER METADATA (no download yet)
 * 2. Sort by quality score descending
 * 3. Download loop (until limit reached):
 *    - Download to temp file
 *    - Generate SHA256 + pHash (perceptual hash)
 *    - Check for duplicates against already-selected (Hamming distance < 10)
 *    - If unique: move to cache, create cache_image_files record
 *    - If duplicate: mark as rejected, delete temp
 * 4. Update provider_assets selection flags
 *
 * Key principle: "Trust the providers" - Score using provider-reported metadata,
 * download only what we need, deduplicate during download.
 */

import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { DatabaseConnection } from '../../../types/database.js';
import { DatabaseManager } from '../../../database/DatabaseManager.js';
import { ProviderAssetsRepository } from '../ProviderAssetsRepository.js';
import { AssetScoringPhase } from './AssetScoringPhase.js';
import { AssetConfigService } from '../../assetConfigService.js';
import { PhaseConfigService } from '../../PhaseConfigService.js';
import { ImageProcessor } from '../../../utils/ImageProcessor.js';
import { hashFile } from '../../hash/hashService.js';
import { EnrichmentConfig, ScoredAsset } from '../types.js';
import { logger } from '../../../middleware/logging.js';
import { getErrorMessage } from '../../../utils/errorHandling.js';
import { getAssetTypesForMediaType } from '../../../config/assetTypeDefaults.js';

export class AssetSelectionPhase {
  private readonly providerAssetsRepo: ProviderAssetsRepository;
  private readonly scoringPhase: AssetScoringPhase;
  private readonly phaseConfigService: PhaseConfigService;
  private readonly imageProcessor: ImageProcessor;
  private readonly tempDir: string;

  private readonly PHASH_SIMILARITY_THRESHOLD = 0.9; // 90% similarity = duplicate

  constructor(
    private readonly db: DatabaseConnection,
    private readonly dbManager: DatabaseManager,
    private readonly cacheDir: string,
    tempDir?: string
  ) {
    this.providerAssetsRepo = new ProviderAssetsRepository(db);
    this.scoringPhase = new AssetScoringPhase();
    this.phaseConfigService = new PhaseConfigService(db);
    this.imageProcessor = new ImageProcessor();
    this.tempDir = tempDir || path.join(process.cwd(), 'data', 'temp');
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

      // Get valid asset types for this entity type (filters out actor_thumb for movies, etc.)
      const validAssetTypes = this.getValidAssetTypesForEntity(entityType);

      let totalSelected = 0;

      // Process each asset type independently
      for (const [assetType, maxAllowable] of Object.entries(assetLimits)) {
        if (maxAllowable === 0) {
          continue; // Asset type disabled
        }

        // Skip asset types that don't apply to this entity type
        if (!validAssetTypes.includes(assetType)) {
          continue;
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
   * Select assets for a specific asset type using download-during-selection loop.
   *
   * Implements docs/concepts/Enrichment/DOWNLOADING.md:
   * 1. Score all candidates using provider metadata (no download)
   * 2. Download in ranked order
   * 3. Hash and deduplicate during download
   * 4. Stop when limit reached with unique assets
   */
  private async selectAssetsForType(
    entityId: number,
    entityType: string,
    assetType: string,
    maxAllowable: number,
    userPreferredLanguage: string
  ): Promise<number> {
    // STEP 1: Gather all provider assets (candidates)
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
      logger.debug('[AssetSelectionPhase] No provider assets found', { assetType });
      return 0;
    }

    logger.info('[AssetSelectionPhase] Scoring candidates using provider metadata', {
      assetType,
      candidateCount: providerAssets.length,
    });

    // STEP 2: Score all candidates using PROVIDER METADATA (no download yet)
    const scoredCandidates: Array<{
      id: number;
      provider_url: string;
      provider_name: string;
      score: number;
    }> = [];

    for (const candidate of providerAssets) {
      const assetForScoring = {
        asset_type: assetType,
        width: candidate.width, // Provider-reported dimensions
        height: candidate.height,
        provider_name: candidate.provider_name,
        provider_metadata: candidate.provider_metadata,
      };

      const score = this.scoringPhase.calculateScore(assetForScoring, userPreferredLanguage);

      scoredCandidates.push({
        id: candidate.id,
        provider_url: candidate.provider_url,
        provider_name: candidate.provider_name,
        score,
      });
    }

    // STEP 3: Sort by score descending
    scoredCandidates.sort((a, b) => b.score - a.score);

    // STEP 4: Download loop - download in ranked order, deduplicate, cache
    const selectedAssets: ScoredAsset[] = [];
    const selectedHashes: string[] = []; // pHashes of already-selected for dedup
    let downloadsFailed = 0;
    let duplicatesSkipped = 0;

    // Reset old selections first
    const oldSelectedIds = providerAssets.filter((p) => p.is_selected === 1).map((p) => p.id);
    if (oldSelectedIds.length > 0) {
      await this.db.execute(
        `UPDATE provider_assets
         SET is_selected = 0, selected_at = NULL, selected_by = NULL
         WHERE entity_type = ? AND entity_id = ? AND asset_type = ?`,
        [entityType, entityId, assetType]
      );
    }

    for (const candidate of scoredCandidates) {
      // Stop when we have enough unique assets
      if (selectedAssets.length >= maxAllowable) {
        break;
      }

      try {
        // Download to temp file
        const tempPath = path.join(this.tempDir, `metarr-${crypto.randomUUID()}.tmp`);
        await this.downloadFile(candidate.provider_url, tempPath);

        // Generate SHA256 content hash
        const hashResult = await hashFile(tempPath);
        const contentHash = hashResult.hash;

        // Check if this content already exists in cache (exact duplicate)
        const existingCache = await this.db.get<{ id: number }>(
          `SELECT id FROM cache_image_files WHERE file_hash = ?`,
          [contentHash]
        );

        if (existingCache) {
          logger.debug('[AssetSelectionPhase] Content already in cache, reusing', {
            assetType,
            candidateId: candidate.id,
            contentHash: contentHash.substring(0, 8),
          });
          // Mark as selected but don't re-download
          await this.providerAssetsRepo.update(candidate.id, {
            is_selected: 1,
            selected_at: new Date(),
            selected_by: 'auto',
            content_hash: contentHash,
          });
          selectedAssets.push({
            id: candidate.id,
            provider_url: candidate.provider_url,
            provider_name: candidate.provider_name,
            content_hash: contentHash,
            perceptual_hash: null,
            score: candidate.score,
          });
          await fs.unlink(tempPath).catch(() => {});
          continue;
        }

        // Generate perceptual hash for deduplication
        const analysis = await this.imageProcessor.analyzeImage(tempPath);
        const perceptualHash = analysis.perceptualHash;

        // Check for visual duplicates against already-selected
        let isDuplicate = false;
        if (perceptualHash) {
          for (const selectedHash of selectedHashes) {
            const similarity = ImageProcessor.hammingSimilarity(perceptualHash, selectedHash);
            if (similarity >= this.PHASH_SIMILARITY_THRESHOLD) {
              isDuplicate = true;
              logger.debug('[AssetSelectionPhase] Visual duplicate detected, skipping', {
                assetType,
                candidateId: candidate.id,
                similarity: (similarity * 100).toFixed(1) + '%',
              });
              break;
            }
          }
        }

        if (isDuplicate) {
          // Mark as rejected, delete temp
          await this.providerAssetsRepo.update(candidate.id, {
            is_rejected: 1,
            content_hash: contentHash,
            perceptual_hash: perceptualHash ?? undefined,
          });
          await fs.unlink(tempPath).catch(() => {});
          duplicatesSkipped++;
          continue;
        }

        // UNIQUE asset - move to cache
        const ext = path.extname(new URL(candidate.provider_url).pathname) || '.jpg';
        const cachePath = path.join(
          this.cacheDir,
          assetType,
          contentHash.slice(0, 2),
          `${contentHash}${ext}`
        );

        await fs.mkdir(path.dirname(cachePath), { recursive: true });
        await fs.rename(tempPath, cachePath);

        // Get image metadata
        const metadata = await sharp(cachePath).metadata();

        // Create cache_image_files record
        await this.db.execute(
          `INSERT INTO cache_image_files (
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
            contentHash,
            perceptualHash,
            assetType,
            metadata.width,
            metadata.height,
            metadata.format,
            'provider',
            candidate.provider_url,
            candidate.provider_name,
          ]
        );

        // Update provider_assets with selection and hashes
        await this.providerAssetsRepo.update(candidate.id, {
          is_selected: 1,
          selected_at: new Date(),
          selected_by: 'auto',
          content_hash: contentHash,
          perceptual_hash: perceptualHash ?? undefined,
          width: metadata.width,
          height: metadata.height,
        });

        selectedAssets.push({
          id: candidate.id,
          provider_url: candidate.provider_url,
          provider_name: candidate.provider_name,
          content_hash: contentHash,
          perceptual_hash: perceptualHash ?? null,
          score: candidate.score,
        });

        if (perceptualHash) {
          selectedHashes.push(perceptualHash);
        }

        logger.debug('[AssetSelectionPhase] Downloaded and cached asset', {
          assetType,
          candidateId: candidate.id,
          cachePath,
          score: candidate.score,
        });
      } catch (error) {
        downloadsFailed++;
        logger.warn('[AssetSelectionPhase] Failed to download/process candidate', {
          assetType,
          candidateId: candidate.id,
          url: candidate.provider_url,
          error: getErrorMessage(error),
        });
      }
    }

    // Delete old cache files that are no longer selected
    const newSelectedIds = selectedAssets.map((a) => a.id);
    const toDelete = oldSelectedIds.filter((id) => !newSelectedIds.includes(id));
    for (const id of toDelete) {
      const oldAsset = providerAssets.find((p) => p.id === id);
      if (oldAsset?.content_hash) {
        await this.deleteAssetFromCache(entityType, entityId, oldAsset.content_hash, 'cache_image_files');
      }
    }

    // Delete scanned assets (local source)
    await this.deleteScannedAssets(entityType, entityId, assetType, 'cache_image_files');

    logger.info('[AssetSelectionPhase] Asset selection complete for type', {
      assetType,
      selected: selectedAssets.length,
      duplicatesSkipped,
      downloadsFailed,
      candidatesTotal: scoredCandidates.length,
    });

    return selectedAssets.length;
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
   * Get valid asset types for entity type
   * Maps entity types to media types for assetTypeDefaults
   */
  private getValidAssetTypesForEntity(entityType: string): string[] {
    switch (entityType) {
      case 'movie':
        return getAssetTypesForMediaType('movie');
      case 'series':
        return getAssetTypesForMediaType('tvshow');
      case 'season':
        return getAssetTypesForMediaType('season');
      case 'episode':
        return getAssetTypesForMediaType('episode');
      case 'artist':
        return getAssetTypesForMediaType('artist');
      case 'album':
        return getAssetTypesForMediaType('album');
      case 'actor':
        return ['actor_thumb']; // Actors only have thumbnails
      default:
        logger.warn('[AssetSelectionPhase] Unknown entity type', { entityType });
        return [];
    }
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
}
