/**
 * Asset Configuration Service
 *
 * Manages user-configurable asset limits stored in the database.
 * Falls back to defaults from assetTypeDefaults.ts when not configured.
 */

import { DatabaseManager } from '../database/DatabaseManager.js';
import {
  ASSET_TYPE_DEFAULTS,
  getDefaultMaxCount,
  isValidMaxCount,
  getAllAssetTypes,
} from '../config/assetTypeDefaults.js';
import { logger } from '../middleware/logging.js';

export class AssetConfigService {
  constructor(private dbManager: DatabaseManager) {}

  /**
   * Get the maximum count for a specific asset type
   * Falls back to default if not set in database
   */
  async getAssetLimit(assetType: string): Promise<number> {
    const db = this.dbManager.getConnection();
    const key = `asset_limit_${assetType}`;

    try {
      const result = await db.query(
        'SELECT value FROM app_settings WHERE key = ?',
        [key]
      );

      if (result.length > 0) {
        const value = parseInt(result[0].value, 10);

        // Validate stored value is still within bounds
        if (isValidMaxCount(assetType, value)) {
          return value;
        } else {
          logger.warn('Stored asset limit out of bounds, using default', {
            assetType,
            storedValue: value,
            default: getDefaultMaxCount(assetType),
          });
        }
      }
    } catch (error) {
      logger.error('Failed to get asset limit from database', { assetType, error });
    }

    return getDefaultMaxCount(assetType);
  }

  /**
   * Set the maximum count for a specific asset type
   * Validates against min/max bounds
   */
  async setAssetLimit(assetType: string, limit: number): Promise<void> {
    const config = ASSET_TYPE_DEFAULTS[assetType];
    if (!config) {
      throw new Error(`Unknown asset type: ${assetType}`);
    }

    if (limit < config.minAllowed || limit > config.maxAllowed) {
      throw new Error(
        `Limit must be between ${config.minAllowed} and ${config.maxAllowed} for ${assetType}`
      );
    }

    const db = this.dbManager.getConnection();
    const key = `asset_limit_${assetType}`;

    await db.execute(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP`,
      [key, limit.toString(), limit.toString()]
    );

    logger.info('Asset limit updated', { assetType, limit });
  }

  /**
   * Get all asset type limits as a map
   * Includes both configured and default values
   */
  async getAllAssetLimits(): Promise<Record<string, number>> {
    const limits: Record<string, number> = {};

    for (const assetType of getAllAssetTypes()) {
      limits[assetType] = await this.getAssetLimit(assetType);
    }

    return limits;
  }

  /**
   * Get all asset limits with metadata (for settings UI)
   */
  async getAllAssetLimitsWithMetadata(): Promise<
    Array<{
      assetType: string;
      displayName: string;
      currentLimit: number;
      defaultLimit: number;
      minAllowed: number;
      maxAllowed: number;
      description: string;
      isDefault: boolean;
      mediaTypes: string[];
    }>
  > {
    const db = this.dbManager.getConnection();

    // Get all configured limits from database
    const configuredLimits = await db.query(
      'SELECT key, value FROM app_settings WHERE key LIKE ?',
      ['asset_limit_%']
    );

    const configuredMap = new Map<string, number>();
    for (const row of configuredLimits) {
      const assetType = row.key.replace('asset_limit_', '');
      configuredMap.set(assetType, parseInt(row.value, 10));
    }

    // Build result with metadata
    return getAllAssetTypes().map((assetType) => {
      const config = ASSET_TYPE_DEFAULTS[assetType];
      const currentLimit = configuredMap.get(assetType) ?? config.defaultMax;
      const isDefault = !configuredMap.has(assetType);

      return {
        assetType,
        displayName: config.displayName,
        currentLimit,
        defaultLimit: config.defaultMax,
        minAllowed: config.minAllowed,
        maxAllowed: config.maxAllowed,
        description: config.description,
        isDefault,
        mediaTypes: config.mediaTypes,
      };
    });
  }

  /**
   * Reset asset type limit to default
   */
  async resetAssetLimit(assetType: string): Promise<void> {
    const config = ASSET_TYPE_DEFAULTS[assetType];
    if (!config) {
      throw new Error(`Unknown asset type: ${assetType}`);
    }

    const db = this.dbManager.getConnection();
    const key = `asset_limit_${assetType}`;

    await db.execute('DELETE FROM app_settings WHERE key = ?', [key]);

    logger.info('Asset limit reset to default', {
      assetType,
      defaultLimit: config.defaultMax,
    });
  }

  /**
   * Reset ALL asset limits to defaults
   */
  async resetAllAssetLimits(): Promise<void> {
    const db = this.dbManager.getConnection();

    await db.execute('DELETE FROM app_settings WHERE key LIKE ?', ['asset_limit_%']);

    logger.info('All asset limits reset to defaults');
  }

  /**
   * Check if an asset type is disabled (limit = 0)
   */
  async isAssetTypeEnabled(assetType: string): Promise<boolean> {
    const limit = await this.getAssetLimit(assetType);
    return limit > 0;
  }

  /**
   * Get asset types that support multiple images (limit > 1)
   */
  async getMultiAssetTypes(): Promise<string[]> {
    const limits = await this.getAllAssetLimits();
    return Object.entries(limits)
      .filter(([_, limit]) => limit > 1)
      .map(([type, _]) => type);
  }
}
