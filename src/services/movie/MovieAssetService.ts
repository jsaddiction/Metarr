import { DatabaseManager } from '../../database/DatabaseManager.js';
import { SqlParam } from '../../types/database.js';
import { logger } from '../../middleware/logging.js';
import fs from 'fs/promises';
import * as fsSync from 'fs';
import path from 'path';
import crypto from 'crypto';
import { hashSmallFile } from '../hash/hashService.js';
import { getDefaultMaxCount } from '../../config/assetTypeDefaults.js';
import https from 'https';
import http from 'http';
import { createErrorLogContext, getErrorMessage } from '../../utils/errorHandling.js';
import { imageProcessor } from '../../utils/ImageProcessor.js';
import {
  ResourceNotFoundError,
  ResourceAlreadyExistsError,
  ResourceExhaustedError,
  ValidationError,
  NetworkError,
  ErrorCode,
} from '../../errors/index.js';

/**
 * Asset quality thresholds for warning detection
 */
const ASSET_QUALITY_THRESHOLDS = {
  /** Minimum width for acceptable poster quality */
  POSTER_MIN_WIDTH: 500,

  /** Minimum width for acceptable fanart quality */
  FANART_MIN_WIDTH: 1280,
} as const;

/**
 * MovieAssetService
 *
 * Handles the complete asset pipeline for movies:
 * - Save asset selections with parallel download
 * - Replace all assets of a type atomically (snapshot operation)
 * - Add/remove individual assets
 * - Toggle asset type locks
 * - Count assets by type
 * - Download files from URLs
 *
 * Two-Copy Architecture:
 * 1. CACHE (Protected): Content-addressed storage with deduplication
 * 2. LIBRARY (Working): Kodi-compliant naming for player scanning
 *
 * Lock Policy:
 * - This service does NOT check locks before operations
 * - UI requests: Users can always edit (caller doesn't check)
 * - Automated jobs: MUST check locks before calling these methods
 */
export class MovieAssetService {
  constructor(private readonly db: DatabaseManager) {}

  /**
   * Save asset selections for a movie
   * Downloads assets from provider URLs, stores in cache, creates library copies
   *
   * Performance Optimization:
   * - Processes assets in parallel for 70-80% speed improvement
   * - BEFORE: Sequential processing (5 assets × 1s each = 5s total)
   * - AFTER: Parallel processing (5 assets = ~1s total)
   *
   * @param movieId - Movie ID
   * @param selections - Asset selections (assetType -> {url, provider, metadata})
   * @param metadata - Optional metadata updates to apply
   * @returns Results with saved assets and errors
   */
  async saveAssets(movieId: number, selections: Record<string, unknown>, metadata?: unknown): Promise<{
    success: boolean;
    savedAssets: Array<{
      assetType: string;
      cacheAssetId: number;
      cachePath: string;
      libraryPath: string;
      isNew: boolean;
    }>;
    errors: string[];
  }> {
    const conn = this.db.getConnection();

    try {
      const results = {
        success: true,
        savedAssets: [] as Array<{
          assetType: string;
          cacheAssetId: number;
          cachePath: string;
          libraryPath: string;
          isNew: boolean;
        }>,
        errors: [] as string[],
      };

      // Get movie details
      const movieResults = await conn.query(
        'SELECT id, file_path, title, year FROM movies WHERE id = ?',
        [movieId]
      );

      if (!movieResults || movieResults.length === 0) {
        throw new ResourceNotFoundError(
          'movie',
          movieId,
          'Movie not found for asset save operation',
          { service: 'MovieAssetService', operation: 'saveAssets' }
        );
      }

      const movie = movieResults[0];
      const movieDir = path.dirname(movie.file_path);
      const movieFileName = path.parse(movie.file_path).name;

      // Update metadata if provided
      if (metadata) {
        // Build the UPDATE query dynamically based on provided fields
        const updateFields: string[] = [];
        const updateValues: SqlParam[] = [];

        // Metadata fields that can be updated
        const allowedFields = [
          'title',
          'original_title',
          'sort_title',
          'year',
          'plot',
          'outline',
          'tagline',
          'content_rating',
          'release_date',
          'user_rating',
          'trailer_url',
          // Lock fields
          'title_locked',
          'original_title_locked',
          'sort_title_locked',
          'year_locked',
          'plot_locked',
          'outline_locked',
          'tagline_locked',
          'content_rating_locked',
          'release_date_locked',
          'user_rating_locked',
          'trailer_url_locked',
        ];

        for (const field of allowedFields) {
          if (Object.prototype.hasOwnProperty.call(metadata, field)) {
            updateFields.push(`${field} = ?`);
            updateValues.push((metadata as Record<string, SqlParam>)[field]);
          }
        }

        if (updateFields.length > 0) {
          // Add movieId to the end of the values array
          updateValues.push(movieId);

          const query = `UPDATE movies SET ${updateFields.join(', ')} WHERE id = ?`;

          await conn.execute(query, updateValues);

          logger.info('Movie metadata updated', { movieId, updatedFields: Object.keys(metadata) });
        }
      }

      // Process each asset selection in parallel for 70-80% speed improvement
      // BEFORE: Sequential processing (5 assets × 1s each = 5s total)
      // AFTER: Parallel processing (5 assets = ~1s total)
      const assetPromises = Object.entries(selections).map(async ([assetType, assetData]) => {
        try {
          const asset = assetData as Record<string, unknown>;

          if (!asset.url) {
            return { error: `Asset ${assetType}: No URL provided` };
          }

          // Download asset to temporary location
          const assetUrl = String(asset.url ?? '');
          const tempFilePath = path.join(process.cwd(), 'data', 'temp', `${crypto.randomBytes(16).toString('hex')}${path.extname(assetUrl)}`);
          await fs.mkdir(path.dirname(tempFilePath), { recursive: true });

          await this.downloadFile(assetUrl, tempFilePath);

          // Get image dimensions using centralized ImageProcessor
          let width: number | undefined;
          let height: number | undefined;

          try {
            const analysis = await imageProcessor.analyzeImage(tempFilePath);
            width = analysis.width;
            height = analysis.height;
          } catch (_error) {
            logger.warn('Could not get image dimensions', { assetType, url: asset.url });
          }

          // Store in cache using content-addressed storage
          // Compute SHA256 hash and create sharded cache path
          const hashResult = await hashSmallFile(tempFilePath);
          const contentHash = hashResult.hash;
          const fileSize = hashResult.fileSize;

          // Create sharded cache path: ab/c1/abc123...jpg
          const shard1 = contentHash.substring(0, 2);
          const shard2 = contentHash.substring(2, 4);
          const cacheBasePath = path.join(process.cwd(), 'data', 'cache', 'assets');
          const extension = path.extname(tempFilePath);
          const cachePath = path.join(cacheBasePath, shard1, shard2, `${contentHash}${extension}`);

          // Ensure cache directories exist
          await fs.mkdir(path.dirname(cachePath), { recursive: true });

          // Copy file to cache if not already cached
          try {
            await fs.access(cachePath);
            logger.debug('Asset already in cache', { contentHash: contentHash.substring(0, 8) });
          } catch {
            // File doesn't exist, copy it
            await fs.copyFile(tempFilePath, cachePath);
            logger.debug('Asset copied to cache', { contentHash: contentHash.substring(0, 8), cachePath });
          }

          const cacheResult = { cachePath, contentHash, fileSize, isNew: true };

          // Create library copy with Kodi naming convention
          const libraryFileName = `${movieFileName}-${assetType}${path.extname(tempFilePath)}`;
          const libraryPath = path.join(movieDir, libraryFileName);

          await fs.copyFile(cacheResult.cachePath, libraryPath);

          // Insert or update image record in database using split cache/library tables
          // Check for existing cache copy
          const existingCache = await conn.get(
            'SELECT id FROM cache_image_files WHERE entity_type = ? AND entity_id = ? AND image_type = ?',
            ['movie', movieId, assetType]
          );

          let cacheFileId: number;

          if (existingCache) {
            // Update existing cache copy
            await conn.execute(
              `UPDATE cache_image_files SET
                file_path = ?,
                file_name = ?,
                file_size = ?,
                file_hash = ?,
                width = ?,
                height = ?,
                format = ?,
                source_type = ?,
                source_url = ?,
                provider_name = ?
              WHERE id = ?`,
              [
                cacheResult.cachePath,
                path.basename(cacheResult.cachePath),
                cacheResult.fileSize,
                cacheResult.contentHash,
                width,
                height,
                path.extname(tempFilePath).substring(1), // Remove leading dot
                'provider',
                asset.url,
                asset.provider,
                existingCache.id
              ]
            );
            cacheFileId = existingCache.id;
          } else {
            // Insert new cache copy
            const result = await conn.execute(
              `INSERT INTO cache_image_files (
                entity_type, entity_id, image_type, file_path, file_name,
                file_size, file_hash, width, height, format,
                source_type, source_url, provider_name
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                'movie',
                movieId,
                assetType,
                cacheResult.cachePath,
                path.basename(cacheResult.cachePath),
                cacheResult.fileSize,
                cacheResult.contentHash,
                width,
                height,
                path.extname(tempFilePath).substring(1) || 'jpg',
                'provider',
                String(asset.url ?? ''),
                String(asset.provider ?? '')
              ]
            );
            cacheFileId = result.insertId!;
          }

          // Check for existing library copy
          const existingLibrary = await conn.get(
            'SELECT id FROM library_image_files WHERE cache_file_id = ?',
            [cacheFileId]
          );

          if (existingLibrary) {
            // Update existing library copy
            await conn.execute(
              `UPDATE library_image_files SET file_path = ? WHERE id = ?`,
              [libraryPath, existingLibrary.id]
            );
          } else {
            // Insert new library copy
            await conn.execute(
              `INSERT INTO library_image_files (cache_file_id, file_path)
               VALUES (?, ?)`,
              [cacheFileId, libraryPath]
            );
          }

          // Clean up temp file
          try {
            await fs.unlink(tempFilePath);
          } catch (_error) {
            // Ignore cleanup errors
          }

          logger.info('Saved asset', {
            movieId,
            assetType,
            provider: asset.provider,
            cacheAssetId: cacheFileId,
            isNew: cacheResult.isNew,
          });

          return {
            success: {
              assetType,
              cacheAssetId: cacheFileId,
              cachePath: cacheResult.cachePath,
              libraryPath,
              isNew: cacheResult.isNew,
            }
          };

        } catch (error) {
          logger.error('Failed to save asset', createErrorLogContext(error, {
            movieId,
            assetType
          }));
          return { error: `Asset ${assetType}: ${getErrorMessage(error)}` };
        }
      });

      // Wait for all asset operations to complete
      const assetResults = await Promise.allSettled(assetPromises);

      // Collect results
      for (const result of assetResults) {
        if (result.status === 'fulfilled') {
          if (result.value.success) {
            results.savedAssets.push(result.value.success);
          } else if (result.value.error) {
            results.errors.push(result.value.error);
          }
        } else {
          results.errors.push(`Unexpected error: ${result.reason}`);
        }
      }

      logger.info('Asset save complete', {
        movieId,
        savedCount: results.savedAssets.length,
        errorCount: results.errors.length,
      });

      return results;

    } catch (error) {
      logger.error('Failed to save assets', createErrorLogContext(error, {
        movieId
      }));
      throw error;
    }
  }

  /**
   * Replace all assets of a specific type (atomic snapshot operation)
   *
   * Atomically replaces all assets for an entity/type:
   * 1. Validate count against configured limit
   * 2. Delete all current assets EXCEPT those with IDs in keepIds
   * 3. Download and cache new assets from provider URLs
   * 4. Lock the asset type field to prevent automation overwrite
   *
   * Lock Policy: This method does NOT check locks - caller must handle:
   * - UI requests: Users can always edit (don't check)
   * - Automated jobs: MUST check locks before calling
   *
   * @param movieId - Entity ID
   * @param assetType - Asset type (poster, fanart, banner, clearlogo, clearart, landscape, keyart, discart)
   * @param assets - Complete snapshot of desired assets:
   *   - Keep existing: {imageFileId: 123, ...}
   *   - Add new: {url: 'https://...', provider: 'tmdb', ...}
   * @returns Counts of added/removed/kept assets plus any errors/warnings
   */
  async replaceAssets(
    movieId: number,
    assetType: string,
    assets: Array<{
      url: string;
      provider: string;
      width?: number;
      height?: number;
      perceptualHash?: string;
      imageFileId?: number; // For keeping existing assets
    }>
  ): Promise<{
    success: boolean;
    added: number;
    removed: number;
    kept: number;
    errors: string[];
    warnings: string[];
  }> {
    const conn = this.db.getConnection();

    try {
      const result = {
        success: true,
        added: 0,
        removed: 0,
        kept: 0,
        errors: [] as string[],
        warnings: [] as string[]
      };

      // Get movie details
      const movieResults = await conn.query(
        'SELECT id, file_path, title, year FROM movies WHERE id = ?',
        [movieId]
      );

      if (!movieResults || movieResults.length === 0) {
        throw new ResourceNotFoundError(
          'movie',
          movieId,
          'Movie not found for asset replacement',
          { service: 'MovieAssetService', operation: 'replaceAssets', metadata: { assetType } }
        );
      }

      // NOTE: Lock checking removed from service layer - this is the caller's responsibility
      // - UI requests: Should NOT check locks (users can always edit their selections)
      // - Automated jobs: MUST check locks before calling this method

      // Get asset limit configuration from app_settings
      const key = `asset_limit_${assetType}`;
      const limitResults = await conn.query(
        'SELECT value FROM app_settings WHERE key = ?',
        [key]
      );

      let maxLimit = 1; // Default fallback
      if (limitResults.length > 0) {
        maxLimit = parseInt(limitResults[0].value, 10);
      } else {
        // Use default from config if not set in database
        maxLimit = getDefaultMaxCount(assetType);
      }

      // Validate asset count doesn't exceed limit
      if (assets.length > maxLimit) {
        throw new ResourceExhaustedError(
          'asset',
          `Cannot add ${assets.length} ${assetType}(s). Maximum allowed: ${maxLimit}`,
          { service: 'MovieAssetService', operation: 'replaceAssets', metadata: { movieId, assetType, assetCount: assets.length, maxLimit } }
        );
      }

      // SIMPLE SNAPSHOT APPROACH: Delete all, then add exactly what user selected
      // This ensures the cache state exactly matches what the user sees in the UI

      // Step 1: Get all current assets of this type
      const currentAssets = await conn.query<{ id: number; file_path: string | null }>(
        `SELECT id, file_path FROM cache_image_files
         WHERE entity_type = 'movie' AND entity_id = ? AND image_type = ?`,
        [movieId, assetType]
      );

      // Step 2: Collect IDs that should be kept (existing assets user wants to keep)
      const keepIds = new Set(assets.map(a => a.imageFileId).filter(Boolean));

      // Step 3: Delete ALL current assets that are NOT in the keep list
      for (const current of currentAssets) {
        if (!keepIds.has(current.id)) {
          try {
            // Delete file from disk (ignore if already deleted)
            if (current.file_path) {
              await fs.unlink(current.file_path).catch(() => {});
            }
            // Delete from database
            await conn.execute('DELETE FROM cache_image_files WHERE id = ?', [current.id]);
            result.removed++;
          } catch (error) {
            result.errors.push(`Failed to remove asset ${current.id}: ${getErrorMessage(error)}`);
            logger.error('Failed to delete cache asset', createErrorLogContext(error, {
              imageFileId: current.id,
              assetType
            }));
          }
        } else {
          result.kept++;
        }
      }

      // Step 4: Add all NEW assets (those without imageFileId)
      for (const asset of assets) {
        if (asset.imageFileId) continue; // Already kept in step 3

        try {
          await this.addAsset(movieId, assetType, asset);
          result.added++;
        } catch (error) {
          result.errors.push(`Failed to add asset from ${asset.provider}: ${getErrorMessage(error)}`);
          logger.error('Failed to download and cache asset', createErrorLogContext(error, {
            movieId,
            assetType,
            provider: asset.provider
          }));
        }
      }

      // Add warnings for quality issues (optional enhancement)
      for (const asset of assets) {
        if (asset.width && asset.height) {
          // Example: Warn about low resolution posters
          if (assetType === 'poster' && asset.width < ASSET_QUALITY_THRESHOLDS.POSTER_MIN_WIDTH) {
            result.warnings.push(`Poster from ${asset.provider} has low resolution (${asset.width}x${asset.height}). Consider selecting a higher quality image.`);
          }
          if (assetType === 'fanart' && asset.width < ASSET_QUALITY_THRESHOLDS.FANART_MIN_WIDTH) {
            result.warnings.push(`Fanart from ${asset.provider} has low resolution (${asset.width}x${asset.height}). HD fanart is typically 1920x1080 or higher.`);
          }
        }
      }

      // Lock the asset type field since user manually selected these assets
      // This prevents auto-enrich from overwriting user's manual selections
      const lockFieldName = `${assetType}_locked`;
      await conn.execute(
        `UPDATE movies SET ${lockFieldName} = 1 WHERE id = ?`,
        [movieId]
      );

      logger.info('Replaced assets and locked field', {
        movieId,
        assetType,
        lockField: lockFieldName,
        added: result.added,
        removed: result.removed,
        kept: result.kept,
        totalErrors: result.errors.length,
        totalWarnings: result.warnings.length
      });

      return result;

    } catch (error) {
      logger.error('Failed to replace assets', createErrorLogContext(error, {
        movieId,
        assetType
      }));
      throw error;
    }
  }

  /**
   * Add an asset to a movie from a provider URL
   * Downloads asset, stores in cache, validates against limits
   *
   * NOTE: Does NOT check field locks - caller is responsible for lock enforcement
   *
   * Part of multi-asset selection feature
   *
   * @param movieId - Movie ID
   * @param assetType - Asset type
   * @param assetData - Asset data (url, provider, dimensions, hash)
   * @returns Result with imageFileId and cachePath
   */
  async addAsset(
    movieId: number,
    assetType: string,
    assetData: {
      url: string;
      provider: string;
      width?: number;
      height?: number;
      perceptualHash?: string;
    }
  ): Promise<{ success: boolean; imageFileId: number; cachePath: string }> {
    const conn = this.db.getConnection();

    try {
      // Get movie details
      const movieResults = await conn.query(
        'SELECT id, file_path, title, year FROM movies WHERE id = ?',
        [movieId]
      );

      if (!movieResults || movieResults.length === 0) {
        throw new ResourceNotFoundError(
          'movie',
          movieId,
          'Movie not found for asset addition',
          { service: 'MovieAssetService', operation: 'addAsset', metadata: { assetType, provider: assetData.provider } }
        );
      }

      // NOTE: Lock checking removed - caller (replaceAssets) is responsible for lock enforcement

      // Check if we already have this asset (by source_url or perceptual_hash)
      const existing = await conn.query(
        `SELECT id FROM cache_image_files
         WHERE entity_type = 'movie' AND entity_id = ? AND image_type = ?
           AND (source_url = ? OR (perceptual_hash IS NOT NULL AND perceptual_hash = ?))`,
        [movieId, assetType, assetData.url, assetData.perceptualHash || null]
      );

      if (existing.length > 0) {
        throw new ResourceAlreadyExistsError(
          'asset',
          existing[0].id,
          'Asset already exists for this movie',
          { service: 'MovieAssetService', operation: 'addAsset', metadata: { movieId, assetType, url: assetData.url, existingId: existing[0].id } }
        );
      }

      // Download asset to temporary location
      const tempFilePath = path.join(
        process.cwd(),
        'data',
        'temp',
        `${crypto.randomBytes(16).toString('hex')}${path.extname(assetData.url)}`
      );
      await fs.mkdir(path.dirname(tempFilePath), { recursive: true });

      await this.downloadFile(assetData.url, tempFilePath);

      // Get image metadata
      const stats = await fs.stat(tempFilePath);
      let width = assetData.width;
      let height = assetData.height;
      let format: string | undefined;

      try {
        const analysis = await imageProcessor.analyzeImage(tempFilePath);
        width = analysis.width;
        height = analysis.height;
        format = analysis.format;
      } catch (_error) {
        logger.warn('Could not get image dimensions', { assetType, url: assetData.url });
      }

      // Calculate file hash
      let fileHash: string | undefined;
      try {
        const hashResult = await hashSmallFile(tempFilePath);
        fileHash = hashResult.hash;
      } catch (error) {
        logger.warn('Failed to hash image file', createErrorLogContext(error));
      }

      // Store in cache with UUID naming (consistent with unified file service)
      const cacheDir = path.join(process.cwd(), 'data', 'cache', 'images', 'movie', movieId.toString());
      await fs.mkdir(cacheDir, { recursive: true });

      const uuid = crypto.randomUUID();
      const ext = path.extname(tempFilePath);
      const cacheFileName = `${uuid}${ext}`;
      const cachePath = path.join(cacheDir, cacheFileName);

      await fs.copyFile(tempFilePath, cachePath);

      // Clean up temp file
      try {
        await fs.unlink(tempFilePath);
      } catch (_error) {
        // Ignore cleanup errors
      }

      // Insert into cache_image_files table
      const result = await conn.execute(
        `INSERT INTO cache_image_files (
          entity_type, entity_id, image_type, file_path, file_name,
          file_size, file_hash, perceptual_hash,
          width, height, format, source_type, source_url, provider_name,
          classification_score, discovered_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'provider', ?, ?, 0, CURRENT_TIMESTAMP)`,
        [
          'movie',
          movieId,
          assetType,
          cachePath,
          cacheFileName,
          stats.size,
          fileHash,
          assetData.perceptualHash || null,
          width,
          height,
          format,
          assetData.url,
          assetData.provider
        ]
      );

      const imageFileId = result.insertId!;

      logger.info('Added asset to movie', {
        movieId,
        assetType,
        provider: assetData.provider,
        imageFileId,
        cachePath
      });

      return {
        success: true,
        imageFileId,
        cachePath
      };

    } catch (error) {
      logger.error('Failed to add asset', createErrorLogContext(error, {
        movieId,
        assetType
      }));
      throw error;
    }
  }

  /**
   * Remove an asset from a movie
   * Deletes cache file and database record
   *
   * NOTE: Does NOT check field locks - caller is responsible for lock enforcement
   *
   * Part of multi-asset selection feature
   *
   * @param movieId - Movie ID
   * @param imageFileId - Image file ID to remove
   * @returns Success status
   */
  async removeAsset(movieId: number, imageFileId: number): Promise<{ success: boolean }> {
    const conn = this.db.getConnection();

    try {
      // Get image record
      const images = await conn.query(
        'SELECT id, image_type, file_path FROM cache_image_files WHERE id = ? AND entity_id = ? AND entity_type = ?',
        [imageFileId, movieId, 'movie']
      );

      if (images.length === 0) {
        throw new ResourceNotFoundError(
          'image',
          imageFileId,
          'Image not found for removal',
          { service: 'MovieAssetService', operation: 'removeAsset', metadata: { movieId } }
        );
      }

      const image = images[0];

      // NOTE: Lock checking removed - caller (replaceAssets) is responsible for lock enforcement

      // Delete cache file ONLY
      // NOTE: Library files are NOT deleted here - they remain until explicit "Publish" operation
      // This preserves the three-tier architecture: Candidates → Cache → Library
      if (image.file_path) {
        try {
          await fs.unlink(image.file_path);
          logger.debug('Deleted cache file', { filePath: image.file_path });
        } catch (error) {
          logger.warn('Failed to delete cache file (may already be deleted)', createErrorLogContext(error, {
            filePath: image.file_path
          }));
        }
      }

      // Delete cache record from database (CASCADE will delete library entries)
      await conn.execute('DELETE FROM cache_image_files WHERE id = ?', [imageFileId]);

      logger.info('Removed asset from movie', {
        movieId,
        imageFileId,
        assetType: image.image_type
      });

      return { success: true };

    } catch (error) {
      logger.error('Failed to remove asset', createErrorLogContext(error, {
        movieId,
        imageFileId
      }));
      throw error;
    }
  }

  /**
   * Toggle asset type lock (group lock for all assets of this type)
   * When locked, enrichment will not add/remove/replace assets of this type
   *
   * Part of multi-asset selection feature
   *
   * @param movieId - Movie ID
   * @param assetType - Asset type to lock/unlock
   * @param locked - Lock status
   * @returns Result with asset type and lock status
   */
  async toggleAssetLock(
    movieId: number,
    assetType: string,
    locked: boolean
  ): Promise<{ success: boolean; assetType: string; locked: boolean }> {
    const conn = this.db.getConnection();

    try {
      const lockField = `${assetType}_locked`;

      // Verify the lock field exists
      const validLockFields = [
        'poster_locked',
        'fanart_locked',
        'banner_locked',
        'clearlogo_locked',
        'clearart_locked',
        'landscape_locked',
        'keyart_locked',
        'thumb_locked',
        'discart_locked'
      ];

      if (!validLockFields.includes(lockField)) {
        throw new ValidationError(
          `Invalid asset type: ${assetType}`,
          { service: 'MovieAssetService', operation: 'toggleAssetLock', metadata: { field: 'assetType', value: assetType, validTypes: validLockFields.map(f => f.replace('_locked', '')) } }
        );
      }

      await conn.execute(
        `UPDATE movies SET ${lockField} = ? WHERE id = ?`,
        [locked ? 1 : 0, movieId]
      );

      logger.info('Toggled asset lock', {
        movieId,
        assetType,
        locked
      });

      return {
        success: true,
        assetType,
        locked
      };

    } catch (error) {
      logger.error('Failed to toggle asset lock', createErrorLogContext(error, {
        movieId,
        assetType,
        locked
      }));
      throw error;
    }
  }

  /**
   * Get count of assets for a specific type
   * Used to enforce asset limits
   *
   * Part of multi-asset selection feature
   *
   * @param movieId - Movie ID
   * @param assetType - Asset type to count
   * @returns Count of assets
   */
  async countAssetsByType(movieId: number, assetType: string): Promise<number> {
    const conn = this.db.getConnection();

    try {
      const result = await conn.query(
        `SELECT COUNT(*) as count FROM cache_image_files
         WHERE entity_type = 'movie' AND entity_id = ? AND image_type = ?`,
        [movieId, assetType]
      );

      return result[0]?.count || 0;

    } catch (error) {
      logger.error('Failed to count assets by type', createErrorLogContext(error, {
        movieId,
        assetType
      }));
      throw error;
    }
  }

  /**
   * Download file from URL
   * Handles redirects and streams to disk
   *
   * Private helper method for asset downloads
   *
   * @param url - URL to download from
   * @param destPath - Destination file path
   */
  private async downloadFile(url: string, destPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;

      const request = protocol.get(url, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          // Handle redirect
          if (response.headers.location) {
            // Clean up response stream before recursing
            response.destroy();
            this.downloadFile(response.headers.location, destPath)
              .then(resolve)
              .catch(reject);
            return;
          }
        }

        if (response.statusCode !== 200) {
          // Clean up response stream on error
          response.destroy();
          reject(new NetworkError(
            `Failed to download asset: HTTP ${response.statusCode}`,
            ErrorCode.NETWORK_CONNECTION_FAILED,
            url,
            { service: 'MovieAssetService', operation: 'downloadFile', metadata: { statusCode: response.statusCode } }
          ));
          return;
        }

        const fileStream = fsSync.createWriteStream(destPath);
        response.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close();
          resolve();
        });

        fileStream.on('error', (err: Error) => {
          fileStream.close();
          response.destroy(); // Clean up response stream
          fs.unlink(destPath).catch(() => {});
          reject(err);
        });

        response.on('error', (err: Error) => {
          fileStream.close();
          response.destroy();
          fs.unlink(destPath).catch(() => {});
          reject(err);
        });

      }).on('error', (err) => {
        // Request error - no stream to clean up yet
        reject(err);
      });

      // Handle request timeout
      request.setTimeout(30000, () => {
        request.destroy();
        reject(new NetworkError(
          'Download timeout after 30 seconds',
          ErrorCode.NETWORK_TIMEOUT,
          url,
          { service: 'MovieAssetService', operation: 'downloadFile', metadata: { timeout: 30000 } }
        ));
      });
    });
  }
}
