import { Request, Response, NextFunction } from 'express';
import {
  SonarrWebhookPayload,
  RadarrWebhookPayload,
  LidarrWebhookPayload,
} from '../types/webhooks.js';
import { ValidationError } from '../errors/ApplicationError.js';
import { logger } from '../middleware/logging.js';
import { WebhookProcessingService } from '../services/webhookProcessingService.js';
import { DatabaseManager } from '../database/DatabaseManager.js';
import { MediaPlayerConnectionManager } from '../services/mediaPlayerConnectionManager.js';

export class WebhookController {
  private webhookService: WebhookProcessingService;
  private db: DatabaseManager;

  constructor(dbManager: DatabaseManager, connectionManager: MediaPlayerConnectionManager, jobQueue?: unknown) {
    // Type guard: ensure jobQueue is JobQueueService or undefined
    const typedJobQueue = jobQueue as import('../services/jobQueue/JobQueueService.js').JobQueueService | undefined;
    this.webhookService = new WebhookProcessingService(dbManager, connectionManager, typedJobQueue);
    this.db = dbManager;
  }

  /**
   * Load webhook configuration from database
   */
  private async getWebhookConfig(service: 'radarr' | 'sonarr' | 'lidarr'): Promise<Record<string, unknown>> {
    const conn = this.db.getConnection();
    const config = await conn.get(
      'SELECT * FROM webhook_config WHERE service = ?',
      [service]
    );
    return config;
  }

  /**
   * Log webhook event to database
   */
  private async logWebhookEvent(
    source: 'radarr' | 'sonarr' | 'lidarr',
    eventType: string,
    payload: unknown,
    jobId?: number
  ): Promise<number> {
    const conn = this.db.getConnection();
    const result = await conn.execute(
      `INSERT INTO webhook_events (source, event_type, payload, processed, job_id, created_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [source, eventType, JSON.stringify(payload), jobId ? 1 : 0, jobId || null]
    );
    return result.insertId!;
  }

  /**
   * Mark webhook event as processed
   */
  private async markEventProcessed(eventId: number, jobId?: number): Promise<void> {
    const conn = this.db.getConnection();
    await conn.execute(
      `UPDATE webhook_events SET processed = 1, processed_at = CURRENT_TIMESTAMP, job_id = ?
       WHERE id = ?`,
      [jobId || null, eventId]
    );
  }

  /**
   * Validate HTTP Basic Authentication
   * Parses Authorization header and compares credentials
   */
  private validateBasicAuth(authHeader: string | undefined, expectedUsername: string, expectedPassword: string): boolean {
    if (!authHeader || !authHeader.startsWith('Basic ')) {
      return false;
    }

    try {
      const base64Credentials = authHeader.substring(6); // Remove 'Basic ' prefix
      const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
      const [username, password] = credentials.split(':');

      return username === expectedUsername && password === expectedPassword;
    } catch (error) {
      logger.error('Basic Auth validation error', { error });
      return false;
    }
  }

  async handleSonarr(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Load webhook configuration from database
      const config = await this.getWebhookConfig('sonarr');

      // Check if webhook is enabled
      if (!config || !config.enabled) {
        logger.warn('Sonarr webhook rejected: Webhook disabled in configuration');
        res.status(403).json({ error: 'Sonarr webhook is disabled' });
        return;
      }

      // SECURITY: Validate HTTP Basic Auth if enabled
      if (config.auth_enabled && config.auth_username && config.auth_password) {
        const authHeader = req.headers.authorization;

        if (!authHeader) {
          logger.warn('Sonarr webhook rejected: Missing Authorization header');
          res.status(401).json({ error: 'Missing Authorization header' });
          return;
        }

        const isValid = this.validateBasicAuth(authHeader, String(config.auth_username ?? ''), String(config.auth_password ?? ''));

        if (!isValid) {
          logger.warn('Sonarr webhook rejected: Invalid credentials');
          res.status(401).json({ error: 'Invalid credentials' });
          return;
        }

        logger.debug('Sonarr webhook authentication successful');
      }

      const payload = req.body as SonarrWebhookPayload;

      // Validate payload structure
      this.validateSonarrPayload(payload);

      logger.info('Received Sonarr webhook', {
        eventType: payload.eventType,
        seriesTitle: payload.series?.title,
        episodeCount: payload.episodes?.length || 0,
      });

      // Log webhook event to database
      const eventId = await this.logWebhookEvent('sonarr', payload.eventType, payload);

      // Process based on event type
      // Note: Full Sonarr support deferred to Stage 9 (TV Shows)
      let jobId: number | undefined;
      switch (payload.eventType) {
        case 'Test':
          logger.info('Sonarr test webhook received successfully');
          break;
        default:
          // Log all Sonarr events for now (full implementation in Stage 9)
          await this.webhookService.handleGenericEvent('sonarr', payload.eventType, payload);
      }

      // Mark event as processed
      await this.markEventProcessed(eventId, jobId);

      res.json({ status: 'success', message: 'Webhook processed successfully', eventId });
    } catch (error) {
      next(error);
    }
  }

  async handleRadarr(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Load webhook configuration from database
      const config = await this.getWebhookConfig('radarr');

      // Check if webhook is enabled
      if (!config || !config.enabled) {
        logger.warn('Radarr webhook rejected: Webhook disabled in configuration');
        res.status(403).json({ error: 'Radarr webhook is disabled' });
        return;
      }

      // SECURITY: Validate HTTP Basic Auth if enabled
      if (config.auth_enabled && config.auth_username && config.auth_password) {
        const authHeader = req.headers.authorization;

        if (!authHeader) {
          logger.warn('Radarr webhook rejected: Missing Authorization header');
          res.status(401).json({ error: 'Missing Authorization header' });
          return;
        }

        const isValid = this.validateBasicAuth(authHeader, String(config.auth_username ?? ''), String(config.auth_password ?? ''));

        if (!isValid) {
          logger.warn('Radarr webhook rejected: Invalid credentials');
          res.status(401).json({ error: 'Invalid credentials' });
          return;
        }

        logger.debug('Radarr webhook authentication successful');
      }

      const payload = req.body as RadarrWebhookPayload;

      // Validate payload structure
      this.validateRadarrPayload(payload);

      logger.info('Received Radarr webhook', {
        eventType: payload.eventType,
        movieTitle: payload.movie?.title,
        movieYear: payload.movie?.year,
      });

      // Log webhook event to database
      const eventId = await this.logWebhookEvent('radarr', payload.eventType, payload);

      // Process based on event type
      let jobId: number | undefined;
      switch (payload.eventType) {
        case 'Grab':
          jobId = await this.webhookService.handleRadarrGrab(payload);
          break;
        case 'Download':
          jobId = await this.webhookService.handleRadarrDownload(payload);
          break;
        case 'Rename':
          jobId = await this.webhookService.handleRadarrRename(payload);
          break;
        case 'MovieFileDeleted':
          jobId = await this.webhookService.handleRadarrMovieFileDelete(payload);
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

      // Mark event as processed
      await this.markEventProcessed(eventId, jobId);

      res.json({ status: 'success', message: 'Webhook processed successfully', eventId });
    } catch (error) {
      next(error);
    }
  }

  async handleLidarr(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Load webhook configuration from database
      const config = await this.getWebhookConfig('lidarr');

      // Check if webhook is enabled
      if (!config || !config.enabled) {
        logger.warn('Lidarr webhook rejected: Webhook disabled in configuration');
        res.status(403).json({ error: 'Lidarr webhook is disabled' });
        return;
      }

      // SECURITY: Validate HTTP Basic Auth if enabled
      if (config.auth_enabled && config.auth_username && config.auth_password) {
        const authHeader = req.headers.authorization;

        if (!authHeader) {
          logger.warn('Lidarr webhook rejected: Missing Authorization header');
          res.status(401).json({ error: 'Missing Authorization header' });
          return;
        }

        const isValid = this.validateBasicAuth(authHeader, String(config.auth_username ?? ''), String(config.auth_password ?? ''));

        if (!isValid) {
          logger.warn('Lidarr webhook rejected: Invalid credentials');
          res.status(401).json({ error: 'Invalid credentials' });
          return;
        }

        logger.debug('Lidarr webhook authentication successful');
      }

      const payload = req.body as LidarrWebhookPayload;

      // Validate payload structure
      this.validateLidarrPayload(payload);

      logger.info('Received Lidarr webhook', {
        eventType: payload.eventType,
        artistName: payload.artist?.name,
        albumCount: payload.albums?.length || 0,
      });

      // Log webhook event to database
      const eventId = await this.logWebhookEvent('lidarr', payload.eventType, payload);

      // Process based on event type
      // Note: Full Lidarr support deferred to Stage 10 (Music)
      let jobId: number | undefined;
      switch (payload.eventType) {
        case 'Test':
          logger.info('Lidarr test webhook received successfully');
          break;
        default:
          // Log all Lidarr events for now (full implementation in Stage 10)
          await this.webhookService.handleGenericEvent('lidarr', payload.eventType, payload);
      }

      // Mark event as processed
      await this.markEventProcessed(eventId, jobId);

      res.json({ status: 'success', message: 'Webhook processed successfully', eventId });
    } catch (error) {
      next(error);
    }
  }

  private validateSonarrPayload(payload: SonarrWebhookPayload): void {
    if (!payload.eventType) {
      throw new ValidationError('Missing eventType in Sonarr webhook payload', {
        service: 'WebhookController',
        operation: 'validateSonarrPayload',
      });
    }

    if (payload.eventType === 'Download' && !payload.series) {
      throw new ValidationError('Missing series data in Sonarr download webhook', {
        service: 'WebhookController',
        operation: 'validateSonarrPayload',
        metadata: { eventType: payload.eventType },
      });
    }
  }

  private validateRadarrPayload(payload: RadarrWebhookPayload): void {
    if (!payload.eventType) {
      throw new ValidationError('Missing eventType in Radarr webhook payload', {
        service: 'WebhookController',
        operation: 'validateRadarrPayload',
      });
    }

    if (payload.eventType === 'Download' && !payload.movie) {
      throw new ValidationError('Missing movie data in Radarr download webhook', {
        service: 'WebhookController',
        operation: 'validateRadarrPayload',
        metadata: { eventType: payload.eventType },
      });
    }
  }

  private validateLidarrPayload(payload: LidarrWebhookPayload): void {
    if (!payload.eventType) {
      throw new ValidationError('Missing eventType in Lidarr webhook payload', {
        service: 'WebhookController',
        operation: 'validateLidarrPayload',
      });
    }

    if (payload.eventType === 'Download' && !payload.artist) {
      throw new ValidationError('Missing artist data in Lidarr download webhook', {
        service: 'WebhookController',
        operation: 'validateLidarrPayload',
        metadata: { eventType: payload.eventType },
      });
    }
  }

  // Removed: Old stub handlers (handleSonarrDownload, handleSonarrSeriesAdd, etc.)
  // Now using webhookService.handleGenericEvent() for Sonarr/Lidarr
  // Full implementation deferred to Stage 9 (TV) and Stage 10 (Music)
}
