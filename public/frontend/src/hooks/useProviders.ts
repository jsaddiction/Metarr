/**
 * TanStack Query hooks for Provider Configuration
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { providerApi } from '../utils/api';
import {
  ProviderWithMetadata,
  UpdateProviderRequest,
  TestProviderResponse,
} from '../types/provider';
import { showErrorToast, showSuccessToast } from '../utils/errorHandling';

/**
 * Fetch all providers with their metadata
 */
export const useProviders = () => {
  return useQuery<ProviderWithMetadata[], Error>({
    queryKey: ['providers'],
    queryFn: () => providerApi.getAll(),
  });
};

/**
 * Fetch a single provider by name
 */
export const useProvider = (name: string) => {
  return useQuery<{ config: any; metadata: any }, Error>({
    queryKey: ['provider', name],
    queryFn: () => providerApi.getByName(name),
    enabled: !!name,
  });
};

/**
 * Update provider configuration
 */
export const useUpdateProvider = () => {
  const queryClient = useQueryClient();

  return useMutation<ProviderWithMetadata, Error, { name: string; data: UpdateProviderRequest }>({
    mutationFn: ({ name, data }) => providerApi.update(name, data),
    onSuccess: (data, { name }) => {
      queryClient.invalidateQueries({ queryKey: ['providers'] });
      queryClient.invalidateQueries({ queryKey: ['provider', name] });
      showSuccessToast('Provider configuration updated successfully');
    },
    onError: (error) => {
      showErrorToast(error, 'Update provider');
    },
  });
};

/**
 * Test provider connection
 */
export const useTestProvider = () => {
  return useMutation<TestProviderResponse, Error, { name: string; apiKey?: string }>({
    mutationFn: ({ name, apiKey }) => providerApi.test(name, apiKey),
  });
};

/**
 * Disable provider (delete configuration)
 */
export const useDisableProvider = () => {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (name: string) => providerApi.disable(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['providers'] });
      showSuccessToast('Provider disabled successfully');
    },
    onError: (error) => {
      showErrorToast(error, 'Disable provider');
    },
  });
};

/**
 * Fetch provider statistics (API calls in last 24 hours)
 * Auto-refreshes every 10 seconds
 */
export const useProviderStats = () => {
  return useQuery<Record<string, {
    totalCalls24h: number;
    lastSuccessfulFetch?: string;
    successRate?: number;
  }>, Error>({
    queryKey: ['provider-stats'],
    queryFn: () => providerApi.getStatistics(),
    refetchInterval: 10000, // 10 seconds
    staleTime: 8000, // Consider stale after 8 seconds
  });
};
