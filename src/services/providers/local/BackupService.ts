/**
 * Backup Service
 *
 * Manages backup and restoration of local assets before enrichment.
 * Preserves original local assets so users can restore them if they prefer.
 */

import { DatabaseManager } from '../../../database/DatabaseManager.js';
import {
  computePerceptualHash,
  computeContentHash,
  getImageDimensions,
  getFileSize,
} from '../../../utils/imageHash.js';
import { logger } from '../../../middleware/logging.js';
import path from 'path';
import { promises as fs } from 'fs';
import { getErrorMessage } from '../../../utils/errorHandling.js';
import { SqlParam } from '../../../types/database.js';
import { ResourceNotFoundError } from '../../../errors/index.js';

export interface BackupAsset {
  id: number;
  movieId: number | null | undefined;
  seriesId: number | null | undefined;
  seasonId: number | null | undefined;
  episodeId: number | null | undefined;
  type: string;
  originalPath: string;
  originalFilename: string;
  originalHash: string | null;
  backupPath: string;
  backedUpAt: Date;
  fileSize: number | null;
  width: number | null;
  height: number | null;
  phash: string | null;
  restored: boolean;
  restoredAt: Date | null;
}

export interface BackupOptions {
  enabled?: boolean;
  subtitles?: boolean;
  trailers?: boolean;
}

export class BackupService {
  private backupRoot: string;

  constructor(
    private db: DatabaseManager,
    backupRoot: string = 'data/backup'
  ) {
    this.backupRoot = backupRoot;
  }

  /**
   * Get backup settings from database
   */
  private async getSettings(): Promise<BackupOptions> {
    const settings = await this.db.query<{ key: string; value: string }>(
      `SELECT key, value FROM settings WHERE key LIKE 'backup_%'`
    );

    const config: BackupOptions = {
      enabled: true,
      subtitles: false,
      trailers: false,
    };

    settings.forEach((setting) => {
      switch (setting.key) {
        case 'backup_enabled':
          config.enabled = setting.value === 'true';
          break;
        case 'backup_subtitles':
          config.subtitles = setting.value === 'true';
          break;
        case 'backup_trailers':
          config.trailers = setting.value === 'true';
          break;
      }
    });

    return config;
  }

  /**
   * Backup all assets for a movie before enrichment
   */
  async backupMovieAssets(
    movieId: number,
    libraryPath: string
  ): Promise<BackupAsset[]> {
    const settings = await this.getSettings();

    if (!settings.enabled) {
      logger.debug(`Backup disabled, skipping movie ${movieId}`);
      return [];
    }

    logger.info(`Backing up assets for movie ${movieId}`, { libraryPath });

    const backedUp: BackupAsset[] = [];

    // Find all existing local assets
    const assetTypes = [
      'poster',
      'fanart',
      'banner',
      'clearlogo',
      'clearart',
      'discart',
      'landscape',
      'keyart',
    ];

    for (const assetType of assetTypes) {
      const localAssets = await this.findLocalAssets(libraryPath, assetType);

      for (const assetPath of localAssets) {
        try {
          const backup = await this.backupAsset(
            { movieId },
            assetType,
            assetPath
          );
          if (backup) {
            backedUp.push(backup);
          }
        } catch (error) {
          logger.error(`Failed to backup asset ${assetPath}`, {
            error: getErrorMessage(error),
          });
        }
      }
    }

    logger.info(`Backed up ${backedUp.length} assets for movie ${movieId}`);
    return backedUp;
  }

  /**
   * Find local assets using Kodi naming conventions
   */
  private async findLocalAssets(
    directory: string,
    assetType: string
  ): Promise<string[]> {
    const found: string[] = [];

    try {
      const files = await fs.readdir(directory);

      // Kodi naming patterns
      const patterns: Record<string, string[]> = {
        poster: ['poster', 'folder', 'cover'],
        fanart: ['fanart', 'backdrop', 'background'],
        banner: ['banner'],
        clearlogo: ['clearlogo', 'logo'],
        clearart: ['clearart'],
        discart: ['discart', 'disc'],
        landscape: ['landscape', 'thumb'],
        keyart: ['keyart'],
      };

      const validExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
      const assetPatterns = patterns[assetType] || [];

      for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        const basename = path.basename(file, ext).toLowerCase();

        if (!validExtensions.includes(ext)) {
          continue;
        }

        // Check if filename matches any pattern
        for (const pattern of assetPatterns) {
          if (basename === pattern || basename.endsWith(`-${pattern}`)) {
            found.push(path.join(directory, file));
            break;
          }
        }
      }
    } catch (error) {
      logger.warn(`Failed to scan directory for assets: ${directory}`, {
        error: getErrorMessage(error),
      });
    }

    return found;
  }

  /**
   * Backup a single asset
   */
  private async backupAsset(
    entity: { movieId?: number; seriesId?: number; episodeId?: number },
    assetType: string,
    originalPath: string
  ): Promise<BackupAsset | null> {
    try {
      // Check if already backed up
      const existing = await this.db.query<BackupAsset>(
        `SELECT * FROM backup_assets
         WHERE original_path = ? AND restored = 0
         LIMIT 1`,
        [originalPath]
      );

      if (existing.length > 0) {
        logger.debug(`Asset already backed up: ${originalPath}`);
        return existing[0];
      }

      // Compute hashes and dimensions
      const contentHash = await computeContentHash(originalPath);
      const fileSize = await getFileSize(originalPath);

      let width: number | null = null;
      let height: number | null = null;
      let phash: string | null = null;

      // Only compute pHash and dimensions for images
      if (assetType !== 'trailer' && assetType !== 'subtitle') {
        try {
          const dims = await getImageDimensions(originalPath);
          width = dims.width;
          height = dims.height;
          phash = await computePerceptualHash(originalPath);
        } catch (error) {
          logger.warn(`Failed to process image metadata: ${originalPath}`, {
            error: getErrorMessage(error),
          });
        }
      }

      // Generate backup path
      const entityId = entity.movieId || entity.seriesId || entity.episodeId;
      const entityType = entity.movieId
        ? 'movie'
        : entity.seriesId
          ? 'series'
          : 'episode';
      const timestamp = Date.now();
      const ext = path.extname(originalPath);
      const backupFilename = `${assetType}_${timestamp}${ext}`;
      const backupDir = path.join(
        this.backupRoot,
        entityType,
        entityId!.toString()
      );
      const backupPath = path.join(backupDir, backupFilename);

      // Create backup directory
      await fs.mkdir(backupDir, { recursive: true });

      // Copy file to backup location
      await fs.copyFile(originalPath, backupPath);

      // Insert into database
      const result = await this.db.execute(
        `INSERT INTO backup_assets (
          movie_id, series_id, episode_id, type,
          original_path, original_filename, original_hash,
          backup_path, file_size, width, height, phash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entity.movieId || null,
          entity.seriesId || null,
          entity.episodeId || null,
          assetType,
          originalPath,
          path.basename(originalPath),
          contentHash,
          backupPath,
          fileSize,
          width,
          height,
          phash,
        ]
      );

      logger.info(`Backed up asset: ${originalPath} → ${backupPath}`);

      return {
        id: result.insertId!,
        movieId: entity.movieId,
        seriesId: entity.seriesId,
        seasonId: undefined,
        episodeId: entity.episodeId,
        type: assetType,
        originalPath,
        originalFilename: path.basename(originalPath),
        originalHash: contentHash,
        backupPath,
        backedUpAt: new Date(),
        fileSize,
        width,
        height,
        phash,
        restored: false,
        restoredAt: null,
      };
    } catch (error) {
      logger.error(`Failed to backup asset: ${originalPath}`, {
        error: getErrorMessage(error),
      });
      return null;
    }
  }

  /**
   * Get all backups for an entity
   */
  async getBackups(entity: {
    movieId?: number;
    seriesId?: number;
    episodeId?: number;
  }): Promise<BackupAsset[]> {
    const whereClauses: string[] = [];
    const params: SqlParam[] = [];

    if (entity.movieId) {
      whereClauses.push('movie_id = ?');
      params.push(entity.movieId);
    }
    if (entity.seriesId) {
      whereClauses.push('series_id = ?');
      params.push(entity.seriesId);
    }
    if (entity.episodeId) {
      whereClauses.push('episode_id = ?');
      params.push(entity.episodeId);
    }

    const where = whereClauses.join(' OR ');

    return this.db.query<BackupAsset>(
      `SELECT * FROM backup_assets WHERE ${where} ORDER BY backed_up_at DESC`,
      params
    );
  }

  /**
   * Restore a backed-up asset
   */
  async restoreAsset(backupId: number): Promise<void> {
    const backup = await this.db.query<BackupAsset>(
      `SELECT * FROM backup_assets WHERE id = ?`,
      [backupId]
    );

    if (backup.length === 0) {
      throw new ResourceNotFoundError(
        'backup',
        backupId,
        'Backup not found',
        { service: 'BackupService', operation: 'restoreAsset' }
      );
    }

    const asset = backup[0];

    try {
      // Copy from backup to cache
      const cacheDir = path.join('data/cache', asset.type);
      await fs.mkdir(cacheDir, { recursive: true });

      const ext = path.extname(asset.backupPath);
      const cachePath = path.join(cacheDir, `${asset.originalHash}${ext}`);

      await fs.copyFile(asset.backupPath, cachePath);

      // TODO: Create asset_candidate entry with provider='local_restored'
      // TODO: Mark as selected
      // TODO: Publish to library

      // Mark as restored
      await this.db.execute(
        `UPDATE backup_assets SET restored = 1, restored_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [backupId]
      );

      logger.info(`Restored backup ${backupId}: ${asset.backupPath} → ${cachePath}`);
    } catch (error) {
      logger.error(`Failed to restore backup ${backupId}`, {
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  /**
   * Cleanup old backups beyond retention period
   */
  async cleanupOldBackups(retentionDays: number = 90): Promise<number> {
    logger.info(`Cleaning up backups older than ${retentionDays} days`);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    // Find old backups
    const oldBackups = await this.db.query<BackupAsset>(
      `SELECT * FROM backup_assets WHERE backed_up_at < ? AND restored = 0`,
      [cutoffDate.toISOString()]
    );

    let deletedCount = 0;

    for (const backup of oldBackups) {
      try {
        // Delete file
        await fs.unlink(backup.backupPath);

        // Delete from database
        await this.db.execute(`DELETE FROM backup_assets WHERE id = ?`, [
          backup.id,
        ]);

        deletedCount++;
      } catch (error) {
        logger.warn(`Failed to delete backup ${backup.id}`, {
          error: getErrorMessage(error),
        });
      }
    }

    logger.info(`Cleaned up ${deletedCount} old backups`);
    return deletedCount;
  }

  /**
   * Get backup statistics
   */
  async getStats(): Promise<{
    totalBackups: number;
    totalSize: number;
    oldestBackup: Date | null;
  }> {
    const stats = await this.db.query<{
      total: number;
      total_size: number;
      oldest: string;
    }>(
      `SELECT
        COUNT(*) as total,
        SUM(file_size) as total_size,
        MIN(backed_up_at) as oldest
       FROM backup_assets
       WHERE restored = 0`
    );

    return {
      totalBackups: stats[0]?.total || 0,
      totalSize: stats[0]?.total_size || 0,
      oldestBackup: stats[0]?.oldest ? new Date(stats[0].oldest) : null,
    };
  }
}
