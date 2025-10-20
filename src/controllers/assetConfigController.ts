/**
 * Asset Configuration Controller
 *
 * Handles HTTP requests for asset limit configuration.
 */

import { Request, Response, NextFunction } from 'express';
import { AssetConfigService } from '../services/assetConfigService.js';
import { logger } from '../middleware/logging.js';

export class AssetConfigController {
  constructor(private assetConfigService: AssetConfigService) {}

  /**
   * GET /api/settings/asset-limits
   * Get all asset type limits
   */
  async getAllLimits(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const limits = await this.assetConfigService.getAllAssetLimits();
      res.json(limits);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/settings/asset-limits/metadata
   * Get all asset limits with metadata (for settings UI)
   */
  async getAllLimitsWithMetadata(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const limits = await this.assetConfigService.getAllAssetLimitsWithMetadata();
      res.json(limits);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/settings/asset-limits/:assetType
   * Get limit for a specific asset type
   */
  async getLimit(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { assetType } = req.params;
      const limit = await this.assetConfigService.getAssetLimit(assetType);
      res.json({ assetType, limit });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/settings/asset-limits/:assetType
   * Set limit for a specific asset type
   * Body: { limit: number }
   */
  async setLimit(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { assetType } = req.params;
      const { limit } = req.body;

      if (typeof limit !== 'number') {
        res.status(400).json({ error: 'Limit must be a number' });
        return;
      }

      await this.assetConfigService.setAssetLimit(assetType, limit);

      logger.info('Asset limit updated via API', { assetType, limit });

      res.json({
        message: 'Asset limit updated successfully',
        assetType,
        limit,
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('must be between')) {
        res.status(400).json({ error: error.message });
        return;
      }
      next(error);
    }
  }

  /**
   * DELETE /api/settings/asset-limits/:assetType
   * Reset limit to default for a specific asset type
   */
  async resetLimit(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { assetType } = req.params;
      await this.assetConfigService.resetAssetLimit(assetType);

      const newLimit = await this.assetConfigService.getAssetLimit(assetType);

      logger.info('Asset limit reset to default via API', { assetType, newLimit });

      res.json({
        message: 'Asset limit reset to default successfully',
        assetType,
        limit: newLimit,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/settings/asset-limits/reset-all
   * Reset all asset limits to defaults
   */
  async resetAllLimits(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await this.assetConfigService.resetAllAssetLimits();

      const limits = await this.assetConfigService.getAllAssetLimits();

      logger.info('All asset limits reset to defaults via API');

      res.json({
        message: 'All asset limits reset to defaults successfully',
        limits,
      });
    } catch (error) {
      next(error);
    }
  }
}
