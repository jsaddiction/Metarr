import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { jobApi } from '../utils/api';
import { showErrorToast, showSuccessToast } from '../utils/errorHandling';
import {
  Job,
  JobStats,
  JobHistoryFilters,
  JobHistoryResponse,
  TriggerJobResponse,
} from '../types/job';

/**
 * Fetch active and recent jobs from backend
 * Uses polling fallback if WebSocket is unavailable
 */
export const useJobs = () => {
  return useQuery<Job[], Error>({
    queryKey: ['jobs'],
    queryFn: () => jobApi.getAll(),
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
    queryFn: () => jobApi.getStats(),
    retry: 1,
    refetchInterval: 2000,
    staleTime: 1000,
  });
};

/**
 * Fetch job history with optional filters
 */
export const useJobHistory = (filters?: JobHistoryFilters) => {
  return useQuery<JobHistoryResponse, Error>({
    queryKey: ['jobs', 'history', filters],
    queryFn: () => jobApi.getHistory(filters),
    retry: 1,
    staleTime: 30000, // Consider data fresh for 30 seconds
  });
};

/**
 * Trigger manual jobs (verify, enrich, publish) for a movie
 *
 * Job types:
 * - verify: Re-scan movie files and validate metadata
 * - enrich: Fetch metadata from TMDB (requires tmdb_id)
 * - publish: Write metadata and assets to library directory
 */
export const useTriggerJob = () => {
  const queryClient = useQueryClient();

  return useMutation<
    TriggerJobResponse,
    Error,
    { movieId: number; jobType: 'verify' | 'enrich' | 'publish' }
  >({
    mutationFn: ({ movieId, jobType }) => jobApi.triggerJob(movieId, jobType),

    onSuccess: (data, variables) => {
      const labels = {
        verify: 'Verification',
        enrich: 'Enrichment',
        publish: 'Publish',
      };

      showSuccessToast(
        `${labels[variables.jobType]} started`,
        data.message || 'Job queued successfully'
      );

      // Invalidate queries to refresh movie and job data
      queryClient.invalidateQueries({ queryKey: ['movies'] });
      queryClient.invalidateQueries({ queryKey: ['movie', variables.movieId] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },

    onError: (error, variables) => {
      const labels = {
        verify: 'Verification',
        enrich: 'Enrichment',
        publish: 'Publish',
      };

      showErrorToast(error, `Start ${labels[variables.jobType]}`);
    },
  });
};
