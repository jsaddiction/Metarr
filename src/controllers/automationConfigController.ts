import { Request, Response } from 'express';
import { AutomationConfigService } from '../services/automationConfigService.js';
import { logger } from '../middleware/logging.js';
import { getErrorMessage } from '../utils/errorHandling.js';

/**
 * Automation Config Controller
 *
 * Handles HTTP requests for library automation configuration management.
 */

export class AutomationConfigController {
  private configService: AutomationConfigService;

  constructor(configService: AutomationConfigService) {
    this.configService = configService;
  }

  /**
   * GET /api/automation/:libraryId
   * Get automation config for library
   */
  getAutomationConfig = async (req: Request, res: Response): Promise<void> => {
    try {
      const { libraryId } = req.params;

      const config = await this.configService.getAutomationConfig(parseInt(libraryId));

      if (!config) {
        res.status(404).json({ error: 'Automation config not found' });
        return;
      }

      res.json(config);
    } catch (error) {
      logger.error('Error getting automation config:', error);
      res.status(500).json({ error: getErrorMessage(error) });
    }
  };

  /**
   * PUT /api/automation/:libraryId
   * Set automation config for library
   * Body: { mode, autoDiscoverAssets, autoFetchProviderAssets, autoEnrichMetadata, autoSelectAssets, autoPublish }
   */
  setAutomationConfig = async (req: Request, res: Response): Promise<void> => {
    try {
      const { libraryId } = req.params;
      const config = req.body;

      config.libraryId = parseInt(libraryId);

      await this.configService.setAutomationConfig(config);

      res.json({ success: true });
    } catch (error) {
      logger.error('Error setting automation config:', error);
      res.status(500).json({ error: getErrorMessage(error) });
    }
  };

  /**
   * GET /api/automation/:libraryId/asset-selection
   * Get asset selection config for library
   */
  getAssetSelectionConfig = async (req: Request, res: Response): Promise<void> => {
    try {
      const { libraryId } = req.params;

      const configs = await this.configService.getAssetSelectionConfig(parseInt(libraryId));

      res.json({ configs });
    } catch (error) {
      logger.error('Error getting asset selection config:', error);
      res.status(500).json({ error: getErrorMessage(error) });
    }
  };

  /**
   * PUT /api/automation/:libraryId/asset-selection/:assetType
   * Set asset selection config
   * Body: { enabled, minResolution, minVoteAverage, preferredLanguage }
   */
  setAssetSelectionConfig = async (req: Request, res: Response): Promise<void> => {
    try {
      const { libraryId, assetType } = req.params;
      const config = req.body;

      config.libraryId = parseInt(libraryId);
      config.assetType = assetType;

      await this.configService.setAssetSelectionConfig(config);

      res.json({ success: true });
    } catch (error) {
      logger.error('Error setting asset selection config:', error);
      res.status(500).json({ error: getErrorMessage(error) });
    }
  };

  /**
   * GET /api/automation/:libraryId/completeness
   * Get completeness config for library
   */
  getCompletenessConfig = async (req: Request, res: Response): Promise<void> => {
    try {
      const { libraryId } = req.params;

      const configs = await this.configService.getCompletenessConfig(parseInt(libraryId));

      res.json({ configs });
    } catch (error) {
      logger.error('Error getting completeness config:', error);
      res.status(500).json({ error: getErrorMessage(error) });
    }
  };

  /**
   * PUT /api/automation/:libraryId/completeness/:fieldName
   * Set completeness config
   * Body: { isRequired, weight }
   */
  setCompletenessConfig = async (req: Request, res: Response): Promise<void> => {
    try {
      const { libraryId, fieldName } = req.params;
      const config = req.body;

      config.libraryId = parseInt(libraryId);
      config.fieldName = fieldName;

      await this.configService.setCompletenessConfig(config);

      res.json({ success: true });
    } catch (error) {
      logger.error('Error setting completeness config:', error);
      res.status(500).json({ error: getErrorMessage(error) });
    }
  };

  /**
   * POST /api/automation/:libraryId/initialize
   * Initialize default configs for library
   */
  initializeDefaults = async (req: Request, res: Response): Promise<void> => {
    try {
      const { libraryId } = req.params;

      await this.configService.initializeLibraryDefaults(parseInt(libraryId));

      res.json({ success: true, message: 'Default configs initialized' });
    } catch (error) {
      logger.error('Error initializing default configs:', error);
      res.status(500).json({ error: getErrorMessage(error) });
    }
  };

  /**
   * DELETE /api/automation/:libraryId
   * Delete all automation config for library
   */
  deleteAutomationConfig = async (req: Request, res: Response): Promise<void> => {
    try {
      const { libraryId } = req.params;

      await this.configService.deleteAutomationConfig(parseInt(libraryId));
      await this.configService.deleteAssetSelectionConfig(parseInt(libraryId));
      await this.configService.deleteCompletenessConfig(parseInt(libraryId));

      res.json({ success: true });
    } catch (error) {
      logger.error('Error deleting automation config:', error);
      res.status(500).json({ error: getErrorMessage(error) });
    }
  };
}
