import { Request, Response } from 'express';
import { ProviderConfigService } from '../services/providerConfigService.js';
import { getProviderMetadata, getAllProviderMetadata } from '../config/providerMetadata.js';
import { ProviderConfig, ProviderWithMetadata, TestConnectionRequest, UpdateProviderRequest } from '../types/provider.js';
import { TMDBClient } from '../services/providers/tmdb/TMDBClient.js';
import { TVDBClient } from '../services/providers/tvdb/TVDBClient.js';
import { FanArtClient } from '../services/providers/fanart/FanArtClient.js';
import { IMDbClient } from '../services/providers/imdb/IMDbClient.js';
import { MusicBrainzClient } from '../services/providers/musicbrainz/MusicBrainzClient.js';
import { TheAudioDBClient } from '../services/providers/theaudiodb/TheAudioDBClient.js';
import { logger } from '../middleware/logging.js';
import { tmdbService } from '../services/providers/TMDBService.js';
import fs from 'fs/promises';

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

        case 'imdb':
          await this.testIMDbConnection();
          message = 'Successfully connected to IMDb (web scraping)';
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
    // Import default key helper
    const { getDefaultApiKey } = await import('../config/providerDefaults.js');

    // Use provided key or fall back to default
    const keyToUse = apiKey || getDefaultApiKey('tmdb');

    console.log('[TMDB Test] User provided key:', apiKey ? 'YES (length: ' + apiKey.length + ')' : 'NO');
    console.log('[TMDB Test] Default key available:', getDefaultApiKey('tmdb') ? 'YES' : 'NO');
    console.log('[TMDB Test] Using key (first 20 chars):', keyToUse ? keyToUse.substring(0, 20) + '...' : 'NONE');

    if (!keyToUse) {
      throw new Error('TMDB API key is required and no default key is available');
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
    } catch (error: any) {
      console.error('[TMDB Test] API call failed:', error.response?.status, error.message);
      if (error.response?.status === 401) {
        throw new Error('Invalid TMDB API key. Please check your credentials.');
      }
      throw new Error(`TMDB API test failed: ${error.message}`);
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
      throw new Error('TVDB API key is required and no default key is available');
    }

    // Create temporary client
    const testClient = new TVDBClient({
      apiKey: keyToUse,
      baseUrl: 'https://api4.thetvdb.com/v4'
    });

    // Test API call - login to get JWT token
    try {
      await testClient.login();
    } catch (error: any) {
      if (error.response?.status === 401) {
        throw new Error('Invalid TVDB API key. Please check your credentials.');
      }
      throw new Error(`TVDB API test failed: ${error.message}`);
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
    } catch (error: any) {
      if (error.response?.status === 401 || error.response?.status === 403) {
        throw new Error('Invalid FanArt.tv API key. Please check your credentials.');
      }
      if (error.response?.status === 404) {
        // 404 is acceptable - means API is accessible but no images found
        return;
      }
      throw new Error(`FanArt.tv API test failed: ${error.message}`);
    }
  }

  /**
   * Test IMDb connection
   */
  private async testIMDbConnection(): Promise<void> {
    // IMDb uses web scraping, no API key needed
    const testClient = new IMDbClient();

    // Test scraping - get movie details for a known ID (The Matrix)
    try {
      await testClient.getMovieDetails('tt0133093'); // IMDb ID for The Matrix
    } catch (error: any) {
      if (error.response?.status === 403 || error.response?.status === 429) {
        throw new Error('IMDb blocked the request. You may be rate-limited or your IP may be banned.');
      }
      throw new Error(`IMDb connection test failed: ${error.message}`);
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
    } catch (error: any) {
      if (error.response?.status === 503) {
        throw new Error('MusicBrainz rate limit exceeded. Please wait before testing again.');
      }
      throw new Error(`MusicBrainz API test failed: ${error.message}`);
    }
  }

  /**
   * Test TheAudioDB connection
   */
  private async testTheAudioDBConnection(apiKey?: string): Promise<void> {
    if (!apiKey) {
      throw new Error('TheAudioDB API key is required');
    }

    const testClient = new TheAudioDBClient(apiKey); // Constructor takes string, not object

    // Test API call - search for a known artist (The Beatles)
    try {
      await testClient.searchArtist('The Beatles');
    } catch (error: any) {
      if (error.response?.status === 401 || error.response?.status === 403) {
        throw new Error('Invalid TheAudioDB API key. Please check your credentials.');
      }
      if (error.response?.status === 429) {
        throw new Error('TheAudioDB rate limit exceeded. Free tier allows 30 requests per minute.');
      }
      throw new Error(`TheAudioDB API test failed: ${error.message}`);
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
    } catch (error: any) {
      throw new Error(`Local filesystem access test failed: ${error.message}. Ensure data directories exist.`);
    }
  }
}
