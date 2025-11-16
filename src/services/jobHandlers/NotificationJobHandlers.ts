import { DatabaseConnection } from '../../types/database.js';
import { Job, JobQueueService } from '../jobQueueService.js';
import { NotificationConfigService } from '../notificationConfigService.js';
import { MediaPlayerConnectionManager } from '../mediaPlayerConnectionManager.js';
import { logger } from '../../middleware/logging.js';
import { getErrorMessage } from '../../utils/errorHandling.js';

/**
 * NotificationJobHandlers
 *
 * Handles notification delivery to various services:
 * - Kodi (library scan triggers)
 * - Jellyfin (library scan triggers)
 * - Plex (library scan triggers)
 * - Discord (webhook notifications)
 * - Pushover (push notifications)
 * - Email (SMTP notifications)
 *
 * Each notification service has its own handler for independent failure handling
 * and retry logic. Failed notifications don't affect other services.
 */
export class NotificationJobHandlers {
  constructor(
    private db: DatabaseConnection,
    private notificationConfig: NotificationConfigService,
    private mediaPlayerManager: MediaPlayerConnectionManager
  ) {}

  /**
   * Register all notification handlers
   */
  registerHandlers(jobQueue: JobQueueService): void {
    jobQueue.registerHandler('notify-kodi', this.handleNotifyKodi.bind(this));
    jobQueue.registerHandler('notify-jellyfin', this.handleNotifyJellyfin.bind(this));
    jobQueue.registerHandler('notify-plex', this.handleNotifyPlex.bind(this));
    jobQueue.registerHandler('notify-discord', this.handleNotifyDiscord.bind(this));
    jobQueue.registerHandler('notify-pushover', this.handleNotifyPushover.bind(this));
    jobQueue.registerHandler('notify-email', this.handleNotifyEmail.bind(this));
  }

  /**
   * Handle notify-kodi job
   *
   * Triggers library scan on Kodi instances that manage the affected library.
   * Uses group-based fallback - if one instance fails, tries the next.
   *
   * Payload: {
   *   webhookPayload: { source, eventType, movie?, series?, episodes? },
   *   libraryId: number
   * }
   */
  private async handleNotifyKodi(job: Job): Promise<void> {
    // Check if Kodi notifications are enabled (defensive check)
    const enabled = await this.notificationConfig.isServiceEnabled('kodi');
    if (!enabled) {
      logger.info('[NotificationJobHandlers] Kodi notifications disabled, skipping', {
        service: 'NotificationJobHandlers',
        handler: 'handleNotifyKodi',
        jobId: job.id,
      });
      return;
    }

    logger.info('[NotificationJobHandlers] Sending Kodi notification', {
      service: 'NotificationJobHandlers',
      handler: 'handleNotifyKodi',
      jobId: job.id,
    });

    const { libraryId } = job.payload as { libraryId: number };

    if (!libraryId) {
      logger.warn('[NotificationJobHandlers] No libraryId in payload, cannot notify Kodi', {
        service: 'NotificationJobHandlers',
        handler: 'handleNotifyKodi',
        jobId: job.id,
      });
      return;
    }

    // Get library path for path mapping
    const libraries = await this.db.query<{ path: string }>(
      'SELECT path FROM libraries WHERE id = ?',
      [libraryId]
    );

    if (libraries.length === 0) {
      logger.warn('[NotificationJobHandlers] Library not found, cannot notify Kodi', {
        service: 'NotificationJobHandlers',
        handler: 'handleNotifyKodi',
        jobId: job.id,
        libraryId,
      });
      return;
    }

    const libraryPath = libraries[0].path;

    // Get all groups that manage this library
    const groups = await this.db.query<{
      id: number;
      name: string;
    }>(
      `SELECT DISTINCT mpg.id, mpg.name
       FROM media_player_groups mpg
       INNER JOIN media_player_libraries mpl ON mpg.id = mpl.group_id
       WHERE mpl.library_id = ? AND mpg.type = 'kodi'`,
      [libraryId]
    );

    if (groups.length === 0) {
      logger.debug('[NotificationJobHandlers] No Kodi groups manage this library', {
        service: 'NotificationJobHandlers',
        handler: 'handleNotifyKodi',
        jobId: job.id,
        libraryId,
      });
      return;
    }

    // Trigger scan for each Kodi group
    for (const group of groups) {
      try {
        await this.triggerKodiGroupScan(group.id, libraryPath);
      } catch (error) {
        logger.error('[NotificationJobHandlers] Failed to trigger scan for Kodi group', {
          service: 'NotificationJobHandlers',
          handler: 'handleNotifyKodi',
          groupId: group.id,
          groupName: group.name,
          error: getErrorMessage(error),
        });
        // Continue with other groups even if one fails
      }
    }

    logger.info('[NotificationJobHandlers] Kodi notification sent', {
      service: 'NotificationJobHandlers',
      handler: 'handleNotifyKodi',
      jobId: job.id,
      groupsNotified: groups.length,
    });
  }

  /**
   * Trigger scan on one instance in a Kodi group (with fallback)
   */
  private async triggerKodiGroupScan(groupId: number, libraryPath: string): Promise<void> {
    // Get all enabled Kodi players in this group
    const players = await this.db.query<{
      id: number;
      name: string;
    }>(
      `SELECT id, name
       FROM media_players
       WHERE group_id = ? AND enabled = 1 AND type = 'kodi'
       ORDER BY id ASC`,
      [groupId]
    );

    if (players.length === 0) {
      logger.warn('[NotificationJobHandlers] No enabled Kodi players in group', {
        service: 'NotificationJobHandlers',
        groupId,
      });
      return;
    }

    // Apply group-level path mapping
    let mappedPath: string;
    try {
      const { applyGroupPathMapping } = await import('../pathMappingService.js');
      mappedPath = await applyGroupPathMapping(this.db, groupId, libraryPath);
    } catch (error) {
      logger.warn('[NotificationJobHandlers] Group path mapping failed, using original path', {
        service: 'NotificationJobHandlers',
        groupId,
        libraryPath,
        error: getErrorMessage(error),
      });
      mappedPath = libraryPath;
    }

    // Try each player until one succeeds (fallback)
    for (const player of players) {
      try {
        const httpClient = this.mediaPlayerManager.getHttpClient(player.id);
        if (!httpClient) {
          logger.warn('[NotificationJobHandlers] HTTP client not available, trying next player', {
            service: 'NotificationJobHandlers',
            playerId: player.id,
          });
          continue;
        }

        // Trigger scan with mapped path
        await httpClient.scanVideoLibrary({ directory: mappedPath });

        logger.info('[NotificationJobHandlers] Triggered library scan on Kodi group', {
          service: 'NotificationJobHandlers',
          groupId,
          playerId: player.id,
          playerName: player.name,
          path: mappedPath,
        });

        return; // Success - exit after first successful scan
      } catch (error) {
        logger.warn('[NotificationJobHandlers] Failed to scan on Kodi player, trying next', {
          service: 'NotificationJobHandlers',
          groupId,
          playerId: player.id,
          playerName: player.name,
          error: getErrorMessage(error),
        });
        // Continue to next player (fallback)
      }
    }

    // All players failed
    logger.error('[NotificationJobHandlers] Failed to trigger scan on any Kodi player in group', {
      service: 'NotificationJobHandlers',
      groupId,
    });
  }

  /**
   * Handle notify-jellyfin job
   *
   * Payload: {
   *   webhookPayload: { source, eventType, movie?, series?, episodes? },
   *   libraryId: number
   * }
   */
  private async handleNotifyJellyfin(job: Job): Promise<void> {
    const enabled = await this.notificationConfig.isServiceEnabled('jellyfin');
    if (!enabled) {
      logger.info('[NotificationJobHandlers] Jellyfin notifications disabled, skipping', {
        service: 'NotificationJobHandlers',
        handler: 'handleNotifyJellyfin',
        jobId: job.id,
      });
      return;
    }

    logger.info('[NotificationJobHandlers] Jellyfin notification stubbed - not yet implemented', {
      service: 'NotificationJobHandlers',
      handler: 'handleNotifyJellyfin',
      jobId: job.id,
      payload: job.payload,
      note: 'Jellyfin library scan integration will be implemented after Kodi sync is finalized',
    });

    // FUTURE: Implement Jellyfin notification
    // 1. Get Jellyfin media player groups for this library
    // 2. Apply path mapping (Metarr → Jellyfin paths)
    // 3. Call Jellyfin API: POST /Library/Refresh with path parameter
    // 4. Handle authentication (API key in X-Emby-Token header)
  }

  /**
   * Handle notify-plex job
   *
   * Payload: {
   *   webhookPayload: { source, eventType, movie?, series?, episodes? },
   *   libraryId: number
   * }
   */
  private async handleNotifyPlex(job: Job): Promise<void> {
    const enabled = await this.notificationConfig.isServiceEnabled('plex');
    if (!enabled) {
      logger.info('[NotificationJobHandlers] Plex notifications disabled, skipping', {
        service: 'NotificationJobHandlers',
        handler: 'handleNotifyPlex',
        jobId: job.id,
      });
      return;
    }

    logger.info('[NotificationJobHandlers] Plex notification stubbed - not yet implemented', {
      service: 'NotificationJobHandlers',
      handler: 'handleNotifyPlex',
      jobId: job.id,
      payload: job.payload,
      note: 'Plex library scan integration will be implemented after Kodi sync is finalized',
    });

    // FUTURE: Implement Plex notification
    // 1. Get Plex media player groups for this library
    // 2. Apply path mapping (Metarr → Plex paths)
    // 3. Call Plex API: GET /library/sections/{id}/refresh?path={mappedPath}
    // 4. Handle authentication (X-Plex-Token header)
  }

  /**
   * Handle notify-discord job
   *
   * Sends webhook notification to Discord with movie/series information.
   *
   * Payload: {
   *   webhookPayload: { source, eventType, movie?, series?, episodes? },
   *   libraryId: number
   * }
   */
  private async handleNotifyDiscord(job: Job): Promise<void> {
    const enabled = await this.notificationConfig.isServiceEnabled('discord');
    if (!enabled) {
      logger.info('[NotificationJobHandlers] Discord notifications disabled, skipping', {
        service: 'NotificationJobHandlers',
        handler: 'handleNotifyDiscord',
        jobId: job.id,
      });
      return;
    }

    logger.info('[NotificationJobHandlers] Discord notification (not yet implemented)', {
      service: 'NotificationJobHandlers',
      handler: 'handleNotifyDiscord',
      jobId: job.id,
    });

    // TODO: Implement Discord webhook notification
    // 1. Get Discord webhook URL from notificationConfig
    // 2. Format payload (movie title, year, poster, etc.)
    // 3. Send POST request to webhook URL
  }

  /**
   * Handle notify-pushover job
   *
   * Sends push notification via Pushover service.
   *
   * Payload: {
   *   webhookPayload: { source, eventType, movie?, series?, episodes? },
   *   libraryId: number
   * }
   */
  private async handleNotifyPushover(job: Job): Promise<void> {
    const enabled = await this.notificationConfig.isServiceEnabled('pushover');
    if (!enabled) {
      logger.info('[NotificationJobHandlers] Pushover notifications disabled, skipping', {
        service: 'NotificationJobHandlers',
        handler: 'handleNotifyPushover',
        jobId: job.id,
      });
      return;
    }

    logger.info('[NotificationJobHandlers] Pushover notification (not yet implemented)', {
      service: 'NotificationJobHandlers',
      handler: 'handleNotifyPushover',
      jobId: job.id,
    });

    // TODO: Implement Pushover notification
    // 1. Get Pushover API key and user key from notificationConfig
    // 2. Format message (movie title, year, etc.)
    // 3. Send POST request to Pushover API
  }

  /**
   * Handle notify-email job
   *
   * Sends email notification via SMTP.
   *
   * Payload: {
   *   webhookPayload: { source, eventType, movie?, series?, episodes? },
   *   libraryId: number
   * }
   */
  private async handleNotifyEmail(job: Job): Promise<void> {
    const enabled = await this.notificationConfig.isServiceEnabled('email');
    if (!enabled) {
      logger.info('[NotificationJobHandlers] Email notifications disabled, skipping', {
        service: 'NotificationJobHandlers',
        handler: 'handleNotifyEmail',
        jobId: job.id,
      });
      return;
    }

    logger.info('[NotificationJobHandlers] Email notification (not yet implemented)', {
      service: 'NotificationJobHandlers',
      handler: 'handleNotifyEmail',
      jobId: job.id,
    });

    // TODO: Implement email notification
    // 1. Get SMTP config from notificationConfig
    // 2. Format email (subject, body with movie details, HTML template)
    // 3. Send via nodemailer or similar SMTP client
  }
}
