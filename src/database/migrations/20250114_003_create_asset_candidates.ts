import { DatabaseConnection } from '../../types/database.js';

/**
 * Migration: Create asset_candidates and provider_refresh_log tables
 *
 * Implements asset candidate caching system:
 * - Cache asset URLs and metadata from providers
 * - Store scores for automatic selection
 * - Support blocking assets (blacklist)
 * - Track provider refresh timestamps
 *
 * This allows instant browsing of asset candidates without API calls.
 * The updateAssets scheduled job keeps candidates fresh.
 */

export class CreateAssetCandidatesMigration {
  static version = '20250114_003';
  static migrationName = 'create_asset_candidates';

  /**
   * Run the migration
   */
  static async up(db: DatabaseConnection): Promise<void> {
    console.log('🚀 Creating asset_candidates table...');

    // ============================================================
    // ASSET CANDIDATES TABLE
    // ============================================================

    await db.execute(`
      CREATE TABLE asset_candidates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL,
        entity_id INTEGER NOT NULL,
        asset_type TEXT NOT NULL,
        provider TEXT NOT NULL,
        url TEXT NOT NULL,
        width INTEGER,
        height INTEGER,
        language TEXT,
        vote_average REAL,
        vote_count INTEGER,
        score REAL NOT NULL DEFAULT 0,
        is_selected BOOLEAN DEFAULT 0,
        is_blocked BOOLEAN DEFAULT 0,
        selected_at TIMESTAMP,
        selected_by TEXT,
        blocked_at TIMESTAMP,
        blocked_by TEXT,
        last_refreshed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(entity_type, entity_id, asset_type, url)
      )
    `);
    console.log('✅ Created asset_candidates table');

    // Create indexes for fast querying
    await db.execute(`
      CREATE INDEX idx_asset_candidates_entity
      ON asset_candidates(entity_type, entity_id, asset_type)
    `);
    console.log('✅ Created index: idx_asset_candidates_entity');

    await db.execute(`
      CREATE INDEX idx_asset_candidates_selected
      ON asset_candidates(entity_type, entity_id, asset_type, is_selected)
    `);
    console.log('✅ Created index: idx_asset_candidates_selected');

    await db.execute(`
      CREATE INDEX idx_asset_candidates_blocked
      ON asset_candidates(is_blocked)
      WHERE is_blocked = 1
    `);
    console.log('✅ Created index: idx_asset_candidates_blocked');

    await db.execute(`
      CREATE INDEX idx_asset_candidates_score
      ON asset_candidates(entity_type, entity_id, asset_type, score DESC)
    `);
    console.log('✅ Created index: idx_asset_candidates_score');

    await db.execute(`
      CREATE INDEX idx_asset_candidates_refresh
      ON asset_candidates(last_refreshed)
    `);
    console.log('✅ Created index: idx_asset_candidates_refresh');

    // ============================================================
    // PROVIDER REFRESH LOG TABLE
    // ============================================================

    console.log('🚀 Creating provider_refresh_log table...');

    await db.execute(`
      CREATE TABLE provider_refresh_log (
        entity_type TEXT NOT NULL,
        entity_id INTEGER NOT NULL,
        provider TEXT NOT NULL,
        last_checked TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_modified TIMESTAMP,
        tmdb_change_key TEXT,
        needs_refresh BOOLEAN DEFAULT 0,
        PRIMARY KEY (entity_type, entity_id, provider)
      )
    `);
    console.log('✅ Created provider_refresh_log table');

    // Create indexes for refresh log
    await db.execute(`
      CREATE INDEX idx_refresh_log_needs_refresh
      ON provider_refresh_log(needs_refresh)
      WHERE needs_refresh = 1
    `);
    console.log('✅ Created index: idx_refresh_log_needs_refresh');

    await db.execute(`
      CREATE INDEX idx_refresh_log_checked
      ON provider_refresh_log(last_checked)
    `);
    console.log('✅ Created index: idx_refresh_log_checked');

    console.log('✅ Asset candidates migration complete');
  }

  /**
   * Reverse the migration
   */
  static async down(db: DatabaseConnection): Promise<void> {
    console.log('⚠️  Rolling back asset_candidates migration...');

    // Drop tables (reverse order of creation)
    await db.execute('DROP TABLE IF EXISTS provider_refresh_log');
    console.log('✅ Dropped provider_refresh_log table');

    await db.execute('DROP TABLE IF EXISTS asset_candidates');
    console.log('✅ Dropped asset_candidates table');

    console.log('✅ Rollback complete');
  }
}
