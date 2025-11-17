/**
 * Job Handlers Registry
 *
 * Central export point for all job handler classes.
 * Provides a unified registration function to wire all handlers
 * into the job queue system.
 */

import { DatabaseConnection } from '../../types/database.js';
import { DatabaseManager } from '../../database/DatabaseManager.js';
import { JobQueueService } from '../jobQueueService.js';
import { NotificationConfigService } from '../notificationConfigService.js';
import { MediaPlayerConnectionManager } from '../mediaPlayerConnectionManager.js';
import { PhaseConfigService } from '../PhaseConfigService.js';

// Import all handler classes
import { ScanJobHandlers } from './ScanJobHandlers.js';
import { WebhookJobHandlers } from './WebhookJobHandlers.js';
import { NotificationJobHandlers } from './NotificationJobHandlers.js';
import { AssetJobHandlers } from './AssetJobHandlers.js';
import { ScheduledJobHandlers } from './ScheduledJobHandlers.js';

/**
 * Dependencies required for job handlers
 */
export interface HandlerDependencies {
  db: DatabaseConnection;
  dbManager: DatabaseManager;
  jobQueue: JobQueueService;
  phaseConfig: PhaseConfigService;
  cacheDir: string;
  notificationConfig: NotificationConfigService;
  mediaPlayerManager: MediaPlayerConnectionManager;
  tmdbClient?: unknown; // TMDB client type not defined, using unknown instead of any
}

/**
 * Register all job handlers with the job queue
 *
 * This function instantiates all handler classes and registers their
 * handlers with the provided job queue service.
 *
 * Usage:
 * ```typescript
 * import { registerAllJobHandlers } from './services/jobHandlers/index.js';
 *
 * registerAllJobHandlers(jobQueue, {
 *   db,
 *   dbManager,
 *   jobQueue,
 *   cacheDir,
 *   notificationConfig,
 *   mediaPlayerManager,
 *   tmdbClient,
 * });
 * ```
 *
 * @param jobQueue - The job queue service to register handlers with
 * @param deps - All dependencies needed by the handlers
 */
export function registerAllJobHandlers(
  jobQueue: JobQueueService,
  deps: HandlerDependencies
): void {
  // Instantiate handler classes
  const scanHandlers = new ScanJobHandlers(deps.db, deps.dbManager, deps.jobQueue);

  const webhookHandlers = new WebhookJobHandlers(
    deps.db,
    deps.jobQueue,
    deps.notificationConfig
  );

  const notificationHandlers = new NotificationJobHandlers(
    deps.db,
    deps.notificationConfig,
    deps.mediaPlayerManager
  );

  const assetHandlers = new AssetJobHandlers(
    deps.db,
    deps.jobQueue,
    deps.phaseConfig, // Using PhaseConfigService now
    deps.cacheDir,
    deps.dbManager
  );

  const scheduledHandlers = new ScheduledJobHandlers(deps.db, deps.dbManager, deps.jobQueue);

  // Register all handlers with the job queue
  scanHandlers.registerHandlers(jobQueue);
  webhookHandlers.registerHandlers(jobQueue);
  notificationHandlers.registerHandlers(jobQueue);
  assetHandlers.registerHandlers(jobQueue);
  scheduledHandlers.registerHandlers(jobQueue);

  console.log('[JobHandlers] All handlers registered successfully');
  console.log('[JobHandlers] Handler breakdown:');
  console.log('  - ScanJobHandlers: 2 handlers (directory-scan, cache-asset)');
  console.log('  - WebhookJobHandlers: 1 handler (webhook-received - stub)');
  console.log('  - NotificationJobHandlers: 3 handlers (notify-kodi, notify-jellyfin, notify-plex)');
  console.log('  - AssetJobHandlers: 2 handlers (enrich-metadata, publish)');
  console.log('  - ScheduledJobHandlers: 3 handlers (cleanup, provider-update, verification)');
  console.log('  - Total: 11 handlers registered');
}

// Export all handler classes for direct access if needed
export { ScanJobHandlers } from './ScanJobHandlers.js';
export { WebhookJobHandlers } from './WebhookJobHandlers.js';
export { NotificationJobHandlers } from './NotificationJobHandlers.js';
export { AssetJobHandlers } from './AssetJobHandlers.js';
export { ScheduledJobHandlers } from './ScheduledJobHandlers.js';
