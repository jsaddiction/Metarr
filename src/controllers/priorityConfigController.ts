import { Request, Response } from 'express';
import { PriorityConfigService } from '../services/priorityConfigService.js';
import {
  ApplyPresetRequest,
  UpdateAssetTypePriorityRequest,
  UpdateMetadataFieldPriorityRequest
} from '../types/provider.js';
import { logger } from '../middleware/logging.js';

/**
 * Priority Configuration Controller
 *
 * Handles HTTP requests for provider priority configuration
 */
export class PriorityConfigController {
  constructor(private priorityConfigService: PriorityConfigService) {}

  /**
   * GET /api/priorities/presets
   * Get all available priority presets
   */
  getAvailablePresets = async (_req: Request, res: Response): Promise<void> => {
    try {
      const presets = this.priorityConfigService.getAvailablePresets();
      res.json({ presets });
    } catch (error: any) {
      logger.error('Error getting available presets:', error);
      res.status(500).json({ error: 'Failed to retrieve presets' });
    }
  };

  /**
   * GET /api/priorities/active
   * Get the currently active preset
   */
  getActivePreset = async (_req: Request, res: Response): Promise<void> => {
    try {
      const activePreset = await this.priorityConfigService.getActivePreset();
      res.json({ activePreset });
    } catch (error: any) {
      logger.error('Error getting active preset:', error);
      res.status(500).json({ error: 'Failed to retrieve active preset' });
    }
  };

  /**
   * POST /api/priorities/apply
   * Apply a priority preset
   */
  applyPreset = async (req: Request, res: Response): Promise<void> => {
    try {
      const data: ApplyPresetRequest = req.body;

      if (!data.presetId) {
        res.status(400).json({ error: 'presetId is required' });
        return;
      }

      await this.priorityConfigService.applyPreset(data.presetId);

      res.json({
        success: true,
        message: `Successfully applied preset: ${data.presetId}`
      });
    } catch (error: any) {
      logger.error('Error applying preset:', error);
      res.status(500).json({ error: error.message || 'Failed to apply preset' });
    }
  };

  /**
   * GET /api/priorities/asset-types
   * Get all asset type priorities
   */
  getAllAssetTypePriorities = async (_req: Request, res: Response): Promise<void> => {
    try {
      const priorities = await this.priorityConfigService.getAllAssetTypePriorities();
      res.json({ priorities });
    } catch (error: any) {
      logger.error('Error getting asset type priorities:', error);
      res.status(500).json({ error: 'Failed to retrieve asset type priorities' });
    }
  };

  /**
   * GET /api/priorities/asset-types/:type
   * Get priority for a specific asset type
   */
  getAssetTypePriority = async (req: Request, res: Response): Promise<void> => {
    try {
      const { type } = req.params;
      const priority = await this.priorityConfigService.getAssetTypePriority(type);

      if (!priority) {
        res.status(404).json({ error: `No priority configured for asset type: ${type}` });
        return;
      }

      res.json({ priority });
    } catch (error: any) {
      logger.error(`Error getting asset type priority for ${req.params.type}:`, error);
      res.status(500).json({ error: 'Failed to retrieve asset type priority' });
    }
  };

  /**
   * POST /api/priorities/asset-types/:type
   * Update priority for a specific asset type
   */
  updateAssetTypePriority = async (req: Request, res: Response): Promise<void> => {
    try {
      const { type } = req.params;
      const { providerOrder } = req.body;

      if (!Array.isArray(providerOrder)) {
        res.status(400).json({ error: 'providerOrder must be an array' });
        return;
      }

      const data: UpdateAssetTypePriorityRequest = {
        assetType: type,
        providerOrder
      };

      const updated = await this.priorityConfigService.upsertAssetTypePriority(data);

      res.json({
        success: true,
        priority: updated
      });
    } catch (error: any) {
      logger.error(`Error updating asset type priority for ${req.params.type}:`, error);
      res.status(500).json({ error: error.message || 'Failed to update asset type priority' });
    }
  };

  /**
   * GET /api/priorities/metadata-fields
   * Get all metadata field priorities
   */
  getAllMetadataFieldPriorities = async (_req: Request, res: Response): Promise<void> => {
    try {
      const priorities = await this.priorityConfigService.getAllMetadataFieldPriorities();
      res.json({ priorities });
    } catch (error: any) {
      logger.error('Error getting metadata field priorities:', error);
      res.status(500).json({ error: 'Failed to retrieve metadata field priorities' });
    }
  };

  /**
   * GET /api/priorities/metadata-fields/:field
   * Get priority for a specific metadata field
   */
  getMetadataFieldPriority = async (req: Request, res: Response): Promise<void> => {
    try {
      const { field } = req.params;
      const priority = await this.priorityConfigService.getMetadataFieldPriority(field);

      if (!priority) {
        res.status(404).json({ error: `No priority configured for field: ${field}` });
        return;
      }

      res.json({ priority });
    } catch (error: any) {
      logger.error(`Error getting metadata field priority for ${req.params.field}:`, error);
      res.status(500).json({ error: 'Failed to retrieve metadata field priority' });
    }
  };

  /**
   * POST /api/priorities/metadata-fields/:field
   * Update priority for a specific metadata field
   */
  updateMetadataFieldPriority = async (req: Request, res: Response): Promise<void> => {
    try {
      const { field } = req.params;
      const { providerOrder } = req.body;

      if (!Array.isArray(providerOrder)) {
        res.status(400).json({ error: 'providerOrder must be an array' });
        return;
      }

      const data: UpdateMetadataFieldPriorityRequest = {
        fieldName: field,
        providerOrder
      };

      const updated = await this.priorityConfigService.upsertMetadataFieldPriority(data);

      res.json({
        success: true,
        priority: updated
      });
    } catch (error: any) {
      logger.error(`Error updating metadata field priority for ${req.params.field}:`, error);
      res.status(500).json({ error: error.message || 'Failed to update metadata field priority' });
    }
  };
}
