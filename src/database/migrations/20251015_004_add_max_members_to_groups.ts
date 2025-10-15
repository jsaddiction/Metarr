import { DatabaseConnection } from '../DatabaseConnection.js';

/**
 * Migration: Add max_members column to media_player_groups
 *
 * Purpose: Enforce group membership constraints
 * - NULL = unlimited members (Kodi groups with shared database)
 * - 1 = single member only (Jellyfin/Plex servers)
 *
 * This enables universal group architecture where ALL players belong to groups.
 */

export async function up(db: DatabaseConnection): Promise<void> {
  await db.execute(`
    ALTER TABLE media_player_groups
    ADD COLUMN max_members INTEGER NULL
  `);

  // Add index for validation queries
  await db.execute(`
    CREATE INDEX idx_media_player_groups_max_members
    ON media_player_groups(max_members)
  `);
}

export async function down(db: DatabaseConnection): Promise<void> {
  // SQLite doesn't support DROP COLUMN directly, need to recreate table
  await db.execute(`
    CREATE TABLE media_player_groups_backup (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL,
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.execute(`
    INSERT INTO media_player_groups_backup (id, name, type, description, created_at, updated_at)
    SELECT id, name, type, description, created_at, updated_at
    FROM media_player_groups
  `);

  await db.execute('DROP TABLE media_player_groups');
  await db.execute('ALTER TABLE media_player_groups_backup RENAME TO media_player_groups');

  // Recreate original indexes
  await db.execute('CREATE INDEX idx_media_player_groups_type ON media_player_groups(type)');
  await db.execute('CREATE UNIQUE INDEX idx_media_player_groups_name ON media_player_groups(name)');
}
