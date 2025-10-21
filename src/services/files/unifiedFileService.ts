/**
 * Unified File Service
 *
 * Handles all file operations for the unified file system architecture.
 * Manages library → cache lifecycle, deduplication, and reference counting.
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';
import { DatabaseConnection } from '../../types/database.js';
import { logger } from '../../middleware/logging.js';

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Clean up empty parent directories after file deletion
 * Recursively removes empty directories up to the cache root
 *
 * New structure: /data/cache/images/{entityType}/{entityId}/uuid.jpg
 * - Removes /data/cache/images/{entityType}/{entityId} if empty
 * - Removes /data/cache/images/{entityType} if empty
 * - Stops at /data/cache/images (cache root)
 */
async function cleanupEmptyDirectories(filePath: string, cacheRoot: string): Promise<void> {
  try {
    let currentDir = path.dirname(filePath);
    const absoluteCacheRoot = path.resolve(cacheRoot);

    // Walk up directory tree until we reach cache root
    while (currentDir !== absoluteCacheRoot && currentDir.startsWith(absoluteCacheRoot)) {
      try {
        const entries = await fs.readdir(currentDir);

        if (entries.length === 0) {
          // Directory is empty, delete it
          await fs.rmdir(currentDir);
          logger.debug('Removed empty cache directory', { directory: currentDir });

          // Move up to parent directory
          currentDir = path.dirname(currentDir);
        } else {
          // Directory not empty, stop climbing
          break;
        }
      } catch (error: any) {
        // Directory doesn't exist or can't be read - stop climbing
        logger.debug('Stopped directory cleanup', {
          directory: currentDir,
          reason: error.code || error.message
        });
        break;
      }
    }

    // Ensure cache root still exists (safety check)
    try {
      await fs.access(absoluteCacheRoot);
    } catch (error: any) {
      // Cache root was deleted - recreate it
      await fs.mkdir(absoluteCacheRoot, { recursive: true });
      logger.warn('Recreated cache root directory', { cacheRoot: absoluteCacheRoot });
    }
  } catch (error: any) {
    logger.warn('Failed to cleanup empty directories', {
      filePath,
      error: error.message
    });
  }
}

// ============================================================
// TYPE DEFINITIONS
// ============================================================

export interface ImageFileRecord {
  id?: number;
  entityType: 'movie' | 'episode' | 'series' | 'season' | 'actor';
  entityId: number;
  filePath: string;
  fileName: string;
  fileSize: number;
  fileHash: string;
  perceptualHash?: string;
  location: 'library' | 'cache';
  imageType: 'poster' | 'fanart' | 'banner' | 'clearlogo' | 'clearart' | 'discart' | 'landscape' | 'keyart' | 'thumb' | 'actor_thumb' | 'unknown';
  width: number;
  height: number;
  format: string;
  sourceType?: 'provider' | 'local' | 'user';
  sourceUrl?: string;
  providerName?: string;
  classificationScore?: number;
  isPublished?: boolean;
  libraryFileId?: number;
  cacheFileId?: number;
  referenceCount?: number;
}

export interface VideoFileRecord {
  id?: number;
  entityType: 'movie' | 'episode';
  entityId: number;
  filePath: string;
  fileName: string;
  fileSize: number;
  fileHash?: string;
  location: 'library' | 'cache';
  videoType: 'main' | 'trailer' | 'sample' | 'extra';
  codec?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  bitrate?: number;
  framerate?: number;
  hdrType?: string;
  audioCodec?: string;
  audioChannels?: number;
  audioLanguage?: string;
  sourceType?: 'provider' | 'local' | 'user';
  sourceUrl?: string;
  providerName?: string;
  classificationScore?: number;
  libraryFileId?: number;
  cacheFileId?: number;
  referenceCount?: number;
}

export interface TextFileRecord {
  id?: number;
  entityType: 'movie' | 'episode';
  entityId: number;
  filePath: string;
  fileName: string;
  fileSize: number;
  fileHash?: string;
  location: 'library' | 'cache';
  textType: 'nfo' | 'subtitle';
  subtitleLanguage?: string;
  subtitleFormat?: string;
  nfoIsValid?: boolean;
  nfoHasTmdbId?: boolean;
  nfoNeedsRegen?: boolean;
  sourceType?: 'provider' | 'local' | 'user';
  sourceUrl?: string;
  libraryFileId?: number;
  cacheFileId?: number;
  referenceCount?: number;
}

// ============================================================
// IMAGE FILE OPERATIONS
// ============================================================

/**
 * Insert image file record into database
 */
export async function insertImageFile(
  db: DatabaseConnection,
  record: ImageFileRecord
): Promise<number> {
  // Insert into cache or library table based on location
  const result = record.location === 'cache'
    ? await db.execute(
        `INSERT INTO cache_image_files (
          entity_type, entity_id, file_path, file_name, file_size, file_hash,
          perceptual_hash, image_type, width, height, format,
          source_type, source_url, provider_name, classification_score,
          is_locked, discovered_at, last_accessed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          record.entityType,
          record.entityId,
          record.filePath,
          record.fileName,
          record.fileSize,
          record.fileHash,
          record.perceptualHash || null,
          record.imageType,
          record.width,
          record.height,
          record.format,
          record.sourceType || null,
          record.sourceUrl || null,
          record.providerName || null,
          record.classificationScore || null
        ]
      )
    : await db.execute(
        `INSERT INTO library_image_files (cache_file_id, file_path, published_at) VALUES (?, ?, CURRENT_TIMESTAMP)`,
        [record.cacheFileId, record.filePath]
      );

  logger.debug('Inserted image file', {
    id: result.insertId,
    location: record.location,
    imageType: record.imageType,
    fileName: record.fileName
  });

  return result.insertId!;
}

/**
 * Find existing cached image by hash
 * NOTE: No longer used for deduplication, kept for potential rescan hash comparison
 */
export async function findCachedImageByHash(
  db: DatabaseConnection,
  fileHash: string
): Promise<ImageFileRecord | null> {
  const rows = await db.query<any>(
    `SELECT * FROM cache_image_files WHERE file_hash = ? LIMIT 1`,
    [fileHash]
  );

  if (!rows || rows.length === 0) return null;

  const row = rows[0] as any;
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    filePath: row.file_path,
    fileName: row.file_name,
    fileSize: row.file_size,
    fileHash: row.file_hash,
    perceptualHash: row.perceptual_hash || null,
    location: row.location,
    imageType: row.image_type,
    width: row.width,
    height: row.height,
    format: row.format,
    sourceType: row.source_type,
    sourceUrl: row.source_url || null,
    providerName: row.provider_name || null,
    classificationScore: row.classification_score || null,
    isPublished: Boolean(row.is_published),
    libraryFileId: row.library_file_id || null,
    cacheFileId: row.cache_file_id || null,
    referenceCount: row.reference_count || 0
  };
}

/**
 * Cache an image file (copy library → cache)
 * UUID-based naming - NO content-based deduplication
 * Every library file gets its own cache copy
 * Returns cache file ID
 */
export async function cacheImageFile(
  db: DatabaseConnection,
  libraryFileId: number | null,
  sourceFilePath: string,
  entityType: 'movie' | 'episode' | 'series' | 'season' | 'actor',
  entityId: number,
  imageType: string,
  sourceType: 'provider' | 'local' | 'user' = 'local',
  sourceUrl?: string,
  providerName?: string
): Promise<number> {
  // Calculate hash (for rescan detection, NOT for deduplication)
  const fileBuffer = await fs.readFile(sourceFilePath);
  const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

  // Generate UUID for cache file naming
  const uuid = crypto.randomUUID();
  const ext = path.extname(sourceFilePath);

  // Create cache directory structure: /cache/images/{entityType}/{entityId}/
  const cacheDir = path.join(process.cwd(), 'data', 'cache', 'images', entityType, String(entityId));
  await fs.mkdir(cacheDir, { recursive: true });

  const cachePath = path.join(cacheDir, `${uuid}${ext}`);
  const tempPath = `${cachePath}.tmp.${Date.now()}`;

  try {
    // Copy to temp file first (atomic write pattern)
    await fs.copyFile(sourceFilePath, tempPath);

    // Get image metadata from temp file
    const metadata = await sharp(tempPath).metadata();

    // Verify hash matches (data integrity check)
    const tempBuffer = await fs.readFile(tempPath);
    const tempHash = crypto.createHash('sha256').update(tempBuffer).digest('hex');

    if (tempHash !== fileHash) {
      throw new Error(`Hash mismatch: expected ${fileHash}, got ${tempHash}`);
    }

    // Atomic rename (all-or-nothing operation)
    await fs.rename(tempPath, cachePath);

    // Insert cache record
    const cacheFileId = await insertImageFile(db, {
      entityType,
      entityId,
      filePath: cachePath,
      fileName: `${uuid}${ext}`,
      fileSize: fileBuffer.length,
      fileHash,
      location: 'cache',
      imageType: imageType as any,
      width: metadata.width!,
      height: metadata.height!,
      format: metadata.format!,
      sourceType,
      ...(sourceUrl && { sourceUrl }),
      ...(providerName && { providerName }),
      isPublished: false, // Not published until selection phase
      ...(libraryFileId && { libraryFileId }),
      referenceCount: 1
    });

    // Link library file to cache (if library file exists)
    if (libraryFileId) {
      await db.execute(
        `UPDATE library_image_files SET cache_file_id = ? WHERE id = ?`,
        [cacheFileId, libraryFileId]
      );
    }

    logger.info('Cached new image file', {
      cacheFileId,
      uuid,
      fileHash,
      cachePath,
      sourceType,
      providerName
    });

    return cacheFileId;
  } catch (error) {
    // Clean up temp file on ANY failure
    try {
      await fs.unlink(tempPath);
      logger.debug('Cleaned up temp file after error', { tempPath });
    } catch (cleanupError) {
      // Ignore cleanup errors
    }

    logger.error('Failed to cache image file', {
      sourceFilePath,
      entityType,
      entityId,
      error: error instanceof Error ? error.message : String(error)
    });

    throw error;
  }
}

/**
 * Update last accessed timestamp for cached file
 */
export async function updateImageLastAccessed(
  db: DatabaseConnection,
  cacheFileId: number
): Promise<void> {
  await db.execute(
    `UPDATE cache_image_files SET last_accessed_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [cacheFileId]
  );
}

/**
 * Delete cached image file and its library references
 * CASCADE DELETE will automatically remove library entries
 */
export async function deleteCachedImage(
  db: DatabaseConnection,
  cacheFileId: number
): Promise<void> {
  const rows = await db.query<any>(
    `SELECT id, file_path FROM cache_image_files WHERE id = ?`,
    [cacheFileId]
  );

  if (rows && rows.length > 0) {
    const filePath = (rows[0] as any).file_path;
    try {
      await fs.unlink(filePath);
      await db.execute(`DELETE FROM cache_image_files WHERE id = ?`, [cacheFileId]);
      logger.info('Deleted cache file', { cacheFileId, filePath });

      // Clean up empty parent directories
      const cacheRoot = path.join(process.cwd(), 'data', 'cache', 'images');
      await cleanupEmptyDirectories(filePath, cacheRoot);
    } catch (error: any) {
      logger.error('Failed to delete cache file', { cacheFileId, error: error.message });
    }
  }
}

// ============================================================
// VIDEO FILE OPERATIONS
// ============================================================

/**
 * Insert video file record into database
 */
export async function insertVideoFile(
  db: DatabaseConnection,
  record: VideoFileRecord
): Promise<number> {
  // Insert into cache or library table based on location
  const result = record.location === 'cache'
    ? await db.execute(
        `INSERT INTO cache_video_files (
          entity_type, entity_id, file_path, file_name, file_size, file_hash,
          video_type, codec, width, height, duration_seconds,
          bitrate, framerate, hdr_type, audio_codec, audio_channels, audio_language,
          source_type, source_url, provider_name, classification_score,
          discovered_at, last_accessed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          record.entityType,
          record.entityId,
          record.filePath,
          record.fileName,
          record.fileSize,
          record.fileHash || null,
          record.videoType,
          record.codec || null,
          record.width || null,
          record.height || null,
          record.durationSeconds || null,
          record.bitrate || null,
          record.framerate || null,
          record.hdrType || null,
          record.audioCodec || null,
          record.audioChannels || null,
          record.audioLanguage || null,
          record.sourceType || null,
          record.sourceUrl || null,
          record.providerName || null,
          record.classificationScore || null
        ]
      )
    : await db.execute(
        `INSERT INTO library_video_files (cache_file_id, file_path, published_at) VALUES (?, ?, CURRENT_TIMESTAMP)`,
        [record.cacheFileId, record.filePath]
      );

  logger.debug('Inserted video file', {
    id: result.insertId,
    location: record.location,
    videoType: record.videoType,
    fileName: record.fileName
  });

  return result.insertId!;
}

// ============================================================
// TEXT FILE OPERATIONS
// ============================================================

/**
 * Insert text file record into database
 */
export async function insertTextFile(
  db: DatabaseConnection,
  record: TextFileRecord
): Promise<number> {
  // Insert into cache or library table based on location
  const result = record.location === 'cache'
    ? await db.execute(
        `INSERT INTO cache_text_files (
          entity_type, entity_id, file_path, file_name, file_size, file_hash,
          text_type, subtitle_language, subtitle_format,
          nfo_is_valid, nfo_has_tmdb_id, nfo_needs_regen,
          source_type, source_url, provider_name, classification_score,
          discovered_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          record.entityType,
          record.entityId,
          record.filePath,
          record.fileName,
          record.fileSize,
          record.fileHash || null,
          record.textType,
          record.subtitleLanguage || null,
          record.subtitleFormat || null,
          record.nfoIsValid !== undefined ? (record.nfoIsValid ? 1 : 0) : null,
          record.nfoHasTmdbId !== undefined ? (record.nfoHasTmdbId ? 1 : 0) : null,
          record.nfoNeedsRegen !== undefined ? (record.nfoNeedsRegen ? 1 : 0) : null,
          record.sourceType || null,
          record.sourceUrl || null,
          null, // provider_name (not in TextFileRecord)
          null  // classification_score (not in TextFileRecord)
        ]
      )
    : await db.execute(
        `INSERT INTO library_text_files (cache_file_id, file_path, published_at) VALUES (?, ?, CURRENT_TIMESTAMP)`,
        [record.cacheFileId, record.filePath]
      );

  logger.debug('Inserted text file', {
    id: result.insertId,
    location: record.location,
    textType: record.textType,
    fileName: record.fileName
  });

  return result.insertId!;
}

/**
 * Calculate SHA256 hash for a file
 */
export async function calculateFileHash(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

// ============================================================
// QUERY HELPERS
// ============================================================

/**
 * Get all files for an entity
 */
export async function getEntityFiles(
  db: DatabaseConnection,
  entityType: 'movie' | 'episode',
  entityId: number
): Promise<{
  videoFiles: VideoFileRecord[];
  imageFiles: ImageFileRecord[];
  textFiles: TextFileRecord[];
}> {
  const [videoFiles, imageFiles, textFiles] = await Promise.all([
    db.query<any[]>(
      `SELECT * FROM cache_video_files WHERE entity_type = ? AND entity_id = ? ORDER BY video_type, file_name`,
      [entityType, entityId]
    ),
    db.query<any[]>(
      `SELECT * FROM cache_image_files WHERE entity_type = ? AND entity_id = ? ORDER BY image_type, file_name`,
      [entityType, entityId]
    ),
    db.query<any[]>(
      `SELECT * FROM cache_text_files WHERE entity_type = ? AND entity_id = ? ORDER BY text_type, file_name`,
      [entityType, entityId]
    )
  ]);

  return {
    videoFiles: videoFiles as any,
    imageFiles: imageFiles as any,
    textFiles: textFiles as any
  };
}
