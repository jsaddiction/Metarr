/**
 * Storage Integration Service - Store classification results in database
 *
 * Takes classification results and:
 * 1. Copies files to cache with UUID naming
 * 2. Inserts records into cache_*_files tables
 * 3. Updates entity asset references (movies.poster_id, etc.)
 * 4. Marks unknown files in recycle_bin for later recycling
 */

import type { Database } from '../../database/index.js';
import type { ClassificationResult, ClassifiedFile } from '../../types/classification.js';
import { copyToCache } from '../files/cacheCopyService.js';
import {
  insertCacheImageFile,
  insertCacheVideoFile,
  insertCacheAudioFile,
  insertCacheTextFile,
} from '../files/unifiedFileService.js';
import { logger } from '../../middleware/logging.js';

export interface StoredAssets {
  posters: number[];
  fanarts: number[];
  banners: number[];
  clearlogos: number[];
  cleararts: number[];
  discarts: number[];
  landscapes: number[];
  keyarts: number[];
  trailers: number[];
  subtitles: number[];
  audio: number[];
}

/**
 * Store all classification results in database
 */
export async function storeClassificationResults(
  db: Database,
  options: {
    classificationResult: ClassificationResult;
    movieId: number;
    entityType: 'movie' | 'episode';
  }
): Promise<StoredAssets> {
  const { classificationResult, movieId, entityType } = options;

  const stored: StoredAssets = {
    posters: [],
    fanarts: [],
    banners: [],
    clearlogos: [],
    cleararts: [],
    discarts: [],
    landscapes: [],
    keyarts: [],
    trailers: [],
    subtitles: [],
    audio: [],
  };

  logger.info('Storing classification results', {
    entityType,
    entityId: movieId,
    imageCount: classificationResult.images.totalClassified,
    trailerCount: classificationResult.videos.trailers.length,
    subtitleCount: classificationResult.text.subtitles.length,
  });

  // Store images
  await storeImages(db, classificationResult.images.posters, movieId, entityType, 'poster', stored.posters);
  await storeImages(db, classificationResult.images.fanarts, movieId, entityType, 'fanart', stored.fanarts);
  await storeImages(db, classificationResult.images.banners, movieId, entityType, 'banner', stored.banners);
  await storeImages(db, classificationResult.images.clearlogos, movieId, entityType, 'clearlogo', stored.clearlogos);
  await storeImages(db, classificationResult.images.cleararts, movieId, entityType, 'clearart', stored.cleararts);
  await storeImages(db, classificationResult.images.discarts, movieId, entityType, 'discart', stored.discarts);
  await storeImages(db, classificationResult.images.landscapes, movieId, entityType, 'landscape', stored.landscapes);
  await storeImages(db, classificationResult.images.keyarts, movieId, entityType, 'keyart', stored.keyarts);

  // Store trailers
  await storeVideos(db, classificationResult.videos.trailers, movieId, entityType, 'trailer', stored.trailers);

  // Store subtitles
  await storeSubtitles(db, classificationResult.text.subtitles, movieId, entityType, stored.subtitles);

  // Store audio (theme songs, etc.)
  if (classificationResult.audio?.themes) {
    await storeAudioFiles(db, classificationResult.audio.themes, movieId, entityType, 'theme', stored.audio);
  }

  logger.info('Classification results stored successfully', {
    entityType,
    entityId: movieId,
    stored,
  });

  return stored;
}

/**
 * Store image files in cache
 */
async function storeImages(
  db: Database,
  images: ClassifiedFile[],
  entityId: number,
  entityType: 'movie' | 'episode',
  imageType: string,
  outputArray: number[]
): Promise<void> {
  for (const image of images) {
    try {
      // Copy to cache with UUID naming
      const cacheInfo = await copyToCache({
        sourcePath: image.facts.filesystem.absolutePath,
        entityType,
        entityId,
        fileType: 'images',
      });

      // Insert into cache_image_files
      const cacheId = await insertCacheImageFile(db, {
        entityType,
        entityId,
        filePath: cacheInfo.cachePath,
        fileName: cacheInfo.cacheFileName,
        fileSize: cacheInfo.fileSize,
        fileHash: cacheInfo.fileHash,
        perceptualHash: cacheInfo.perceptualHash,
        imageType,
        width: image.facts.image?.width ?? 0,
        height: image.facts.image?.height ?? 0,
        format: image.facts.image?.format ?? 'unknown',
        sourceType: 'local',
        classificationScore: image.confidence,
      });

      outputArray.push(cacheId);

      logger.debug('Stored image in cache', {
        imageType,
        originalPath: image.facts.filesystem.absolutePath,
        cachePath: cacheInfo.cachePath,
        cacheId,
      });
    } catch (error: any) {
      logger.error('Failed to store image', {
        imageType,
        filePath: image.facts.filesystem.absolutePath,
        error: error.message,
      });
    }
  }
}

/**
 * Store video files (trailers) in cache
 */
async function storeVideos(
  db: Database,
  videos: ClassifiedFile[],
  entityId: number,
  entityType: 'movie' | 'episode',
  videoType: string,
  outputArray: number[]
): Promise<void> {
  for (const video of videos) {
    try {
      // Copy to cache with UUID naming
      const cacheInfo = await copyToCache({
        sourcePath: video.facts.filesystem.absolutePath,
        entityType,
        entityId,
        fileType: 'videos',
      });

      // Insert into cache_video_files
      const cacheId = await insertCacheVideoFile(db, {
        entityType,
        entityId,
        filePath: cacheInfo.cachePath,
        fileName: cacheInfo.cacheFileName,
        fileSize: cacheInfo.fileSize,
        fileHash: cacheInfo.fileHash,
        videoType,
        codec: video.facts.videoStream?.codec,
        width: video.facts.videoStream?.width,
        height: video.facts.videoStream?.height,
        durationSeconds: video.facts.videoStream?.durationSeconds,
        bitrate: video.facts.videoStream?.bitrate,
        framerate: video.facts.videoStream?.framerate,
        hdrType: video.facts.videoStream?.hdrType,
        audioCodec: video.facts.audioStream?.codec,
        audioChannels: video.facts.audioStream?.channels,
        audioLanguage: video.facts.audioStream?.language,
        sourceType: 'local',
        classificationScore: video.confidence,
      });

      outputArray.push(cacheId);

      logger.debug('Stored video in cache', {
        videoType,
        originalPath: video.facts.filesystem.absolutePath,
        cachePath: cacheInfo.cachePath,
        cacheId,
      });
    } catch (error: any) {
      logger.error('Failed to store video', {
        videoType,
        filePath: video.facts.filesystem.absolutePath,
        error: error.message,
      });
    }
  }
}

/**
 * Store subtitle files in cache
 */
async function storeSubtitles(
  db: Database,
  subtitles: ClassifiedFile[],
  entityId: number,
  entityType: 'movie' | 'episode',
  outputArray: number[]
): Promise<void> {
  for (const subtitle of subtitles) {
    try {
      // Copy to cache with UUID naming
      const cacheInfo = await copyToCache({
        sourcePath: subtitle.facts.filesystem.absolutePath,
        entityType,
        entityId,
        fileType: 'text',
      });

      // Extract language from filename or facts
      const language = extractLanguageFromFilename(subtitle.facts.filesystem.filename);

      // Insert into cache_text_files
      const cacheId = await insertCacheTextFile(db, {
        entityType,
        entityId,
        filePath: cacheInfo.cachePath,
        fileName: cacheInfo.cacheFileName,
        fileSize: cacheInfo.fileSize,
        fileHash: cacheInfo.fileHash,
        textType: 'subtitle',
        subtitleLanguage: language,
        subtitleFormat: subtitle.facts.filesystem.extension.replace('.', ''),
        sourceType: 'local',
        classificationScore: subtitle.confidence,
      });

      outputArray.push(cacheId);

      logger.debug('Stored subtitle in cache', {
        language,
        originalPath: subtitle.facts.filesystem.absolutePath,
        cachePath: cacheInfo.cachePath,
        cacheId,
      });
    } catch (error: any) {
      logger.error('Failed to store subtitle', {
        filePath: subtitle.facts.filesystem.absolutePath,
        error: error.message,
      });
    }
  }
}

/**
 * Store audio files (theme songs) in cache
 */
async function storeAudioFiles(
  db: Database,
  audioFiles: ClassifiedFile[],
  entityId: number,
  entityType: 'movie' | 'episode',
  audioType: string,
  outputArray: number[]
): Promise<void> {
  for (const audio of audioFiles) {
    try {
      // Copy to cache with UUID naming
      const cacheInfo = await copyToCache({
        sourcePath: audio.facts.filesystem.absolutePath,
        entityType,
        entityId,
        fileType: 'audio',
      });

      // Insert into cache_audio_files
      const cacheId = await insertCacheAudioFile(db, {
        entityType: entityType === 'episode' ? 'series' : 'movie', // Audio is movie/series level
        entityId,
        filePath: cacheInfo.cachePath,
        fileName: cacheInfo.cacheFileName,
        fileSize: cacheInfo.fileSize,
        fileHash: cacheInfo.fileHash,
        audioType,
        codec: audio.facts.audioStream?.codec,
        durationSeconds: audio.facts.audioStream?.durationSeconds,
        bitrate: audio.facts.audioStream?.bitrate,
        sampleRate: audio.facts.audioStream?.sampleRate,
        channels: audio.facts.audioStream?.channels,
        language: audio.facts.audioStream?.language,
        sourceType: 'local',
        classificationScore: audio.confidence,
      });

      outputArray.push(cacheId);

      logger.debug('Stored audio in cache', {
        audioType,
        originalPath: audio.facts.filesystem.absolutePath,
        cachePath: cacheInfo.cachePath,
        cacheId,
      });
    } catch (error: any) {
      logger.error('Failed to store audio', {
        audioType,
        filePath: audio.facts.filesystem.absolutePath,
        error: error.message,
      });
    }
  }
}

/**
 * Update movie asset references (poster_id, fanart_id, etc.)
 */
export async function updateMovieAssetLinks(
  db: Database,
  movieId: number,
  stored: StoredAssets
): Promise<void> {
  // Use first asset of each type (auto-selection)
  const updates: Record<string, number | null> = {
    poster_id: stored.posters[0] ?? null,
    fanart_id: stored.fanarts[0] ?? null,
    banner_id: stored.banners[0] ?? null,
    clearlogo_id: stored.clearlogos[0] ?? null,
    clearart_id: stored.cleararts[0] ?? null,
    disc_id: stored.discarts[0] ?? null,
    landscape_id: stored.landscapes[0] ?? null,
    keyart_id: stored.keyarts[0] ?? null,
  };

  const setClause = Object.keys(updates)
    .map((key) => `${key} = ?`)
    .join(', ');

  const values = [...Object.values(updates), movieId];

  await db.execute(`UPDATE movies SET ${setClause} WHERE id = ?`, values);

  logger.info('Updated movie asset links', {
    movieId,
    updates,
  });
}

/**
 * Mark unknown files for recycling
 */
export async function markUnknownFilesForRecycling(
  db: Database,
  options: {
    classificationResult: ClassificationResult;
    movieId: number;
    entityType: 'movie' | 'episode';
  }
): Promise<void> {
  const { classificationResult, movieId, entityType } = options;
  const unknownFiles = classificationResult.filesToRecycle;

  if (unknownFiles.length === 0) {
    logger.debug('No unknown files to mark for recycling', {
      entityType,
      entityId: movieId,
    });
    return;
  }

  for (const file of unknownFiles) {
    try {
      // Check if already in recycle bin
      const existing = await db.get(
        'SELECT id FROM recycle_bin WHERE original_path = ?',
        [file.facts.filesystem.absolutePath]
      );

      if (existing) {
        logger.debug('File already in recycle bin', {
          originalPath: file.facts.filesystem.absolutePath,
        });
        continue;
      }

      // Insert with recycle_path = NULL (pending physical move)
      await db.execute(
        `INSERT INTO recycle_bin
         (entity_type, entity_id, original_path, recycle_path, file_name, file_size, recycled_at)
         VALUES (?, ?, ?, NULL, ?, ?, NULL)`,
        [
          entityType,
          movieId,
          file.facts.filesystem.absolutePath,
          file.facts.filesystem.filename,
          file.facts.filesystem.size,
        ]
      );

      logger.info('Marked file for recycling', {
        entityType,
        entityId: movieId,
        originalPath: file.facts.filesystem.absolutePath,
      });
    } catch (error: any) {
      logger.error('Failed to mark file for recycling', {
        filePath: file.facts.filesystem.absolutePath,
        error: error.message,
      });
    }
  }

  logger.info('Marked unknown files for recycling', {
    entityType,
    entityId: movieId,
    count: unknownFiles.length,
  });
}

/**
 * Extract language code from subtitle filename
 * Examples: movie.en.srt -> en, movie.eng.srt -> eng, movie.srt -> unknown
 */
function extractLanguageFromFilename(filename: string): string {
  const match = filename.match(/\.([a-z]{2,3})\.[^.]+$/i);
  return match ? match[1].toLowerCase() : 'unknown';
}
