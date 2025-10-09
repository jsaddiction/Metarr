/**
 * MusicBrainz Provider
 *
 * Concrete implementation of BaseProvider for MusicBrainz.
 * Provides metadata for artists, albums, and tracks.
 */

import { BaseProvider } from '../BaseProvider.js';
import { MusicBrainzClient } from './MusicBrainzClient.js';
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

export class MusicBrainzProvider extends BaseProvider {
  private mbClient: MusicBrainzClient;

  constructor(config: ProviderConfig, options?: ProviderOptions) {
    super(config, options);

    // Initialize MusicBrainz client
    this.mbClient = new MusicBrainzClient({
      appName: 'Metarr',
      appVersion: '1.0.0',
      contact: options?.contact as string || 'https://github.com/metarr',
    });

    logger.info('MusicBrainz Provider initialized', {
      providerId: this.capabilities.id,
      version: this.capabilities.version,
    });
  }

  /**
   * Create rate limiter for MusicBrainz API
   * STRICT: 1 request per second
   */
  protected createRateLimiter(): RateLimiter {
    return new RateLimiter({
      requestsPerSecond: 1, // MusicBrainz strict requirement
      burstCapacity: 1,
      windowSeconds: 1,
    });
  }

  /**
   * Define MusicBrainz provider capabilities
   */
  defineCapabilities(): ProviderCapabilities {
    return {
      id: 'musicbrainz',
      name: 'MusicBrainz',
      version: '1.0.0',
      category: 'metadata',

      supportedEntityTypes: ['artist', 'album', 'track'],

      supportedMetadataFields: {
        artist: [
          'title',
          'sortTitle',
          'biography',
          'formed',
          'disbanded',
          'country',
          'genres',
        ],
        album: ['title', 'releaseDate', 'artist', 'genres'],
        track: ['title', 'duration', 'artist', 'trackNumber'],
      },

      supportedAssetTypes: {
        // MusicBrainz provides metadata only, not assets
      },

      authentication: {
        type: 'none',
        required: false,
      },

      rateLimit: {
        requestsPerSecond: 1, // Strict limit
        burstCapacity: 1,
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
        metadataCompleteness: 0.95, // Very complete
        imageQuality: 0.0, // No images
        updateFrequency: 'daily',
        userContributed: true,
        curatedContent: true,
      },

      assetProvision: {
        providesUrls: false,
        providesDirectDownload: false,
        thumbnailUrls: false,
        multipleQualities: false,
        maxResultsPerType: 0,
        qualityHints: false,
        languagePerAsset: false,
      },

      specialFeatures: {},
    };
  }

  /**
   * Search for artists, albums, or tracks
   */
  async search(request: SearchRequest): Promise<SearchResult[]> {
    const { query, entityType, externalId } = request;

    try {
      // Direct MBID lookup
      if (externalId?.type === 'musicbrainz_id' && externalId.value) {
        const mbid = externalId.value;
        logger.debug(`Direct MusicBrainz ID lookup: ${mbid}`);

        let details;
        if (entityType === 'artist') {
          details = await this.mbClient.getArtist(mbid);
        } else if (entityType === 'album') {
          details = await this.mbClient.getReleaseGroup(mbid);
        } else if (entityType === 'track') {
          details = await this.mbClient.getRecording(mbid);
        } else {
          throw new Error(`Unsupported entity type: ${entityType}`);
        }

        return [
          {
            providerId: 'musicbrainz',
            providerResultId: mbid,
            title: 'name' in details ? details.name : details.title,
            confidence: 1.0,
            externalIds: { musicbrainz: mbid },
          },
        ];
      }

      // Search by query
      if (!query) {
        throw new Error('Query or MusicBrainz ID required for search');
      }

      let searchResults;
      if (entityType === 'artist') {
        searchResults = await this.mbClient.searchArtists(query);
      } else if (entityType === 'album') {
        searchResults = await this.mbClient.searchReleaseGroups(query);
      } else if (entityType === 'track') {
        searchResults = await this.mbClient.searchRecordings(query);
      } else {
        throw new Error(`Unsupported entity type: ${entityType}`);
      }

      // Convert to SearchResult format
      const results: SearchResult[] = searchResults.map((result) => {
        // MusicBrainz score is 0-100, convert to 0-1 confidence
        const confidence = result.score / 100;

        return {
          providerId: 'musicbrainz',
          providerResultId: result.id,
          title: result.name,
          confidence,
          externalIds: { musicbrainz: result.id },
          metadata: {
            type: result.type,
            disambiguation: result.disambiguation,
          },
        };
      });

      logger.info(`MusicBrainz search for "${query}" returned ${results.length} results`);
      return results;
    } catch (error: any) {
      logger.error('MusicBrainz search failed', {
        query,
        entityType,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get detailed metadata for an artist, album, or track
   */
  async getMetadata(request: MetadataRequest): Promise<MetadataResponse> {
    const { providerResultId, entityType } = request;

    const mbid = providerResultId;
    if (!mbid) {
      throw new Error('MusicBrainz ID required for metadata request');
    }

    try {
      const fields: Partial<Record<string, any>> = {};

      if (entityType === 'artist') {
        const artist = await this.mbClient.getArtist(mbid);
        fields.title = artist.name;
        if (artist.sortName) fields.sortTitle = artist.sortName;
        if (artist.country) fields.country = artist.country;
        if (artist.lifeSpan?.begin) fields.formed = artist.lifeSpan.begin;
        if (artist.lifeSpan?.end) fields.disbanded = artist.lifeSpan.end;
        if (artist.genres) fields.genres = artist.genres.map((g) => g.name);
      } else if (entityType === 'album') {
        const album = await this.mbClient.getReleaseGroup(mbid);
        fields.title = album.title;
        if (album.firstReleaseDate) fields.releaseDate = album.firstReleaseDate;
        if (album.artistCredit && album.artistCredit.length > 0) {
          fields.artist = album.artistCredit[0].artist.name;
        }
      } else if (entityType === 'track') {
        const track = await this.mbClient.getRecording(mbid);
        fields.title = track.title;
        if (track.length) fields.duration = Math.floor(track.length / 1000); // Convert to seconds
        if (track.artistCredit && track.artistCredit.length > 0) {
          fields.artist = track.artistCredit[0].artist.name;
        }
      } else {
        throw new Error(`Unsupported entity type: ${entityType}`);
      }

      const metadata: MetadataResponse = {
        providerId: 'musicbrainz',
        providerResultId: mbid,
        fields,
        externalIds: { musicbrainz: mbid },
        completeness: 0.9,
        confidence: 1.0,
      };

      logger.info(`Retrieved MusicBrainz metadata for ${mbid}`, {
        entityType,
        title: fields.title,
      });
      return metadata;
    } catch (error: any) {
      logger.error('MusicBrainz metadata retrieval failed', {
        mbid,
        entityType,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get assets - MusicBrainz does not provide assets
   */
  async getAssets(_request: AssetRequest): Promise<AssetCandidate[]> {
    logger.debug('MusicBrainz does not provide downloadable assets');
    return [];
  }

  /**
   * Test connection to MusicBrainz API
   */
  async testConnection() {
    try {
      // Try a simple artist search
      await this.mbClient.searchArtists('test', 1);
      return {
        success: true,
        message: 'MusicBrainz API is accessible',
      };
    } catch (error: any) {
      return {
        success: false,
        message: `MusicBrainz access failed: ${error.message}`,
        error: error.message,
      };
    }
  }
}
