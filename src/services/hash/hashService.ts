import fs from 'fs/promises';
import crypto from 'crypto';
import path from 'path';
import { logger } from '../../middleware/logging.js';

/**
 * Hybrid Hash Service
 *
 * Implements 4 hash strategies based on file size:
 * 1. Directory Fingerprint: Hash of all filenames + sizes (quick change detection)
 * 2. Small File Full Hash: Complete SHA-256 for files <10MB (NFO, images, subtitles)
 * 3. Medium File Partial Hash: First 1MB + Last 1MB for 10MB-1GB files (trailers)
 * 4. Large File Optimized Hash: First 4MB + Last 4MB + Middle 1MB for >1GB files (movies)
 *
 * Performance benchmarks (from M:\ library with 1,509 movies):
 * - Directory Fingerprint: ~59ms avg
 * - Small File Full: ~41ms avg for 604KB files
 * - Trailer Partial: ~46ms avg
 * - Movie Optimized: ~272ms avg for 23GB files
 */

const SIZE_10MB = 10 * 1024 * 1024;
const SIZE_1GB = 1024 * 1024 * 1024;

export interface DirectoryHashResult {
  directoryHash: string;
  fileCount: number;
  totalSize: number;
}

export interface FileHashResult {
  hash: string;
  strategy: 'full' | 'partial' | 'optimized';
  fileSize: number;
  timeMs: number;
}

/**
 * Strategy 1: Directory Fingerprint
 * Creates a hash from all filenames and sizes in a directory
 * Used for quick "did anything change?" detection
 */
export async function hashDirectoryFingerprint(dirPath: string): Promise<DirectoryHashResult> {
  const startTime = Date.now();

  try {
    const files = await fs.readdir(dirPath, { withFileTypes: true });
    const fileData: string[] = [];
    let totalSize = 0;

    for (const file of files) {
      if (file.isFile()) {
        const filePath = path.join(dirPath, file.name);
        const stats = await fs.stat(filePath);
        fileData.push(`${file.name}:${stats.size}`);
        totalSize += stats.size;
      }
    }

    // Sort for consistent hash regardless of filesystem order
    fileData.sort();

    const hash = crypto.createHash('sha256').update(fileData.join('|')).digest('hex');

    const timeMs = Date.now() - startTime;

    logger.debug('Directory fingerprint generated', {
      dirPath,
      fileCount: fileData.length,
      totalSize,
      hash: hash.substring(0, 8),
      timeMs,
    });

    return {
      directoryHash: hash,
      fileCount: fileData.length,
      totalSize,
    };
  } catch (error: any) {
    logger.error('Failed to generate directory fingerprint', {
      dirPath,
      error: error.message,
    });
    throw new Error(`Directory fingerprint failed: ${error.message}`);
  }
}

/**
 * Strategy 2: Small File Full Hash
 * Complete SHA-256 hash for files <10MB
 * Used for: NFO files, images, subtitles
 * Ensures all changes are detected, even 1-byte modifications
 */
export async function hashSmallFile(filePath: string): Promise<FileHashResult> {
  const startTime = Date.now();

  try {
    const stats = await fs.stat(filePath);

    if (stats.size >= SIZE_10MB) {
      throw new Error(`File too large for full hash: ${stats.size} bytes (max 10MB)`);
    }

    const content = await fs.readFile(filePath);
    const hash = crypto.createHash('sha256').update(content).digest('hex');

    const timeMs = Date.now() - startTime;

    logger.debug('Small file full hash generated', {
      filePath: path.basename(filePath),
      fileSize: stats.size,
      hash: hash.substring(0, 8),
      timeMs,
    });

    return {
      hash,
      strategy: 'full',
      fileSize: stats.size,
      timeMs,
    };
  } catch (error: any) {
    logger.error('Failed to hash small file', {
      filePath,
      error: error.message,
    });
    throw new Error(`Small file hash failed: ${error.message}`);
  }
}

/**
 * Strategy 3: Medium File Partial Hash
 * Hash first 1MB + last 1MB + file size
 * Used for: Trailer files (10MB - 1GB)
 */
export async function hashMediumFile(filePath: string): Promise<FileHashResult> {
  const startTime = Date.now();

  try {
    const stats = await fs.stat(filePath);
    const fileSize = stats.size;

    if (fileSize < SIZE_10MB) {
      throw new Error(`File too small for partial hash: ${fileSize} bytes (use full hash)`);
    }

    if (fileSize > SIZE_1GB) {
      throw new Error(`File too large for partial hash: ${fileSize} bytes (use optimized hash)`);
    }

    const chunkSize = 1024 * 1024; // 1MB
    const file = await fs.open(filePath, 'r');

    try {
      const hasher = crypto.createHash('sha256');

      // Read first 1MB
      const firstChunk = Buffer.alloc(Math.min(chunkSize, fileSize));
      await file.read(firstChunk, 0, firstChunk.length, 0);
      hasher.update(firstChunk);

      // Read last 1MB (if file is large enough)
      if (fileSize > chunkSize) {
        const lastChunk = Buffer.alloc(Math.min(chunkSize, fileSize));
        const lastOffset = Math.max(0, fileSize - chunkSize);
        await file.read(lastChunk, 0, lastChunk.length, lastOffset);
        hasher.update(lastChunk);
      }

      // Include file size to detect size changes
      hasher.update(Buffer.from(fileSize.toString()));

      const hash = hasher.digest('hex');
      const timeMs = Date.now() - startTime;

      logger.debug('Medium file partial hash generated', {
        filePath: path.basename(filePath),
        fileSize,
        hash: hash.substring(0, 8),
        timeMs,
      });

      return {
        hash,
        strategy: 'partial',
        fileSize,
        timeMs,
      };
    } finally {
      await file.close();
    }
  } catch (error: any) {
    logger.error('Failed to hash medium file', {
      filePath,
      error: error.message,
    });
    throw new Error(`Medium file hash failed: ${error.message}`);
  }
}

/**
 * Strategy 4: Large File Optimized Hash
 * Hash first 4MB + last 4MB + middle 1MB + file size
 * Used for: Movie files (>1GB)
 * Captures container metadata (MKV EBML header, MP4 moov atom)
 */
export async function hashLargeFile(filePath: string): Promise<FileHashResult> {
  const startTime = Date.now();

  try {
    const stats = await fs.stat(filePath);
    const fileSize = stats.size;

    if (fileSize < SIZE_1GB) {
      throw new Error(`File too small for optimized hash: ${fileSize} bytes (use partial hash)`);
    }

    const headerSize = 4 * 1024 * 1024; // 4MB
    const middleSize = 1024 * 1024; // 1MB
    const file = await fs.open(filePath, 'r');

    try {
      const hasher = crypto.createHash('sha256');

      // Read first 4MB (container metadata, EBML header, moov atom)
      const firstChunk = Buffer.alloc(Math.min(headerSize, fileSize));
      await file.read(firstChunk, 0, firstChunk.length, 0);
      hasher.update(firstChunk);

      // Read middle 1MB
      if (fileSize > headerSize * 2 + middleSize) {
        const middleOffset = Math.floor((fileSize - middleSize) / 2);
        const middleChunk = Buffer.alloc(middleSize);
        await file.read(middleChunk, 0, middleChunk.length, middleOffset);
        hasher.update(middleChunk);
      }

      // Read last 4MB (may contain moov atom for some MP4s)
      if (fileSize > headerSize) {
        const lastChunk = Buffer.alloc(Math.min(headerSize, fileSize));
        const lastOffset = Math.max(0, fileSize - headerSize);
        await file.read(lastChunk, 0, lastChunk.length, lastOffset);
        hasher.update(lastChunk);
      }

      // Include file size to detect size changes
      hasher.update(Buffer.from(fileSize.toString()));

      const hash = hasher.digest('hex');
      const timeMs = Date.now() - startTime;

      logger.debug('Large file optimized hash generated', {
        filePath: path.basename(filePath),
        fileSize,
        hash: hash.substring(0, 8),
        timeMs,
      });

      return {
        hash,
        strategy: 'optimized',
        fileSize,
        timeMs,
      };
    } finally {
      await file.close();
    }
  } catch (error: any) {
    logger.error('Failed to hash large file', {
      filePath,
      error: error.message,
    });
    throw new Error(`Large file hash failed: ${error.message}`);
  }
}

/**
 * Auto-detect appropriate hash strategy and execute
 * Automatically selects strategy based on file size
 */
export async function hashFile(filePath: string): Promise<FileHashResult> {
  try {
    const stats = await fs.stat(filePath);
    const fileSize = stats.size;

    // Select strategy based on file size
    if (fileSize < SIZE_10MB) {
      return await hashSmallFile(filePath);
    } else if (fileSize < SIZE_1GB) {
      return await hashMediumFile(filePath);
    } else {
      return await hashLargeFile(filePath);
    }
  } catch (error: any) {
    logger.error('Failed to auto-hash file', {
      filePath,
      error: error.message,
    });
    throw new Error(`File hash failed: ${error.message}`);
  }
}

/**
 * Compare hash with stored value
 * Returns true if hashes match (no changes detected)
 */
export function compareHash(currentHash: string, storedHash: string | null): boolean {
  if (!storedHash) {
    return false; // No stored hash means first scan
  }

  return currentHash === storedHash;
}

/**
 * Detect if NFO file has changed
 * Returns true if NFO has been modified externally
 */
export async function hasNfoChanged(nfoPath: string, storedHash: string | null): Promise<boolean> {
  try {
    const result = await hashSmallFile(nfoPath);
    return !compareHash(result.hash, storedHash);
  } catch (error: any) {
    logger.warn('Failed to check NFO changes', {
      nfoPath,
      error: error.message,
    });
    return true; // Assume changed if we can't verify
  }
}

/**
 * Detect if video file has changed
 * Returns true if video file has been modified
 */
export async function hasVideoChanged(
  videoPath: string,
  storedHash: string | null
): Promise<boolean> {
  try {
    const result = await hashFile(videoPath);
    return !compareHash(result.hash, storedHash);
  } catch (error: any) {
    logger.warn('Failed to check video changes', {
      videoPath,
      error: error.message,
    });
    return true; // Assume changed if we can't verify
  }
}

/**
 * Detect if directory contents have changed
 * Quick check before doing full scan
 */
export async function hasDirectoryChanged(
  dirPath: string,
  storedHash: string | null
): Promise<boolean> {
  try {
    const result = await hashDirectoryFingerprint(dirPath);
    return !compareHash(result.directoryHash, storedHash);
  } catch (error: any) {
    logger.warn('Failed to check directory changes', {
      dirPath,
      error: error.message,
    });
    return true; // Assume changed if we can't verify
  }
}
