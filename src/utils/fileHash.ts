/**
 * Fast File Hashing Utility
 *
 * Provides quick content-based hashing for large files without reading the entire file.
 * Used for FFprobe caching to detect if video files have changed since last scan.
 *
 * Algorithm: Hash first 64KB + last 64KB + file size
 * - Fast: Only reads 128KB regardless of file size
 * - Accurate: Detects re-encodes, upgrades, and replacements
 * - Content-addressed: Same content = same hash, even in different locations
 */

import fs from 'fs/promises';
import crypto from 'crypto';
import { logger } from '../middleware/logging.js';

/**
 * Calculate a quick hash of a file by reading first/last chunks and file size
 *
 * This is much faster than hashing the entire file for large video files (50GB+).
 * The hash detects:
 * - File size changes
 * - Content changes at beginning (headers, metadata)
 * - Content changes at end (different encoding/compression)
 *
 * @param filePath - Absolute path to the file
 * @returns SHA256 hash string (hex)
 *
 * @example
 * ```typescript
 * const hash = await calculateQuickHash('/movies/Movie/movie.mkv');
 * // hash: "a1b2c3d4..." (64 character hex string)
 * ```
 */
export async function calculateQuickHash(filePath: string): Promise<string> {
  const CHUNK_SIZE = 64 * 1024; // 64KB chunks
  const BUFFER_SIZE = CHUNK_SIZE * 2; // Total 128KB

  try {
    // Get file size
    const stat = await fs.stat(filePath);
    const fileSize = stat.size;

    // For very small files, read the entire file
    if (fileSize <= BUFFER_SIZE) {
      const content = await fs.readFile(filePath);
      return crypto.createHash('sha256').update(content).digest('hex');
    }

    // For large files, read first and last chunks
    const fileHandle = await fs.open(filePath, 'r');
    const buffer = Buffer.alloc(BUFFER_SIZE);

    try {
      // Read first 64KB
      await fileHandle.read(buffer, 0, CHUNK_SIZE, 0);

      // Read last 64KB
      const lastChunkPosition = Math.max(0, fileSize - CHUNK_SIZE);
      await fileHandle.read(buffer, CHUNK_SIZE, CHUNK_SIZE, lastChunkPosition);

      // Create hash from: first chunk + last chunk + file size
      const hash = crypto
        .createHash('sha256')
        .update(buffer)
        .update(fileSize.toString())
        .digest('hex');

      return hash;
    } finally {
      await fileHandle.close();
    }
  } catch (error: any) {
    logger.error('Failed to calculate file hash', {
      filePath,
      error: error.message,
    });
    throw new Error(`Failed to hash file: ${error.message}`);
  }
}

/**
 * Calculate hash for multiple files in parallel
 *
 * Useful for batch operations during scanning.
 *
 * @param filePaths - Array of absolute file paths
 * @param concurrency - Maximum number of files to hash simultaneously (default: 5)
 * @returns Map of file path to hash
 */
export async function calculateQuickHashBatch(
  filePaths: string[],
  concurrency: number = 5
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  const queue = [...filePaths];

  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length > 0) {
      const filePath = queue.shift();
      if (!filePath) break;

      try {
        const hash = await calculateQuickHash(filePath);
        results.set(filePath, hash);
      } catch (error: any) {
        logger.warn('Skipping file hash calculation', {
          filePath,
          error: error.message,
        });
        // Don't fail entire batch on one error
      }
    }
  });

  await Promise.all(workers);
  return results;
}

/**
 * Compare if two files have the same content (by hash)
 *
 * @param filePath1 - First file path
 * @param filePath2 - Second file path
 * @returns true if files have identical content
 */
export async function filesHaveSameContent(
  filePath1: string,
  filePath2: string
): Promise<boolean> {
  try {
    const [hash1, hash2] = await Promise.all([
      calculateQuickHash(filePath1),
      calculateQuickHash(filePath2),
    ]);
    return hash1 === hash2;
  } catch (error) {
    return false;
  }
}
