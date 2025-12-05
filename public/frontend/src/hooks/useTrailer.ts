/**
 * TanStack Query hooks for Movie Trailers
 *
 * Provides hooks for:
 * - Fetching trailer data (selected trailer + candidates)
 * - Selecting trailers
 * - Adding trailers via URL
 * - Uploading trailers
 * - Deleting trailers
 * - Managing lock state
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

/**
 * Helper function to extract error message from response
 */
async function getErrorMessage(response: Response): Promise<string> {
  try {
    const error = await response.json();
    return error.message || error.error || 'Request failed';
  } catch {
    return `Request failed with status ${response.status}`;
  }
}

// Types
export interface TrailerCandidate {
  id: number;
  source_type: 'provider' | 'user' | 'upload';
  source_url: string | null;
  provider_name: string | null;
  tmdb_name: string | null;
  tmdb_official: boolean;
  tmdb_language: string | null;
  analyzed: boolean;
  title: string | null;
  duration_seconds: number | null;
  best_width: number | null;
  best_height: number | null;
  estimated_size_bytes: number | null;
  thumbnail_url: string | null;
  score: number | null;
  is_selected: boolean;
  selected_at: string | null;
  cache_video_file_id: number | null;
  downloaded_at: string | null;
  failed_at: string | null;
  failure_reason: string | null;
}

/**
 * Current selected trailer with lock state from movie entity
 */
export interface CurrentTrailer {
  id: number;
  source_type: 'provider' | 'user' | 'upload';
  source_url: string | null;
  provider_name: string | null;
  title: string | null;
  duration_seconds: number | null;
  is_locked: boolean; // From movies.trailer_locked
  cache_video_file_id: number | null;
  cache_file_path: string | null;
  is_downloaded: boolean;
}

export interface TrailerData {
  selected: CurrentTrailer | null;
  candidates: TrailerCandidate[];
  trailersEnabled: boolean;
}

export interface AddTrailerUrlParams {
  url: string;
  autoSelect?: boolean;
}

export interface UploadTrailerParams {
  file: File;
  title?: string;
}

/**
 * Fetch trailer data for a movie
 * Returns selected trailer, all candidates, and settings
 */
export const useTrailer = (movieId: number | null) => {
  return useQuery<TrailerData, Error>({
    queryKey: ['trailer', movieId],
    queryFn: async () => {
      if (!movieId) throw new Error('Movie ID is required');

      // Fetch selected trailer and candidates in parallel
      const [trailerResponse, candidatesResponse] = await Promise.all([
        fetch(`/api/movies/${movieId}/trailer`),
        fetch(`/api/movies/${movieId}/trailer/candidates`),
      ]);

      if (!trailerResponse.ok) {
        const errorMsg = await getErrorMessage(trailerResponse);
        throw new Error(errorMsg);
      }
      if (!candidatesResponse.ok) {
        const errorMsg = await getErrorMessage(candidatesResponse);
        throw new Error(errorMsg);
      }

      const selected = await trailerResponse.json();
      const candidatesData = await candidatesResponse.json();

      return {
        selected: selected || null,
        candidates: candidatesData.candidates || [],
        trailersEnabled: true, // TODO: Fetch from settings API
      };
    },
    enabled: !!movieId,
    staleTime: 30 * 1000, // 30 seconds
  });
};

/**
 * Fetch trailer candidates for selection modal
 */
export const useTrailerCandidates = (movieId: number | null) => {
  return useQuery<TrailerCandidate[], Error>({
    queryKey: ['trailerCandidates', movieId],
    queryFn: async () => {
      if (!movieId) throw new Error('Movie ID is required');

      const response = await fetch(`/api/movies/${movieId}/trailer/candidates`);
      if (!response.ok) {
        const errorMsg = await getErrorMessage(response);
        throw new Error(errorMsg);
      }
      const data = await response.json();
      // API returns { candidates: [...] }, extract the array
      return data.candidates || [];
    },
    enabled: !!movieId,
    staleTime: 30 * 1000,
  });
};

/**
 * Select a trailer candidate
 */
export const useSelectTrailer = (movieId: number) => {
  const queryClient = useQueryClient();

  return useMutation<void, Error, number>({
    mutationFn: async (candidateId: number) => {
      const response = await fetch(`/api/movies/${movieId}/trailer/select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateId }),
      });

      if (!response.ok) {
        const errorMsg = await getErrorMessage(response);
        throw new Error(errorMsg);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trailer', movieId] });
      queryClient.invalidateQueries({ queryKey: ['trailerCandidates', movieId] });
    },
  });
};

/**
 * Add trailer via URL (YouTube, Vimeo, etc.)
 */
export const useAddTrailerUrl = (movieId: number) => {
  const queryClient = useQueryClient();

  return useMutation<{ candidateId: number }, Error, AddTrailerUrlParams>({
    mutationFn: async ({ url, autoSelect = true }) => {
      const response = await fetch(`/api/movies/${movieId}/trailer/url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, autoSelect }),
      });

      if (!response.ok) {
        const errorMsg = await getErrorMessage(response);
        throw new Error(errorMsg);
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trailer', movieId] });
      queryClient.invalidateQueries({ queryKey: ['trailerCandidates', movieId] });
    },
  });
};

/**
 * Upload trailer file
 */
export const useUploadTrailer = (movieId: number) => {
  const queryClient = useQueryClient();

  return useMutation<{ candidateId: number }, Error, UploadTrailerParams>({
    mutationFn: async ({ file, title }) => {
      const formData = new FormData();
      formData.append('trailer', file);
      if (title) {
        formData.append('title', title);
      }

      const response = await fetch(`/api/movies/${movieId}/trailer/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorMsg = await getErrorMessage(response);
        throw new Error(errorMsg);
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trailer', movieId] });
      queryClient.invalidateQueries({ queryKey: ['trailerCandidates', movieId] });
    },
  });
};

/**
 * Delete selected trailer
 */
export const useDeleteTrailerSelection = (movieId: number) => {
  const queryClient = useQueryClient();

  return useMutation<void, Error, void>({
    mutationFn: async () => {
      const response = await fetch(`/api/movies/${movieId}/trailer`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorMsg = await getErrorMessage(response);
        throw new Error(errorMsg);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trailer', movieId] });
      queryClient.invalidateQueries({ queryKey: ['trailerCandidates', movieId] });
    },
  });
};

/**
 * Delete a specific trailer candidate
 */
export const useDeleteTrailerCandidate = (movieId: number) => {
  const queryClient = useQueryClient();

  return useMutation<void, Error, number>({
    mutationFn: async (candidateId: number) => {
      const response = await fetch(`/api/movies/${movieId}/trailer/candidates/${candidateId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorMsg = await getErrorMessage(response);
        throw new Error(errorMsg);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trailer', movieId] });
      queryClient.invalidateQueries({ queryKey: ['trailerCandidates', movieId] });
    },
  });
};

/**
 * Lock the trailer field to prevent automation
 */
export const useLockTrailer = (movieId: number) => {
  const queryClient = useQueryClient();

  return useMutation<void, Error, void>({
    mutationFn: async () => {
      const response = await fetch(`/api/movies/${movieId}/trailer/lock`, {
        method: 'POST',
      });

      if (!response.ok) {
        const errorMsg = await getErrorMessage(response);
        throw new Error(errorMsg);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trailer', movieId] });
      queryClient.invalidateQueries({ queryKey: ['trailerCandidates', movieId] });
      queryClient.invalidateQueries({ queryKey: ['movie', movieId] });
    },
  });
};

/**
 * Unlock the trailer field to allow automation
 */
export const useUnlockTrailer = (movieId: number) => {
  const queryClient = useQueryClient();

  return useMutation<void, Error, void>({
    mutationFn: async () => {
      const response = await fetch(`/api/movies/${movieId}/trailer/unlock`, {
        method: 'POST',
      });

      if (!response.ok) {
        const errorMsg = await getErrorMessage(response);
        throw new Error(errorMsg);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trailer', movieId] });
      queryClient.invalidateQueries({ queryKey: ['trailerCandidates', movieId] });
      queryClient.invalidateQueries({ queryKey: ['movie', movieId] });
    },
  });
};

/**
 * Toggle trailer lock state (lock if unlocked, unlock if locked)
 */
export const useToggleTrailerLock = (movieId: number) => {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { isCurrentlyLocked: boolean }>({
    mutationFn: async ({ isCurrentlyLocked }) => {
      const endpoint = isCurrentlyLocked ? 'unlock' : 'lock';
      const response = await fetch(`/api/movies/${movieId}/trailer/${endpoint}`, {
        method: 'POST',
      });

      if (!response.ok) {
        const errorMsg = await getErrorMessage(response);
        throw new Error(errorMsg);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trailer', movieId] });
      queryClient.invalidateQueries({ queryKey: ['trailerCandidates', movieId] });
      queryClient.invalidateQueries({ queryKey: ['movie', movieId] });
    },
  });
};

/**
 * Retry a failed trailer download
 *
 * Clears the failure state and triggers a new download attempt.
 * Returns wasUnavailable to indicate if the video was previously
 * marked as permanently unavailable (for UI warning).
 */
export const useRetryTrailerDownload = (movieId: number) => {
  const queryClient = useQueryClient();

  return useMutation<
    { success: boolean; message: string; wasUnavailable: boolean },
    Error,
    number
  >({
    mutationFn: async (candidateId: number) => {
      const response = await fetch(
        `/api/movies/${movieId}/trailer/candidates/${candidateId}/retry`,
        {
          method: 'POST',
        }
      );

      if (!response.ok) {
        const errorMsg = await getErrorMessage(response);
        throw new Error(errorMsg);
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trailer', movieId] });
      queryClient.invalidateQueries({ queryKey: ['trailerCandidates', movieId] });
    },
  });
};

/**
 * Get stream URL for a trailer
 */
export const getTrailerStreamUrl = (movieId: number): string => {
  return `/api/movies/${movieId}/trailer/stream`;
};

/**
 * Trailer download progress interface
 */
export interface TrailerProgress {
  entityId: number;
  percentage: number;
  speed: string;
  eta: number;
}

/**
 * Hook to get trailer download progress for a movie
 * Progress is updated in real-time via WebSocket events
 */
export const useTrailerProgress = (movieId: number | null) => {
  return useQuery<TrailerProgress | null>({
    queryKey: ['trailerProgress', movieId],
    queryFn: () => null, // Initial value - updated via WebSocket
    enabled: !!movieId,
    staleTime: Infinity, // Progress is only updated via WebSocket
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
  });
};

/**
 * Verification status for trailer candidates
 */
export type CandidateVerificationStatus = 'available' | 'unavailable' | 'unknown';

export interface VerifyCandidatesResult {
  results: Record<number, CandidateVerificationStatus>;
}

/**
 * Verify availability of all trailer candidates via oEmbed
 * Called when trailer selection modal opens
 */
export const useVerifyCandidates = (movieId: number) => {
  const queryClient = useQueryClient();

  return useMutation<VerifyCandidatesResult, Error, void>({
    mutationFn: async () => {
      const response = await fetch(`/api/movies/${movieId}/trailer/candidates/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const errorMsg = await getErrorMessage(response);
        throw new Error(errorMsg);
      }
      return response.json();
    },
    onSuccess: () => {
      // Optionally refresh candidates after verification
      queryClient.invalidateQueries({ queryKey: ['trailerCandidates', movieId] });
    },
  });
};

/**
 * Test result for a single trailer candidate
 */
export interface TestCandidateResult {
  success: boolean;
  error?: 'unavailable' | 'rate_limited' | 'region_blocked' | 'format_error';
  message?: string;
}

/**
 * Test if a specific trailer candidate can be downloaded
 * Uses yt-dlp --simulate to test full download chain
 */
export const useTestCandidate = (movieId: number) => {
  const queryClient = useQueryClient();

  return useMutation<TestCandidateResult, Error, number>({
    mutationFn: async (candidateId: number) => {
      const response = await fetch(
        `/api/movies/${movieId}/trailer/candidates/${candidateId}/test`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }
      );

      if (!response.ok) {
        const errorMsg = await getErrorMessage(response);
        throw new Error(errorMsg);
      }
      return response.json();
    },
    onSuccess: () => {
      // Refresh candidates to reflect any failure state changes
      queryClient.invalidateQueries({ queryKey: ['trailerCandidates', movieId] });
      queryClient.invalidateQueries({ queryKey: ['trailer', movieId] });
    },
  });
};
