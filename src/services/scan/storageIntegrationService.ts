/**
 * Storage Integration Service - Store classification results in database
 *
 * Takes classification results and:
 * 1. Copies files to cache with UUID naming
 * 2. Inserts records into cache_*_files tables
 * 3. Updates entity asset references (movies.poster_id, etc.)
 * 4. Marks unknown files in recycle_bin for later recycling
 */

import type { DatabaseConnection } from '../../types/database.js';
import type { ClassificationResult, ClassifiedFile } from '../../types/classification.js';
import { copyToCache } from '../files/cacheCopyService.js';
import {
  insertCacheImageFile,
  insertCacheVideoFile,
  insertCacheTextFile,
} from '../files/unifiedFileService.js';
import { logger } from '../../middleware/logging.js';
import { getErrorMessage } from '../../utils/errorHandling.js';

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
  db: DatabaseConnection,
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
  await storeImages(db, classificationResult.images.discs, movieId, entityType, 'discart', stored.discarts);
  await storeImages(db, classificationResult.images.landscapes, movieId, entityType, 'landscape', stored.landscapes);
  await storeImages(db, classificationResult.images.keyarts, movieId, entityType, 'keyart', stored.keyarts);

  // Store trailers
  await storeVideos(db, classificationResult.videos.trailers, movieId, entityType, 'trailer', stored.trailers);

  // Store subtitles
  await storeSubtitles(db, classificationResult.text.subtitles, movieId, entityType, stored.subtitles);

  // TODO: Re-enable audio storage when insertCacheAudioFile is implemented
  // Store audio (theme songs, etc.)
  // if (classificationResult.audio?.themes) {
  //   await storeAudioFiles(db, classificationResult.audio.themes, movieId, entityType, 'theme', stored.audio);
  // }

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
  db: DatabaseConnection,
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
      const imageRecord: any = {
        entityType,
        entityId,
        filePath: cacheInfo.cachePath,
        fileName: cacheInfo.cacheFileName,
        fileSize: cacheInfo.fileSize,
        fileHash: cacheInfo.fileHash,
        imageType: imageType as 'poster' | 'fanart' | 'banner' | 'clearlogo' | 'clearart' | 'discart' | 'landscape' | 'keyart' | 'thumb' | 'actor_thumb' | 'unknown',
        width: image.facts.image?.width ?? 0,
        height: image.facts.image?.height ?? 0,
        format: image.facts.image?.format ?? 'unknown',
        sourceType: 'local',
        classificationScore: image.confidence,
      };
      if (cacheInfo.perceptualHash) {
        imageRecord.perceptualHash = cacheInfo.perceptualHash;
      }
      const cacheId = await insertCacheImageFile(db, imageRecord);

      outputArray.push(cacheId);

      logger.debug('Stored image in cache', {
        imageType,
        originalPath: image.facts.filesystem.absolutePath,
        cachePath: cacheInfo.cachePath,
        cacheId,
      });
    } catch (error) {
      logger.error('Failed to store image', {
        imageType,
        filePath: image.facts.filesystem.absolutePath,
        error: getErrorMessage(error),
      });
    }
  }
}

/**
 * Store video files (trailers) in cache
 */
async function storeVideos(
  db: DatabaseConnection,
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

      // Extract video stream info (use first video stream if available)
      const videoStream = video.facts.video?.videoStreams?.[0];
      const audioStream = video.facts.video?.audioStreams?.[0];

      // Insert into cache_video_files
      const videoRecord: any = {
        entityType,
        entityId,
        filePath: cacheInfo.cachePath,
        fileName: cacheInfo.cacheFileName,
        fileSize: cacheInfo.fileSize,
        fileHash: cacheInfo.fileHash,
        videoType: videoType as 'trailer' | 'sample' | 'extra',
        sourceType: 'local',
        classificationScore: video.confidence,
      };
      // Only add optional properties if they have values
      if (videoStream?.codec) videoRecord.codec = videoStream.codec;
      if (videoStream?.width) videoRecord.width = videoStream.width;
      if (videoStream?.height) videoRecord.height = videoStream.height;
      if (video.facts.video?.durationSeconds) videoRecord.durationSeconds = video.facts.video.durationSeconds;
      if (video.facts.video?.overallBitrate) videoRecord.bitrate = video.facts.video.overallBitrate;
      if (videoStream?.fps) videoRecord.framerate = videoStream.fps;
      if (videoStream?.hdrFormat) videoRecord.hdrType = videoStream.hdrFormat;
      if (audioStream?.codec) videoRecord.audioCodec = audioStream.codec;
      if (audioStream?.channels) videoRecord.audioChannels = audioStream.channels;
      if (audioStream?.language) videoRecord.audioLanguage = audioStream.language;

      const cacheId = await insertCacheVideoFile(db, videoRecord);

      outputArray.push(cacheId);

      logger.debug('Stored video in cache', {
        videoType,
        originalPath: video.facts.filesystem.absolutePath,
        cachePath: cacheInfo.cachePath,
        cacheId,
      });
    } catch (error) {
      logger.error('Failed to store video', {
        videoType,
        filePath: video.facts.filesystem.absolutePath,
        error: getErrorMessage(error),
      });
    }
  }
}

/**
 * Store subtitle files in cache
 */
async function storeSubtitles(
  db: DatabaseConnection,
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
      });

      outputArray.push(cacheId);

      logger.debug('Stored subtitle in cache', {
        language,
        originalPath: subtitle.facts.filesystem.absolutePath,
        cachePath: cacheInfo.cachePath,
        cacheId,
      });
    } catch (error) {
      logger.error('Failed to store subtitle', {
        filePath: subtitle.facts.filesystem.absolutePath,
        error: getErrorMessage(error),
      });
    }
  }
}

// TODO: Re-implement storeAudioFiles when insertCacheAudioFile is available
// async function storeAudioFiles(...) { ... }

/**
 * Update movie asset references (poster_id, fanart_id, etc.)
 */
export async function updateMovieAssetLinks(
  _db: DatabaseConnection,
  movieId: number,
  stored: StoredAssets
): Promise<void> {
  // NOTE: Legacy function - FK columns (poster_id, fanart_id, etc.) removed from schema
  // Assets are now managed solely through cache_image_files table with entity_type/entity_id/image_type
  // This function is now a no-op but kept for backward compatibility with scan service
  logger.debug('updateMovieAssetLinks called (no-op - FK columns removed)', {
    movieId,
    assetCounts: {
      posters: stored.posters.length,
      fanarts: stored.fanarts.length,
      banners: stored.banners.length,
      clearlogos: stored.clearlogos.length,
      cleararts: stored.cleararts.length,
      discarts: stored.discarts.length,
      landscapes: stored.landscapes.length,
      keyarts: stored.keyarts.length,
    },
  });
}

/**
 * Mark unknown files for recycling
 *
 * NOTE: Recycle bin feature has been removed. This function now just logs unknown files.
 * Unknown files are tracked in the unknown_files table instead.
 */
export async function markUnknownFilesForRecycling(
  _db: DatabaseConnection,
  options: {
    classificationResult: ClassificationResult;
    movieId: number;
    entityType: 'movie' | 'episode';
  }
): Promise<void> {
  const { classificationResult, movieId, entityType } = options;
  const unknownFiles = classificationResult.filesToRecycle;

  if (unknownFiles.length === 0) {
    logger.debug('No unknown files found', {
      entityType,
      entityId: movieId,
    });
    return;
  }

  // Log unknown files for visibility
  logger.info('Unknown files detected (tracked in unknown_files table)', {
    entityType,
    entityId: movieId,
    count: unknownFiles.length,
    files: unknownFiles.map(f => f.facts.filesystem.filename)
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
