import { Request, Response } from 'express';
import { PhaseConfigService } from '../services/PhaseConfigService.js';
import { logger } from '../middleware/logging.js';
import { getErrorMessage } from '../utils/errorHandling.js';

/**
 * Settings Controller
 *
 * Handles phase configuration and general application settings.
 * All workflow phases ALWAYS run - configuration controls behavior, not enablement.
 */
export class SettingsController {
  private phaseConfig: PhaseConfigService;

  constructor(phaseConfig: PhaseConfigService) {
    this.phaseConfig = phaseConfig;
  }

  /**
   * GET /api/settings/phase-config
   * Get all phase configurations
   */
  async getPhaseConfig(_req: Request, res: Response): Promise<void> {
    try {
      const config = await this.phaseConfig.getAll();

      res.json(config);
    } catch (error) {
      logger.error('Error fetching phase configuration:', error);
      res.status(500).json({
        error: 'Failed to fetch phase configuration',
        message: getErrorMessage(error)
      });
    }
  }

  /**
   * GET /api/settings/phase-config/:phase
   * Get configuration for a specific phase
   */
  async getPhaseConfigByPhase(req: Request, res: Response): Promise<void> {
    try {
      const { phase } = req.params;

      // Validate phase name
      const validPhases = ['scan', 'enrichment', 'publish', 'playerSync'];
      if (!validPhases.includes(phase)) {
        res.status(400).json({
          error: 'Invalid phase name',
          validPhases
        });
        return;
      }

      const config = await this.phaseConfig.getConfig(phase as any);

      res.json({ [phase]: config });
    } catch (error) {
      logger.error('Error fetching phase configuration:', error);
      res.status(500).json({
        error: 'Failed to fetch phase configuration',
        message: getErrorMessage(error)
      });
    }
  }

  /**
   * PATCH /api/settings/phase-config
   * Update multiple phase configuration settings
   */
  async updatePhaseConfig(req: Request, res: Response): Promise<void> {
    try {
      const updates = req.body;

      // Validate input
      if (typeof updates !== 'object' || updates === null) {
        res.status(400).json({ error: 'Invalid request body' });
        return;
      }

      await this.phaseConfig.updateMultiple(updates);
      const config = await this.phaseConfig.getAll();

      logger.info('Phase configuration updated', {
        controller: 'SettingsController',
        updates
      });

      res.json(config);
    } catch (error) {
      logger.error('Error updating phase configuration:', error);
      res.status(500).json({
        error: 'Failed to update phase configuration',
        message: getErrorMessage(error)
      });
    }
  }

  /**
   * PATCH /api/settings/phase-config/:key
   * Update a single phase configuration setting
   */
  async updatePhaseConfigSetting(req: Request, res: Response): Promise<void> {
    try {
      const { key } = req.params;
      const { value } = req.body;

      // Validate key format (e.g., "enrichment.fetchProviderAssets")
      if (!key || typeof key !== 'string' || !key.includes('.')) {
        res.status(400).json({
          error: 'Invalid key format. Expected format: "phase.setting" (e.g., "enrichment.fetchProviderAssets")'
        });
        return;
      }

      // Validate value
      if (value === undefined) {
        res.status(400).json({
          error: 'Missing value in request body'
        });
        return;
      }

      await this.phaseConfig.set(key, value);

      res.json({
        key,
        value
      });
    } catch (error) {
      logger.error('Error updating phase configuration setting:', error);
      res.status(500).json({
        error: 'Failed to update phase configuration setting',
        message: getErrorMessage(error)
      });
    }
  }

  /**
   * POST /api/settings/phase-config/reset
   * Reset all phase configuration to defaults
   */
  async resetPhaseConfig(_req: Request, res: Response): Promise<void> {
    try {
      await this.phaseConfig.resetToDefaults();
      const config = await this.phaseConfig.getAll();

      logger.info('Phase configuration reset to defaults', {
        controller: 'SettingsController'
      });

      res.json(config);
    } catch (error) {
      logger.error('Error resetting phase configuration:', error);
      res.status(500).json({
        error: 'Failed to reset phase configuration',
        message: getErrorMessage(error)
      });
    }
  }
}
