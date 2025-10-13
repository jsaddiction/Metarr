/**
 * TanStack Query hooks for Auto-Selection Strategy
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { autoSelectionApi } from '../utils/api';
import { AutoSelectionStrategy } from '../types/provider';

/**
 * Fetch the current auto-selection strategy
 */
export const useAutoSelectionStrategy = () => {
  return useQuery<AutoSelectionStrategy, Error>({
    queryKey: ['autoSelectionStrategy'],
    queryFn: () => autoSelectionApi.getStrategy(),
  });
};

/**
 * Set the auto-selection strategy
 */
export const useSetAutoSelectionStrategy = () => {
  const queryClient = useQueryClient();

  return useMutation<void, Error, AutoSelectionStrategy>({
    mutationFn: (strategy: AutoSelectionStrategy) => autoSelectionApi.setStrategy(strategy),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['autoSelectionStrategy'] });
    },
  });
};
