import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { assetApi } from '../utils/api';
import { AssetCandidate } from '../types/asset';
import { showErrorToast, showSuccessToast } from '../utils/errorHandling';

/**
 * Fetch asset candidates for an entity
 * GET /api/movies/:id/asset-candidates?type=poster
 */
export const useAssetCandidates = (
  entityId: number,
  assetType: string,
  includeBlocked: boolean = false
) => {
  return useQuery<AssetCandidate[], Error>({
    queryKey: ['assetCandidates', entityId, assetType, includeBlocked],
    queryFn: () => assetApi.getCandidates(entityId, assetType, includeBlocked),
    retry: 1,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};

// REMOVED: useSelectAsset, useBlockAsset, useUnblockAsset, useResetAssetSelection
// These mutations are no longer needed with the cache-aside pattern.
// Asset candidates are now simple cache entries without selection/blocked state.
// Users browse cached candidates and select images directly via replaceAssets API.
