import { DatabaseConnection } from '../../types/database.js';

/**
 * Migration: Add last_scraped_at column for TMDB changes API optimization
 *
 * This column tracks when we last fetched metadata from TMDB, allowing us to use
 * the TMDB changes API to check if data has changed before re-scraping.
 *
 * Difference from enriched_at:
 * - enriched_at: When the entire enrichment process completed (metadata + assets)
 * - last_scraped_at: When we last called the TMDB API specifically
 */
export class AddLastScrapedAtMigration {
  static version = '20251011_001';
  static migrationName = 'add_last_scraped_at';

  static async up(db: DatabaseConnection): Promise<void> {
    console.log('🚀 Adding last_scraped_at columns for TMDB changes API optimization...');

    // Add last_scraped_at to movies
    await db.execute(`
      ALTER TABLE movies ADD COLUMN last_scraped_at TIMESTAMP
    `);

    // Add last_scraped_at to series
    await db.execute(`
      ALTER TABLE series ADD COLUMN last_scraped_at TIMESTAMP
    `);

    // Add last_scraped_at to episodes
    await db.execute(`
      ALTER TABLE episodes ADD COLUMN last_scraped_at TIMESTAMP
    `);

    // Create index for efficient querying of stale data
    await db.execute(`
      CREATE INDEX idx_movies_last_scraped
      ON movies(last_scraped_at)
      WHERE last_scraped_at IS NOT NULL
    `);

    await db.execute(`
      CREATE INDEX idx_series_last_scraped
      ON series(last_scraped_at)
      WHERE last_scraped_at IS NOT NULL
    `);

    await db.execute(`
      CREATE INDEX idx_episodes_last_scraped
      ON episodes(last_scraped_at)
      WHERE last_scraped_at IS NOT NULL
    `);

    console.log('✅ last_scraped_at columns added successfully');
  }

  static async down(db: DatabaseConnection): Promise<void> {
    console.log('🔄 Rolling back last_scraped_at columns...');

    // Drop indexes first
    await db.execute('DROP INDEX IF EXISTS idx_movies_last_scraped');
    await db.execute('DROP INDEX IF EXISTS idx_series_last_scraped');
    await db.execute('DROP INDEX IF EXISTS idx_episodes_last_scraped');

    // SQLite doesn't support DROP COLUMN directly, so we'd need to recreate tables
    // For now, we'll leave the columns in place during rollback
    console.log('⚠️  Note: SQLite does not support DROP COLUMN. Columns remain but are unused.');
  }
}
