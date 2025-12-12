/**
 * Provider Assets Repository
 *
 * Database operations for the provider_assets table.
 * Manages the master catalog of all assets discovered from providers during enrichment.
 */

import { DatabaseConnection, SqlParam } from '../../types/database.js';
import { logger } from '../../middleware/logging.js';
import { getErrorMessage } from '../../utils/errorHandling.js';

export interface ProviderAsset {
  id: number;
  entity_type: string;
  entity_id: number;
  asset_type: string;
  provider_name: string;
  provider_url: string;
  provider_metadata: string | null;
  analyzed: number;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  content_hash: string | null;
  perceptual_hash: string | null;
  mime_type: string | null;
  file_size: number | null;
  score: number | null;
  is_selected: number;
  is_rejected: number;
  is_downloaded: number;
  fetched_at: string;
  analyzed_at: string | null;
  selected_at: string | null;
  selected_by: string | null;
}

export interface CreateProviderAssetParams {
  entity_type: string;
  entity_id: number;
  asset_type: string;
  provider_name: string;
  provider_url: string;
  provider_metadata?: string | undefined;
  width?: number | undefined;
  height?: number | undefined;
}

export interface UpdateProviderAssetParams {
  provider_metadata?: string | undefined;
  width?: number | undefined;
  height?: number | undefined;
  analyzed?: number | undefined;
  duration_seconds?: number | undefined;
  content_hash?: string | undefined;
  perceptual_hash?: string | undefined;
  difference_hash?: string | undefined;
  mime_type?: string | undefined;
  file_size?: number | undefined;
  score?: number | undefined;
  is_selected?: number | undefined;
  is_rejected?: number | undefined;
  is_downloaded?: number | undefined;
  analyzed_at?: Date | undefined;
  selected_at?: Date | undefined;
  selected_by?: string | undefined;
}

export class ProviderAssetsRepository {
  constructor(private readonly db: DatabaseConnection) {}

  /**
   * Find provider asset by URL
   */
  async findByUrl(
    url: string,
    entityId: number,
    entityType: string
  ): Promise<ProviderAsset | null> {
    try {
      const result = await this.db.get<ProviderAsset>(
        `SELECT * FROM provider_assets
         WHERE provider_url = ? AND entity_id = ? AND entity_type = ?`,
        [url, entityId, entityType]
      );
      return result || null;
    } catch (error) {
      logger.error('[ProviderAssetsRepository] Failed to find by URL', {
        url,
        entityId,
        entityType,
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  /**
   * Find provider asset by content hash
   */
  async findByContentHash(hash: string): Promise<ProviderAsset | null> {
    try {
      const result = await this.db.get<ProviderAsset>(
        `SELECT * FROM provider_assets WHERE content_hash = ? LIMIT 1`,
        [hash]
      );
      return result || null;
    } catch (error) {
      logger.error('[ProviderAssetsRepository] Failed to find by content hash', {
        hash: hash.substring(0, 8),
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  /**
   * Find all provider assets by asset type (for perceptual hash matching)
   */
  async findByAssetType(
    entityId: number,
    entityType: string,
    assetType: string
  ): Promise<ProviderAsset[]> {
    try {
      const results = await this.db.query<ProviderAsset>(
        `SELECT * FROM provider_assets
         WHERE entity_id = ? AND entity_type = ? AND asset_type = ?`,
        [entityId, entityType, assetType]
      );
      return results;
    } catch (error) {
      logger.error('[ProviderAssetsRepository] Failed to find by asset type', {
        entityId,
        entityType,
        assetType,
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  /**
   * Find all unanalyzed assets for an entity
   */
  async findUnanalyzed(entityId: number, entityType: string): Promise<ProviderAsset[]> {
    try {
      const results = await this.db.query<ProviderAsset>(
        `SELECT * FROM provider_assets
         WHERE entity_id = ? AND entity_type = ? AND analyzed = 0
         ORDER BY asset_type, provider_name`,
        [entityId, entityType]
      );
      return results;
    } catch (error) {
      logger.error('[ProviderAssetsRepository] Failed to find unanalyzed assets', {
        entityId,
        entityType,
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  /**
   * Find all analyzed assets for an entity
   */
  async findAnalyzed(entityId: number, entityType: string): Promise<ProviderAsset[]> {
    try {
      const results = await this.db.query<ProviderAsset>(
        `SELECT * FROM provider_assets
         WHERE entity_id = ? AND entity_type = ? AND analyzed = 1
         ORDER BY asset_type, score DESC`,
        [entityId, entityType]
      );
      return results;
    } catch (error) {
      logger.error('[ProviderAssetsRepository] Failed to find analyzed assets', {
        entityId,
        entityType,
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  /**
   * Find top N assets by score for a specific asset type
   */
  async findTopN(
    entityId: number,
    entityType: string,
    assetType: string,
    limit: number
  ): Promise<ProviderAsset[]> {
    try {
      const results = await this.db.query<ProviderAsset>(
        `SELECT * FROM provider_assets
         WHERE entity_id = ? AND entity_type = ? AND asset_type = ?
           AND is_rejected = 0
         ORDER BY score DESC, id ASC
         LIMIT ?`,
        [entityId, entityType, assetType, limit]
      );
      return results;
    } catch (error) {
      logger.error('[ProviderAssetsRepository] Failed to find top N assets', {
        entityId,
        entityType,
        assetType,
        limit,
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  /**
   * Create a new provider asset
   */
  async create(params: CreateProviderAssetParams): Promise<number> {
    try {
      const result = await this.db.execute(
        `INSERT INTO provider_assets (
          entity_type, entity_id, asset_type, provider_name, provider_url,
          provider_metadata, width, height, analyzed, is_selected, is_rejected, is_downloaded
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0)`,
        [
          params.entity_type,
          params.entity_id,
          params.asset_type,
          params.provider_name,
          params.provider_url,
          params.provider_metadata || null,
          params.width || null,
          params.height || null,
        ]
      );
      return result.insertId || (result as any).lastInsertRowid || 0;
    } catch (error) {
      logger.error('[ProviderAssetsRepository] Failed to create provider asset', {
        params,
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  /**
   * Update provider asset by ID
   */
  async update(id: number, params: UpdateProviderAssetParams): Promise<void> {
    try {
      const updates: string[] = [];
      const values: unknown[] = [];

      if (params.provider_metadata !== undefined) {
        updates.push('provider_metadata = ?');
        values.push(params.provider_metadata);
      }
      if (params.width !== undefined) {
        updates.push('width = ?');
        values.push(params.width);
      }
      if (params.height !== undefined) {
        updates.push('height = ?');
        values.push(params.height);
      }
      if (params.analyzed !== undefined) {
        updates.push('analyzed = ?');
        values.push(params.analyzed);
      }
      if (params.duration_seconds !== undefined) {
        updates.push('duration_seconds = ?');
        values.push(params.duration_seconds);
      }
      if (params.content_hash !== undefined) {
        updates.push('content_hash = ?');
        values.push(params.content_hash);
      }
      if (params.perceptual_hash !== undefined) {
        updates.push('perceptual_hash = ?');
        values.push(params.perceptual_hash);
      }
      if (params.mime_type !== undefined) {
        updates.push('mime_type = ?');
        values.push(params.mime_type);
      }
      if (params.file_size !== undefined) {
        updates.push('file_size = ?');
        values.push(params.file_size);
      }
      if (params.score !== undefined) {
        updates.push('score = ?');
        values.push(params.score);
      }
      if (params.is_selected !== undefined) {
        updates.push('is_selected = ?');
        values.push(params.is_selected);
      }
      if (params.is_downloaded !== undefined) {
        updates.push('is_downloaded = ?');
        values.push(params.is_downloaded);
      }
      if (params.analyzed_at !== undefined) {
        updates.push('analyzed_at = ?');
        values.push(params.analyzed_at.toISOString());
      }
      if (params.selected_at !== undefined) {
        updates.push('selected_at = ?');
        values.push(params.selected_at.toISOString());
      }
      if (params.selected_by !== undefined) {
        updates.push('selected_by = ?');
        values.push(params.selected_by);
      }

      if (updates.length === 0) {
        logger.warn('[ProviderAssetsRepository] No fields to update', { id });
        return;
      }

      values.push(id);

      await this.db.execute(
        `UPDATE provider_assets SET ${updates.join(', ')} WHERE id = ?`,
        values as SqlParam[]
      );
    } catch (error) {
      logger.error('[ProviderAssetsRepository] Failed to update provider asset', {
        id,
        params,
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  /**
   * Deselect all assets of a specific type for an entity
   */
  async deselectAssetType(
    entityId: number,
    entityType: string,
    assetType: string
  ): Promise<void> {
    try {
      await this.db.execute(
        `UPDATE provider_assets
         SET is_selected = 0, selected_at = NULL, selected_by = NULL
         WHERE entity_id = ? AND entity_type = ? AND asset_type = ?`,
        [entityId, entityType, assetType]
      );
    } catch (error) {
      logger.error('[ProviderAssetsRepository] Failed to deselect asset type', {
        entityId,
        entityType,
        assetType,
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  /**
   * Deselect assets NOT in the provided list of IDs
   */
  async deselectExcept(
    entityId: number,
    entityType: string,
    assetType: string,
    keepIds: number[]
  ): Promise<void> {
    try {
      if (keepIds.length === 0) {
        // Deselect all if no IDs to keep
        await this.deselectAssetType(entityId, entityType, assetType);
        return;
      }

      const placeholders = keepIds.map(() => '?').join(',');
      await this.db.execute(
        `UPDATE provider_assets
         SET is_selected = 0, selected_at = NULL, selected_by = NULL
         WHERE entity_id = ? AND entity_type = ? AND asset_type = ?
           AND id NOT IN (${placeholders})`,
        [entityId, entityType, assetType, ...keepIds]
      );
    } catch (error) {
      logger.error('[ProviderAssetsRepository] Failed to deselect except', {
        entityId,
        entityType,
        assetType,
        keepIds,
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  /**
   * Count total provider assets for an entity
   */
  async countByEntity(entityId: number, entityType: string): Promise<number> {
    try {
      const result = await this.db.get<{ count: number }>(
        `SELECT COUNT(*) as count FROM provider_assets
         WHERE entity_id = ? AND entity_type = ?`,
        [entityId, entityType]
      );
      return result?.count || 0;
    } catch (error) {
      logger.error('[ProviderAssetsRepository] Failed to count by entity', {
        entityId,
        entityType,
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  /**
   * Count selected assets by type
   */
  async countSelectedByType(
    entityId: number,
    entityType: string,
    assetType: string
  ): Promise<number> {
    try {
      const result = await this.db.get<{ count: number }>(
        `SELECT COUNT(*) as count FROM provider_assets
         WHERE entity_id = ? AND entity_type = ? AND asset_type = ? AND is_selected = 1`,
        [entityId, entityType, assetType]
      );
      return result?.count || 0;
    } catch (error) {
      logger.error('[ProviderAssetsRepository] Failed to count selected by type', {
        entityId,
        entityType,
        assetType,
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  /**
   * Upsert provider assets (INSERT or UPDATE on conflict)
   * Atomic operation to replace all assets for an entity+assetType
   *
   * Used by MovieProviderController to save fresh provider results.
   * Implements the unified cache strategy from UNIFIED_ASSET_CACHE.md
   *
   * @param entityId - Entity ID
   * @param entityType - Entity type ('movie', 'tv', etc.)
   * @param assetType - Asset type ('poster', 'fanart', etc.)
   * @param assets - Array of assets to upsert
   * @returns Number of assets upserted
   */
  async upsertBatch(
    entityId: number,
    entityType: string,
    assetType: string,
    assets: CreateProviderAssetParams[]
  ): Promise<number> {
    try {
      // Smart upsert: preserve analyzed data for existing assets
      // DELETE-and-INSERT would reset analyzed flag, forcing re-download

      let upsertedCount = 0;

      for (const asset of assets) {
        // Check if asset already exists (by URL)
        const existing = await this.db.get<{
          id: number;
          analyzed: number;
          content_hash: string | null;
          perceptual_hash: string | null;
          width: number | null;
          height: number | null;
          file_size: number | null;
          mime_type: string | null;
          is_downloaded: number;
          analyzed_at: string | null;
        }>(
          `SELECT id, analyzed, content_hash, perceptual_hash, width, height,
                  file_size, mime_type, is_downloaded, analyzed_at
           FROM provider_assets
           WHERE entity_id = ? AND entity_type = ? AND provider_url = ?`,
          [entityId, entityType, asset.provider_url]
        );

        if (existing && existing.analyzed === 1) {
          // Asset exists and has been analyzed - preserve analysis data
          await this.db.execute(
            `UPDATE provider_assets
             SET provider_metadata = ?, fetched_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [asset.provider_metadata || null, existing.id]
          );
          upsertedCount++;
        } else if (existing) {
          // Asset exists but not analyzed - update metadata
          await this.db.execute(
            `UPDATE provider_assets
             SET provider_metadata = ?, width = ?, height = ?, fetched_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [
              asset.provider_metadata || null,
              asset.width || null,
              asset.height || null,
              existing.id
            ]
          );
          upsertedCount++;
        } else {
          // New asset - insert
          await this.create(asset);
          upsertedCount++;
        }
      }

      // Delete assets that are no longer in the provider response
      const existingUrls = assets.map(a => a.provider_url);
      if (existingUrls.length > 0) {
        const placeholders = existingUrls.map(() => '?').join(',');
        await this.db.execute(
          `DELETE FROM provider_assets
           WHERE entity_id = ? AND entity_type = ? AND asset_type = ?
             AND provider_url NOT IN (${placeholders})`,
          [entityId, entityType, assetType, ...existingUrls]
        );
      }

      logger.info('[ProviderAssetsRepository] Upserted provider assets', {
        entityId,
        entityType,
        assetType,
        count: upsertedCount,
      });

      return upsertedCount;
    } catch (error) {
      logger.error('[ProviderAssetsRepository] Failed to upsert batch', {
        entityId,
        entityType,
        assetType,
        assetCount: assets.length,
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  /**
   * Check cache freshness (7-day rule from UNIFIED_ASSET_CACHE.md)
   *
   * @param entityId - Entity ID
   * @param entityType - Entity type
   * @param maxAgeDays - Maximum age in days (default: 7)
   * @returns True if cache is stale or missing
   */
  async isCacheStale(
    entityId: number,
    entityType: string,
    maxAgeDays: number = 7
  ): Promise<boolean> {
    try {
      const result = await this.db.get<{ oldest_fetch: string | null }>(
        `SELECT MIN(fetched_at) as oldest_fetch
         FROM provider_assets
         WHERE entity_id = ? AND entity_type = ?`,
        [entityId, entityType]
      );

      if (!result || !result.oldest_fetch) {
        return true; // No cache = stale
      }

      const fetchedAt = new Date(result.oldest_fetch);
      const ageMs = Date.now() - fetchedAt.getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);

      return ageDays > maxAgeDays;
    } catch (error) {
      logger.warn('[ProviderAssetsRepository] Failed to check cache staleness, assuming stale', {
        entityId,
        entityType,
        error: getErrorMessage(error),
      });
      return true; // On error, assume stale to trigger refresh
    }
  }

  /**
   * Clear all provider assets for an entity
   *
   * @param entityId - Entity ID
   * @param entityType - Entity type
   * @returns Number of assets deleted
   */
  async clearEntity(entityId: number, entityType: string): Promise<number> {
    try {
      const result = await this.db.execute(
        `DELETE FROM provider_assets
         WHERE entity_id = ? AND entity_type = ?`,
        [entityId, entityType]
      );

      logger.info('[ProviderAssetsRepository] Cleared provider assets for entity', {
        entityId,
        entityType,
        deletedCount: result.affectedRows || 0,
      });

      return result.affectedRows || 0;
    } catch (error) {
      logger.error('[ProviderAssetsRepository] Failed to clear entity', {
        entityId,
        entityType,
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  /**
   * Get all provider assets for an entity grouped by asset type
   *
   * @param entityId - Entity ID
   * @param entityType - Entity type
   * @returns Array of all provider assets
   */
  async findAllByEntity(entityId: number, entityType: string): Promise<ProviderAsset[]> {
    try {
      const results = await this.db.query<ProviderAsset>(
        `SELECT * FROM provider_assets
         WHERE entity_id = ? AND entity_type = ?
         ORDER BY asset_type, score DESC NULLS LAST, id ASC`,
        [entityId, entityType]
      );
      return results;
    } catch (error) {
      logger.error('[ProviderAssetsRepository] Failed to find all by entity', {
        entityId,
        entityType,
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  /**
   * Get provider assets for a specific entity and asset type
   *
   * @param entityId - Entity ID
   * @param entityType - Entity type
   * @param assetType - Asset type
   * @returns Array of provider assets for this type
   */
  async findByType(
    entityId: number,
    entityType: string,
    assetType: string
  ): Promise<ProviderAsset[]> {
    try {
      const results = await this.db.query<ProviderAsset>(
        `SELECT * FROM provider_assets
         WHERE entity_id = ? AND entity_type = ? AND asset_type = ?
         ORDER BY score DESC NULLS LAST, id ASC`,
        [entityId, entityType, assetType]
      );
      return results;
    } catch (error) {
      logger.error('[ProviderAssetsRepository] Failed to find by type', {
        entityId,
        entityType,
        assetType,
        error: getErrorMessage(error),
      });
      throw error;
    }
  }
}
