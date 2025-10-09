import { Request, Response } from 'express';
import { ProviderConfigService } from '../services/providerConfigService.js';
import { getProviderMetadata, getAllProviderMetadata } from '../config/providerMetadata.js';
import { ProviderConfig, ProviderWithMetadata, TestConnectionRequest, UpdateProviderRequest } from '../types/provider.js';
import { TMDBClient } from '../services/providers/tmdb/TMDBClient.js';
import { logger } from '../middleware/logging.js';
import { tmdbService } from '../services/providers/TMDBService.js';

/**
 * Provider Configuration Controller
 *
 * Handles HTTP requests for provider configuration management
 */
export class ProviderConfigController {
  constructor(private providerConfigService: ProviderConfigService) {}

  /**
   * GET /api/providers
   * Get all providers with metadata
   */
  getAllProviders = async (_req: Request, res: Response): Promise<void> => {
    try {
      const configs = await this.providerConfigService.getAll();
      const allMetadata = getAllProviderMetadata();

      // Combine configs with metadata
      const providers: ProviderWithMetadata[] = allMetadata.map(metadata => {
        const config = configs.find(c => c.providerName === metadata.name);

        if (config) {
          // Mask API key in response
          const maskedConfig: ProviderConfig = {
            ...config
          };
          if (config.apiKey) {
            maskedConfig.apiKey = '***masked***';
          }

          return {
            config: maskedConfig,
            metadata
          };
        } else {
          // Provider exists in metadata but not configured yet
          return {
            config: {
              id: 0,
              providerName: metadata.name,
              enabled: false,
              enabledAssetTypes: [],
              lastTestStatus: 'never_tested',
              createdAt: new Date(),
              updatedAt: new Date()
            },
            metadata
          };
        }
      });

      res.json({ providers });
    } catch (error: any) {
      logger.error('Error getting providers:', error);
      res.status(500).json({ error: 'Failed to retrieve providers' });
    }
  };

  /**
   * GET /api/providers/:name
   * Get single provider with metadata
   */
  getProvider = async (req: Request, res: Response): Promise<void> => {
    try {
      const { name } = req.params;
      const metadata = getProviderMetadata(name);

      if (!metadata) {
        res.status(404).json({ error: `Provider '${name}' not found` });
        return;
      }

      const config = await this.providerConfigService.getByName(name);

      if (config) {
        const maskedConfig: ProviderConfig = {
          ...config
        };
        if (config.apiKey) {
          maskedConfig.apiKey = '***masked***';
        }

        res.json({
          config: maskedConfig,
          metadata
        });
      } else {
        // Return metadata with default config
        res.json({
          config: {
            id: 0,
            providerName: name,
            enabled: false,
            enabledAssetTypes: [],
            lastTestStatus: 'never_tested',
            createdAt: new Date(),
            updatedAt: new Date()
          },
          metadata
        });
      }
    } catch (error: any) {
      logger.error(`Error getting provider ${req.params.name}:`, error);
      res.status(500).json({ error: 'Failed to retrieve provider' });
    }
  };

  /**
   * POST /api/providers/:name
   * Create or update provider configuration
   */
  updateProvider = async (req: Request, res: Response): Promise<void> => {
    try {
      const { name } = req.params;
      const metadata = getProviderMetadata(name);

      if (!metadata) {
        res.status(404).json({ error: `Provider '${name}' not found` });
        return;
      }

      const data: UpdateProviderRequest = req.body;

      // Validation
      if (typeof data.enabled !== 'boolean') {
        res.status(400).json({ error: 'enabled must be a boolean' });
        return;
      }

      if (!Array.isArray(data.enabledAssetTypes)) {
        res.status(400).json({ error: 'enabledAssetTypes must be an array' });
        return;
      }

      // Validate asset types
      const validAssetTypes = metadata.supportedAssetTypes
        .filter(at => at.available)
        .map(at => at.type);

      for (const assetType of data.enabledAssetTypes) {
        if (!validAssetTypes.includes(assetType)) {
          res.status(400).json({
            error: `Invalid asset type '${assetType}' for provider '${name}'`
          });
          return;
        }
      }

      // Validate API key if required
      if (metadata.requiresApiKey && data.enabled && !data.apiKey) {
        res.status(400).json({
          error: `API key is required for provider '${metadata.displayName}'`
        });
        return;
      }

      // Update configuration
      const updated = await this.providerConfigService.upsert(name, data);

      // Reinitialize provider service if enabled
      if (data.enabled && name === 'tmdb') {
        tmdbService.reinitialize();
        logger.info('Reinitialized TMDB service with new configuration');
      }

      const maskedConfig: ProviderConfig = {
        ...updated
      };
      if (updated.apiKey) {
        maskedConfig.apiKey = '***masked***';
      }

      res.json({
        success: true,
        provider: maskedConfig
      });
    } catch (error: any) {
      logger.error(`Error updating provider ${req.params.name}:`, error);
      res.status(500).json({ error: 'Failed to update provider' });
    }
  };

  /**
   * POST /api/providers/:name/test
   * Test provider connection without saving
   */
  testProvider = async (req: Request, res: Response): Promise<void> => {
    try {
      const { name } = req.params;
      const metadata = getProviderMetadata(name);

      if (!metadata) {
        res.status(404).json({ error: `Provider '${name}' not found` });
        return;
      }

      const data: TestConnectionRequest = req.body;

      // Test connection based on provider type
      if (name === 'tmdb') {
        await this.testTMDBConnection(data.apiKey);
        await this.providerConfigService.updateTestStatus(name, 'success');
        res.json({
          success: true,
          message: 'Successfully connected to TMDB API'
        });
      } else if (name === 'tvdb') {
        // TODO: Implement TVDB test
        res.status(501).json({
          success: false,
          error: 'TVDB provider not yet implemented'
        });
      } else if (name === 'fanart_tv') {
        // TODO: Implement FanArt.tv test
        res.status(501).json({
          success: false,
          error: 'FanArt.tv provider not yet implemented'
        });
      } else {
        res.status(501).json({
          success: false,
          error: `Provider '${name}' test not implemented`
        });
      }
    } catch (error: any) {
      logger.error(`Error testing provider ${req.params.name}:`, error);
      await this.providerConfigService.updateTestStatus(
        req.params.name,
        'error',
        error.message
      );
      res.json({
        success: false,
        error: error.message || 'Connection test failed'
      });
    }
  };

  /**
   * DELETE /api/providers/:name
   * Disable provider and clear API key
   */
  deleteProvider = async (req: Request, res: Response): Promise<void> => {
    try {
      const { name } = req.params;
      const metadata = getProviderMetadata(name);

      if (!metadata) {
        res.status(404).json({ error: `Provider '${name}' not found` });
        return;
      }

      await this.providerConfigService.disable(name);

      res.json({
        success: true,
        message: `Provider '${metadata.displayName}' disabled successfully`
      });
    } catch (error: any) {
      logger.error(`Error disabling provider ${req.params.name}:`, error);
      res.status(500).json({ error: 'Failed to disable provider' });
    }
  };

  /**
   * Test TMDB connection
   */
  private async testTMDBConnection(apiKey?: string): Promise<void> {
    if (!apiKey) {
      throw new Error('TMDB API key is required');
    }

    // Create temporary client
    const testClient = new TMDBClient({
      apiKey,
      baseUrl: 'https://api.themoviedb.org/3',
      language: 'en-US',
      includeAdult: false
    });

    // Test API call - get configuration endpoint (lightweight)
    try {
      await testClient.getConfiguration();
    } catch (error: any) {
      if (error.response?.status === 401) {
        throw new Error('Invalid TMDB API key. Please check your credentials.');
      }
      throw new Error(`TMDB API test failed: ${error.message}`);
    }
  }
}
