/**
 * Cache Cleanup Utilities
 * Removes empty cache directories after file deletions
 */

import fs from 'fs/promises';
import path from 'path';
import { logger } from '../../middleware/logging.js';

/**
 * Clean up all empty subdirectories in cache
 * Recursively removes empty directories but preserves type roots (images, videos, text, audio)
 */
export async function cleanupEmptyCacheDirectories(): Promise<void> {
  const cacheRoot = path.join(process.cwd(), 'data', 'cache');
  const cacheTypes = ['images', 'videos', 'text', 'audio'];

  let totalRemoved = 0;

  for (const cacheType of cacheTypes) {
    const typeRoot = path.join(cacheRoot, cacheType);

    try {
      // Ensure type root exists
      await fs.mkdir(typeRoot, { recursive: true });

      // Remove empty subdirectories
      const removed = await removeEmptyDirectoriesRecursive(typeRoot, typeRoot);
      totalRemoved += removed;
    } catch (error: any) {
      logger.warn(`Failed to cleanup ${cacheType} cache directories`, {
        error: error.message
      });
    }
  }

  if (totalRemoved > 0) {
    logger.info(`Cleaned up ${totalRemoved} empty cache directories`);
  } else {
    logger.debug('No empty cache directories to clean up');
  }
}

/**
 * Recursively remove empty directories
 * Returns count of directories removed
 */
async function removeEmptyDirectoriesRecursive(
  dirPath: string,
  stopAtPath: string
): Promise<number> {
  let removedCount = 0;

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    // First, recursively clean subdirectories
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const subPath = path.join(dirPath, entry.name);
        removedCount += await removeEmptyDirectoriesRecursive(subPath, stopAtPath);
      }
    }

    // After cleaning subdirectories, check if THIS directory is now empty
    // Don't delete the stop path (type root like /data/cache/images)
    if (dirPath !== stopAtPath) {
      const remainingEntries = await fs.readdir(dirPath);

      if (remainingEntries.length === 0) {
        await fs.rmdir(dirPath);
        logger.debug('Removed empty cache directory', { directory: dirPath });
        removedCount++;
      }
    }
  } catch (error: any) {
    // Directory doesn't exist or can't be read - skip it
    logger.debug('Skipped directory during cleanup', {
      directory: dirPath,
      reason: error.code || error.message
    });
  }

  return removedCount;
}
