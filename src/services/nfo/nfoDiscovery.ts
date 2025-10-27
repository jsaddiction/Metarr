import fs from 'fs/promises';
import path from 'path';
import { logger } from '../../middleware/logging.js';
import { getErrorMessage } from '../../utils/errorHandling.js';

export interface NFOFile {
  path: string;
  type: 'movie' | 'tvshow' | 'episode';
}

/**
 * Find all NFO files in a movie directory
 * Looks for *.nfo and movie.xml files
 */
export async function findMovieNfos(movieDir: string): Promise<string[]> {
  try {
    const files = await fs.readdir(movieDir);
    const nfoFiles: string[] = [];

    for (const file of files) {
      const lowerFile = file.toLowerCase();
      if (lowerFile.endsWith('.nfo') || lowerFile === 'movie.xml') {
        nfoFiles.push(path.join(movieDir, file));
      }
    }

    logger.debug(`Found ${nfoFiles.length} NFO files in ${movieDir}`, { files: nfoFiles });
    return nfoFiles;
  } catch (error) {
    logger.error(`Failed to find movie NFOs in ${movieDir}`, { error: getErrorMessage(error) });
    return [];
  }
}

/**
 * Find tvshow.nfo in a series directory
 */
export async function findTVShowNfo(seriesDir: string): Promise<string | null> {
  try {
    const tvshowNfoPath = path.join(seriesDir, 'tvshow.nfo');

    try {
      await fs.access(tvshowNfoPath);
      logger.debug(`Found tvshow.nfo in ${seriesDir}`);
      return tvshowNfoPath;
    } catch {
      logger.debug(`No tvshow.nfo found in ${seriesDir}`);
      return null;
    }
  } catch (error) {
    logger.error(`Failed to find tvshow.nfo in ${seriesDir}`, { error: getErrorMessage(error) });
    return null;
  }
}

/**
 * Find all episode NFO files in a series directory (recursively through seasons)
 */
export async function findEpisodeNfos(seriesDir: string): Promise<string[]> {
  const episodeNfos: string[] = [];

  try {
    const entries = await fs.readdir(seriesDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(seriesDir, entry.name);

      if (entry.isDirectory()) {
        // Recursively search season folders
        const seasonNfos = await findEpisodeNfos(fullPath);
        episodeNfos.push(...seasonNfos);
      } else if (entry.name.toLowerCase().endsWith('.nfo')) {
        // Skip tvshow.nfo at root level
        if (entry.name.toLowerCase() !== 'tvshow.nfo') {
          episodeNfos.push(fullPath);
        }
      }
    }

    logger.debug(`Found ${episodeNfos.length} episode NFO files in ${seriesDir}`);
    return episodeNfos;
  } catch (error) {
    logger.error(`Failed to find episode NFOs in ${seriesDir}`, { error: getErrorMessage(error) });
    return [];
  }
}

/**
 * Get all subdirectories in a directory
 * Used for scanning library root directories
 */
export async function getSubdirectories(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const subdirs: string[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        subdirs.push(path.join(dir, entry.name));
      }
    }

    return subdirs;
  } catch (error) {
    logger.error(`Failed to get subdirectories in ${dir}`, { error: getErrorMessage(error) });
    return [];
  }
}

/**
 * Get available drives (Windows only)
 */
export async function getAvailableDrives(): Promise<string[]> {
  // Only works on Windows
  if (process.platform !== 'win32') {
    return [];
  }

  const drives: string[] = [];
  const driveLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

  for (const letter of driveLetters) {
    const drivePath = `${letter}:\\`;
    try {
      await fs.access(drivePath);
      drives.push(drivePath);
    } catch {
      // Drive doesn't exist or isn't accessible
    }
  }

  return drives;
}

/**
 * Check if a directory exists and is readable
 */
export async function validateDirectory(dirPath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(dirPath);
    if (!stats.isDirectory()) {
      return false;
    }

    // Try to read the directory to check read permissions
    await fs.readdir(dirPath);

    // Try to write a temporary file to check write permissions
    const testFilePath = path.join(dirPath, '.metarr-write-test');
    try {
      await fs.writeFile(testFilePath, 'test', 'utf8');
      await fs.unlink(testFilePath);
    } catch (writeError: unknown) {
      logger.debug(`Directory write test failed for ${dirPath}`, { error: (writeError as { message?: string }).message });
      return false;
    }

    return true;
  } catch (error) {
    logger.debug(`Directory validation failed for ${dirPath}`, { error: getErrorMessage(error) });
    return false;
  }
}

/**
 * Get parent directory path (OS-agnostic)
 * Returns null if already at root
 */
export function getParentDirectory(dirPath: string): string | null {
  const parent = path.dirname(dirPath);

  // Check if we're already at root
  // Windows: C:\ equals C:\ when dirname applied
  // Linux: / equals / when dirname applied
  if (parent === dirPath) {
    return null;
  }

  return parent;
}

/**
 * Check if path is at filesystem root
 */
export function isAtRoot(dirPath: string): boolean {
  const normalized = path.normalize(dirPath);

  // Windows: Check if path is a drive root (C:\, D:\, etc.)
  if (process.platform === 'win32') {
    return /^[A-Z]:\\?$/i.test(normalized);
  }

  // Unix/Linux: Check if path is /
  return normalized === '/' || normalized === '';
}

/**
 * Read directory contents for browsing
 * Returns only directories, sorted alphabetically
 * Includes ".." entry for parent navigation when not at root
 */
export async function browseDirectory(dirPath: string): Promise<{ name: string; path: string }[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const directories: { name: string; path: string }[] = [];

    // Add ".." entry for parent directory if not at root
    if (!isAtRoot(dirPath)) {
      const parentPath = getParentDirectory(dirPath);
      if (parentPath) {
        directories.push({
          name: '..',
          path: parentPath,
        });
      }
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        directories.push({
          name: entry.name,
          path: path.join(dirPath, entry.name),
        });
      }
    }

    // Sort alphabetically (but keep ".." at the top)
    directories.sort((a, b) => {
      if (a.name === '..') return -1;
      if (b.name === '..') return 1;
      return a.name.localeCompare(b.name);
    });

    return directories;
  } catch (error) {
    logger.error(`Failed to browse directory ${dirPath}`, { error: getErrorMessage(error) });
    throw new Error(`Cannot read directory: ${getErrorMessage(error)}`);
  }
}
