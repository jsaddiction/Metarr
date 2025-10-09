/**
 * TheAudioDB Provider
 *
 * Concrete implementation of BaseProvider for TheAudioDB.
 * Provides artwork and images for artists and albums.
 */

import { BaseProvider } from '../BaseProvider.js';
import { TheAudioDBClient } from './TheAudioDBClient.js';
import { RateLimiter } from '../utils/RateLimiter.js';
import {
  ProviderCapabilities,
  ProviderOptions,
  SearchRequest,
  SearchResult,
  MetadataRequest,
  MetadataResponse,
  AssetRequest,
  AssetCandidate,
} from '../../../types/providers/index.js';
import { ProviderConfig } from '../../../types/provider.js';
import { logger } from '../../../middleware/logging.js';

export class TheAudioDBProvider extends BaseProvider {
  private audioDbClient: TheAudioDBClient;

  constructor(config: ProviderConfig, options?: ProviderOptions) {
    super(config, options);

    // Initialize TheAudioDB client
    this.audioDbClient = new TheAudioDBClient(config.apiKey || '1');

    logger.info('TheAudioDB Provider initialized', {
      providerId: this.capabilities.id,
      version: this.capabilities.version,
    });
  }

  /**
   * Create rate limiter for TheAudioDB API
   * 30 req/min (free tier) = 0.5 req/sec
   */
  protected createRateLimiter(): RateLimiter {
    return new RateLimiter({
      requestsPerSecond: 0.5, // Conservative for free tier
      burstCapacity: 5,
      windowSeconds: 60,
    });
  }

  /**
   * Define TheAudioDB provider capabilities
   */
  defineCapabilities(): ProviderCapabilities {
    return {
      id: 'theaudiodb',
      name: 'TheAudioDB',
      version: '1.0.0',
      category: 'images',

      supportedEntityTypes: ['artist', 'album'],

      supportedMetadataFields: {
        // TheAudioDB provides some metadata, but we focus on images
      },

      supportedAssetTypes: {
        artist: [
          'artistthumb',
          'musiclogo',
          'hdmusiclogo',
          'artistbackground',
          'fanart',
          'banner',
        ],
        album: ['albumcover', 'cdart'],
      },

      authentication: {
        type: 'api_key',
        required: false, // Test key available
        allowsPersonalKey: true,
        personalKeyBenefit: 'Higher rate limits (100 req/min vs 30 req/min)',
      },

      rateLimit: {
        requestsPerSecond: 0.5, // 30/min for free tier
        burstCapacity: 5,
        webhookReservedCapacity: 0,
        enforcementType: 'client',
      },

      search: {
        supported: true,
        fuzzyMatching: true,
        multiLanguage: false,
        yearFilter: false,
        externalIdLookup: ['musicbrainz_id'],
      },

      dataQuality: {
        metadataCompleteness: 0.6,
        imageQuality: 0.9, // High-quality curated artwork
        updateFrequency: 'weekly',
        userContributed: true,
        curatedContent: true,
      },

      assetProvision: {
        providesUrls: true,
        providesDirectDownload: true,
        thumbnailUrls: true,
        multipleQualities: true,
        maxResultsPerType: 10,
        qualityHints: true,
        languagePerAsset: false,
      },

      specialFeatures: {},
    };
  }

  /**
   * Search for artists or albums
   */
  async search(request: SearchRequest): Promise<SearchResult[]> {
    const { query, entityType, externalId } = request;

    try {
      // Direct MusicBrainz ID lookup
      if (externalId?.type === 'musicbrainz_id' && externalId.value) {
        const mbid = externalId.value;
        logger.debug(`TheAudioDB MusicBrainz ID lookup: ${mbid}`);

        if (entityType === 'artist') {
          const artist = await this.audioDbClient.getArtistByMBID(mbid);
          if (!artist) return [];

          return [
            {
              providerId: 'theaudiodb',
              providerResultId: artist.idArtist,
              title: artist.strArtist,
              confidence: 1.0,
              externalIds: { musicbrainz: mbid },
            },
          ];
        } else if (entityType === 'album') {
          const album = await this.audioDbClient.getAlbumByMBID(mbid);
          if (!album) return [];

          return [
            {
              providerId: 'theaudiodb',
              providerResultId: album.idAlbum,
              title: album.strAlbum,
              confidence: 1.0,
              externalIds: { musicbrainz: mbid },
            },
          ];
        }
      }

      // Search by query
      if (!query) {
        throw new Error('Query or MusicBrainz ID required for search');
      }

      if (entityType === 'artist') {
        const artists = await this.audioDbClient.searchArtist(query);
        return artists.map((artist) => ({
          providerId: 'theaudiodb',
          providerResultId: artist.idArtist,
          title: artist.strArtist,
          confidence: 0.8, // No score from API
          ...(artist.strMusicBrainzID && { externalIds: { musicbrainz: artist.strMusicBrainzID } }),
        }));
      } else if (entityType === 'album') {
        // For albums, we need artist name in the query
        const albums = await this.audioDbClient.searchAlbum(query);
        return albums.map((album) => ({
          providerId: 'theaudiodb',
          providerResultId: album.idAlbum,
          title: album.strAlbum,
          confidence: 0.8,
          ...(album.strMusicBrainzID && { externalIds: { musicbrainz: album.strMusicBrainzID } }),
        }));
      }

      return [];
    } catch (error: any) {
      logger.error('TheAudioDB search failed', {
        query,
        entityType,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get metadata - TheAudioDB provides some metadata but we focus on assets
   */
  async getMetadata(request: MetadataRequest): Promise<MetadataResponse> {
    logger.debug('TheAudioDB is primarily an asset provider, metadata is limited');
    return {
      providerId: 'theaudiodb',
      providerResultId: request.providerResultId,
      fields: {},
      completeness: 0.1,
      confidence: 0.5,
    };
  }

  /**
   * Get asset candidates for artists or albums
   */
  async getAssets(request: AssetRequest): Promise<AssetCandidate[]> {
    const { providerResultId, entityType, assetTypes } = request;

    if (!providerResultId) {
      throw new Error('TheAudioDB ID required for asset request');
    }

    try {
      const candidates: AssetCandidate[] = [];

      if (entityType === 'artist') {
        // Get artist data with MusicBrainz ID if available
        const externalIds = request as any;
        const mbid = externalIds?.externalIds?.musicbrainz;

        let artist;
        if (mbid) {
          artist = await this.audioDbClient.getArtistByMBID(mbid);
        } else {
          // Fallback: search by ID
          logger.warn(`No MusicBrainz ID for artist ${providerResultId}, skipping`);
          return [];
        }

        if (!artist) return [];

        // Map TheAudioDB image fields to asset types
        const imageMap: Record<string, string | undefined> = {
          artistthumb: artist.strArtistThumb,
          musiclogo: artist.strArtistLogo,
          hdmusiclogo: artist.strArtistClearart,
          artistbackground: artist.strArtistFanart,
          fanart: artist.strArtistFanart2,
          banner: artist.strArtistBanner,
        };

        for (const [assetType, url] of Object.entries(imageMap)) {
          if (!url) continue;
          if (assetTypes && !assetTypes.includes(assetType as any)) continue;

          candidates.push({
            providerId: 'theaudiodb',
            providerResultId: artist.idArtist,
            assetType: assetType as any,
            url,
            language: '',
            voteAverage: 0,
            votes: 0,
          });
        }
      } else if (entityType === 'album') {
        // Get album data with MusicBrainz ID if available
        const externalIds = request as any;
        const mbid = externalIds?.externalIds?.musicbrainz;

        let album;
        if (mbid) {
          album = await this.audioDbClient.getAlbumByMBID(mbid);
        } else {
          logger.warn(`No MusicBrainz ID for album ${providerResultId}, skipping`);
          return [];
        }

        if (!album) return [];

        // Map TheAudioDB image fields to asset types
        const imageMap: Record<string, string | undefined> = {
          albumcover: album.strAlbumThumb || album.strAlbumThumbHQ,
          cdart: album.strAlbumCDart,
        };

        for (const [assetType, url] of Object.entries(imageMap)) {
          if (!url) continue;
          if (assetTypes && !assetTypes.includes(assetType as any)) continue;

          candidates.push({
            providerId: 'theaudiodb',
            providerResultId: album.idAlbum,
            assetType: assetType as any,
            url,
            language: '',
            voteAverage: 0,
            votes: 0,
          });
        }
      }

      logger.info(`Retrieved ${candidates.length} asset candidates from TheAudioDB`, {
        entityType,
        providerResultId,
      });

      return candidates;
    } catch (error: any) {
      logger.error('TheAudioDB asset retrieval failed', {
        providerResultId,
        entityType,
        error: error.message,
      });
      return [];
    }
  }

  /**
   * Test connection to TheAudioDB API
   */
  async testConnection() {
    try {
      // Try a simple artist search
      await this.audioDbClient.searchArtist('test');
      return {
        success: true,
        message: 'TheAudioDB API is accessible',
      };
    } catch (error: any) {
      return {
        success: false,
        message: `TheAudioDB access failed: ${error.message}`,
        error: error.message,
      };
    }
  }
}
