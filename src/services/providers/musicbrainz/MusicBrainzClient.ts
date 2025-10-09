/**
 * MusicBrainz API Client
 *
 * Official API for music metadata from the MusicBrainz database.
 * Free and open-source, community-maintained database.
 */

import axios, { AxiosInstance } from 'axios';
import { logger } from '../../../middleware/logging.js';

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
  private baseUrl = 'https://musicbrainz.org/ws/2';
  private appName: string;
  private appVersion: string;
  private contact: string;

  constructor(options: { appName: string; appVersion: string; contact: string }) {
    this.appName = options.appName;
    this.appVersion = options.appVersion;
    this.contact = options.contact;

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
   * Search for artists by name
   */
  async searchArtists(query: string, limit: number = 25): Promise<MusicBrainzSearchResult[]> {
    try {
      const response = await this.client.get('/artist', {
        params: {
          query,
          fmt: 'json',
          limit,
        },
      });

      const artists = response.data.artists || [];
      return artists.map((artist: any) => ({
        id: artist.id,
        name: artist.name,
        score: artist.score || 0,
        type: artist.type,
        disambiguation: artist.disambiguation,
      }));
    } catch (error: any) {
      logger.error('MusicBrainz artist search failed', {
        query,
        error: error.message,
      });
      throw new Error(`MusicBrainz artist search failed: ${error.message}`);
    }
  }

  /**
   * Get detailed artist information
   */
  async getArtist(mbid: string): Promise<MusicBrainzArtist> {
    try {
      const response = await this.client.get(`/artist/${mbid}`, {
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
          aliases: data.aliases.map((alias: any) => ({
            name: alias.name,
            ...(alias['sort-name'] && { sortName: alias['sort-name'] }),
          })),
        }),
        ...(data.genres && { genres: data.genres.map((genre: any) => ({ name: genre.name })) }),
      };
      return artist;
    } catch (error: any) {
      logger.error('MusicBrainz artist lookup failed', {
        mbid,
        error: error.message,
      });
      throw new Error(`MusicBrainz artist lookup failed: ${error.message}`);
    }
  }

  /**
   * Search for release groups (albums) by title
   */
  async searchReleaseGroups(
    query: string,
    limit: number = 25
  ): Promise<MusicBrainzSearchResult[]> {
    try {
      const response = await this.client.get('/release-group', {
        params: {
          query,
          fmt: 'json',
          limit,
        },
      });

      const releaseGroups = response.data['release-groups'] || [];
      return releaseGroups.map((rg: any) => ({
        id: rg.id,
        name: rg.title,
        score: rg.score || 0,
        type: rg['primary-type'],
        disambiguation: rg.disambiguation,
      }));
    } catch (error: any) {
      logger.error('MusicBrainz release group search failed', {
        query,
        error: error.message,
      });
      throw new Error(`MusicBrainz release group search failed: ${error.message}`);
    }
  }

  /**
   * Get detailed release group (album) information
   */
  async getReleaseGroup(mbid: string): Promise<MusicBrainzReleaseGroup> {
    try {
      const response = await this.client.get(`/release-group/${mbid}`, {
        params: {
          fmt: 'json',
          inc: 'artist-credits',
        },
      });

      const data = response.data;
      return {
        id: data.id,
        title: data.title,
        disambiguation: data.disambiguation,
        primaryType: data['primary-type'],
        secondaryTypes: data['secondary-types'],
        firstReleaseDate: data['first-release-date'],
        artistCredit: data['artist-credit']?.map((credit: any) => ({
          artist: {
            id: credit.artist.id,
            name: credit.artist.name,
          },
        })),
      };
    } catch (error: any) {
      logger.error('MusicBrainz release group lookup failed', {
        mbid,
        error: error.message,
      });
      throw new Error(`MusicBrainz release group lookup failed: ${error.message}`);
    }
  }

  /**
   * Search for recordings (tracks) by title
   */
  async searchRecordings(query: string, limit: number = 25): Promise<MusicBrainzSearchResult[]> {
    try {
      const response = await this.client.get('/recording', {
        params: {
          query,
          fmt: 'json',
          limit,
        },
      });

      const recordings = response.data.recordings || [];
      return recordings.map((recording: any) => ({
        id: recording.id,
        name: recording.title,
        score: recording.score || 0,
        disambiguation: recording.disambiguation,
      }));
    } catch (error: any) {
      logger.error('MusicBrainz recording search failed', {
        query,
        error: error.message,
      });
      throw new Error(`MusicBrainz recording search failed: ${error.message}`);
    }
  }

  /**
   * Get detailed recording (track) information
   */
  async getRecording(mbid: string): Promise<MusicBrainzRecording> {
    try {
      const response = await this.client.get(`/recording/${mbid}`, {
        params: {
          fmt: 'json',
          inc: 'artist-credits',
        },
      });

      const data = response.data;
      return {
        id: data.id,
        title: data.title,
        length: data.length,
        disambiguation: data.disambiguation,
        artistCredit: data['artist-credit']?.map((credit: any) => ({
          artist: {
            id: credit.artist.id,
            name: credit.artist.name,
          },
        })),
      };
    } catch (error: any) {
      logger.error('MusicBrainz recording lookup failed', {
        mbid,
        error: error.message,
      });
      throw new Error(`MusicBrainz recording lookup failed: ${error.message}`);
    }
  }
}
