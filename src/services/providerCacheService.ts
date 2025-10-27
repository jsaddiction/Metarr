import { DatabaseManager } from '../database/DatabaseManager.js';
import { logger } from '../middleware/logging.js';
import { getErrorMessage } from '../utils/errorHandling.js';

/**
 * Provider Cache Service
 *
 * Manages caching of asset candidates from metadata providers (TMDB, Fanart.tv, TVDB).
 * Implements cache-aside pattern:
 * - Read from cache for instant browsing
 * - Write to cache after provider fetches
 * - Cache persists until manually refreshed or weekly scheduled update
 *
 * Used by:
 * - User-initiated provider fetches (MovieController.getProviderResults)
 * - Scheduled weekly enrichment jobs (scheduledProviderUpdateHandler)
 * - Asset browsing UI (MovieController.getAssetCandidates)
 */

export interface CachedAssetCandidate {
  id: number;
  entity_id: number;
  entity_type: string;
  asset_type: string;
  url: string;
  width: number | null;
  height: number | null;
  language: string | null;
  provider_name: string;
  provider_score: number | null;
  provider_metadata: string | null; // JSON string
  fetched_at: string; // ISO timestamp
}

export interface AssetCandidateInput {
  url: string;
  width?: number | undefined;
  height?: number | undefined;
  language?: string | undefined;
  provider_name: string;
  provider_score?: number | undefined;
  provider_metadata?: Record<string, unknown> | undefined; // Will be JSON stringified
}

export class ProviderCacheService {
  constructor(private db: DatabaseManager) {}

  /**
   * Get cached asset candidates for browsing
   *
   * Returns all cached candidates for a specific entity and asset type,
   * sorted by provider score (highest first).
   *
   * @param entityId - Entity ID (movie ID, series ID, etc.)
   * @param entityType - Entity type ('movie', 'tv', 'music')
   * @param assetType - Asset type ('poster', 'fanart', 'clearlogo', etc.)
   * @returns Array of cached candidates
   */
  async getCandidates(
    entityId: number,
    entityType: string,
    assetType: string
  ): Promise<CachedAssetCandidate[]> {
    try {
      const conn = this.db.getConnection();

      const candidates = await conn.query<CachedAssetCandidate>(
        `SELECT *
         FROM provider_cache_assets
         WHERE entity_id = ? AND entity_type = ? AND asset_type = ?
         ORDER BY provider_score DESC NULLS LAST, id ASC`,
        [entityId, entityType, assetType]
      );

      logger.debug('Retrieved cached asset candidates', {
        entityId,
        entityType,
        assetType,
        count: candidates.length,
      });

      return candidates;
    } catch (error) {
      logger.error('Failed to get cached asset candidates', {
        entityId,
        entityType,
        assetType,
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  /**
   * Save asset candidates to cache (replaces existing for this entity+type)
   *
   * Atomically deletes old cached candidates and inserts new ones.
   * This ensures cache consistency - either old OR new, never mixed.
   *
   * @param entityId - Entity ID
   * @param entityType - Entity type
   * @param assetType - Asset type
   * @param candidates - Array of asset candidates to cache
   * @returns Number of candidates saved
   */
  async saveCandidates(
    entityId: number,
    entityType: string,
    assetType: string,
    candidates: AssetCandidateInput[]
  ): Promise<number> {
    try {
      const conn = this.db.getConnection();

      // Atomic operation: Delete old + Insert new
      await conn.beginTransaction();
      try {
        // Delete old cached candidates for this entity+type
        await conn.execute(
          `DELETE FROM provider_cache_assets
           WHERE entity_id = ? AND entity_type = ? AND asset_type = ?`,
          [entityId, entityType, assetType]
        );

        // Insert new candidates
        for (const candidate of candidates) {
          await conn.execute(
            `INSERT INTO provider_cache_assets
             (entity_id, entity_type, asset_type, url, width, height, language,
              provider_name, provider_score, provider_metadata)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              entityId,
              entityType,
              assetType,
              candidate.url,
              candidate.width ?? null,
              candidate.height ?? null,
              candidate.language ?? null,
              candidate.provider_name,
              candidate.provider_score ?? null,
              candidate.provider_metadata ? JSON.stringify(candidate.provider_metadata) : null,
            ]
          );
        }

        await conn.commit();
      } catch (error) {
        await conn.rollback();
        throw error;
      }

      logger.info('Saved asset candidates to cache', {
        entityId,
        entityType,
        assetType,
        count: candidates.length,
      });

      return candidates.length;
    } catch (error) {
      logger.error('Failed to save asset candidates to cache', {
        entityId,
        entityType,
        assetType,
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  /**
   * Clear cached candidates for a specific entity and asset type
   *
   * Used when user clicks "Refresh from Providers" to force re-fetch.
   *
   * @param entityId - Entity ID
   * @param entityType - Entity type
   * @param assetType - Asset type (optional - if omitted, clears ALL asset types)
   * @returns Number of candidates deleted
   */
  async clearCandidates(
    entityId: number,
    entityType: string,
    assetType?: string
  ): Promise<number> {
    try {
      const conn = this.db.getConnection();

      let query: string;
      let params: any[];

      if (assetType) {
        // Clear specific asset type
        query = `DELETE FROM provider_cache_assets
                 WHERE entity_id = ? AND entity_type = ? AND asset_type = ?`;
        params = [entityId, entityType, assetType];
      } else {
        // Clear all asset types for this entity
        query = `DELETE FROM provider_cache_assets
                 WHERE entity_id = ? AND entity_type = ?`;
        params = [entityId, entityType];
      }

      const result = await conn.execute(query, params);

      logger.info('Cleared cached asset candidates', {
        entityId,
        entityType,
        assetType: assetType || 'all',
        deletedCount: result.affectedRows || 0,
      });

      return result.affectedRows || 0;
    } catch (error) {
      logger.error('Failed to clear cached asset candidates', {
        entityId,
        entityType,
        assetType,
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  /**
   * Get cache metadata (age, provider sources, count)
   *
   * Useful for UI to show cache freshness indicators.
   *
   * @param entityId - Entity ID
   * @param entityType - Entity type
   * @param assetType - Asset type
   * @returns Cache metadata or null if no cache exists
   */
  async getCacheMetadata(
    entityId: number,
    entityType: string,
    assetType: string
  ): Promise<{
    count: number;
    providers: string[];
    oldestFetchedAt: Date | null;
    newestFetchedAt: Date | null;
  } | null> {
    try {
      const conn = this.db.getConnection();

      const result = await conn.get<{
        count: number;
        providers: string;
        oldest_fetched_at: string | null;
        newest_fetched_at: string | null;
      }>(
        `SELECT
           COUNT(*) as count,
           GROUP_CONCAT(DISTINCT provider_name) as providers,
           MIN(fetched_at) as oldest_fetched_at,
           MAX(fetched_at) as newest_fetched_at
         FROM provider_cache_assets
         WHERE entity_id = ? AND entity_type = ? AND asset_type = ?`,
        [entityId, entityType, assetType]
      );

      if (!result || result.count === 0) {
        return null;
      }

      return {
        count: result.count,
        providers: result.providers ? result.providers.split(',') : [],
        oldestFetchedAt: result.oldest_fetched_at ? new Date(result.oldest_fetched_at) : null,
        newestFetchedAt: result.newest_fetched_at ? new Date(result.newest_fetched_at) : null,
      };
    } catch (error) {
      logger.error('Failed to get cache metadata', {
        entityId,
        entityType,
        assetType,
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  /**
   * Check if cache exists for entity+assetType
   *
   * Quick check to determine if we need to fetch from providers.
   *
   * @param entityId - Entity ID
   * @param entityType - Entity type
   * @param assetType - Asset type
   * @returns true if cache has at least one candidate
   */
  async hasCache(entityId: number, entityType: string, assetType: string): Promise<boolean> {
    try {
      const conn = this.db.getConnection();

      const result = await conn.get<{ exists: number }>(
        `SELECT EXISTS(
           SELECT 1 FROM provider_cache_assets
           WHERE entity_id = ? AND entity_type = ? AND asset_type = ?
           LIMIT 1
         ) as exists`,
        [entityId, entityType, assetType]
      );

      return result?.exists === 1;
    } catch (error) {
      logger.error('Failed to check cache existence', {
        entityId,
        entityType,
        assetType,
        error: getErrorMessage(error),
      });
      return false; // Default to no cache on error
    }
  }

  /**
   * Upsert a single candidate (add if doesn't exist, skip if exists)
   *
   * Used by scheduled jobs that incrementally add new candidates
   * without clearing existing ones.
   *
   * @param entityId - Entity ID
   * @param entityType - Entity type
   * @param assetType - Asset type
   * @param candidate - Asset candidate to upsert
   * @returns true if inserted, false if already existed
   */
  async upsertCandidate(
    entityId: number,
    entityType: string,
    assetType: string,
    candidate: AssetCandidateInput
  ): Promise<boolean> {
    try {
      const conn = this.db.getConnection();

      // Check if candidate already exists (by URL)
      const existing = await conn.get<{ id: number }>(
        `SELECT id FROM provider_cache_assets
         WHERE entity_id = ? AND entity_type = ? AND asset_type = ? AND url = ?`,
        [entityId, entityType, assetType, candidate.url]
      );

      if (existing) {
        // Already exists, skip
        return false;
      }

      // Insert new candidate
      await conn.execute(
        `INSERT INTO provider_cache_assets
         (entity_id, entity_type, asset_type, url, width, height, language,
          provider_name, provider_score, provider_metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entityId,
          entityType,
          assetType,
          candidate.url,
          candidate.width ?? null,
          candidate.height ?? null,
          candidate.language ?? null,
          candidate.provider_name,
          candidate.provider_score ?? null,
          candidate.provider_metadata ? JSON.stringify(candidate.provider_metadata) : null,
        ]
      );

      logger.debug('Upserted asset candidate', {
        entityId,
        entityType,
        assetType,
        provider: candidate.provider_name,
      });

      return true;
    } catch (error) {
      logger.error('Failed to upsert asset candidate', {
        entityId,
        entityType,
        assetType,
        error: getErrorMessage(error),
      });
      throw error;
    }
  }
}
