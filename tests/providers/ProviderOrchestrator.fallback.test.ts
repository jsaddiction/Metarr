/**
 * ProviderOrchestrator Fallback Chain Tests
 *
 * Tests for the provider fallback chain implementation added in lines 120-182 (metadata)
 * and lines 203-262 (assets) of ProviderOrchestrator.ts
 *
 * Verifies:
 * - Fallback chain activation when providers fail
 * - Partial success handling (some providers succeed, others fail)
 * - Complete failure handling (all providers fail)
 * - Fallback logging and error tracking
 * - Circuit breaker integration
 * - Asset candidates fallback behavior
 */

import { jest } from '@jest/globals';
import { ProviderOrchestrator } from '../../src/services/providers/ProviderOrchestrator.js';
import { ProviderRegistry } from '../../src/services/providers/ProviderRegistry.js';
import { ProviderConfigService } from '../../src/services/providerConfigService.js';
import { BaseProvider } from '../../src/services/providers/BaseProvider.js';
import { DatabaseConnection } from '../../src/types/database.js';
import { ProviderConfig } from '../../src/types/provider.js';
import {
  MetadataResponse,
  AssetCandidate,
  MetadataRequest,
  AssetRequest,
} from '../../src/types/providers/index.js';
import {
  ProviderUnavailableError,
  ProviderServerError,
  NetworkError,
} from '../../src/errors/index.js';
import { logger } from '../../src/middleware/logging.js';

// Mock logger to capture fallback logging
jest.mock('../../src/middleware/logging.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('ProviderOrchestrator - Fallback Chain', () => {
  let orchestrator: ProviderOrchestrator;
  let registry: ProviderRegistry;
  let configService: jest.Mocked<ProviderConfigService>;
  let mockDb: DatabaseConnection;

  // Mock provider configs
  const tmdbConfig: ProviderConfig = {
    id: 1,
    providerName: 'tmdb',
    enabled: true,
    apiKey: 'test_tmdb_key',
    created_at: new Date(),
    updated_at: new Date(),
  };

  const tvdbConfig: ProviderConfig = {
    id: 2,
    providerName: 'tvdb',
    enabled: true,
    apiKey: 'test_tvdb_key',
    created_at: new Date(),
    updated_at: new Date(),
  };

  const fanartConfig: ProviderConfig = {
    id: 3,
    providerName: 'fanart_tv',
    enabled: true,
    apiKey: 'test_fanart_key',
    created_at: new Date(),
    updated_at: new Date(),
  };

  // Mock metadata responses
  const mockTmdbMetadata: MetadataResponse = {
    providerId: 'tmdb',
    providerResultId: '12345',
    fields: {
      title: 'Test Movie',
      releaseDate: '2024-01-01',
      plot: 'TMDB plot description',
    },
    completeness: 0.8,
    confidence: 0.95,
  };

  const mockTvdbMetadata: MetadataResponse = {
    providerId: 'tvdb',
    providerResultId: '67890',
    fields: {
      title: 'Test Series',
      premiered: '2024-01-01',
      plot: 'TVDB plot description',
    },
    completeness: 0.7,
    confidence: 0.85,
  };

  const mockFanartMetadata: MetadataResponse = {
    providerId: 'fanart_tv',
    providerResultId: 'fanart123',
    fields: {
      title: 'Test Media',
    },
    completeness: 0.3,
    confidence: 0.7,
  };

  // Mock asset candidates
  const mockTmdbAssets: AssetCandidate[] = [
    {
      providerId: 'tmdb',
      providerResultId: '12345',
      assetType: 'poster',
      url: 'https://image.tmdb.org/poster1.jpg',
      width: 2000,
      height: 3000,
      language: 'en',
      voteAverage: 9.5,
      votes: 100,
    },
  ];

  const mockTvdbAssets: AssetCandidate[] = [
    {
      providerId: 'tvdb',
      providerResultId: '67890',
      assetType: 'banner',
      url: 'https://artworks.thetvdb.com/banner1.jpg',
      width: 1000,
      height: 185,
      language: 'en',
      voteAverage: 8.0,
      votes: 50,
    },
  ];

  const mockFanartAssets: AssetCandidate[] = [
    {
      providerId: 'fanart_tv',
      providerResultId: 'fanart123',
      assetType: 'fanart',
      url: 'https://assets.fanart.tv/fanart1.jpg',
      width: 1920,
      height: 1080,
      language: 'en',
      voteAverage: 9.0,
      votes: 75,
    },
  ];

  beforeEach(() => {
    // Create mock database connection
    mockDb = {
      query: jest.fn<() => Promise<any[]>>().mockResolvedValue([]) as any,
      execute: jest.fn<() => Promise<any>>().mockResolvedValue({ affectedRows: 0 }) as any,
      close: jest.fn<() => Promise<void>>().mockResolvedValue(undefined) as any,
      beginTransaction: jest.fn<() => Promise<void>>().mockResolvedValue(undefined) as any,
      commit: jest.fn<() => Promise<void>>().mockResolvedValue(undefined) as any,
      rollback: jest.fn<() => Promise<void>>().mockResolvedValue(undefined) as any,
    } as DatabaseConnection;

    // Create config service and mock methods
    configService = new ProviderConfigService(mockDb) as any;
    configService.getAll = jest.fn<() => Promise<ProviderConfig[]>>();
    configService.getByName = jest.fn<(name: string) => Promise<ProviderConfig | null>>();

    // Get registry instance
    registry = ProviderRegistry.getInstance();

    // Create orchestrator
    orchestrator = new ProviderOrchestrator(registry, configService);

    // Clear mock calls
    jest.clearAllMocks();
  });

  describe('Metadata Fallback Chain', () => {
    describe('Fallback chain activation', () => {
      it('should use fallback provider when primary fails', async () => {
        // Setup: TMDB enabled (will fail), TVDB enabled (will succeed)
        configService.getAll.mockResolvedValue([tmdbConfig, tvdbConfig]);

        // Mock TMDB to fail with circuit breaker error
        const mockTmdbProvider = {
          getMetadata: jest.fn<(req: MetadataRequest) => Promise<MetadataResponse>>()
            .mockRejectedValue(new ProviderUnavailableError('tmdb', 'Circuit breaker is open')),
          getCapabilities: jest.fn().mockReturnValue({ id: 'tmdb' }),
        };

        // Mock TVDB to succeed
        const mockTvdbProvider = {
          getMetadata: jest.fn<(req: MetadataRequest) => Promise<MetadataResponse>>()
            .mockResolvedValue(mockTvdbMetadata),
          getCapabilities: jest.fn().mockReturnValue({
            id: 'tvdb',
            search: { externalIdLookup: ['tvdb', 'imdb'] },
          }),
        };

        // Mock registry to return our test providers
        jest.spyOn(registry, 'createProvider').mockImplementation(async (config: ProviderConfig) => {
          if (config.providerName === 'tmdb') {
            return mockTmdbProvider as any;
          }
          if (config.providerName === 'tvdb') {
            return mockTvdbProvider as any;
          }
          throw new Error('Unexpected provider');
        });

        const result = await orchestrator.fetchMetadata(
          'series',
          { tvdb: '67890' },
          { strategy: 'aggregate_all' }
        );

        // Should return TVDB metadata (fallback succeeded)
        expect(result.fields).toEqual(mockTvdbMetadata.fields);

        // Should log fallback activation
        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('Metadata fetch failed for tmdb'),
          expect.objectContaining({
            fallbackAvailable: true,
          })
        );

        expect(logger.info).toHaveBeenCalledWith(
          'Provider fallback chain activated',
          expect.objectContaining({
            failed: ['tmdb'],
            succeeded: 1,
            total: 2,
          })
        );
      });

      it('should try multiple fallbacks in sequence', async () => {
        // Setup: TMDB fails, TVDB fails, Fanart succeeds
        configService.getAll.mockResolvedValue([tmdbConfig, tvdbConfig, fanartConfig]);

        const mockTmdbProvider = {
          getMetadata: jest.fn<(req: MetadataRequest) => Promise<MetadataResponse>>()
            .mockRejectedValue(new ProviderServerError('tmdb', 500, 'Internal server error')),
          getCapabilities: jest.fn().mockReturnValue({
            id: 'tmdb',
            search: { externalIdLookup: ['tmdb', 'imdb'] },
          }),
        };

        const mockTvdbProvider = {
          getMetadata: jest.fn<(req: MetadataRequest) => Promise<MetadataResponse>>()
            .mockRejectedValue(new NetworkError('Network timeout', undefined, undefined, undefined, new Error('Network timeout'))),
          getCapabilities: jest.fn().mockReturnValue({
            id: 'tvdb',
            search: { externalIdLookup: ['tvdb', 'imdb'] },
          }),
        };

        const mockFanartProvider = {
          getMetadata: jest.fn<(req: MetadataRequest) => Promise<MetadataResponse>>()
            .mockResolvedValue(mockFanartMetadata),
          getCapabilities: jest.fn().mockReturnValue({
            id: 'fanart',
            search: { externalIdLookup: ['tmdb', 'imdb'] },
          }),
        };

        jest.spyOn(registry, 'createProvider').mockImplementation(async (config: ProviderConfig) => {
          if (config.providerName === 'tmdb') return mockTmdbProvider as any;
          if (config.providerName === 'tvdb') return mockTvdbProvider as any;
          if (config.providerName === 'fanart') return mockFanartProvider as any;
          throw new Error('Unexpected provider');
        });

        const result = await orchestrator.fetchMetadata(
          'movie',
          { tmdb: '12345', imdb: 'tt1234567' },
          { strategy: 'aggregate_all' }
        );

        // Should return Fanart metadata (final fallback succeeded)
        expect(result.fields).toEqual(mockFanartMetadata.fields);

        // Should log both failures
        expect(logger.warn).toHaveBeenCalledTimes(2);
        expect(logger.info).toHaveBeenCalledWith(
          'Provider fallback chain activated',
          expect.objectContaining({
            failed: ['tmdb', 'tvdb'],
            succeeded: 1,
            total: 3,
          })
        );
      });
    });

    describe('Partial success handling', () => {
      it('should merge results when 2 of 3 providers succeed', async () => {
        configService.getAll.mockResolvedValue([tmdbConfig, tvdbConfig, fanartConfig]);

        const mockTmdbProvider = {
          getMetadata: jest.fn<(req: MetadataRequest) => Promise<MetadataResponse>>()
            .mockResolvedValue(mockTmdbMetadata),
          getCapabilities: jest.fn().mockReturnValue({
            id: 'tmdb',
            search: { externalIdLookup: ['tmdb', 'imdb'] },
          }),
        };

        const mockTvdbProvider = {
          getMetadata: jest.fn<(req: MetadataRequest) => Promise<MetadataResponse>>()
            .mockRejectedValue(new Error('TVDB failed')),
          getCapabilities: jest.fn().mockReturnValue({
            id: 'tvdb',
            search: { externalIdLookup: ['tvdb'] },
          }),
        };

        const mockFanartProvider = {
          getMetadata: jest.fn<(req: MetadataRequest) => Promise<MetadataResponse>>()
            .mockResolvedValue(mockFanartMetadata),
          getCapabilities: jest.fn().mockReturnValue({
            id: 'fanart',
            search: { externalIdLookup: ['tmdb', 'imdb'] },
          }),
        };

        jest.spyOn(registry, 'createProvider').mockImplementation(async (config: ProviderConfig) => {
          if (config.providerName === 'tmdb') return mockTmdbProvider as any;
          if (config.providerName === 'tvdb') return mockTvdbProvider as any;
          if (config.providerName === 'fanart') return mockFanartProvider as any;
          throw new Error('Unexpected provider');
        });

        const result = await orchestrator.fetchMetadata(
          'movie',
          { tmdb: '12345', imdb: 'tt1234567' },
          { strategy: 'aggregate_all' }
        );

        // Should return merged data from TMDB and Fanart
        expect(result.fields).toMatchObject({
          title: expect.any(String), // Will be from one of the providers
        });

        // Should log partial success
        expect(logger.info).toHaveBeenCalledWith(
          'Provider fallback chain activated',
          expect.objectContaining({
            failed: ['tvdb'],
            succeeded: 2,
            total: 3,
          })
        );

        expect(logger.info).toHaveBeenCalledWith(
          expect.stringContaining('Collected metadata from 2 providers')
        );
      });

      it('should prefer higher confidence provider in partial success', async () => {
        configService.getAll.mockResolvedValue([tmdbConfig, fanartConfig]);

        const highConfidenceMetadata = { ...mockTmdbMetadata, confidence: 0.95 };
        const lowConfidenceMetadata = { ...mockFanartMetadata, confidence: 0.3 };

        const mockTmdbProvider = {
          getMetadata: jest.fn<(req: MetadataRequest) => Promise<MetadataResponse>>()
            .mockResolvedValue(highConfidenceMetadata),
          getCapabilities: jest.fn().mockReturnValue({
            id: 'tmdb',
            search: { externalIdLookup: ['tmdb'] },
          }),
        };

        const mockFanartProvider = {
          getMetadata: jest.fn<(req: MetadataRequest) => Promise<MetadataResponse>>()
            .mockResolvedValue(lowConfidenceMetadata),
          getCapabilities: jest.fn().mockReturnValue({
            id: 'fanart',
            search: { externalIdLookup: ['tmdb'] },
          }),
        };

        jest.spyOn(registry, 'createProvider').mockImplementation(async (config: ProviderConfig) => {
          if (config.providerName === 'tmdb') return mockTmdbProvider as any;
          if (config.providerName === 'fanart') return mockFanartProvider as any;
          throw new Error('Unexpected provider');
        });

        const result = await orchestrator.fetchMetadata(
          'movie',
          { tmdb: '12345' },
          { strategy: 'aggregate_all' }
        );

        // In aggregate_all strategy, fields are selected by highest confidence
        // So for overlapping fields, TMDB should win
        expect(result.fields.title).toBe(mockTmdbMetadata.fields.title);
      });
    });

    describe('Complete failure handling', () => {
      it('should throw error when all providers fail', async () => {
        configService.getAll.mockResolvedValue([tmdbConfig, tvdbConfig]);

        const mockTmdbProvider = {
          getMetadata: jest.fn<(req: MetadataRequest) => Promise<MetadataResponse>>()
            .mockRejectedValue(new ProviderServerError('tmdb', 503, 'Service unavailable')),
          getCapabilities: jest.fn().mockReturnValue({
            id: 'tmdb',
            search: { externalIdLookup: ['tmdb'] },
          }),
        };

        const mockTvdbProvider = {
          getMetadata: jest.fn<(req: MetadataRequest) => Promise<MetadataResponse>>()
            .mockRejectedValue(new ProviderUnavailableError('tvdb', 'Circuit breaker open')),
          getCapabilities: jest.fn().mockReturnValue({
            id: 'tvdb',
            search: { externalIdLookup: ['tvdb'] },
          }),
        };

        jest.spyOn(registry, 'createProvider').mockImplementation(async (config: ProviderConfig) => {
          if (config.providerName === 'tmdb') return mockTmdbProvider as any;
          if (config.providerName === 'tvdb') return mockTvdbProvider as any;
          throw new Error('Unexpected provider');
        });

        await expect(
          orchestrator.fetchMetadata(
            'series',
            { tvdb: '67890' },
            { strategy: 'aggregate_all' }
          )
        ).rejects.toThrow('All 2 metadata providers failed for series');

        // Should log all failures
        expect(logger.warn).toHaveBeenCalledTimes(2);
      });

      it('should handle case where no providers have compatible external ID', async () => {
        configService.getAll.mockResolvedValue([tmdbConfig]);

        const mockTmdbProvider = {
          getMetadata: jest.fn<(req: MetadataRequest) => Promise<MetadataResponse>>(),
          getCapabilities: jest.fn().mockReturnValue({
            id: 'tmdb',
            search: { externalIdLookup: ['tmdb'] }, // Only accepts tmdb IDs
          }),
        };

        jest.spyOn(registry, 'createProvider').mockResolvedValue(mockTmdbProvider as any);

        await expect(
          orchestrator.fetchMetadata(
            'series',
            { tvdb: '67890' }, // Only providing tvdb ID
            { strategy: 'aggregate_all' }
          )
        ).rejects.toThrow('All 1 metadata providers failed for series');

        // Should warn about incompatible ID
        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('No compatible external ID found'),
          expect.objectContaining({
            availableIds: ['tvdb'],
            requiredIds: ['tmdb'],
          })
        );
      });
    });

    describe('Circuit breaker integration', () => {
      it('should respect circuit breaker state and use fallback', async () => {
        configService.getAll.mockResolvedValue([tmdbConfig, tvdbConfig]);

        const mockTmdbProvider = {
          getMetadata: jest.fn<(req: MetadataRequest) => Promise<MetadataResponse>>()
            .mockRejectedValue(
              new ProviderUnavailableError(
                'tmdb',
                'Circuit breaker is open for tmdb',
                {
                  service: 'CircuitBreaker',
                  operation: 'execute',
                  metadata: {
                    state: 'open',
                    failureCount: 5,
                    threshold: 3,
                    resetIn: 25000,
                  },
                }
              )
            ),
          getCapabilities: jest.fn().mockReturnValue({
            id: 'tmdb',
            search: { externalIdLookup: ['tmdb'] },
          }),
        };

        const mockTvdbProvider = {
          getMetadata: jest.fn<(req: MetadataRequest) => Promise<MetadataResponse>>()
            .mockResolvedValue(mockTvdbMetadata),
          getCapabilities: jest.fn().mockReturnValue({
            id: 'tvdb',
            search: { externalIdLookup: ['tvdb'] },
          }),
        };

        jest.spyOn(registry, 'createProvider').mockImplementation(async (config: ProviderConfig) => {
          if (config.providerName === 'tmdb') return mockTmdbProvider as any;
          if (config.providerName === 'tvdb') return mockTvdbProvider as any;
          throw new Error('Unexpected provider');
        });

        const result = await orchestrator.fetchMetadata(
          'series',
          { tvdb: '67890' },
          { strategy: 'aggregate_all' }
        );

        // Should successfully fall back to TVDB
        expect(result.fields).toEqual(mockTvdbMetadata.fields);

        // Should log circuit breaker error
        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('Metadata fetch failed for tmdb'),
          expect.objectContaining({
            error: expect.stringContaining('Circuit breaker is open'),
          })
        );
      });
    });
  });

  describe('Asset Candidates Fallback Chain', () => {
    describe('Fallback chain activation for assets', () => {
      it('should use fallback provider when primary asset provider fails', async () => {
        configService.getAll.mockResolvedValue([tmdbConfig, fanartConfig]);

        const mockTmdbProvider = {
          getAssets: jest.fn<(req: AssetRequest) => Promise<AssetCandidate[]>>()
            .mockRejectedValue(new ProviderServerError('tmdb', 500, 'Internal error')),
          getCapabilities: jest.fn().mockReturnValue({
            id: 'tmdb',
            supportedAssetTypes: {
              movie: ['poster', 'fanart'],
            },
            search: { externalIdLookup: ['tmdb'] },
          }),
        };

        const mockFanartProvider = {
          getAssets: jest.fn<(req: AssetRequest) => Promise<AssetCandidate[]>>()
            .mockResolvedValue(mockFanartAssets),
          getCapabilities: jest.fn().mockReturnValue({
            id: 'fanart',
            supportedAssetTypes: {
              movie: ['poster', 'fanart'],
            },
            search: { externalIdLookup: ['tmdb', 'imdb'] },
          }),
        };

        jest.spyOn(registry, 'createProvider').mockImplementation(async (config: ProviderConfig) => {
          if (config.providerName === 'tmdb') return mockTmdbProvider as any;
          if (config.providerName === 'fanart') return mockFanartProvider as any;
          throw new Error('Unexpected provider');
        });

        const result = await orchestrator.fetchAssetCandidates(
          'movie',
          { tmdb: '12345' },
          ['poster', 'fanart']
        );

        // Should return Fanart assets (fallback succeeded)
        expect(result).toEqual(mockFanartAssets);

        // Should log fallback activation
        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('Asset fetch failed for tmdb'),
          expect.objectContaining({
            fallbackAvailable: true,
          })
        );

        expect(logger.info).toHaveBeenCalledWith(
          'Asset provider fallback chain activated',
          expect.objectContaining({
            failed: ['tmdb'],
            candidatesFound: mockFanartAssets.length,
            total: 2,
          })
        );
      });

      it('should aggregate assets from multiple providers when all succeed', async () => {
        configService.getAll.mockResolvedValue([tmdbConfig, fanartConfig]);

        const mockTmdbProvider = {
          getAssets: jest.fn<(req: AssetRequest) => Promise<AssetCandidate[]>>()
            .mockResolvedValue(mockTmdbAssets),
          getCapabilities: jest.fn().mockReturnValue({
            id: 'tmdb',
            supportedAssetTypes: {
              movie: ['poster', 'fanart'],
            },
            search: { externalIdLookup: ['tmdb'] },
          }),
        };

        const mockFanartProvider = {
          getAssets: jest.fn<(req: AssetRequest) => Promise<AssetCandidate[]>>()
            .mockResolvedValue(mockFanartAssets),
          getCapabilities: jest.fn().mockReturnValue({
            id: 'fanart',
            supportedAssetTypes: {
              movie: ['poster', 'fanart'],
            },
            search: { externalIdLookup: ['tmdb'] },
          }),
        };

        jest.spyOn(registry, 'createProvider').mockImplementation(async (config: ProviderConfig) => {
          if (config.providerName === 'tmdb') return mockTmdbProvider as any;
          if (config.providerName === 'fanart') return mockFanartProvider as any;
          throw new Error('Unexpected provider');
        });

        const result = await orchestrator.fetchAssetCandidates(
          'movie',
          { tmdb: '12345' },
          ['poster', 'fanart']
        );

        // Should return combined assets from both providers
        expect(result).toHaveLength(mockTmdbAssets.length + mockFanartAssets.length);
        expect(result).toEqual(expect.arrayContaining(mockTmdbAssets));
        expect(result).toEqual(expect.arrayContaining(mockFanartAssets));

        // Should NOT log fallback activation (all succeeded)
        expect(logger.info).not.toHaveBeenCalledWith(
          expect.stringContaining('Asset provider fallback chain activated'),
          expect.anything()
        );
      });
    });

    describe('Partial success handling for assets', () => {
      it('should return assets from successful providers when some fail', async () => {
        configService.getAll.mockResolvedValue([tmdbConfig, tvdbConfig, fanartConfig]);

        const mockTmdbProvider = {
          getAssets: jest.fn<(req: AssetRequest) => Promise<AssetCandidate[]>>()
            .mockResolvedValue(mockTmdbAssets),
          getCapabilities: jest.fn().mockReturnValue({
            id: 'tmdb',
            supportedAssetTypes: {
              movie: ['poster'],
            },
            search: { externalIdLookup: ['tmdb'] },
          }),
        };

        const mockTvdbProvider = {
          getAssets: jest.fn<(req: AssetRequest) => Promise<AssetCandidate[]>>()
            .mockRejectedValue(new NetworkError('Connection timeout', undefined, undefined, undefined, new Error('Connection timeout'))),
          getCapabilities: jest.fn().mockReturnValue({
            id: 'tvdb',
            supportedAssetTypes: {
              movie: ['banner'],
            },
            search: { externalIdLookup: ['tvdb'] },
          }),
        };

        const mockFanartProvider = {
          getAssets: jest.fn<(req: AssetRequest) => Promise<AssetCandidate[]>>()
            .mockResolvedValue(mockFanartAssets),
          getCapabilities: jest.fn().mockReturnValue({
            id: 'fanart',
            supportedAssetTypes: {
              movie: ['fanart'],
            },
            search: { externalIdLookup: ['tmdb'] },
          }),
        };

        jest.spyOn(registry, 'createProvider').mockImplementation(async (config: ProviderConfig) => {
          if (config.providerName === 'tmdb') return mockTmdbProvider as any;
          if (config.providerName === 'tvdb') return mockTvdbProvider as any;
          if (config.providerName === 'fanart') return mockFanartProvider as any;
          throw new Error('Unexpected provider');
        });

        const result = await orchestrator.fetchAssetCandidates(
          'movie',
          { tmdb: '12345' },
          ['poster', 'fanart', 'banner']
        );

        // Should return assets from TMDB and Fanart (TVDB failed)
        expect(result).toHaveLength(mockTmdbAssets.length + mockFanartAssets.length);
        expect(result).toEqual(expect.arrayContaining(mockTmdbAssets));
        expect(result).toEqual(expect.arrayContaining(mockFanartAssets));

        // Should log fallback activation
        expect(logger.info).toHaveBeenCalledWith(
          'Asset provider fallback chain activated',
          expect.objectContaining({
            failed: ['tvdb'],
            candidatesFound: result.length,
            total: 3,
          })
        );
      });

      it('should handle empty results from some providers gracefully', async () => {
        configService.getAll.mockResolvedValue([tmdbConfig, fanartConfig]);

        const mockTmdbProvider = {
          getAssets: jest.fn<(req: AssetRequest) => Promise<AssetCandidate[]>>()
            .mockResolvedValue([]), // Empty results
          getCapabilities: jest.fn().mockReturnValue({
            id: 'tmdb',
            supportedAssetTypes: {
              movie: ['poster'],
            },
            search: { externalIdLookup: ['tmdb'] },
          }),
        };

        const mockFanartProvider = {
          getAssets: jest.fn<(req: AssetRequest) => Promise<AssetCandidate[]>>()
            .mockResolvedValue(mockFanartAssets),
          getCapabilities: jest.fn().mockReturnValue({
            id: 'fanart',
            supportedAssetTypes: {
              movie: ['fanart'],
            },
            search: { externalIdLookup: ['tmdb'] },
          }),
        };

        jest.spyOn(registry, 'createProvider').mockImplementation(async (config: ProviderConfig) => {
          if (config.providerName === 'tmdb') return mockTmdbProvider as any;
          if (config.providerName === 'fanart') return mockFanartProvider as any;
          throw new Error('Unexpected provider');
        });

        const result = await orchestrator.fetchAssetCandidates(
          'movie',
          { tmdb: '12345' },
          ['poster', 'fanart']
        );

        // Should return only Fanart assets
        expect(result).toEqual(mockFanartAssets);

        // Should log TMDB as failed (empty results)
        expect(logger.info).toHaveBeenCalledWith(
          'Asset provider fallback chain activated',
          expect.objectContaining({
            failed: ['tmdb'],
          })
        );
      });
    });

    describe('Complete failure handling for assets', () => {
      it('should return empty array when all asset providers fail', async () => {
        configService.getAll.mockResolvedValue([tmdbConfig, fanartConfig]);

        const mockTmdbProvider = {
          getAssets: jest.fn<(req: AssetRequest) => Promise<AssetCandidate[]>>()
            .mockRejectedValue(new ProviderServerError('tmdb', 503, 'Service unavailable')),
          getCapabilities: jest.fn().mockReturnValue({
            id: 'tmdb',
            supportedAssetTypes: {
              movie: ['poster'],
            },
            search: { externalIdLookup: ['tmdb'] },
          }),
        };

        const mockFanartProvider = {
          getAssets: jest.fn<(req: AssetRequest) => Promise<AssetCandidate[]>>()
            .mockRejectedValue(new ProviderUnavailableError('fanart', 'Circuit breaker open')),
          getCapabilities: jest.fn().mockReturnValue({
            id: 'fanart',
            supportedAssetTypes: {
              movie: ['fanart'],
            },
            search: { externalIdLookup: ['tmdb'] },
          }),
        };

        jest.spyOn(registry, 'createProvider').mockImplementation(async (config: ProviderConfig) => {
          if (config.providerName === 'tmdb') return mockTmdbProvider as any;
          if (config.providerName === 'fanart') return mockFanartProvider as any;
          throw new Error('Unexpected provider');
        });

        const result = await orchestrator.fetchAssetCandidates(
          'movie',
          { tmdb: '12345' },
          ['poster', 'fanart']
        );

        // Should return empty array (not throw error, unlike metadata)
        expect(result).toEqual([]);

        // Should log all failures
        expect(logger.warn).toHaveBeenCalledTimes(2);

        // Should NOT log fallback activation when all fail and result is empty
        expect(logger.info).not.toHaveBeenCalledWith(
          expect.stringContaining('Asset provider fallback chain activated'),
          expect.anything()
        );
      });
    });

    describe('Circuit breaker integration for assets', () => {
      it('should respect circuit breaker state for asset providers', async () => {
        configService.getAll.mockResolvedValue([tmdbConfig, fanartConfig]);

        const mockTmdbProvider = {
          getAssets: jest.fn<(req: AssetRequest) => Promise<AssetCandidate[]>>()
            .mockRejectedValue(
              new ProviderUnavailableError(
                'tmdb',
                'Circuit breaker is open for tmdb',
                {
                  service: 'CircuitBreaker',
                  operation: 'execute',
                  metadata: { state: 'open' },
                }
              )
            ),
          getCapabilities: jest.fn().mockReturnValue({
            id: 'tmdb',
            supportedAssetTypes: {
              movie: ['poster'],
            },
            search: { externalIdLookup: ['tmdb'] },
          }),
        };

        const mockFanartProvider = {
          getAssets: jest.fn<(req: AssetRequest) => Promise<AssetCandidate[]>>()
            .mockResolvedValue(mockFanartAssets),
          getCapabilities: jest.fn().mockReturnValue({
            id: 'fanart',
            supportedAssetTypes: {
              movie: ['fanart'],
            },
            search: { externalIdLookup: ['tmdb'] },
          }),
        };

        jest.spyOn(registry, 'createProvider').mockImplementation(async (config: ProviderConfig) => {
          if (config.providerName === 'tmdb') return mockTmdbProvider as any;
          if (config.providerName === 'fanart') return mockFanartProvider as any;
          throw new Error('Unexpected provider');
        });

        const result = await orchestrator.fetchAssetCandidates(
          'movie',
          { tmdb: '12345' },
          ['poster', 'fanart']
        );

        // Should successfully fall back to Fanart
        expect(result).toEqual(mockFanartAssets);

        // Should log circuit breaker error
        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('Asset fetch failed for tmdb'),
          expect.objectContaining({
            error: expect.stringContaining('Circuit breaker is open'),
          })
        );
      });
    });
  });

  describe('Fallback logging verification', () => {
    it('should log which providers failed and which succeeded', async () => {
      configService.getAll.mockResolvedValue([tmdbConfig, tvdbConfig, fanartConfig]);

      const mockTmdbProvider = {
        getMetadata: jest.fn<(req: MetadataRequest) => Promise<MetadataResponse>>()
          .mockResolvedValue(mockTmdbMetadata),
        getCapabilities: jest.fn().mockReturnValue({
          id: 'tmdb',
          search: { externalIdLookup: ['tmdb'] },
        }),
      };

      const mockTvdbProvider = {
        getMetadata: jest.fn<(req: MetadataRequest) => Promise<MetadataResponse>>()
          .mockRejectedValue(new Error('TVDB error')),
        getCapabilities: jest.fn().mockReturnValue({
          id: 'tvdb',
          search: { externalIdLookup: ['tvdb'] },
        }),
      };

      const mockFanartProvider = {
        getMetadata: jest.fn<(req: MetadataRequest) => Promise<MetadataResponse>>()
          .mockResolvedValue(mockFanartMetadata),
        getCapabilities: jest.fn().mockReturnValue({
          id: 'fanart',
          search: { externalIdLookup: ['tmdb'] },
        }),
      };

      jest.spyOn(registry, 'createProvider').mockImplementation(async (config: ProviderConfig) => {
        if (config.providerName === 'tmdb') return mockTmdbProvider as any;
        if (config.providerName === 'tvdb') return mockTvdbProvider as any;
        if (config.providerName === 'fanart') return mockFanartProvider as any;
        throw new Error('Unexpected provider');
      });

      await orchestrator.fetchMetadata(
        'movie',
        { tmdb: '12345' },
        { strategy: 'aggregate_all' }
      );

      // Verify logging details
      expect(logger.info).toHaveBeenCalledWith(
        'Provider fallback chain activated',
        {
          failed: ['tvdb'],
          succeeded: 2,
          total: 3,
        }
      );

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Collected metadata from 2 providers')
      );
    });

    it('should include error messages in fallback logs', async () => {
      configService.getAll.mockResolvedValue([tmdbConfig]);

      const testError = new ProviderServerError('tmdb', 500, 'Database connection failed');

      const mockTmdbProvider = {
        getMetadata: jest.fn<(req: MetadataRequest) => Promise<MetadataResponse>>()
          .mockRejectedValue(testError),
        getCapabilities: jest.fn().mockReturnValue({
          id: 'tmdb',
          search: { externalIdLookup: ['tmdb'] },
        }),
      };

      jest.spyOn(registry, 'createProvider').mockResolvedValue(mockTmdbProvider as any);

      await expect(
        orchestrator.fetchMetadata(
          'movie',
          { tmdb: '12345' },
          { strategy: 'aggregate_all' }
        )
      ).rejects.toThrow();

      // Should log error message
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Metadata fetch failed for tmdb'),
        expect.objectContaining({
          error: expect.stringContaining('Database connection failed'),
        })
      );
    });
  });
});
