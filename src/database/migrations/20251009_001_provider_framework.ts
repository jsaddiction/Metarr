/**
 * Migration: Provider Framework Enhancements
 *
 * Adds enhanced provider configuration and asset selection presets.
 * Extends existing provider_configs table with new fields for the modular provider system.
 */

import { DatabaseConnection } from '../../types/database.js';

export class Migration_20251009_001_ProviderFramework {
  static async up(db: DatabaseConnection): Promise<void> {
    console.log('Running migration: 20251009_001_provider_framework');

    // ========================================
    // 1. EXTEND PROVIDER_CONFIGS TABLE
    // ========================================

    // Add new columns to existing provider_configs table
    await db.execute(`
      ALTER TABLE provider_configs ADD COLUMN personal_api_key TEXT
    `);

    await db.execute(`
      ALTER TABLE provider_configs ADD COLUMN token TEXT
    `);

    await db.execute(`
      ALTER TABLE provider_configs ADD COLUMN token_expires_at DATETIME
    `);

    await db.execute(`
      ALTER TABLE provider_configs ADD COLUMN language VARCHAR(10) DEFAULT 'en'
    `);

    await db.execute(`
      ALTER TABLE provider_configs ADD COLUMN region VARCHAR(10) DEFAULT 'US'
    `);

    await db.execute(`
      ALTER TABLE provider_configs ADD COLUMN options TEXT DEFAULT '{}'
    `);

    await db.execute(`
      ALTER TABLE provider_configs ADD COLUMN priority INTEGER DEFAULT 50
    `);

    await db.execute(`
      ALTER TABLE provider_configs ADD COLUMN use_for_metadata BOOLEAN DEFAULT 1
    `);

    await db.execute(`
      ALTER TABLE provider_configs ADD COLUMN use_for_images BOOLEAN DEFAULT 1
    `);

    await db.execute(`
      ALTER TABLE provider_configs ADD COLUMN use_for_search BOOLEAN DEFAULT 1
    `);

    await db.execute(`
      ALTER TABLE provider_configs ADD COLUMN consecutive_failures INTEGER DEFAULT 0
    `);

    await db.execute(`
      ALTER TABLE provider_configs ADD COLUMN circuit_breaker_until DATETIME
    `);

    await db.execute(`
      ALTER TABLE provider_configs ADD COLUMN total_requests INTEGER DEFAULT 0
    `);

    await db.execute(`
      ALTER TABLE provider_configs ADD COLUMN failed_requests INTEGER DEFAULT 0
    `);

    await db.execute(`
      ALTER TABLE provider_configs ADD COLUMN avg_response_time_ms INTEGER
    `);

    await db.execute(`
      ALTER TABLE provider_configs ADD COLUMN last_request_at DATETIME
    `);

    // Add indexes for new columns
    await db.execute(`
      CREATE INDEX idx_provider_priority ON provider_configs(priority DESC)
    `);

    await db.execute(`
      CREATE INDEX idx_provider_usage ON provider_configs(enabled, use_for_metadata, use_for_images)
    `);

    // ========================================
    // 2. ASSET SELECTION PRESETS TABLE
    // ========================================

    await db.execute(`
      CREATE TABLE asset_selection_presets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name VARCHAR(50) NOT NULL UNIQUE,
        description TEXT,
        is_default BOOLEAN DEFAULT 0,

        -- Asset counts (JSON: { "poster": 1, "fanart": 3, "clearlogo": 1 })
        asset_counts TEXT NOT NULL DEFAULT '{}',

        -- Provider priority (JSON array: ["fanart_tv", "tmdb", "tvdb"])
        provider_priority TEXT,

        -- Quality filters
        min_poster_width INTEGER DEFAULT 1000,
        min_poster_height INTEGER DEFAULT 1500,
        min_fanart_width INTEGER DEFAULT 1920,
        min_fanart_height INTEGER DEFAULT 1080,

        -- Deduplication
        phash_threshold REAL DEFAULT 0.92,

        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ========================================
    // 3. LIBRARY PROVIDER CONFIGURATION TABLE
    // ========================================

    await db.execute(`
      CREATE TABLE library_provider_config (
        library_id INTEGER PRIMARY KEY,
        preset_id INTEGER NOT NULL,

        -- Orchestration strategy
        strategy VARCHAR(50) DEFAULT 'preferred_first',
        preferred_metadata_provider VARCHAR(50),
        fill_metadata_gaps BOOLEAN DEFAULT 1,

        -- Custom field mapping (JSON, only if strategy = 'field_mapping')
        field_mapping TEXT,

        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE,
        FOREIGN KEY (preset_id) REFERENCES asset_selection_presets(id)
      )
    `);

    // ========================================
    // 4. INSERT DEFAULT PRESETS
    // ========================================

    // Minimal preset
    await db.execute(`
      INSERT INTO asset_selection_presets (
        name,
        description,
        is_default,
        asset_counts,
        provider_priority,
        min_poster_width,
        min_poster_height,
        min_fanart_width,
        min_fanart_height,
        phash_threshold
      ) VALUES (
        'minimal',
        'Essential assets only. Fastest setup, smallest library size.',
        0,
        '{"poster": 1, "fanart": 2}',
        '["tmdb"]',
        1000,
        1500,
        1920,
        1080,
        0.92
      )
    `);

    // Recommended preset (default)
    await db.execute(`
      INSERT INTO asset_selection_presets (
        name,
        description,
        is_default,
        asset_counts,
        provider_priority,
        min_poster_width,
        min_poster_height,
        min_fanart_width,
        min_fanart_height,
        phash_threshold
      ) VALUES (
        'recommended',
        'Balanced visual experience. Recommended for most users.',
        1,
        '{"poster": 1, "fanart": 3, "clearlogo": 1}',
        '["fanart_tv", "tmdb"]',
        1500,
        2250,
        1920,
        1080,
        0.92
      )
    `);

    // Maximum preset
    await db.execute(`
      INSERT INTO asset_selection_presets (
        name,
        description,
        is_default,
        asset_counts,
        provider_priority,
        min_poster_width,
        min_poster_height,
        min_fanart_width,
        min_fanart_height,
        phash_threshold
      ) VALUES (
        'maximum',
        'All available artwork. Best for large screens and advanced skins.',
        0,
        '{"poster": 3, "fanart": 10, "clearlogo": 1, "clearart": 1, "banner": 1, "discart": 1, "landscape": 1}',
        '["fanart_tv", "tmdb", "tvdb"]',
        2000,
        3000,
        1920,
        1080,
        0.90
      )
    `);

    console.log('Migration complete: 20251009_001_provider_framework');
  }

  static async down(db: DatabaseConnection): Promise<void> {
    console.log('Reverting migration: 20251009_001_provider_framework');

    // Drop new tables
    await db.execute('DROP TABLE IF EXISTS library_provider_config');
    await db.execute('DROP TABLE IF EXISTS asset_selection_presets');

    // Drop indexes
    await db.execute('DROP INDEX IF EXISTS idx_provider_priority');
    await db.execute('DROP INDEX IF EXISTS idx_provider_usage');

    // Note: Cannot drop columns in SQLite, would need to recreate table
    // For development, this is acceptable (can delete and recreate database)
    // For production, would need a more complex migration

    console.log('Migration reverted: 20251009_001_provider_framework');
  }
}
