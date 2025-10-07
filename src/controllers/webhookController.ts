import { Request, Response, NextFunction } from 'express';
import {
  SonarrWebhookPayload,
  RadarrWebhookPayload,
  LidarrWebhookPayload,
} from '../types/webhooks.js';
import { ValidationError } from '../middleware/errorHandler.js';
import { logger } from '../middleware/logging.js';
import { WebhookProcessingService } from '../services/webhookProcessingService.js';
import { DatabaseManager } from '../database/DatabaseManager.js';

export class WebhookController {
  private webhookService: WebhookProcessingService;

  constructor(dbManager: DatabaseManager) {
    this.webhookService = new WebhookProcessingService(dbManager);
  }

  async handleSonarr(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const payload = req.body as SonarrWebhookPayload;

      // Validate payload
      this.validateSonarrPayload(payload);

      logger.info('Received Sonarr webhook', {
        eventType: payload.eventType,
        seriesTitle: payload.series?.title,
        episodeCount: payload.episodes?.length || 0,
      });

      // Process based on event type
      switch (payload.eventType) {
        case 'Download':
          await this.handleSonarrDownload(payload);
          break;
        case 'SeriesAdd':
          await this.handleSonarrSeriesAdd(payload);
          break;
        case 'Test':
          logger.info('Sonarr test webhook received successfully');
          break;
        default:
          logger.info(`Sonarr event type '${payload.eventType}' not handled`);
      }

      res.json({ status: 'success', message: 'Webhook processed successfully' });
    } catch (error) {
      next(error);
    }
  }

  async handleRadarr(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const payload = req.body as RadarrWebhookPayload;

      // Validate payload
      this.validateRadarrPayload(payload);

      logger.info('Received Radarr webhook', {
        eventType: payload.eventType,
        movieTitle: payload.movie?.title,
        movieYear: payload.movie?.year,
      });

      // Process based on event type
      switch (payload.eventType) {
        case 'Grab':
          await this.webhookService.handleRadarrGrab(payload);
          break;
        case 'Download':
          await this.webhookService.handleRadarrDownload(payload);
          break;
        case 'Rename':
          await this.webhookService.handleRadarrRename(payload);
          break;
        case 'MovieFileDeleted':
          await this.webhookService.handleRadarrMovieFileDelete(payload);
          break;
        case 'MovieAdded':
          await this.handleRadarrMovieAdd(payload);
          break;
        case 'Test':
          logger.info('Radarr test webhook received successfully');
          break;
        default:
          logger.info(`Radarr event type '${payload.eventType}' not handled`);
      }

      res.json({ status: 'success', message: 'Webhook processed successfully' });
    } catch (error) {
      next(error);
    }
  }

  async handleLidarr(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const payload = req.body as LidarrWebhookPayload;

      // Validate payload
      this.validateLidarrPayload(payload);

      logger.info('Received Lidarr webhook', {
        eventType: payload.eventType,
        artistName: payload.artist?.name,
        albumCount: payload.albums?.length || 0,
      });

      // Process based on event type
      switch (payload.eventType) {
        case 'Download':
          await this.handleLidarrDownload(payload);
          break;
        case 'ArtistAdded':
          await this.handleLidarrArtistAdd(payload);
          break;
        case 'Test':
          logger.info('Lidarr test webhook received successfully');
          break;
        default:
          logger.info(`Lidarr event type '${payload.eventType}' not handled`);
      }

      res.json({ status: 'success', message: 'Webhook processed successfully' });
    } catch (error) {
      next(error);
    }
  }

  private validateSonarrPayload(payload: SonarrWebhookPayload): void {
    if (!payload.eventType) {
      throw new ValidationError('Missing eventType in Sonarr webhook payload');
    }

    if (payload.eventType === 'Download' && !payload.series) {
      throw new ValidationError('Missing series data in Sonarr download webhook');
    }
  }

  private validateRadarrPayload(payload: RadarrWebhookPayload): void {
    if (!payload.eventType) {
      throw new ValidationError('Missing eventType in Radarr webhook payload');
    }

    if (payload.eventType === 'Download' && !payload.movie) {
      throw new ValidationError('Missing movie data in Radarr download webhook');
    }
  }

  private validateLidarrPayload(payload: LidarrWebhookPayload): void {
    if (!payload.eventType) {
      throw new ValidationError('Missing eventType in Lidarr webhook payload');
    }

    if (payload.eventType === 'Download' && !payload.artist) {
      throw new ValidationError('Missing artist data in Lidarr download webhook');
    }
  }

  private async handleSonarrDownload(payload: SonarrWebhookPayload): Promise<void> {
    if (!payload.series || !payload.episodes) {
      return;
    }

    logger.info(`Processing Sonarr download for series: ${payload.series.title}`);

    // TODO: Create job to process series metadata
    // await this.jobService.createJob({
    //   type: 'series_metadata',
    //   priority: 100,
    //   payload: {
    //     seriesId: payload.series.id,
    //     tvdbId: payload.series.tvdbId,
    //     imdbId: payload.series.imdbId,
    //     title: payload.series.title,
    //     path: payload.series.path,
    //     episodes: payload.episodes,
    //   },
    // });
  }

  private async handleSonarrSeriesAdd(payload: SonarrWebhookPayload): Promise<void> {
    if (!payload.series) {
      return;
    }

    logger.info(`Processing Sonarr series add: ${payload.series.title}`);

    // TODO: Create job to process series metadata
    // await this.jobService.createJob({
    //   type: 'series_metadata',
    //   priority: 50,
    //   payload: {
    //     seriesId: payload.series.id,
    //     tvdbId: payload.series.tvdbId,
    //     imdbId: payload.series.imdbId,
    //     title: payload.series.title,
    //     path: payload.series.path,
    //   },
    // });
  }

  private async handleRadarrMovieAdd(payload: RadarrWebhookPayload): Promise<void> {
    if (!payload.movie) {
      return;
    }

    logger.info(`Processing Radarr movie add: ${payload.movie.title} (${payload.movie.year})`);

    // TODO: Create job to process movie metadata
    // await this.jobService.createJob({
    //   type: 'movie_metadata',
    //   priority: 50,
    //   payload: {
    //     movieId: payload.movie.id,
    //     tmdbId: payload.movie.tmdbId,
    //     imdbId: payload.movie.imdbId,
    //     title: payload.movie.title,
    //     year: payload.movie.year,
    //     path: payload.movie.folderPath,
    //   },
    // });
  }

  private async handleLidarrDownload(payload: LidarrWebhookPayload): Promise<void> {
    if (!payload.artist) {
      return;
    }

    logger.info(`Processing Lidarr download for artist: ${payload.artist.name}`);

    // TODO: Create job to process artist metadata
    // await this.jobService.createJob({
    //   type: 'artist_metadata',
    //   priority: 100,
    //   payload: {
    //     artistId: payload.artist.id,
    //     mbId: payload.artist.mbId,
    //     name: payload.artist.name,
    //     path: payload.artist.path,
    //     albums: payload.albums,
    //   },
    // });
  }

  private async handleLidarrArtistAdd(payload: LidarrWebhookPayload): Promise<void> {
    if (!payload.artist) {
      return;
    }

    logger.info(`Processing Lidarr artist add: ${payload.artist.name}`);

    // TODO: Create job to process artist metadata
    // await this.jobService.createJob({
    //   type: 'artist_metadata',
    //   priority: 50,
    //   payload: {
    //     artistId: payload.artist.id,
    //     mbId: payload.artist.mbId,
    //     name: payload.artist.name,
    //     path: payload.artist.path,
    //   },
    // });
  }
}
