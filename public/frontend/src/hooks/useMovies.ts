/**
 * TanStack Query hooks for Movies
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { movieApi } from '../utils/api';
import { showErrorToast, showSuccessToast } from '../utils/errorHandling';
import {
  MovieListItem,
  MovieDetail,
  MovieListResult,
  ToggleMonitoredResponse,
  LockFieldRequest,
  LockFieldResponse,
  ResetMetadataResponse,
} from '../types/movie';
import { useWebSocket } from '../contexts/WebSocketContext';

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
    queryFn: () => movieApi.getAll(options),
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
      return movieApi.getById(id, include);
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
      showErrorToast(err, 'Update movie');

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
    mutationFn: (id: number) => movieApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['movies'] });
      showSuccessToast('Movie deleted successfully');
    },
    onError: (error) => {
      showErrorToast(error, 'Delete movie');
    },
  });
};

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
    mutationFn: (movieId: number) => movieApi.toggleMonitored(movieId),

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
      const description = data.monitored
        ? 'Automation enabled for this movie'
        : 'Automation frozen for this movie';
      showSuccessToast(`Movie ${status}`, description);
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
      showErrorToast(err, 'Toggle monitored status');

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

/**
 * Lock a field to prevent automation from modifying it
 *
 * When a field is locked, enrichment services will NOT update it.
 * Locks are automatically set when user manually edits a field.
 *
 * This is separate from monitored status:
 * - monitored = false: ALL automation frozen (global stop)
 * - field locked = true: Only THAT field frozen (granular protection)
 */
export const useLockField = () => {
  const queryClient = useQueryClient();

  return useMutation<LockFieldResponse, Error, LockFieldRequest>({
    mutationFn: ({ movieId, fieldName }) => movieApi.lockField(movieId, fieldName),

    onSuccess: (data, variables) => {
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['movies'] });
      queryClient.invalidateQueries({ queryKey: ['movie', variables.movieId] });

      // Show success toast
      showSuccessToast(`Field locked`, `${data.fieldName} is now protected from automation`);
    },

    onError: (err) => {
      // Show error toast
      showErrorToast(err, 'Lock field');

      console.error('Failed to lock field:', err);
    },
  });
};

/**
 * Unlock a field to allow automation to modify it
 *
 * Unlocks a previously locked field.
 * Use with "Reset to Provider" to re-fetch metadata.
 */
export const useUnlockField = () => {
  const queryClient = useQueryClient();

  return useMutation<LockFieldResponse, Error, LockFieldRequest>({
    mutationFn: ({ movieId, fieldName }) => movieApi.unlockField(movieId, fieldName),

    onSuccess: (data, variables) => {
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['movies'] });
      queryClient.invalidateQueries({ queryKey: ['movie', variables.movieId] });

      // Show success toast
      showSuccessToast(`Field unlocked`, `${data.fieldName} can now be updated by automation`);
    },

    onError: (err) => {
      // Show error toast
      showErrorToast(err, 'Unlock field');

      console.error('Failed to unlock field:', err);
    },
  });
};

/**
 * Toggle field lock status (lock if unlocked, unlock if locked)
 */
export const useToggleLockField = () => {
  const lockField = useLockField();
  const unlockField = useUnlockField();

  return {
    mutate: ({ movieId, fieldName, currentlyLocked }: LockFieldRequest & { currentlyLocked: boolean }) => {
      if (currentlyLocked) {
        unlockField.mutate({ movieId, fieldName });
      } else {
        lockField.mutate({ movieId, fieldName });
      }
    },
    isPending: lockField.isPending || unlockField.isPending,
  };
};

/**
 * Reset all metadata locks and optionally re-fetch from provider
 *
 * Unlocks all metadata fields.
 * Use this when user wants to discard their manual edits.
 */
export const useResetMetadata = () => {
  const queryClient = useQueryClient();

  return useMutation<ResetMetadataResponse, Error, number>({
    mutationFn: (movieId: number) => movieApi.resetMetadata(movieId),

    onSuccess: (data, movieId) => {
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['movies'] });
      queryClient.invalidateQueries({ queryKey: ['movie', movieId] });

      // Show success toast
      showSuccessToast(`All metadata unlocked`, `${data.unlockedFields.length} fields can now be updated by automation`);
    },

    onError: (err) => {
      // Show error toast
      showErrorToast(err, 'Reset metadata');

      console.error('Failed to reset metadata:', err);
    },
  });
};

/**
 * Fetch genre suggestions for autocomplete
 */
export const useGenreSuggestions = () => {
  return useQuery<string[], Error>({
    queryKey: ['movie-suggestions', 'genres'],
    queryFn: () => movieApi.getGenreSuggestions(),
    staleTime: 30 * 60 * 1000, // 30 minutes - suggestions don't change often
  });
};

/**
 * Fetch director suggestions for autocomplete
 */
export const useDirectorSuggestions = () => {
  return useQuery<string[], Error>({
    queryKey: ['movie-suggestions', 'directors'],
    queryFn: () => movieApi.getDirectorSuggestions(),
    staleTime: 30 * 60 * 1000,
  });
};

/**
 * Fetch writer suggestions for autocomplete
 */
export const useWriterSuggestions = () => {
  return useQuery<string[], Error>({
    queryKey: ['movie-suggestions', 'writers'],
    queryFn: () => movieApi.getWriterSuggestions(),
    staleTime: 30 * 60 * 1000,
  });
};

/**
 * Fetch studio suggestions for autocomplete
 */
export const useStudioSuggestions = () => {
  return useQuery<string[], Error>({
    queryKey: ['movie-suggestions', 'studios'],
    queryFn: () => movieApi.getStudioSuggestions(),
    staleTime: 30 * 60 * 1000,
  });
};

/**
 * Fetch country suggestions for autocomplete
 */
export const useCountrySuggestions = () => {
  return useQuery<string[], Error>({
    queryKey: ['movie-suggestions', 'countries'],
    queryFn: () => movieApi.getCountrySuggestions(),
    staleTime: 30 * 60 * 1000,
  });
};

/**
 * Fetch tag suggestions for autocomplete
 */
export const useTagSuggestions = () => {
  return useQuery<string[], Error>({
    queryKey: ['movie-suggestions', 'tags'],
    queryFn: () => movieApi.getTagSuggestions(),
    staleTime: 30 * 60 * 1000,
  });
};
