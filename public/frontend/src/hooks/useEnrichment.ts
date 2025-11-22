/**
 * TanStack Query hooks for Enrichment
 * Phase 5: Multi-Provider Metadata Aggregation
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { enrichmentApi } from '../utils/api';
import { showErrorToast, showSuccessToast } from '../utils/errorHandling';
import {
  LibraryCompletenessStats,
  MovieEnrichmentStatus,
  BulkEnrichmentStatus,
} from '../types/enrichment';

/**
 * Get library-wide completeness statistics
 * Auto-refreshes every 5 minutes
 */
export const useLibraryStats = () => {
  return useQuery<LibraryCompletenessStats, Error>({
    queryKey: ['enrichment', 'library-stats'],
    queryFn: async () => {
      const response = await enrichmentApi.getLibraryStats();
      return response.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 5 * 60 * 1000, // Auto-refresh every 5 minutes
  });
};

/**
 * Get enrichment status for a specific movie
 */
export const useMovieEnrichmentStatus = (movieId: number | undefined) => {
  return useQuery<MovieEnrichmentStatus, Error>({
    queryKey: ['enrichment', 'movie-status', movieId],
    queryFn: async () => {
      if (!movieId) throw new Error('Movie ID is required');
      const response = await enrichmentApi.getMovieStatus(movieId);
      return response.data;
    },
    enabled: !!movieId,
    staleTime: 10 * 1000, // 10 seconds
  });
};

/**
 * Trigger manual enrichment for a movie
 */
export const useTriggerMovieEnrich = () => {
  const queryClient = useQueryClient();

  return useMutation<
    { jobId: number; message: string; estimatedDuration: number },
    Error,
    { movieId: number; force?: boolean }
  >({
    mutationFn: async ({ movieId, force = false }) => {
      const response = await enrichmentApi.triggerMovieEnrich(movieId, force);
      return response.data;
    },
    onSuccess: (data, { movieId }) => {
      // Invalidate queries to trigger refetch
      queryClient.invalidateQueries({ queryKey: ['enrichment', 'movie-status', movieId] });
      queryClient.invalidateQueries({ queryKey: ['enrichment', 'library-stats'] });
      queryClient.invalidateQueries({ queryKey: ['movie', movieId] });
      queryClient.invalidateQueries({ queryKey: ['movies'] });

      showSuccessToast('Enrichment started', `Job #${data.jobId} queued`);
    },
    onError: (error) => {
      showErrorToast(error, 'Trigger enrichment');
    },
  });
};

/**
 * Get bulk enrichment status
 * Auto-refreshes every 30 seconds
 */
export const useBulkStatus = () => {
  return useQuery<BulkEnrichmentStatus, Error>({
    queryKey: ['enrichment', 'bulk-status'],
    queryFn: async () => {
      const response = await enrichmentApi.getBulkStatus();
      return response.data;
    },
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 30 * 1000, // Auto-refresh every 30 seconds
  });
};

/**
 * Trigger manual bulk enrichment
 */
export const useTriggerBulkEnrich = () => {
  const queryClient = useQueryClient();

  return useMutation<
    { jobId: number; message: string; estimatedDuration: number },
    Error,
    { force?: boolean }
  >({
    mutationFn: async ({ force = false }) => {
      const response = await enrichmentApi.triggerBulkEnrich(force);
      return response.data;
    },
    onSuccess: (data) => {
      // Invalidate queries to trigger refetch
      queryClient.invalidateQueries({ queryKey: ['enrichment', 'bulk-status'] });
      queryClient.invalidateQueries({ queryKey: ['enrichment', 'library-stats'] });

      showSuccessToast('Bulk enrichment started', `Job #${data.jobId} queued`);
    },
    onError: (error) => {
      showErrorToast(error, 'Trigger bulk enrichment');
    },
  });
};
