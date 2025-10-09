import { DatabaseConnection } from '../types/database.js';
import { ProviderConfig, UpdateProviderRequest } from '../types/provider.js';
import { logger } from '../middleware/logging.js';

/**
 * Provider Configuration Service
 *
 * Handles CRUD operations for provider configurations
 */
export class ProviderConfigService {
  constructor(private db: DatabaseConnection) {}

  /**
   * Get all provider configurations
   */
  async getAll(): Promise<ProviderConfig[]> {
    const rows = await this.db.query<{
      id: number;
      provider_name: string;
      enabled: number;
      api_key?: string;
      enabled_asset_types: string;
      last_test_at?: string;
      last_test_status?: string;
      last_test_error?: string;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT * FROM provider_configs ORDER BY provider_name ASC`
    );

    return rows.map(this.mapRowToConfig);
  }

  /**
   * Get a single provider configuration by name
   */
  async getByName(providerName: string): Promise<ProviderConfig | null> {
    const rows = await this.db.query<{
      id: number;
      provider_name: string;
      enabled: number;
      api_key?: string;
      enabled_asset_types: string;
      last_test_at?: string;
      last_test_status?: string;
      last_test_error?: string;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT * FROM provider_configs WHERE provider_name = ?`,
      [providerName]
    );

    if (rows.length === 0) {
      return null;
    }

    return this.mapRowToConfig(rows[0]);
  }

  /**
   * Create or update a provider configuration
   */
  async upsert(providerName: string, data: UpdateProviderRequest): Promise<ProviderConfig> {
    const existing = await this.getByName(providerName);

    if (existing) {
      // Update existing
      await this.db.execute(
        `UPDATE provider_configs
         SET enabled = ?,
             api_key = ?,
             enabled_asset_types = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE provider_name = ?`,
        [
          data.enabled ? 1 : 0,
          data.apiKey || null,
          JSON.stringify(data.enabledAssetTypes),
          providerName
        ]
      );

      logger.info(`Updated provider configuration: ${providerName}`);
    } else {
      // Insert new
      await this.db.execute(
        `INSERT INTO provider_configs (
          provider_name,
          enabled,
          api_key,
          enabled_asset_types,
          last_test_status
        ) VALUES (?, ?, ?, ?, ?)`,
        [
          providerName,
          data.enabled ? 1 : 0,
          data.apiKey || null,
          JSON.stringify(data.enabledAssetTypes),
          'never_tested'
        ]
      );

      logger.info(`Created provider configuration: ${providerName}`);
    }

    const updated = await this.getByName(providerName);
    if (!updated) {
      throw new Error(`Failed to retrieve provider configuration after upsert: ${providerName}`);
    }

    return updated;
  }

  /**
   * Update test status for a provider
   */
  async updateTestStatus(
    providerName: string,
    status: 'success' | 'error',
    error?: string
  ): Promise<void> {
    await this.db.execute(
      `UPDATE provider_configs
       SET last_test_at = CURRENT_TIMESTAMP,
           last_test_status = ?,
           last_test_error = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE provider_name = ?`,
      [status, error || null, providerName]
    );

    logger.info(`Updated test status for ${providerName}: ${status}`);
  }

  /**
   * Disable a provider and clear API key
   */
  async disable(providerName: string): Promise<void> {
    await this.db.execute(
      `UPDATE provider_configs
       SET enabled = 0,
           api_key = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE provider_name = ?`,
      [providerName]
    );

    logger.info(`Disabled provider: ${providerName}`);
  }

  /**
   * Map database row to ProviderConfig
   */
  private mapRowToConfig(row: {
    id: number;
    provider_name: string;
    enabled: number;
    api_key?: string;
    enabled_asset_types: string;
    last_test_at?: string;
    last_test_status?: string;
    last_test_error?: string;
    created_at: string;
    updated_at: string;
  }): ProviderConfig {
    const config: ProviderConfig = {
      id: row.id,
      providerName: row.provider_name,
      enabled: Boolean(row.enabled),
      enabledAssetTypes: JSON.parse(row.enabled_asset_types),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };

    // Add optional fields only if they exist
    if (row.api_key) {
      config.apiKey = row.api_key;
    }
    if (row.last_test_at) {
      config.lastTestAt = new Date(row.last_test_at);
    }
    if (row.last_test_status) {
      config.lastTestStatus = row.last_test_status as 'success' | 'error' | 'never_tested';
    }
    if (row.last_test_error) {
      config.lastTestError = row.last_test_error;
    }

    return config;
  }
}
