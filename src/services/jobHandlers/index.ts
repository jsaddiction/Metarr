/**
 * Job Handlers Registry
 *
 * Central export point for all job handler classes.
 * Provides a unified registration function to wire all handlers
 * into the job queue system.
 */

import { DatabaseConnection } from '../../types/database.js';
import { JobQueueService } from '../jobQueueService.js';
import { NotificationConfigService } from '../notificationConfigService.js';
import { MediaPlayerConnectionManager } from '../mediaPlayerConnectionManager.js';
import { WorkflowControlService } from '../workflowControlService.js';

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
  dbManager: any; // DatabaseManager - using any to avoid circular dependency
  jobQueue: JobQueueService;
  cacheDir: string;
  notificationConfig: NotificationConfigService;
  mediaPlayerManager: MediaPlayerConnectionManager;
  tmdbClient?: any;
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
  const scanHandlers = new ScanJobHandlers(deps.db, deps.dbManager);

  const webhookHandlers = new WebhookJobHandlers(
    deps.db,
    deps.jobQueue,
    new WorkflowControlService(deps.db),
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
    deps.cacheDir,
    deps.tmdbClient
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
  console.log('  - WebhookJobHandlers: 2 handlers (webhook-received, scan-movie)');
  console.log('  - NotificationJobHandlers: 6 handlers (kodi, jellyfin, plex, discord, pushover, email)');
  console.log('  - AssetJobHandlers: 6 handlers (discover, fetch, enrich, select, publish, verify)');
  console.log('  - ScheduledJobHandlers: 4 handlers (library-scan, file-scan, provider-update, cleanup)');
  console.log('  - Total: 20 handlers registered');
}

// Export all handler classes for direct access if needed
export { ScanJobHandlers } from './ScanJobHandlers.js';
export { WebhookJobHandlers } from './WebhookJobHandlers.js';
export { NotificationJobHandlers } from './NotificationJobHandlers.js';
export { AssetJobHandlers } from './AssetJobHandlers.js';
export { ScheduledJobHandlers } from './ScheduledJobHandlers.js';
