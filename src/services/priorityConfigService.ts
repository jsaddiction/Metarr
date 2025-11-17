import { DatabaseConnection } from '../types/database.js';
import {
  AssetTypePriority,
  MetadataFieldPriority,
  PriorityPresetSelection,
  UpdateAssetTypePriorityRequest,
  UpdateMetadataFieldPriorityRequest
} from '../types/provider.js';
import { logger } from '../middleware/logging.js';
import {
  getPriorityPreset,
  getAllPriorityPresets,
  FORCED_LOCAL_FIELDS,
  PriorityPreset,
  providerSupportsAssetType,
  getProvidersForAssetType
} from '../config/providerMetadata.js';
import { ValidationError, ResourceNotFoundError, InvalidStateError } from '../errors/index.js';

/**
 * Priority Configuration Service
 *
 * Manages provider priority ordering for asset types and metadata fields
 */
export class PriorityConfigService {
  constructor(private db: DatabaseConnection) {}

  /**
   * Get all asset type priorities
   */
  async getAllAssetTypePriorities(): Promise<AssetTypePriority[]> {
    const rows = await this.db.query<{
      id: number;
      asset_type: string;
      provider_order: string;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT * FROM asset_type_priorities ORDER BY asset_type ASC`
    );

    return rows.map(row => ({
      id: row.id,
      assetType: row.asset_type,
      providerOrder: JSON.parse(row.provider_order),
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at)
    }));
  }

  /**
   * Get priority for a specific asset type
   */
  async getAssetTypePriority(assetType: string): Promise<AssetTypePriority | null> {
    const rows = await this.db.query<{
      id: number;
      asset_type: string;
      provider_order: string;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT * FROM asset_type_priorities WHERE asset_type = ?`,
      [assetType]
    );

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];
    return {
      id: row.id,
      assetType: row.asset_type,
      providerOrder: JSON.parse(row.provider_order),
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at)
    };
  }

  /**
   * Update or create asset type priority
   */
  async upsertAssetTypePriority(data: UpdateAssetTypePriorityRequest): Promise<AssetTypePriority> {
    // Validate that all providers in the order support this asset type
    const invalidProviders = data.providerOrder.filter(
      provider => provider !== 'local' && !providerSupportsAssetType(provider, data.assetType)
    );

    if (invalidProviders.length > 0) {
      const supportedProviders = getProvidersForAssetType(data.assetType);
      throw new ValidationError(
        `Provider(s) ${invalidProviders.join(', ')} do not support asset type '${data.assetType}'. ` +
        `Supported providers: ${supportedProviders.join(', ')}`,
        {
          metadata: {
            assetType: data.assetType,
            invalidProviders,
            supportedProviders
          }
        }
      );
    }

    const existing = await this.getAssetTypePriority(data.assetType);

    if (existing) {
      await this.db.execute(
        `UPDATE asset_type_priorities
         SET provider_order = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE asset_type = ?`,
        [JSON.stringify(data.providerOrder), data.assetType]
      );

      logger.info(`Updated asset type priority: ${data.assetType}`);
    } else {
      await this.db.execute(
        `INSERT INTO asset_type_priorities (asset_type, provider_order)
         VALUES (?, ?)`,
        [data.assetType, JSON.stringify(data.providerOrder)]
      );

      logger.info(`Created asset type priority: ${data.assetType}`);
    }

    // Mark preset as custom since user manually changed a priority
    await this.setActivePreset('custom');

    const updated = await this.getAssetTypePriority(data.assetType);
    if (!updated) {
      throw new InvalidStateError(
        'asset type priority exists',
        'asset type priority not found',
        `Failed to retrieve asset type priority after upsert: ${data.assetType}`,
        { metadata: { assetType: data.assetType } }
      );
    }

    return updated;
  }

  /**
   * Get all metadata field priorities
   */
  async getAllMetadataFieldPriorities(): Promise<MetadataFieldPriority[]> {
    const rows = await this.db.query<{
      id: number;
      field_name: string;
      provider_order: string;
      forced_provider?: string;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT * FROM metadata_field_priorities ORDER BY field_name ASC`
    );

    return rows.map(row => {
      const priority: MetadataFieldPriority = {
        id: row.id,
        fieldName: row.field_name,
        providerOrder: JSON.parse(row.provider_order),
        created_at: new Date(row.created_at),
        updated_at: new Date(row.updated_at)
      };

      if (row.forced_provider) {
        priority.forcedProvider = row.forced_provider;
      }

      return priority;
    });
  }

  /**
   * Get priority for a specific metadata field
   */
  async getMetadataFieldPriority(fieldName: string): Promise<MetadataFieldPriority | null> {
    const rows = await this.db.query<{
      id: number;
      field_name: string;
      provider_order: string;
      forced_provider?: string;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT * FROM metadata_field_priorities WHERE field_name = ?`,
      [fieldName]
    );

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];
    const priority: MetadataFieldPriority = {
      id: row.id,
      fieldName: row.field_name,
      providerOrder: JSON.parse(row.provider_order),
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at)
    };

    if (row.forced_provider) {
      priority.forcedProvider = row.forced_provider;
    }

    return priority;
  }

  /**
   * Update or create metadata field priority
   */
  async upsertMetadataFieldPriority(data: UpdateMetadataFieldPriorityRequest): Promise<MetadataFieldPriority> {
    // Check if this is a forced field
    if (FORCED_LOCAL_FIELDS.includes(data.fieldName as any)) {
      throw new ValidationError(
        `Field '${data.fieldName}' is forced to use Local provider and cannot be changed`,
        { metadata: { fieldName: data.fieldName } }
      );
    }

    const existing = await this.getMetadataFieldPriority(data.fieldName);

    if (existing) {
      await this.db.execute(
        `UPDATE metadata_field_priorities
         SET provider_order = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE field_name = ?`,
        [JSON.stringify(data.providerOrder), data.fieldName]
      );

      logger.info(`Updated metadata field priority: ${data.fieldName}`);
    } else {
      await this.db.execute(
        `INSERT INTO metadata_field_priorities (field_name, provider_order)
         VALUES (?, ?)`,
        [data.fieldName, JSON.stringify(data.providerOrder)]
      );

      logger.info(`Created metadata field priority: ${data.fieldName}`);
    }

    // Mark preset as custom since user manually changed a priority
    await this.setActivePreset('custom');

    const updated = await this.getMetadataFieldPriority(data.fieldName);
    if (!updated) {
      throw new InvalidStateError(
        'metadata field priority exists',
        'metadata field priority not found',
        `Failed to retrieve metadata field priority after upsert: ${data.fieldName}`,
        { metadata: { fieldName: data.fieldName } }
      );
    }

    return updated;
  }

  /**
   * Get the currently active preset
   */
  async getActivePreset(): Promise<PriorityPresetSelection | null> {
    const rows = await this.db.query<{
      id: number;
      preset_id: string;
      is_active: number;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT * FROM priority_presets WHERE is_active = 1 LIMIT 1`
    );

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];
    return {
      id: row.id,
      presetId: row.preset_id,
      isActive: Boolean(row.is_active),
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at)
    };
  }

  /**
   * Set the active preset and apply its priorities
   */
  async setActivePreset(presetId: string): Promise<void> {
    // Validate preset exists (or is 'custom')
    if (presetId !== 'custom') {
      const preset = getPriorityPreset(presetId);
      if (!preset) {
        throw new ResourceNotFoundError(
          'priority preset',
          presetId,
          `Unknown preset: ${presetId}`
        );
      }
    }

    // Deactivate all presets
    await this.db.execute(`UPDATE priority_presets SET is_active = 0`);

    // Activate or create the selected preset
    const existing = await this.db.query<{ id: number }>(
      `SELECT id FROM priority_presets WHERE preset_id = ?`,
      [presetId]
    );

    if (existing.length > 0) {
      await this.db.execute(
        `UPDATE priority_presets SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE preset_id = ?`,
        [presetId]
      );
    } else {
      await this.db.execute(
        `INSERT INTO priority_presets (preset_id, is_active) VALUES (?, 1)`,
        [presetId]
      );
    }

    logger.info(`Set active preset: ${presetId}`);
  }

  /**
   * Apply a preset's priorities to the database
   */
  async applyPreset(presetId: string): Promise<void> {
    const preset = getPriorityPreset(presetId);
    if (!preset) {
      throw new ResourceNotFoundError(
        'priority preset',
        presetId,
        `Unknown preset: ${presetId}`
      );
    }

    logger.info(`Applying preset: ${presetId}`);

    // Clear existing priorities
    await this.db.execute(`DELETE FROM asset_type_priorities`);
    await this.db.execute(`DELETE FROM metadata_field_priorities WHERE forced_provider IS NULL`);

    // Apply asset type priorities
    for (const [assetType, providerOrder] of Object.entries(preset.assetTypePriorities)) {
      await this.db.execute(
        `INSERT INTO asset_type_priorities (asset_type, provider_order) VALUES (?, ?)`,
        [assetType, JSON.stringify(providerOrder)]
      );
    }

    // Apply metadata field priorities
    for (const [fieldName, providerOrder] of Object.entries(preset.metadataFieldPriorities)) {
      // Don't override forced fields
      if (!FORCED_LOCAL_FIELDS.includes(fieldName as any)) {
        await this.db.execute(
          `INSERT INTO metadata_field_priorities (field_name, provider_order) VALUES (?, ?)`,
          [fieldName, JSON.stringify(providerOrder)]
        );
      }
    }

    // Set as active preset
    await this.setActivePreset(presetId);

    logger.info(`Successfully applied preset: ${presetId}`);
  }

  /**
   * Get all available presets
   */
  getAvailablePresets(): PriorityPreset[] {
    return getAllPriorityPresets();
  }

  /**
   * Get the provider order for a specific asset type
   * Returns the configured order, or a default fallback if not configured
   */
  async getProviderOrderForAssetType(assetType: string): Promise<string[]> {
    const priority = await this.getAssetTypePriority(assetType);
    if (priority) {
      return priority.providerOrder;
    }

    // Fallback: try to get from active preset
    const activePreset = await this.getActivePreset();
    if (activePreset && activePreset.presetId !== 'custom') {
      const preset = getPriorityPreset(activePreset.presetId);
      if (preset && preset.assetTypePriorities[assetType]) {
        return preset.assetTypePriorities[assetType];
      }
    }

    // Final fallback: all providers in alphabetical order
    return ['fanart_tv', 'local', 'theaudiodb', 'tmdb', 'tvdb'];
  }

  /**
   * Get the provider order for a specific metadata field
   * Returns the configured order, or a default fallback if not configured
   */
  async getProviderOrderForField(fieldName: string): Promise<string[]> {
    const priority = await this.getMetadataFieldPriority(fieldName);
    if (priority) {
      return priority.providerOrder;
    }

    // Fallback: try to get from active preset
    const activePreset = await this.getActivePreset();
    if (activePreset && activePreset.presetId !== 'custom') {
      const preset = getPriorityPreset(activePreset.presetId);
      if (preset && preset.metadataFieldPriorities[fieldName]) {
        return preset.metadataFieldPriorities[fieldName];
      }
    }

    // Final fallback: all providers in alphabetical order
    return ['imdb', 'local', 'musicbrainz', 'tmdb', 'tvdb'];
  }
}
