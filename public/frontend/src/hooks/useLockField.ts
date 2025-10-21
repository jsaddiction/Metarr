/**
 * TanStack Query hooks for field locking
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MovieListItem, MovieDetail, MovieListResult } from '../types/movie';
import { toast } from 'sonner';

interface LockFieldRequest {
  movieId: number;
  fieldName: string;
}

interface LockFieldResponse {
  success: boolean;
  fieldName: string;
  locked: boolean;
}

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
    mutationFn: async ({ movieId, fieldName }: LockFieldRequest) => {
      const response = await fetch(`/api/movies/${movieId}/lock-field`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fieldName }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to lock field');
      }

      return response.json();
    },

    onSuccess: (data, variables) => {
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['movies'] });
      queryClient.invalidateQueries({ queryKey: ['movie', variables.movieId] });

      // Show success toast
      toast.success(`Field locked`, {
        description: `${data.fieldName} is now protected from automation`,
      });
    },

    onError: (err, variables) => {
      // Show error toast
      toast.error('Failed to lock field', {
        description: err.message,
      });

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
    mutationFn: async ({ movieId, fieldName }: LockFieldRequest) => {
      const response = await fetch(`/api/movies/${movieId}/unlock-field`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fieldName }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to unlock field');
      }

      return response.json();
    },

    onSuccess: (data, variables) => {
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['movies'] });
      queryClient.invalidateQueries({ queryKey: ['movie', variables.movieId] });

      // Show success toast
      toast.success(`Field unlocked`, {
        description: `${data.fieldName} can now be updated by automation`,
      });
    },

    onError: (err, variables) => {
      // Show error toast
      toast.error('Failed to unlock field', {
        description: err.message,
      });

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

interface ResetMetadataResponse {
  success: boolean;
  unlockedFields: string[];
}

/**
 * Reset all metadata locks and optionally re-fetch from provider
 *
 * Unlocks all metadata fields.
 * Use this when user wants to discard their manual edits.
 */
export const useResetMetadata = () => {
  const queryClient = useQueryClient();

  return useMutation<ResetMetadataResponse, Error, number>({
    mutationFn: async (movieId: number) => {
      const response = await fetch(`/api/movies/${movieId}/reset-metadata`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to reset metadata');
      }

      return response.json();
    },

    onSuccess: (data, movieId) => {
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['movies'] });
      queryClient.invalidateQueries({ queryKey: ['movie', movieId] });

      // Show success toast
      toast.success(`All metadata unlocked`, {
        description: `${data.unlockedFields.length} fields can now be updated by automation`,
      });
    },

    onError: (err) => {
      // Show error toast
      toast.error('Failed to reset metadata', {
        description: err.message,
      });

      console.error('Failed to reset metadata:', err);
    },
  });
};
