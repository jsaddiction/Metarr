import { Request, Response } from 'express';
import { ProviderConfigService } from '../services/providerConfigService.js';
import { getProviderMetadata, getAllProviderMetadata } from '../config/providerMetadata.js';
import { ProviderConfig, ProviderWithMetadata, TestConnectionRequest, UpdateProviderRequest } from '../types/provider.js';
import { TMDBClient } from '../services/providers/tmdb/TMDBClient.js';
import { TVDBClient } from '../services/providers/tvdb/TVDBClient.js';
import { FanArtClient } from '../services/providers/fanart/FanArtClient.js';
import { MusicBrainzClient } from '../services/providers/musicbrainz/MusicBrainzClient.js';
import { TheAudioDBClient } from '../services/providers/theaudiodb/TheAudioDBClient.js';
import { ProviderRegistry } from '../services/providers/ProviderRegistry.js';
import { logger } from '../middleware/logging.js';
import fs from 'fs/promises';
import { getErrorMessage, getStatusCode } from '../utils/errorHandling.js';
import {
  ValidationError,
  AuthenticationError,
  ProviderError,
  FileSystemError,
  ErrorCode,
} from '../errors/index.js';

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
          // Don't include API key in response - let frontend field be empty
          // Backend will use defaults when needed
          const maskedConfig: ProviderConfig = {
            ...config
          };
          delete maskedConfig.apiKey; // Don't send API key to frontend

          return {
            config: maskedConfig,
            metadata
          };
        } else{
          // Provider exists in metadata but not configured yet
          return {
            config: {
              id: 0,
              providerName: metadata.name,
              enabled: false,
              lastTestStatus: 'never_tested',
              created_at: new Date(),
              updated_at: new Date()
            },
            metadata
          };
        }
      });

      res.json({ providers });
    } catch (error) {
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
        delete maskedConfig.apiKey; // Don't send API key to frontend

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
            lastTestStatus: 'never_tested',
            created_at: new Date(),
            updated_at: new Date()
          },
          metadata
        });
      }
    } catch (error) {
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

      // Validate API key if required
      if (metadata.requiresApiKey && data.enabled && !data.apiKey) {
        res.status(400).json({
          error: `API key is required for provider '${metadata.displayName}'`
        });
        return;
      }

      // Update configuration
      const updated = await this.providerConfigService.upsert(name, data);

      // Invalidate cached provider instance so it gets recreated with new config
      // ProviderRegistry.createProvider() will automatically use updated config on next request
      const registry = ProviderRegistry.getInstance();
      registry.invalidateCache(name as any); // ProviderId type
      logger.info('Invalidated cached provider instances for updated configuration', { provider: name });

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
    } catch (error) {
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
      let message: string;

      switch (name) {
        case 'tmdb':
          await this.testTMDBConnection(data.apiKey);
          message = 'Successfully connected to TMDB API';
          break;

        case 'tvdb':
          await this.testTVDBConnection(data.apiKey);
          message = 'Successfully connected to TVDB API';
          break;

        case 'fanart_tv':
          await this.testFanArtConnection(data.apiKey);
          message = data.apiKey
            ? 'Successfully connected to FanArt.tv with personal API key'
            : 'Successfully connected to FanArt.tv (using project key)';
          break;

        case 'musicbrainz':
          await this.testMusicBrainzConnection();
          message = 'Successfully connected to MusicBrainz API';
          break;

        case 'theaudiodb':
          await this.testTheAudioDBConnection(data.apiKey);
          message = 'Successfully connected to TheAudioDB API';
          break;

        case 'local':
          await this.testLocalConnection();
          message = 'Local filesystem access verified';
          break;

        default:
          res.status(501).json({
            success: false,
            error: `Provider '${name}' test not implemented`
          });
          return;
      }

      await this.providerConfigService.updateTestStatus(name, 'success');
      res.json({
        success: true,
        message
      });
    } catch (error) {
      logger.error(`Error testing provider ${req.params.name}:`, error);
      await this.providerConfigService.updateTestStatus(
        req.params.name,
        'error',
        getErrorMessage(error)
      );
      res.json({
        success: false,
        error: getErrorMessage(error) || 'Connection test failed'
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
    } catch (error) {
      logger.error(`Error disabling provider ${req.params.name}:`, error);
      res.status(500).json({ error: 'Failed to disable provider' });
    }
  };

  /**
   * Test TMDB connection
   */
  private async testTMDBConnection(apiKey?: string): Promise<void> {
    // Import default key helper
    const { getDefaultApiKey } = await import('../config/providerDefaults.js');

    // Use provided key or fall back to default
    const keyToUse = apiKey || getDefaultApiKey('tmdb');

    console.log('[TMDB Test] User provided key:', apiKey ? 'YES (length: ' + apiKey.length + ')' : 'NO');
    console.log('[TMDB Test] Default key available:', getDefaultApiKey('tmdb') ? 'YES' : 'NO');
    console.log('[TMDB Test] Using key (first 20 chars):', keyToUse ? keyToUse.substring(0, 20) + '...' : 'NONE');

    if (!keyToUse) {
      throw new ValidationError(
        'TMDB API key is required and no default key is available',
        {
          service: 'ProviderConfigController',
          operation: 'testTMDBConnection',
          metadata: { provider: 'tmdb' }
        }
      );
    }

    // Create temporary client
    const testClient = new TMDBClient({
      apiKey: keyToUse,
      baseUrl: 'https://api.themoviedb.org/3',
      language: 'en-US',
      includeAdult: false
    });

    // Test API call - get configuration endpoint (lightweight)
    try {
      console.log('[TMDB Test] Attempting API call to TMDB...');
      await testClient.getConfiguration();
      console.log('[TMDB Test] API call successful!');
    } catch (error) {
      const status = getStatusCode(error);
      console.error('[TMDB Test] API call failed:', status, getErrorMessage(error));
      if (status === 401) {
        throw new AuthenticationError(
          'Invalid TMDB API key. Please check your credentials.',
          {
            service: 'ProviderConfigController',
            operation: 'testTMDBConnection',
            metadata: { provider: 'tmdb', statusCode: status }
          }
        );
      }
      throw new ProviderError(
        `TMDB API test failed: ${getErrorMessage(error)}`,
        'tmdb',
        ErrorCode.PROVIDER_INVALID_RESPONSE,
        500,
        true,
        {
          service: 'ProviderConfigController',
          operation: 'testTMDBConnection',
          metadata: { statusCode: status }
        },
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Test TVDB connection
   */
  private async testTVDBConnection(apiKey?: string): Promise<void> {
    // Import default key helper
    const { getDefaultApiKey } = await import('../config/providerDefaults.js');

    // Use provided key or fall back to default
    const keyToUse = apiKey || getDefaultApiKey('tvdb');

    if (!keyToUse) {
      throw new ValidationError(
        'TVDB API key is required and no default key is available',
        {
          service: 'ProviderConfigController',
          operation: 'testTVDBConnection',
          metadata: { provider: 'tvdb' }
        }
      );
    }

    // Create temporary client
    const testClient = new TVDBClient({
      apiKey: keyToUse,
      baseUrl: 'https://api4.thetvdb.com/v4'
    });

    // Test API call - login to get JWT token
    try {
      await testClient.login();
    } catch (error) {
      const status = getStatusCode(error);
      if (status === 401) {
        throw new AuthenticationError(
          'Invalid TVDB API key. Please check your credentials.',
          {
            service: 'ProviderConfigController',
            operation: 'testTVDBConnection',
            metadata: { provider: 'tvdb', statusCode: status }
          }
        );
      }
      throw new ProviderError(
        `TVDB API test failed: ${getErrorMessage(error)}`,
        'tvdb',
        ErrorCode.PROVIDER_INVALID_RESPONSE,
        500,
        true,
        {
          service: 'ProviderConfigController',
          operation: 'testTVDBConnection',
          metadata: { statusCode: status }
        },
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Test FanArt.tv connection
   */
  private async testFanArtConnection(apiKey?: string): Promise<void> {
    // FanArt.tv works without API key (using project key)
    // Personal key just provides higher rate limits

    // Import default key helper
    const { getDefaultApiKey } = await import('../config/providerDefaults.js');

    // Use provided key or fall back to default
    const keyToUse = apiKey || getDefaultApiKey('fanart_tv');

    const testClient = new FanArtClient({
      apiKey: keyToUse || 'project-key', // Fallback to placeholder if nothing available
      baseUrl: 'https://webservice.fanart.tv/v3'
    });

    // Test API call - get movie images for a known ID (The Matrix)
    try {
      await testClient.getMovieImages(603); // tmdbId for The Matrix (number, not string)
    } catch (error) {
      const status = getStatusCode(error);
      if (status === 401 || status === 403) {
        throw new AuthenticationError(
          'Invalid FanArt.tv API key. Please check your credentials.',
          {
            service: 'ProviderConfigController',
            operation: 'testFanArtConnection',
            metadata: { provider: 'fanart_tv', statusCode: status }
          }
        );
      }
      if (status === 404) {
        // 404 is acceptable - means API is accessible but no images found
        return;
      }
      throw new ProviderError(
        `FanArt.tv API test failed: ${getErrorMessage(error)}`,
        'fanart_tv',
        ErrorCode.PROVIDER_INVALID_RESPONSE,
        500,
        true,
        {
          service: 'ProviderConfigController',
          operation: 'testFanArtConnection',
          metadata: { statusCode: status }
        },
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Test MusicBrainz connection
   */
  private async testMusicBrainzConnection(): Promise<void> {
    // MusicBrainz doesn't require API key
    const testClient = new MusicBrainzClient({
      appName: 'Metarr',
      appVersion: '1.0.0',
      contact: 'test@localhost'
    });

    // Test API call - search for a known artist (The Beatles)
    try {
      await testClient.searchArtists('The Beatles', 1); // Method is searchArtists, not searchArtist
    } catch (error) {
      const status = getStatusCode(error);
      if (status === 503) {
        throw new ProviderError(
          'MusicBrainz rate limit exceeded. Please wait before testing again.',
          'musicbrainz',
          ErrorCode.PROVIDER_RATE_LIMIT,
          503,
          true,
          {
            service: 'ProviderConfigController',
            operation: 'testMusicBrainzConnection',
            metadata: { provider: 'musicbrainz', statusCode: status }
          },
          error instanceof Error ? error : undefined
        );
      }
      throw new ProviderError(
        `MusicBrainz API test failed: ${getErrorMessage(error)}`,
        'musicbrainz',
        ErrorCode.PROVIDER_INVALID_RESPONSE,
        500,
        true,
        {
          service: 'ProviderConfigController',
          operation: 'testMusicBrainzConnection',
          metadata: { statusCode: status }
        },
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Test TheAudioDB connection
   */
  private async testTheAudioDBConnection(apiKey?: string): Promise<void> {
    if (!apiKey) {
      throw new ValidationError(
        'TheAudioDB API key is required',
        {
          service: 'ProviderConfigController',
          operation: 'testTheAudioDBConnection',
          metadata: { provider: 'theaudiodb' }
        }
      );
    }

    const testClient = new TheAudioDBClient(apiKey); // Constructor takes string, not object

    // Test API call - search for a known artist (The Beatles)
    try {
      await testClient.searchArtist('The Beatles');
    } catch (error) {
      const status = getStatusCode(error);
      if (status === 401 || status === 403) {
        throw new AuthenticationError(
          'Invalid TheAudioDB API key. Please check your credentials.',
          {
            service: 'ProviderConfigController',
            operation: 'testTheAudioDBConnection',
            metadata: { provider: 'theaudiodb', statusCode: status }
          }
        );
      }
      if (status === 429) {
        throw new ProviderError(
          'TheAudioDB rate limit exceeded. Free tier allows 30 requests per minute.',
          'theaudiodb',
          ErrorCode.PROVIDER_RATE_LIMIT,
          429,
          true,
          {
            service: 'ProviderConfigController',
            operation: 'testTheAudioDBConnection',
            metadata: { provider: 'theaudiodb', statusCode: status }
          },
          error instanceof Error ? error : undefined
        );
      }
      throw new ProviderError(
        `TheAudioDB API test failed: ${getErrorMessage(error)}`,
        'theaudiodb',
        ErrorCode.PROVIDER_INVALID_RESPONSE,
        500,
        true,
        {
          service: 'ProviderConfigController',
          operation: 'testTheAudioDBConnection',
          metadata: { statusCode: status }
        },
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Test Local provider connection
   */
  private async testLocalConnection(): Promise<void> {
    // Test filesystem access by checking data directory
    const testPaths = [
      './data',
      './data/cache',
      './data/backup'
    ];

    try {
      for (const testPath of testPaths) {
        await fs.access(testPath);
      }
    } catch (error) {
      throw new FileSystemError(
        `Local filesystem access test failed: ${getErrorMessage(error)}. Ensure data directories exist.`,
        ErrorCode.FS_READ_FAILED,
        testPaths.join(', '),
        true,
        {
          service: 'ProviderConfigController',
          operation: 'testLocalConnection',
          metadata: { provider: 'local', testPaths }
        },
        error instanceof Error ? error : undefined
      );
    }
  }
}
