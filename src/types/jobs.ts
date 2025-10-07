export type JobType =
  | 'movie_metadata'
  | 'series_metadata'
  | 'episode_metadata'
  | 'artist_metadata'
  | 'library_update'
  | 'asset_download';

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'retrying';

export interface JobData {
  type: JobType;
  priority: number;
  payload: Record<string, any>;
  maxAttempts?: number;
}

export interface JobResult {
  success: boolean;
  data?: any;
  error?: string;
  processingTime?: number;
}

export interface CreateJobRequest {
  type: JobType;
  priority?: number;
  payload: Record<string, any>;
  maxAttempts?: number;
}

export interface JobProgress {
  percentage: number;
  message: string;
  step: number;
  totalSteps: number;
}
