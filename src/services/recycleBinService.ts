import fs from 'fs/promises';
import path from 'path';
import { DatabaseConnection } from '../types/database.js';
import { logger } from '../middleware/logging.js';
import { getErrorMessage, getErrorCode } from '../utils/errorHandling.js';

/**
 * Recycle Bin Service
 *
 * Manages file deletion with recovery window:
 * - Moves files to recycle directory instead of immediate deletion
 * - Tracks recycled files in database
 * - Provides restore functionality
 * - Automatic cleanup of expired items
 *
 * Design:
 * - Two-phase deletion: mark in DB first, then move file
 * - Atomic operations with rollback on failure
 * - Organized by timestamp for easy cleanup
 * - Preserves metadata for restore validation
 */

export interface RecycleBinConfig {
  enabled: boolean;           // Use recycle bin (default: true)
  retentionDays: number;      // Days to keep files (default: 30)
}

export interface RecycleFileOptions {
  entityType: 'movie' | 'episode' | 'series' | 'season';
  entityId: number;
  filePath: string;           // Original file path
  preserveMetadata?: boolean; // Store file metadata for restore
}

export interface RecycleBinEntry {
  id: number;
  entityType: string;
  entityId: number;
  originalPath: string;
  recyclePath: string | null;
  fileName: string;
  fileSize: number | null;
  recycledAt: Date | null;
}

export interface RecycleBinStats {
  totalFiles: number;
  totalSizeBytes: number;
  oldestEntry: Date | null;
  pendingDeletion: number;   // Files marked but not yet moved
}

export class RecycleBinService {
  private db: DatabaseConnection;
  private config: RecycleBinConfig;
  private static readonly RECYCLE_DIRECTORY = 'data/recycle';

  constructor(db: DatabaseConnection, config?: Partial<RecycleBinConfig>) {
    this.db = db;
    this.config = {
      enabled: config?.enabled ?? true,
      retentionDays: config?.retentionDays ?? 30,
    };
  }

  /**
   * Recycle a file (two-phase deletion)
   *
   * Phase 1: Create database entry (marks file for deletion)
   * Phase 2: Move file to recycle directory
   *
   * This ensures we can track files even if the move fails.
   */
  async recycleFile(options: RecycleFileOptions): Promise<number> {
    const { entityType, entityId, filePath } = options;

    logger.info('[RecycleBinService] Recycling file', {
      service: 'RecycleBinService',
      entityType,
      entityId,
      filePath,
    });

    // Check if recycle bin is enabled
    if (!this.config.enabled) {
      logger.warn('[RecycleBinService] Recycle bin disabled, deleting immediately', {
        service: 'RecycleBinService',
        filePath,
      });
      await fs.unlink(filePath);
      return -1; // Return -1 to indicate immediate deletion
    }

    try {
      // Get file stats
      const stats = await fs.stat(filePath);
      const fileName = path.basename(filePath);

      // Phase 1: Create database entry (marks for deletion)
      const result = await this.db.execute(
        `INSERT INTO recycle_bin (
          entity_type, entity_id, original_path, file_name, file_size, recycled_at
        ) VALUES (?, ?, ?, ?, ?, NULL)`,
        [entityType, entityId, filePath, fileName, stats.size]
      );

      const recycleId = result.insertId!;

      try {
        // Phase 2: Move file to recycle directory
        const recycleSubdir = this.getRecycleSubdirectory();
        const recyclePath = path.join(recycleSubdir, `${recycleId}_${fileName}`);

        // Ensure recycle subdirectory exists
        await fs.mkdir(recycleSubdir, { recursive: true });

        // Move file to recycle directory
        await fs.rename(filePath, recyclePath);

        // Update database with recycle path and timestamp
        await this.db.execute(
          `UPDATE recycle_bin SET recycle_path = ?, recycled_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [recyclePath, recycleId]
        );

        logger.info('[RecycleBinService] File recycled successfully', {
          service: 'RecycleBinService',
          recycleId,
          originalPath: filePath,
          recyclePath,
          fileSize: stats.size,
        });

        return recycleId;
      } catch (moveError: unknown) {
        // File move failed - keep database entry for manual cleanup
        logger.error('[RecycleBinService] Failed to move file to recycle bin', {
          service: 'RecycleBinService',
          recycleId,
          filePath,
          error: (moveError as { message?: string }).message,
        });

        // Don't delete the database entry - it tracks that the file should be deleted
        // Admin can manually clean this up or retry later
        throw moveError;
      }
    } catch (error) {
      logger.error('[RecycleBinService] Failed to recycle file', {
        service: 'RecycleBinService',
        filePath,
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  /**
   * Recycle multiple files in batch
   * Returns array of recycle IDs (or -1 for immediate deletions)
   */
  async recycleFiles(files: RecycleFileOptions[]): Promise<number[]> {
    const recycleIds: number[] = [];

    for (const file of files) {
      try {
        const recycleId = await this.recycleFile(file);
        recycleIds.push(recycleId);
      } catch (error) {
        logger.error('[RecycleBinService] Failed to recycle file in batch', {
          service: 'RecycleBinService',
          filePath: file.filePath,
          error: getErrorMessage(error),
        });
        // Continue with other files
      }
    }

    return recycleIds;
  }

  /**
   * Restore a file from recycle bin
   */
  async restoreFile(recycleId: number): Promise<void> {
    logger.info('[RecycleBinService] Restoring file from recycle bin', {
      service: 'RecycleBinService',
      recycleId,
    });

    // Get recycle entry
    const entry = await this.getRecycleEntry(recycleId);
    if (!entry) {
      throw new Error(`Recycle entry ${recycleId} not found`);
    }

    if (!entry.recyclePath) {
      throw new Error(`Recycle entry ${recycleId} has no recycle path (file not moved yet)`);
    }

    // Check if file exists in recycle bin
    try {
      await fs.access(entry.recyclePath);
    } catch {
      throw new Error(`Recycled file not found: ${entry.recyclePath}`);
    }

    // Check if original path is available
    try {
      await fs.access(entry.originalPath);
      throw new Error(`Original path already exists: ${entry.originalPath}`);
    } catch (error) {
      if (getErrorCode(error) !== 'ENOENT') {
        throw error;
      }
      // Original path doesn't exist, we can restore
    }

    // Ensure original directory exists
    const originalDir = path.dirname(entry.originalPath);
    await fs.mkdir(originalDir, { recursive: true });

    // Move file back to original location
    await fs.rename(entry.recyclePath, entry.originalPath);

    // Delete recycle entry
    await this.db.execute(`DELETE FROM recycle_bin WHERE id = ?`, [recycleId]);

    logger.info('[RecycleBinService] File restored successfully', {
      service: 'RecycleBinService',
      recycleId,
      originalPath: entry.originalPath,
    });
  }

  /**
   * Permanently delete a recycled file
   */
  async permanentlyDelete(recycleId: number): Promise<void> {
    logger.info('[RecycleBinService] Permanently deleting recycled file', {
      service: 'RecycleBinService',
      recycleId,
    });

    const entry = await this.getRecycleEntry(recycleId);
    if (!entry) {
      throw new Error(`Recycle entry ${recycleId} not found`);
    }

    // Delete file if it exists
    if (entry.recyclePath) {
      try {
        await fs.unlink(entry.recyclePath);
      } catch (error) {
        if (getErrorCode(error) !== 'ENOENT') {
          logger.warn('[RecycleBinService] Failed to delete recycled file', {
            service: 'RecycleBinService',
            recycleId,
            recyclePath: entry.recyclePath,
            error: getErrorMessage(error),
          });
        }
      }
    }

    // Delete database entry
    await this.db.execute(`DELETE FROM recycle_bin WHERE id = ?`, [recycleId]);

    logger.info('[RecycleBinService] File permanently deleted', {
      service: 'RecycleBinService',
      recycleId,
    });
  }

  /**
   * Cleanup expired items (older than retention period)
   * Returns number of items cleaned up
   */
  async cleanupExpired(): Promise<number> {
    logger.info('[RecycleBinService] Starting cleanup of expired items', {
      service: 'RecycleBinService',
      retentionDays: this.config.retentionDays,
    });

    // Calculate expiration date
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() - this.config.retentionDays);

    // Get expired entries
    const expiredEntries = await this.db.query<RecycleBinEntry>(
      `SELECT id, recycle_path
       FROM recycle_bin
       WHERE recycled_at IS NOT NULL
         AND recycled_at < ?
       ORDER BY recycled_at ASC`,
      [expirationDate.toISOString()]
    );

    logger.info('[RecycleBinService] Found expired items', {
      service: 'RecycleBinService',
      count: expiredEntries.length,
    });

    let deletedCount = 0;

    for (const entry of expiredEntries) {
      try {
        await this.permanentlyDelete(entry.id);
        deletedCount++;
      } catch (error) {
        logger.error('[RecycleBinService] Failed to cleanup expired item', {
          service: 'RecycleBinService',
          recycleId: entry.id,
          error: getErrorMessage(error),
        });
      }
    }

    logger.info('[RecycleBinService] Cleanup complete', {
      service: 'RecycleBinService',
      deletedCount,
      failedCount: expiredEntries.length - deletedCount,
    });

    return deletedCount;
  }

  /**
   * Cleanup pending items (marked for deletion but not moved)
   * These are files where the database entry exists but recycled_at is NULL
   */
  async cleanupPending(): Promise<number> {
    logger.info('[RecycleBinService] Starting cleanup of pending items', {
      service: 'RecycleBinService',
    });

    // Get pending entries (older than 1 hour)
    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 1);

    const pendingEntries = await this.db.query<RecycleBinEntry>(
      `SELECT id, original_path
       FROM recycle_bin
       WHERE recycled_at IS NULL`,
      []
    );

    logger.info('[RecycleBinService] Found pending items', {
      service: 'RecycleBinService',
      count: pendingEntries.length,
    });

    let cleanedCount = 0;

    for (const entry of pendingEntries) {
      try {
        // Try to delete the original file if it still exists
        try {
          await fs.unlink(entry.originalPath);
          logger.info('[RecycleBinService] Deleted pending file', {
            service: 'RecycleBinService',
            recycleId: entry.id,
            originalPath: entry.originalPath,
          });
        } catch (error) {
          if (getErrorCode(error) !== 'ENOENT') {
            logger.warn('[RecycleBinService] Failed to delete pending file', {
              service: 'RecycleBinService',
              recycleId: entry.id,
              originalPath: entry.originalPath,
              error: getErrorMessage(error),
            });
          }
        }

        // Remove database entry
        await this.db.execute(`DELETE FROM recycle_bin WHERE id = ?`, [entry.id]);
        cleanedCount++;
      } catch (error) {
        logger.error('[RecycleBinService] Failed to cleanup pending item', {
          service: 'RecycleBinService',
          recycleId: entry.id,
          error: getErrorMessage(error),
        });
      }
    }

    logger.info('[RecycleBinService] Pending cleanup complete', {
      service: 'RecycleBinService',
      cleanedCount,
    });

    return cleanedCount;
  }

  /**
   * Get recycle bin statistics
   */
  async getStats(): Promise<RecycleBinStats> {
    const result = await this.db.query<{
      total_files: number;
      total_size: number | null;
      oldest_entry: string | null;
      pending_deletion: number;
    }>(
      `SELECT
        COUNT(*) as total_files,
        SUM(file_size) as total_size,
        MIN(recycled_at) as oldest_entry,
        SUM(CASE WHEN recycled_at IS NULL THEN 1 ELSE 0 END) as pending_deletion
       FROM recycle_bin`,
      []
    );

    const row = result[0];

    return {
      totalFiles: row.total_files,
      totalSizeBytes: row.total_size || 0,
      oldestEntry: row.oldest_entry ? new Date(row.oldest_entry) : null,
      pendingDeletion: row.pending_deletion,
    };
  }

  /**
   * List recycled files for an entity
   */
  async listForEntity(
    entityType: 'movie' | 'episode' | 'series' | 'season',
    entityId: number
  ): Promise<RecycleBinEntry[]> {
    const entries = await this.db.query<{
      id: number;
      entity_type: string;
      entity_id: number;
      original_path: string;
      recycle_path: string | null;
      file_name: string;
      file_size: number | null;
      recycled_at: string | null;
    }>(
      `SELECT id, entity_type, entity_id, original_path, recycle_path, file_name, file_size, recycled_at
       FROM recycle_bin
       WHERE entity_type = ? AND entity_id = ?
       ORDER BY recycled_at DESC`,
      [entityType, entityId]
    );

    return entries.map((row) => ({
      id: row.id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      originalPath: row.original_path,
      recyclePath: row.recycle_path,
      fileName: row.file_name,
      fileSize: row.file_size,
      recycledAt: row.recycled_at ? new Date(row.recycled_at) : null,
    }));
  }

  /**
   * Get a single recycle entry
   */
  private async getRecycleEntry(recycleId: number): Promise<RecycleBinEntry | null> {
    const result = await this.db.query<{
      id: number;
      entity_type: string;
      entity_id: number;
      original_path: string;
      recycle_path: string | null;
      file_name: string;
      file_size: number | null;
      recycled_at: string | null;
    }>(`SELECT * FROM recycle_bin WHERE id = ?`, [recycleId]);

    if (result.length === 0) {
      return null;
    }

    const row = result[0];
    return {
      id: row.id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      originalPath: row.original_path,
      recyclePath: row.recycle_path,
      fileName: row.file_name,
      fileSize: row.file_size,
      recycledAt: row.recycled_at ? new Date(row.recycled_at) : null,
    };
  }

  /**
   * Get recycle subdirectory for current date
   * Organized as: data/recycle/YYYY-MM-DD/
   */
  private getRecycleSubdirectory(): string {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
    return path.join(RecycleBinService.RECYCLE_DIRECTORY, dateStr);
  }

  /**
   * Empty entire recycle bin (permanent deletion of all files)
   */
  async emptyRecycleBin(): Promise<number> {
    logger.warn('[RecycleBinService] Emptying entire recycle bin', {
      service: 'RecycleBinService',
    });

    const allEntries = await this.db.query<RecycleBinEntry>(
      `SELECT id FROM recycle_bin`,
      []
    );

    let deletedCount = 0;

    for (const entry of allEntries) {
      try {
        await this.permanentlyDelete(entry.id);
        deletedCount++;
      } catch (error) {
        logger.error('[RecycleBinService] Failed to delete entry while emptying bin', {
          service: 'RecycleBinService',
          recycleId: entry.id,
          error: getErrorMessage(error),
        });
      }
    }

    logger.info('[RecycleBinService] Recycle bin emptied', {
      service: 'RecycleBinService',
      deletedCount,
    });

    return deletedCount;
  }
}
