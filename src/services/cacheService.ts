import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { createReadStream } from 'fs';
import { logger } from '../middleware/logging.js';
import { DatabaseManager } from '../database/DatabaseManager.js';
import { DatabaseConnection } from '../types/database.js';

/**
 * Cache Service
 * Manages content-addressed asset storage with SHA256 hashing and directory sharding
 */
export class CacheService {
  private static instance: CacheService | null = null;
  private cacheBasePath: string;
  private db: DatabaseConnection | null = null;

  private constructor(cacheBasePath?: string) {
    // Default to data/cache/assets if not specified
    this.cacheBasePath = cacheBasePath || path.join(process.cwd(), 'data', 'cache', 'assets');
  }

  /**
   * Get singleton instance
   */
  public static getInstance(cacheBasePath?: string): CacheService {
    if (!CacheService.instance) {
      CacheService.instance = new CacheService(cacheBasePath);
    }
    return CacheService.instance;
  }

  /**
   * Initialize cache service with database connection
   */
  public async initialize(dbManager: DatabaseManager): Promise<void> {
    this.db = dbManager.getConnection();
    await this.ensureCacheDirectory();
    logger.info('Cache service initialized', { cacheBasePath: this.cacheBasePath });
  }

  /**
   * Ensure cache directory structure exists
   */
  private async ensureCacheDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.cacheBasePath, { recursive: true });
      logger.debug('Cache directory ready', { path: this.cacheBasePath });
    } catch (error) {
      logger.error('Failed to create cache directory', {
        path: this.cacheBasePath,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Calculate SHA256 hash of file content
   */
  private async calculateFileHash(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = createHash('sha256');
      const stream = createReadStream(filePath);

      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  /**
   * Generate sharded cache path from content hash
   * Example: abc123... -> /cache/assets/ab/c1/abc123...ext
   */
  private getShardedPath(contentHash: string, extension: string): string {
    const shard1 = contentHash.substring(0, 2);
    const shard2 = contentHash.substring(2, 4);
    return path.join(this.cacheBasePath, shard1, shard2, `${contentHash}${extension}`);
  }

  /**
   * Add asset to cache
   * Returns cache_asset record with ID and paths
   */
  public async addAsset(
    sourceFilePath: string,
    metadata: {
      mimeType: string;
      sourceType: 'provider' | 'local' | 'user';
      sourceUrl?: string;
      providerName?: string;
      width?: number;
      height?: number;
      perceptualHash?: string;
    }
  ): Promise<{
    id: number;
    contentHash: string;
    cachePath: string;
    fileSize: number;
    isNew: boolean;
  }> {
    if (!this.db) {
      throw new Error('Cache service not initialized');
    }

    try {
      // Calculate content hash
      const contentHash = await this.calculateFileHash(sourceFilePath);
      logger.debug('Calculated content hash', { contentHash, sourceFilePath });

      // Check if asset already exists in cache
      const existingAsset = await this.db.get<{
        id: number;
        file_path: string;
        file_size: number;
        reference_count: number;
      }>(
        'SELECT id, file_path, file_size, reference_count FROM cache_assets WHERE content_hash = ?',
        [contentHash]
      );

      if (existingAsset) {
        // Asset already exists - increment reference count
        await this.db.run(
          'UPDATE cache_assets SET reference_count = reference_count + 1, last_accessed_at = CURRENT_TIMESTAMP WHERE id = ?',
          [existingAsset.id]
        );

        logger.info('Asset already in cache, incremented reference count', {
          id: existingAsset.id,
          contentHash,
          newRefCount: existingAsset.reference_count + 1,
        });

        return {
          id: existingAsset.id,
          contentHash,
          cachePath: existingAsset.file_path,
          fileSize: existingAsset.file_size,
          isNew: false,
        };
      }

      // New asset - copy to cache with sharded path
      const extension = path.extname(sourceFilePath);
      const cachePath = this.getShardedPath(contentHash, extension);
      const cacheDir = path.dirname(cachePath);

      // Ensure shard directory exists
      await fs.mkdir(cacheDir, { recursive: true });

      // Copy file to cache
      await fs.copyFile(sourceFilePath, cachePath);

      // Get file size
      const stats = await fs.stat(cachePath);
      const fileSize = stats.size;

      // Insert cache_asset record
      const result = await this.db.run(
        `INSERT INTO cache_assets (
          content_hash, file_path, file_size, mime_type,
          width, height, perceptual_hash,
          source_type, source_url, provider_name,
          reference_count, created_at, last_accessed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          contentHash,
          cachePath,
          fileSize,
          metadata.mimeType,
          metadata.width || null,
          metadata.height || null,
          metadata.perceptualHash || null,
          metadata.sourceType,
          metadata.sourceUrl || null,
          metadata.providerName || null,
        ]
      );

      logger.info('Added new asset to cache', {
        id: result.lastID,
        contentHash,
        cachePath,
        fileSize,
        sourceType: metadata.sourceType,
      });

      return {
        id: result.lastID!,
        contentHash,
        cachePath,
        fileSize,
        isNew: true,
      };
    } catch (error) {
      logger.error('Failed to add asset to cache', {
        sourceFilePath,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get cache asset by content hash
   */
  public async getAssetByHash(contentHash: string): Promise<{
    id: number;
    cachePath: string;
    fileSize: number;
    mimeType: string;
    referenceCount: number;
  } | null> {
    if (!this.db) {
      throw new Error('Cache service not initialized');
    }

    const asset = await this.db.get<{
      id: number;
      file_path: string;
      file_size: number;
      mime_type: string;
      reference_count: number;
    }>(
      'SELECT id, file_path, file_size, mime_type, reference_count FROM cache_assets WHERE content_hash = ?',
      [contentHash]
    );

    if (!asset) {
      return null;
    }

    // Update last accessed timestamp
    await this.db.run(
      'UPDATE cache_assets SET last_accessed_at = CURRENT_TIMESTAMP WHERE id = ?',
      [asset.id]
    );

    return {
      id: asset.id,
      cachePath: asset.file_path,
      fileSize: asset.file_size,
      mimeType: asset.mime_type,
      referenceCount: asset.reference_count,
    };
  }

  /**
   * Get cache asset by ID
   */
  public async getAssetById(id: number): Promise<{
    id: number;
    contentHash: string;
    cachePath: string;
    fileSize: number;
    mimeType: string;
    referenceCount: number;
  } | null> {
    if (!this.db) {
      throw new Error('Cache service not initialized');
    }

    const asset = await this.db.get<{
      id: number;
      content_hash: string;
      file_path: string;
      file_size: number;
      mime_type: string;
      reference_count: number;
    }>(
      'SELECT id, content_hash, file_path, file_size, mime_type, reference_count FROM cache_assets WHERE id = ?',
      [id]
    );

    if (!asset) {
      return null;
    }

    // Update last accessed timestamp
    await this.db.run(
      'UPDATE cache_assets SET last_accessed_at = CURRENT_TIMESTAMP WHERE id = ?',
      [id]
    );

    return {
      id: asset.id,
      contentHash: asset.content_hash,
      cachePath: asset.file_path,
      fileSize: asset.file_size,
      mimeType: asset.mime_type,
      referenceCount: asset.reference_count,
    };
  }

  /**
   * Increment reference count for cached asset
   */
  public async incrementReference(cacheAssetId: number): Promise<void> {
    if (!this.db) {
      throw new Error('Cache service not initialized');
    }

    await this.db.run(
      'UPDATE cache_assets SET reference_count = reference_count + 1, last_accessed_at = CURRENT_TIMESTAMP WHERE id = ?',
      [cacheAssetId]
    );

    logger.debug('Incremented cache asset reference count', { cacheAssetId });
  }

  /**
   * Decrement reference count for cached asset
   */
  public async decrementReference(cacheAssetId: number): Promise<void> {
    if (!this.db) {
      throw new Error('Cache service not initialized');
    }

    await this.db.run(
      'UPDATE cache_assets SET reference_count = MAX(0, reference_count - 1) WHERE id = ?',
      [cacheAssetId]
    );

    logger.debug('Decremented cache asset reference count', { cacheAssetId });
  }

  /**
   * Clean up orphaned cache assets (reference_count = 0)
   * Returns number of assets deleted
   */
  public async cleanupOrphans(dryRun: boolean = false): Promise<{
    deleted: number;
    freedBytes: number;
    errors: number;
  }> {
    if (!this.db) {
      throw new Error('Cache service not initialized');
    }

    // Find orphaned assets
    const orphans = await this.db.all<{
      id: number;
      file_path: string;
      file_size: number;
      content_hash: string;
    }>(
      'SELECT id, file_path, file_size, content_hash FROM cache_assets WHERE reference_count = 0'
    );

    logger.info(`Found ${orphans.length} orphaned cache assets`, { dryRun });

    if (dryRun) {
      const totalSize = orphans.reduce((sum, asset) => sum + asset.file_size, 0);
      return {
        deleted: orphans.length,
        freedBytes: totalSize,
        errors: 0,
      };
    }

    let deleted = 0;
    let freedBytes = 0;
    let errors = 0;

    for (const orphan of orphans) {
      try {
        // Delete file from filesystem
        await fs.unlink(orphan.file_path);

        // Delete database record
        await this.db.run('DELETE FROM cache_assets WHERE id = ?', [orphan.id]);

        deleted++;
        freedBytes += orphan.file_size;

        logger.debug('Deleted orphaned cache asset', {
          id: orphan.id,
          contentHash: orphan.content_hash,
          size: orphan.file_size,
        });
      } catch (error) {
        errors++;
        logger.error('Failed to delete orphaned cache asset', {
          id: orphan.id,
          path: orphan.file_path,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.info('Orphan cleanup complete', { deleted, freedBytes, errors });

    return { deleted, freedBytes, errors };
  }

  /**
   * Get cache statistics
   */
  public async getStats(): Promise<{
    totalAssets: number;
    totalSize: number;
    orphanedAssets: number;
    orphanedSize: number;
  }> {
    if (!this.db) {
      throw new Error('Cache service not initialized');
    }

    const stats = await this.db.get<{
      total_assets: number;
      total_size: number;
      orphaned_assets: number;
      orphaned_size: number;
    }>(
      `SELECT
        COUNT(*) as total_assets,
        SUM(file_size) as total_size,
        SUM(CASE WHEN reference_count = 0 THEN 1 ELSE 0 END) as orphaned_assets,
        SUM(CASE WHEN reference_count = 0 THEN file_size ELSE 0 END) as orphaned_size
      FROM cache_assets`
    );

    return {
      totalAssets: stats?.total_assets || 0,
      totalSize: stats?.total_size || 0,
      orphanedAssets: stats?.orphaned_assets || 0,
      orphanedSize: stats?.orphaned_size || 0,
    };
  }

  /**
   * Verify cache integrity
   * Check if files exist on disk and hashes match
   */
  public async verifyIntegrity(): Promise<{
    total: number;
    valid: number;
    missing: number;
    corrupted: number;
  }> {
    if (!this.db) {
      throw new Error('Cache service not initialized');
    }

    const assets = await this.db.all<{
      id: number;
      content_hash: string;
      file_path: string;
    }>('SELECT id, content_hash, file_path FROM cache_assets');

    let valid = 0;
    let missing = 0;
    let corrupted = 0;

    for (const asset of assets) {
      try {
        // Check if file exists
        await fs.access(asset.file_path);

        // Verify hash
        const actualHash = await this.calculateFileHash(asset.file_path);
        if (actualHash === asset.content_hash) {
          valid++;
        } else {
          corrupted++;
          logger.warn('Cache asset hash mismatch', {
            id: asset.id,
            expectedHash: asset.content_hash,
            actualHash,
          });
        }
      } catch (error) {
        missing++;
        logger.warn('Cache asset file missing', {
          id: asset.id,
          path: asset.file_path,
        });
      }
    }

    logger.info('Cache integrity check complete', {
      total: assets.length,
      valid,
      missing,
      corrupted,
    });

    return {
      total: assets.length,
      valid,
      missing,
      corrupted,
    };
  }
}

// Export singleton instance
export const cacheService = CacheService.getInstance();
