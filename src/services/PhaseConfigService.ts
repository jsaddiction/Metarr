import { DatabaseConnection } from '../types/database.js';
import {
  PhaseConfiguration,
  DEFAULT_PHASE_CONFIG,
} from '../config/phaseConfig.js';
import { websocketBroadcaster } from './websocketBroadcaster.js';
import { logger } from '../middleware/logging.js';

/**
 * Phase Configuration Service
 *
 * Manages phase behavior configuration (NOT phase enablement).
 * All phases ALWAYS run - configuration controls WHAT they do.
 *
 * Example:
 * - Enrichment phase always runs
 * - fetchProviderAssets=false → Skip asset download, only fetch metadata + actors
 * - autoSelectAssets=false → Fetch assets but don't auto-select (user picks in UI)
 */
export class PhaseConfigService {
  private cache: PhaseConfiguration | null = null;
  private cacheTimestamp = 0;
  private readonly CACHE_TTL = 60000; // 1 minute

  constructor(private db: DatabaseConnection) {}

  /**
   * Get configuration for a specific phase
   */
  async getConfig<T extends keyof PhaseConfiguration>(
    phase: T
  ): Promise<PhaseConfiguration[T]> {
    const config = await this.getAll();
    return config[phase];
  }

  /**
   * Get all phase configurations (cached for performance)
   */
  async getAll(): Promise<PhaseConfiguration> {
    // Check cache
    if (this.cache && Date.now() - this.cacheTimestamp < this.CACHE_TTL) {
      return this.cache;
    }

    // Load from database
    const settings = await this.db.query<{ key: string; value: string }>(
      "SELECT key, value FROM app_settings WHERE key LIKE 'phase.%'"
    );

    // Build config with defaults
    const config: PhaseConfiguration = {
      enrichment: {
        fetchProviderAssets: this.getBool(settings, 'phase.enrichment.fetchProviderAssets', DEFAULT_PHASE_CONFIG.enrichment.fetchProviderAssets),
        autoSelectAssets: this.getBool(settings, 'phase.enrichment.autoSelectAssets', DEFAULT_PHASE_CONFIG.enrichment.autoSelectAssets),
        preferredLanguage: this.getString(settings, 'phase.enrichment.language', DEFAULT_PHASE_CONFIG.enrichment.preferredLanguage),
      },

      publish: {
        publishAssets: this.getBool(settings, 'phase.publish.assets', DEFAULT_PHASE_CONFIG.publish.publishAssets),
        publishActors: this.getBool(settings, 'phase.publish.actors', DEFAULT_PHASE_CONFIG.publish.publishActors),
        publishTrailers: this.getBool(settings, 'phase.publish.trailers', DEFAULT_PHASE_CONFIG.publish.publishTrailers),
      },

      general: {
        autoPublish: this.getBool(settings, 'phase.general.autoPublish', DEFAULT_PHASE_CONFIG.general.autoPublish),
      },
    };

    // Cache it
    this.cache = config;
    this.cacheTimestamp = Date.now();

    return config;
  }

  /**
   * Update a specific setting
   */
  async set(key: string, value: string | number | boolean | string[]): Promise<void> {
    // Convert arrays to JSON strings
    const stringValue = Array.isArray(value) ? JSON.stringify(value) : String(value);

    await this.db.execute(
      'INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
      [`phase.${key}`, stringValue]
    );

    // Clear cache
    this.cache = null;

    logger.info('[PhaseConfigService] Setting updated', {
      key,
      value,
    });

    // Broadcast update
    websocketBroadcaster.broadcast('phase.config-updated', { key, value });
  }

  /**
   * Update multiple settings at once
   */
  async updateMultiple(updates: Record<string, any>): Promise<void> {
    for (const [key, value] of Object.entries(updates)) {
      await this.set(key, value);
    }
  }

  /**
   * Reset to default configuration
   */
  async resetToDefaults(): Promise<void> {
    logger.info('[PhaseConfigService] Resetting to default configuration');

    // Delete all phase settings
    await this.db.execute("DELETE FROM app_settings WHERE key LIKE 'phase.%'");

    // Clear cache
    this.cache = null;

    // Broadcast reset
    websocketBroadcaster.broadcast('phase.config-reset', {});
  }

  /**
   * Clear the cache (useful for testing)
   */
  clearCache(): void {
    this.cache = null;
  }

  // ============================================
  // HELPER METHODS (PRIVATE)
  // ============================================

  private getBool(settings: any[], key: string, defaultValue: boolean): boolean {
    const setting = settings.find(s => s.key === key);
    return setting ? setting.value === 'true' : defaultValue;
  }

  private getInt(settings: any[], key: string, defaultValue: number): number {
    const setting = settings.find(s => s.key === key);
    return setting ? parseInt(setting.value, 10) : defaultValue;
  }

  private getString(settings: any[], key: string, defaultValue: string): string {
    const setting = settings.find(s => s.key === key);
    return setting ? setting.value : defaultValue;
  }

  private getArray(settings: any[], key: string, defaultValue: string[]): string[] {
    const setting = settings.find(s => s.key === key);
    if (!setting) return defaultValue;

    try {
      return JSON.parse(setting.value);
    } catch {
      return defaultValue;
    }
  }
}
