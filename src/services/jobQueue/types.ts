/**
 * Job Queue Type Definitions
 *
 * Modular job queue architecture with pluggable storage backends.
 */

export type JobType =
  // Webhook-triggered (CRITICAL priority 1-2)
  | 'webhook-received' // Initial webhook processing (fan-out coordinator)
  | 'scan-movie' // Scan movie directory for metadata/assets

  // Notification jobs (NORMAL priority 5-7, fan-out from webhooks)
  | 'notify-kodi' // Notify Kodi media player groups
  | 'notify-jellyfin' // Notify Jellyfin media server
  | 'notify-plex' // Notify Plex media server (future)
  | 'notify-discord' // Send Discord webhook notification
  | 'notify-pushover' // Send Pushover push notification
  | 'notify-email' // Send email notification (future)

  // Asset management (NORMAL priority 5-7)
  | 'discover-assets' // Discover assets in filesystem
  | 'fetch-provider-assets' // Fetch assets from TMDB/TVDB
  | 'enrich-metadata' // Fetch metadata from providers
  | 'select-assets' // Auto-select assets (YOLO/Hybrid mode)
  | 'publish' // Publish entity to library
  | 'verify-movie' // Verify movie directory integrity (manual trigger)

  // Scheduled tasks (LOW priority 8-10)
  | 'scheduled-file-scan' // Scheduled filesystem scan (automatic)
  | 'scheduled-provider-update' // Scheduled provider update (automatic)
  | 'scheduled-cleanup' // Cleanup old history/cache (automatic)

  // User-initiated (HIGH priority 3-4)
  | 'library-scan' // Full library scan (user-initiated)

  // Multi-phase scanning (NEW architecture - priority 6-7)
  | 'directory-scan' // Scan a single directory (Phase 2)
  | 'cache-asset'; // Copy asset to cache (Phase 3)

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
 * Completed jobs are removed and archived to job_history
 */
export interface Job {
  id: number;
  type: JobType;
  priority: number;
  payload: any;
  status: 'pending' | 'processing';
  error?: string | null;
  retry_count: number;
  max_retries: number;
  created_at: string;
  started_at?: string | null;
  updated_at?: string;
  progress?: JobProgress; // Optional progress tracking (not stored in DB)
}

/**
 * Job in history (completed or permanently failed)
 * Archived from active queue for auditing/debugging
 */
export interface JobHistoryRecord {
  id: number;
  job_id: number; // Original job ID from queue
  type: JobType;
  priority: number;
  payload: any;
  status: 'completed' | 'failed';
  error?: string | null;
  retry_count: number;
  created_at: string; // When job was created
  started_at: string; // When job started processing
  completed_at: string; // When job finished (completed or failed)
  duration_ms: number; // completed_at - started_at
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
 * Filters for listing job history
 */
export interface JobHistoryFilters {
  type?: JobType;
  status?: 'completed' | 'failed';
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
   * Archives to job_history table
   * @param jobId Job ID
   * @param result Optional result data (stored in history)
   */
  completeJob(jobId: number, result?: any): Promise<void>;

  /**
   * Mark job as failed
   * If retries remaining: state → pending, increment retry_count
   * If no retries: remove from queue, archive to job_history
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
   * Get job history (completed/failed jobs)
   * @param filters Optional filters
   * @returns List of historical jobs
   */
  getJobHistory(filters?: JobHistoryFilters): Promise<JobHistoryRecord[]>;

  /**
   * Crash recovery: Reset all 'processing' jobs to 'pending'
   * Call this on application startup
   * @returns Count of reset jobs
   */
  resetStalledJobs(): Promise<number>;

  /**
   * Cleanup old history records
   * Delete completed jobs older than X days
   * Delete failed jobs older than Y days
   * @param retentionDays Retention policy
   * @returns Count of deleted records
   */
  cleanupHistory(retentionDays: { completed: number; failed: number }): Promise<number>;

  /**
   * Health check: Get queue stats
   * @returns Queue statistics
   */
  getStats(): Promise<QueueStats>;

  /**
   * Get recent jobs (active + recently completed/failed)
   * Used by frontend to show current job activity
   * @returns List of recent jobs
   */
  getRecentJobs?(): Promise<Job[]>;
}
