import { DatabaseConnection } from '../types/database.js';
import { logger } from '../middleware/logging.js';

/**
 * Notification service types
 */
export type NotificationService = 'kodi' | 'jellyfin' | 'plex' | 'discord' | 'pushover' | 'email';

/**
 * Notification configuration record
 */
export interface NotificationConfig {
  id: number;
  service: NotificationService;
  enabled: boolean;
  config: Record<string, unknown>; // Service-specific configuration
  created_at: string;
  updated_at: string;
}

/**
 * Notification Config Service
 *
 * Manages notification service configuration.
 * Used by fan-out job handlers to determine which notifications to send.
 *
 * Example:
 * ```typescript
 * const enabledServices = await notificationConfig.getEnabledServices();
 * // ['kodi', 'discord'] - only send to these services
 * ```
 */
export class NotificationConfigService {
  constructor(private db: DatabaseConnection) {}

  /**
   * Get all enabled notification services
   * Used by webhook fan-out handler to determine which jobs to create
   *
   * @returns List of enabled service names
   */
  async getEnabledServices(): Promise<NotificationService[]> {
    logger.debug('[NotificationConfigService] Fetching enabled services', {
      service: 'NotificationConfigService',
      operation: 'getEnabledServices',
    });

    const results = await this.db.query<{ service: NotificationService }>(
      'SELECT service FROM notification_config WHERE enabled = 1'
    );

    const services = results.map((row) => row.service);

    logger.debug('[NotificationConfigService] Found enabled services', {
      service: 'NotificationConfigService',
      operation: 'getEnabledServices',
      count: services.length,
      services,
    });

    return services;
  }

  /**
   * Check if a specific service is enabled
   * Used by individual notification handlers to decide whether to process
   *
   * @param service Service name
   * @returns true if enabled, false otherwise
   */
  async isServiceEnabled(service: NotificationService): Promise<boolean> {
    const results = await this.db.query<{ enabled: number }>(
      'SELECT enabled FROM notification_config WHERE service = ?',
      [service]
    );

    const enabled = results.length > 0 && results[0].enabled === 1;

    logger.debug('[NotificationConfigService] Checked service enabled state', {
      service: 'NotificationConfigService',
      operation: 'isServiceEnabled',
      notificationService: service,
      enabled,
    });

    return enabled;
  }

  /**
   * Get configuration for a specific service
   *
   * @param service Service name
   * @returns Configuration object or null if not found
   */
  async getServiceConfig(service: NotificationService): Promise<NotificationConfig | null> {
    const results = await this.db.query<{
      id: number;
      service: NotificationService;
      enabled: number;
      config: string;
      created_at: string;
      updated_at: string;
    }>('SELECT * FROM notification_config WHERE service = ?', [service]);

    if (results.length === 0) {
      logger.warn('[NotificationConfigService] Service config not found', {
        service: 'NotificationConfigService',
        operation: 'getServiceConfig',
        notificationService: service,
      });
      return null;
    }

    const row = results[0];
    return {
      id: row.id,
      service: row.service,
      enabled: row.enabled === 1,
      config: JSON.parse(row.config || '{}'),
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  /**
   * Update service enabled state
   *
   * @param service Service name
   * @param enabled Enabled state
   */
  async setServiceEnabled(service: NotificationService, enabled: boolean): Promise<void> {
    logger.info('[NotificationConfigService] Updating service enabled state', {
      service: 'NotificationConfigService',
      operation: 'setServiceEnabled',
      notificationService: service,
      enabled,
    });

    await this.db.execute(
      `UPDATE notification_config
       SET enabled = ?, updated_at = CURRENT_TIMESTAMP
       WHERE service = ?`,
      [enabled ? 1 : 0, service]
    );
  }

  /**
   * Update service configuration
   *
   * @param service Service name
   * @param config Configuration object
   */
  async updateServiceConfig(
    service: NotificationService,
    config: Record<string, unknown>
  ): Promise<void> {
    logger.info('[NotificationConfigService] Updating service config', {
      service: 'NotificationConfigService',
      operation: 'updateServiceConfig',
      notificationService: service,
    });

    await this.db.execute(
      `UPDATE notification_config
       SET config = ?, updated_at = CURRENT_TIMESTAMP
       WHERE service = ?`,
      [JSON.stringify(config), service]
    );
  }

  /**
   * Get all notification configurations
   * Used by admin UI to display notification settings
   *
   * @returns List of all notification configs
   */
  async getAllConfigs(): Promise<NotificationConfig[]> {
    const results = await this.db.query<{
      id: number;
      service: NotificationService;
      enabled: number;
      config: string;
      created_at: string;
      updated_at: string;
    }>('SELECT * FROM notification_config ORDER BY service');

    return results.map((row) => ({
      id: row.id,
      service: row.service,
      enabled: row.enabled === 1,
      config: JSON.parse(row.config || '{}'),
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
  }
}
