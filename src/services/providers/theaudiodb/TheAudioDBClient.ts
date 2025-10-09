/**
 * TheAudioDB API Client
 *
 * Official API for music artwork and supplementary metadata.
 * Provides high-quality album art, artist images, and logos.
 */

import axios, { AxiosInstance } from 'axios';
import { logger } from '../../../middleware/logging.js';

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
  private client: AxiosInstance;
  private baseUrl = 'https://www.theaudiodb.com/api/v1/json';
  private apiKey: string;

  constructor(apiKey: string = '1') {
    // Default to test API key
    this.apiKey = apiKey;

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
   * Search for artist by name
   */
  async searchArtist(artistName: string): Promise<TheAudioDBArtist[]> {
    try {
      const response = await this.client.get('/search.php', {
        params: {
          s: artistName,
        },
      });

      const artists = response.data.artists || [];
      return artists;
    } catch (error: any) {
      logger.error('TheAudioDB artist search failed', {
        artistName,
        error: error.message,
      });
      throw new Error(`TheAudioDB artist search failed: ${error.message}`);
    }
  }

  /**
   * Get artist by MusicBrainz ID
   */
  async getArtistByMBID(mbid: string): Promise<TheAudioDBArtist | null> {
    try {
      const response = await this.client.get('/artist-mb.php', {
        params: {
          i: mbid,
        },
      });

      const artists = response.data.artists || [];
      return artists[0] || null;
    } catch (error: any) {
      logger.error('TheAudioDB artist lookup by MBID failed', {
        mbid,
        error: error.message,
      });
      throw new Error(`TheAudioDB artist lookup failed: ${error.message}`);
    }
  }

  /**
   * Search for album by artist and album name
   */
  async searchAlbum(artistName: string, albumName?: string): Promise<TheAudioDBAlbum[]> {
    try {
      const params: any = { s: artistName };
      if (albumName) {
        params.a = albumName;
      }

      const response = await this.client.get('/searchalbum.php', { params });

      const albums = response.data.album || [];
      return albums;
    } catch (error: any) {
      logger.error('TheAudioDB album search failed', {
        artistName,
        albumName,
        error: error.message,
      });
      throw new Error(`TheAudioDB album search failed: ${error.message}`);
    }
  }

  /**
   * Get album by MusicBrainz ID
   */
  async getAlbumByMBID(mbid: string): Promise<TheAudioDBAlbum | null> {
    try {
      const response = await this.client.get('/album-mb.php', {
        params: {
          i: mbid,
        },
      });

      const albums = response.data.album || [];
      return albums[0] || null;
    } catch (error: any) {
      logger.error('TheAudioDB album lookup by MBID failed', {
        mbid,
        error: error.message,
      });
      throw new Error(`TheAudioDB album lookup failed: ${error.message}`);
    }
  }
}
