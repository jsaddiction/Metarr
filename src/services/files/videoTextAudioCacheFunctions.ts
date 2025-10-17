/**
 * Cache functions for video, text, and audio files
 * Implements two-copy architecture: library copy + cache copy with deduplication
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { DatabaseConnection } from '../../types/database.js';
import { logger } from '../../middleware/logging.js';

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
      } catch (error: any) {
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

export interface AudioFileRecord {
  id?: number;
  entityType: 'movie' | 'episode';
  entityId: number;
  filePath: string;
  fileName: string;
  fileSize: number;
  fileHash?: string;
  location: 'library' | 'cache';
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
  libraryFileId?: number;
  cacheFileId?: number;
  referenceCount?: number;
}

/**
 * Insert audio file record into database
 */
export async function insertAudioFile(
  db: DatabaseConnection,
  record: AudioFileRecord
): Promise<number> {
  const result = await db.execute(
    `INSERT INTO audio_files (
      entity_type, entity_id, file_path, file_name, file_size, file_hash,
      location, audio_type, codec, duration_seconds, bitrate,
      sample_rate, channels, language,
      source_type, source_url, provider_name, classification_score,
      library_file_id, cache_file_id, reference_count,
      discovered_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [
      record.entityType,
      record.entityId,
      record.filePath,
      record.fileName,
      record.fileSize,
      record.fileHash || null,
      record.location,
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
      record.classificationScore || null,
      record.libraryFileId || null,
      record.cacheFileId || null,
      record.referenceCount || 0
    ]
  );

  logger.debug('Inserted audio file', {
    id: result.insertId,
    location: record.location,
    audioType: record.audioType,
    fileName: record.fileName
  });

  return result.insertId!;
}

/**
 * Cache a video file (trailers) with deduplication
 * Implements two-copy architecture: library + cache
 */
export async function cacheVideoFile(
  db: DatabaseConnection,
  libraryFileId: number,
  sourceFilePath: string,
  entityType: 'movie' | 'episode',
  entityId: number,
  videoType: string,
  sourceType: 'provider' | 'local' | 'user' = 'local'
): Promise<number> {
  try {
    // Calculate hash for deduplication
    const fileBuffer = await fs.readFile(sourceFilePath);
    const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    const stats = await fs.stat(sourceFilePath);

    // Check if already cached
    const existing = await db.query<{ id: number; reference_count: number }>(
      `SELECT id, reference_count FROM video_files
       WHERE file_hash = ? AND location = 'cache'`,
      [fileHash]
    );

    if (existing.length > 0) {
      const existingId = existing[0].id;
      logger.info('Video already cached, reusing', {
        existingId,
        fileHash: fileHash.substring(0, 8),
        referenceCount: existing[0].reference_count,
        videoType
      });

      // Increment reference count
      await db.execute(
        `UPDATE video_files SET reference_count = reference_count + 1 WHERE id = ?`,
        [existingId]
      );

      // Link library file to cache
      await db.execute(
        `UPDATE video_files SET cache_file_id = ? WHERE id = ?`,
        [existingId, libraryFileId]
      );

      return existingId;
    }

    // New video - create cache file
    const cacheDir = path.join(process.cwd(), 'data', 'cache', 'videos', fileHash.slice(0, 2), fileHash.slice(2, 4));
    await fs.mkdir(cacheDir, { recursive: true });

    const ext = path.extname(sourceFilePath);
    const cachePath = path.join(cacheDir, `${fileHash}${ext}`);

    // Copy to cache
    await fs.copyFile(sourceFilePath, cachePath);

    // Insert cache record
    const cacheResult = await db.execute(
      `INSERT INTO video_files (
        entity_type, entity_id, file_path, file_name, file_size, file_hash,
        location, video_type, source_type, reference_count, discovered_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'cache', ?, ?, 1, CURRENT_TIMESTAMP)`,
      [
        entityType,
        entityId,
        cachePath,
        path.basename(cachePath),
        stats.size,
        fileHash,
        videoType,
        sourceType
      ]
    );

    const cacheFileId = cacheResult.insertId!;

    // Link library file to cache
    await db.execute(
      `UPDATE video_files SET cache_file_id = ? WHERE id = ?`,
      [cacheFileId, libraryFileId]
    );

    logger.info('Video cached successfully', {
      libraryFileId,
      cacheFileId,
      hash: fileHash.substring(0, 8),
      videoType,
      size: stats.size
    });

    return cacheFileId;
  } catch (error: any) {
    logger.error('Failed to cache video file', {
      libraryFileId,
      sourceFilePath,
      error: error.message
    });
    // Return library file ID as fallback
    return libraryFileId;
  }
}

/**
 * Cache a text file (subtitles) with deduplication
 * Implements two-copy architecture: library + cache
 */
export async function cacheTextFile(
  db: DatabaseConnection,
  libraryFileId: number,
  sourceFilePath: string,
  entityType: 'movie' | 'episode',
  entityId: number,
  textType: string,
  sourceType: 'provider' | 'local' | 'user' = 'local'
): Promise<number> {
  try {
    // Calculate hash for deduplication
    const fileBuffer = await fs.readFile(sourceFilePath);
    const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    const stats = await fs.stat(sourceFilePath);

    // Check if already cached
    const existing = await db.query<{ id: number; reference_count: number }>(
      `SELECT id, reference_count FROM text_files
       WHERE file_hash = ? AND location = 'cache'`,
      [fileHash]
    );

    if (existing.length > 0) {
      const existingId = existing[0].id;
      logger.info('Text file already cached, reusing', {
        existingId,
        fileHash: fileHash.substring(0, 8),
        referenceCount: existing[0].reference_count,
        textType
      });

      // Increment reference count
      await db.execute(
        `UPDATE text_files SET reference_count = reference_count + 1 WHERE id = ?`,
        [existingId]
      );

      // Link library file to cache
      await db.execute(
        `UPDATE text_files SET cache_file_id = ? WHERE id = ?`,
        [existingId, libraryFileId]
      );

      return existingId;
    }

    // New text file - create cache file
    const cacheDir = path.join(process.cwd(), 'data', 'cache', 'text', fileHash.slice(0, 2), fileHash.slice(2, 4));
    await fs.mkdir(cacheDir, { recursive: true });

    const ext = path.extname(sourceFilePath);
    const cachePath = path.join(cacheDir, `${fileHash}${ext}`);

    // Copy to cache
    await fs.copyFile(sourceFilePath, cachePath);

    // Get subtitle language and format from library file
    const libraryFile = await db.query<{ subtitle_language: string; subtitle_format: string }>(
      `SELECT subtitle_language, subtitle_format FROM text_files WHERE id = ?`,
      [libraryFileId]
    );

    const subtitleLanguage = libraryFile.length > 0 ? libraryFile[0].subtitle_language : null;
    const subtitleFormat = libraryFile.length > 0 ? libraryFile[0].subtitle_format : null;

    // Insert cache record
    const cacheResult = await db.execute(
      `INSERT INTO text_files (
        entity_type, entity_id, file_path, file_name, file_size, file_hash,
        location, text_type, subtitle_language, subtitle_format,
        source_type, reference_count, discovered_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'cache', ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)`,
      [
        entityType,
        entityId,
        cachePath,
        path.basename(cachePath),
        stats.size,
        fileHash,
        textType,
        subtitleLanguage,
        subtitleFormat,
        sourceType
      ]
    );

    const cacheFileId = cacheResult.insertId!;

    // Link library file to cache
    await db.execute(
      `UPDATE text_files SET cache_file_id = ? WHERE id = ?`,
      [cacheFileId, libraryFileId]
    );

    logger.info('Text file cached successfully', {
      libraryFileId,
      cacheFileId,
      hash: fileHash.substring(0, 8),
      textType,
      size: stats.size
    });

    return cacheFileId;
  } catch (error: any) {
    logger.error('Failed to cache text file', {
      libraryFileId,
      sourceFilePath,
      error: error.message
    });
    // Return library file ID as fallback
    return libraryFileId;
  }
}

/**
 * Cache an audio file (theme songs) with deduplication
 * Implements two-copy architecture: library + cache
 */
export async function cacheAudioFile(
  db: DatabaseConnection,
  libraryFileId: number,
  sourceFilePath: string,
  entityType: 'movie' | 'episode',
  entityId: number,
  audioType: string,
  sourceType: 'provider' | 'local' | 'user' = 'local'
): Promise<number> {
  try {
    // Calculate hash for deduplication
    const fileBuffer = await fs.readFile(sourceFilePath);
    const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    const stats = await fs.stat(sourceFilePath);

    // Check if already cached
    const existing = await db.query<{ id: number; reference_count: number }>(
      `SELECT id, reference_count FROM audio_files
       WHERE file_hash = ? AND location = 'cache'`,
      [fileHash]
    );

    if (existing.length > 0) {
      const existingId = existing[0].id;
      logger.info('Audio file already cached, reusing', {
        existingId,
        fileHash: fileHash.substring(0, 8),
        referenceCount: existing[0].reference_count,
        audioType
      });

      // Increment reference count
      await db.execute(
        `UPDATE audio_files SET reference_count = reference_count + 1 WHERE id = ?`,
        [existingId]
      );

      // Link library file to cache
      await db.execute(
        `UPDATE audio_files SET cache_file_id = ? WHERE id = ?`,
        [existingId, libraryFileId]
      );

      return existingId;
    }

    // New audio file - create cache file
    const cacheDir = path.join(process.cwd(), 'data', 'cache', 'audio', fileHash.slice(0, 2), fileHash.slice(2, 4));
    await fs.mkdir(cacheDir, { recursive: true });

    const ext = path.extname(sourceFilePath);
    const cachePath = path.join(cacheDir, `${fileHash}${ext}`);

    // Copy to cache
    await fs.copyFile(sourceFilePath, cachePath);

    // Insert cache record
    const cacheResult = await db.execute(
      `INSERT INTO audio_files (
        entity_type, entity_id, file_path, file_name, file_size, file_hash,
        location, audio_type, source_type, reference_count, discovered_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'cache', ?, ?, 1, CURRENT_TIMESTAMP)`,
      [
        entityType,
        entityId,
        cachePath,
        path.basename(cachePath),
        stats.size,
        fileHash,
        audioType,
        sourceType
      ]
    );

    const cacheFileId = cacheResult.insertId!;

    // Link library file to cache
    await db.execute(
      `UPDATE audio_files SET cache_file_id = ? WHERE id = ?`,
      [cacheFileId, libraryFileId]
    );

    logger.info('Audio file cached successfully', {
      libraryFileId,
      cacheFileId,
      hash: fileHash.substring(0, 8),
      audioType,
      size: stats.size
    });

    return cacheFileId;
  } catch (error: any) {
    logger.error('Failed to cache audio file', {
      libraryFileId,
      sourceFilePath,
      error: error.message
    });
    // Return library file ID as fallback
    return libraryFileId;
  }
}


/**
 * Decrement reference count for cached video file
 * Optionally delete if reference count reaches 0
 */
export async function decrementVideoReferenceCount(
  db: DatabaseConnection,
  cacheFileId: number,
  deleteIfZero: boolean = false
): Promise<void> {
  await db.execute(
    `UPDATE video_files SET reference_count = GREATEST(0, reference_count - 1) WHERE id = ?`,
    [cacheFileId]
  );

  if (deleteIfZero) {
    const rows = await db.query<{ id: number; file_path: string; reference_count: number }>(
      `SELECT id, file_path, reference_count FROM video_files WHERE id = ? AND reference_count = 0`,
      [cacheFileId]
    );

    if (rows && rows.length > 0) {
      const filePath = rows[0].file_path;
      try {
        await fs.unlink(filePath);
        await db.execute(`DELETE FROM video_files WHERE id = ?`, [cacheFileId]);
        logger.info("Deleted unreferenced cache video file", { cacheFileId, filePath });

        // Clean up empty parent directories
        const cacheRoot = path.join(process.cwd(), "data", "cache", "videos");
        await cleanupEmptyDirectories(filePath, cacheRoot);
      } catch (error: any) {
        logger.error("Failed to delete cache video file", { cacheFileId, error: error.message });
      }
    }
  }
}

/**
 * Decrement reference count for cached text file
 * Optionally delete if reference count reaches 0
 */
export async function decrementTextReferenceCount(
  db: DatabaseConnection,
  cacheFileId: number,
  deleteIfZero: boolean = false
): Promise<void> {
  await db.execute(
    `UPDATE text_files SET reference_count = GREATEST(0, reference_count - 1) WHERE id = ?`,
    [cacheFileId]
  );

  if (deleteIfZero) {
    const rows = await db.query<{ id: number; file_path: string; reference_count: number }>(
      `SELECT id, file_path, reference_count FROM text_files WHERE id = ? AND reference_count = 0`,
      [cacheFileId]
    );

    if (rows && rows.length > 0) {
      const filePath = rows[0].file_path;
      try {
        await fs.unlink(filePath);
        await db.execute(`DELETE FROM text_files WHERE id = ?`, [cacheFileId]);
        logger.info("Deleted unreferenced cache text file", { cacheFileId, filePath });

        // Clean up empty parent directories
        const cacheRoot = path.join(process.cwd(), "data", "cache", "text");
        await cleanupEmptyDirectories(filePath, cacheRoot);
      } catch (error: any) {
        logger.error("Failed to delete cache text file", { cacheFileId, error: error.message });
      }
    }
  }
}

/**
 * Decrement reference count for cached audio file
 * Optionally delete if reference count reaches 0
 */
export async function decrementAudioReferenceCount(
  db: DatabaseConnection,
  cacheFileId: number,
  deleteIfZero: boolean = false
): Promise<void> {
  await db.execute(
    `UPDATE audio_files SET reference_count = GREATEST(0, reference_count - 1) WHERE id = ?`,
    [cacheFileId]
  );

  if (deleteIfZero) {
    const rows = await db.query<{ id: number; file_path: string; reference_count: number }>(
      `SELECT id, file_path, reference_count FROM audio_files WHERE id = ? AND reference_count = 0`,
      [cacheFileId]
    );

    if (rows && rows.length > 0) {
      const filePath = rows[0].file_path;
      try {
        await fs.unlink(filePath);
        await db.execute(`DELETE FROM audio_files WHERE id = ?`, [cacheFileId]);
        logger.info("Deleted unreferenced cache audio file", { cacheFileId, filePath });

        // Clean up empty parent directories
        const cacheRoot = path.join(process.cwd(), "data", "cache", "audio");
        await cleanupEmptyDirectories(filePath, cacheRoot);
      } catch (error: any) {
        logger.error("Failed to delete cache audio file", { cacheFileId, error: error.message });
      }
    }
  }
}

