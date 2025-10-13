import { Request, Response } from 'express';
import { AutoSelectionService, AutoSelectionStrategy } from '../services/autoSelectionService.js';

/**
 * Auto-Selection Controller
 *
 * Handles API requests for auto-selection strategy management
 */
export class AutoSelectionController {
  constructor(private service: AutoSelectionService) {}

  /**
   * GET /api/auto-selection/strategy
   * Get the current auto-selection strategy
   */
  getStrategy = async (_req: Request, res: Response): Promise<void> => {
    try {
      const settings = await this.service.getStrategy();
      res.json({
        success: true,
        strategy: settings.strategy,
        updatedAt: settings.updatedAt,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get auto-selection strategy',
      });
    }
  }

  /**
   * POST /api/auto-selection/strategy
   * Set the auto-selection strategy
   */
  setStrategy = async (req: Request, res: Response): Promise<void> => {
    try {
      const { strategy } = req.body as { strategy: AutoSelectionStrategy };

      if (!strategy) {
        res.status(400).json({
          success: false,
          error: 'Strategy is required',
        });
        return;
      }

      await this.service.setStrategy(strategy);

      res.json({
        success: true,
        strategy,
        message: `Auto-selection strategy set to '${strategy}'`,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: error.message || 'Failed to set auto-selection strategy',
      });
    }
  };
}
