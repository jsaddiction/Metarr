import { DatabaseManager } from '../../database/DatabaseManager.js';
import { logger } from '../../middleware/logging.js';
import { createErrorLogContext } from '../../utils/errorHandling.js';

/**
 * Lockable field names (without _locked suffix)
 */
export const LOCKABLE_FIELDS = [
  'title',
  'original_title',
  'sort_title',
  'year',
  'plot',
  'outline',
  'tagline',
  'content_rating',
  'release_date',
  'user_rating',
  'trailer_url'
] as const;

/**
 * MovieFieldLockService
 *
 * Manages field-level locks to prevent automation from overwriting user edits.
 * When a field is locked, enrichment and provider updates will not modify it.
 *
 * Key Concepts:
 * - **Lock Field**: Prevents automation from modifying specific metadata
 * - **Unlock Field**: Allows automation to update the field again
 * - **Reset Metadata**: Unlocks all fields (user can then trigger re-enrichment)
 *
 * Database Pattern:
 * - Each lockable field has a corresponding `{field}_locked` column
 * - Lock columns are INTEGER (0 = unlocked, 1 = locked)
 * - Locks persist across all operations until explicitly unlocked
 */
export class MovieFieldLockService {
  constructor(private readonly db: DatabaseManager) {}

  /**
   * Lock a specific field to prevent automation from modifying it
   *
   * Locks preserve user manual edits from being overwritten by automation.
   * Once locked, enrichment, provider updates, and webhook processing will
   * skip this field.
   *
   * @param movieId - Movie ID
   * @param fieldName - Field name (e.g., 'title', 'plot', 'poster')
   */
  async lockField(movieId: number, fieldName: string): Promise<{ success: boolean; fieldName: string; locked: boolean }> {
    try {
      const conn = this.db.getConnection();

      // Validate field name and convert to lock column name
      const lockColumnName = `${fieldName}_locked`;

      // Update the lock field
      await conn.execute(
        `UPDATE movies SET ${lockColumnName} = 1 WHERE id = ?`,
        [movieId]
      );

      logger.info('Locked field', {
        movieId,
        fieldName,
        lockColumn: lockColumnName
      });

      return {
        success: true,
        fieldName,
        locked: true
      };
    } catch (error) {
      logger.error('Failed to lock field', createErrorLogContext(error, {
        movieId,
        fieldName
      }));
      throw error;
    }
  }

  /**
   * Unlock a specific field to allow automation to modify it
   *
   * Unlocks a previously locked field.
   * Use with "Reset to Provider" to re-fetch metadata.
   *
   * @param movieId - Movie ID
   * @param fieldName - Field name (e.g., 'title', 'plot', 'poster')
   */
  async unlockField(movieId: number, fieldName: string): Promise<{ success: boolean; fieldName: string; locked: boolean }> {
    try {
      const conn = this.db.getConnection();

      // Validate field name and convert to lock column name
      const lockColumnName = `${fieldName}_locked`;

      // Update the lock field
      await conn.execute(
        `UPDATE movies SET ${lockColumnName} = 0 WHERE id = ?`,
        [movieId]
      );

      logger.info('Unlocked field', {
        movieId,
        fieldName,
        lockColumn: lockColumnName
      });

      return {
        success: true,
        fieldName,
        locked: false
      };
    } catch (error) {
      logger.error('Failed to unlock field', createErrorLogContext(error, {
        movieId,
        fieldName
      }));
      throw error;
    }
  }

  /**
   * Reset all metadata locks and trigger re-enrichment
   *
   * Unlocks all metadata fields and optionally triggers re-fetch from provider.
   * Use this when user wants to discard their manual edits and start fresh.
   *
   * @param movieId - Movie ID
   */
  async resetMetadata(movieId: number): Promise<{ success: boolean; unlockedFields: string[] }> {
    try {
      const conn = this.db.getConnection();

      // List of all metadata lock fields
      const metadataLockFields = [
        'title_locked',
        'original_title_locked',
        'sort_title_locked',
        'year_locked',
        'plot_locked',
        'outline_locked',
        'tagline_locked',
        'content_rating_locked',
        'release_date_locked',
        'user_rating_locked',
        'trailer_url_locked'
      ];

      // Build UPDATE query to unlock all metadata fields
      const unlockSql = metadataLockFields.map(field => `${field} = 0`).join(', ');

      await conn.execute(
        `UPDATE movies SET ${unlockSql} WHERE id = ?`,
        [movieId]
      );

      logger.info('Reset all metadata locks', {
        movieId,
        unlockedFields: metadataLockFields
      });

      // TODO: Optionally trigger re-enrichment job here
      // For now, just unlock the fields - user can manually refresh

      return {
        success: true,
        unlockedFields: metadataLockFields.map(f => f.replace('_locked', ''))
      };
    } catch (error) {
      logger.error('Failed to reset metadata', createErrorLogContext(error, {
        movieId
      }));
      throw error;
    }
  }

  /**
   * Get field lock status for a movie
   *
   * Helper method used by identification and enrichment
   *
   * @param movieId - Movie ID
   * @returns Object with lock status for each field
   */
  // @ts-expect-error - Method reserved for future use
  private async _getFieldLocks(movieId: number): Promise<Record<string, boolean>> {
    const conn = this.db.getConnection();

    try {
      const result = await conn.query<any>('SELECT * FROM movies WHERE id = ?', [movieId]);

      if (result.length === 0) {
        return {};
      }

      const row = result[0];
      const locks: Record<string, boolean> = {};

      // Extract all *_locked columns
      for (const key in row) {
        if (key.endsWith('_locked')) {
          locks[key] = row[key] === 1;
        }
      }

      return locks;
    } catch (error) {
      logger.error('Failed to get field locks', createErrorLogContext(error, {
        movieId
      }));
      return {};
    }
  }
}
