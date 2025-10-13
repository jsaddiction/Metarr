import { DatabaseConnection } from '../../types/database.js';

/**
 * Migration: Add library scheduler configuration table
 *
 * Adds configuration for two scheduled background services:
 * 1. File Scanner - Detects filesystem changes (new/moved/deleted files by *arr)
 * 2. Provider Updater - Fetches updated metadata + assets from providers in one call
 */

export class LibrarySchedulerConfigMigration {
  static version = '20251015_002';
  static migrationName = 'library_scheduler_config';

  /**
   * Run the migration
   */
  static async up(db: DatabaseConnection): Promise<void> {
    // Create library_scheduler_config table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS library_scheduler_config (
        library_id INTEGER PRIMARY KEY,

        -- File Scanner configuration
        file_scanner_enabled BOOLEAN NOT NULL DEFAULT 0,
        file_scanner_interval_hours INTEGER NOT NULL DEFAULT 4,
        file_scanner_last_run TIMESTAMP NULL,

        -- Provider Updater configuration (metadata + assets in one call)
        provider_updater_enabled BOOLEAN NOT NULL DEFAULT 0,
        provider_updater_interval_hours INTEGER NOT NULL DEFAULT 168, -- Weekly by default
        provider_updater_last_run TIMESTAMP NULL,

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE
      )
    `);

    console.log('✅ Created library_scheduler_config table');
  }

  /**
   * Reverse the migration
   */
  static async down(db: DatabaseConnection): Promise<void> {
    await db.execute('DROP TABLE IF EXISTS library_scheduler_config');
    console.log('✅ Dropped library_scheduler_config table');
  }
}
