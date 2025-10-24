/**
 * Cache Copy Service - Copy files to cache with UUID naming
 *
 * Uses UUID-based file naming with atomic operations for data integrity.
 * Calculates SHA256 hash and perceptual hash (images only) during copy.
 *
 * Cache structure:
 * /data/cache/
 *   images/movie/123/
 *     a1b2c3d4-e5f6-7890.jpg  <- UUID-named files
 *   videos/movie/123/
 *     b2c3d4e5-f6a1-2345.mp4
 *   audio/movie/123/
 *     c3d4e5f6-a1b2-3456.mp3
 *   text/movie/123/
 *     d4e5f6a1-b2c3-4567.srt
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { logger } from '../../middleware/logging.js';
import { calculatePerceptualHash } from '../../utils/imageHash.js';

const CACHE_BASE_PATH = path.join(process.cwd(), 'data', 'cache');

export interface CacheCopyOptions {
  sourcePath: string;
  entityType: 'movie' | 'episode' | 'series' | 'season' | 'actor';
  entityId: number;
  fileType: 'images' | 'videos' | 'audio' | 'text';
}

export interface CacheFileInfo {
  cachePath: string;
  cacheFileName: string;
  fileHash: string;
  perceptualHash: string | null;
  fileSize: number;
}

/**
 * Calculate SHA256 hash of a file
 */
async function calculateSHA256(filePath: string): Promise<string> {
  const fileBuffer = await fs.readFile(filePath);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  return hashSum.digest('hex');
}

/**
 * Copy file to cache with UUID naming and calculate hashes
 * Uses atomic operations (copy to temp, then rename)
 */
export async function copyToCache(options: CacheCopyOptions): Promise<CacheFileInfo> {
  const { sourcePath, entityType, entityId, fileType } = options;

  try {
    // Verify source file exists
    await fs.access(sourcePath);

    // Generate UUID filename with original extension
    const ext = path.extname(sourcePath);
    const uuid = crypto.randomUUID();
    const cacheFileName = `${uuid}${ext}`;

    // Build cache directory path: /data/cache/{fileType}/{entityType}/{entityId}/
    const cacheDir = path.join(CACHE_BASE_PATH, fileType, entityType, String(entityId));
    const cachePath = path.join(cacheDir, cacheFileName);
    const tempPath = `${cachePath}.tmp.${Date.now()}`;

    // Ensure cache directory exists
    await fs.mkdir(cacheDir, { recursive: true });

    // Atomic copy: copy to temp, then rename
    try {
      await fs.copyFile(sourcePath, tempPath);

      // Calculate file hash (before rename for efficiency)
      const fileHash = await calculateSHA256(tempPath);

      // Calculate perceptual hash for images only
      let perceptualHash: string | null = null;
      if (fileType === 'images') {
        try {
          perceptualHash = await calculatePerceptualHash(tempPath);
        } catch (error: any) {
          logger.warn('Failed to calculate perceptual hash', {
            tempPath,
            error: error.message,
          });
          // Continue without perceptual hash - not critical
        }
      }

      // Get file size
      const stats = await fs.stat(tempPath);
      const fileSize = stats.size;

      // Atomic rename
      await fs.rename(tempPath, cachePath);

      logger.info('Copied file to cache', {
        sourcePath,
        cachePath,
        uuid,
        fileHash,
        fileSize,
        hasPerceptualHash: perceptualHash !== null,
      });

      return {
        cachePath,
        cacheFileName,
        fileHash,
        perceptualHash,
        fileSize,
      };
    } catch (error) {
      // Clean up temp file on failure
      try {
        await fs.unlink(tempPath);
      } catch {
        // Ignore cleanup errors
      }
      throw error;
    }
  } catch (error: any) {
    logger.error('Failed to copy file to cache', {
      sourcePath,
      entityType,
      entityId,
      fileType,
      error: error.message,
    });
    throw new Error(`Failed to copy to cache: ${error.message}`);
  }
}

/**
 * Copy multiple files to cache in sequence
 * Returns array of successful copies and array of errors
 */
export async function copyMultipleToCache(
  files: CacheCopyOptions[]
): Promise<{
  successful: CacheFileInfo[];
  errors: Array<{ options: CacheCopyOptions; error: string }>;
}> {
  const successful: CacheFileInfo[] = [];
  const errors: Array<{ options: CacheCopyOptions; error: string }> = [];

  for (const fileOptions of files) {
    try {
      const result = await copyToCache(fileOptions);
      successful.push(result);
    } catch (error: any) {
      errors.push({
        options: fileOptions,
        error: error.message,
      });
      logger.error('Failed to copy file in batch', {
        sourcePath: fileOptions.sourcePath,
        error: error.message,
      });
    }
  }

  return { successful, errors };
}

/**
 * Get cache directory path for entity
 */
export function getCacheDirPath(
  fileType: 'images' | 'videos' | 'audio' | 'text',
  entityType: 'movie' | 'episode' | 'series' | 'season' | 'actor',
  entityId: number
): string {
  return path.join(CACHE_BASE_PATH, fileType, entityType, String(entityId));
}

/**
 * Check if file exists in cache
 */
export async function cacheFileExists(cachePath: string): Promise<boolean> {
  try {
    await fs.access(cachePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete file from cache
 */
export async function deleteCacheFile(cachePath: string): Promise<boolean> {
  try {
    await fs.unlink(cachePath);
    logger.info('Deleted cache file', { cachePath });
    return true;
  } catch (error: any) {
    logger.error('Failed to delete cache file', {
      cachePath,
      error: error.message,
    });
    return false;
  }
}

/**
 * Get cache statistics for entity
 */
export async function getCacheStats(
  entityType: 'movie' | 'episode' | 'series' | 'season' | 'actor',
  entityId: number
): Promise<{
  images: number;
  videos: number;
  audio: number;
  text: number;
  totalSize: number;
}> {
  const stats = {
    images: 0,
    videos: 0,
    audio: 0,
    text: 0,
    totalSize: 0,
  };

  const fileTypes: Array<'images' | 'videos' | 'audio' | 'text'> = [
    'images',
    'videos',
    'audio',
    'text',
  ];

  for (const fileType of fileTypes) {
    const cacheDir = getCacheDirPath(fileType, entityType, entityId);

    try {
      await fs.access(cacheDir);
      const entries = await fs.readdir(cacheDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isFile()) {
          stats[fileType]++;
          try {
            const filePath = path.join(cacheDir, entry.name);
            const fileStat = await fs.stat(filePath);
            stats.totalSize += fileStat.size;
          } catch {
            // Skip if can't stat file
          }
        }
      }
    } catch {
      // Directory doesn't exist - skip
    }
  }

  return stats;
}
