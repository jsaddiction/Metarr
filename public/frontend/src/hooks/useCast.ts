/**
 * TanStack Query hooks for Movie Cast management
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { movieApi } from '../utils/api';
import { showErrorToast, showSuccessToast } from '../utils/errorHandling';
import type {
  MovieActorLink,
  CastUpdateRequest,
  CastResponse,
} from '@/types/movie';

export type { MovieActorLink, CastUpdateRequest, CastResponse };

/**
 * Fetch cast for a movie
 *
 * @param movieId - Movie ID
 */
export const useCast = (movieId: number) => {
  return useQuery<CastResponse, Error>({
    queryKey: ['movie', movieId, 'cast'],
    queryFn: () => movieApi.getCast(movieId),
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: !!movieId,
  });
};

/**
 * Update cast for a movie
 */
export const useUpdateCast = () => {
  const queryClient = useQueryClient();

  return useMutation<CastResponse, Error, { movieId: number; data: CastUpdateRequest }>({
    mutationFn: ({ movieId, data }) => movieApi.updateCast(movieId, data),
    onSuccess: (_, { movieId }) => {
      queryClient.invalidateQueries({ queryKey: ['movie', movieId, 'cast'] });
      queryClient.invalidateQueries({ queryKey: ['movie', movieId] });
      showSuccessToast('Cast updated successfully');
    },
    onError: (error) => {
      showErrorToast(error, 'Update cast');
      console.error('Cast update error:', error);
    },
  });
};
