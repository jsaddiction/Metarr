import React, { useState, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faLock,
  faLockOpen,
  faTrash,
  faUpload,
  faImage,
  faSpinner,
  faArrowLeft,
  faTimes,
  faSearch,
} from '@fortawesome/free-solid-svg-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  useMovieImages,
  useUploadImage,
  useToggleImageLock,
  useDeleteImage,
} from '../../hooks/useMovieAssets';
import { useMovie } from '../../hooks/useMovies';
import { AssetCard } from '../asset/AssetCard';
import { AssetBrowserModal } from '../asset/AssetBrowserModal';
import { CurrentAssetCard } from './CurrentAssetCard';
import { EmptySlotCard } from './EmptySlotCard';
import { AssetSelectionModalV2 } from './AssetSelectionModal_v2';
import { assetApi } from '../../utils/api';
import type { AssetType, AssetCandidate } from '../../types/asset';
import { useConfirm } from '../../hooks/useConfirm';

interface ImagesTabProps {
  movieId: number;
  movieTitle?: string;
}

interface Image {
  id: number;
  entity_type: string;
  entity_id: number;
  image_type: string;
  source_url: string | null;  // Original provider URL
  provider_name: string | null;
  cache_path: string | null;
  library_path: string | null;
  file_path: string | null;
  width: number | null;
  height: number | null;
  vote_average: number | null;
  locked: boolean;
  cache_url: string;  // Computed URL for serving from cache
}

interface ImagesByType {
  [key: string]: Image[];
}

const ASSET_TYPE_INFO: Record<string, { label: string; aspectRatio: string; gridCols: string }> = {
  poster: { label: 'Posters', aspectRatio: 'aspect-[2/3]', gridCols: 'grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-4' },
  fanart: { label: 'Fanart', aspectRatio: 'aspect-[16/9]', gridCols: 'grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4' },
  banner: { label: 'Banners', aspectRatio: 'aspect-[1000/185]', gridCols: 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4' },
  clearlogo: { label: 'Clear Logos', aspectRatio: 'aspect-[800/310]', gridCols: 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4' },
  clearart: { label: 'Clear Art', aspectRatio: 'aspect-[1000/562]', gridCols: 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4' },
  landscape: { label: 'Landscapes', aspectRatio: 'aspect-[16/9]', gridCols: 'grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4' },
  keyart: { label: 'Key Art', aspectRatio: 'aspect-[2/3]', gridCols: 'grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-4' },
  discart: { label: 'Disc Art', aspectRatio: 'aspect-square', gridCols: 'grid grid-cols-3 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-9 gap-4' },
};

export const ImagesTab: React.FC<ImagesTabProps> = ({ movieId, movieTitle = 'Unknown Movie' }) => {
  // Accessible confirmation dialog
  const { confirm, ConfirmDialog } = useConfirm();

  // Use TanStack Query hooks
  const queryClient = useQueryClient();
  const { data: images = {}, isLoading: loading } = useMovieImages(movieId);
  const { data: movie } = useMovie(movieId);
  const uploadImageMutation = useUploadImage(movieId);
  const toggleLockMutation = useToggleImageLock(movieId);
  const deleteImageMutation = useDeleteImage(movieId);

  // Replace assets mutation with loading state
  const replaceAssetsMutation = useMutation({
    mutationFn: async ({
      assetType,
      assets
    }: {
      assetType: string;
      assets: Array<{ url: string; provider: string; width?: number; height?: number; perceptualHash?: string }>
    }) => {
      const response = await fetch(`/api/movies/${movieId}/assets/${assetType}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assets }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        const errorMessage = errorData.error || errorData.message || 'Failed to save asset selection';
        throw new Error(errorMessage);
      }

      return response.json();
    },
    onSuccess: (result) => {
      // Show warnings if any
      if (result.warnings && result.warnings.length > 0) {
        console.warn('Asset quality warnings:', result.warnings);
      }

      // Show errors if any (but still succeeded overall)
      if (result.errors && result.errors.length > 0) {
        console.error('Some assets failed:', result.errors);
      }

      // Invalidate queries to refetch updated data
      queryClient.invalidateQueries({ queryKey: ['movieImages', movieId] });
      queryClient.invalidateQueries({ queryKey: ['movie', movieId] });
    },
  });

  // Fetch asset limits configuration
  const { data: assetLimits = {} } = useQuery<Record<string, number>>({
    queryKey: ['asset-limits'],
    queryFn: async () => {
      const response = await fetch('/api/settings/asset-limits');
      if (!response.ok) throw new Error('Failed to fetch asset limits');
      return response.json();
    },
    staleTime: 1000 * 60 * 60, // 1 hour - limits rarely change
  });

  const [fullscreenImage, setFullscreenImage] = useState<Image | null>(null);
  const [assetDialogOpen, setAssetDialogOpen] = useState(false);
  const [assetBrowserOpen, setAssetBrowserOpen] = useState(false);
  const [selectedAssetType, setSelectedAssetType] = useState<AssetType | null>(null);

  // Convert Image to AssetCandidate for use with AssetCard
  const imageToAssetCandidate = (image: Image, assetType: string): AssetCandidate => ({
    providerId: image.source_url ? 'tmdb' : ('custom' as any), // If from provider, assume tmdb, otherwise custom
    providerResultId: image.id.toString(),
    assetType: assetType as AssetType,
    url: image.cache_url,
    thumbnailUrl: image.cache_url,
    width: image.width || undefined,
    height: image.height || undefined,
    voteAverage: image.vote_average || undefined,
    votes: undefined, // Explicitly set to undefined to prevent rendering issues
  });

  // Fetch ALL asset types at once (efficient - TMDB returns everything in one call)
  // This populates the cache for all asset types, so subsequent "Edit" clicks are instant
  const {
    data: providerResults,
    isLoading: isLoadingProviders,
    error: providerError,
  } = useQuery({
    queryKey: ['provider-results', 'movie', movieId], // Remove selectedAssetType from key
    queryFn: () => assetApi.getEntityProviderResults('movie', movieId, [
      'poster',
      'fanart',
      'clearlogo',
      'clearart',
      'banner',
      'landscape',
      'keyart',
      'discart',
    ]),
    enabled: assetDialogOpen, // Fetch when ANY edit button is clicked
    staleTime: 1000 * 60 * 60, // 1 hour cache - reuse for all asset types
  });

  const handleToggleLock = async (imageId: number, currentLocked: boolean) => {
    try {
      await toggleLockMutation.mutateAsync({ imageId, locked: !currentLocked });
      // Success - TanStack Query will automatically refetch
    } catch (error) {
      console.error('Failed to toggle lock:', error);
      alert('Failed to toggle lock');
    }
  };

  const handleDeleteImage = async (imageId: number) => {
    const confirmed = await confirm({
      title: 'Delete Image',
      description: 'Are you sure you want to delete this image? This action cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'destructive',
    });

    if (!confirmed) return;

    try {
      await deleteImageMutation.mutateAsync(imageId);
      // Success - TanStack Query will automatically refetch
    } catch (error) {
      console.error('Failed to delete image:', error);
      alert('Failed to delete image');
    }
  };

  const handleSearchProviders = (assetType: string) => {
    setSelectedAssetType(assetType as AssetType);
    setAssetDialogOpen(true);
  };

  const handleBrowseAssets = (assetType: string) => {
    setSelectedAssetType(assetType as AssetType);
    setAssetBrowserOpen(true);
  };

  const handleAssetSelect = async (selectedAssets: Array<{ asset: AssetCandidate; provider: string }>) => {
    if (!selectedAssetType) return;

    try {
      // Map selected assets to the format expected by the backend
      // For cached assets (those with /cache/ URLs), we send the original source_url
      // For new provider assets, we send the provider URL
      const assetsToSend = selectedAssets
        .map(({ asset, provider }) => ({
          url: asset.url,
          provider,
          width: asset.width,
          height: asset.height,
          perceptualHash: asset.perceptualHash,
        }))
        .filter(({ url }) => {
          // Only include assets with valid HTTP/HTTPS URLs
          // This filters out any assets without proper source URLs
          return url && (url.startsWith('http://') || url.startsWith('https://'));
        });

      // Use the mutation which handles loading state
      await replaceAssetsMutation.mutateAsync({
        assetType: selectedAssetType,
        assets: assetsToSend,
      });

      // Success - close dialog (refetch handled by mutation onSuccess)
      setAssetDialogOpen(false);
    } catch (error) {
      console.error('Failed to save asset selection:', error);
      alert(error instanceof Error ? error.message : 'Failed to save asset selection');
    }
  };

  if (loading) {
    return (
      <div className="card">
        <div className="card-body text-center py-12">
          <FontAwesomeIcon icon={faSpinner} spin className="text-3xl text-neutral-400 mb-3" />
          <div className="text-neutral-400">Loading images...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Image type sections */}
      {Object.entries(ASSET_TYPE_INFO).map(([assetType, info]) => {
        const typeImages = images[assetType] || [];
        const maxLimit = assetLimits[assetType] ?? 1; // Default to 1 if not configured
        const canUpload = typeImages.length < maxLimit;
        // Check field lock from movie record (e.g., poster_locked)
        const lockFieldName = `${assetType}_locked` as keyof typeof movie;
        const isGroupLocked = movie?.[lockFieldName] === true || movie?.[lockFieldName] === 1;

        // Skip disabled asset types (limit = 0)
        if (maxLimit === 0) return null;

        // Calculate empty slots
        const emptySlotCount = Math.max(0, maxLimit - typeImages.length);

        return (
          <div key={assetType} className="card">
            <div className="card-body">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  {/* Lock button - left of title */}
                  <button
                    onClick={async () => {
                      // Toggle group lock via API
                      const newLockedState = !isGroupLocked;
                      try {
                        const response = await fetch(`/api/movies/${movieId}/assets/${assetType}/lock`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ locked: newLockedState }),
                        });
                        if (!response.ok) throw new Error('Failed to toggle lock');

                        // Force refetch movie data to update lock state immediately
                        await queryClient.refetchQueries({ queryKey: ['movie', movieId] });
                      } catch (error) {
                        console.error('Failed to toggle group lock:', error);
                        alert('Failed to toggle lock');
                      }
                    }}
                    className={`btn btn-sm btn-ghost ${isGroupLocked ? 'text-primary-500' : 'text-neutral-400'}`}
                    title={isGroupLocked ? 'Locked - click to unlock' : 'Unlocked - click to lock'}
                    aria-label={isGroupLocked ? 'Unlock all images' : 'Lock all images'}
                  >
                    <FontAwesomeIcon icon={isGroupLocked ? faLock : faLockOpen} aria-hidden="true" />
                  </button>

                  {/* Title */}
                  <h3 className="text-lg font-semibold text-white">
                    {info.label}
                    <span className="text-sm text-neutral-400 font-normal ml-2">
                      ({typeImages.length}/{maxLimit})
                    </span>
                  </h3>
                </div>

                {/* Edit button - opens modal */}
                <button
                  onClick={() => handleSearchProviders(assetType)}
                  className="btn btn-secondary btn-sm"
                >
                  <FontAwesomeIcon icon={faSearch} className="mr-2" aria-hidden="true" />
                  Edit
                </button>
              </div>

              {typeImages.length === 0 ? (
                <div className="text-center py-8 bg-neutral-800/30 rounded border border-dashed border-neutral-700">
                  <FontAwesomeIcon icon={faImage} className="text-4xl text-neutral-600 mb-3" />
                  <p className="text-neutral-400">No {info.label.toLowerCase()} selected</p>
                  <button
                    onClick={() => handleSearchProviders(assetType)}
                    className="btn btn-secondary btn-sm mt-3"
                  >
                    <FontAwesomeIcon icon={faSearch} className="mr-2" aria-hidden="true" />
                    Add {info.label}
                  </button>
                </div>
              ) : (
                <div className={info.gridCols}>
                  {/* Current assets only - no skeletons */}
                  {typeImages.map((image) => (
                    <CurrentAssetCard
                      key={image.id}
                      imageFileId={image.id}
                      imageUrl={image.cache_url}
                      assetType={assetType}
                      aspectRatio={info.aspectRatio}
                      source={image.provider_name || 'Manual'}
                      onRemove={handleDeleteImage}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Fullscreen Image Viewer */}
      {fullscreenImage && (
        <div className="fixed inset-0 bg-black z-50 flex flex-col" role="dialog" aria-modal="true" aria-label="Fullscreen image viewer">
          {/* Header with back button */}
          <div className="flex items-center justify-between p-4 bg-black/90">
            <button
              onClick={() => setFullscreenImage(null)}
              className="btn btn-ghost text-white"
            >
              <FontAwesomeIcon icon={faArrowLeft} className="mr-2" aria-hidden="true" />
              Back
            </button>
            <div className="text-white text-sm">
              {fullscreenImage.width && fullscreenImage.height && fullscreenImage.width > 0 && (
                <span className="mr-4">{fullscreenImage.width}×{fullscreenImage.height}</span>
              )}
              {fullscreenImage.locked && (
                <FontAwesomeIcon icon={faLock} className="text-warning mr-2" />
              )}
            </div>
            <button
              onClick={() => setFullscreenImage(null)}
              className="btn btn-ghost text-white"
              aria-label="Close fullscreen viewer"
            >
              <FontAwesomeIcon icon={faTimes} aria-hidden="true" />
            </button>
          </div>

          {/* Image container - centered and scaled */}
          <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
            <img
              src={fullscreenImage.cache_url}
              alt={`${ASSET_TYPE_INFO[fullscreenImage.image_type]?.label || fullscreenImage.image_type} for ${movieTitle}`}
              className="max-w-full max-h-full object-contain"
            />
          </div>

          {/* Footer with filename and actions */}
          <div className="p-4 bg-black/90 border-t border-neutral-800">
            <div className="max-w-4xl mx-auto">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-white font-mono text-sm mb-1">
                    {fullscreenImage.library_path?.split(/[\\/]/).pop() ||
                     fullscreenImage.cache_path?.split(/[\\/]/).pop() ||
                     'Unknown'}
                  </div>
                  <div className="text-neutral-400 text-xs">
                    {fullscreenImage.url ? (
                      <span className="text-green-400">From Provider</span>
                    ) : (
                      <span className="text-primary-400">Custom Upload</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      await handleToggleLock(fullscreenImage.id, fullscreenImage.locked);
                      setFullscreenImage({ ...fullscreenImage, locked: !fullscreenImage.locked });
                    }}
                    className={`btn btn-sm ${fullscreenImage.locked ? 'btn-warning' : 'btn-secondary'}`}
                  >
                    <FontAwesomeIcon icon={fullscreenImage.locked ? faLock : faLockOpen} className="mr-2" aria-hidden="true" />
                    {fullscreenImage.locked ? 'Locked' : 'Unlocked'}
                  </button>
                  <button
                    onClick={async () => {
                      const confirmed = await confirm({
                        title: 'Delete Image',
                        description: 'Are you sure you want to delete this image? This action cannot be undone.',
                        confirmText: 'Delete',
                        variant: 'destructive',
                      });
                      if (confirmed) {
                        await handleDeleteImage(fullscreenImage.id);
                        setFullscreenImage(null);
                      }
                    }}
                    className="btn btn-sm btn-error"
                  >
                    <FontAwesomeIcon icon={faTrash} className="mr-2" aria-hidden="true" />
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Asset Selection Modal V2 - Multi-asset support */}
      {assetDialogOpen && selectedAssetType && (
        <AssetSelectionModalV2
          isOpen={assetDialogOpen}
          onClose={() => setAssetDialogOpen(false)}
          assetType={selectedAssetType}
          assetTypeLabel={ASSET_TYPE_INFO[selectedAssetType]?.label || selectedAssetType}
          movieTitle={movieTitle}
          movieId={movieId}
          currentAssets={images[selectedAssetType] || []}
          maxLimit={assetLimits[selectedAssetType] || 10}
          providerResults={providerResults}
          isLoadingProviders={isLoadingProviders}
          providerError={providerError}
          onApply={async (selectedAssets) => {
            /**
             * Process selected assets into format backend expects:
             * 1. Upload new files first (get their IDs)
             * 2. Build asset list with:
             *    - Existing assets: {imageFileId: X} (to keep)
             *    - New provider assets: {url: 'https://...'} (to download)
             *    - Uploaded files: {imageFileId: Y} (to keep)
             */
            const finalAssets: any[] = [];
            const uploadPromises: Promise<any>[] = [];

            // Categorize assets by type
            for (const asset of selectedAssets) {
              if ((asset as any).uploadFile) {
                // Upload file (process later)
                uploadPromises.push(uploadImageMutation.mutateAsync({
                  file: (asset as any).uploadFile,
                  type: selectedAssetType
                }));
              } else if (asset.url?.startsWith('/cache/')) {
                // Existing asset - keep it
                finalAssets.push({
                  imageFileId: parseInt((asset as any).providerResultId),
                  provider: 'existing'
                });
              } else {
                // New provider asset - download it
                finalAssets.push({
                  url: asset.url,
                  provider: (asset as any).providerId || 'unknown',
                  width: asset.width,
                  height: asset.height,
                  perceptualHash: asset.perceptualHash,
                });
              }
            }

            // Process uploads first, then add their IDs to finalAssets
            if (uploadPromises.length > 0) {
              const uploadResults = await Promise.all(uploadPromises);
              uploadResults.forEach((result: any) => {
                finalAssets.push({
                  imageFileId: result.image.id,
                  provider: 'user'
                });
              });
            }

            // Atomically replace all assets
            await replaceAssetsMutation.mutateAsync({
              assetType: selectedAssetType,
              assets: finalAssets,
            });
          }}
          onUpload={async () => {
            // Upload is handled in the modal's handleFileSelect
            // This prop is just to enable the upload button
          }}
        />
      )}

      {/* Asset Browser Modal (New) */}
      {assetBrowserOpen && selectedAssetType && (
        <AssetBrowserModal
          isOpen={assetBrowserOpen}
          onClose={() => setAssetBrowserOpen(false)}
          entityId={movieId}
          assetType={selectedAssetType}
          assetTypeLabel={ASSET_TYPE_INFO[selectedAssetType]?.label}
        />
      )}

      {/* Accessible Confirmation Dialog */}
      <ConfirmDialog />
    </div>
  );
};
