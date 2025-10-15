import { DatabaseConnection } from '../../types/database.js';

/**
 * Migration: Create media_player_libraries table
 *
 * Links media player GROUPS to libraries, defining which groups manage which libraries.
 * This enables group-aware scanning: when a library updates, only scan the groups
 * that manage that library (not all groups).
 *
 * Example:
 *   Group 1 (Living Room Kodi) manages Library 1 (/mnt/movies)
 *   Group 2 (Kids Room Kodi) manages Library 2 (/mnt/tvshows)
 *
 *   When movie downloads:
 *     - Library 1 updated
 *     - Scan Group 1 only (with path /movies after mapping)
 *     - Don't scan Group 2 (irrelevant)
 */

export async function up(db: DatabaseConnection): Promise<void> {
  // Create media_player_libraries junction table
  await db.execute(`
    CREATE TABLE media_player_libraries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      library_id INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (group_id) REFERENCES media_player_groups(id) ON DELETE CASCADE,
      FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE,
      UNIQUE(group_id, library_id)
    )
  `);

  // Create indexes for efficient lookups
  await db.execute('CREATE INDEX idx_media_player_libraries_group ON media_player_libraries(group_id)');
  await db.execute('CREATE INDEX idx_media_player_libraries_library ON media_player_libraries(library_id)');
}

export async function down(db: DatabaseConnection): Promise<void> {
  await db.execute('DROP TABLE IF EXISTS media_player_libraries');
}
