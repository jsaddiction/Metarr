import { JobQueueService } from './jobQueueService.js';
import { logger } from '../middleware/logging.js';
import crypto from 'crypto';
import { getErrorMessage } from '../utils/errorHandling.js';

/**
 * Webhook Service
 *
 * Receives webhooks from Sonarr/Radarr/Lidarr and creates jobs in the queue.
 *
 * Webhook Sources:
 * - Radarr: Movie download events
 * - Sonarr: TV episode download events
 * - Lidarr: Music album download events (future)
 *
 * Event Types:
 * - Download: Media downloaded and imported (trigger full workflow)
 * - Grab: Media grabbed but not yet downloaded (can trigger metadata fetch)
 * - Rename: Media file renamed (update file paths)
 * - Test: Test webhook (log and ignore)
 */

export interface RadarrWebhook {
  eventType: 'Download' | 'Grab' | 'Rename' | 'Test';
  movie: {
    id: number;
    title: string;
    year: number;
    folderPath: string;
    tmdbId: number;
    imdbId: string;
  };
  movieFile?: {
    id: number;
    relativePath: string;
    path: string;
    quality: string;
    qualityVersion: number;
    releaseGroup: string;
    sceneName: string;
  };
  downloadId?: string;
  release?: {
    quality: string;
    qualityVersion: number;
    releaseGroup: string;
    releaseTitle: string;
    indexer: string;
    size: number;
  };
}

export interface SonarrWebhook {
  eventType: 'Download' | 'Grab' | 'Rename' | 'Test' | 'EpisodeFileDelete';
  series: {
    id: number;
    title: string;
    path: string;
    tvdbId: number;
    tvMazeId?: number;
    imdbId?: string;
    type: string;
  };
  episodes?: Array<{
    id: number;
    episodeNumber: number;
    seasonNumber: number;
    title: string;
    airDate?: string;
    airDateUtc?: string;
    overview?: string;
  }>;
  episodeFile?: {
    id: number;
    relativePath: string;
    path: string;
    quality: string;
    qualityVersion: number;
    releaseGroup: string;
    sceneName: string;
  };
  downloadId?: string;
}

export interface LidarrWebhook {
  eventType: 'Download' | 'Grab' | 'Rename' | 'Test' | 'AlbumDelete';
  artist: {
    id: number;
    name: string;
    path: string;
    mbId: string; // MusicBrainz ID
  };
  albums?: Array<{
    id: number;
    title: string;
    releaseDate: string;
    trackCount: number;
  }>;
  tracks?: Array<{
    id: number;
    title: string;
    trackNumber: number;
    duration: number;
  }>;
  trackFile?: {
    id: number;
    relativePath: string;
    path: string;
    quality: string;
  };
}

export class WebhookService {
  private jobQueue: JobQueueService;

  constructor(jobQueue: JobQueueService) {
    this.jobQueue = jobQueue;
  }

  /**
   * Process Radarr webhook
   */
  async processRadarrWebhook(webhook: RadarrWebhook): Promise<number> {
    logger.info(`Received Radarr webhook: ${webhook.eventType}`, {
      movie: webhook.movie.title,
      year: webhook.movie.year
    });

    // Test webhooks - just log
    if (webhook.eventType === 'Test') {
      logger.info('Radarr test webhook received - connection OK');
      return -1;
    }

    // Create job with priority 1 (critical)
    const jobId = await this.jobQueue.addJob({
      type: 'webhook-received', // Updated to new job type
      priority: 1,
      payload: {
        source: 'radarr',
        eventType: webhook.eventType,
        movie: {
          id: webhook.movie.id,
          title: webhook.movie.title,
          year: webhook.movie.year,
          path: webhook.movie.folderPath,
          tmdbId: webhook.movie.tmdbId,
          imdbId: webhook.movie.imdbId,
          filePath: webhook.movieFile?.path
        }
      } as any, // Webhook-specific payload format
      retry_count: 0,
      max_retries: 3
    });

    logger.info(`Created webhook job ${jobId} for movie: ${webhook.movie.title}`);

    return jobId;
  }

  /**
   * Process Sonarr webhook
   */
  async processSonarrWebhook(webhook: SonarrWebhook): Promise<number> {
    logger.info(`Received Sonarr webhook: ${webhook.eventType}`, {
      series: webhook.series.title,
      episodes: webhook.episodes?.length || 0
    });

    // Test webhooks - just log
    if (webhook.eventType === 'Test') {
      logger.info('Sonarr test webhook received - connection OK');
      return -1;
    }

    // Create job with priority 1 (critical)
    const jobId = await this.jobQueue.addJob({
      type: 'webhook-received', // Updated to new job type
      priority: 1,
      payload: {
        source: 'sonarr',
        eventType: webhook.eventType,
        series: {
          id: webhook.series.id,
          title: webhook.series.title,
          path: webhook.series.path,
          tvdbId: webhook.series.tvdbId,
          imdbId: webhook.series.imdbId
        },
        episodes: webhook.episodes?.map(ep => ({
          id: ep.id,
          episodeNumber: ep.episodeNumber,
          seasonNumber: ep.seasonNumber,
          title: ep.title,
          airDate: ep.airDate
        })),
        episodeFile: webhook.episodeFile ? {
          path: webhook.episodeFile.path,
          relativePath: webhook.episodeFile.relativePath
        } : undefined
      } as any, // Webhook-specific payload format
      retry_count: 0,
      max_retries: 3
    });

    logger.info(`Created webhook job ${jobId} for series: ${webhook.series.title}`);

    return jobId;
  }

  /**
   * Process Lidarr webhook
   */
  async processLidarrWebhook(webhook: LidarrWebhook): Promise<number> {
    logger.info(`Received Lidarr webhook: ${webhook.eventType}`, {
      artist: webhook.artist.name,
      albums: webhook.albums?.length || 0
    });

    // Test webhooks - just log
    if (webhook.eventType === 'Test') {
      logger.info('Lidarr test webhook received - connection OK');
      return -1;
    }

    // Create job with priority 1 (critical)
    const jobId = await this.jobQueue.addJob({
      type: 'webhook-received', // Updated to new job type
      priority: 1,
      payload: {
        source: 'lidarr',
        eventType: webhook.eventType,
        artist: {
          id: webhook.artist.id,
          name: webhook.artist.name,
          path: webhook.artist.path,
          mbId: webhook.artist.mbId
        },
        albums: webhook.albums,
        tracks: webhook.tracks
      } as any, // Webhook-specific payload format
      retry_count: 0,
      max_retries: 3
    });

    logger.info(`Created webhook job ${jobId} for artist: ${webhook.artist.name}`);

    return jobId;
  }

  /**
   * Validate Radarr webhook signature (if configured)
   */
  validateRadarrSignature(payload: string, signature: string, secret: string): boolean {
    return this.validateHMACSignature(payload, signature, secret);
  }

  /**
   * Validate Sonarr webhook signature (if configured)
   */
  validateSonarrSignature(payload: string, signature: string, secret: string): boolean {
    return this.validateHMACSignature(payload, signature, secret);
  }

  /**
   * Validate Lidarr webhook signature (if configured)
   */
  validateLidarrSignature(payload: string, signature: string, secret: string): boolean {
    return this.validateHMACSignature(payload, signature, secret);
  }

  /**
   * Validate HMAC-SHA256 signature
   * Used by Radarr, Sonarr, and Lidarr webhooks
   */
  private validateHMACSignature(payload: string, providedSignature: string, secret: string): boolean {
    try {
      // Create HMAC-SHA256 hash
      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(payload);
      const calculatedSignature = hmac.digest('hex');

      // Compare signatures (timing-safe comparison)
      return crypto.timingSafeEqual(
        Buffer.from(calculatedSignature, 'hex'),
        Buffer.from(providedSignature, 'hex')
      );
    } catch (error) {
      logger.error('Failed to validate HMAC signature', { error: getErrorMessage(error) });
      return false;
    }
  }
}
