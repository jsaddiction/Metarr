import type { DatabaseConnection } from '../types/database.js';
import type { DataSelectionConfig, FieldPriorityConfig } from '../types/provider.js';
import { logger } from '../middleware/logging.js';

/**
 * Service for managing data selection configuration
 *
 * Separates provider connection config from data filtering/prioritization:
 * - Provider Config = Connection settings (API keys, language, region)
 * - Data Selection Config = Which providers to use for which data (filters/priorities)
 *
 * Two modes:
 * - Balanced: Use sensible defaults (TMDB → TVDB → FanArt.tv)
 * - Custom: User-defined priorities per field/asset type
 */
export class DataSelectionService {
  constructor(private db: DatabaseConnection) {}

  /**
   * Get current data selection configuration
   */
  async getConfig(): Promise<DataSelectionConfig> {
    const rows = await this.db.query<{
      id: number;
      mode: string;
      custom_metadata_priorities: string;
      custom_image_priorities: string;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT id, mode, custom_metadata_priorities, custom_image_priorities, created_at, updated_at
       FROM data_selection_config
       LIMIT 1`
    );

    if (rows.length === 0) {
      // Initialize default config if none exists
      return this.initializeDefaultConfig();
    }

    return this.mapRowToConfig(rows[0]);
  }

  /**
   * Update data selection mode
   */
  async updateMode(mode: 'balanced' | 'custom'): Promise<DataSelectionConfig> {
    await this.db.execute(
      `UPDATE data_selection_config
       SET mode = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = 1`,
      [mode]
    );

    logger.info(`Data selection mode updated to: ${mode}`);

    return this.getConfig();
  }

  /**
   * Update custom priority for a specific field
   *
   * @param category - 'metadata' or 'images'
   * @param fieldKey - e.g., 'movies.title' or 'tvshows.poster'
   * @param providerOrder - Ordered list of provider names
   * @param disabled - List of provider names to exclude
   */
  async updateFieldPriority(
    category: 'metadata' | 'images',
    fieldKey: string,
    providerOrder: string[],
    disabled: string[] = []
  ): Promise<DataSelectionConfig> {
    const config = await this.getConfig();

    const priorityConfig: FieldPriorityConfig = {
      providerOrder,
      disabled,
    };

    // Update the appropriate category
    if (category === 'metadata') {
      config.customMetadataPriorities[fieldKey] = priorityConfig;
    } else {
      config.customImagePriorities[fieldKey] = priorityConfig;
    }

    // Save to database
    const column =
      category === 'metadata' ? 'custom_metadata_priorities' : 'custom_image_priorities';

    const priorities =
      category === 'metadata' ? config.customMetadataPriorities : config.customImagePriorities;

    await this.db.execute(
      `UPDATE data_selection_config
       SET ${column} = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = 1`,
      [JSON.stringify(priorities)]
    );

    logger.info(`Updated ${category} priority for ${fieldKey}`, {
      providerOrder,
      disabled,
    });

    return this.getConfig();
  }

  /**
   * Get provider order for a specific field
   *
   * Returns the provider order based on current mode:
   * - Balanced mode: Returns balanced defaults
   * - Custom mode: Returns user-defined priorities (or balanced defaults if not customized)
   */
  async getProviderOrder(
    category: 'metadata' | 'images',
    fieldKey: string
  ): Promise<string[]> {
    const config = await this.getConfig();

    // In custom mode, check if user has defined a custom priority
    if (config.mode === 'custom') {
      const priorities =
        category === 'metadata' ? config.customMetadataPriorities : config.customImagePriorities;

      if (priorities[fieldKey]) {
        const { providerOrder, disabled } = priorities[fieldKey];
        // Filter out disabled providers
        return providerOrder.filter(p => !disabled.includes(p));
      }
    }

    // Fall back to balanced defaults
    return this.getBalancedDefaults(category, fieldKey);
  }

  /**
   * Get balanced mode default priorities
   *
   * IMPORTANT: These priorities are for EQUAL QUALITY tie-breaking only.
   * Quality/vote counts trump priority - higher rated content always wins.
   *
   * Priority order represents community trust/popularity when quality matches:
   *
   * Movies Metadata: IMDb (industry standard, 10M+ titles) > TMDB (community, active) > Local
   * Movies Images: FanArt.tv (moderated) > TMDB (high-res but unmoderated) > Local
   *
   * TV Metadata: TVDB (moderated, TV-focused) > TMDB (community) > Local
   * TV Images: FanArt.tv (moderated) > TVDB (moderated) > TMDB (unmoderated) > Local
   *
   * Music Metadata: MusicBrainz (2.6M artists, community) > TheAudioDB > Local
   * Music Images: TheAudioDB (music-focused) > MusicBrainz > Local
   *
   * Local: Represents previously published data OR user manual edits (field locking determines if it's user-selected)
   *        Always LOWEST priority - online sources preferred even for gap fills
   *        Local is last-ditch fallback only when all online sources fail to provide the asset
   */
  private getBalancedDefaults(category: 'metadata' | 'images', fieldKey: string): string[] {
    // Parse the field key (e.g., 'movies.title' or 'tvshows.poster')
    const [mediaType] = fieldKey.split('.');

    if (category === 'metadata') {
      // Metadata priorities (community trust when quality matches)
      if (mediaType === 'movies') {
        // IMDb: Industry standard, 10M+ titles, most trusted (web scraped but comprehensive)
        // TMDB: Community-driven, active development, good API
        // Local: Unverified, lowest priority
        return ['imdb', 'tmdb', 'local'];
      } else if (mediaType === 'tvshows') {
        // TVDB: Moderated TV database, series-specific moderators
        // TMDB: Community-driven, good for recent/international
        // Local: Unverified, lowest priority
        return ['tvdb', 'tmdb', 'local'];
      } else if (mediaType === 'music') {
        // MusicBrainz: 2.6M artists, open encyclopedia, most comprehensive
        // TheAudioDB: Music-focused, artwork metadata
        // Local: Unverified, lowest priority
        return ['musicbrainz', 'theaudiodb', 'local'];
      }
    } else {
      // Image priorities (moderation + quality when vote counts match)
      if (mediaType === 'movies') {
        // FanArt.tv: Moderated, quality-controlled (1000x1426 but curated)
        // TMDB: Higher resolution (1400x2100+) but minimal moderation
        // Local: Unverified, lowest priority
        return ['fanart_tv', 'tmdb', 'local'];
      } else if (mediaType === 'tvshows') {
        // FanArt.tv: Moderated, quality-controlled
        // TVDB: Moderated TV-specific artwork
        // TMDB: Minimal moderation
        // Local: Unverified, lowest priority
        return ['fanart_tv', 'tvdb', 'tmdb', 'local'];
      } else if (mediaType === 'music') {
        // TheAudioDB: Music artwork specialist
        // MusicBrainz: Limited but available
        // Local: Unverified, lowest priority
        return ['theaudiodb', 'musicbrainz', 'local'];
      }
    }

    // Default fallback
    return ['fanart_tv', 'tvdb', 'tmdb', 'imdb', 'local'];
  }

  /**
   * Initialize default configuration
   */
  private async initializeDefaultConfig(): Promise<DataSelectionConfig> {
    await this.db.execute(
      `INSERT INTO data_selection_config (mode, custom_metadata_priorities, custom_image_priorities)
       VALUES (?, ?, ?)`,
      ['balanced', '{}', '{}']
    );

    logger.info('Initialized default data selection config (balanced mode)');

    return this.getConfig();
  }

  /**
   * Map database row to DataSelectionConfig
   */
  private mapRowToConfig(row: {
    id: number;
    mode: string;
    custom_metadata_priorities: string;
    custom_image_priorities: string;
    created_at: string;
    updated_at: string;
  }): DataSelectionConfig {
    return {
      id: row.id,
      mode: row.mode as 'balanced' | 'custom',
      customMetadataPriorities: JSON.parse(row.custom_metadata_priorities),
      customImagePriorities: JSON.parse(row.custom_image_priorities),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
