import { DatabaseConnection } from '../../types/database.js';

/**
 * Migration: Add monitored column to media tables
 *
 * Implements monitored/unmonitored system similar to *arr stack:
 * - monitored = 1: Automation enabled, respects field locks
 * - monitored = 0: Automation STOPPED, everything frozen
 *
 * Hierarchy for TV shows: series → seasons → episodes
 * Unmonitoring a season freezes all its episodes
 */

export class AddMonitoredColumnMigration {
  static version = '20250114_001';
  static migrationName = 'add_monitored_column';

  /**
   * Run the migration
   */
  static async up(db: DatabaseConnection): Promise<void> {
    // Add monitored column to movies table
    await db.execute(`
      ALTER TABLE movies
      ADD COLUMN monitored BOOLEAN NOT NULL DEFAULT 1
    `);
    console.log('✅ Added monitored column to movies table');

    // Create index for monitored queries
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_movies_monitored
      ON movies(monitored)
    `);
    console.log('✅ Created index on movies.monitored');

    // Add monitored column to series table (if exists)
    const hasSeriesTable = await db.queryOne(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='series'
    `);

    if (hasSeriesTable) {
      await db.execute(`
        ALTER TABLE series
        ADD COLUMN monitored BOOLEAN NOT NULL DEFAULT 1
      `);
      console.log('✅ Added monitored column to series table');

      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_series_monitored
        ON series(monitored)
      `);
      console.log('✅ Created index on series.monitored');
    }

    // Add monitored column to seasons table (if exists)
    const hasSeasonsTable = await db.queryOne(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='seasons'
    `);

    if (hasSeasonsTable) {
      await db.execute(`
        ALTER TABLE seasons
        ADD COLUMN monitored BOOLEAN NOT NULL DEFAULT 1
      `);
      console.log('✅ Added monitored column to seasons table');

      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_seasons_monitored
        ON seasons(monitored)
      `);
      console.log('✅ Created index on seasons.monitored');
    }

    // Add monitored column to episodes table (if exists)
    const hasEpisodesTable = await db.queryOne(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='episodes'
    `);

    if (hasEpisodesTable) {
      await db.execute(`
        ALTER TABLE episodes
        ADD COLUMN monitored BOOLEAN NOT NULL DEFAULT 1
      `);
      console.log('✅ Added monitored column to episodes table');

      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_episodes_monitored
        ON episodes(monitored)
      `);
      console.log('✅ Created index on episodes.monitored');
    }

    console.log('✅ Monitored column migration complete');
  }

  /**
   * Reverse the migration
   */
  static async down(db: DatabaseConnection): Promise<void> {
    // SQLite doesn't support DROP COLUMN directly
    // We need to recreate tables without the monitored column
    // For now, just log a warning
    console.warn('⚠️  SQLite does not support DROP COLUMN');
    console.warn('⚠️  To fully reverse this migration, you would need to:');
    console.warn('    1. Create new tables without monitored column');
    console.warn('    2. Copy data from old tables');
    console.warn('    3. Drop old tables');
    console.warn('    4. Rename new tables');
    console.warn('⚠️  This is not implemented automatically for safety');
    console.warn('⚠️  If using PostgreSQL, this would be: ALTER TABLE ... DROP COLUMN monitored');

    // Drop indexes (this is safe)
    await db.execute('DROP INDEX IF EXISTS idx_movies_monitored');
    await db.execute('DROP INDEX IF EXISTS idx_series_monitored');
    await db.execute('DROP INDEX IF EXISTS idx_seasons_monitored');
    await db.execute('DROP INDEX IF EXISTS idx_episodes_monitored');
    console.log('✅ Dropped monitored indexes');
  }
}
