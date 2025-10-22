import { Request, Response } from 'express';
import { AssetSelectionService } from '../services/assetSelectionService.js';
import { PublishingService } from '../services/publishingService.js';
import { DatabaseConnection } from '../types/database.js';
import { logger } from '../middleware/logging.js';

/**
 * Asset Controller
 *
 * Handles HTTP requests for asset management:
 * - Get asset candidates
 * - Select assets (manual/YOLO/hybrid)
 * - Approve/reject hybrid selections
 * - Reject assets permanently
 * - Unlock asset types
 * - Publish entities
 */

export class AssetController {
  private assetSelection: AssetSelectionService;
  private publishing: PublishingService;

  constructor(db: DatabaseConnection) {
    this.assetSelection = new AssetSelectionService(db);
    this.publishing = new PublishingService(db);
  }

  /**
   * GET /api/assets/candidates/:entityType/:entityId
   * Get all asset candidates for an entity
   */
  getCandidates = async (req: Request, res: Response): Promise<void> => {
    try {
      const { entityType, entityId } = req.params;
      const { assetType } = req.query;

      const candidates = await this.assetSelection.getCandidates(
        entityType,
        parseInt(entityId),
        assetType as string | undefined
      );

      res.json({ candidates });
    } catch (error: any) {
      logger.error('Error getting asset candidates:', error);
      res.status(500).json({ error: error.message });
    }
  };

  /**
   * GET /api/assets/selected/:entityType/:entityId
   * Get selected assets for an entity
   */
  getSelected = async (req: Request, res: Response): Promise<void> => {
    try {
      const { entityType, entityId } = req.params;

      const selected = await this.assetSelection.getSelectedAssets(
        entityType,
        parseInt(entityId)
      );

      res.json({ selected });
    } catch (error: any) {
      logger.error('Error getting selected assets:', error);
      res.status(500).json({ error: error.message });
    }
  };

  /**
   * POST /api/assets/select/manual
   * Manually select an asset
   * Body: { candidateId: number, userId: string }
   */
  selectManual = async (req: Request, res: Response): Promise<void> => {
    try {
      const { candidateId, userId } = req.body;

      if (!candidateId || !userId) {
        res.status(400).json({ error: 'candidateId and userId are required' });
        return;
      }

      const result = await this.assetSelection.selectAssetManually(
        candidateId,
        userId
      );

      if (result.selected) {
        res.json({ success: true, candidateId: result.candidateId });
      } else {
        res.status(400).json({ success: false, reason: result.reason });
      }
    } catch (error: any) {
      logger.error('Error selecting asset manually:', error);
      res.status(500).json({ error: error.message });
    }
  };

  /**
   * POST /api/assets/select/yolo
   * Auto-select asset (YOLO mode)
   * Body: { entityType, entityId, assetType, userId }
   */
  selectYOLO = async (req: Request, res: Response): Promise<void> => {
    try {
      const { entityType, entityId, assetType, userId } = req.body;

      if (!entityType || !entityId || !assetType) {
        res.status(400).json({ error: 'entityType, entityId, and assetType are required' });
        return;
      }

      const result = await this.assetSelection.selectAssetYOLO({
        entityType,
        entityId: parseInt(entityId),
        assetType,
        mode: 'yolo',
        userId
      });

      if (result.selected) {
        res.json({ success: true, candidateId: result.candidateId });
      } else {
        res.status(400).json({ success: false, reason: result.reason });
      }
    } catch (error: any) {
      logger.error('Error selecting asset (YOLO):', error);
      res.status(500).json({ error: error.message });
    }
  };

  /**
   * POST /api/assets/select/hybrid
   * Auto-select asset for approval (Hybrid mode)
   * Body: { entityType, entityId, assetType, userId }
   */
  selectHybrid = async (req: Request, res: Response): Promise<void> => {
    try {
      const { entityType, entityId, assetType, userId } = req.body;

      if (!entityType || !entityId || !assetType) {
        res.status(400).json({ error: 'entityType, entityId, and assetType are required' });
        return;
      }

      const result = await this.assetSelection.selectAssetHybrid({
        entityType,
        entityId: parseInt(entityId),
        assetType,
        mode: 'hybrid',
        userId
      });

      if (result.selected) {
        res.json({ success: true, candidateId: result.candidateId });
      } else {
        res.status(400).json({ success: false, reason: result.reason });
      }
    } catch (error: any) {
      logger.error('Error selecting asset (Hybrid):', error);
      res.status(500).json({ error: error.message });
    }
  };

  /**
   * POST /api/assets/approve
   * Approve a hybrid selection
   * Body: { candidateId: number, userId: string }
   */
  approveHybrid = async (req: Request, res: Response): Promise<void> => {
    try {
      const { candidateId, userId } = req.body;

      if (!candidateId || !userId) {
        res.status(400).json({ error: 'candidateId and userId are required' });
        return;
      }

      const result = await this.assetSelection.approveHybridSelection(
        candidateId,
        userId
      );

      if (result.selected) {
        res.json({ success: true });
      } else {
        res.status(400).json({ success: false, reason: result.reason });
      }
    } catch (error: any) {
      logger.error('Error approving hybrid selection:', error);
      res.status(500).json({ error: error.message });
    }
  };

  /**
   * POST /api/assets/reject-selection
   * Reject a hybrid selection
   * Body: { candidateId: number, userId: string }
   */
  rejectSelection = async (req: Request, res: Response): Promise<void> => {
    try {
      const { candidateId, userId } = req.body;

      if (!candidateId || !userId) {
        res.status(400).json({ error: 'candidateId and userId are required' });
        return;
      }

      const success = await this.assetSelection.rejectHybridSelection(
        candidateId,
        userId
      );

      res.json({ success });
    } catch (error: any) {
      logger.error('Error rejecting hybrid selection:', error);
      res.status(500).json({ error: error.message });
    }
  };

  /**
   * POST /api/assets/reject
   * Permanently reject an asset candidate
   * Body: { candidateId: number, userId: string, reason?: string }
   */
  rejectAsset = async (req: Request, res: Response): Promise<void> => {
    try {
      const { candidateId, userId, reason } = req.body;

      if (!candidateId || !userId) {
        res.status(400).json({ error: 'candidateId and userId are required' });
        return;
      }

      const success = await this.assetSelection.rejectAsset(
        candidateId,
        userId,
        reason
      );

      res.json({ success });
    } catch (error: any) {
      logger.error('Error rejecting asset:', error);
      res.status(500).json({ error: error.message });
    }
  };

  /**
   * POST /api/assets/unlock
   * Unlock an asset type (allow re-selection)
   * Body: { entityType, entityId, assetType }
   */
  unlockAssetType = async (req: Request, res: Response): Promise<void> => {
    try {
      const { entityType, entityId, assetType } = req.body;

      if (!entityType || !entityId || !assetType) {
        res.status(400).json({ error: 'entityType, entityId, and assetType are required' });
        return;
      }

      const success = await this.assetSelection.unlockAssetType(
        entityType,
        parseInt(entityId),
        assetType
      );

      res.json({ success });
    } catch (error: any) {
      logger.error('Error unlocking asset type:', error);
      res.status(500).json({ error: error.message });
    }
  };

  /**
   * POST /api/assets/publish
   * Publish entity to library
   * Body: { entityType, entityId, libraryPath, mediaFilename }
   */
  publish = async (req: Request, res: Response): Promise<void> => {
    try {
      const { entityType, entityId, libraryPath, mediaFilename } = req.body;

      if (!entityType || !entityId || !libraryPath) {
        res.status(400).json({ error: 'entityType, entityId, and libraryPath are required' });
        return;
      }

      const result = await this.publishing.publish({
        entityType,
        entityId: parseInt(entityId),
        libraryPath,
        mediaFilename
      });

      res.json(result);
    } catch (error: any) {
      logger.error('Error publishing entity:', error);
      res.status(500).json({ error: error.message });
    }
  };

  /**
   * GET /api/assets/needs-publishing/:entityType/:entityId
   * Check if entity needs publishing
   * TODO: Re-implement with new publishing service API
   */
  needsPublishing = async (_req: Request, res: Response): Promise<void> => {
    // TODO: Implement with new publishing service
    res.status(501).json({ error: 'Not implemented - needs refactor with new publishing service' });
  };

  /**
   * GET /api/assets/needs-publishing/:entityType
   * Get all entities of type that need publishing
   * TODO: Re-implement with new publishing service API
   */
  getEntitiesNeedingPublish = async (_req: Request, res: Response): Promise<void> => {
    // TODO: Implement with new publishing service
    res.status(501).json({ error: 'Not implemented - needs refactor with new publishing service' });
  };
}
