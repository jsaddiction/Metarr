/**
 * Job Queue Service (Compatibility Export)
 *
 * This file re-exports from the new modular location for backward compatibility.
 * All new code should import from './jobQueue/JobQueueService.js' directly.
 */

export { JobQueueService } from './jobQueue/JobQueueService.js';
export type { JobHandler } from './jobQueue/JobQueueService.js';
export type {
  Job,
  JobType,
  JobFilters,
  QueueStats,
  IJobQueueStorage,
} from './jobQueue/types.js';
