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
 *
 * @deprecated Use useMovie(movieId, ['files']) instead - images available at movie.files.images
 * This hook is kept for backward compatibility but will be removed in a future version.
 */
export const useMovieImages = (movieId: number | null) => {
  return useQuery<ImagesByType, Error>({
    queryKey: ['movieImages', movieId],
    queryFn: async () => {
      if (!movieId) throw new Error('Movie ID is required');

      // Use the new include parameter approach
      const response = await fetch(`/api/movies/${movieId}?include=files`);
      if (!response.ok) throw new Error('Failed to fetch movie data');
      const data = await response.json();

      // Extract and group images by type from files.images
      // Backend already filters for cache-only images
      const grouped: ImagesByType = {};
      if (data.files && data.files.images) {
        data.files.images.forEach((img: any) => {
          const type = img.file_type || img.image_type;
          if (!grouped[type]) {
            grouped[type] = [];
          }

          // Extract relative path from cache directory
          // file_path example: C:\Users\...\data\cache\images\29\75\hash.jpg
          // We want: /cache/images/29/75/hash.jpg
          let cacheUrl = null;
          if (img.file_path) {
            // Extract the path after 'cache\' or 'cache/'
            const pathParts = img.file_path.split(/[\/\\]cache[\/\\]/i);
            if (pathParts.length > 1) {
              // Convert backslashes to forward slashes and prepend /cache
              cacheUrl = `/cache/${pathParts[1].replace(/\\/g, '/')}`;
            }
          }

          const imageWithUrl = {
            ...img,
            cache_url: cacheUrl,
            cache_path: img.file_path, // For compatibility
          };
          grouped[type].push(imageWithUrl);
        });
      }

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
 * Rebuild all assets from cache (replaces old recover images functionality)
 * This rebuilds ALL assets (images, trailers, subtitles, etc.) not just images
 */
export const useRebuildAssets = (movieId: number) => {
  const queryClient = useQueryClient();

  return useMutation<{ message: string }, Error, void>({
    mutationFn: async () => {
      const response = await fetch(`/api/movies/${movieId}/rebuild-assets`, {
        method: 'POST',
      });

      if (!response.ok) {
        const errorMsg = await getErrorMessage(response);
        throw new Error(errorMsg);
      }
      return response.json();
    },
    onSuccess: () => {
      // Invalidate all file-related queries
      queryClient.invalidateQueries({ queryKey: ['movie', movieId] });
      queryClient.invalidateQueries({ queryKey: ['movieImages', movieId] });
      queryClient.invalidateQueries({ queryKey: ['movieExtras', movieId] });
    },
  });
};

/**
 * Fetch movie extras (trailer, subtitles, theme song)
 *
 * @deprecated Use useMovie(movieId, ['files']) instead - extras available at movie.files.videos, movie.files.text, movie.files.audio
 * This hook is kept for backward compatibility but will be removed in a future version.
 */
export const useMovieExtras = (movieId: number | null) => {
  return useQuery<MovieExtras, Error>({
    queryKey: ['movieExtras', movieId],
    queryFn: async () => {
      if (!movieId) throw new Error('Movie ID is required');

      // Use the new include parameter approach
      const response = await fetch(`/api/movies/${movieId}?include=files`);
      if (!response.ok) throw new Error('Failed to fetch movie data');
      const data = await response.json();

      // Extract extras from files
      const extras: MovieExtras = {
        trailer: null,
        subtitles: [],
        themeSong: null,
      };

      if (data.files) {
        // Find trailer from video files (note: API returns 'video' not 'videos')
        if (data.files.video && data.files.video.length > 0) {
          const trailer = data.files.video.find((v: any) => v.video_type === 'trailer');
          if (trailer) {
            extras.trailer = {
              id: trailer.id,
              file_path: trailer.file_path,
              file_size: trailer.file_size,
              duration: trailer.duration_seconds,
              resolution: trailer.resolution,
            };
          }
        }

        // Map subtitles from text files
        if (data.files.text && data.files.text.length > 0) {
          extras.subtitles = data.files.text
            .filter((t: any) => t.text_type === 'subtitle')
            .map((t: any) => ({
              id: t.id,
              language: t.subtitle_language || 'unknown',
              file_path: t.file_path,
              file_size: t.file_size,
              format: t.format,
              forced: false,
            }));
        }

        // Find theme song from audio files
        if (data.files.audio && data.files.audio.length > 0) {
          const theme = data.files.audio.find((a: any) => a.audio_type === 'theme');
          if (theme) {
            extras.themeSong = {
              id: theme.id,
              file_path: theme.file_path,
              file_size: theme.file_size,
              duration: theme.duration_seconds,
            };
          }
        }
      }

      return extras;
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
 *
 * @deprecated Use useMovie(movieId, ['files']) instead - unknown files available at movie.files.unknown
 * This hook is kept for backward compatibility but will be removed in a future version.
 */
export const useUnknownFiles = (movieId: number | null) => {
  return useQuery<UnknownFile[], Error>({
    queryKey: ['unknownFiles', movieId],
    queryFn: async () => {
      if (!movieId) throw new Error('Movie ID is required');

      // Use the new include parameter approach
      const response = await fetch(`/api/movies/${movieId}?include=files`);
      if (!response.ok) throw new Error('Failed to fetch movie data');
      const data = await response.json();

      // Return unknown files from the files object
      return data.files?.unknown || [];
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
