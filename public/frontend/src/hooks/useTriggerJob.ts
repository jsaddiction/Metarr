/**
 * TanStack Query hook for triggering manual jobs
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

interface TriggerJobRequest {
  movieId: number;
  jobType: 'verify' | 'enrich' | 'publish';
}

interface TriggerJobResponse {
  message: string;
  jobId: number;
  movieId: number;
}

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

  return useMutation<TriggerJobResponse, Error, TriggerJobRequest>({
    mutationFn: async ({ movieId, jobType }) => {
      const endpoint = `/api/movies/${movieId}/jobs/${jobType}`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `Failed to trigger ${jobType}`);
      }

      return response.json();
    },

    onSuccess: (data, variables) => {
      const labels = {
        verify: 'Verification',
        enrich: 'Enrichment',
        publish: 'Publish',
      };

      toast.success(`${labels[variables.jobType]} started`, {
        description: data.message || 'Job queued successfully',
      });

      // Invalidate queries to refresh movie data
      queryClient.invalidateQueries({ queryKey: ['movies'] });
      queryClient.invalidateQueries({ queryKey: ['movie', variables.movieId] });
    },

    onError: (err, variables) => {
      const labels = {
        verify: 'Verification',
        enrich: 'Enrichment',
        publish: 'Publish',
      };

      toast.error(`Failed to start ${labels[variables.jobType]}`, {
        description: err.message,
      });
    },
  });
};
