import { logger } from '../middleware/logging.js';
import { DatabaseConnection } from '../types/database.js';
import path from 'path';

/**
 * Path Mapping Service
 *
 * Handles path translation between different systems:
 * - Radarr/Sonarr/Lidarr (manager path) → Metarr (filesystem path)
 * - Metarr (filesystem path) → Kodi/Jellyfin/Plex (player path)
 *
 * Supports different filesystem conventions:
 * - Windows: M:\Movies\
 * - Linux: /mnt/movies/
 * - Docker containers with bind mounts
 */

export interface ManagerPathMapping {
  id: number;
  manager_type: string;
  manager_path: string;
  metarr_path: string;
}

export interface PlayerPathMapping {
  id: number;
  player_id: number;
  metarr_path: string;
  player_path: string;
}

export interface GroupPathMapping {
  id: number;
  group_id: number;
  metarr_path: string;
  player_path: string;
  description?: string;
}

/**
 * Apply manager path mapping (Radarr/Sonarr → Metarr)
 *
 * Example:
 * - Manager path: /data/movies/The Matrix (1999)/The Matrix.mkv
 * - Metarr path:  M:\Movies\The Matrix (1999)\The Matrix.mkv
 */
export async function applyManagerPathMapping(
  db: DatabaseConnection,
  managerType: string,
  managerPath: string
): Promise<string> {
  try {
    // Get all mappings for this manager type, sorted by length (longest first)
    const mappings = (await db.query(
      `SELECT * FROM manager_path_mappings
       WHERE manager_type = ?
       ORDER BY LENGTH(manager_path) DESC`,
      [managerType]
    )) as ManagerPathMapping[];

    // Find first matching mapping
    for (const mapping of mappings) {
      if (managerPath.startsWith(mapping.manager_path)) {
        const mappedPath = managerPath.replace(mapping.manager_path, mapping.metarr_path);

        logger.debug('Applied manager path mapping', {
          managerType,
          managerPath,
          mappedPath,
          mapping: `${mapping.manager_path} → ${mapping.metarr_path}`,
        });

        return mappedPath;
      }
    }

    // No mapping found - return original path
    logger.warn('No manager path mapping found, using original path', {
      managerType,
      managerPath,
    });

    return managerPath;
  } catch (error: any) {
    logger.error('Failed to apply manager path mapping', {
      managerType,
      managerPath,
      error: error.message,
    });
    // Return original path on error
    return managerPath;
  }
}

/**
 * Apply player path mapping (Metarr → Kodi/Jellyfin/Plex)
 *
 * Example:
 * - Metarr path:  M:\Movies\The Matrix (1999)\The Matrix.mkv
 * - Player path:  /mnt/movies/The Matrix (1999)/The Matrix.mkv
 */
export async function applyPlayerPathMapping(
  db: DatabaseConnection,
  playerId: number,
  metarrPath: string
): Promise<string> {
  try {
    // Get all mappings for this player, sorted by length (longest first)
    const mappings = (await db.query(
      `SELECT * FROM player_path_mappings
       WHERE player_id = ?
       ORDER BY LENGTH(metarr_path) DESC`,
      [playerId]
    )) as PlayerPathMapping[];

    // Find first matching mapping
    for (const mapping of mappings) {
      if (metarrPath.startsWith(mapping.metarr_path)) {
        const mappedPath = metarrPath.replace(mapping.metarr_path, mapping.player_path);

        logger.debug('Applied player path mapping', {
          playerId,
          metarrPath,
          mappedPath,
          mapping: `${mapping.metarr_path} → ${mapping.player_path}`,
        });

        return mappedPath;
      }
    }

    // No mapping found - return original path
    logger.warn('No player path mapping found, using original path', {
      playerId,
      metarrPath,
    });

    return metarrPath;
  } catch (error: any) {
    logger.error('Failed to apply player path mapping', {
      playerId,
      metarrPath,
      error: error.message,
    });
    // Return original path on error
    return metarrPath;
  }
}

/**
 * Normalize path separators for cross-platform compatibility
 * Converts backslashes to forward slashes
 */
export function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

/**
 * Get directory from file path
 * Cross-platform compatible
 */
export function getDirectoryPath(filePath: string): string {
  return path.dirname(filePath);
}

/**
 * Add or update manager path mapping
 */
export async function upsertManagerPathMapping(
  db: DatabaseConnection,
  managerType: string,
  managerPath: string,
  metarrPath: string
): Promise<void> {
  try {
    // Check if mapping exists
    const existing = await db.query(
      `SELECT id FROM manager_path_mappings
       WHERE manager_type = ? AND manager_path = ?`,
      [managerType, managerPath]
    );

    if (existing.length > 0) {
      // Update existing
      await db.execute(
        `UPDATE manager_path_mappings
         SET metarr_path = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [metarrPath, existing[0].id]
      );

      logger.info('Updated manager path mapping', {
        managerType,
        managerPath,
        metarrPath,
      });
    } else {
      // Insert new
      await db.execute(
        `INSERT INTO manager_path_mappings (manager_type, manager_path, metarr_path, created_at, updated_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [managerType, managerPath, metarrPath]
      );

      logger.info('Created manager path mapping', {
        managerType,
        managerPath,
        metarrPath,
      });
    }
  } catch (error: any) {
    logger.error('Failed to upsert manager path mapping', {
      managerType,
      managerPath,
      metarrPath,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Add or update player path mapping
 */
export async function upsertPlayerPathMapping(
  db: DatabaseConnection,
  playerId: number,
  metarrPath: string,
  playerPath: string
): Promise<void> {
  try {
    // Check if mapping exists
    const existing = await db.query(
      `SELECT id FROM player_path_mappings
       WHERE player_id = ? AND metarr_path = ?`,
      [playerId, metarrPath]
    );

    if (existing.length > 0) {
      // Update existing
      await db.execute(
        `UPDATE player_path_mappings
         SET player_path = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [playerPath, existing[0].id]
      );

      logger.info('Updated player path mapping', {
        playerId,
        metarrPath,
        playerPath,
      });
    } else {
      // Insert new
      await db.execute(
        `INSERT INTO player_path_mappings (player_id, metarr_path, player_path, created_at, updated_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [playerId, metarrPath, playerPath]
      );

      logger.info('Created player path mapping', {
        playerId,
        metarrPath,
        playerPath,
      });
    }
  } catch (error: any) {
    logger.error('Failed to upsert player path mapping', {
      playerId,
      metarrPath,
      playerPath,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Delete manager path mapping
 */
export async function deleteManagerPathMapping(
  db: DatabaseConnection,
  mappingId: number
): Promise<void> {
  try {
    await db.execute(`DELETE FROM manager_path_mappings WHERE id = ?`, [mappingId]);

    logger.info('Deleted manager path mapping', { mappingId });
  } catch (error: any) {
    logger.error('Failed to delete manager path mapping', {
      mappingId,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Delete player path mapping
 */
export async function deletePlayerPathMapping(
  db: DatabaseConnection,
  mappingId: number
): Promise<void> {
  try {
    await db.execute(`DELETE FROM player_path_mappings WHERE id = ?`, [mappingId]);

    logger.info('Deleted player path mapping', { mappingId });
  } catch (error: any) {
    logger.error('Failed to delete player path mapping', {
      mappingId,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Apply group path mapping (Metarr → Media Player Group)
 *
 * Universal path mapping for all player types:
 * - Kodi groups: All instances see the same paths (shared MySQL)
 * - Jellyfin groups: Single server with one path namespace
 * - Plex groups: Single server with one path namespace
 *
 * Example:
 * - Metarr path:  /mnt/movies/The Matrix (1999)/The Matrix.mkv
 * - Group path:   /movies/The Matrix (1999)/The Matrix.mkv
 */
export async function applyGroupPathMapping(
  db: DatabaseConnection,
  groupId: number,
  metarrPath: string
): Promise<string> {
  try {
    // Get all mappings for this group, sorted by length (longest first)
    const mappings = (await db.query(
      `SELECT * FROM media_player_group_path_mappings
       WHERE group_id = ?
       ORDER BY LENGTH(metarr_path) DESC`,
      [groupId]
    )) as GroupPathMapping[];

    // Find first matching mapping
    for (const mapping of mappings) {
      if (metarrPath.startsWith(mapping.metarr_path)) {
        const mappedPath = metarrPath.replace(mapping.metarr_path, mapping.player_path);

        logger.debug('Applied group path mapping', {
          groupId,
          metarrPath,
          mappedPath,
          mapping: `${mapping.metarr_path} → ${mapping.player_path}`,
        });

        return mappedPath;
      }
    }

    // No mapping found - return original path
    logger.warn('No group path mapping found, using original path', {
      groupId,
      metarrPath,
    });

    return metarrPath;
  } catch (error: any) {
    logger.error('Failed to apply group path mapping', {
      groupId,
      metarrPath,
      error: error.message,
    });
    // Return original path on error
    return metarrPath;
  }
}

/**
 * Add or update group path mapping
 */
export async function upsertGroupPathMapping(
  db: DatabaseConnection,
  groupId: number,
  metarrPath: string,
  playerPath: string,
  description?: string
): Promise<void> {
  try {
    // Check if mapping exists
    const existing = await db.query(
      `SELECT id FROM media_player_group_path_mappings
       WHERE group_id = ? AND metarr_path = ?`,
      [groupId, metarrPath]
    );

    if (existing.length > 0) {
      // Update existing
      await db.execute(
        `UPDATE media_player_group_path_mappings
         SET player_path = ?, description = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [playerPath, description || null, existing[0].id]
      );

      logger.info('Updated group path mapping', {
        groupId,
        metarrPath,
        playerPath,
        description,
      });
    } else {
      // Insert new
      await db.execute(
        `INSERT INTO media_player_group_path_mappings
         (group_id, metarr_path, player_path, description, created_at, updated_at)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [groupId, metarrPath, playerPath, description || null]
      );

      logger.info('Created group path mapping', {
        groupId,
        metarrPath,
        playerPath,
        description,
      });
    }
  } catch (error: any) {
    logger.error('Failed to upsert group path mapping', {
      groupId,
      metarrPath,
      playerPath,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Delete group path mapping
 */
export async function deleteGroupPathMapping(
  db: DatabaseConnection,
  mappingId: number
): Promise<void> {
  try {
    await db.execute(`DELETE FROM media_player_group_path_mappings WHERE id = ?`, [mappingId]);

    logger.info('Deleted group path mapping', { mappingId });
  } catch (error: any) {
    logger.error('Failed to delete group path mapping', {
      mappingId,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Get all group path mappings
 */
export async function getGroupPathMappings(
  db: DatabaseConnection,
  groupId: number
): Promise<GroupPathMapping[]> {
  try {
    const mappings = (await db.query(
      `SELECT * FROM media_player_group_path_mappings
       WHERE group_id = ?
       ORDER BY LENGTH(metarr_path) DESC`,
      [groupId]
    )) as GroupPathMapping[];

    return mappings;
  } catch (error: any) {
    logger.error('Failed to get group path mappings', {
      groupId,
      error: error.message,
    });
    throw error;
  }
}
