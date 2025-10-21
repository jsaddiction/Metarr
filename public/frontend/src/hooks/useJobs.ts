import { useQuery } from '@tanstack/react-query';
import { parseApiError } from '../utils/errorHandling';

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
 * Fetch active and recent jobs from backend
 * Uses polling fallback if WebSocket is unavailable
 */
export const useJobs = () => {
  return useQuery<Job[], Error>({
    queryKey: ['jobs'],
    queryFn: async () => {
      const response = await fetch('/api/jobs');
      if (!response.ok) {
        const errorMessage = await parseApiError(response);
        throw new Error(errorMessage);
      }
      const data = await response.json();
      // Backend returns { jobs: Job[] } format
      return data.jobs || [];
    },
    retry: 1,
    refetchInterval: 2000, // Poll every 2 seconds (fallback if WebSocket fails)
    staleTime: 1000, // Consider data stale after 1 second (WebSocket updates should keep it fresh)
  });
};

/**
 * Fetch job statistics aggregated by status
 */
export const useJobStats = () => {
  return useQuery<JobStats, Error>({
    queryKey: ['jobStats'],
    queryFn: async () => {
      const response = await fetch('/api/jobs/stats');
      if (!response.ok) {
        const errorMessage = await parseApiError(response);
        throw new Error(errorMessage);
      }
      return response.json();
    },
    retry: 1,
    refetchInterval: 2000,
    staleTime: 1000,
  });
};
