import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { recycleBinApi } from '../utils/api';

interface RecycleBinFile {
  id: number;
  fileName: string;
  fileSize: number | null;
  originalPath: string;
  recyclePath: string | null;
  status: 'recycled' | 'pending';
  recycledAt: string | null;
}

interface RecycleBinStats {
  totalFiles: number;
  totalSizeBytes: number;
  totalSizeGB: string;
  oldestEntry: string | null;
  pendingDeletion: number;
}

/**
 * Fetch recycle bin files for a specific movie
 */
export const useRecycleBinForMovie = (movieId: number) => {
  return useQuery<RecycleBinFile[]>({
    queryKey: ['recycleBin', 'movie', movieId],
    queryFn: () => recycleBinApi.getForMovie(movieId),
    enabled: !!movieId,
  });
};

/**
 * Fetch recycle bin files for a specific episode
 */
export const useRecycleBinForEpisode = (episodeId: number) => {
  return useQuery<RecycleBinFile[]>({
    queryKey: ['recycleBin', 'episode', episodeId],
    queryFn: () => recycleBinApi.getForEpisode(episodeId),
    enabled: !!episodeId,
  });
};

/**
 * Fetch global recycle bin statistics
 */
export const useRecycleBinStats = () => {
  return useQuery<RecycleBinStats>({
    queryKey: ['recycleBin', 'stats'],
    queryFn: async () => {
      const response = await recycleBinApi.getStats();
      return response.data;
    },
  });
};

/**
 * Restore a file from recycle bin
 */
export const useRestoreFile = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (recycleId: number) => recycleBinApi.restore(recycleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recycleBin'] });
    },
  });
};

/**
 * Permanently delete a file from recycle bin
 */
export const usePermanentlyDeleteFile = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (recycleId: number) => recycleBinApi.permanentlyDelete(recycleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recycleBin'] });
    },
  });
};

/**
 * Cleanup expired recycle bin items
 */
export const useCleanupExpired = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => recycleBinApi.cleanupExpired(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recycleBin'] });
    },
  });
};

/**
 * Cleanup pending recycle bin items
 */
export const useCleanupPending = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => recycleBinApi.cleanupPending(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recycleBin'] });
    },
  });
};

/**
 * Empty entire recycle bin
 */
export const useEmptyRecycleBin = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => recycleBinApi.empty(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recycleBin'] });
    },
  });
};
