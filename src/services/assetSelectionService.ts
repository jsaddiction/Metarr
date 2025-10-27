import { DatabaseConnection } from '../types/database.js';
import { logger } from '../middleware/logging.js';

/**
 * Asset Selection Service
 *
 * Manages asset selection from candidates for entities (movies, series, episodes).
 * Supports three modes:
 * 1. Manual: User explicitly selects assets
 * 2. YOLO: Automatic selection based on auto_score (highest score wins)
 * 3. Hybrid: Automatic selection but requires user approval before publishing
 *
 * Selection process:
 * - Mark asset as selected (is_selected = 1)
 * - Lock asset type on entity (e.g., poster_locked = 1)
 * - Set selected_by (user ID or 'auto')
 * - Set selected_at timestamp
 * - Trigger publishing job if auto-publish is enabled
 */

export interface SelectionConfig {
  entityType: 'movie' | 'series' | 'episode';
  entityId: number;
  assetType: string;
  mode: 'manual' | 'yolo' | 'hybrid';
  userId?: string;
}

export interface SelectionResult {
  selected: boolean;
  candidateId?: number;
  reason?: string;
}

export class AssetSelectionService {
  private db: DatabaseConnection;

  constructor(db: DatabaseConnection) {
    this.db = db;
  }

  /**
   * Select an asset manually by candidate ID
   */
  async selectAssetManually(
    candidateId: number,
    userId: string
  ): Promise<SelectionResult> {
    try {
      // Get candidate details
      const candidate = await this.db.query<{
        entity_type: string;
        entity_id: number;
        asset_type: string;
        is_selected: number;
      }>(
        `SELECT entity_type, entity_id, asset_type, is_selected
         FROM asset_candidates WHERE id = ?`,
        [candidateId]
      );

      if (candidate.length === 0) {
        return { selected: false, reason: 'Candidate not found' };
      }

      const asset = candidate[0];

      // Deselect any previously selected assets of this type for this entity
      await this.deselectAssetType(
        asset.entity_type,
        asset.entity_id,
        asset.asset_type
      );

      // Mark this candidate as selected
      await this.db.execute(
        `UPDATE asset_candidates
         SET is_selected = 1, selected_by = ?, selected_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [userId, candidateId]
      );

      // Lock the asset type on the entity
      await this.lockAssetType(asset.entity_type, asset.entity_id, asset.asset_type);

      logger.info(`Asset selected manually: ${asset.asset_type} for ${asset.entity_type} ${asset.entity_id}`, {
        candidateId,
        userId
      });

      return { selected: true, candidateId };

    } catch (error) {
      logger.error('Error selecting asset manually:', error);
      return { selected: false, reason: 'Database error' };
    }
  }

  /**
   * Select asset automatically (YOLO mode) - highest auto_score wins
   */
  async selectAssetYOLO(config: SelectionConfig): Promise<SelectionResult> {
    try {
      // Check if asset type is locked (automated processes must respect locks)
      const isLocked = await this.isAssetTypeLocked(
        config.entityType,
        config.entityId,
        config.assetType
      );

      if (isLocked) {
        logger.info(`Asset type ${config.assetType} is locked, skipping auto-selection`, {
          entityType: config.entityType,
          entityId: config.entityId,
          assetType: config.assetType
        });
        return { selected: false, reason: 'Asset type locked by user' };
      }

      // Find highest scored candidate
      const candidates = await this.db.query<{
        id: number;
        auto_score: number | null;
      }>(
        `SELECT id, auto_score FROM asset_candidates
         WHERE entity_type = ? AND entity_id = ? AND asset_type = ?
         AND is_rejected = 0
         ORDER BY auto_score DESC, id ASC
         LIMIT 1`,
        [config.entityType, config.entityId, config.assetType]
      );

      if (candidates.length === 0) {
        return { selected: false, reason: 'No candidates available' };
      }

      const bestCandidate = candidates[0];

      // Deselect any previously selected assets of this type
      await this.deselectAssetType(
        config.entityType,
        config.entityId,
        config.assetType
      );

      // Mark as selected
      await this.db.execute(
        `UPDATE asset_candidates
         SET is_selected = 1, selected_by = 'auto', selected_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [bestCandidate.id]
      );

      // Lock the asset type
      await this.lockAssetType(config.entityType, config.entityId, config.assetType);

      logger.info(`Asset selected automatically (YOLO): ${config.assetType} for ${config.entityType} ${config.entityId}`, {
        candidateId: bestCandidate.id,
        autoScore: bestCandidate.auto_score
      });

      return { selected: true, candidateId: bestCandidate.id };

    } catch (error) {
      logger.error('Error selecting asset in YOLO mode:', error);
      return { selected: false, reason: 'Database error' };
    }
  }

  /**
   * Select asset automatically but mark for user approval (Hybrid mode)
   */
  async selectAssetHybrid(config: SelectionConfig): Promise<SelectionResult> {
    try {
      // Same logic as YOLO but entity stays in 'selected' state (not published)
      // User must approve before publishing
      const result = await this.selectAssetYOLO(config);

      if (result.selected) {
        // Update selected_by to indicate hybrid mode
        await this.db.execute(
          `UPDATE asset_candidates
           SET selected_by = 'auto-pending-approval'
           WHERE id = ?`,
          [result.candidateId]
        );

        logger.info(`Asset selected for approval (Hybrid): ${config.assetType} for ${config.entityType} ${config.entityId}`, {
          candidateId: result.candidateId
        });
      }

      return result;

    } catch (error) {
      logger.error('Error selecting asset in Hybrid mode:', error);
      return { selected: false, reason: 'Database error' };
    }
  }

  /**
   * Approve a hybrid selection (user approves auto-selected asset)
   */
  async approveHybridSelection(candidateId: number, userId: string): Promise<SelectionResult> {
    try {
      // Update selected_by from 'auto-pending-approval' to userId
      const result = await this.db.execute(
        `UPDATE asset_candidates
         SET selected_by = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND selected_by = 'auto-pending-approval'`,
        [userId, candidateId]
      );

      if (result.affectedRows === 0) {
        return { selected: false, reason: 'Candidate not found or not pending approval' };
      }

      logger.info(`Hybrid selection approved by user`, { candidateId, userId });

      return { selected: true, candidateId };

    } catch (error) {
      logger.error('Error approving hybrid selection:', error);
      return { selected: false, reason: 'Database error' };
    }
  }

  /**
   * Reject a hybrid selection (user rejects auto-selected asset)
   */
  async rejectHybridSelection(candidateId: number, userId: string): Promise<boolean> {
    try {
      // Deselect the candidate
      await this.db.execute(
        `UPDATE asset_candidates
         SET is_selected = 0, selected_by = NULL, selected_at = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND selected_by = 'auto-pending-approval'`,
        [candidateId]
      );

      logger.info(`Hybrid selection rejected by user`, { candidateId, userId });

      return true;

    } catch (error) {
      logger.error('Error rejecting hybrid selection:', error);
      return false;
    }
  }

  /**
   * Reject an asset candidate (never select this asset)
   */
  async rejectAsset(candidateId: number, userId: string, reason?: string): Promise<boolean> {
    try {
      await this.db.execute(
        `UPDATE asset_candidates
         SET is_rejected = 1, is_selected = 0, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [candidateId]
      );

      // Add to rejected_assets table
      const candidate = await this.db.query<{
        entity_type: string;
        entity_id: number;
        asset_type: string;
        provider_url: string;
      }>(
        `SELECT entity_type, entity_id, asset_type, provider_url
         FROM asset_candidates WHERE id = ?`,
        [candidateId]
      );

      if (candidate.length > 0) {
        const asset = candidate[0];
        await this.db.execute(
          `INSERT OR IGNORE INTO rejected_assets
           (entity_type, entity_id, asset_type, file_path, rejected_by, rejected_at, reason)
           VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`,
          [asset.entity_type, asset.entity_id, asset.asset_type, asset.provider_url, userId, reason]
        );
      }

      logger.info(`Asset rejected`, { candidateId, userId, reason });

      return true;

    } catch (error) {
      logger.error('Error rejecting asset:', error);
      return false;
    }
  }

  /**
   * Unlock an asset type (allow re-selection)
   */
  async unlockAssetType(entityType: string, entityId: number, assetType: string): Promise<boolean> {
    try {
      const lockColumn = this.getAssetLockColumn(assetType);
      if (!lockColumn) {
        return false;
      }

      const table = this.getTableName(entityType);
      if (!table) {
        return false;
      }

      // Unlock the asset type
      await this.db.execute(
        `UPDATE ${table} SET ${lockColumn} = 0 WHERE id = ?`,
        [entityId]
      );

      // Deselect all candidates of this type
      await this.deselectAssetType(entityType, entityId, assetType);

      logger.info(`Asset type unlocked: ${assetType} for ${entityType} ${entityId}`);

      return true;

    } catch (error) {
      logger.error('Error unlocking asset type:', error);
      return false;
    }
  }

  /**
   * Get all selected assets for an entity
   */
  async getSelectedAssets(entityType: string, entityId: number): Promise<Array<{
    id: number;
    asset_type: string;
    provider: string;
    provider_url: string;
    content_hash: string | null;
    selected_by: string;
    selected_at: string;
  }>> {
    return this.db.query(
      `SELECT id, asset_type, provider, provider_url, content_hash, selected_by, selected_at
       FROM asset_candidates
       WHERE entity_type = ? AND entity_id = ? AND is_selected = 1
       ORDER BY asset_type`,
      [entityType, entityId]
    );
  }

  /**
   * Get all candidates for an entity (for UI display)
   */
  async getCandidates(entityType: string, entityId: number, assetType?: string): Promise<Array<{
    id: number;
    asset_type: string;
    provider: string;
    provider_url: string;
    width: number | null;
    height: number | null;
    is_selected: number;
    is_rejected: number;
    auto_score: number | null;
    selected_by: string | null;
    selected_at: string | null;
  }>> {
    const sql = assetType
      ? `SELECT id, asset_type, provider, provider_url, width, height, is_selected, is_rejected, auto_score, selected_by, selected_at
         FROM asset_candidates
         WHERE entity_type = ? AND entity_id = ? AND asset_type = ?
         ORDER BY auto_score DESC, id ASC`
      : `SELECT id, asset_type, provider, provider_url, width, height, is_selected, is_rejected, auto_score, selected_by, selected_at
         FROM asset_candidates
         WHERE entity_type = ? AND entity_id = ?
         ORDER BY asset_type, auto_score DESC, id ASC`;

    const params = assetType
      ? [entityType, entityId, assetType]
      : [entityType, entityId];

    return this.db.query(sql, params);
  }

  // ============================================
  // Private Helper Methods
  // ============================================

  /**
   * Deselect all assets of a type for an entity
   */
  private async deselectAssetType(
    entityType: string,
    entityId: number,
    assetType: string
  ): Promise<void> {
    await this.db.execute(
      `UPDATE asset_candidates
       SET is_selected = 0, selected_by = NULL, selected_at = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE entity_type = ? AND entity_id = ? AND asset_type = ? AND is_selected = 1`,
      [entityType, entityId, assetType]
    );
  }

  /**
   * Check if an asset type is locked on an entity
   */
  private async isAssetTypeLocked(
    entityType: string,
    entityId: number,
    assetType: string
  ): Promise<boolean> {
    const lockColumn = this.getAssetLockColumn(assetType);
    if (!lockColumn) {
      return false; // No lock column means not lockable
    }

    const table = this.getTableName(entityType);
    if (!table) {
      return false; // No table means not lockable
    }

    const result = await this.db.query<{ locked: number }>(
      `SELECT ${lockColumn} as locked FROM ${table} WHERE id = ?`,
      [entityId]
    );

    return result.length > 0 && result[0].locked === 1;
  }

  /**
   * Lock an asset type on an entity
   */
  private async lockAssetType(
    entityType: string,
    entityId: number,
    assetType: string
  ): Promise<void> {
    const lockColumn = this.getAssetLockColumn(assetType);
    if (!lockColumn) {
      logger.warn(`No lock column for asset type: ${assetType}`);
      return;
    }

    const table = this.getTableName(entityType);
    if (!table) {
      logger.warn(`No table for entity type: ${entityType}`);
      return;
    }

    await this.db.execute(
      `UPDATE ${table} SET ${lockColumn} = 1 WHERE id = ?`,
      [entityId]
    );
  }


  /**
   * Get lock column name for asset type
   */
  private getAssetLockColumn(assetType: string): string | null {
    const mapping: Record<string, string> = {
      poster: 'poster_locked',
      fanart: 'fanart_locked',
      banner: 'banner_locked',
      clearlogo: 'clearlogo_locked',
      clearart: 'clearart_locked',
      discart: 'discart_locked',
      landscape: 'landscape_locked',
      characterart: 'characterart_locked',
      trailer: 'trailer_locked'
    };

    return mapping[assetType] || null;
  }

  /**
   * Get table name for entity type
   */
  private getTableName(entityType: string): string | null {
    const mapping: Record<string, string> = {
      movie: 'movies',
      series: 'series',
      episode: 'episodes'
    };

    return mapping[entityType] || null;
  }
}
