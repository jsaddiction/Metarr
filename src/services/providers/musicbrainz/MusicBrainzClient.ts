/**
 * MusicBrainz API Client
 *
 * Official API for music metadata from the MusicBrainz database.
 * Free and open-source, community-maintained database.
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { logger } from '../../../middleware/logging.js';
import { CircuitBreaker } from '../utils/CircuitBreaker.js';
import {
  RateLimitError,
  ProviderServerError,
  NetworkError,
  ErrorCode,
  NETWORK_RETRY_POLICY,
  RetryStrategy,
} from '../../../errors/index.js';
import {
  MusicBrainzArtistSearchResult,
  MusicBrainzArtistsSearchResponse,
  MusicBrainzReleaseGroupSearchResult,
  MusicBrainzReleaseGroupsSearchResponse,
  MusicBrainzRecordingSearchResult,
  MusicBrainzRecordingsSearchResponse,
  MusicBrainzArtistDetail,
  MusicBrainzReleaseGroupDetail,
  MusicBrainzRecordingDetail,
  MusicBrainzAlias,
  MusicBrainzGenre,
  MusicBrainzArtistCredit,
} from '../../../types/providers/musicbrainz.js';

export interface MusicBrainzSearchResult {
  id: string; // MBID
  name: string;
  score: number; // 0-100
  type?: string;
  disambiguation?: string;
}

export interface MusicBrainzArtist {
  id: string; // MBID
  name: string;
  sortName?: string;
  disambiguation?: string;
  type?: string;
  country?: string;
  lifeSpan?: {
    begin?: string;
    end?: string;
    ended?: boolean;
  };
  aliases?: Array<{ name: string; sortName?: string }>;
  genres?: Array<{ name: string }>;
}

export interface MusicBrainzReleaseGroup {
  id: string; // MBID
  title: string;
  disambiguation?: string;
  primaryType?: string;
  secondaryTypes?: string[];
  firstReleaseDate?: string;
  artistCredit?: Array<{
    artist: {
      id: string;
      name: string;
    };
  }>;
}

export interface MusicBrainzRecording {
  id: string; // MBID
  title: string;
  length?: number; // milliseconds
  disambiguation?: string;
  artistCredit?: Array<{
    artist: {
      id: string;
      name: string;
    };
  }>;
}

export class MusicBrainzClient {
  private client: AxiosInstance;
  private circuitBreaker: CircuitBreaker;
  private retryStrategy: RetryStrategy;
  private baseUrl = 'https://musicbrainz.org/ws/2';
  private appName: string;
  private appVersion: string;
  private contact: string;

  constructor(options: { appName: string; appVersion: string; contact: string }) {
    this.appName = options.appName;
    this.appVersion = options.appVersion;
    this.contact = options.contact;

    // Initialize circuit breaker
    this.circuitBreaker = new CircuitBreaker({
      threshold: 5,
      resetTimeoutMs: 5 * 60 * 1000, // 5 minutes
      providerName: 'MusicBrainz',
    });

    // Initialize retry strategy with network-specific policy
    this.retryStrategy = new RetryStrategy({
      ...NETWORK_RETRY_POLICY,
      onRetry: (error, attemptNumber, delayMs) => {
        logger.info('Retrying MusicBrainz request', {
          error: error.message,
          attemptNumber,
          delayMs,
        });
      },
    });

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'User-Agent': `${this.appName}/${this.appVersion} ( ${this.contact} )`,
        Accept: 'application/json',
      },
    });

    logger.info('MusicBrainz client initialized', {
      userAgent: `${this.appName}/${this.appVersion}`,
    });
  }

  /**
   * Convert Axios errors to ApplicationError types
   */
  private convertToApplicationError(error: unknown, endpoint: string): Error {
    const axiosError = error as AxiosError;
    const context = {
      service: 'MusicBrainzClient',
      operation: 'request',
      metadata: { endpoint },
    };

    // Handle HTTP response errors
    if (axiosError.response) {
      const status = axiosError.response.status;
      const message = axiosError.message;

      switch (status) {
        case 429:
          // Rate limit - MusicBrainz enforces strict 1 req/sec
          return new RateLimitError(
            'MusicBrainz',
            60, // Default 60 seconds
            `Rate limit exceeded: ${message}`,
            { ...context, metadata: { ...context.metadata, status } }
          );

        case 500:
        case 502:
        case 503:
        case 504:
          // Server errors - retryable
          return new ProviderServerError(
            'MusicBrainz',
            status,
            `Server error: ${message}`,
            { ...context, metadata: { ...context.metadata, status } },
            axiosError
          );

        default:
          // Other HTTP errors
          return new ProviderServerError(
            'MusicBrainz',
            status,
            `API error (${status}): ${message}`,
            { ...context, metadata: { ...context.metadata, status } },
            axiosError
          );
      }
    }

    // Network errors (timeout, connection refused, etc.) - retryable
    if (axiosError.code === 'ECONNABORTED' || axiosError.code === 'ETIMEDOUT') {
      return new NetworkError(
        `MusicBrainz request timeout: ${endpoint}`,
        ErrorCode.NETWORK_TIMEOUT,
        endpoint,
        { ...context, metadata: { ...context.metadata, code: axiosError.code } },
        axiosError
      );
    }

    return new NetworkError(
      `MusicBrainz network error: ${axiosError.message}`,
      ErrorCode.NETWORK_CONNECTION_FAILED,
      endpoint,
      { ...context, metadata: { ...context.metadata, code: axiosError.code } },
      axiosError
    );
  }

  /**
   * Search for artists by name
   */
  async searchArtists(query: string, limit: number = 25): Promise<MusicBrainzSearchResult[]> {
    return this.circuitBreaker.execute(async () => {
      return this.retryStrategy.execute(async () => {
        try {
          const response = await this.client.get<MusicBrainzArtistsSearchResponse>('/artist', {
            params: {
              query,
              fmt: 'json',
              limit,
            },
          });

          const artists = response.data.artists || [];
          return artists.map((artist: MusicBrainzArtistSearchResult) => {
            const result: MusicBrainzSearchResult = {
              id: artist.id,
              name: artist.name,
              score: artist.score || 0,
            };
            if (artist.type !== undefined) result.type = artist.type;
            if (artist.disambiguation !== undefined) result.disambiguation = artist.disambiguation;
            return result;
          });
        } catch (error) {
          throw this.convertToApplicationError(error, '/artist');
        }
      }, 'MusicBrainz artist search');
    });
  }

  /**
   * Get detailed artist information
   */
  async getArtist(mbid: string): Promise<MusicBrainzArtist> {
    return this.circuitBreaker.execute(async () => {
      return this.retryStrategy.execute(async () => {
        try {
          const response = await this.client.get<MusicBrainzArtistDetail>(`/artist/${mbid}`, {
            params: {
              fmt: 'json',
              inc: 'aliases+genres',
            },
          });

          const data = response.data;
          const artist: MusicBrainzArtist = {
            id: data.id,
            name: data.name,
            ...(data['sort-name'] && { sortName: data['sort-name'] }),
            ...(data.disambiguation && { disambiguation: data.disambiguation }),
            ...(data.type && { type: data.type }),
            ...(data.country && { country: data.country }),
            ...(data['life-span'] && {
              lifeSpan: {
                ...(data['life-span'].begin && { begin: data['life-span'].begin }),
                ...(data['life-span'].end && { end: data['life-span'].end }),
                ...(data['life-span'].ended !== undefined && { ended: data['life-span'].ended }),
              },
            }),
            ...(data.aliases && {
              aliases: data.aliases.map((alias: MusicBrainzAlias) => ({
                name: alias.name,
                ...(alias['sort-name'] && { sortName: alias['sort-name'] }),
              })),
            }),
            ...(data.genres && { genres: data.genres.map((genre: MusicBrainzGenre) => ({ name: genre.name })) }),
          };
          return artist;
        } catch (error) {
          throw this.convertToApplicationError(error, `/artist/${mbid}`);
        }
      }, 'MusicBrainz artist lookup');
    });
  }

  /**
   * Search for release groups (albums) by title
   */
  async searchReleaseGroups(
    query: string,
    limit: number = 25
  ): Promise<MusicBrainzSearchResult[]> {
    return this.circuitBreaker.execute(async () => {
      return this.retryStrategy.execute(async () => {
        try {
          const response = await this.client.get<MusicBrainzReleaseGroupsSearchResponse>('/release-group', {
            params: {
              query,
              fmt: 'json',
              limit,
            },
          });

          const releaseGroups = response.data['release-groups'] || [];
          return releaseGroups.map((rg: MusicBrainzReleaseGroupSearchResult) => {
            const result: MusicBrainzSearchResult = {
              id: rg.id,
              name: rg.title,
              score: rg.score || 0,
            };
            if (rg['primary-type'] !== undefined) result.type = rg['primary-type'];
            if (rg.disambiguation !== undefined) result.disambiguation = rg.disambiguation;
            return result;
          });
        } catch (error) {
          throw this.convertToApplicationError(error, '/release-group');
        }
      }, 'MusicBrainz release group search');
    });
  }

  /**
   * Get detailed release group (album) information
   */
  async getReleaseGroup(mbid: string): Promise<MusicBrainzReleaseGroup> {
    return this.circuitBreaker.execute(async () => {
      return this.retryStrategy.execute(async () => {
        try {
          const response = await this.client.get<MusicBrainzReleaseGroupDetail>(`/release-group/${mbid}`, {
            params: {
              fmt: 'json',
              inc: 'artist-credits',
            },
          });

          const data = response.data;
          const result: MusicBrainzReleaseGroup = {
            id: data.id,
            title: data.title,
          };

          // Add optional properties explicitly
          if (data.disambiguation !== undefined) result.disambiguation = data.disambiguation;
          if (data['primary-type'] !== undefined) result.primaryType = data['primary-type'];
          if (data['secondary-types'] !== undefined) result.secondaryTypes = data['secondary-types'];
          if (data['first-release-date'] !== undefined) result.firstReleaseDate = data['first-release-date'];
          if (data['artist-credit'] !== undefined) {
            result.artistCredit = data['artist-credit'].map((credit: MusicBrainzArtistCredit) => ({
              artist: {
                id: credit.artist.id,
                name: credit.artist.name,
              },
            }));
          }

          return result;
        } catch (error) {
          throw this.convertToApplicationError(error, `/release-group/${mbid}`);
        }
      }, 'MusicBrainz release group lookup');
    });
  }

  /**
   * Search for recordings (tracks) by title
   */
  async searchRecordings(query: string, limit: number = 25): Promise<MusicBrainzSearchResult[]> {
    return this.circuitBreaker.execute(async () => {
      return this.retryStrategy.execute(async () => {
        try {
          const response = await this.client.get<MusicBrainzRecordingsSearchResponse>('/recording', {
            params: {
              query,
              fmt: 'json',
              limit,
            },
          });

          const recordings = response.data.recordings || [];
          return recordings.map((recording: MusicBrainzRecordingSearchResult) => {
            const result: MusicBrainzSearchResult = {
              id: recording.id,
              name: recording.title,
              score: recording.score || 0,
            };
            if (recording.disambiguation !== undefined) result.disambiguation = recording.disambiguation;
            return result;
          });
        } catch (error) {
          throw this.convertToApplicationError(error, '/recording');
        }
      }, 'MusicBrainz recording search');
    });
  }

  /**
   * Get detailed recording (track) information
   */
  async getRecording(mbid: string): Promise<MusicBrainzRecording> {
    return this.circuitBreaker.execute(async () => {
      return this.retryStrategy.execute(async () => {
        try {
          const response = await this.client.get<MusicBrainzRecordingDetail>(`/recording/${mbid}`, {
            params: {
              fmt: 'json',
              inc: 'artist-credits',
            },
          });

          const data = response.data;
          const result: MusicBrainzRecording = {
            id: data.id,
            title: data.title,
          };

          // Add optional properties explicitly
          if (data.length !== undefined) result.length = data.length;
          if (data.disambiguation !== undefined) result.disambiguation = data.disambiguation;
          if (data['artist-credit'] !== undefined) {
            result.artistCredit = data['artist-credit'].map((credit: MusicBrainzArtistCredit) => ({
              artist: {
                id: credit.artist.id,
                name: credit.artist.name,
              },
            }));
          }

          return result;
        } catch (error) {
          throw this.convertToApplicationError(error, `/recording/${mbid}`);
        }
      }, 'MusicBrainz recording lookup');
    });
  }
}
