import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { assetLimitsApi } from '../utils/api';
import { AssetLimit } from '../types/assetConfig';
import { toast } from 'sonner';

/**
 * Hook for managing asset download limits
 */
export function useAssetLimits() {
  const queryClient = useQueryClient();

  // Fetch all asset limits with metadata
  const {
    data: limits,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['assetLimits'],
    queryFn: () => assetLimitsApi.getAllWithMetadata(),
  });

  // Mutation for updating a single limit
  const updateLimitMutation = useMutation({
    mutationFn: ({ assetType, limit }: { assetType: string; limit: number }) =>
      assetLimitsApi.setLimit(assetType, limit),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['assetLimits'] });
      toast.success(`Updated limit for ${variables.assetType}`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to update limit: ${error.message}`);
    },
  });

  // Mutation for resetting a single limit
  const resetLimitMutation = useMutation({
    mutationFn: (assetType: string) => assetLimitsApi.resetLimit(assetType),
    onSuccess: (_, assetType) => {
      queryClient.invalidateQueries({ queryKey: ['assetLimits'] });
      toast.success(`Reset ${assetType} to default`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to reset limit: ${error.message}`);
    },
  });

  // Mutation for resetting all limits
  const resetAllMutation = useMutation({
    mutationFn: () => assetLimitsApi.resetAll(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assetLimits'] });
      toast.success('Reset all limits to defaults');
    },
    onError: (error: Error) => {
      toast.error(`Failed to reset all limits: ${error.message}`);
    },
  });

  return {
    limits: limits || [],
    isLoading,
    error,
    updateLimit: updateLimitMutation.mutate,
    resetLimit: resetLimitMutation.mutate,
    resetAll: resetAllMutation.mutate,
    isUpdating: updateLimitMutation.isPending,
    isResetting: resetLimitMutation.isPending || resetAllMutation.isPending,
  };
}
