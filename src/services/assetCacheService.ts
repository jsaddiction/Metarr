import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import crypto from 'crypto';
import sharp from 'sharp';
import { DatabaseConnection } from '../types/database.js';
import { logger } from '../middleware/logging.js';

/**
 * Asset Cache Service
 *
 * Manages content-addressed cache for assets:
 * 1. Download assets from URLs
 * 2. Generate SHA256 content hash
 * 3. Store in cache with hash-based filename
 * 4. Update cache_inventory table
 * 5. Generate perceptual hash for images (duplicate detection)
 */

export interface DownloadResult {
  contentHash: string;
  cachePath: string;
  fileSize: number;
  width?: number | undefined;
  height?: number | undefined;
  perceptualHash?: string | undefined;
}

export interface CacheAsset {
  id: number;
  content_hash: string;
  file_path: string;
  file_size: number;
  asset_type: string;
  width?: number;
  height?: number;
  perceptual_hash?: string;
}

export class AssetCacheService {
  private db: DatabaseConnection;
  private cacheBaseDir: string;

  constructor(db: DatabaseConnection, cacheBaseDir: string = './data/cache') {
    this.db = db;
    this.cacheBaseDir = cacheBaseDir;
  }

  /**
   * Initialize cache directories
   */
  async initialize(): Promise<void> {
    const dirs = [
      path.join(this.cacheBaseDir, 'images'),
      path.join(this.cacheBaseDir, 'trailers'),
      path.join(this.cacheBaseDir, 'subtitles'),
      path.join(this.cacheBaseDir, 'temp'),
    ];

    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }

    logger.info('Asset cache service initialized', { cacheBaseDir: this.cacheBaseDir });
  }

  /**
   * Download asset from URL, hash it, and store in cache
   * Returns content hash for database reference
   */
  async downloadAndCache(
    url: string,
    assetType: 'image' | 'trailer' | 'subtitle'
  ): Promise<DownloadResult> {
    const tempDir = path.join(this.cacheBaseDir, 'temp');
    const tempPath = path.join(tempDir, `temp_${Date.now()}_${Math.random().toString(36).substring(7)}`);

    try {
      // Download to temp
      logger.debug('Downloading asset', { url, assetType });
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 30000, // 30 second timeout
        maxContentLength: 100 * 1024 * 1024, // 100MB max
      });

      const buffer = Buffer.from(response.data);
      await fs.writeFile(tempPath, buffer);

      // Generate content hash (SHA256)
      const contentHash = await this.generateContentHash(tempPath);

      // Check if already cached
      const existing = await this.getCachedAsset(contentHash);
      if (existing) {
        logger.debug('Asset already in cache', { contentHash, existingPath: existing.file_path });
        await fs.unlink(tempPath); // Clean up temp
        return {
          contentHash,
          cachePath: existing.file_path,
          fileSize: existing.file_size,
          width: existing.width,
          height: existing.height,
          perceptualHash: existing.perceptual_hash,
        };
      }

      // Determine file extension
      const contentType = response.headers['content-type'] as string;
      let ext = this.getExtensionFromContentType(contentType);
      if (!ext) {
        ext = path.extname(url);
      }
      if (!ext) {
        ext = assetType === 'image' ? '.jpg' : assetType === 'trailer' ? '.mp4' : '.srt';
      }

      // Move to cache with content-addressed filename
      const cacheSubDir = path.join(this.cacheBaseDir, assetType === 'image' ? 'images' : assetType === 'trailer' ? 'trailers' : 'subtitles');
      const cacheFileName = `${contentHash}${ext}`;
      const cachePath = path.join(cacheSubDir, cacheFileName);

      await fs.rename(tempPath, cachePath);

      // Get file stats
      const stats = await fs.stat(cachePath);

      // For images, get dimensions and perceptual hash
      let width: number | undefined;
      let height: number | undefined;
      let perceptualHash: string | undefined;

      if (assetType === 'image') {
        try {
          const metadata = await sharp(cachePath).metadata();
          width = metadata.width;
          height = metadata.height;

          // Calculate perceptual hash for duplicate detection
          perceptualHash = await this.calculatePerceptualHash(cachePath);
        } catch (error) {
          logger.warn('Failed to process image metadata', { cachePath, error });
        }
      }

      // Insert into cache_inventory
      await this.addToCacheInventory({
        content_hash: contentHash,
        file_path: cachePath,
        file_size: stats.size,
        asset_type: assetType,
        width,
        height,
        perceptual_hash: perceptualHash,
      });

      logger.info('Asset downloaded and cached', {
        url,
        contentHash,
        cachePath,
        fileSize: stats.size,
        width,
        height
      });

      return {
        contentHash,
        cachePath,
        fileSize: stats.size,
        width,
        height,
        perceptualHash,
      };

    } catch (error: any) {
      // Clean up temp file on error
      try {
        await fs.unlink(tempPath);
      } catch (cleanupError) {
        // Ignore cleanup errors
      }

      logger.error('Failed to download and cache asset', { url, error: error.message });
      throw new Error(`Asset download failed: ${error.message}`);
    }
  }

  /**
   * Generate SHA256 content hash for file
   */
  private async generateContentHash(filePath: string): Promise<string> {
    const buffer = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Calculate perceptual hash for image (for duplicate detection)
   */
  private async calculatePerceptualHash(imagePath: string): Promise<string> {
    const image = sharp(imagePath);

    // Resize to 8x8 grayscale for pHash
    const resized = await image.resize(8, 8, { fit: 'fill' }).grayscale().raw().toBuffer();

    // Calculate average pixel value
    let sum = 0;
    for (let i = 0; i < resized.length; i++) {
      sum += resized[i];
    }
    const avg = sum / resized.length;

    // Generate hash: 1 if pixel > avg, 0 otherwise
    let hash = '';
    for (let i = 0; i < resized.length; i++) {
      hash += resized[i] > avg ? '1' : '0';
    }

    // Convert binary string to hex
    const hex = BigInt('0b' + hash).toString(16).padStart(16, '0');
    return hex;
  }

  /**
   * Get file extension from content-type header
   */
  private getExtensionFromContentType(contentType: string): string | null {
    const mapping: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'video/mp4': '.mp4',
      'video/webm': '.webm',
      'text/plain': '.srt',
      'application/x-subrip': '.srt',
    };

    const normalized = contentType.toLowerCase().split(';')[0].trim();
    return mapping[normalized] || null;
  }

  /**
   * Add asset to cache_inventory table
   */
  private async addToCacheInventory(asset: {
    content_hash: string;
    file_path: string;
    file_size: number;
    asset_type: string;
    width?: number | undefined;
    height?: number | undefined;
    perceptual_hash?: string | undefined;
  }): Promise<void> {
    await this.db.execute(
      `INSERT INTO cache_inventory (
        content_hash, file_path, file_size, asset_type,
        width, height, perceptual_hash, reference_count,
        first_used_at, last_used_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        asset.content_hash,
        asset.file_path,
        asset.file_size,
        asset.asset_type,
        asset.width,
        asset.height,
        asset.perceptual_hash,
      ]
    );
  }

  /**
   * Get cached asset by content hash
   */
  async getCachedAsset(contentHash: string): Promise<CacheAsset | null> {
    const result = await this.db.query<CacheAsset>(
      `SELECT * FROM cache_inventory WHERE content_hash = ?`,
      [contentHash]
    );

    return result.length > 0 ? result[0] : null;
  }

  /**
   * Increment reference count for cached asset
   */
  async incrementReferenceCount(contentHash: string): Promise<void> {
    await this.db.execute(
      `UPDATE cache_inventory
       SET reference_count = reference_count + 1,
           last_used_at = CURRENT_TIMESTAMP,
           orphaned_at = NULL
       WHERE content_hash = ?`,
      [contentHash]
    );
  }

  /**
   * Decrement reference count for cached asset
   */
  async decrementReferenceCount(contentHash: string): Promise<void> {
    await this.db.execute(
      `UPDATE cache_inventory
       SET reference_count = reference_count - 1
       WHERE content_hash = ?`,
      [contentHash]
    );

    // Mark as orphaned if reference count reaches 0
    await this.db.execute(
      `UPDATE cache_inventory
       SET orphaned_at = CURRENT_TIMESTAMP
       WHERE content_hash = ? AND reference_count = 0 AND orphaned_at IS NULL`,
      [contentHash]
    );
  }

  /**
   * Clean up orphaned cache files older than retention period
   */
  async cleanupOrphanedAssets(retentionDays: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    // Get orphaned assets to delete
    const orphaned = await this.db.query<{ id: number; file_path: string }>(
      `SELECT id, file_path FROM cache_inventory
       WHERE orphaned_at IS NOT NULL
       AND orphaned_at < ?
       AND reference_count = 0`,
      [cutoffDate.toISOString()]
    );

    let deletedCount = 0;

    for (const asset of orphaned) {
      try {
        // Delete file from filesystem
        await fs.unlink(asset.file_path);

        // Remove from database
        await this.db.execute(
          `DELETE FROM cache_inventory WHERE id = ?`,
          [asset.id]
        );

        deletedCount++;
        logger.debug('Deleted orphaned cache asset', { id: asset.id, path: asset.file_path });
      } catch (error) {
        logger.error('Failed to delete orphaned cache asset', { id: asset.id, error });
      }
    }

    if (deletedCount > 0) {
      logger.info('Cleaned up orphaned cache assets', { deletedCount, retentionDays });
    }

    return deletedCount;
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    totalAssets: number;
    totalSize: number;
    orphanedAssets: number;
    orphanedSize: number;
    assetsByType: Record<string, number>;
  }> {
    const [totalResult, orphanedResult, byTypeResult] = await Promise.all([
      this.db.query<{ count: number; size: number }>(
        `SELECT COUNT(*) as count, SUM(file_size) as size FROM cache_inventory`,
        []
      ),
      this.db.query<{ count: number; size: number }>(
        `SELECT COUNT(*) as count, SUM(file_size) as size
         FROM cache_inventory WHERE orphaned_at IS NOT NULL`,
        []
      ),
      this.db.query<{ asset_type: string; count: number }>(
        `SELECT asset_type, COUNT(*) as count
         FROM cache_inventory GROUP BY asset_type`,
        []
      ),
    ]);

    const assetsByType: Record<string, number> = {};
    for (const row of byTypeResult) {
      assetsByType[row.asset_type] = row.count;
    }

    return {
      totalAssets: totalResult[0]?.count || 0,
      totalSize: totalResult[0]?.size || 0,
      orphanedAssets: orphanedResult[0]?.count || 0,
      orphanedSize: orphanedResult[0]?.size || 0,
      assetsByType,
    };
  }
}
