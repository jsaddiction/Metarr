import { MigrationInterface } from '../../types/database.js';
import { logger } from '../../middleware/logging.js';

/**
 * Migration: Create job_history table
 *
 * Separates completed/failed jobs from active queue for:
 * - Clean, fast active queue queries
 * - Historical auditing and debugging
 * - Retention policy management
 *
 * Related: Job Queue Architecture refactor
 */
export const migration: MigrationInterface = {
  up: async (db) => {
    logger.info('Running migration: Create job_history table');

    // Create job_history table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS job_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        priority INTEGER NOT NULL,
        payload TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('completed', 'failed')),
        error TEXT,
        retry_count INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL,
        started_at DATETIME NOT NULL,
        completed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        duration_ms INTEGER
      )
    `);

    logger.info('Created table: job_history');

    // Index for history queries (by type and date)
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_job_history_type_date
        ON job_history(type, completed_at DESC)
    `);

    logger.info('Created index: idx_job_history_type_date');

    // Index for cleanup queries (old completed/failed jobs)
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_job_history_cleanup
        ON job_history(status, completed_at)
    `);

    logger.info('Created index: idx_job_history_cleanup');

    // Add updated_at column to job_queue if not exists
    const columns = await db.query(`PRAGMA table_info(job_queue)`);
    const hasUpdatedAt = columns.some((col: any) => col.name === 'updated_at');

    if (!hasUpdatedAt) {
      await db.execute(`
        ALTER TABLE job_queue
        ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      `);
      logger.info('Added updated_at column to job_queue');
    }

    // Add index for picking jobs (pending only, by priority)
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_job_queue_pickup
        ON job_queue(status, priority ASC, created_at ASC)
        WHERE status = 'pending'
    `);

    logger.info('Created index: idx_job_queue_pickup');

    // Add index for crash recovery (find processing jobs)
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_job_queue_processing
        ON job_queue(status)
        WHERE status = 'processing'
    `);

    logger.info('Created index: idx_job_queue_processing');

    logger.info('Migration complete: Create job_history table');
  },

  down: async (db) => {
    logger.info('Rolling back migration: Create job_history table');

    // Drop indexes
    await db.execute('DROP INDEX IF EXISTS idx_job_history_type_date');
    await db.execute('DROP INDEX IF EXISTS idx_job_history_cleanup');
    await db.execute('DROP INDEX IF EXISTS idx_job_queue_pickup');
    await db.execute('DROP INDEX IF EXISTS idx_job_queue_processing');

    // Drop table
    await db.execute('DROP TABLE IF EXISTS job_history');

    // Note: We don't remove updated_at column from job_queue (risky with SQLite)

    logger.info('Migration rollback complete: Create job_history table');
  },
};
