/**
 * Recycling Service - Safe file and directory recycling
 *
 * Moves files/directories to timestamped recycle bins instead of deleting them.
 * Critical safety feature: NEVER recycle main movie file.
 *
 * Recycle bin structure:
 * /data/recycle/
 *   2025-10-23_143022_movie-123/
 *     unknown-file.xyz
 *     extrafanarts/          <- Entire directory moved
 *       fanart1.jpg
 *       fanart2.jpg
 */

import fs from 'fs/promises';
import path from 'path';
import { logger } from '../../middleware/logging.js';

const RECYCLE_BASE_PATH = path.join(process.cwd(), 'data', 'recycle');

/**
 * Create timestamped recycle bin directory for entity
 */
export async function createRecycleBin(
  entityType: 'movie' | 'episode',
  entityId: number
): Promise<string> {
  try {
    // Ensure base recycle directory exists
    await fs.mkdir(RECYCLE_BASE_PATH, { recursive: true });

    // Create timestamped directory: YYYY-MM-DD_HHmmss_movie-123
    const timestamp = new Date()
      .toISOString()
      .replace(/T/, '_')
      .replace(/:/g, '')
      .slice(0, 17); // 2025-10-23_143022

    const recycleBinName = `${timestamp}_${entityType}-${entityId}`;
    const recycleBinPath = path.join(RECYCLE_BASE_PATH, recycleBinName);

    await fs.mkdir(recycleBinPath, { recursive: true });

    logger.info('Created recycle bin', {
      entityType,
      entityId,
      recycleBinPath,
    });

    return recycleBinPath;
  } catch (error: any) {
    logger.error('Failed to create recycle bin', {
      entityType,
      entityId,
      error: error.message,
    });
    throw new Error(`Failed to create recycle bin: ${error.message}`);
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
 * Recycle a single file (move to recycle bin)
 */
export async function recycleFile(
  filePath: string,
  recycleBinPath: string,
  mainMovieFilePath?: string
): Promise<{ success: boolean; newPath?: string; error?: string }> {
  try {
    // Validate safety
    const validation = await validateBeforeRecycling(filePath, mainMovieFilePath);
    if (!validation.safe) {
      const errorResult: { success: boolean; newPath?: string; error?: string } = {
        success: false,
      };
      if (validation.reason) {
        errorResult.error = validation.reason;
      }
      return errorResult;
    }

    const filename = path.basename(filePath);
    const destinationPath = path.join(recycleBinPath, filename);

    // Move file to recycle bin
    await fs.rename(filePath, destinationPath);

    logger.info('Recycled file', {
      originalPath: filePath,
      recyclePath: destinationPath,
    });

    return {
      success: true,
      newPath: destinationPath,
    };
  } catch (error: any) {
    logger.error('Failed to recycle file', {
      filePath,
      recycleBinPath,
      error: error.message,
    });
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Recycle entire directory (move to recycle bin)
 * Used for legacy directories (extrafanarts, extrathumbs)
 */
export async function recycleDirectory(
  directoryPath: string,
  recycleBinPath: string,
  mainMovieFilePath?: string
): Promise<{ success: boolean; newPath?: string; error?: string }> {
  try {
    // Check if directory exists
    try {
      const stats = await fs.stat(directoryPath);
      if (!stats.isDirectory()) {
        return {
          success: false,
          error: 'Path is not a directory',
        };
      }
    } catch {
      return {
        success: false,
        error: 'Directory does not exist',
      };
    }

    // CRITICAL: Check that main movie is NOT inside this directory
    if (mainMovieFilePath) {
      const absoluteDirPath = path.resolve(directoryPath);
      const absoluteMainMovie = path.resolve(mainMovieFilePath);

      if (absoluteMainMovie.startsWith(absoluteDirPath + path.sep)) {
        logger.error('CRITICAL: Main movie file is inside directory to be recycled', {
          directoryPath: absoluteDirPath,
          mainMovieFile: absoluteMainMovie,
        });
        return {
          success: false,
          error: 'CRITICAL: Cannot recycle directory containing main movie file',
        };
      }
    }

    const directoryName = path.basename(directoryPath);
    const destinationPath = path.join(recycleBinPath, directoryName);

    // Move entire directory to recycle bin
    await fs.rename(directoryPath, destinationPath);

    logger.info('Recycled directory', {
      originalPath: directoryPath,
      recyclePath: destinationPath,
    });

    return {
      success: true,
      newPath: destinationPath,
    };
  } catch (error: any) {
    logger.error('Failed to recycle directory', {
      directoryPath,
      recycleBinPath,
      error: error.message,
    });
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * List all recycle bins for an entity
 */
export async function listRecycleBins(
  entityType: 'movie' | 'episode',
  entityId: number
): Promise<string[]> {
  try {
    // Ensure recycle base path exists
    try {
      await fs.access(RECYCLE_BASE_PATH);
    } catch {
      return []; // No recycle bins exist
    }

    const entries = await fs.readdir(RECYCLE_BASE_PATH, { withFileTypes: true });
    const recycleBins: string[] = [];

    const pattern = `_${entityType}-${entityId}`;

    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.includes(pattern)) {
        recycleBins.push(path.join(RECYCLE_BASE_PATH, entry.name));
      }
    }

    return recycleBins.sort().reverse(); // Most recent first
  } catch (error: any) {
    logger.error('Failed to list recycle bins', {
      entityType,
      entityId,
      error: error.message,
    });
    return [];
  }
}

/**
 * List all files in a recycle bin
 */
export async function listRecycledItems(
  recycleBinPath: string
): Promise<{ files: string[]; directories: string[] }> {
  try {
    const entries = await fs.readdir(recycleBinPath, { withFileTypes: true });

    const files: string[] = [];
    const directories: string[] = [];

    for (const entry of entries) {
      const fullPath = path.join(recycleBinPath, entry.name);
      if (entry.isDirectory()) {
        directories.push(fullPath);
      } else {
        files.push(fullPath);
      }
    }

    return { files, directories };
  } catch (error: any) {
    logger.error('Failed to list recycled items', {
      recycleBinPath,
      error: error.message,
    });
    return { files: [], directories: [] };
  }
}

/**
 * Restore file from recycle bin to original location
 */
export async function restoreFromRecycleBin(
  recycledFilePath: string,
  destinationPath: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Check if source exists
    try {
      await fs.access(recycledFilePath);
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

    // Move file back
    await fs.rename(recycledFilePath, destinationPath);

    logger.info('Restored file from recycle bin', {
      recycledPath: recycledFilePath,
      destinationPath,
    });

    return { success: true };
  } catch (error: any) {
    logger.error('Failed to restore from recycle bin', {
      recycledFilePath,
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
 * Permanently delete recycle bin and all contents
 */
export async function permanentlyDeleteRecycleBin(
  recycleBinPath: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await fs.rm(recycleBinPath, { recursive: true, force: true });

    logger.warn('Permanently deleted recycle bin', {
      recycleBinPath,
    });

    return { success: true };
  } catch (error: any) {
    logger.error('Failed to permanently delete recycle bin', {
      recycleBinPath,
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
export async function getRecycleBinStats(
  recycleBinPath: string
): Promise<{
  totalFiles: number;
  totalDirectories: number;
  totalSizeBytes: number;
}> {
  try {
    const { files, directories } = await listRecycledItems(recycleBinPath);

    let totalSizeBytes = 0;

    // Calculate file sizes
    for (const file of files) {
      try {
        const stats = await fs.stat(file);
        totalSizeBytes += stats.size;
      } catch {
        // Skip if file can't be accessed
      }
    }

    // Calculate directory sizes (recursive)
    for (const dir of directories) {
      totalSizeBytes += await getDirectorySize(dir);
    }

    return {
      totalFiles: files.length,
      totalDirectories: directories.length,
      totalSizeBytes,
    };
  } catch (error: any) {
    logger.error('Failed to get recycle bin stats', {
      recycleBinPath,
      error: error.message,
    });
    return {
      totalFiles: 0,
      totalDirectories: 0,
      totalSizeBytes: 0,
    };
  }
}

/**
 * Helper: Calculate total size of directory recursively
 */
async function getDirectorySize(directoryPath: string): Promise<number> {
  try {
    let totalSize = 0;
    const entries = await fs.readdir(directoryPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(directoryPath, entry.name);

      if (entry.isDirectory()) {
        totalSize += await getDirectorySize(fullPath);
      } else {
        try {
          const stats = await fs.stat(fullPath);
          totalSize += stats.size;
        } catch {
          // Skip if file can't be accessed
        }
      }
    }

    return totalSize;
  } catch {
    return 0;
  }
}

/**
 * Clean up old recycle bins (older than specified days)
 */
export async function cleanupOldRecycleBins(
  olderThanDays: number = 30
): Promise<{ deletedCount: number; errors: string[] }> {
  try {
    const entries = await fs.readdir(RECYCLE_BASE_PATH, { withFileTypes: true });
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    let deletedCount = 0;
    const errors: string[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      // Extract timestamp from directory name: 2025-10-23_143022_movie-123
      const match = entry.name.match(/^(\d{4}-\d{2}-\d{2}_\d{6})_/);
      if (!match) continue;

      const timestamp = match[1];
      const dirDate = parseRecycleBinTimestamp(timestamp);

      if (dirDate && dirDate < cutoffDate) {
        const recycleBinPath = path.join(RECYCLE_BASE_PATH, entry.name);
        const result = await permanentlyDeleteRecycleBin(recycleBinPath);

        if (result.success) {
          deletedCount++;
        } else {
          errors.push(`${entry.name}: ${result.error}`);
        }
      }
    }

    logger.info('Cleaned up old recycle bins', {
      olderThanDays,
      deletedCount,
      errorCount: errors.length,
    });

    return { deletedCount, errors };
  } catch (error: any) {
    logger.error('Failed to cleanup old recycle bins', {
      error: error.message,
    });
    return { deletedCount: 0, errors: [error.message] };
  }
}

/**
 * Helper: Parse timestamp from recycle bin directory name
 */
function parseRecycleBinTimestamp(timestamp: string): Date | null {
  try {
    // Format: 2025-10-23_143022
    const [datePart, timePart] = timestamp.split('_');
    const [year, month, day] = datePart.split('-').map(Number);
    const hour = parseInt(timePart.slice(0, 2), 10);
    const minute = parseInt(timePart.slice(2, 4), 10);
    const second = parseInt(timePart.slice(4, 6), 10);

    return new Date(year, month - 1, day, hour, minute, second);
  } catch {
    return null;
  }
}
