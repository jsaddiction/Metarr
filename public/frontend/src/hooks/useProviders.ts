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
    },
  });
};
