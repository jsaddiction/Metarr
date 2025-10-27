import { Request, Response, NextFunction } from 'express';
import { DatabaseManager } from '../database/DatabaseManager.js';
import { logger } from '../middleware/logging.js';
import { SqlParam } from '../types/database.js';

/**
 * Webhook Configuration Controller
 *
 * Handles HTTP requests for webhook configuration management
 */
export class WebhookConfigController {
  constructor(private db: DatabaseManager) {}

  /**
   * GET /api/settings/webhooks
   * Get all webhook configurations
   */
  getAllWebhooks = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const conn = this.db.getConnection();
      const configs = await conn.query(
        `SELECT
          id, service, enabled, auth_enabled, auth_username,
          auto_publish, priority, created_at, updated_at
         FROM webhook_config
         ORDER BY service`
      );

      // Don't send password to frontend
      const sanitized = configs.map((config: unknown) => {
        const c = config as {
          id: number;
          service: string;
          enabled: number;
          auth_enabled: number;
          auth_username: string | null;
          auto_publish: number;
          priority: number;
          created_at: string;
          updated_at: string;
        };
        return {
          id: c.id,
          service: c.service,
          enabled: Boolean(c.enabled),
          authEnabled: Boolean(c.auth_enabled),
          authUsername: c.auth_username || '',
          autoPublish: Boolean(c.auto_publish),
          priority: c.priority,
          created_at: c.created_at,
          updated_at: c.updated_at
        };
      });

      res.json({ webhooks: sanitized });
    } catch (error) {
      logger.error('Error getting webhook configurations:', error);
      next(error);
    }
  };

  /**
   * GET /api/settings/webhooks/:service
   * Get single webhook configuration
   */
  getWebhook = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { service } = req.params;

      // Validate service name
      const validServices = ['radarr', 'sonarr', 'lidarr'];
      if (!validServices.includes(service)) {
        res.status(400).json({ error: `Invalid service. Must be one of: ${validServices.join(', ')}` });
        return;
      }

      const conn = this.db.getConnection();
      const configs = await conn.query(
        `SELECT
          id, service, enabled, auth_enabled, auth_username,
          auto_publish, priority, created_at, updated_at
         FROM webhook_config
         WHERE service = ?`,
        [service]
      );

      if (configs.length === 0) {
        res.status(404).json({ error: `Webhook configuration for '${service}' not found` });
        return;
      }

      const config = configs[0] as {
        id: number;
        service: string;
        enabled: number;
        auth_enabled: number;
        auth_username: string | null;
        auto_publish: number;
        priority: number;
        created_at: string;
        updated_at: string;
      };

      // Don't send password to frontend
      res.json({
        webhook: {
          id: config.id,
          service: config.service,
          enabled: Boolean(config.enabled),
          authEnabled: Boolean(config.auth_enabled),
          authUsername: config.auth_username || '',
          autoPublish: Boolean(config.auto_publish),
          priority: config.priority,
          created_at: config.created_at,
          updated_at: config.updated_at
        }
      });
    } catch (error) {
      logger.error('Error getting webhook configuration:', error);
      next(error);
    }
  };

  /**
   * PUT /api/settings/webhooks/:service
   * Update webhook configuration
   */
  updateWebhook = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { service } = req.params;
      const { enabled, authEnabled, authUsername, authPassword, autoPublish, priority } = req.body;

      // Validate service name
      const validServices = ['radarr', 'sonarr', 'lidarr'];
      if (!validServices.includes(service)) {
        res.status(400).json({ error: `Invalid service. Must be one of: ${validServices.join(', ')}` });
        return;
      }

      // Validate inputs
      if (enabled !== undefined && typeof enabled !== 'boolean') {
        res.status(400).json({ error: 'enabled must be a boolean' });
        return;
      }

      if (authEnabled !== undefined && typeof authEnabled !== 'boolean') {
        res.status(400).json({ error: 'authEnabled must be a boolean' });
        return;
      }

      if (authUsername !== undefined && typeof authUsername !== 'string') {
        res.status(400).json({ error: 'authUsername must be a string' });
        return;
      }

      if (authPassword !== undefined && typeof authPassword !== 'string') {
        res.status(400).json({ error: 'authPassword must be a string' });
        return;
      }

      if (autoPublish !== undefined && typeof autoPublish !== 'boolean') {
        res.status(400).json({ error: 'autoPublish must be a boolean' });
        return;
      }

      if (priority !== undefined) {
        if (typeof priority !== 'number' || priority < 1 || priority > 10) {
          res.status(400).json({ error: 'priority must be a number between 1 and 10' });
          return;
        }
      }

      // Build dynamic update query
      const updates: string[] = [];
      const values: SqlParam[] = [];

      if (enabled !== undefined) {
        updates.push('enabled = ?');
        values.push(enabled ? 1 : 0);
      }

      if (authEnabled !== undefined) {
        updates.push('auth_enabled = ?');
        values.push(authEnabled ? 1 : 0);
      }

      if (authUsername !== undefined) {
        updates.push('auth_username = ?');
        values.push(authUsername);
      }

      if (authPassword !== undefined) {
        updates.push('auth_password = ?');
        values.push(authPassword);
      }

      if (autoPublish !== undefined) {
        updates.push('auto_publish = ?');
        values.push(autoPublish ? 1 : 0);
      }

      if (priority !== undefined) {
        updates.push('priority = ?');
        values.push(priority);
      }

      if (updates.length === 0) {
        res.status(400).json({ error: 'No fields to update' });
        return;
      }

      // Add updated_at
      updates.push('updated_at = CURRENT_TIMESTAMP');

      // Add service to WHERE clause
      values.push(service);

      const conn = this.db.getConnection();
      const result = await conn.execute(
        `UPDATE webhook_config SET ${updates.join(', ')} WHERE service = ?`,
        values
      );

      if (result.affectedRows === 0) {
        res.status(404).json({ error: `Webhook configuration for '${service}' not found` });
        return;
      }

      logger.info('Updated webhook configuration', {
        service,
        enabled,
        authEnabled,
        autoPublish,
        priority
      });

      // Fetch updated config
      const configs = await conn.query(
        `SELECT
          id, service, enabled, auth_enabled, auth_username,
          auto_publish, priority, created_at, updated_at
         FROM webhook_config
         WHERE service = ?`,
        [service]
      );

      const config = configs[0] as {
        id: number;
        service: string;
        enabled: number;
        auth_enabled: number;
        auth_username: string | null;
        auto_publish: number;
        priority: number;
        created_at: string;
        updated_at: string;
      };

      res.json({
        webhook: {
          id: config.id,
          service: config.service,
          enabled: Boolean(config.enabled),
          authEnabled: Boolean(config.auth_enabled),
          authUsername: config.auth_username || '',
          autoPublish: Boolean(config.auto_publish),
          priority: config.priority,
          created_at: config.created_at,
          updated_at: config.updated_at
        }
      });
    } catch (error) {
      logger.error('Error updating webhook configuration:', error);
      next(error);
    }
  };
}
