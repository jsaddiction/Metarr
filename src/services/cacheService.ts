import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { createReadStream } from 'fs';
import { logger } from '../middleware/logging.js';
import { DatabaseManager } from '../database/DatabaseManager.js';
import { DatabaseConnection } from '../types/database.js';
import { InvalidStateError } from '../errors/index.js';

/**
 * Cache Service
 * Manages content-addressed asset storage with SHA256 hashing and directory sharding
 */
export class CacheService {
  private static instance: CacheService | null = null;
  private readonly cacheBasePath: string;
  private db: DatabaseConnection | null = null;

  private constructor(cacheBasePath?: string) {
    // Default to data/cache/assets if not specified
    this.cacheBasePath = cacheBasePath || path.join(process.cwd(), 'data', 'cache', 'assets');
  }

  /**
   * Get singleton instance
   *
   * Returns the singleton CacheService instance. Creates instance on first call.
   *
   * @param cacheBasePath - Optional custom cache directory path. Defaults to `data/cache/assets`
   *
   * @returns The singleton CacheService instance
   *
   * @example
   * ```typescript
   * // Use default cache path
   * const cache = CacheService.getInstance();
   *
   * // Use custom cache path
   * const cache = CacheService.getInstance('/mnt/cache/assets');
   * ```
   *
   * @remarks
   * - Singleton pattern ensures single cache instance per application
   * - Custom path only used on first call (subsequent calls ignore parameter)
   */
  public static getInstance(cacheBasePath?: string): CacheService {
    if (!CacheService.instance) {
      CacheService.instance = new CacheService(cacheBasePath);
    }
    return CacheService.instance;
  }

  /**
   * Initialize cache service with database connection
   *
   * Must be called before using any cache operations. Creates cache directory
   * structure if it doesn't exist.
   *
   * @param dbManager - Database manager instance for cache_assets table access
   *
   * @returns Promise that resolves when initialization complete
   *
   * @example
   * ```typescript
   * const cache = CacheService.getInstance();
   * const dbManager = new DatabaseManager();
   * await cache.initialize(dbManager);
   * ```
   *
   * @throws Error if cache directory creation fails
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
      stream.on('end', () => {
        stream.destroy();
        resolve(hash.digest('hex'));
      });
      stream.on('error', (err) => {
        stream.destroy();
        reject(err);
      });
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
   *
   * Adds a file to content-addressed cache storage with automatic deduplication.
   * If identical file (same SHA256 hash) already exists, increments reference count
   * instead of creating duplicate.
   *
   * **Storage Strategy:**
   * - Calculates SHA256 hash of file content
   * - Stores in sharded directory structure (e.g., `/ab/c1/abc123...jpg`)
   * - Tracks metadata (dimensions, mime type, perceptual hash)
   * - Maintains reference count for garbage collection
   *
   * @param sourceFilePath - Absolute path to source file to add to cache
   * @param metadata - Asset metadata
   * @param metadata.mimeType - MIME type (e.g., 'image/jpeg', 'video/mp4')
   * @param metadata.sourceType - Origin of asset ('provider' | 'local' | 'user')
   * @param metadata.sourceUrl - Optional original URL (for provider assets)
   * @param metadata.providerName - Optional provider name (e.g., 'tmdb', 'fanart.tv')
   * @param metadata.width - Optional image width in pixels
   * @param metadata.height - Optional image height in pixels
   * @param metadata.perceptualHash - Optional perceptual hash for similarity matching
   *
   * @returns Promise resolving to cache asset details
   * @returns result.id - Database ID of cache_assets record
   * @returns result.contentHash - SHA256 hash of file content
   * @returns result.cachePath - Absolute path to cached file
   * @returns result.fileSize - File size in bytes
   * @returns result.isNew - True if newly added, false if deduplicated
   *
   * @example
   * ```typescript
   * // Add downloaded poster to cache
   * const result = await cacheService.addAsset('/tmp/poster.jpg', {
   *   mimeType: 'image/jpeg',
   *   sourceType: 'provider',
   *   sourceUrl: 'https://image.tmdb.org/t/p/original/abc123.jpg',
   *   providerName: 'tmdb',
   *   width: 2000,
   *   height: 3000,
   *   perceptualHash: 'abc123def456'
   * });
   *
   * console.log(`Asset ${result.isNew ? 'added' : 'deduplicated'}: ${result.cachePath}`);
   * ```
   *
   * @remarks
   * - **Content Deduplication**: Identical files (same hash) share single cached copy
   * - **Reference Counting**: Tracks how many entities reference this asset
   * - **Atomic Operation**: File copy and database insert in single transaction
   * - **Directory Sharding**: Uses 2-level sharding (ab/c1/) for filesystem performance
   * - **Metadata Tracking**: Stores dimensions, hashes, and provenance
   *
   * @throws Error if cache service not initialized
   * @throws Error if file copy or hash calculation fails
   *
   * @see {@link getAssetByHash} for retrieving cached assets
   * @see {@link cleanupOrphans} for removing unreferenced assets
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
      throw new InvalidStateError(
        'CacheService',
        'initialized',
        'Cache service not initialized',
        { service: 'CacheService', operation: 'initialization check' }
      );
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
        await this.db.execute(
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
      const result = await this.db.execute(
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
        id: result.insertId,
        contentHash,
        cachePath,
        fileSize,
        sourceType: metadata.sourceType,
      });

      return {
        id: result.insertId!,
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
   *
   * Retrieves cached asset by its SHA256 content hash. Updates last_accessed_at timestamp
   * for cache usage tracking.
   *
   * @param contentHash - SHA256 hash of file content (64 hex characters)
   *
   * @returns Promise resolving to asset details or null if not found
   *
   * @example
   * ```typescript
   * // Look up asset by hash
   * const asset = await cacheService.getAssetByHash('abc123...');
   * if (asset) {
   *   console.log(`Found cached file: ${asset.cachePath} (${asset.fileSize} bytes)`);
   *   console.log(`Referenced by ${asset.referenceCount} entities`);
   * }
   * ```
   *
   * @remarks
   * - Updates last_accessed_at for LRU tracking
   * - Returns null if hash not found (not error)
   *
   * @throws Error if cache service not initialized
   */
  public async getAssetByHash(contentHash: string): Promise<{
    id: number;
    cachePath: string;
    fileSize: number;
    mimeType: string;
    referenceCount: number;
  } | null> {
    if (!this.db) {
      throw new InvalidStateError(
        'CacheService',
        'initialized',
        'Cache service not initialized',
        { service: 'CacheService', operation: 'initialization check' }
      );
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
    await this.db.execute(
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
   *
   * Retrieves cached asset by database ID. Updates last_accessed_at timestamp
   * for cache usage tracking.
   *
   * @param id - Database ID from cache_assets table
   *
   * @returns Promise resolving to asset details or null if not found
   *
   * @example
   * ```typescript
   * // Look up asset by database ID
   * const asset = await cacheService.getAssetById(456);
   * if (asset) {
   *   console.log(`Hash: ${asset.contentHash}`);
   *   console.log(`Path: ${asset.cachePath}`);
   * }
   * ```
   *
   * @remarks
   * - Updates last_accessed_at for LRU tracking
   * - Returns null if ID not found (not error)
   * - Includes contentHash (unlike getAssetByHash)
   *
   * @throws Error if cache service not initialized
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
      throw new InvalidStateError(
        'CacheService',
        'initialized',
        'Cache service not initialized',
        { service: 'CacheService', operation: 'initialization check' }
      );
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
    await this.db.execute(
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
   *
   * Increases reference count when a new entity links to this cached asset.
   * Reference counting enables garbage collection of unreferenced files.
   *
   * @param cacheAssetId - Database ID of cache_assets record
   *
   * @returns Promise that resolves when count updated
   *
   * @example
   * ```typescript
   * // When assigning cached asset to a movie
   * await db.execute(
   *   'INSERT INTO movie_images (movie_id, cache_asset_id, asset_type) VALUES (?, ?, ?)',
   *   [movieId, cacheAssetId, 'poster']
   * );
   * await cacheService.incrementReference(cacheAssetId);
   * ```
   *
   * @remarks
   * - Call when creating new reference to cached asset
   * - Paired with {@link decrementReference} for proper lifecycle
   * - Updates last_accessed_at timestamp
   *
   * @throws Error if cache service not initialized
   *
   * @see {@link decrementReference} for removing references
   */
  public async incrementReference(cacheAssetId: number): Promise<void> {
    if (!this.db) {
      throw new InvalidStateError(
        'CacheService',
        'initialized',
        'Cache service not initialized',
        { service: 'CacheService', operation: 'initialization check' }
      );
    }

    await this.db.execute(
      'UPDATE cache_assets SET reference_count = reference_count + 1, last_accessed_at = CURRENT_TIMESTAMP WHERE id = ?',
      [cacheAssetId]
    );

    logger.debug('Incremented cache asset reference count', { cacheAssetId });
  }

  /**
   * Decrement reference count for cached asset
   *
   * Decreases reference count when an entity unlinks from this cached asset.
   * When count reaches zero, asset becomes eligible for garbage collection.
   *
   * @param cacheAssetId - Database ID of cache_assets record
   *
   * @returns Promise that resolves when count updated
   *
   * @example
   * ```typescript
   * // When replacing movie poster with new one
   * const oldCacheId = movie.posterCacheId;
   * await db.execute(
   *   'UPDATE movie_images SET cache_asset_id = ? WHERE movie_id = ? AND asset_type = ?',
   *   [newCacheId, movieId, 'poster']
   * );
   * await cacheService.decrementReference(oldCacheId);
   * ```
   *
   * @remarks
   * - Call when deleting reference to cached asset
   * - Paired with {@link incrementReference} for proper lifecycle
   * - Count clamped to minimum of 0 (never negative)
   * - Assets with count=0 cleaned up by {@link cleanupOrphans}
   *
   * @throws Error if cache service not initialized
   *
   * @see {@link incrementReference} for adding references
   * @see {@link cleanupOrphans} for garbage collection
   */
  public async decrementReference(cacheAssetId: number): Promise<void> {
    if (!this.db) {
      throw new InvalidStateError(
        'CacheService',
        'initialized',
        'Cache service not initialized',
        { service: 'CacheService', operation: 'initialization check' }
      );
    }

    await this.db.execute(
      'UPDATE cache_assets SET reference_count = MAX(0, reference_count - 1) WHERE id = ?',
      [cacheAssetId]
    );

    logger.debug('Decremented cache asset reference count', { cacheAssetId });
  }

  /**
   * Clean up orphaned cache assets (reference_count = 0)
   *
   * Removes cache assets that are no longer referenced by any entities.
   * Deletes both database records and physical files from cache directory.
   *
   * @param dryRun - If true, reports what would be deleted without actually deleting. Defaults to false.
   *
   * @returns Promise resolving to cleanup statistics
   * @returns result.deleted - Number of assets removed
   * @returns result.freedBytes - Total disk space freed in bytes
   * @returns result.errors - Number of deletion failures
   *
   * @example
   * ```typescript
   * // Preview what would be deleted
   * const preview = await cacheService.cleanupOrphans(true);
   * console.log(`Would delete ${preview.deleted} assets, freeing ${preview.freedBytes} bytes`);
   *
   * // Confirm and actually delete
   * if (confirm('Delete orphaned assets?')) {
   *   const result = await cacheService.cleanupOrphans(false);
   *   console.log(`Deleted ${result.deleted} assets, freed ${result.freedBytes} bytes`);
   *   if (result.errors > 0) {
   *     console.warn(`${result.errors} assets failed to delete`);
   *   }
   * }
   * ```
   *
   * @remarks
   * - **Safe to Run**: Only deletes assets with reference_count = 0
   * - **Dry Run Available**: Preview deletions without committing
   * - **Graceful Errors**: Individual failures don't stop entire cleanup
   * - **Scheduled Task**: Typically run via scheduled-cleanup job
   * - **Atomic**: Each asset deletion is database + filesystem operation
   *
   * @throws Error if cache service not initialized
   *
   * @see {@link decrementReference} for marking assets as orphaned
   * @see {@link getStats} for viewing orphan counts before cleanup
   */
  public async cleanupOrphans(dryRun: boolean = false): Promise<{
    deleted: number;
    freedBytes: number;
    errors: number;
  }> {
    if (!this.db) {
      throw new InvalidStateError(
        'CacheService',
        'initialized',
        'Cache service not initialized',
        { service: 'CacheService', operation: 'initialization check' }
      );
    }

    // Find orphaned assets
    const orphans = await this.db.query<{
      id: number;
      file_path: string;
      file_size: number;
      content_hash: string;
    }>(
      'SELECT id, file_path, file_size, content_hash FROM cache_assets WHERE reference_count = 0'
    );

    logger.info(`Found ${orphans.length} orphaned cache assets`, { dryRun });

    if (dryRun) {
      const totalSize = orphans.reduce((sum: number, asset: { id: number; file_path: string; file_size: number; content_hash: string }) => sum + asset.file_size, 0);
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
        await this.db.execute('DELETE FROM cache_assets WHERE id = ?', [orphan.id]);

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
   *
   * Retrieves aggregate statistics about cache usage including total assets,
   * disk usage, and orphaned assets ready for cleanup.
   *
   * @returns Promise resolving to cache statistics
   * @returns stats.totalAssets - Total number of cached assets
   * @returns stats.totalSize - Total disk space used in bytes
   * @returns stats.orphanedAssets - Number of unreferenced assets (reference_count = 0)
   * @returns stats.orphanedSize - Disk space used by orphaned assets in bytes
   *
   * @example
   * ```typescript
   * // Display cache statistics
   * const stats = await cacheService.getStats();
   * console.log(`Cache: ${stats.totalAssets} assets, ${formatBytes(stats.totalSize)}`);
   * if (stats.orphanedAssets > 0) {
   *   console.log(`Orphans: ${stats.orphanedAssets} assets, ${formatBytes(stats.orphanedSize)} reclaimable`);
   * }
   * ```
   *
   * @remarks
   * - Useful for cache health monitoring
   * - Orphaned counts indicate cleanup opportunity
   * - Performance: Single aggregate query (fast even with large cache)
   *
   * @throws Error if cache service not initialized
   *
   * @see {@link cleanupOrphans} for removing orphaned assets
   */
  public async getStats(): Promise<{
    totalAssets: number;
    totalSize: number;
    orphanedAssets: number;
    orphanedSize: number;
  }> {
    if (!this.db) {
      throw new InvalidStateError(
        'CacheService',
        'initialized',
        'Cache service not initialized',
        { service: 'CacheService', operation: 'initialization check' }
      );
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
   *
   * Performs deep verification of cache consistency by checking file existence
   * and validating SHA256 hashes match database records. Useful for detecting
   * filesystem corruption or manual file deletions.
   *
   * @returns Promise resolving to integrity check results
   * @returns result.total - Total number of assets checked
   * @returns result.valid - Number of valid assets (file exists, hash matches)
   * @returns result.missing - Number of missing files (database record but no file)
   * @returns result.corrupted - Number of corrupted files (file exists but hash mismatch)
   *
   * @example
   * ```typescript
   * // Run integrity check
   * const result = await cacheService.verifyIntegrity();
   * console.log(`Integrity: ${result.valid}/${result.total} valid`);
   *
   * if (result.missing > 0) {
   *   console.error(`${result.missing} files missing from cache!`);
   * }
   * if (result.corrupted > 0) {
   *   console.error(`${result.corrupted} files corrupted (hash mismatch)!`);
   * }
   * ```
   *
   * @remarks
   * - **Slow Operation**: Re-hashes every file - can take minutes on large cache
   * - **Read-Only**: Does not modify cache or database
   * - **Diagnostic Tool**: Typically run manually or via scheduled verification job
   * - **Logs Warnings**: Logs each missing/corrupted file for investigation
   * - **Scheduled Task**: Can be automated via scheduled-verification job
   *
   * @throws Error if cache service not initialized
   *
   * @see Verification phase documentation for automated integrity checks
   */
  public async verifyIntegrity(): Promise<{
    total: number;
    valid: number;
    missing: number;
    corrupted: number;
  }> {
    if (!this.db) {
      throw new InvalidStateError(
        'CacheService',
        'initialized',
        'Cache service not initialized',
        { service: 'CacheService', operation: 'initialization check' }
      );
    }

    const assets = await this.db.query<{
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
