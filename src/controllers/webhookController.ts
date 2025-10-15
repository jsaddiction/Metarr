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
import { MediaPlayerConnectionManager } from '../services/mediaPlayerConnectionManager.js';

export class WebhookController {
  private webhookService: WebhookProcessingService;

  constructor(dbManager: DatabaseManager, connectionManager: MediaPlayerConnectionManager) {
    this.webhookService = new WebhookProcessingService(dbManager, connectionManager);
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
      // Note: Full Sonarr support deferred to Stage 9 (TV Shows)
      switch (payload.eventType) {
        case 'Test':
          logger.info('Sonarr test webhook received successfully');
          break;
        default:
          // Log all Sonarr events for now (full implementation in Stage 9)
          await this.webhookService.handleGenericEvent('sonarr', payload.eventType, payload);
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
        case 'MovieDeleted':
          // Just log these events - no action needed
          await this.webhookService.handleGenericEvent('radarr', payload.eventType, payload);
          break;
        case 'HealthIssue':
          await this.webhookService.handleRadarrHealthIssue(payload);
          break;
        case 'HealthRestored':
          await this.webhookService.handleRadarrHealthRestored(payload);
          break;
        case 'ApplicationUpdate':
          await this.webhookService.handleRadarrApplicationUpdate(payload);
          break;
        case 'ManualInteractionRequired':
          await this.webhookService.handleRadarrManualInteractionRequired(payload);
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
      // Note: Full Lidarr support deferred to Stage 10 (Music)
      switch (payload.eventType) {
        case 'Test':
          logger.info('Lidarr test webhook received successfully');
          break;
        default:
          // Log all Lidarr events for now (full implementation in Stage 10)
          await this.webhookService.handleGenericEvent('lidarr', payload.eventType, payload);
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

  // Removed: Old stub handlers (handleSonarrDownload, handleSonarrSeriesAdd, etc.)
  // Now using webhookService.handleGenericEvent() for Sonarr/Lidarr
  // Full implementation deferred to Stage 9 (TV) and Stage 10 (Music)
}
