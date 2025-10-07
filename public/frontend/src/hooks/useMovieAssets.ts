/**
 * TanStack Query hooks for Movie Assets (Images, Extras)
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
export interface Image {
  id: number;
  type: string;
  url: string;
  cachePath: string;
  libraryPath?: string;
  width?: number;
  height?: number;
  locked: boolean;
  source?: string;
}

export interface ImagesByType {
  [type: string]: Image[];
}

export interface Trailer {
  id: number;
  url?: string;
  localPath?: string;
  quality?: string;
  size?: number;
}

export interface Subtitle {
  id: number;
  language: string;
  filePath: string;
  codec?: string;
  forced: boolean;
  size?: number;
}

export interface ThemeSong {
  id: number;
  filePath: string;
  duration?: number;
  size?: number;
}

export interface MovieExtras {
  trailer: Trailer | null;
  subtitles: Subtitle[];
  themeSong: ThemeSong | null;
}

export interface UnknownFile {
  id: number;
  file_name: string;
  file_path: string;
  file_size: number;
  extension: string;
  category: 'video' | 'image' | 'archive' | 'text' | 'other';
  created_at: string;
  library_path?: string;
}

/**
 * Fetch movie images
 */
export const useMovieImages = (movieId: number | null) => {
  return useQuery<ImagesByType, Error>({
    queryKey: ['movieImages', movieId],
    queryFn: async () => {
      if (!movieId) throw new Error('Movie ID is required');
      const response = await fetch(`/api/movies/${movieId}/images`);
      if (!response.ok) throw new Error('Failed to fetch images');
      const data = await response.json();

      // Group images by type
      const grouped: ImagesByType = {};
      data.images.forEach((img: any) => {
        if (!grouped[img.image_type]) {
          grouped[img.image_type] = [];
        }
        grouped[img.image_type].push(img);
      });

      return grouped;
    },
    enabled: !!movieId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

/**
 * Upload image
 */
export const useUploadImage = (movieId: number) => {
  const queryClient = useQueryClient();

  return useMutation<Image, Error, { file: File; type: string }>({
    mutationFn: async ({ file, type }) => {
      const formData = new FormData();
      formData.append('image', file);
      formData.append('imageType', type);

      const response = await fetch(`/api/movies/${movieId}/images/upload`, {
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
      queryClient.invalidateQueries({ queryKey: ['movieImages', movieId] });
    },
  });
};

/**
 * Toggle image lock
 */
export const useToggleImageLock = (movieId: number) => {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { imageId: number; locked: boolean }>({
    mutationFn: async ({ imageId, locked }) => {
      const response = await fetch(`/api/images/${imageId}/lock`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locked }),
      });

      if (!response.ok) {
        const errorMsg = await getErrorMessage(response);
        throw new Error(errorMsg);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['movieImages', movieId] });
    },
  });
};

/**
 * Delete image
 */
export const useDeleteImage = (movieId: number) => {
  const queryClient = useQueryClient();

  return useMutation<void, Error, number>({
    mutationFn: async (imageId: number) => {
      const response = await fetch(`/api/images/${imageId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorMsg = await getErrorMessage(response);
        throw new Error(errorMsg);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['movieImages', movieId] });
    },
  });
};

/**
 * Recover missing images from cache
 */
export const useRecoverImages = (movieId: number) => {
  const queryClient = useQueryClient();

  return useMutation<{ recoveredCount: number; message: string }, Error, void>({
    mutationFn: async () => {
      const response = await fetch(`/api/movies/${movieId}/images/recover`, {
        method: 'POST',
      });

      if (!response.ok) {
        const errorMsg = await getErrorMessage(response);
        throw new Error(errorMsg);
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['movieImages', movieId] });
    },
  });
};

/**
 * Fetch movie extras (trailer, subtitles, theme song)
 */
export const useMovieExtras = (movieId: number | null) => {
  return useQuery<MovieExtras, Error>({
    queryKey: ['movieExtras', movieId],
    queryFn: async () => {
      if (!movieId) throw new Error('Movie ID is required');
      const response = await fetch(`/api/movies/${movieId}/extras`);
      if (!response.ok) throw new Error('Failed to fetch extras');
      return response.json();
    },
    enabled: !!movieId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

/**
 * Delete trailer
 */
export const useDeleteTrailer = (movieId: number) => {
  const queryClient = useQueryClient();

  return useMutation<void, Error, void>({
    mutationFn: async () => {
      const response = await fetch(`/api/movies/${movieId}/extras/trailer`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorMsg = await getErrorMessage(response);
        throw new Error(errorMsg);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['movieExtras', movieId] });
    },
  });
};

/**
 * Delete subtitle
 */
export const useDeleteSubtitle = (movieId: number) => {
  const queryClient = useQueryClient();

  return useMutation<void, Error, number>({
    mutationFn: async (subtitleId: number) => {
      const response = await fetch(`/api/movies/${movieId}/extras/subtitles/${subtitleId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorMsg = await getErrorMessage(response);
        throw new Error(errorMsg);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['movieExtras', movieId] });
    },
  });
};

/**
 * Delete theme song
 */
export const useDeleteThemeSong = (movieId: number) => {
  const queryClient = useQueryClient();

  return useMutation<void, Error, void>({
    mutationFn: async () => {
      const response = await fetch(`/api/movies/${movieId}/extras/theme`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorMsg = await getErrorMessage(response);
        throw new Error(errorMsg);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['movieExtras', movieId] });
    },
  });
};

/**
 * Fetch unknown files for a movie
 */
export const useUnknownFiles = (movieId: number | null) => {
  return useQuery<UnknownFile[], Error>({
    queryKey: ['unknownFiles', movieId],
    queryFn: async () => {
      if (!movieId) throw new Error('Movie ID is required');
      const response = await fetch(`/api/movies/${movieId}/unknown-files`);
      if (!response.ok) throw new Error('Failed to fetch unknown files');
      const data = await response.json();
      return data.unknownFiles || [];
    },
    enabled: !!movieId,
    staleTime: 30 * 1000, // 30 seconds - shorter since these are transient
  });
};

/**
 * Assign unknown file to a type
 */
export const useAssignUnknownFile = (movieId: number) => {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { fileId: number; fileType: string }>(
    {
      mutationFn: async ({ fileId, fileType }) => {
        const response = await fetch(`/api/movies/${movieId}/unknown-files/${fileId}/assign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileType }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || 'Failed to assign file');
        }
      },
      onSuccess: () => {
        // Invalidate unknown files list
        queryClient.invalidateQueries({ queryKey: ['unknownFiles', movieId] });
        // Backend broadcasts moviesChanged, which will invalidate movieImages/movieExtras
      },
    }
  );
};

/**
 * Ignore unknown file (add pattern to ignore list)
 */
export const useIgnoreUnknownFile = (movieId: number) => {
  const queryClient = useQueryClient();

  return useMutation<void, Error, number>({
    mutationFn: async (fileId: number) => {
      const response = await fetch(`/api/movies/${movieId}/unknown-files/${fileId}/ignore`, {
        method: 'POST',
      });

      if (!response.ok) {
        const errorMsg = await getErrorMessage(response);
        throw new Error(errorMsg);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unknownFiles', movieId] });
    },
  });
};

/**
 * Ignore pattern for unknown file
 */
export const useIgnoreUnknownFilePattern = (movieId: number) => {
  const queryClient = useQueryClient();

  return useMutation<void, Error, number>({
    mutationFn: async (fileId: number) => {
      const response = await fetch(`/api/movies/${movieId}/unknown-files/${fileId}/ignore-pattern`, {
        method: 'POST',
      });

      if (!response.ok) {
        const errorMsg = await getErrorMessage(response);
        throw new Error(errorMsg);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unknownFiles', movieId] });
    },
  });
};

/**
 * Delete unknown file
 */
export const useDeleteUnknownFile = (movieId: number) => {
  const queryClient = useQueryClient();

  return useMutation<void, Error, number>({
    mutationFn: async (fileId: number) => {
      const response = await fetch(`/api/movies/${movieId}/unknown-files/${fileId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorMsg = await getErrorMessage(response);
        throw new Error(errorMsg);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unknownFiles', movieId] });
    },
  });
};
