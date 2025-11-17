import { DatabaseConnection } from '../types/database.js';
import { logger } from '../middleware/logging.js';

/**
 * Automation Config Service
 *
 * Manages library-level automation configuration:
 * - Mode: manual, yolo, hybrid
 * - Auto-select settings per asset type
 * - Completeness requirements
 */

export interface AutomationConfig {
  libraryId: number;
  mode: 'manual' | 'yolo' | 'hybrid';
  autoDiscoverAssets: boolean;
  autoFetchProviderAssets: boolean;
  autoEnrichMetadata: boolean;
  autoSelectAssets: boolean;
  autoPublish: boolean;
}

export interface AssetSelectionConfig {
  libraryId: number;
  assetType: string;
  enabled: boolean;
  minResolution?: number; // Minimum resolution (e.g., 1920 for 1080p posters)
  minVoteAverage?: number; // Minimum TMDB vote average (0-10)
  preferredLanguage?: string; // ISO 639-1 code (e.g., 'en')
}

export interface CompletenessConfig {
  libraryId: number;
  fieldName: string;
  isRequired: boolean;
  weight: number; // 1-10, higher = more important
}

export class AutomationConfigService {
  constructor(private readonly db: DatabaseConnection) {}

  /**
   * Get automation config for library
   */
  async getAutomationConfig(libraryId: number): Promise<AutomationConfig | null> {
    const result = await this.db.query<AutomationConfig>(
      `SELECT * FROM library_automation_config WHERE library_id = ?`,
      [libraryId]
    );

    return result.length > 0 ? result[0] : null;
  }

  /**
   * Create or update automation config for library
   */
  async setAutomationConfig(config: AutomationConfig): Promise<void> {
    const existing = await this.getAutomationConfig(config.libraryId);

    if (existing) {
      // Update
      await this.db.execute(
        `UPDATE library_automation_config
         SET mode = ?,
             auto_discover_assets = ?,
             auto_fetch_provider_assets = ?,
             auto_enrich_metadata = ?,
             auto_select_assets = ?,
             auto_publish = ?
         WHERE library_id = ?`,
        [
          config.mode,
          config.autoDiscoverAssets ? 1 : 0,
          config.autoFetchProviderAssets ? 1 : 0,
          config.autoEnrichMetadata ? 1 : 0,
          config.autoSelectAssets ? 1 : 0,
          config.autoPublish ? 1 : 0,
          config.libraryId
        ]
      );
    } else {
      // Insert
      await this.db.execute(
        `INSERT INTO library_automation_config (
          library_id, mode, auto_discover_assets, auto_fetch_provider_assets,
          auto_enrich_metadata, auto_select_assets, auto_publish
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          config.libraryId,
          config.mode,
          config.autoDiscoverAssets ? 1 : 0,
          config.autoFetchProviderAssets ? 1 : 0,
          config.autoEnrichMetadata ? 1 : 0,
          config.autoSelectAssets ? 1 : 0,
          config.autoPublish ? 1 : 0
        ]
      );
    }

    logger.info(`Automation config updated for library ${config.libraryId}: ${config.mode}`);
  }

  /**
   * Get asset selection config for library
   */
  async getAssetSelectionConfig(libraryId: number): Promise<AssetSelectionConfig[]> {
    const result = await this.db.query<AssetSelectionConfig>(
      `SELECT * FROM asset_selection_config WHERE library_id = ? ORDER BY asset_type`,
      [libraryId]
    );

    return result;
  }

  /**
   * Set asset selection config
   */
  async setAssetSelectionConfig(config: AssetSelectionConfig): Promise<void> {
    const existing = await this.db.query(
      `SELECT * FROM asset_selection_config WHERE library_id = ? AND asset_type = ?`,
      [config.libraryId, config.assetType]
    );

    if (existing.length > 0) {
      // Update
      await this.db.execute(
        `UPDATE asset_selection_config
         SET enabled = ?,
             min_resolution = ?,
             min_vote_average = ?,
             preferred_language = ?
         WHERE library_id = ? AND asset_type = ?`,
        [
          config.enabled ? 1 : 0,
          config.minResolution,
          config.minVoteAverage,
          config.preferredLanguage,
          config.libraryId,
          config.assetType
        ]
      );
    } else {
      // Insert
      await this.db.execute(
        `INSERT INTO asset_selection_config (
          library_id, asset_type, enabled, min_resolution, min_vote_average, preferred_language
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          config.libraryId,
          config.assetType,
          config.enabled ? 1 : 0,
          config.minResolution,
          config.minVoteAverage,
          config.preferredLanguage
        ]
      );
    }

    logger.info(`Asset selection config updated for library ${config.libraryId}, asset ${config.assetType}`);
  }

  /**
   * Get completeness config for library
   */
  async getCompletenessConfig(libraryId: number): Promise<CompletenessConfig[]> {
    const result = await this.db.query<CompletenessConfig>(
      `SELECT * FROM completeness_config WHERE library_id = ? ORDER BY weight DESC, field_name`,
      [libraryId]
    );

    return result;
  }

  /**
   * Set completeness config
   */
  async setCompletenessConfig(config: CompletenessConfig): Promise<void> {
    const existing = await this.db.query(
      `SELECT * FROM completeness_config WHERE library_id = ? AND field_name = ?`,
      [config.libraryId, config.fieldName]
    );

    if (existing.length > 0) {
      // Update
      await this.db.execute(
        `UPDATE completeness_config
         SET is_required = ?,
             weight = ?
         WHERE library_id = ? AND field_name = ?`,
        [
          config.isRequired ? 1 : 0,
          config.weight,
          config.libraryId,
          config.fieldName
        ]
      );
    } else {
      // Insert
      await this.db.execute(
        `INSERT INTO completeness_config (
          library_id, field_name, is_required, weight
        ) VALUES (?, ?, ?, ?)`,
        [
          config.libraryId,
          config.fieldName,
          config.isRequired ? 1 : 0,
          config.weight
        ]
      );
    }

    logger.info(`Completeness config updated for library ${config.libraryId}, field ${config.fieldName}`);
  }

  /**
   * Delete automation config for library
   */
  async deleteAutomationConfig(libraryId: number): Promise<void> {
    await this.db.execute(
      `DELETE FROM library_automation_config WHERE library_id = ?`,
      [libraryId]
    );

    logger.info(`Automation config deleted for library ${libraryId}`);
  }

  /**
   * Delete asset selection config
   */
  async deleteAssetSelectionConfig(libraryId: number, assetType?: string): Promise<void> {
    if (assetType) {
      await this.db.execute(
        `DELETE FROM asset_selection_config WHERE library_id = ? AND asset_type = ?`,
        [libraryId, assetType]
      );
    } else {
      await this.db.execute(
        `DELETE FROM asset_selection_config WHERE library_id = ?`,
        [libraryId]
      );
    }

    logger.info(`Asset selection config deleted for library ${libraryId}`);
  }

  /**
   * Delete completeness config
   */
  async deleteCompletenessConfig(libraryId: number, fieldName?: string): Promise<void> {
    if (fieldName) {
      await this.db.execute(
        `DELETE FROM completeness_config WHERE library_id = ? AND field_name = ?`,
        [libraryId, fieldName]
      );
    } else {
      await this.db.execute(
        `DELETE FROM completeness_config WHERE library_id = ?`,
        [libraryId]
      );
    }

    logger.info(`Completeness config deleted for library ${libraryId}`);
  }

  /**
   * Get default automation config for new libraries
   */
  getDefaultAutomationConfig(libraryId: number): AutomationConfig {
    return {
      libraryId,
      mode: 'manual',
      autoDiscoverAssets: true,
      autoFetchProviderAssets: true,
      autoEnrichMetadata: true,
      autoSelectAssets: false,
      autoPublish: false
    };
  }

  /**
   * Initialize default configs for library
   */
  async initializeLibraryDefaults(libraryId: number): Promise<void> {
    // Set default automation config
    const automationConfig = this.getDefaultAutomationConfig(libraryId);
    await this.setAutomationConfig(automationConfig);

    // Set default asset selection configs
    const assetTypes = ['poster', 'fanart', 'banner', 'clearlogo', 'trailer'];
    for (const assetType of assetTypes) {
      await this.setAssetSelectionConfig({
        libraryId,
        assetType,
        enabled: true,
        minResolution: assetType === 'poster' ? 1000 : 1920,
        minVoteAverage: 5.0,
        preferredLanguage: 'en'
      });
    }

    // Set default completeness configs (what fields are important)
    const fields = [
      { fieldName: 'title', isRequired: true, weight: 10 },
      { fieldName: 'plot', isRequired: false, weight: 8 },
      { fieldName: 'poster', isRequired: false, weight: 7 },
      { fieldName: 'fanart', isRequired: false, weight: 6 },
      { fieldName: 'rating', isRequired: false, weight: 5 },
      { fieldName: 'year', isRequired: false, weight: 5 },
      { fieldName: 'runtime', isRequired: false, weight: 3 }
    ];

    for (const field of fields) {
      await this.setCompletenessConfig({
        libraryId,
        ...field
      });
    }

    logger.info(`Initialized default configs for library ${libraryId}`);
  }
}
