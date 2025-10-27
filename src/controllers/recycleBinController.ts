import { Request, Response } from 'express';
import { DatabaseManager } from '../database/DatabaseManager.js';
import { RecycleBinService } from '../services/recycleBinService.js';
import { logger } from '../middleware/logging.js';
import { getErrorMessage } from '../utils/errorHandling.js';

/**
 * Recycle Bin Controller
 *
 * Provides API endpoints for managing recycled files:
 * - List recycled files
 * - Restore files
 * - Permanently delete files
 * - Get statistics
 * - Manual cleanup
 */

export class RecycleBinController {
  private dbManager: DatabaseManager;

  constructor(dbManager: DatabaseManager) {
    this.dbManager = dbManager;
  }

  /**
   * GET /api/recycle-bin/stats
   * Get recycle bin statistics
   */
  async getStats(_req: Request, res: Response): Promise<void> {
    try {
      const db = this.dbManager.getConnection();
      const recycleBin = new RecycleBinService(db);

      const stats = await recycleBin.getStats();

      res.json({
        success: true,
        data: {
          ...stats,
          totalSizeGB: (stats.totalSizeBytes / (1024 * 1024 * 1024)).toFixed(2),
        },
      });
    } catch (error) {
      logger.error('[RecycleBinController] Failed to get stats', {
        error: getErrorMessage(error),
      });
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  }

  /**
   * GET /api/recycle-bin/:entityType/:entityId
   * List recycled files for an entity
   */
  async listForEntity(req: Request, res: Response): Promise<void> {
    try {
      const { entityType, entityId } = req.params;

      if (!['movie', 'episode', 'series', 'season'].includes(entityType)) {
        res.status(400).json({
          success: false,
          error: `Invalid entity type: ${entityType}`,
        });
        return;
      }

      const db = this.dbManager.getConnection();
      const recycleBin = new RecycleBinService(db);

      const entries = await recycleBin.listForEntity(
        entityType as 'movie' | 'episode' | 'series' | 'season',
        parseInt(entityId, 10)
      );

      res.json({
        success: true,
        data: entries,
      });
    } catch (error) {
      logger.error('[RecycleBinController] Failed to list recycled files', {
        error: getErrorMessage(error),
      });
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  }

  /**
   * POST /api/recycle-bin/:recycleId/restore
   * Restore a file from recycle bin
   */
  async restoreFile(req: Request, res: Response): Promise<void> {
    try {
      const { recycleId } = req.params;

      const db = this.dbManager.getConnection();
      const recycleBin = new RecycleBinService(db);

      await recycleBin.restoreFile(parseInt(recycleId, 10));

      logger.info('[RecycleBinController] File restored', {
        recycleId,
      });

      res.json({
        success: true,
        message: 'File restored successfully',
      });
    } catch (error) {
      logger.error('[RecycleBinController] Failed to restore file', {
        recycleId: req.params.recycleId,
        error: getErrorMessage(error),
      });
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  }

  /**
   * DELETE /api/recycle-bin/:recycleId
   * Permanently delete a recycled file
   */
  async permanentlyDelete(req: Request, res: Response): Promise<void> {
    try {
      const { recycleId } = req.params;

      const db = this.dbManager.getConnection();
      const recycleBin = new RecycleBinService(db);

      await recycleBin.permanentlyDelete(parseInt(recycleId, 10));

      logger.info('[RecycleBinController] File permanently deleted', {
        recycleId,
      });

      res.json({
        success: true,
        message: 'File permanently deleted',
      });
    } catch (error) {
      logger.error('[RecycleBinController] Failed to permanently delete file', {
        recycleId: req.params.recycleId,
        error: getErrorMessage(error),
      });
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  }

  /**
   * POST /api/recycle-bin/cleanup/expired
   * Manually trigger cleanup of expired items
   */
  async cleanupExpired(_req: Request, res: Response): Promise<void> {
    try {
      const db = this.dbManager.getConnection();
      const recycleBin = new RecycleBinService(db);

      const deletedCount = await recycleBin.cleanupExpired();

      logger.info('[RecycleBinController] Expired items cleaned up', {
        deletedCount,
      });

      res.json({
        success: true,
        data: {
          deletedCount,
        },
      });
    } catch (error) {
      logger.error('[RecycleBinController] Failed to cleanup expired items', {
        error: getErrorMessage(error),
      });
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  }

  /**
   * POST /api/recycle-bin/cleanup/pending
   * Manually trigger cleanup of pending items (failed moves)
   */
  async cleanupPending(_req: Request, res: Response): Promise<void> {
    try {
      const db = this.dbManager.getConnection();
      const recycleBin = new RecycleBinService(db);

      const cleanedCount = await recycleBin.cleanupPending();

      logger.info('[RecycleBinController] Pending items cleaned up', {
        cleanedCount,
      });

      res.json({
        success: true,
        data: {
          cleanedCount,
        },
      });
    } catch (error) {
      logger.error('[RecycleBinController] Failed to cleanup pending items', {
        error: getErrorMessage(error),
      });
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  }

  /**
   * POST /api/recycle-bin/empty
   * Empty entire recycle bin (permanent deletion of all files)
   */
  async emptyRecycleBin(_req: Request, res: Response): Promise<void> {
    try {
      const db = this.dbManager.getConnection();
      const recycleBin = new RecycleBinService(db);

      const deletedCount = await recycleBin.emptyRecycleBin();

      logger.warn('[RecycleBinController] Recycle bin emptied', {
        deletedCount,
      });

      res.json({
        success: true,
        data: {
          deletedCount,
        },
      });
    } catch (error) {
      logger.error('[RecycleBinController] Failed to empty recycle bin', {
        error: getErrorMessage(error),
      });
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  }
}
