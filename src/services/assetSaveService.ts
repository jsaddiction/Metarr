import path from 'path';
import { DatabaseConnection } from '../types/database.js';
import { AssetCacheService } from './assetCacheService.js';
import { PublishingService } from './publishingService.js';
import { logger } from '../middleware/logging.js';

/**
 * Asset Save Service
 *
 * Handles saving user's asset selections:
 * 1. Download assets from provider URLs
 * 2. Store in content-addressed cache
 * 3. Record selections in asset_candidates table
 * 4. Lock selected asset types on entity
 * 5. Update entity metadata (if provided)
 * 6. Optionally publish to library immediately
 *
 * This is the main service for the POST /api/movies/:id/assets endpoint
 */

export interface AssetSelection {
  provider: string;
  url: string;
  assetType: string;
  metadata?: {
    width?: number;
    height?: number;
    language?: string;
    voteAverage?: number;
  };
}

export interface SaveAssetsRequest {
  selections: Record<string, AssetSelection>; // e.g., { poster: {...}, fanart: {...} }
  metadata?: Record<string, any>; // Entity metadata updates
  unlocks?: string[]; // Asset types to unlock
  publish?: boolean; // Immediately publish to library?
}

export interface SavedAsset {
  assetType: string;
  contentHash: string;
  cachePath: string;
  libraryPath?: string;
  locked: boolean;
}

export interface SaveAssetsResult {
  success: boolean;
  movie: any;
  savedAssets: SavedAsset[];
  cleanedUpAssets: number;
  errors: string[];
  published?: boolean;
}

export class AssetSaveService {
  private db: DatabaseConnection;
  private cacheService: AssetCacheService;
  private publishService: PublishingService;

  constructor(db: DatabaseConnection, cacheBaseDir: string = './data/cache') {
    this.db = db;
    this.cacheService = new AssetCacheService(db, cacheBaseDir);
    this.publishService = new PublishingService(db);
  }

  /**
   * Initialize service
   */
  async initialize(): Promise<void> {
    await this.cacheService.initialize();
  }

  /**
   * Save asset selections for a movie
   */
  async saveMovieAssets(
    movieId: number,
    request: SaveAssetsRequest
  ): Promise<SaveAssetsResult> {
    const result: SaveAssetsResult = {
      success: false,
      movie: null,
      savedAssets: [],
      cleanedUpAssets: 0,
      errors: [],
    };

    try {
      // Get movie details
      const movies = await this.db.query<any>(
        `SELECT * FROM movies WHERE id = ?`,
        [movieId]
      );

      if (movies.length === 0) {
        result.errors.push('Movie not found');
        return result;
      }

      const movie = movies[0];

      // Step 1: Update metadata if provided
      if (request.metadata && Object.keys(request.metadata).length > 0) {
        await this.updateMovieMetadata(movieId, request.metadata);
        logger.info('Updated movie metadata', { movieId, fields: Object.keys(request.metadata) });
      }

      // Step 2: Unlock asset types if requested
      if (request.unlocks && request.unlocks.length > 0) {
        for (const assetType of request.unlocks) {
          await this.unlockAssetType(movieId, assetType);
        }
        logger.info('Unlocked asset types', { movieId, assetTypes: request.unlocks });
      }

      // Step 3: Process each asset selection
      for (const [assetType, selection] of Object.entries(request.selections)) {
        try {
          const savedAsset = await this.processAssetSelection(
            movieId,
            'movie',
            assetType,
            selection
          );

          result.savedAssets.push(savedAsset);
          logger.debug('Saved asset selection', { movieId, assetType, contentHash: savedAsset.contentHash });

        } catch (error: any) {
          result.errors.push(`${assetType}: ${error.message}`);
          logger.error('Failed to save asset selection', { movieId, assetType, error: error.message });
        }
      }

      // Step 4: Clean up old unselected assets
      result.cleanedUpAssets = await this.cleanupOldAssets(movieId, 'movie');

      // Step 5: Optionally publish to library
      if (request.publish && result.savedAssets.length > 0) {
        try {
          const movieDir = path.dirname(movie.file_path);
          const movieFileName = path.parse(movie.file_path).name;

          const publishResult = await this.publishService.publish({
            entityType: 'movie',
            entityId: movieId,
            libraryPath: movieDir,
            mediaFilename: movieFileName,
          });

          result.published = publishResult.success;

          // Add library paths to saved assets
          for (const savedAsset of result.savedAssets) {
            const kodiSuffix = this.getKodiSuffix(savedAsset.assetType);
            const cacheExt = path.extname(savedAsset.cachePath);
            savedAsset.libraryPath = path.join(movieDir, `${movieFileName}${kodiSuffix}${cacheExt}`);
          }

          if (!publishResult.success) {
            result.errors.push(...publishResult.errors);
          }

        } catch (error: any) {
          result.errors.push(`Publishing failed: ${error.message}`);
          logger.error('Failed to publish assets', { movieId, error: error.message });
        }
      }

      // Step 6: Get updated movie data
      const updatedMovies = await this.db.query<any>(
        `SELECT * FROM movies WHERE id = ?`,
        [movieId]
      );
      result.movie = updatedMovies[0] || null;

      result.success = result.errors.length === 0;

      logger.info('Asset save complete', {
        movieId,
        savedCount: result.savedAssets.length,
        cleanedUp: result.cleanedUpAssets,
        published: result.published,
        errorCount: result.errors.length,
      });

      return result;

    } catch (error: any) {
      logger.error('Asset save failed', { movieId, error: error.message });
      result.errors.push(`System error: ${error.message}`);
      return result;
    }
  }

  /**
   * Process a single asset selection
   */
  private async processAssetSelection(
    entityId: number,
    entityType: string,
    assetType: string,
    selection: AssetSelection
  ): Promise<SavedAsset> {
    // Step 1: Download and cache asset
    const downloadResult = await this.cacheService.downloadAndCache(
      selection.url,
      this.getAssetCategory(assetType)
    );

    // Step 2: Check if asset_candidate already exists
    const existing = await this.db.query<{ id: number }>(
      `SELECT id FROM asset_candidates
       WHERE entity_type = ? AND entity_id = ? AND asset_type = ?
       AND provider = ? AND provider_url = ?`,
      [entityType, entityId, assetType, selection.provider, selection.url]
    );

    let candidateId: number;

    if (existing.length > 0) {
      // Update existing candidate
      candidateId = existing[0].id;
      await this.db.execute(
        `UPDATE asset_candidates
         SET is_selected = 1,
             is_downloaded = 1,
             content_hash = ?,
             cache_path = ?,
             selected_by = 'manual',
             selected_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP,
             width = ?,
             height = ?,
             file_size = ?,
             perceptual_hash = ?
         WHERE id = ?`,
        [
          downloadResult.contentHash,
          downloadResult.cachePath,
          downloadResult.width,
          downloadResult.height,
          downloadResult.fileSize,
          downloadResult.perceptualHash,
          candidateId,
        ]
      );
    } else {
      // Insert new candidate
      const insertResult = await this.db.execute(
        `INSERT INTO asset_candidates (
          entity_type, entity_id, asset_type,
          provider, provider_url,
          provider_metadata,
          width, height, file_size,
          is_downloaded, cache_path, content_hash, perceptual_hash,
          is_selected, selected_by, selected_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, 1, 'manual', CURRENT_TIMESTAMP)`,
        [
          entityType,
          entityId,
          assetType,
          selection.provider,
          selection.url,
          JSON.stringify(selection.metadata || {}),
          downloadResult.width,
          downloadResult.height,
          downloadResult.fileSize,
          downloadResult.cachePath,
          downloadResult.contentHash,
          downloadResult.perceptualHash,
        ]
      );

      candidateId = insertResult.insertId!;
    }

    // Step 3: Deselect any other candidates for this asset type
    await this.db.execute(
      `UPDATE asset_candidates
       SET is_selected = 0, selected_by = NULL, selected_at = NULL
       WHERE entity_type = ? AND entity_id = ? AND asset_type = ?
       AND id != ?`,
      [entityType, entityId, assetType, candidateId]
    );

    // Step 4: Lock asset type on entity
    await this.lockAssetType(entityId, assetType);

    // Step 5: Increment cache reference count
    await this.cacheService.incrementReferenceCount(downloadResult.contentHash);

    // Step 6: Mark entity as having unpublished changes
    await this.markEntityDirty(entityId, entityType);

    return {
      assetType,
      contentHash: downloadResult.contentHash,
      cachePath: downloadResult.cachePath,
      locked: true,
    };
  }

  /**
   * Update movie metadata and lock edited fields
   */
  private async updateMovieMetadata(
    movieId: number,
    metadata: Record<string, any>
  ): Promise<void> {
    const updateFields: string[] = [];
    const updateValues: any[] = [];

    const allowedFields = [
      'title', 'original_title', 'sort_title', 'year',
      'plot', 'outline', 'tagline', 'mpaa', 'premiered',
      'user_rating', 'trailer_url'
    ];

    for (const field of allowedFields) {
      if (metadata.hasOwnProperty(field)) {
        updateFields.push(`${field} = ?`);
        updateValues.push(metadata[field]);

        // Lock the field that was edited
        updateFields.push(`${field}_locked = 1`);
      }
    }

    // Mark as dirty
    updateFields.push('has_unpublished_changes = 1');

    if (updateFields.length > 0) {
      updateValues.push(movieId);
      const query = `UPDATE movies SET ${updateFields.join(', ')} WHERE id = ?`;
      await this.db.execute(query, updateValues);
    }
  }

  /**
   * Lock asset type on entity (prevents future auto-selection)
   */
  private async lockAssetType(entityId: number, assetType: string): Promise<void> {
    const lockColumn = this.getAssetLockColumn(assetType);
    if (!lockColumn) {
      logger.warn('Unknown asset type for locking', { assetType });
      return;
    }

    await this.db.execute(
      `UPDATE movies SET ${lockColumn} = 1 WHERE id = ?`,
      [entityId]
    );
  }

  /**
   * Unlock asset type on entity
   */
  private async unlockAssetType(entityId: number, assetType: string): Promise<void> {
    const lockColumn = this.getAssetLockColumn(assetType);
    if (!lockColumn) {
      logger.warn('Unknown asset type for unlocking', { assetType });
      return;
    }

    await this.db.execute(
      `UPDATE movies SET ${lockColumn} = 0 WHERE id = ?`,
      [entityId]
    );

    // Also deselect any selected candidates for this type
    await this.db.execute(
      `UPDATE asset_candidates
       SET is_selected = 0, selected_by = NULL, selected_at = NULL
       WHERE entity_type = 'movie' AND entity_id = ? AND asset_type = ?`,
      [entityId, assetType]
    );
  }

  /**
   * Mark entity as having unpublished changes
   */
  private async markEntityDirty(entityId: number, entityType: string): Promise<void> {
    const table = entityType === 'movie' ? 'movies' : entityType === 'series' ? 'series' : 'episodes';
    await this.db.execute(
      `UPDATE ${table} SET has_unpublished_changes = 1 WHERE id = ?`,
      [entityId]
    );
  }

  /**
   * Clean up old unselected asset candidates
   * Decrement cache reference counts for removed candidates
   */
  private async cleanupOldAssets(entityId: number, entityType: string): Promise<number> {
    // Get unselected candidates that were previously downloaded
    const unselected = await this.db.query<{ id: number; content_hash: string | null }>(
      `SELECT id, content_hash FROM asset_candidates
       WHERE entity_type = ? AND entity_id = ?
       AND is_selected = 0 AND is_downloaded = 1 AND content_hash IS NOT NULL`,
      [entityType, entityId]
    );

    let cleanedCount = 0;

    for (const candidate of unselected) {
      if (candidate.content_hash) {
        // Decrement cache reference count
        await this.cacheService.decrementReferenceCount(candidate.content_hash);
        cleanedCount++;
      }

      // Mark candidate as not downloaded (but keep record for history)
      await this.db.execute(
        `UPDATE asset_candidates
         SET is_downloaded = 0, cache_path = NULL
         WHERE id = ?`,
        [candidate.id]
      );
    }

    return cleanedCount;
  }

  /**
   * Get asset category for cache service
   */
  private getAssetCategory(assetType: string): 'image' | 'trailer' | 'subtitle' {
    if (assetType === 'trailer') return 'trailer';
    if (assetType === 'subtitle') return 'subtitle';
    return 'image';
  }

  /**
   * Get lock column name for asset type
   */
  private getAssetLockColumn(assetType: string): string | null {
    const mapping: Record<string, string> = {
      poster: 'poster_locked',
      fanart: 'fanart_locked',
      banner: 'banner_locked',
      clearlogo: 'clearlogo_locked',
      clearart: 'clearart_locked',
      discart: 'discart_locked',
      landscape: 'landscape_locked',
      keyart: 'keyart_locked',
      trailer: 'trailer_locked',
    };

    return mapping[assetType] || null;
  }

  /**
   * Get Kodi suffix for asset type
   */
  private getKodiSuffix(assetType: string): string {
    const mapping: Record<string, string> = {
      poster: '-poster',
      fanart: '-fanart',
      banner: '-banner',
      clearlogo: '-clearlogo',
      clearart: '-clearart',
      discart: '-disc',
      landscape: '-landscape',
      keyart: '-keyart',
      trailer: '-trailer',
    };

    return mapping[assetType] || `-${assetType}`;
  }
}
