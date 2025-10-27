import { DatabaseManager } from '../database/DatabaseManager.js';
import { minimatch } from 'minimatch';
import { logger } from '../middleware/logging.js';
import { getErrorMessage } from '../utils/errorHandling.js';

export interface IgnorePattern {
  id: number;
  pattern: string;
  pattern_type: 'glob' | 'exact';
  enabled: boolean;
  is_system: boolean;
  description?: string;
  created_at: string;
  updated_at: string;
}

export class IgnorePatternService {
  constructor(private dbManager: DatabaseManager) {}

  /**
   * Get all ignore patterns
   */
  async getAllPatterns(): Promise<IgnorePattern[]> {
    try {
      const db = this.dbManager.getConnection();
      const patterns = await db.query<IgnorePattern>(
        `SELECT * FROM ignore_patterns ORDER BY is_system DESC, pattern ASC`
      );
      return patterns;
    } catch (error) {
      logger.error('Failed to get ignore patterns', { error: getErrorMessage(error) });
      throw new Error(`Failed to get ignore patterns: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Get all enabled patterns
   */
  async getEnabledPatterns(): Promise<IgnorePattern[]> {
    try {
      const db = this.dbManager.getConnection();
      const patterns = await db.query<IgnorePattern>(
        `SELECT * FROM ignore_patterns WHERE enabled = 1`
      );
      return patterns;
    } catch (error) {
      logger.error('Failed to get enabled patterns', { error: getErrorMessage(error) });
      throw new Error(`Failed to get enabled patterns: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Add a new custom pattern
   */
  async addPattern(pattern: string, description?: string): Promise<IgnorePattern> {
    try {
      const db = this.dbManager.getConnection();
      // Determine pattern type
      const patternType = pattern.includes('*') || pattern.includes('?') ? 'glob' : 'exact';

      await db.execute(
        `INSERT INTO ignore_patterns (pattern, pattern_type, enabled, is_system, description)
         VALUES (?, ?, 1, 0, ?)`,
        [pattern, patternType, description || null]
      );

      const newPatterns = await db.query<IgnorePattern>(
        `SELECT * FROM ignore_patterns WHERE pattern = ? AND is_system = 0 ORDER BY id DESC LIMIT 1`,
        [pattern]
      );

      logger.info('Added ignore pattern', { pattern, patternType });
      return newPatterns[0];
    } catch (error) {
      logger.error('Failed to add pattern', { pattern, error: getErrorMessage(error) });
      throw new Error(`Failed to add pattern: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Toggle pattern enabled/disabled
   */
  async togglePattern(id: number, enabled: boolean): Promise<void> {
    try {
      const db = this.dbManager.getConnection();
      await db.execute(
        `UPDATE ignore_patterns SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [enabled ? 1 : 0, id]
      );

      logger.info('Toggled pattern', { id, enabled });
    } catch (error) {
      logger.error('Failed to toggle pattern', { id, error: getErrorMessage(error) });
      throw new Error(`Failed to toggle pattern: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Delete a custom pattern (system patterns cannot be deleted)
   */
  async deletePattern(id: number): Promise<void> {
    try {
      const db = this.dbManager.getConnection();
      // Check if it's a system pattern
      const patterns = await db.query<IgnorePattern>(
        `SELECT is_system FROM ignore_patterns WHERE id = ?`,
        [id]
      );

      if (patterns.length === 0) {
        throw new Error('Pattern not found');
      }

      if (patterns[0].is_system) {
        throw new Error('Cannot delete system patterns');
      }

      await db.execute(`DELETE FROM ignore_patterns WHERE id = ?`, [id]);

      logger.info('Deleted pattern', { id });
    } catch (error) {
      logger.error('Failed to delete pattern', { id, error: getErrorMessage(error) });
      throw new Error(`Failed to delete pattern: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Check if a filename matches any enabled ignore pattern
   */
  async matchesAnyPattern(fileName: string): Promise<boolean> {
    try {
      const patterns = await this.getEnabledPatterns();
      const lowerFileName = fileName.toLowerCase();

      for (const pattern of patterns) {
        const lowerPattern = pattern.pattern.toLowerCase();

        if (pattern.pattern_type === 'exact') {
          // Exact match
          if (lowerFileName === lowerPattern) {
            logger.debug('File matched exact pattern', { fileName, pattern: pattern.pattern });
            return true;
          }
        } else {
          // Glob pattern match
          if (minimatch(lowerFileName, lowerPattern, { nocase: true })) {
            logger.debug('File matched glob pattern', { fileName, pattern: pattern.pattern });
            return true;
          }
        }
      }

      return false;
    } catch (error) {
      logger.error('Failed to check pattern match', { fileName, error: getErrorMessage(error) });
      // Don't throw - if pattern matching fails, don't ignore the file
      return false;
    }
  }

  /**
   * Generate a pattern from a filename
   * Examples:
   *  - "sample.mkv" -> "*.sample.*"
   *  - "RARBG.txt" -> "RARBG*"
   *  - "movie-proof.mkv" -> "*-proof.*"
   */
  generatePatternFromFilename(fileName: string): string {
    const lowerName = fileName.toLowerCase();

    // Check for common patterns
    if (lowerName.includes('sample')) {
      return '*.sample.*';
    }
    if (lowerName.includes('proof')) {
      return '*-proof.*';
    }
    if (lowerName.startsWith('rarbg')) {
      return 'RARBG*';
    }
    if (lowerName.includes('etrg')) {
      return '*ETRG*';
    }

    // Default: use the full filename as exact match
    return fileName;
  }

  /**
   * Delete all unknown files matching a pattern
   */
  async deleteMatchingUnknownFiles(pattern: string): Promise<number> {
    try {
      const db = this.dbManager.getConnection();
      // Get all unknown files
      const unknownFiles = await db.query<{ id: number; file_name: string }>(
        `SELECT id, file_name FROM unknown_files`
      );

      const lowerPattern = pattern.toLowerCase();
      const patternType = pattern.includes('*') || pattern.includes('?') ? 'glob' : 'exact';
      const matchingIds: number[] = [];

      // Find matching files
      for (const file of unknownFiles) {
        const lowerFileName = file.file_name.toLowerCase();
        let matches = false;

        if (patternType === 'exact') {
          matches = lowerFileName === lowerPattern;
        } else {
          matches = minimatch(lowerFileName, lowerPattern, { nocase: true });
        }

        if (matches) {
          matchingIds.push(file.id);
        }
      }

      // Delete matching files
      if (matchingIds.length > 0) {
        const placeholders = matchingIds.map(() => '?').join(',');
        await db.execute(`DELETE FROM unknown_files WHERE id IN (${placeholders})`, matchingIds);

        logger.info('Deleted matching unknown files', { pattern, count: matchingIds.length });
      }

      return matchingIds.length;
    } catch (error) {
      logger.error('Failed to delete matching unknown files', { pattern, error: getErrorMessage(error) });
      throw new Error(`Failed to delete matching unknown files: ${getErrorMessage(error)}`);
    }
  }
}
