/**
 * NFO File Tracking for Unified File System
 *
 * Tracks NFO files in text_files table with validation flags and hash tracking.
 */

import fs from 'fs/promises';
import path from 'path';
import { DatabaseConnection } from '../../types/database.js';
import { logger } from '../../middleware/logging.js';
import { insertCacheTextFile, calculateFileHash } from '../files/unifiedFileService.js';
import { FullMovieNFO } from '../../types/models.js';

/**
 * Store NFO file record in text_files table
 */
export async function trackNFOFile(
  db: DatabaseConnection,
  nfoFilePath: string,
  entityType: 'movie' | 'episode',
  entityId: number,
  nfoData: FullMovieNFO
): Promise<number> {
  try {
    // Calculate file hash for change detection
    const fileHash = await calculateFileHash(nfoFilePath);
    const stats = await fs.stat(nfoFilePath);

    // Check if NFO already tracked (cache table - source of truth)
    const existing = await db.query<any>(
      `SELECT id FROM cache_text_files WHERE entity_type = ? AND entity_id = ? AND text_type = 'nfo'`,
      [entityType, entityId]
    );

    if (existing && existing.length > 0) {
      // Update existing record
      const existingId = (existing[0] as any).id;
      await db.execute(
        `UPDATE cache_text_files SET
          file_path = ?,
          file_name = ?,
          file_size = ?,
          file_hash = ?,
          nfo_is_valid = ?,
          nfo_has_tmdb_id = ?,
          nfo_needs_regen = 0,
          discovered_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
        [
          nfoFilePath,
          path.basename(nfoFilePath),
          stats.size,
          fileHash,
          nfoData.valid ? 1 : 0,
          nfoData.tmdbId ? 1 : 0,
          existingId
        ]
      );

      logger.debug('Updated NFO file record', {
        id: existingId,
        entityType,
        entityId,
        filePath: nfoFilePath,
        hasTmdbId: Boolean(nfoData.tmdbId)
      });

      return existingId;
    } else {
      // Insert new record
      const nfoFileId = await insertCacheTextFile(db, {
        entityType,
        entityId,
        filePath: nfoFilePath,
        fileName: path.basename(nfoFilePath),
        fileSize: stats.size,
        fileHash,
        textType: 'nfo',
        nfoIsValid: nfoData.valid,
        nfoHasTmdbId: Boolean(nfoData.tmdbId),
        nfoNeedsRegen: false, // Fresh from scan
        sourceType: 'local'
      });

      logger.info('Tracked NFO file', {
        nfoFileId,
        entityType,
        entityId,
        filePath: nfoFilePath,
        hasTmdbId: Boolean(nfoData.tmdbId),
        isValid: nfoData.valid
      });

      return nfoFileId;
    }
  } catch (error: any) {
    logger.error('Failed to track NFO file', {
      entityType,
      entityId,
      nfoFilePath,
      error: error.message
    });
    throw error;
  }
}

/**
 * Mark NFO as needing regeneration (hash mismatch detected)
 */
export async function markNFOForRegeneration(
  db: DatabaseConnection,
  entityType: 'movie' | 'episode',
  entityId: number
): Promise<void> {
  await db.execute(
    `UPDATE cache_text_files
     SET nfo_needs_regen = 1
     WHERE entity_type = ? AND entity_id = ? AND text_type = 'nfo'`,
    [entityType, entityId]
  );

  logger.info('Marked NFO for regeneration', { entityType, entityId });
}

/**
 * Get NFO file record for an entity
 */
export async function getNFOFile(
  db: DatabaseConnection,
  entityType: 'movie' | 'episode',
  entityId: number
): Promise<{
  id: number;
  filePath: string;
  fileHash: string;
  isValid: boolean;
  hasTmdbId: boolean;
  needsRegen: boolean;
} | null> {
  const rows = await db.query<any>(
    `SELECT id, file_path, file_hash, nfo_is_valid, nfo_has_tmdb_id, nfo_needs_regen
     FROM cache_text_files
     WHERE entity_type = ? AND entity_id = ? AND text_type = 'nfo'
     LIMIT 1`,
    [entityType, entityId]
  );

  if (!rows || rows.length === 0) return null;

  const row = rows[0] as any;
  return {
    id: row.id,
    filePath: row.file_path,
    fileHash: row.file_hash,
    isValid: Boolean(row.nfo_is_valid),
    hasTmdbId: Boolean(row.nfo_has_tmdb_id),
    needsRegen: Boolean(row.nfo_needs_regen)
  };
}

/**
 * Check if NFO file hash has changed (for regeneration detection)
 */
export async function checkNFOHashChanged(
  db: DatabaseConnection,
  entityType: 'movie' | 'episode',
  entityId: number,
  currentFilePath: string
): Promise<boolean> {
  const nfoRecord = await getNFOFile(db, entityType, entityId);
  if (!nfoRecord) return false; // No record = first scan

  // Calculate current hash
  const currentHash = await calculateFileHash(currentFilePath);

  if (currentHash !== nfoRecord.fileHash) {
    logger.info('NFO hash changed (external edit detected)', {
      entityType,
      entityId,
      oldHash: nfoRecord.fileHash,
      newHash: currentHash
    });
    return true;
  }

  return false;
}
