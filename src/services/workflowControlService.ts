import { DatabaseConnection } from '../types/database.js';
import { websocketBroadcaster } from './websocketBroadcaster.js';
import { logger } from '../middleware/logging.js';

/**
 * Workflow Control Service
 *
 * Manages global workflow stage enable/disable settings.
 * All stages are disabled by default for development safety.
 *
 * Workflow stages:
 * - webhooks: Process webhooks from Radarr/Sonarr/Lidarr
 * - scanning: Discover assets in filesystem
 * - identification: Fetch metadata from TMDB/TVDB
 * - enrichment: Auto-select best quality assets
 * - publishing: Write NFO files and assets to library
 */

export type WorkflowStage = 'webhooks' | 'scanning' | 'identification' | 'enrichment' | 'publishing';

export interface WorkflowSettings {
  webhooks: boolean;
  scanning: boolean;
  identification: boolean;
  enrichment: boolean;
  publishing: boolean;
}

export class WorkflowControlService {
  private db: DatabaseConnection;
  private cache: Map<WorkflowStage, { value: boolean; timestamp: number }> = new Map();
  private cacheTimeout = 60000; // 1 minute cache

  constructor(db: DatabaseConnection) {
    this.db = db;
  }

  /**
   * Check if a workflow stage is enabled
   * Uses 1-minute cache for performance
   */
  async isEnabled(stage: WorkflowStage): Promise<boolean> {
    // Check cache first
    const cached = this.cache.get(stage);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.value;
    }

    // Query database
    const result = await this.db.query<{ value: string }>(
      'SELECT value FROM app_settings WHERE key = ?',
      [`workflow.${stage}`]
    );

    const enabled = result.length > 0 && result[0].value === 'true';

    // Update cache
    this.cache.set(stage, {
      value: enabled,
      timestamp: Date.now()
    });

    return enabled;
  }

  /**
   * Enable or disable a workflow stage
   * Clears cache and broadcasts update via WebSocket
   */
  async setEnabled(stage: WorkflowStage, enabled: boolean): Promise<void> {
    await this.db.execute(
      'INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
      [`workflow.${stage}`, enabled.toString()]
    );

    // Clear cache
    this.cache.delete(stage);

    logger.info('Workflow stage updated', {
      service: 'WorkflowControlService',
      stage,
      enabled
    });

    // Emit WebSocket event
    websocketBroadcaster.broadcast({
      type: 'workflow.updated',
      stage,
      enabled
    });
  }

  /**
   * Get all workflow settings
   */
  async getAll(): Promise<WorkflowSettings> {
    const result = await this.db.query<{ key: string; value: string }>(
      "SELECT key, value FROM app_settings WHERE key LIKE 'workflow.%'"
    );

    const settings: WorkflowSettings = {
      webhooks: false,
      scanning: false,
      identification: false,
      enrichment: false,
      publishing: false
    };

    for (const row of result) {
      const stage = row.key.replace('workflow.', '') as WorkflowStage;
      if (this.isValidStage(stage)) {
        settings[stage] = row.value === 'true';
      }
    }

    return settings;
  }

  /**
   * Update multiple workflow settings at once
   */
  async updateMultiple(updates: Partial<WorkflowSettings>): Promise<WorkflowSettings> {
    for (const [stage, enabled] of Object.entries(updates)) {
      if (this.isValidStage(stage as WorkflowStage) && typeof enabled === 'boolean') {
        await this.setEnabled(stage as WorkflowStage, enabled);
      }
    }

    return this.getAll();
  }

  /**
   * Enable all workflow stages (production mode)
   */
  async enableAll(): Promise<void> {
    await this.updateMultiple({
      webhooks: true,
      scanning: true,
      identification: true,
      enrichment: true,
      publishing: true
    });

    logger.info('All workflow stages enabled (production mode)', {
      service: 'WorkflowControlService'
    });
  }

  /**
   * Disable all workflow stages (development mode)
   */
  async disableAll(): Promise<void> {
    await this.updateMultiple({
      webhooks: false,
      scanning: false,
      identification: false,
      enrichment: false,
      publishing: false
    });

    logger.info('All workflow stages disabled (development mode)', {
      service: 'WorkflowControlService'
    });
  }

  /**
   * Clear the cache (useful for testing)
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Validate that a stage name is valid
   */
  private isValidStage(stage: string): stage is WorkflowStage {
    return ['webhooks', 'scanning', 'identification', 'enrichment', 'publishing'].includes(stage);
  }
}
