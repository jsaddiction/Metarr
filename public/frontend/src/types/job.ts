/**
 * Job interface matching backend Job model
 * Maps to src/types/models.ts Job interface
 */
export interface Job {
  id: number;
  type: 'movie_metadata' | 'series_metadata' | 'library_update' | 'asset_download';
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'retrying';
  priority: number;
  payload: Record<string, any>;
  result?: Record<string, any>;
  error?: string;
  attempts: number;
  maxAttempts: number;
  nextAttempt?: string;
  processingStarted?: string;
  processingCompleted?: string;
  createdAt: string;
  updatedAt: string;
  // Progress tracking (may be added via WebSocket)
  progress?: number; // 0-100
  message?: string;
}

/**
 * Job statistics aggregated by status
 */
export interface JobStats {
  pending: number;
  running: number; // processing + retrying
  completed: number;
  failed: number;
}

/**
 * Job history record from completed/failed jobs
 */
export interface JobHistoryRecord {
  id: number;
  job_id: number;
  type: string;
  priority: number;
  payload: Record<string, any>;
  status: 'completed' | 'failed';
  error?: string;
  retry_count: number;
  created_at: string;
  started_at: string;
  completed_at: string;
  duration_ms: number;
}

/**
 * Filters for job history queries
 */
export interface JobHistoryFilters {
  limit?: number;
  type?: string;
  status?: 'completed' | 'failed';
}

/**
 * Job history API response
 * Note: Since job history table was removed, this now returns active jobs
 */
export interface JobHistoryResponse {
  history: JobHistoryRecord[];
  total: number;
}

/**
 * Trigger job request for manual job creation
 */
export interface TriggerJobRequest {
  movieId: number;
  jobType: 'verify' | 'enrich' | 'publish';
}

/**
 * Trigger job response
 */
export interface TriggerJobResponse {
  message: string;
  jobId: number;
  movieId: number;
}

/**
 * Jobs API response (list endpoint)
 */
export interface JobsResponse {
  jobs: Job[];
}
