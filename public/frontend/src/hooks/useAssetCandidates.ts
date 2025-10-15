import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';

/**
 * Asset Candidate Interface
 */
export interface AssetCandidate {
  id: number;
  entity_type: string;
  entity_id: number;
  asset_type: string;
  provider: string;
  url: string;
  width: number | null;
  height: number | null;
  language: string | null;
  vote_average: number | null;
  vote_count: number | null;
  score: number;
  is_selected: boolean;
  is_blocked: boolean;
  selected_at: string | null;
  selected_by: string | null;
  blocked_at: string | null;
  blocked_by: string | null;
  last_refreshed: string;
  created_at: string;
}

/**
 * Fetch asset candidates for an entity
 * GET /api/movies/:id/asset-candidates?type=poster
 */
export const useAssetCandidates = (
  entityId: number,
  assetType: string,
  includeBlocked: boolean = false
) => {
  return useQuery({
    queryKey: ['assetCandidates', entityId, assetType, includeBlocked],
    queryFn: async () => {
      const response = await axios.get<{ candidates: AssetCandidate[] }>(
        `/api/movies/${entityId}/asset-candidates`,
        {
          params: { type: assetType, includeBlocked }
        }
      );
      return response.data.candidates;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};

/**
 * Select an asset candidate
 * POST /api/asset-candidates/:id/select
 */
export const useSelectAsset = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      candidateId,
      selectedBy = 'user'
    }: {
      candidateId: number;
      selectedBy?: 'user' | 'auto';
    }) => {
      const response = await axios.post<{ candidate: AssetCandidate }>(
        `/api/asset-candidates/${candidateId}/select`,
        { selectedBy }
      );
      return response.data.candidate;
    },
    onSuccess: (candidate) => {
      // Invalidate asset candidates cache for this entity
      queryClient.invalidateQueries({
        queryKey: ['assetCandidates', candidate.entity_id, candidate.asset_type]
      });
      // Invalidate movie details (in case asset data is shown there)
      queryClient.invalidateQueries({
        queryKey: ['movie', candidate.entity_id]
      });
      // Invalidate images list
      queryClient.invalidateQueries({
        queryKey: ['movieImages', candidate.entity_id]
      });
    },
  });
};

/**
 * Block an asset candidate (blacklist)
 * POST /api/asset-candidates/:id/block
 */
export const useBlockAsset = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      candidateId,
      entityId,
      assetType,
      blockedBy = 'user'
    }: {
      candidateId: number;
      entityId: number;
      assetType: string;
      blockedBy?: 'user' | 'auto';
    }) => {
      await axios.post(`/api/asset-candidates/${candidateId}/block`, {
        blockedBy
      });
      return { candidateId, entityId, assetType };
    },
    onSuccess: ({ entityId, assetType }) => {
      // Invalidate asset candidates cache
      queryClient.invalidateQueries({
        queryKey: ['assetCandidates', entityId, assetType]
      });
    },
  });
};

/**
 * Unblock an asset candidate
 * POST /api/asset-candidates/:id/unblock
 */
export const useUnblockAsset = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      candidateId,
      entityId,
      assetType
    }: {
      candidateId: number;
      entityId: number;
      assetType: string;
    }) => {
      await axios.post(`/api/asset-candidates/${candidateId}/unblock`);
      return { candidateId, entityId, assetType };
    },
    onSuccess: ({ entityId, assetType }) => {
      // Invalidate asset candidates cache
      queryClient.invalidateQueries({
        queryKey: ['assetCandidates', entityId, assetType]
      });
    },
  });
};

/**
 * Reset asset selection (deselect all)
 * POST /api/movies/:id/reset-asset
 */
export const useResetAssetSelection = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      entityId,
      assetType
    }: {
      entityId: number;
      assetType: string;
    }) => {
      await axios.post(`/api/movies/${entityId}/reset-asset`, {
        assetType
      });
      return { entityId, assetType };
    },
    onSuccess: ({ entityId, assetType }) => {
      // Invalidate asset candidates cache
      queryClient.invalidateQueries({
        queryKey: ['assetCandidates', entityId, assetType]
      });
      // Invalidate movie details
      queryClient.invalidateQueries({
        queryKey: ['movie', entityId]
      });
      // Invalidate images list
      queryClient.invalidateQueries({
        queryKey: ['movieImages', entityId]
      });
    },
  });
};
