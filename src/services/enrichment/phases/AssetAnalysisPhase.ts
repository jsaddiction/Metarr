/**
 * Asset Analysis Phase (Phase 3)
 *
 * Downloads and analyzes unanalyzed provider assets:
 * 1. Query provider_assets for unanalyzed assets
 * 2. Download to temp directory
 * 3. Analyze (image: dimensions + perceptual hash, video: duration)
 * 4. Update provider_assets with metadata + hashes
 * 5. Check if already in cache (by content_hash)
 * 6. Cleanup temp files
 */

import path from 'path';
import crypto from 'crypto';
import fs from 'fs/promises';
import pMap from 'p-map';
import axios from 'axios';
import { DatabaseConnection } from '../../../types/database.js';
import { ProviderAssetsRepository, ProviderAsset } from '../ProviderAssetsRepository.js';
import { ImageProcessor } from '../../../utils/ImageProcessor.js';
import { hashFile } from '../../hash/hashService.js';
import { extractMediaInfo } from '../../media/ffprobeService.js';
import { EnrichmentConfig, AssetMetadata } from '../types.js';
import { logger } from '../../../middleware/logging.js';
import { getErrorMessage } from '../../../utils/errorHandling.js';

export class AssetAnalysisPhase {
  private readonly providerAssetsRepo: ProviderAssetsRepository;
  private readonly imageProcessor: ImageProcessor;
  private readonly tempDir: string;

  constructor(
    private readonly db: DatabaseConnection,
    tempDir?: string
  ) {
    this.providerAssetsRepo = new ProviderAssetsRepository(db);
    this.imageProcessor = new ImageProcessor();
    this.tempDir = tempDir || path.join(process.cwd(), 'data', 'temp');
  }

  /**
   * Execute asset analysis for an entity
   *
   * @param config - Enrichment configuration
   * @returns Number of assets analyzed
   */
  async execute(config: EnrichmentConfig): Promise<{ assetsAnalyzed: number }> {
    try {
      const { entityId, entityType } = config;

      // Step 1: Get all unanalyzed assets
      const unanalyzed = await this.providerAssetsRepo.findUnanalyzed(entityId, entityType);

      if (unanalyzed.length === 0) {
        logger.info('[AssetAnalysisPhase] No unanalyzed assets', {
          entityType,
          entityId,
        });
        return { assetsAnalyzed: 0 };
      }

      logger.info('[AssetAnalysisPhase] Analyzing assets', {
        entityType,
        entityId,
        count: unanalyzed.length,
      });

      // Step 2: Process up to 10 assets concurrently
      let assetsAnalyzed = 0;
      let assetsFailed = 0;

      await pMap(
        unanalyzed,
        async (asset) => {
          try {
            await this.analyzeAsset(asset);
            assetsAnalyzed++;
          } catch (error) {
            assetsFailed++;
            logger.warn('[AssetAnalysisPhase] Failed to analyze asset', {
              assetId: asset.id,
              url: asset.provider_url,
              error: getErrorMessage(error),
            });
          }
        },
        { concurrency: 10 }
      );

      // Step 3: Cleanup temp directory
      await this.cleanupTempDirectory();

      logger.info('[AssetAnalysisPhase] Phase 3 complete', {
        entityType,
        entityId,
        assetsAnalyzed,
        assetsFailed,
        successRate: `${((assetsAnalyzed / unanalyzed.length) * 100).toFixed(1)}%`,
      });

      // Throw error if too many failures (> 50%)
      if (assetsFailed > assetsAnalyzed) {
        throw new Error(
          `Asset analysis had high failure rate: ${assetsFailed} failed out of ${unanalyzed.length} total`
        );
      }

      return { assetsAnalyzed };
    } catch (error) {
      logger.error('[AssetAnalysisPhase] Phase 3 failed', {
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  /**
   * Analyze a single asset
   */
  private async analyzeAsset(asset: ProviderAsset): Promise<void> {
    const tempPath = path.join(this.tempDir, `metarr-analyze-${crypto.randomUUID()}.tmp`);

    try {
      // Download to temp
      await this.downloadFile(asset.provider_url, tempPath);

      // Analyze based on asset type
      let metadata: AssetMetadata;
      let perceptualHash: string | undefined;
      let differenceHash: string | undefined;

      if (asset.asset_type === 'trailer' || asset.asset_type === 'sample') {
        // Video analysis
        const mediaInfo = await extractMediaInfo(tempPath);
        const stats = await fs.stat(tempPath);
        const videoStream = mediaInfo.videoStreams[0];

        metadata = {
          width: videoStream?.width || 0,
          height: videoStream?.height || 0,
          duration: mediaInfo.duration ? Math.floor(mediaInfo.duration) : undefined,
          mimeType: 'video/mp4',
          size: stats.size,
          isImage: false,
        };
      } else {
        // Image analysis - use ImageProcessor for all hash computation
        const analysis = await this.imageProcessor.analyzeImage(tempPath);
        metadata = {
          width: analysis.width,
          height: analysis.height,
          mimeType: `image/${analysis.format}`,
          size: analysis.fileSize || 0,
          isImage: true,
        };
        perceptualHash = analysis.perceptualHash;
        differenceHash = analysis.differenceHash;
      }

      // Calculate content hash
      const hashResult = await hashFile(tempPath);

      // Check if this asset already exists in cache
      const cachedFile = await this.db.get<{ id: number }>(
        `SELECT id FROM cache_image_files WHERE file_hash = ?`,
        [hashResult.hash]
      );

      // Update provider_assets with actual metadata
      await this.providerAssetsRepo.update(asset.id, {
        width: metadata.width,
        height: metadata.height,
        duration_seconds: metadata.duration ?? undefined,
        content_hash: hashResult.hash,
        perceptual_hash: perceptualHash ?? undefined,
        difference_hash: differenceHash ?? undefined,
        mime_type: metadata.mimeType,
        file_size: metadata.size,
        analyzed: 1,
        analyzed_at: new Date(),
        is_downloaded: cachedFile ? 1 : 0,
      });

      logger.debug('[AssetAnalysisPhase] Asset analyzed', {
        assetId: asset.id,
        assetType: asset.asset_type,
        width: metadata.width,
        height: metadata.height,
      });

      // Delete temp file on success
      await fs.unlink(tempPath).catch(() => {});
    } catch (error) {
      // Delete temp file on error
      await fs.unlink(tempPath).catch(() => {});

      // Re-throw for caller to handle
      throw error;
    }
  }

  /**
   * Download file from URL to destination path with retry logic
   */
  private async downloadFile(url: string, destPath: string): Promise<void> {
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await axios.get(url, {
          responseType: 'arraybuffer',
          timeout: 30000, // 30 second timeout
        });

        await fs.writeFile(destPath, response.data);
        return; // Success!
      } catch (error) {
        const isLastAttempt = attempt === maxRetries;
        const isNetworkError = this.isNetworkError(error);

        logger.debug('[AssetAnalysisPhase] Download attempt failed', {
          url,
          attempt,
          maxRetries,
          isNetworkError,
          error: getErrorMessage(error),
        });

        // If not a network error or last attempt, give up
        if (!isNetworkError || isLastAttempt) {
          throw new Error(
            `Failed to download after ${attempt} attempts: ${getErrorMessage(error)}`
          );
        }

        // Exponential backoff: 2s, 4s, 8s
        const delayMs = Math.pow(2, attempt) * 1000;
        logger.debug('[AssetAnalysisPhase] Retrying download after delay', {
          url,
          attempt: attempt + 1,
          delayMs,
        });
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  /**
   * Check if error is a network error (retryable)
   */
  private isNetworkError(error: unknown): boolean {
    const errorMessage = getErrorMessage(error).toLowerCase();
    const errorCode = (error as any)?.code?.toLowerCase() || '';

    const networkErrors = [
      'timeout',
      'econnrefused',
      'econnreset',
      'etimedout',
      'network',
      'socket',
      'enotfound',
      'enetunreach',
      'ehostunreach',
      'econnaborted',
    ];

    return (
      networkErrors.some((ne) => errorMessage.includes(ne) || errorCode.includes(ne)) ||
      errorMessage.includes('status code 5') // 5xx errors are retryable
    );
  }

  /**
   * Cleanup temp directory (remove files older than 1 hour)
   */
  private async cleanupTempDirectory(): Promise<void> {
    try {
      const files = await fs.readdir(this.tempDir);
      const now = Date.now();
      const ONE_HOUR = 60 * 60 * 1000;

      for (const file of files) {
        const filePath = path.join(this.tempDir, file);
        try {
          const stats = await fs.stat(filePath);
          if (now - stats.mtimeMs > ONE_HOUR) {
            await fs.unlink(filePath);
            logger.debug('[AssetAnalysisPhase] Deleted old temp file', { file });
          }
        } catch {
          // Ignore errors on individual files
        }
      }
    } catch (error) {
      logger.warn('[AssetAnalysisPhase] Failed to cleanup temp directory', {
        error: getErrorMessage(error),
      });
    }
  }
}
