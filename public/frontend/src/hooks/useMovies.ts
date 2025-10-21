/**
 * TanStack Query hooks for Movies
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { movieApi } from '../utils/api';
import { MovieListItem, MovieDetail, MovieListResult } from '../types/movie';
import { useWebSocket } from '../contexts/WebSocketContext';
import { parseApiError } from '../utils/errorHandling';

interface UseMoviesOptions {
  status?: string;
  limit?: number;
  offset?: number;
}

/**
 * Fetch all movies with optional filtering
 */
export const useMovies = (options?: UseMoviesOptions) => {
  return useQuery<MovieListResult, Error>({
    queryKey: options ? ['movies', options] : ['movies'],
    queryFn: async () => {
      console.log('[useMovies] Fetching movies with options:', options);
      try {
        const result = await movieApi.getAll(options);
        console.log('[useMovies] Received result:', result);
        console.log('[useMovies] Movies count:', result?.movies?.length || 0);
        return result;
      } catch (error) {
        console.error('[useMovies] Error fetching movies:', error);
        const errorMessage = await parseApiError(error as Response).catch(() =>
          error instanceof Error ? error.message : 'Failed to fetch movies'
        );
        throw new Error(errorMessage);
      }
    },
    retry: 1,
    staleTime: 5 * 60 * 1000, // 5 minutes - will be updated via WebSocket when changed
  });
};

/**
 * Fetch a single movie by ID with optional includes
 *
 * @param id - Movie ID
 * @param include - Array of additional data to include: 'files', 'candidates', 'locks'
 *
 * Examples:
 * - useMovie(1) - Metadata only (lightweight)
 * - useMovie(1, ['files']) - Metadata + all files (edit page)
 * - useMovie(1, ['files', 'candidates', 'locks']) - Full data
 */
export const useMovie = (id?: number | null, include?: string[]) => {
  return useQuery<MovieDetail, Error>({
    queryKey: include ? ['movie', id, include] : ['movie', id],
    queryFn: async () => {
      if (!id) throw new Error('Movie ID is required');

      // Build query string with include parameter
      const params = new URLSearchParams();
      if (include && include.length > 0) {
        params.set('include', include.join(','));
      }

      const url = `/api/movies/${id}${params.toString() ? `?${params}` : ''}`;
      const response = await fetch(url);

      if (!response.ok) {
        const errorMessage = await parseApiError(response);
        throw new Error(errorMessage);
      }

      return response.json();
    },
    enabled: !!id,
    retry: 1,
    staleTime: 5 * 60 * 1000, // 5 minutes - will be updated via WebSocket when changed
  });
};

/**
 * Update a movie with optimistic updates
 */
export const useUpdateMovie = () => {
  const queryClient = useQueryClient();
  const { ws } = useWebSocket();

  return useMutation<MovieListItem, Error, { id: number; updates: Partial<MovieDetail> }>({
    mutationFn: async ({ id, updates }) => {
      // Send update via WebSocket if connected
      if (ws && ws.getState() === 'connected') {
        ws.send({
          type: 'updateMovie',
          movieId: id,
          updates,
        });
        // Wait a bit for the server to process and broadcast the change
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // For now, we'll optimistically update the local cache
      // The actual update will come via WebSocket broadcast
      const currentData = queryClient.getQueryData<MovieListResult>(['movies']);
      const movie = currentData?.movies.find((m) => m.id === id);
      if (!movie) {
        throw new Error(`Movie with ID ${id} not found`);
      }
      return { ...movie, ...updates };
    },
    onMutate: async ({ id, updates }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['movies'] });
      await queryClient.cancelQueries({ queryKey: ['movie', id] });

      // Snapshot previous values
      const previousMovies = queryClient.getQueryData<MovieListResult>(['movies']);
      const previousMovie = queryClient.getQueryData<MovieDetail>(['movie', id]);

      // Optimistically update to the new value
      if (previousMovies) {
        queryClient.setQueryData<MovieListResult>(['movies'], {
          ...previousMovies,
          movies: previousMovies.movies.map((movie) =>
            movie.id === id ? { ...movie, ...updates } : movie
          ),
        });
      }

      if (previousMovie) {
        queryClient.setQueryData<MovieDetail>(['movie', id], { ...previousMovie, ...updates });
      }

      // Return snapshot for rollback
      return { previousMovies, previousMovie };
    },
    onError: (err, { id }, context) => {
      // Rollback on error
      if (context?.previousMovies) {
        queryClient.setQueryData(['movies'], context.previousMovies);
      }
      if (context?.previousMovie) {
        queryClient.setQueryData(['movie', id], context.previousMovie);
      }

      // Show error toast
      toast.error('Failed to update movie', {
        description: err.message,
      });

      console.error('Failed to update movie:', err);
    },
    onSettled: (data, error, { id }) => {
      // Always refetch after error or success to sync with server
      queryClient.invalidateQueries({ queryKey: ['movies'] });
      queryClient.invalidateQueries({ queryKey: ['movie', id] });
    },
  });
};

/**
 * Delete a movie
 */
export const useDeleteMovie = () => {
  const queryClient = useQueryClient();

  return useMutation<void, Error, number>({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/movies/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorMessage = await parseApiError(response);
        throw new Error(errorMessage);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['movies'] });
      toast.success('Movie deleted successfully');
    },
    onError: (error) => {
      toast.error('Failed to delete movie', {
        description: error.message,
      });
    },
  });
};
