import { Request, Response } from 'express';
import { WorkflowControlService, WorkflowStage } from '../services/workflowControlService.js';
import { logger } from '../middleware/logging.js';
import { getErrorMessage } from '../utils/errorHandling.js';

/**
 * Settings Controller
 *
 * Handles workflow control and general application settings
 */
export class SettingsController {
  private workflowControl: WorkflowControlService;

  constructor(workflowControl: WorkflowControlService) {
    this.workflowControl = workflowControl;
  }

  /**
   * GET /api/settings/workflow
   * Get all workflow settings
   */
  async getWorkflowSettings(_req: Request, res: Response): Promise<void> {
    try {
      const settings = await this.workflowControl.getAll();

      res.json(settings);
    } catch (error) {
      logger.error('Error fetching workflow settings:', error);
      res.status(500).json({
        error: 'Failed to fetch workflow settings',
        message: getErrorMessage(error)
      });
    }
  }

  /**
   * PUT /api/settings/workflow
   * Update multiple workflow settings
   */
  async updateWorkflowSettings(req: Request, res: Response): Promise<void> {
    try {
      const updates = req.body;

      // Validate input
      if (typeof updates !== 'object' || updates === null) {
        res.status(400).json({ error: 'Invalid request body' });
        return;
      }

      const settings = await this.workflowControl.updateMultiple(updates);

      logger.info('Workflow settings updated', {
        controller: 'SettingsController',
        updates
      });

      res.json(settings);
    } catch (error) {
      logger.error('Error updating workflow settings:', error);
      res.status(500).json({
        error: 'Failed to update workflow settings',
        message: getErrorMessage(error)
      });
    }
  }

  /**
   * PUT /api/settings/workflow/:stage
   * Update a single workflow stage
   */
  async updateWorkflowStage(req: Request, res: Response): Promise<void> {
    try {
      const { stage } = req.params;
      const { enabled } = req.body;

      // Validate stage
      const validStages: WorkflowStage[] = ['webhooks', 'scanning', 'identification', 'enrichment', 'publishing'];
      if (!validStages.includes(stage as WorkflowStage)) {
        res.status(400).json({
          error: 'Invalid workflow stage',
          validStages
        });
        return;
      }

      // Validate enabled
      if (typeof enabled !== 'boolean') {
        res.status(400).json({
          error: 'Invalid value for enabled, must be boolean'
        });
        return;
      }

      await this.workflowControl.setEnabled(stage as WorkflowStage, enabled);

      res.json({
        stage,
        enabled
      });
    } catch (error) {
      logger.error('Error updating workflow stage:', error);
      res.status(500).json({
        error: 'Failed to update workflow stage',
        message: getErrorMessage(error)
      });
    }
  }

  /**
   * POST /api/settings/workflow/enable-all
   * Enable all workflow stages (production mode)
   */
  async enableAllWorkflows(_req: Request, res: Response): Promise<void> {
    try {
      await this.workflowControl.enableAll();
      const settings = await this.workflowControl.getAll();

      logger.info('All workflow stages enabled', {
        controller: 'SettingsController'
      });

      res.json(settings);
    } catch (error) {
      logger.error('Error enabling all workflows:', error);
      res.status(500).json({
        error: 'Failed to enable all workflows',
        message: getErrorMessage(error)
      });
    }
  }

  /**
   * POST /api/settings/workflow/disable-all
   * Disable all workflow stages (development mode)
   */
  async disableAllWorkflows(_req: Request, res: Response): Promise<void> {
    try {
      await this.workflowControl.disableAll();
      const settings = await this.workflowControl.getAll();

      logger.info('All workflow stages disabled', {
        controller: 'SettingsController'
      });

      res.json(settings);
    } catch (error) {
      logger.error('Error disabling all workflows:', error);
      res.status(500).json({
        error: 'Failed to disable all workflows',
        message: getErrorMessage(error)
      });
    }
  }
}
