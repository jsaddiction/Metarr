/**
 * Recycling Service - Safe file recycling with UUID flat file storage
 *
 * Uses flat file storage with UUID naming to prevent collisions.
 * Atomic file operations ensure data integrity.
 * Critical safety feature: NEVER recycle main movie file.
 *
 * Recycle bin structure:
 * /data/recycle/
 *   a1b2c3d4-e5f6-7890-1234-567890abcdef.xyz  <- UUID-named files
 *   b2c3d4e5-f6a1-2345-6789-0abcdef12345.jpg
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { logger } from '../../middleware/logging.js';

const RECYCLE_BASE_PATH = path.join(process.cwd(), 'data', 'recycle');

/**
 * Ensure recycle bin directory exists
 */
export async function ensureRecycleBinExists(): Promise<void> {
  try {
    await fs.mkdir(RECYCLE_BASE_PATH, { recursive: true });
  } catch (error: any) {
    logger.error('Failed to create recycle bin directory', {
      recycleBinPath: RECYCLE_BASE_PATH,
      error: error.message,
    });
    throw new Error(`Failed to create recycle bin directory: ${error.message}`);
  }
}

/**
 * Validate file can be safely recycled (NEVER recycle main movie file)
 */
export async function validateBeforeRecycling(
  filePath: string,
  mainMovieFilePath?: string
): Promise<{ safe: boolean; reason?: string }> {
  try {
    // Check if file exists
    try {
      await fs.access(filePath);
    } catch {
      return {
        safe: false,
        reason: 'File does not exist',
      };
    }

    // CRITICAL: Never recycle main movie file
    if (mainMovieFilePath) {
      const absoluteFilePath = path.resolve(filePath);
      const absoluteMainMovie = path.resolve(mainMovieFilePath);

      if (absoluteFilePath === absoluteMainMovie) {
        logger.error('CRITICAL: Attempted to recycle main movie file', {
          filePath: absoluteFilePath,
        });
        return {
          safe: false,
          reason: 'CRITICAL: Cannot recycle main movie file',
        };
      }
    }

    return { safe: true };
  } catch (error: any) {
    logger.error('Error during recycle validation', {
      filePath,
      error: error.message,
    });
    return {
      safe: false,
      reason: `Validation error: ${error.message}`,
    };
  }
}

/**
 * Recycle a single file (move to recycle bin with UUID naming)
 * Uses atomic file operations (copy + rename) for data integrity
 */
export async function recycleFile(
  filePath: string,
  mainMovieFilePath?: string
): Promise<{ success: boolean; recyclePath?: string; error?: string }> {
  try {
    // Validate safety
    const validation = await validateBeforeRecycling(filePath, mainMovieFilePath);
    if (!validation.safe) {
      return {
        success: false,
        error: validation.reason ?? 'Validation failed',
      };
    }

    // Ensure recycle bin exists
    await ensureRecycleBinExists();

    // Generate UUID filename with original extension
    const ext = path.extname(filePath);
    const uuid = crypto.randomUUID();
    const recycleFileName = `${uuid}${ext}`;
    const recyclePath = path.join(RECYCLE_BASE_PATH, recycleFileName);
    const tempPath = `${recyclePath}.tmp.${Date.now()}`;

    // Atomic move: copy to temp, then rename
    try {
      await fs.copyFile(filePath, tempPath);
      await fs.rename(tempPath, recyclePath);

      // Remove original file
      await fs.unlink(filePath);

      logger.info('Recycled file', {
        originalPath: filePath,
        recyclePath,
        uuid,
      });

      return {
        success: true,
        recyclePath,
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
    logger.error('Failed to recycle file', {
      filePath,
      error: error.message,
    });
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Restore file from recycle bin to original location
 * Uses atomic file operations (copy + rename) for data integrity
 */
export async function restoreFromRecycleBin(
  recyclePath: string,
  destinationPath: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Check if source exists
    try {
      await fs.access(recyclePath);
    } catch {
      return {
        success: false,
        error: 'Recycled file does not exist',
      };
    }

    // Check if destination already exists
    try {
      await fs.access(destinationPath);
      return {
        success: false,
        error: 'Destination file already exists',
      };
    } catch {
      // Good - destination doesn't exist
    }

    // Ensure destination directory exists
    const destinationDir = path.dirname(destinationPath);
    await fs.mkdir(destinationDir, { recursive: true });

    // Atomic move: copy to temp, then rename
    const tempPath = `${destinationPath}.tmp.${Date.now()}`;

    try {
      await fs.copyFile(recyclePath, tempPath);
      await fs.rename(tempPath, destinationPath);

      // Remove from recycle bin
      await fs.unlink(recyclePath);

      logger.info('Restored file from recycle bin', {
        recyclePath,
        destinationPath,
      });

      return { success: true };
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
    logger.error('Failed to restore from recycle bin', {
      recyclePath,
      destinationPath,
      error: error.message,
    });
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Permanently delete a file from recycle bin
 */
export async function permanentlyDeleteFromRecycleBin(
  recyclePath: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Check if file exists
    try {
      await fs.access(recyclePath);
    } catch {
      return {
        success: false,
        error: 'Recycled file does not exist',
      };
    }

    await fs.unlink(recyclePath);

    logger.warn('Permanently deleted file from recycle bin', {
      recyclePath,
    });

    return { success: true };
  } catch (error: any) {
    logger.error('Failed to permanently delete from recycle bin', {
      recyclePath,
      error: error.message,
    });
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Get recycle bin statistics
 */
export async function getRecycleBinStats(): Promise<{
  totalFiles: number;
  totalSizeBytes: number;
}> {
  try {
    // Ensure recycle bin exists
    try {
      await fs.access(RECYCLE_BASE_PATH);
    } catch {
      return { totalFiles: 0, totalSizeBytes: 0 };
    }

    const entries = await fs.readdir(RECYCLE_BASE_PATH, { withFileTypes: true });

    let totalFiles = 0;
    let totalSizeBytes = 0;

    for (const entry of entries) {
      if (entry.isFile()) {
        totalFiles++;
        try {
          const filePath = path.join(RECYCLE_BASE_PATH, entry.name);
          const stats = await fs.stat(filePath);
          totalSizeBytes += stats.size;
        } catch {
          // Skip if file can't be accessed
        }
      }
    }

    return {
      totalFiles,
      totalSizeBytes,
    };
  } catch (error: any) {
    logger.error('Failed to get recycle bin stats', {
      error: error.message,
    });
    return {
      totalFiles: 0,
      totalSizeBytes: 0,
    };
  }
}

/**
 * Clean up old recycle bin files that are no longer in database
 * (Orphaned files from manual database deletions)
 */
export async function cleanupOrphanedRecycleBinFiles(
  validRecyclePaths: string[]
): Promise<{ deletedCount: number; errors: string[] }> {
  try {
    // Ensure recycle bin exists
    try {
      await fs.access(RECYCLE_BASE_PATH);
    } catch {
      return { deletedCount: 0, errors: [] };
    }

    const entries = await fs.readdir(RECYCLE_BASE_PATH, { withFileTypes: true });
    const validPathsSet = new Set(validRecyclePaths);

    let deletedCount = 0;
    const errors: string[] = [];

    for (const entry of entries) {
      if (!entry.isFile()) continue;

      const fullPath = path.join(RECYCLE_BASE_PATH, entry.name);

      // If not in database, delete
      if (!validPathsSet.has(fullPath)) {
        try {
          await fs.unlink(fullPath);
          deletedCount++;
          logger.info('Deleted orphaned recycle bin file', { path: fullPath });
        } catch (error: any) {
          errors.push(`${entry.name}: ${error.message}`);
        }
      }
    }

    logger.info('Cleaned up orphaned recycle bin files', {
      deletedCount,
      errorCount: errors.length,
    });

    return { deletedCount, errors };
  } catch (error: any) {
    logger.error('Failed to cleanup orphaned recycle bin files', {
      error: error.message,
    });
    return { deletedCount: 0, errors: [error.message] };
  }
}
