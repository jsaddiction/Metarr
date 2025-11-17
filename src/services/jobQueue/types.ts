/**
 * Job Queue Type Definitions
 *
 * Modular job queue architecture with pluggable storage backends.
 *
 * All jobs flow through a sequential chain: scan → enrich → publish → notify
 * Each phase is ALWAYS executed, but behavior is controlled via phase configuration.
 */

/**
 * Job priority constants
 * Lower number = higher priority
 */
export const JOB_PRIORITY = {
  CRITICAL: 1,  // Webhooks, immediate system events
  HIGH: 3,      // User-initiated operations
  NORMAL: 5,    // Automated workflow chain
  LOW: 8,       // Scheduled maintenance tasks
} as const;

export type JobType =
  // Core workflow (sequential chain)
  | 'scan-movie'          // Scan movie directory → chains to enrich-metadata
  | 'enrich-metadata'     // Fetch metadata + assets → chains to publish
  | 'publish'             // Copy to library + generate NFO → chains to notify

  // Scanning sub-jobs
  | 'directory-scan'      // Scan a specific directory for media files
  | 'cache-asset'         // Download and cache a single asset

  // Player notifications
  | 'notify-kodi'         // Notify Kodi media player group
  | 'notify-jellyfin'     // Notify Jellyfin media server
  | 'notify-plex'         // Notify Plex media server
  | 'notify-discord'      // Send Discord notification
  | 'notify-pushover'     // Send Pushover notification
  | 'notify-email'        // Send email notification

  // Scheduled tasks
  | 'library-scan'                // Full library scan (scheduled)
  | 'scheduled-file-scan'         // Scheduled file system scan
  | 'scheduled-cleanup'           // Garbage collector (orphaned cache files)
  | 'scheduled-provider-update'   // Refresh metadata from providers
  | 'scheduled-verification'      // Verify cache ↔ library hash matches

  // Webhook routing
  | 'webhook-received';   // Webhook router (creates other jobs)

/**
 * Type-safe job payload mapping
 * Each job type has a strongly-typed payload structure
 */
export type JobPayloadMap = {
  // Core workflow
  'scan-movie': {
    libraryId: number;
    directoryPath: string;
    manual: boolean;
  };

  'enrich-metadata': {
    entityType: 'movie' | 'series' | 'episode';
    entityId: number;
  };

  'publish': {
    entityType: 'movie' | 'series' | 'episode';
    entityId: number;
  };

  // Scanning sub-jobs
  'directory-scan': {
    scanJobId: number;
    libraryId: number;
    directoryPath: string;
  };

  'cache-asset': {
    scanJobId: number;
    entityType: string;
    entityId: number;
    assetType: string;
    sourcePath: string;
    language?: string;
  };

  // Player notifications
  'notify-kodi': {
    groupId: number;
    libraryPath: string;
  };

  'notify-jellyfin': {
    groupId: number;
    libraryPath: string;
  };

  'notify-plex': {
    groupId: number;
    libraryPath: string;
  };

  'notify-discord': {
    message: string;
    metadata?: Record<string, unknown>;
  };

  'notify-pushover': {
    message: string;
    priority?: number;
    metadata?: Record<string, unknown>;
  };

  'notify-email': {
    subject: string;
    message: string;
    metadata?: Record<string, unknown>;
  };

  // Scheduled tasks
  'library-scan': {
    libraryId: number;
    libraryPath: string;
    libraryType: string;
  };

  'scheduled-file-scan': {
    taskId: 'file-scan';
    manual: boolean;
  };

  'scheduled-cleanup': {
    taskId: 'garbage-collector';
    manual: boolean;
  };

  'scheduled-provider-update': {
    taskId: 'provider-refresh';
    manual: boolean;
  };

  'scheduled-verification': {
    taskId: 'cache-verification';
    manual: boolean;
  };

  // Webhook routing
  'webhook-received': {
    source: string;
    eventType: string;
    data: unknown; // Webhook data structure varies by source
  };
};

/**
 * Job progress for long-running jobs
 * Broadcasted via WebSocket for real-time UI updates
 */
export interface JobProgress {
  current: number; // Current step (e.g., 5)
  total: number; // Total steps (e.g., 10)
  percentage: number; // Percentage complete (0-100)
  message?: string; // Current operation (e.g., "Scanning directory 5 of 10")
  detail?: string; // Additional detail (e.g., "/movies/The Matrix")
}

/**
 * Job in active queue
 * Status: Only 'pending' or 'processing'
 * Completed jobs simply removed from queue (no history table)
 */
export interface Job<T extends JobType = JobType> {
  id: number;
  type: T;
  priority: number;
  payload: JobPayloadMap[T]; // Type-safe payload!
  status: 'pending' | 'processing';
  error?: string | null;
  retry_count: number;
  max_retries: number;
  created_at: string;
  started_at?: string | null;
  updated_at?: string;
  progress?: JobProgress; // Optional progress tracking (not stored in DB)
  manual?: boolean; // True if user-initiated
}

/**
 * Filters for listing active jobs
 */
export interface JobFilters {
  type?: JobType;
  status?: 'pending' | 'processing';
  limit?: number;
}

/**
 * Queue statistics
 */
export interface QueueStats {
  pending: number;
  processing: number;
  totalActive: number;
  oldestPendingAge: number | null; // milliseconds
  completed?: number; // Completed in last hour (optional for backend compatibility)
  failed?: number; // Failed in last hour (optional for backend compatibility)
}

/**
 * Job Queue Storage Interface
 *
 * Implement this interface to provide different storage backends
 * (SQLite, Redis, PostgreSQL, etc.)
 */
export interface IJobQueueStorage {
  /**
   * Add a new job to the queue
   * State: pending
   * @returns Job ID
   */
  addJob(job: Omit<Job, 'id' | 'created_at'>): Promise<number>;

  /**
   * Pick next job for processing
   * Changes state: pending → processing
   * Returns null if no jobs available
   * @returns Job or null
   */
  pickNextJob(): Promise<Job | null>;

  /**
   * Mark job as completed and remove from queue
   * No history - job is simply deleted (use logs for debugging)
   * @param jobId Job ID
   * @param result Optional result data (for in-memory tracking)
   */
  completeJob(jobId: number, result?: unknown): Promise<void>;

  /**
   * Mark job as failed
   * If retries remaining: state → pending, increment retry_count
   * If no retries: remove from queue (logged but not archived)
   * @param jobId Job ID
   * @param error Error message
   */
  failJob(jobId: number, error: string): Promise<void>;

  /**
   * Get job by ID (for progress tracking)
   * @param jobId Job ID
   * @returns Job or null if not found
   */
  getJob(jobId: number): Promise<Job | null>;

  /**
   * Get all active jobs (for admin UI)
   * Optionally filter by type or status
   * @param filters Optional filters
   * @returns List of active jobs
   */
  listJobs(filters?: JobFilters): Promise<Job[]>;

  /**
   * Crash recovery: Reset all 'processing' jobs to 'pending'
   * Call this on application startup
   * @returns Count of reset jobs
   */
  resetStalledJobs(): Promise<number>;

  /**
   * Health check: Get queue stats
   * @returns Queue statistics
   */
  getStats(): Promise<QueueStats>;

  /**
   * Get recent jobs (active + recently completed/failed in last hour)
   * Optional method - falls back to listJobs() if not implemented
   * @returns List of recent jobs
   */
  getRecentJobs?(): Promise<Job[]>;
}
