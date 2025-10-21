import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios, { AxiosError } from 'axios';
import { toast } from 'sonner';
import { getErrorMessage } from '../utils/errorHandling';

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
  return useQuery<AssetCandidate[], Error>({
    queryKey: ['assetCandidates', entityId, assetType, includeBlocked],
    queryFn: async () => {
      try {
        const response = await axios.get<{ candidates: AssetCandidate[] }>(
          `/api/movies/${entityId}/asset-candidates`,
          {
            params: { type: assetType, includeBlocked }
          }
        );
        return response.data.candidates;
      } catch (error) {
        if (axios.isAxiosError(error)) {
          const message = error.response?.data?.message || error.response?.data?.error || error.message;
          throw new Error(message);
        }
        throw error;
      }
    },
    retry: 1,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};

/**
 * Select an asset candidate
 * POST /api/asset-candidates/:id/select
 */
export const useSelectAsset = () => {
  const queryClient = useQueryClient();

  return useMutation<AssetCandidate, Error, {
    candidateId: number;
    selectedBy?: 'user' | 'auto';
  }>({
    mutationFn: async ({
      candidateId,
      selectedBy = 'user'
    }) => {
      try {
        const response = await axios.post<{ candidate: AssetCandidate }>(
          `/api/asset-candidates/${candidateId}/select`,
          { selectedBy }
        );
        return response.data.candidate;
      } catch (error) {
        if (axios.isAxiosError(error)) {
          const message = error.response?.data?.message || error.response?.data?.error || error.message;
          throw new Error(message);
        }
        throw error;
      }
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

      toast.success('Asset selected successfully');
    },
    onError: (error) => {
      toast.error('Failed to select asset', {
        description: error.message,
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

  return useMutation<
    { candidateId: number; entityId: number; assetType: string },
    Error,
    {
      candidateId: number;
      entityId: number;
      assetType: string;
      blockedBy?: 'user' | 'auto';
    }
  >({
    mutationFn: async ({
      candidateId,
      entityId,
      assetType,
      blockedBy = 'user'
    }) => {
      try {
        await axios.post(`/api/asset-candidates/${candidateId}/block`, {
          blockedBy
        });
        return { candidateId, entityId, assetType };
      } catch (error) {
        if (axios.isAxiosError(error)) {
          const message = error.response?.data?.message || error.response?.data?.error || error.message;
          throw new Error(message);
        }
        throw error;
      }
    },
    onSuccess: ({ entityId, assetType }) => {
      // Invalidate asset candidates cache
      queryClient.invalidateQueries({
        queryKey: ['assetCandidates', entityId, assetType]
      });

      toast.success('Asset blocked successfully');
    },
    onError: (error) => {
      toast.error('Failed to block asset', {
        description: error.message,
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

  return useMutation<
    { candidateId: number; entityId: number; assetType: string },
    Error,
    {
      candidateId: number;
      entityId: number;
      assetType: string;
    }
  >({
    mutationFn: async ({
      candidateId,
      entityId,
      assetType
    }) => {
      try {
        await axios.post(`/api/asset-candidates/${candidateId}/unblock`);
        return { candidateId, entityId, assetType };
      } catch (error) {
        if (axios.isAxiosError(error)) {
          const message = error.response?.data?.message || error.response?.data?.error || error.message;
          throw new Error(message);
        }
        throw error;
      }
    },
    onSuccess: ({ entityId, assetType }) => {
      // Invalidate asset candidates cache
      queryClient.invalidateQueries({
        queryKey: ['assetCandidates', entityId, assetType]
      });

      toast.success('Asset unblocked successfully');
    },
    onError: (error) => {
      toast.error('Failed to unblock asset', {
        description: error.message,
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

  return useMutation<
    { entityId: number; assetType: string },
    Error,
    {
      entityId: number;
      assetType: string;
    }
  >({
    mutationFn: async ({
      entityId,
      assetType
    }) => {
      try {
        await axios.post(`/api/movies/${entityId}/reset-asset`, {
          assetType
        });
        return { entityId, assetType };
      } catch (error) {
        if (axios.isAxiosError(error)) {
          const message = error.response?.data?.message || error.response?.data?.error || error.message;
          throw new Error(message);
        }
        throw error;
      }
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

      toast.success('Asset selection reset successfully');
    },
    onError: (error) => {
      toast.error('Failed to reset asset selection', {
        description: error.message,
      });
    },
  });
};
