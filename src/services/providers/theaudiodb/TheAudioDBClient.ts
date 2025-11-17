/**
 * TheAudioDB API Client
 *
 * Official API for music artwork and supplementary metadata.
 * Provides high-quality album art, artist images, and logos.
 */

import axios, { AxiosInstance } from 'axios';
import { logger } from '../../../middleware/logging.js';
import { getErrorMessage } from '../../../utils/errorHandling.js';
import { CircuitBreaker } from '../utils/CircuitBreaker.js';
import { RetryStrategy, NETWORK_RETRY_POLICY } from '../../../errors/index.js';
import { NetworkError, ProviderError, ErrorCode } from '../../../errors/index.js';

export interface TheAudioDBArtist {
  idArtist: string;
  strArtist: string;
  strArtistThumb?: string;
  strArtistLogo?: string;
  strArtistCutout?: string;
  strArtistClearart?: string;
  strArtistWideThumb?: string;
  strArtistFanart?: string;
  strArtistFanart2?: string;
  strArtistFanart3?: string;
  strArtistBanner?: string;
  strMusicBrainzID?: string;
  strBiographyEN?: string;
  strGenre?: string;
  strMood?: string;
  strStyle?: string;
  intFormedYear?: string;
  intBornYear?: string;
  intDiedYear?: string;
  strCountry?: string;
}

export interface TheAudioDBAlbum {
  idAlbum: string;
  idArtist: string;
  strAlbum: string;
  strAlbumThumb?: string;
  strAlbumThumbHQ?: string;
  strAlbumCDart?: string;
  strAlbumSpine?: string;
  strAlbum3DCase?: string;
  strAlbum3DFlat?: string;
  strAlbum3DFace?: string;
  strAlbum3DThumb?: string;
  strDescriptionEN?: string;
  intYearReleased?: string;
  strGenre?: string;
  strLabel?: string;
  strMood?: string;
  strStyle?: string;
  strTheme?: string;
  strMusicBrainzID?: string;
}

export class TheAudioDBClient {
  private readonly client: AxiosInstance;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly retryStrategy: RetryStrategy;
  private baseUrl = 'https://www.theaudiodb.com/api/v1/json';
  private readonly apiKey: string;

  constructor(apiKey: string = '1') {
    // Default to test API key
    this.apiKey = apiKey;

    this.circuitBreaker = new CircuitBreaker({
      threshold: 5,
      resetTimeoutMs: 5 * 60 * 1000,
      providerName: 'TheAudioDB',
    });

    this.retryStrategy = new RetryStrategy({
      ...NETWORK_RETRY_POLICY,
      onRetry: (error, attemptNumber, delayMs) => {
        logger.info('Retrying TheAudioDB request', {
          error: error.message,
          attemptNumber,
          delayMs,
        });
      },
    });

    this.client = axios.create({
      baseURL: `${this.baseUrl}/${this.apiKey}`,
      timeout: 30000,
      headers: {
        Accept: 'application/json',
      },
    });

    logger.info('TheAudioDB client initialized', { apiKey: this.apiKey });
  }

  /**
   * Convert Axios errors to ApplicationError types
   */
  private convertToApplicationError(
    error: unknown,
    operation: string,
    metadata: Record<string, unknown>
  ): NetworkError | ProviderError {
    if (axios.isAxiosError(error)) {
      const statusCode = error.response?.status;

      if (statusCode === 429) {
        return new ProviderError(
          `Rate limit exceeded`,
          'TheAudioDB',
          ErrorCode.PROVIDER_RATE_LIMIT,
          429,
          true,
          { service: 'TheAudioDBClient', operation, metadata }
        );
      }

      if (statusCode && statusCode >= 500) {
        return new ProviderError(
          `Server error: ${statusCode}`,
          'TheAudioDB',
          ErrorCode.PROVIDER_SERVER_ERROR,
          statusCode,
          true,
          { service: 'TheAudioDBClient', operation, metadata }
        );
      }

      return new NetworkError(
        `Request failed: ${error.message}`,
        ErrorCode.NETWORK_CONNECTION_FAILED,
        undefined,
        { service: 'TheAudioDBClient', operation, metadata },
        error
      );
    }

    return new NetworkError(
      `Unexpected error: ${getErrorMessage(error)}`,
      ErrorCode.NETWORK_CONNECTION_FAILED,
      undefined,
      { service: 'TheAudioDBClient', operation, metadata },
      error instanceof Error ? error : undefined
    );
  }

  /**
   * Search for artist by name
   */
  async searchArtist(artistName: string): Promise<TheAudioDBArtist[]> {
    return this.circuitBreaker.execute(async () => {
      return this.retryStrategy.execute(async () => {
        try {
          const response = await this.client.get('/search.php', {
            params: {
              s: artistName,
            },
          });

          const artists = response.data.artists || [];
          return artists;
        } catch (error) {
          throw this.convertToApplicationError(error, 'searchArtist', { artistName });
        }
      }, 'TheAudioDB artist search');
    });
  }

  /**
   * Get artist by MusicBrainz ID
   */
  async getArtistByMBID(mbid: string): Promise<TheAudioDBArtist | null> {
    return this.circuitBreaker.execute(async () => {
      return this.retryStrategy.execute(async () => {
        try {
          const response = await this.client.get('/artist-mb.php', {
            params: {
              i: mbid,
            },
          });

          const artists = response.data.artists || [];
          return artists[0] || null;
        } catch (error) {
          throw this.convertToApplicationError(error, 'getArtistByMBID', { mbid });
        }
      }, 'TheAudioDB artist lookup by MBID');
    });
  }

  /**
   * Search for album by artist and album name
   */
  async searchAlbum(artistName: string, albumName?: string): Promise<TheAudioDBAlbum[]> {
    return this.circuitBreaker.execute(async () => {
      return this.retryStrategy.execute(async () => {
        try {
          const params: Record<string, unknown> = { s: artistName };
          if (albumName) {
            params.a = albumName;
          }

          const response = await this.client.get('/searchalbum.php', { params });

          const albums = response.data.album || [];
          return albums;
        } catch (error) {
          throw this.convertToApplicationError(error, 'searchAlbum', { artistName, albumName });
        }
      }, 'TheAudioDB album search');
    });
  }

  /**
   * Get album by MusicBrainz ID
   */
  async getAlbumByMBID(mbid: string): Promise<TheAudioDBAlbum | null> {
    return this.circuitBreaker.execute(async () => {
      return this.retryStrategy.execute(async () => {
        try {
          const response = await this.client.get('/album-mb.php', {
            params: {
              i: mbid,
            },
          });

          const albums = response.data.album || [];
          return albums[0] || null;
        } catch (error) {
          throw this.convertToApplicationError(error, 'getAlbumByMBID', { mbid });
        }
      }, 'TheAudioDB album lookup by MBID');
    });
  }
}
