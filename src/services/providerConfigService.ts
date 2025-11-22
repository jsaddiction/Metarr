import { DatabaseConnection } from '../types/database.js';
import { ProviderConfig, UpdateProviderRequest } from '../types/provider.js';
import { logger } from '../middleware/logging.js';
import { getDefaultApiKey, hasDefaultApiKey } from '../config/providerDefaults.js';
import { DatabaseError } from '../errors/index.js';

/**
 * Provider Configuration Service
 *
 * Handles CRUD operations for provider configurations
 */
export class ProviderConfigService {
  constructor(private readonly db: DatabaseConnection) {}

  /**
   * Get all provider configurations
   * Includes both database records and default configs for providers with default API keys
   */
  async getAll(): Promise<ProviderConfig[]> {
    const rows = await this.db.query<{
      id: number;
      provider_name: string;
      enabled: number;
      api_key?: string;
      personal_api_key?: string;
      enabled_asset_types: string;
      language?: string;
      region?: string;
      options?: string;
      last_test_at?: string;
      last_test_status?: string;
      last_test_error?: string;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT * FROM provider_config ORDER BY provider_name ASC`
    );

    const dbConfigs = rows.map(this.mapRowToConfig);
    const configMap = new Map<string, ProviderConfig>();

    // Add database configs first (they override defaults)
    for (const config of dbConfigs) {
      configMap.set(config.providerName, config);
    }

    // Add default configs for providers not in database
    const supportedProviders = ['tmdb', 'fanart_tv', 'tvdb'];
    for (const providerName of supportedProviders) {
      if (!configMap.has(providerName) && hasDefaultApiKey(providerName)) {
        const defaultApiKey = getDefaultApiKey(providerName);
        if (defaultApiKey) {
          configMap.set(providerName, {
            id: 0, // Temporary ID for default configs
            providerName,
            enabled: true,
            apiKey: defaultApiKey,
            created_at: new Date(),
            updated_at: new Date()
          });
        }
      }
    }

    return Array.from(configMap.values()).sort((a, b) =>
      a.providerName.localeCompare(b.providerName)
    );
  }

  /**
   * Get a single provider configuration by name
   * If no database record exists but a default API key is available, return a default config
   */
  async getByName(providerName: string): Promise<ProviderConfig | null> {
    const rows = await this.db.query<{
      id: number;
      provider_name: string;
      enabled: number;
      api_key?: string;
      personal_api_key?: string;
      enabled_asset_types: string;
      language?: string;
      region?: string;
      options?: string;
      last_test_at?: string;
      last_test_status?: string;
      last_test_error?: string;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT * FROM provider_config WHERE provider_name = ?`,
      [providerName]
    );

    if (rows.length === 0) {
      // No database record - check if we have a default API key
      if (hasDefaultApiKey(providerName)) {
        const defaultApiKey = getDefaultApiKey(providerName);
        if (!defaultApiKey) {
          logger.warn(`Default API key is undefined for provider: ${providerName}`);
          return null;
        }

        logger.debug(`Using default API key for provider: ${providerName}`);

        return {
          id: 0, // Temporary ID for default configs
          providerName,
          enabled: true, // Default to enabled if we have an API key
          apiKey: defaultApiKey,
          created_at: new Date(),
          updated_at: new Date()
        };
      }

      // No default available - provider not supported or not configured
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
        `UPDATE provider_config
         SET enabled = ?,
             api_key = ?,
             personal_api_key = ?,
             language = ?,
             region = ?,
             options = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE provider_name = ?`,
        [
          data.enabled ? 1 : 0,
          data.apiKey || null,
          data.personalApiKey || null,
          data.language || null,
          data.region || null,
          data.options ? JSON.stringify(data.options) : null,
          providerName
        ]
      );

      logger.info(`Updated provider configuration: ${providerName}`);
    } else {
      // Insert new
      await this.db.execute(
        `INSERT INTO provider_config (
          provider_name,
          enabled,
          api_key,
          personal_api_key,
          language,
          region,
          options,
          last_test_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          providerName,
          data.enabled ? 1 : 0,
          data.apiKey || null,
          data.personalApiKey || null,
          data.language || null,
          data.region || null,
          data.options ? JSON.stringify(data.options) : null,
          'never_tested'
        ]
      );

      logger.info(`Created provider configuration: ${providerName}`);
    }

    const updated = await this.getByName(providerName);
    if (!updated) {
      throw new DatabaseError(`Failed to retrieve provider configuration after upsert: ${providerName}`);
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
      `UPDATE provider_config
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
      `UPDATE provider_config
       SET enabled = 0,
           api_key = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE provider_name = ?`,
      [providerName]
    );

    logger.info(`Disabled provider: ${providerName}`);
  }

  /**
   * Get provider statistics (API call counts in last 24 hours)
   * Returns statistics for all providers that have fetched assets
   */
  async getStatistics(): Promise<Record<string, {
    totalCalls24h: number;
    lastSuccessfulFetch?: string;
    successRate?: number;
  }>> {
    try {
      // Query provider_assets table for calls in last 24 hours
      const rows = await this.db.query<{
        provider_name: string;
        total_calls: number;
        last_fetch: string | null;
      }>(
        `SELECT
          provider_name,
          COUNT(*) as total_calls,
          MAX(fetched_at) as last_fetch
        FROM provider_assets
        WHERE fetched_at >= datetime('now', '-24 hours')
        GROUP BY provider_name`
      );

      const stats: Record<string, {
        totalCalls24h: number;
        lastSuccessfulFetch?: string;
        successRate?: number;
      }> = {};

      for (const row of rows) {
        stats[row.provider_name] = {
          totalCalls24h: row.total_calls,
          ...(row.last_fetch && { lastSuccessfulFetch: row.last_fetch })
        };
      }

      logger.debug('Provider statistics retrieved', { providerCount: Object.keys(stats).length });
      return stats;
    } catch (error) {
      logger.error('Error retrieving provider statistics:', error);
      throw new DatabaseError(
        'Failed to retrieve provider statistics',
        undefined, // errorCode
        true, // isRetryable
        {
          service: 'ProviderConfigService',
          operation: 'getStatistics',
          metadata: { error }
        }
      );
    }
  }

  /**
   * Map database row to ProviderConfig
   */
  private mapRowToConfig(row: {
    id: number;
    provider_name: string;
    enabled: number;
    api_key?: string;
    personal_api_key?: string;
    language?: string;
    region?: string;
    options?: string;
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
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at)
    };

    // Add optional fields only if they exist
    if (row.api_key) {
      config.apiKey = row.api_key;
    }
    if (row.personal_api_key) {
      config.personalApiKey = row.personal_api_key;
    }
    if (row.language) {
      config.language = row.language;
    }
    if (row.region) {
      config.region = row.region;
    }
    if (row.options) {
      config.options = JSON.parse(row.options);
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
