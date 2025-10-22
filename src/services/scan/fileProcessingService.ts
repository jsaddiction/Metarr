/**
 * File Processing Service - PASS 2 of Coin Sorter Scanner
 *
 * Takes classified files from PASS 1 and processes them (caches to database).
 * Transactional processing with error handling and rollback capability.
 */

import { logger } from '../../middleware/logging.js';
import { DatabaseConnection } from '../../types/database.js';
import { ClassificationResult, ClassifiedFile } from './fileClassificationService.js';
import { trackNFOFile } from '../nfo/nfoFileTracking.js';
import { parseFullMovieNfos } from '../nfo/nfoParser.js';
import { cacheImageFile } from '../files/unifiedFileService.js';
import {
  cacheVideoFile,
  cacheTextFile,
} from '../files/videoTextAudioCacheFunctions.js';
import path from 'path';

export interface ProcessingResult {
  nfoProcessed: number;
  imagesProcessed: number;
  trailersProcessed: number;
  subtitlesProcessed: number;
  unknownLogged: number;
  errors: string[];
}

/**
 * Process classified files and cache them to database
 * Priority order: NFO → Images → Trailers → Subtitles → Unknown
 */
export async function processClassifiedFiles(
  db: DatabaseConnection,
  classification: ClassificationResult,
  entityType: 'movie',
  entityId: number,
  videoFileName: string
): Promise<ProcessingResult> {
  const result: ProcessingResult = {
    nfoProcessed: 0,
    imagesProcessed: 0,
    trailersProcessed: 0,
    subtitlesProcessed: 0,
    unknownLogged: 0,
    errors: [],
  };

  try {
    // PRIORITY 1: Process NFO files
    result.nfoProcessed = await processNFOFiles(
      db,
      classification.nfo,
      entityType,
      entityId,
      videoFileName
    );

    // PRIORITY 2: Process image assets
    result.imagesProcessed = await processImageAssets(
      db,
      classification.images,
      entityType,
      entityId
    );

    // PRIORITY 3: Process trailers
    result.trailersProcessed = await processTrailers(
      db,
      classification.trailers,
      entityType,
      entityId
    );

    // PRIORITY 4: Process subtitles
    result.subtitlesProcessed = await processSubtitles(
      db,
      classification.subtitles,
      entityType,
      entityId
    );

    // PRIORITY 5: Log unknown files (no database storage until recycle bin implemented)
    result.unknownLogged = logUnknownFiles(classification.unknown);

    logger.info('File processing complete', {
      entityType,
      entityId,
      ...result,
    });

    return result;
  } catch (error: any) {
    logger.error('File processing failed', {
      entityType,
      entityId,
      error: error.message,
    });
    result.errors.push(error.message);
    return result;
  }
}

/**
 * Process NFO files
 */
async function processNFOFiles(
  db: DatabaseConnection,
  nfoFiles: ClassifiedFile[],
  entityType: 'movie',
  entityId: number,
  videoFileName: string
): Promise<number> {
  if (nfoFiles.length === 0) return 0;

  try {
    const videoBasename = path.basename(videoFileName, path.extname(videoFileName));

    // Parse NFO files (prioritize exact match to video name)
    const nfoPaths = nfoFiles.map(f => f.path);
    const nfoData = await parseFullMovieNfos(nfoPaths, videoBasename);

    if (nfoData.valid && !nfoData.ambiguous) {
      // Track first NFO file (or exact match if found)
      await trackNFOFile(db, nfoPaths[0], entityType, entityId, nfoData);

      logger.info('Processed NFO file', {
        entityType,
        entityId,
        nfoFile: nfoPaths[0],
        tmdbId: nfoData.tmdbId,
      });

      return 1;
    } else if (nfoData.ambiguous) {
      logger.warn('NFO files contain conflicting IDs', {
        entityType,
        entityId,
        files: nfoPaths,
      });
      return 0;
    }

    return 0;
  } catch (error: any) {
    logger.error('Failed to process NFO files', {
      entityType,
      entityId,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Process image assets by type
 */
async function processImageAssets(
  db: DatabaseConnection,
  images: Map<string, ClassifiedFile[]>,
  entityType: 'movie',
  entityId: number
): Promise<number> {
  let processed = 0;

  try {
    for (const [assetType, files] of images.entries()) {
      logger.debug('Processing image assets', {
        assetType,
        count: files.length,
        entityType,
        entityId,
      });

      for (const file of files) {
        try {
          // Cache image file (null libraryFileId since discovered, not published)
          await cacheImageFile(
            db,
            null, // libraryFileId
            file.path,
            entityType,
            entityId,
            assetType,
            'local',
            undefined, // sourceUrl
            undefined  // providerName
          );

          processed++;

          logger.debug('Cached image asset', {
            file: file.name,
            assetType,
            dimensions: file.metadata,
          });
        } catch (error: any) {
          logger.error('Failed to cache image asset', {
            file: file.name,
            assetType,
            error: error.message,
          });
        }
      }
    }

    return processed;
  } catch (error: any) {
    logger.error('Failed to process image assets', {
      entityType,
      entityId,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Process trailer files
 */
async function processTrailers(
  db: DatabaseConnection,
  trailers: ClassifiedFile[],
  entityType: 'movie',
  entityId: number
): Promise<number> {
  if (trailers.length === 0) return 0;

  let processed = 0;

  try {
    for (const trailer of trailers) {
      try {
        // Cache trailer (null libraryFileId since discovered, not published)
        await cacheVideoFile(
          db,
          null, // libraryFileId
          trailer.path,
          entityType,
          entityId,
          'trailer',
          'local'
        );

        processed++;

        logger.debug('Cached trailer', {
          file: trailer.name,
          size: trailer.size,
        });
      } catch (error: any) {
        logger.error('Failed to cache trailer', {
          file: trailer.name,
          error: error.message,
        });
      }
    }

    return processed;
  } catch (error: any) {
    logger.error('Failed to process trailers', {
      entityType,
      entityId,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Process subtitle files
 */
async function processSubtitles(
  db: DatabaseConnection,
  subtitles: ClassifiedFile[],
  entityType: 'movie',
  entityId: number
): Promise<number> {
  if (subtitles.length === 0) return 0;

  let processed = 0;

  try {
    for (const subtitle of subtitles) {
      try {
        // Cache subtitle (null libraryFileId since discovered, not published)
        await cacheTextFile(
          db,
          null, // libraryFileId
          subtitle.path,
          entityType,
          entityId,
          'subtitle',
          'local'
        );

        processed++;

        logger.debug('Cached subtitle', {
          file: subtitle.name,
        });
      } catch (error: any) {
        logger.error('Failed to cache subtitle', {
          file: subtitle.name,
          error: error.message,
        });
      }
    }

    return processed;
  } catch (error: any) {
    logger.error('Failed to process subtitles', {
      entityType,
      entityId,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Log unknown files (no database storage until recycle bin implemented)
 */
function logUnknownFiles(unknown: ClassifiedFile[]): number {
  if (unknown.length === 0) return 0;

  for (const file of unknown) {
    logger.info('Unknown file found (will be recycled when recycle bin implemented)', {
      file: file.name,
      path: file.path,
      size: file.size,
      ext: file.ext,
      reason: file.reason,
    });
  }

  return unknown.length;
}
