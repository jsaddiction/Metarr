/**
 * Publishing Recycling Extension
 *
 * Extends publishing service with file recycling capabilities.
 * Handles cleanup of unknown files and legacy directories during publish.
 *
 * Recycling happens AFTER successful asset publishing to ensure safety.
 */

import { DatabaseConnection } from '../types/database.js';
import { logger } from '../middleware/logging.js';
import {
  createRecycleBin,
  recycleFile,
  recycleDirectory,
  validateBeforeRecycling,
} from './files/recyclingService.js';
import { gatherAllFacts } from './scan/factGatheringService.js';
import { classifyDirectory } from './scan/classificationService.js';

export interface RecyclingResult {
  filesRecycled: number;
  directoriesRecycled: number;
  recycleBinPath?: string;
  errors: string[];
}

/**
 * Recycle unknown files and legacy directories after publishing
 *
 * This is called AFTER assets are successfully published to library.
 * It cleans up files that were not classified or are deprecated (legacy dirs).
 *
 * @param db Database connection
 * @param entityType Entity type (movie, episode)
 * @param entityId Entity ID
 * @param libraryPath Library directory path (where movie file is)
 * @param mainMovieFilePath Main movie file path (NEVER recycle this!)
 */
export async function recycleAfterPublish(
  _db: DatabaseConnection,
  entityType: 'movie' | 'episode',
  entityId: number,
  libraryPath: string,
  mainMovieFilePath: string
): Promise<RecyclingResult> {
  const result: RecyclingResult = {
    filesRecycled: 0,
    directoriesRecycled: 0,
    errors: [],
  };

  try {
    logger.info('Starting post-publish recycling', {
      entityType,
      entityId,
      libraryPath,
    });

    // Step 1: Re-run classification to know what to recycle
    logger.debug('Running classification for recycling', {
      libraryPath,
    });

    const scanFacts = await gatherAllFacts(libraryPath);
    const classificationResult = await classifyDirectory(scanFacts);

    // Step 2: Check if there's anything to recycle
    const hasUnknownFiles = classificationResult.filesToRecycle.length > 0;
    const hasLegacyDirs =
      (classificationResult.legacy?.directoriesToRecycle.length || 0) > 0;

    if (!hasUnknownFiles && !hasLegacyDirs) {
      logger.info('No files or directories to recycle', {
        entityType,
        entityId,
      });
      return result;
    }

    // Step 3: Create recycle bin
    const recycleBinPath = await createRecycleBin(entityType, entityId);
    result.recycleBinPath = recycleBinPath;

    // Step 4: Recycle unknown files
    for (const classifiedFile of classificationResult.filesToRecycle) {
      const filePath = classifiedFile.facts.filesystem.absolutePath;

      // Safety check
      const validation = await validateBeforeRecycling(filePath, mainMovieFilePath);
      if (!validation.safe) {
        logger.warn('Skipping file recycling - failed validation', {
          filePath,
          reason: validation.reason,
        });
        result.errors.push(`${filePath}: ${validation.reason}`);
        continue;
      }

      const recycleResult = await recycleFile(filePath, recycleBinPath, mainMovieFilePath);

      if (recycleResult.success) {
        result.filesRecycled++;
        logger.debug('Recycled unknown file', {
          filePath,
          recyclePath: recycleResult.newPath,
        });
      } else {
        result.errors.push(`${filePath}: ${recycleResult.error}`);
      }
    }

    // Step 5: Recycle legacy directories (entire directories)
    if (classificationResult.legacy) {
      for (const dirPath of classificationResult.legacy.directoriesToRecycle) {
        const recycleResult = await recycleDirectory(
          dirPath,
          recycleBinPath,
          mainMovieFilePath
        );

        if (recycleResult.success) {
          result.directoriesRecycled++;
          logger.info('Recycled legacy directory', {
            dirPath,
            recyclePath: recycleResult.newPath,
          });
        } else {
          result.errors.push(`${dirPath}: ${recycleResult.error}`);
        }
      }
    }

    logger.info('Post-publish recycling complete', {
      entityType,
      entityId,
      filesRecycled: result.filesRecycled,
      directoriesRecycled: result.directoriesRecycled,
      errorCount: result.errors.length,
    });

    return result;
  } catch (error: any) {
    logger.error('Post-publish recycling failed', {
      entityType,
      entityId,
      libraryPath,
      error: error.message,
    });

    result.errors.push(`Recycling failed: ${error.message}`);
    return result;
  }
}

/**
 * Recycle unauthorized files (in library but not in cache)
 *
 * This is for verification mode (Workflow 3B) where we make library
 * match cache exactly. Any file in library that's not tracked in cache
 * should be recycled.
 *
 * @param db Database connection
 * @param entityType Entity type
 * @param entityId Entity ID
 * @param libraryPath Library directory path
 * @param mainMovieFilePath Main movie file path (NEVER recycle this!)
 * @param authorizedFiles List of file paths that are authorized (from cache)
 */
export async function recycleUnauthorizedFiles(
  _db: DatabaseConnection,
  entityType: 'movie' | 'episode',
  entityId: number,
  libraryPath: string,
  mainMovieFilePath: string,
  authorizedFiles: string[]
): Promise<RecyclingResult> {
  const result: RecyclingResult = {
    filesRecycled: 0,
    directoriesRecycled: 0,
    errors: [],
  };

  try {
    logger.info('Starting unauthorized file recycling', {
      entityType,
      entityId,
      libraryPath,
      authorizedCount: authorizedFiles.length,
    });

    // Gather all files in library
    const scanFacts = await gatherAllFacts(libraryPath);
    const allLibraryFiles = scanFacts.files.map((f) => f.filesystem.absolutePath);

    // Find unauthorized files (in library but not in authorized list)
    const unauthorizedFiles = allLibraryFiles.filter(
      (filePath) => !authorizedFiles.includes(filePath)
    );

    if (unauthorizedFiles.length === 0) {
      logger.info('No unauthorized files found', {
        entityType,
        entityId,
      });
      return result;
    }

    logger.info('Found unauthorized files', {
      entityType,
      entityId,
      count: unauthorizedFiles.length,
    });

    // Create recycle bin
    const recycleBinPath = await createRecycleBin(entityType, entityId);
    result.recycleBinPath = recycleBinPath;

    // Recycle each unauthorized file
    for (const filePath of unauthorizedFiles) {
      // Safety check
      const validation = await validateBeforeRecycling(filePath, mainMovieFilePath);
      if (!validation.safe) {
        logger.warn('Skipping unauthorized file recycling - failed validation', {
          filePath,
          reason: validation.reason,
        });
        result.errors.push(`${filePath}: ${validation.reason}`);
        continue;
      }

      const recycleResult = await recycleFile(filePath, recycleBinPath, mainMovieFilePath);

      if (recycleResult.success) {
        result.filesRecycled++;
        logger.debug('Recycled unauthorized file', {
          filePath,
          recyclePath: recycleResult.newPath,
        });
      } else {
        result.errors.push(`${filePath}: ${recycleResult.error}`);
      }
    }

    logger.info('Unauthorized file recycling complete', {
      entityType,
      entityId,
      filesRecycled: result.filesRecycled,
      errorCount: result.errors.length,
    });

    return result;
  } catch (error: any) {
    logger.error('Unauthorized file recycling failed', {
      entityType,
      entityId,
      libraryPath,
      error: error.message,
    });

    result.errors.push(`Recycling failed: ${error.message}`);
    return result;
  }
}
