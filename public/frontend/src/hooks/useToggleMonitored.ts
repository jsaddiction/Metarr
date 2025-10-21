/**
 * TanStack Query hook for toggling monitored status
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MovieListItem, MovieDetail, MovieListResult } from '../types/movie';
import { toast } from 'sonner';

interface ToggleMonitoredResponse {
  id: number;
  monitored: boolean;
}

/**
 * Toggle monitored status for a movie
 *
 * When monitored = false, ALL automation is frozen for that movie.
 * This is separate from field locks - unmonitored stops everything.
 *
 * The backend will broadcast WebSocket updates to all connected clients.
 */
export const useToggleMonitored = () => {
  const queryClient = useQueryClient();

  return useMutation<ToggleMonitoredResponse, Error, number>({
    mutationFn: async (movieId: number) => {
      const response = await fetch(`/api/movies/${movieId}/toggle-monitored`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to toggle monitored status');
      }

      return response.json();
    },

    onMutate: async (movieId: number) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['movies'] });
      await queryClient.cancelQueries({ queryKey: ['movie', movieId] });

      // Snapshot previous values
      const previousMovies = queryClient.getQueryData<MovieListResult>(['movies']);
      const previousMovie = queryClient.getQueryData<MovieDetail>(['movie', movieId]);

      // Optimistically toggle the monitored status
      if (previousMovies) {
        queryClient.setQueryData<MovieListResult>(['movies'], {
          ...previousMovies,
          movies: previousMovies.movies.map((movie) =>
            movie.id === movieId ? { ...movie, monitored: !movie.monitored } : movie
          ),
        });
      }

      if (previousMovie) {
        queryClient.setQueryData<MovieDetail>(['movie', movieId], {
          ...previousMovie,
          monitored: !previousMovie.monitored,
        });
      }

      // Return snapshot for rollback
      return { previousMovies, previousMovie };
    },

    onSuccess: (data) => {
      // Show success toast
      const status = data.monitored ? 'monitored' : 'unmonitored';
      toast.success(`Movie ${status}`, {
        description: data.monitored
          ? 'Automation enabled for this movie'
          : 'Automation frozen for this movie',
      });
    },

    onError: (err, movieId, context) => {
      // Rollback on error
      if (context?.previousMovies) {
        queryClient.setQueryData(['movies'], context.previousMovies);
      }
      if (context?.previousMovie) {
        queryClient.setQueryData(['movie', movieId], context.previousMovie);
      }

      // Show error toast
      toast.error('Failed to toggle monitored status', {
        description: err.message,
      });

      console.error('Failed to toggle monitored:', err);
    },

    onSettled: (data, error, movieId) => {
      // Always refetch after error or success to sync with server
      // WebSocket will also trigger updates, but this ensures consistency
      queryClient.invalidateQueries({ queryKey: ['movies'] });
      queryClient.invalidateQueries({ queryKey: ['movie', movieId] });
    },
  });
};
