import { DatabaseConnection } from '../DatabaseConnection.js';

/**
 * Migration: Create media_player_group_path_mappings table
 *
 * Purpose: Move path mappings from library level to group level
 *
 * Why Group-Level Path Mapping?
 * - All players in a group share the same path view
 * - Kodi instances with shared MySQL see identical paths
 * - Jellyfin/Plex servers have one path namespace
 * - Simpler configuration (one mapping per group, not per player)
 *
 * Example:
 * - Metarr sees: /mnt/media/movies
 * - Kodi Group 1 sees: /movies (all instances)
 * - Jellyfin Group 1 sees: /data/movies (single server)
 */

export async function up(db: DatabaseConnection): Promise<void> {
  await db.execute(`
    CREATE TABLE media_player_group_path_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      metarr_path TEXT NOT NULL,
      player_path TEXT NOT NULL,
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (group_id) REFERENCES media_player_groups(id) ON DELETE CASCADE
    )
  `);

  // Index for group lookups (common query pattern)
  await db.execute(`
    CREATE INDEX idx_group_path_mappings_group
    ON media_player_group_path_mappings(group_id)
  `);

  // Index for path translation queries (metarr_path → player_path)
  await db.execute(`
    CREATE INDEX idx_group_path_mappings_metarr_path
    ON media_player_group_path_mappings(metarr_path)
  `);

  // Unique constraint: One mapping per group+metarr_path combination
  await db.execute(`
    CREATE UNIQUE INDEX idx_group_path_mappings_unique
    ON media_player_group_path_mappings(group_id, metarr_path)
  `);
}

export async function down(db: DatabaseConnection): Promise<void> {
  await db.execute('DROP TABLE media_player_group_path_mappings');
}
