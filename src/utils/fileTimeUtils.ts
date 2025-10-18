import fs from 'fs';
import { logger } from '../middleware/logging.js';

/**
 * File Time Utility
 *
 * Provides resilient file timestamp handling for systems with unreliable clocks
 * or broken filesystem metadata.
 *
 * Use cases:
 * - Comparing file modification times for deduplication
 * - Storing file timestamps in database for change detection
 * - Determining "newest" file when multiple versions exist
 */

/**
 * Get the most reliable file timestamp for comparison
 *
 * Strategy:
 * 1. Try both mtime (modification time) and birthtime (creation time)
 * 2. Filter out invalid times (future dates, epoch 0)
 * 3. Return the latest valid time
 * 4. If no valid times exist, return null (unobtainable)
 *
 * @param stats - fs.Stats object from fs.stat() or fs.lstat()
 * @returns Unix timestamp in milliseconds, or null if no valid time available
 */
export function getReliableFileTime(stats: fs.Stats): number | null {
  const now = Date.now();
  const mtime = stats.mtime.getTime();
  const birthtime = stats.birthtime.getTime();

  // Filter out invalid times (future dates or epoch 0)
  const validTimes: number[] = [];

  if (mtime > 0 && mtime <= now) {
    validTimes.push(mtime);
  }

  if (birthtime > 0 && birthtime <= now) {
    validTimes.push(birthtime);
  }

  // If no valid times, return null (unobtainable)
  if (validTimes.length === 0) {
    logger.debug('No valid file times available', {
      mtime,
      birthtime,
      now
    });
    return null;
  }

  // Return the latest valid time
  return Math.max(...validTimes);
}

/**
 * Compare two files by timestamp, gracefully handling invalid times
 *
 * Comparison rules:
 * - If both times invalid: return 0 (equal/unknown)
 * - If only A invalid: return -1 (B is newer)
 * - If only B invalid: return 1 (A is newer)
 * - If both valid: compare numerically
 *
 * @param statsA - fs.Stats for first file
 * @param statsB - fs.Stats for second file
 * @returns -1 if fileA is older, 1 if fileA is newer, 0 if equal/unknown
 */
export function compareFileTimestamps(
  statsA: fs.Stats,
  statsB: fs.Stats
): -1 | 0 | 1 {
  const timeA = getReliableFileTime(statsA);
  const timeB = getReliableFileTime(statsB);

  // Both invalid - can't determine, return equal
  if (timeA === null && timeB === null) {
    logger.debug('Both file times invalid, treating as equal');
    return 0;
  }

  // Only A invalid - B wins (newer)
  if (timeA === null) {
    logger.debug('File A time invalid, treating B as newer');
    return -1;
  }

  // Only B invalid - A wins (newer)
  if (timeB === null) {
    logger.debug('File B time invalid, treating A as newer');
    return 1;
  }

  // Both valid - compare
  if (timeA < timeB) return -1;
  if (timeA > timeB) return 1;
  return 0;
}

/**
 * Get a reliable file time for database storage
 * Falls back to current time if file times are invalid
 *
 * Use this when you MUST have a timestamp (e.g., discovered_at, updated_at)
 *
 * @param stats - fs.Stats object
 * @returns Unix timestamp in milliseconds (never null)
 */
export function getFileTimeForDatabase(stats: fs.Stats): number {
  const reliableTime = getReliableFileTime(stats);

  if (reliableTime === null) {
    logger.warn('File times invalid, using current time for database storage');
    return Date.now();
  }

  return reliableTime;
}
