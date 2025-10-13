import { DatabaseConnection } from '../types/database.js';
import { logger } from '../middleware/logging.js';

/**
 * Library Scheduler Config Service
 *
 * Manages scheduler configuration for two background services per library:
 * 1. File Scanner - Detects filesystem changes (new/moved/deleted files by *arr)
 * 2. Provider Updater - Fetches updated metadata + assets in one API call
 */

export interface LibrarySchedulerConfig {
  libraryId: number;

  // File Scanner configuration
  fileScannerEnabled: boolean;
  fileScannerIntervalHours: number;
  fileScannerLastRun: Date | null;

  // Provider Updater configuration (metadata + assets combined)
  providerUpdaterEnabled: boolean;
  providerUpdaterIntervalHours: number;
  providerUpdaterLastRun: Date | null;
}

export class LibrarySchedulerConfigService {
  private db: DatabaseConnection;

  constructor(db: DatabaseConnection) {
    this.db = db;
  }

  /**
   * Get scheduler config for library
   */
  async getSchedulerConfig(libraryId: number): Promise<LibrarySchedulerConfig | null> {
    const result = await this.db.query<{
      library_id: number;
      file_scanner_enabled: number;
      file_scanner_interval_hours: number;
      file_scanner_last_run: string | null;
      provider_updater_enabled: number;
      provider_updater_interval_hours: number;
      provider_updater_last_run: string | null;
    }>(
      `SELECT * FROM library_scheduler_config WHERE library_id = ?`,
      [libraryId]
    );

    if (result.length === 0) {
      return null;
    }

    const row = result[0];
    return {
      libraryId: row.library_id,
      fileScannerEnabled: row.file_scanner_enabled === 1,
      fileScannerIntervalHours: row.file_scanner_interval_hours,
      fileScannerLastRun: row.file_scanner_last_run ? new Date(row.file_scanner_last_run) : null,
      providerUpdaterEnabled: row.provider_updater_enabled === 1,
      providerUpdaterIntervalHours: row.provider_updater_interval_hours,
      providerUpdaterLastRun: row.provider_updater_last_run ? new Date(row.provider_updater_last_run) : null,
    };
  }

  /**
   * Create or update scheduler config for library
   */
  async setSchedulerConfig(config: LibrarySchedulerConfig): Promise<void> {
    const existing = await this.getSchedulerConfig(config.libraryId);

    if (existing) {
      // Update
      await this.db.execute(
        `UPDATE library_scheduler_config
         SET file_scanner_enabled = ?,
             file_scanner_interval_hours = ?,
             provider_updater_enabled = ?,
             provider_updater_interval_hours = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE library_id = ?`,
        [
          config.fileScannerEnabled ? 1 : 0,
          config.fileScannerIntervalHours,
          config.providerUpdaterEnabled ? 1 : 0,
          config.providerUpdaterIntervalHours,
          config.libraryId
        ]
      );
    } else {
      // Insert
      await this.db.execute(
        `INSERT INTO library_scheduler_config (
          library_id, file_scanner_enabled, file_scanner_interval_hours,
          provider_updater_enabled, provider_updater_interval_hours
        ) VALUES (?, ?, ?, ?, ?)`,
        [
          config.libraryId,
          config.fileScannerEnabled ? 1 : 0,
          config.fileScannerIntervalHours,
          config.providerUpdaterEnabled ? 1 : 0,
          config.providerUpdaterIntervalHours
        ]
      );
    }

    logger.info(`Scheduler config updated for library ${config.libraryId}`, {
      fileScannerEnabled: config.fileScannerEnabled,
      fileScannerIntervalHours: config.fileScannerIntervalHours,
      providerUpdaterEnabled: config.providerUpdaterEnabled,
      providerUpdaterIntervalHours: config.providerUpdaterIntervalHours
    });
  }

  /**
   * Update last run timestamp for file scanner
   */
  async updateFileScannerLastRun(libraryId: number): Promise<void> {
    await this.db.execute(
      `UPDATE library_scheduler_config
       SET file_scanner_last_run = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE library_id = ?`,
      [libraryId]
    );
  }

  /**
   * Update last run timestamp for provider updater
   */
  async updateProviderUpdaterLastRun(libraryId: number): Promise<void> {
    await this.db.execute(
      `UPDATE library_scheduler_config
       SET provider_updater_last_run = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE library_id = ?`,
      [libraryId]
    );
  }

  /**
   * Get all libraries that need file scanning
   */
  async getLibrariesNeedingFileScan(): Promise<number[]> {
    const result = await this.db.query<{ library_id: number }>(
      `SELECT library_id
       FROM library_scheduler_config
       WHERE file_scanner_enabled = 1
         AND (
           file_scanner_last_run IS NULL
           OR datetime(file_scanner_last_run, '+' || file_scanner_interval_hours || ' hours') <= datetime('now')
         )`,
      []
    );

    return result.map(r => r.library_id);
  }

  /**
   * Get all libraries that need provider updates (metadata + assets)
   */
  async getLibrariesNeedingProviderUpdate(): Promise<number[]> {
    const result = await this.db.query<{ library_id: number }>(
      `SELECT library_id
       FROM library_scheduler_config
       WHERE provider_updater_enabled = 1
         AND (
           provider_updater_last_run IS NULL
           OR datetime(provider_updater_last_run, '+' || provider_updater_interval_hours || ' hours') <= datetime('now')
         )`,
      []
    );

    return result.map(r => r.library_id);
  }

  /**
   * Delete scheduler config for library
   */
  async deleteSchedulerConfig(libraryId: number): Promise<void> {
    await this.db.execute(
      `DELETE FROM library_scheduler_config WHERE library_id = ?`,
      [libraryId]
    );

    logger.info(`Scheduler config deleted for library ${libraryId}`);
  }

  /**
   * Get default scheduler config for new libraries
   */
  getDefaultSchedulerConfig(libraryId: number): LibrarySchedulerConfig {
    return {
      libraryId,
      fileScannerEnabled: false, // Disabled by default
      fileScannerIntervalHours: 4, // Every 4 hours
      fileScannerLastRun: null,
      providerUpdaterEnabled: false, // Disabled by default
      providerUpdaterIntervalHours: 168, // Weekly
      providerUpdaterLastRun: null,
    };
  }

  /**
   * Initialize default scheduler config for library
   */
  async initializeLibraryDefaults(libraryId: number): Promise<void> {
    const config = this.getDefaultSchedulerConfig(libraryId);
    await this.setSchedulerConfig(config);

    logger.info(`Initialized default scheduler config for library ${libraryId}`);
  }
}
