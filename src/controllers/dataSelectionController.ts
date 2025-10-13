import type { Request, Response } from 'express';
import type { DataSelectionService } from '../services/dataSelectionService.js';
import type {
  UpdateDataSelectionModeRequest,
  UpdateFieldPriorityRequest,
} from '../types/provider.js';
import { logger } from '../middleware/logging.js';

/**
 * Controller for data selection configuration endpoints
 */
export class DataSelectionController {
  constructor(private service: DataSelectionService) {}

  /**
   * GET /api/data-selection
   *
   * Get current data selection configuration
   */
  getConfig = async (_req: Request, res: Response): Promise<void> => {
    try {
      const config = await this.service.getConfig();
      res.json(config);
    } catch (error) {
      logger.error('Error getting data selection config', { error });
      res.status(500).json({
        error: {
          status: 500,
          message: 'Failed to get data selection configuration',
        },
      });
    }
  };

  /**
   * PUT /api/data-selection/mode
   *
   * Update data selection mode (balanced/custom)
   */
  updateMode = async (req: Request, res: Response): Promise<void> => {
    try {
      const { mode } = req.body as UpdateDataSelectionModeRequest;

      // Validate mode
      if (!mode || !['balanced', 'custom'].includes(mode)) {
        res.status(400).json({
          error: {
            status: 400,
            message: 'Invalid mode. Must be "balanced" or "custom"',
          },
        });
        return;
      }

      const config = await this.service.updateMode(mode);

      res.json({
        success: true,
        config,
      });
    } catch (error) {
      logger.error('Error updating data selection mode', { error });
      res.status(500).json({
        error: {
          status: 500,
          message: 'Failed to update data selection mode',
        },
      });
    }
  };

  /**
   * PUT /api/data-selection/priority
   *
   * Update custom priority for a specific field/asset type
   */
  updateFieldPriority = async (req: Request, res: Response): Promise<void> => {
    try {
      const { mediaType, category, fieldName, providerOrder, disabled } =
        req.body as UpdateFieldPriorityRequest;

      // Validate request
      if (!mediaType || !['movies', 'tvshows', 'music'].includes(mediaType)) {
        res.status(400).json({
          error: {
            status: 400,
            message: 'Invalid mediaType. Must be "movies", "tvshows", or "music"',
          },
        });
        return;
      }

      if (!category || !['metadata', 'images'].includes(category)) {
        res.status(400).json({
          error: {
            status: 400,
            message: 'Invalid category. Must be "metadata" or "images"',
          },
        });
        return;
      }

      if (!fieldName || typeof fieldName !== 'string') {
        res.status(400).json({
          error: {
            status: 400,
            message: 'fieldName is required and must be a string',
          },
        });
        return;
      }

      if (!Array.isArray(providerOrder) || providerOrder.length === 0) {
        res.status(400).json({
          error: {
            status: 400,
            message: 'providerOrder is required and must be a non-empty array',
          },
        });
        return;
      }

      // Build field key (e.g., 'movies.title' or 'tvshows.poster')
      const fieldKey = `${mediaType}.${fieldName}`;

      const config = await this.service.updateFieldPriority(
        category,
        fieldKey,
        providerOrder,
        disabled || []
      );

      res.json({
        success: true,
        config,
      });
    } catch (error) {
      logger.error('Error updating field priority', { error });
      res.status(500).json({
        error: {
          status: 500,
          message: 'Failed to update field priority',
        },
      });
    }
  };

  /**
   * GET /api/data-selection/provider-order/:category/:mediaType/:fieldName
   *
   * Get provider order for a specific field
   * Example: GET /api/data-selection/provider-order/metadata/movies/title
   */
  getProviderOrder = async (req: Request, res: Response): Promise<void> => {
    try {
      const { category, mediaType, fieldName } = req.params;

      // Validate parameters
      if (!category || !['metadata', 'images'].includes(category)) {
        res.status(400).json({
          error: {
            status: 400,
            message: 'Invalid category. Must be "metadata" or "images"',
          },
        });
        return;
      }

      if (!mediaType || !['movies', 'tvshows', 'music'].includes(mediaType)) {
        res.status(400).json({
          error: {
            status: 400,
            message: 'Invalid mediaType. Must be "movies", "tvshows", or "music"',
          },
        });
        return;
      }

      if (!fieldName) {
        res.status(400).json({
          error: {
            status: 400,
            message: 'fieldName is required',
          },
        });
        return;
      }

      const fieldKey = `${mediaType}.${fieldName}`;
      const providerOrder = await this.service.getProviderOrder(
        category as 'metadata' | 'images',
        fieldKey
      );

      res.json({
        category,
        mediaType,
        fieldName,
        providerOrder,
      });
    } catch (error) {
      logger.error('Error getting provider order', { error });
      res.status(500).json({
        error: {
          status: 500,
          message: 'Failed to get provider order',
        },
      });
    }
  };
}
