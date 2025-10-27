/**
 * Cache functions for video, text, and audio files
 * UUID-based caching - NO content-based deduplication
 * Every library file gets its own unique cache copy
 * Deduplication happens at enrichment/selection phase, not discovery
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { DatabaseConnection } from '../../types/database.js';
import { logger } from '../../middleware/logging.js';
import { getErrorMessage, getErrorCode } from '../../utils/errorHandling.js';

/**
 * Clean up empty parent directories after file deletion
 * Recursively removes empty directories up to the cache root
 */
async function cleanupEmptyDirectories(filePath: string, cacheRoot: string): Promise<void> {
  try {
    let currentDir = path.dirname(filePath);
    const absoluteCacheRoot = path.resolve(cacheRoot);

    while (currentDir !== absoluteCacheRoot && currentDir.startsWith(absoluteCacheRoot)) {
      try {
        const entries = await fs.readdir(currentDir);

        if (entries.length === 0) {
          await fs.rmdir(currentDir);
          logger.debug('Removed empty cache directory', { directory: currentDir });
          currentDir = path.dirname(currentDir);
        } else {
          break;
        }
      } catch (error) {
        logger.debug('Stopped directory cleanup', {
          directory: currentDir,
          reason: getErrorCode(error) || getErrorMessage(error)
        });
        break;
      }
    }

    // Ensure cache root still exists (safety check)
    try {
      await fs.access(absoluteCacheRoot);
    } catch (error) {
      // Cache root was deleted - recreate it
      await fs.mkdir(absoluteCacheRoot, { recursive: true });
      logger.warn('Recreated cache root directory', { cacheRoot: absoluteCacheRoot });
    }
  } catch (error) {
    logger.warn('Failed to cleanup empty directories', {
      filePath,
      error: getErrorMessage(error)
    });
  }
}

export interface CacheAudioFileRecord {
  entityType: 'movie' | 'episode';
  entityId: number;
  filePath: string;
  fileName: string;
  fileSize: number;
  fileHash?: string;
  audioType: 'theme' | 'unknown';
  codec?: string;
  durationSeconds?: number;
  bitrate?: number;
  sampleRate?: number;
  channels?: number;
  language?: string;
  sourceType?: 'provider' | 'local' | 'user';
  sourceUrl?: string;
  providerName?: string;
  classificationScore?: number;
}

// Legacy interface - deprecated
export interface AudioFileRecord extends CacheAudioFileRecord {
  location: 'library' | 'cache';
  libraryFileId?: number;
  cacheFileId?: number;
  referenceCount?: number;
}

/**
 * Insert library audio file record
 * Called during discovery phase to track audio files in the library (theme songs)
 */
export async function insertLibraryAudioFile(
  db: DatabaseConnection,
  filePath: string
): Promise<number> {
  const result = await db.execute(
    `INSERT INTO library_audio_files (file_path, published_at) VALUES (?, CURRENT_TIMESTAMP)`,
    [filePath]
  );

  logger.debug('Inserted audio file into library (awaiting cache)', {
    libraryFileId: result.insertId,
    filePath
  });

  return result.insertId!;
}

/**
 * Insert cache audio file record
 * Internal function called by cacheAudioFile() to store cached audio files
 */
async function insertCacheAudioFile(
  db: DatabaseConnection,
  record: CacheAudioFileRecord
): Promise<number> {
  const result = await db.execute(
    `INSERT INTO cache_audio_files (
      entity_type, entity_id, file_path, file_name, file_size, file_hash,
      audio_type, codec, duration_seconds, bitrate,
      sample_rate, channels, language,
      source_type, source_url, provider_name, classification_score,
      discovered_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [
      record.entityType,
      record.entityId,
      record.filePath,
      record.fileName,
      record.fileSize,
      record.fileHash || null,
      record.audioType,
      record.codec || null,
      record.durationSeconds || null,
      record.bitrate || null,
      record.sampleRate || null,
      record.channels || null,
      record.language || null,
      record.sourceType || null,
      record.sourceUrl || null,
      record.providerName || null,
      record.classificationScore || null
    ]
  );

  logger.debug('Inserted audio file into cache', {
    id: result.insertId,
    audioType: record.audioType,
    fileName: record.fileName
  });

  return result.insertId!;
}

/**
 * @deprecated Use insertLibraryAudioFile or insertCacheAudioFile instead
 */
export async function insertAudioFile(
  db: DatabaseConnection,
  record: AudioFileRecord
): Promise<number> {
  if (record.location === 'cache') {
    return insertCacheAudioFile(db, record);
  } else {
    return insertLibraryAudioFile(db, record.filePath);
  }
}

/**
 * Cache a video file (trailers) - UUID-based naming, NO deduplication
 * Every library file gets its own cache copy
 * @param libraryFileId - Optional library file ID (null for discovered files, number for published files)
 */
export async function cacheVideoFile(
  db: DatabaseConnection,
  libraryFileId: number | null,
  sourceFilePath: string,
  entityType: 'movie' | 'episode',
  entityId: number,
  videoType: string,
  sourceType: 'provider' | 'local' | 'user' = 'local'
): Promise<number> {
  try {
    // Calculate hash (for rescan detection, NOT deduplication)
    const fileBuffer = await fs.readFile(sourceFilePath);
    const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    const stats = await fs.stat(sourceFilePath);

    // Generate UUID for cache file naming
    const uuid = crypto.randomUUID();
    const ext = path.extname(sourceFilePath);

    // Create cache directory structure: /cache/videos/{entityType}/{entityId}/
    const cacheDir = path.join(process.cwd(), 'data', 'cache', 'videos', entityType, String(entityId));
    await fs.mkdir(cacheDir, { recursive: true });

    const cachePath = path.join(cacheDir, `${uuid}${ext}`);

    // Copy to cache
    await fs.copyFile(sourceFilePath, cachePath);

    // Insert cache record directly (we're already in the caching layer)
    const cacheResult = await db.execute(
      `INSERT INTO cache_video_files (
        entity_type, entity_id, file_path, file_name, file_size, file_hash,
        video_type, source_type, discovered_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        entityType,
        entityId,
        cachePath,
        `${uuid}${ext}`,
        stats.size,
        fileHash,
        videoType,
        sourceType
      ]
    );

    const cacheFileId = cacheResult.insertId!;

    // Link library file to cache (if library file exists - only for published files)
    if (libraryFileId !== null) {
      await db.execute(
        `UPDATE library_video_files SET cache_file_id = ? WHERE id = ?`,
        [cacheFileId, libraryFileId]
      );
    }

    logger.info('Video cached successfully', {
      libraryFileId: libraryFileId ?? 'N/A (discovered)',
      cacheFileId,
      uuid,
      hash: fileHash.substring(0, 8),
      videoType,
      size: stats.size
    });

    return cacheFileId;
  } catch (error) {
    logger.error('Failed to cache video file', {
      libraryFileId: libraryFileId ?? 'N/A (discovered)',
      sourceFilePath,
      error: getErrorMessage(error)
    });
    throw error;
  }
}

/**
 * Cache a text file (subtitles) - UUID-based naming, NO deduplication
 * Every library file gets its own cache copy
 * @param libraryFileId - Optional library file ID (null for discovered files, number for published files)
 */
export async function cacheTextFile(
  db: DatabaseConnection,
  libraryFileId: number | null,
  sourceFilePath: string,
  entityType: 'movie' | 'episode',
  entityId: number,
  textType: string,
  sourceType: 'provider' | 'local' | 'user' = 'local'
): Promise<number> {
  try {
    // Calculate hash (for rescan detection, NOT deduplication)
    const fileBuffer = await fs.readFile(sourceFilePath);
    const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    const stats = await fs.stat(sourceFilePath);

    // Generate UUID for cache file naming
    const uuid = crypto.randomUUID();
    const ext = path.extname(sourceFilePath);

    // Create cache directory structure: /cache/text/{entityType}/{entityId}/
    const cacheDir = path.join(process.cwd(), 'data', 'cache', 'text', entityType, String(entityId));
    await fs.mkdir(cacheDir, { recursive: true });

    const cachePath = path.join(cacheDir, `${uuid}${ext}`);

    // Copy to cache
    await fs.copyFile(sourceFilePath, cachePath);

    // For discovered files, we can't get subtitle info from library file (it doesn't exist yet)
    // For published files, we could query but it's better to pass it as parameters
    // For now, leave as null - can be enriched later
    const subtitleLanguage = null;
    const subtitleFormat = ext.substring(1); // Remove dot from extension

    // Insert cache record
    const cacheResult = await db.execute(
      `INSERT INTO cache_text_files (
        entity_type, entity_id, file_path, file_name, file_size, file_hash,
        text_type, subtitle_language, subtitle_format,
        source_type, discovered_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        entityType,
        entityId,
        cachePath,
        `${uuid}${ext}`,
        stats.size,
        fileHash,
        textType,
        subtitleLanguage,
        subtitleFormat,
        sourceType
      ]
    );

    const cacheFileId = cacheResult.insertId!;

    // Link library file to cache (if library file exists - only for published files)
    if (libraryFileId !== null) {
      await db.execute(
        `UPDATE library_text_files SET cache_file_id = ? WHERE id = ?`,
        [cacheFileId, libraryFileId]
      );
    }

    logger.info('Text file cached successfully', {
      libraryFileId: libraryFileId ?? 'N/A (discovered)',
      cacheFileId,
      hash: fileHash.substring(0, 8),
      textType,
      size: stats.size
    });

    return cacheFileId;
  } catch (error) {
    logger.error('Failed to cache text file', {
      libraryFileId: libraryFileId ?? 'N/A (discovered)',
      sourceFilePath,
      error: getErrorMessage(error)
    });
    throw error;
  }
}

/**
 * Cache an audio file (theme songs) - UUID-based naming, NO deduplication
 * Every library file gets its own cache copy
 * @param libraryFileId - Optional library file ID (null for discovered files, number for published files)
 */
export async function cacheAudioFile(
  db: DatabaseConnection,
  libraryFileId: number | null,
  sourceFilePath: string,
  entityType: 'movie' | 'episode',
  entityId: number,
  audioType: string,
  sourceType: 'provider' | 'local' | 'user' = 'local'
): Promise<number> {
  try {
    // Calculate hash (for rescan detection, NOT deduplication)
    const fileBuffer = await fs.readFile(sourceFilePath);
    const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    const stats = await fs.stat(sourceFilePath);

    // Generate UUID for cache file naming
    const uuid = crypto.randomUUID();
    const ext = path.extname(sourceFilePath);

    // Create cache directory structure: /cache/audio/{entityType}/{entityId}/
    const cacheDir = path.join(process.cwd(), 'data', 'cache', 'audio', entityType, String(entityId));
    await fs.mkdir(cacheDir, { recursive: true });

    const cachePath = path.join(cacheDir, `${uuid}${ext}`);

    // Copy to cache
    await fs.copyFile(sourceFilePath, cachePath);

    // Insert cache record
    const cacheResult = await db.execute(
      `INSERT INTO cache_audio_files (
        entity_type, entity_id, file_path, file_name, file_size, file_hash,
        audio_type, source_type, discovered_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        entityType,
        entityId,
        cachePath,
        `${uuid}${ext}`,
        stats.size,
        fileHash,
        audioType,
        sourceType
      ]
    );

    const cacheFileId = cacheResult.insertId!;

    // Link library file to cache (if library file exists - only for published files)
    if (libraryFileId !== null) {
      await db.execute(
        `UPDATE library_audio_files SET cache_file_id = ? WHERE id = ?`,
        [cacheFileId, libraryFileId]
      );
    }

    logger.info('Audio file cached successfully', {
      libraryFileId: libraryFileId ?? 'N/A (discovered)',
      cacheFileId,
      uuid,
      hash: fileHash.substring(0, 8),
      audioType,
      size: stats.size
    });

    return cacheFileId;
  } catch (error) {
    logger.error('Failed to cache audio file', {
      libraryFileId: libraryFileId ?? 'N/A (discovered)',
      sourceFilePath,
      error: getErrorMessage(error)
    });
    throw error;
  }
}


/**
 * Delete cached video file and its library references
 * CASCADE DELETE will automatically remove library entries
 */
export async function deleteCachedVideo(
  db: DatabaseConnection,
  cacheFileId: number
): Promise<void> {
  const rows = await db.query<{ id: number; file_path: string }>(
    `SELECT id, file_path FROM cache_video_files WHERE id = ?`,
    [cacheFileId]
  );

  if (rows && rows.length > 0) {
    const filePath = rows[0].file_path;
    try {
      await fs.unlink(filePath);
      await db.execute(`DELETE FROM cache_video_files WHERE id = ?`, [cacheFileId]);
      logger.info("Deleted cache video file", { cacheFileId, filePath });

      // Clean up empty parent directories
      const cacheRoot = path.join(process.cwd(), "data", "cache", "videos");
      await cleanupEmptyDirectories(filePath, cacheRoot);
    } catch (error) {
      logger.error("Failed to delete cache video file", { cacheFileId, error: getErrorMessage(error) });
    }
  }
}

/**
 * Delete cached text file and its library references
 * CASCADE DELETE will automatically remove library entries
 */
export async function deleteCachedText(
  db: DatabaseConnection,
  cacheFileId: number
): Promise<void> {
  const rows = await db.query<{ id: number; file_path: string }>(
    `SELECT id, file_path FROM cache_text_files WHERE id = ?`,
    [cacheFileId]
  );

  if (rows && rows.length > 0) {
    const filePath = rows[0].file_path;
    try {
      await fs.unlink(filePath);
      await db.execute(`DELETE FROM cache_text_files WHERE id = ?`, [cacheFileId]);
      logger.info("Deleted cache text file", { cacheFileId, filePath });

      // Clean up empty parent directories
      const cacheRoot = path.join(process.cwd(), "data", "cache", "text");
      await cleanupEmptyDirectories(filePath, cacheRoot);
    } catch (error) {
      logger.error("Failed to delete cache text file", { cacheFileId, error: getErrorMessage(error) });
    }
  }
}

/**
 * Delete cached audio file and its library references
 * CASCADE DELETE will automatically remove library entries
 */
export async function deleteCachedAudio(
  db: DatabaseConnection,
  cacheFileId: number
): Promise<void> {
  const rows = await db.query<{ id: number; file_path: string }>(
    `SELECT id, file_path FROM cache_audio_files WHERE id = ?`,
    [cacheFileId]
  );

  if (rows && rows.length > 0) {
    const filePath = rows[0].file_path;
    try {
      await fs.unlink(filePath);
      await db.execute(`DELETE FROM cache_audio_files WHERE id = ?`, [cacheFileId]);
      logger.info("Deleted cache audio file", { cacheFileId, filePath });

      // Clean up empty parent directories
      const cacheRoot = path.join(process.cwd(), "data", "cache", "audio");
      await cleanupEmptyDirectories(filePath, cacheRoot);
    } catch (error) {
      logger.error("Failed to delete cache audio file", { cacheFileId, error: getErrorMessage(error) });
    }
  }
}

