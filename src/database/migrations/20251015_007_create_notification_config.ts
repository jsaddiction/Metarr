import { MigrationInterface } from '../../types/database.js';
import { logger } from '../../middleware/logging.js';

/**
 * Migration: Create notification_config table
 *
 * Stores notification service configuration and enabled state.
 * Fan-out job handlers check this table to determine which notifications to send.
 */
export const migration: MigrationInterface = {
  up: async (db) => {
    logger.info('[Migration] Creating notification_config table', {
      service: 'Migration',
      migration: '20251015_007_create_notification_config',
    });

    // Create notification_config table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS notification_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        service TEXT NOT NULL UNIQUE CHECK (service IN (
          'kodi',
          'jellyfin',
          'plex',
          'discord',
          'pushover',
          'email'
        )),
        enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
        config TEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    logger.info('[Migration] Created table: notification_config');

    // Index for quick lookups by service
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_notification_config_service
        ON notification_config(service)
    `);

    logger.info('[Migration] Created index: idx_notification_config_service');

    // Index for enabled services (most common query)
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_notification_config_enabled
        ON notification_config(enabled) WHERE enabled = 1
    `);

    logger.info('[Migration] Created index: idx_notification_config_enabled');

    // Insert default configurations (all disabled initially)
    await db.execute(`
      INSERT OR IGNORE INTO notification_config (service, enabled, config) VALUES
        ('kodi', 0, '{}'),
        ('jellyfin', 0, '{}'),
        ('plex', 0, '{}'),
        ('discord', 0, '{}'),
        ('pushover', 0, '{}'),
        ('email', 0, '{}')
    `);

    logger.info('[Migration] Inserted default notification configs');
    logger.info('[Migration] notification_config table complete', {
      service: 'Migration',
      migration: '20251015_007_create_notification_config',
    });
  },

  down: async (db) => {
    logger.info('[Migration] Dropping notification_config table', {
      service: 'Migration',
      migration: '20251015_007_create_notification_config',
    });

    await db.execute('DROP INDEX IF EXISTS idx_notification_config_enabled');
    await db.execute('DROP INDEX IF EXISTS idx_notification_config_service');
    await db.execute('DROP TABLE IF EXISTS notification_config');

    logger.info('[Migration] notification_config table dropped', {
      service: 'Migration',
      migration: '20251015_007_create_notification_config',
    });
  },
};
