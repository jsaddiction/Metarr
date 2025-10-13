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
import { useQuery } from '@tanstack/react-query';
import {
  useMovieImages,
  useUploadImage,
  useToggleImageLock,
  useDeleteImage,
  useRecoverImages,
} from '../../hooks/useMovieAssets';
import { AssetSelectionDialog } from '../asset/AssetSelectionDialog';
import { AssetCard } from '../asset/AssetCard';
import { assetApi } from '../../utils/api';
import type { AssetType } from '../../types/providers/capabilities';
import type { AssetCandidate } from '../../types/asset';

interface ImagesTabProps {
  movieId: number;
}

interface Image {
  id: number;
  entity_type: string;
  entity_id: number;
  image_type: string;
  url: string | null;
  cache_path: string | null;
  library_path: string | null;
  file_path: string | null;
  width: number | null;
  height: number | null;
  vote_average: number | null;
  locked: boolean;
  cache_url: string;
}

interface ImagesByType {
  [key: string]: Image[];
}

const IMAGE_TYPES = [
  { key: 'poster', label: 'Posters', max: 20, aspectRatio: 'aspect-[2/3]' }, // 2:3 portrait (1000x1500)
  { key: 'fanart', label: 'Fanart', max: 20, aspectRatio: 'aspect-[16/9]' }, // 16:9 widescreen (1920x1080)
  { key: 'banner', label: 'Banners', max: 1, aspectRatio: 'aspect-[1000/185]' }, // Wide banner (1000x185)
  { key: 'clearlogo', label: 'Clear Logos', max: 1, aspectRatio: 'aspect-[800/310]' }, // Logo (800x310)
  { key: 'clearart', label: 'Clear Art', max: 1, aspectRatio: 'aspect-[1000/562]' }, // 16:9-ish (1000x562)
  { key: 'landscape', label: 'Landscapes', max: 1, aspectRatio: 'aspect-[16/9]' }, // 16:9 widescreen (1920x1080)
  { key: 'keyart', label: 'Key Art', max: 1, aspectRatio: 'aspect-[2/3]' }, // 2:3 portrait (1000x1500)
  { key: 'discart', label: 'Disc Art', max: 1, aspectRatio: 'aspect-square' }, // 1:1 square (1000x1000)
];

export const ImagesTab: React.FC<ImagesTabProps> = ({ movieId }) => {
  // Use TanStack Query hooks
  const { data: images = {}, isLoading: loading } = useMovieImages(movieId);
  const uploadImageMutation = useUploadImage(movieId);
  const toggleLockMutation = useToggleImageLock(movieId);
  const deleteImageMutation = useDeleteImage(movieId);
  const recoverImagesMutation = useRecoverImages(movieId);

  const [uploadType, setUploadType] = useState<string | null>(null);
  const [fullscreenImage, setFullscreenImage] = useState<Image | null>(null);
  const [assetDialogOpen, setAssetDialogOpen] = useState(false);
  const [selectedAssetType, setSelectedAssetType] = useState<AssetType | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Convert Image to AssetCandidate for use with AssetCard
  const imageToAssetCandidate = (image: Image, assetType: string): AssetCandidate => ({
    providerId: image.url ? 'tmdb' : ('custom' as any), // If from provider, assume tmdb, otherwise custom
    providerResultId: image.id.toString(),
    assetType: assetType as AssetType,
    url: image.cache_url,
    thumbnailUrl: image.cache_url,
    width: image.width || undefined,
    height: image.height || undefined,
    voteAverage: image.vote_average || undefined,
    votes: undefined, // Explicitly set to undefined to prevent rendering issues
  });

  // Fetch provider results when dialog is open
  const {
    data: providerResults,
    isLoading: isLoadingProviders,
    error: providerError,
  } = useQuery({
    queryKey: ['provider-results', 'movie', movieId, selectedAssetType],
    queryFn: () => assetApi.getEntityProviderResults('movie', movieId, selectedAssetType ? [selectedAssetType] : []),
    enabled: assetDialogOpen && selectedAssetType !== null,
    staleTime: 1000 * 60 * 60, // 1 hour cache
  });

  const handleUploadClick = (imageType: string) => {
    setUploadType(imageType);
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0] || !uploadType) return;

    const file = e.target.files[0];

    try {
      await uploadImageMutation.mutateAsync({ file, type: uploadType });
      // Success - TanStack Query will automatically refetch
    } catch (error) {
      console.error('Failed to upload image:', error);
      alert('Failed to upload image');
    } finally {
      setUploadType(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

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
    if (!confirm('Are you sure you want to delete this image?')) return;

    try {
      await deleteImageMutation.mutateAsync(imageId);
      // Success - TanStack Query will automatically refetch
    } catch (error) {
      console.error('Failed to delete image:', error);
      alert('Failed to delete image');
    }
  };

  const handleRecoverImages = async () => {
    try {
      const result = await recoverImagesMutation.mutateAsync();
      alert(result.message || `Successfully recovered ${result.recoveredCount} image(s)`);
      // Success - TanStack Query will automatically refetch
    } catch (error) {
      console.error('Failed to recover images:', error);
      alert('Failed to recover images');
    }
  };

  const handleSearchProviders = (assetType: string) => {
    setSelectedAssetType(assetType as AssetType);
    setAssetDialogOpen(true);
  };

  const handleAssetSelect = async (asset: AssetCandidate, provider: string) => {
    // TODO: Call backend to save the selected asset
    console.log('Selected asset from provider:', provider, asset);
    setAssetDialogOpen(false);

    // For now, just show a message
    alert(`Asset selection from ${provider} - Backend integration coming soon!`);

    // After backend integration, TanStack Query will automatically refetch
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
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png"
        onChange={handleFileSelect}
        className="hidden"
        aria-label="Upload image file"
      />

      {/* Recovery button */}
      <div className="card bg-neutral-800/50">
        <div className="card-body py-3 flex flex-row items-center justify-between">
          <div className="text-sm text-neutral-300">
            Missing images from library? Recover them from cache.
          </div>
          <button onClick={handleRecoverImages} className="btn btn-secondary btn-sm">
            Recover Images
          </button>
        </div>
      </div>

      {/* Image type sections */}
      {IMAGE_TYPES.map((type) => {
        const typeImages = images[type.key] || [];
        const canUpload = typeImages.length < type.max;

        return (
          <div key={type.key} className="card">
            <div className="card-body">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">
                  {type.label}{' '}
                  <span className="text-sm text-neutral-400 font-normal">
                    ({typeImages.length}/{type.max})
                  </span>
                </h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleSearchProviders(type.key)}
                    className="btn btn-secondary btn-sm"
                  >
                    <FontAwesomeIcon icon={faSearch} className="mr-2" aria-hidden="true" />
                    Search Providers
                  </button>
                  {canUpload && (
                    <button
                      onClick={() => handleUploadClick(type.key)}
                      className="btn btn-primary btn-sm"
                      disabled={uploadImageMutation.isPending}
                    >
                      <FontAwesomeIcon icon={faUpload} className="mr-2" aria-hidden="true" />
                      Upload
                    </button>
                  )}
                  {typeImages.length > 0 && (
                    <>
                      <button
                        onClick={() => {
                          // Toggle lock for all images of this type
                          const anyLocked = typeImages.some(img => img.locked);
                          typeImages.forEach(img => {
                            handleToggleLock(img.id, anyLocked);
                          });
                        }}
                        className={`btn btn-sm ${typeImages.some(img => img.locked) ? 'btn-warning' : 'btn-ghost'}`}
                        title={typeImages.some(img => img.locked) ? 'Unlock all' : 'Lock all'}
                        aria-label={typeImages.some(img => img.locked) ? 'Unlock all images' : 'Lock all images'}
                      >
                        <FontAwesomeIcon icon={typeImages.some(img => img.locked) ? faLock : faLockOpen} aria-hidden="true" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Delete all ${type.label.toLowerCase()}?`)) {
                            typeImages.forEach(img => handleDeleteImage(img.id));
                          }
                        }}
                        className="btn btn-sm btn-ghost text-error hover:bg-error/20"
                        title="Delete all"
                        aria-label="Delete all images"
                      >
                        <FontAwesomeIcon icon={faTrash} aria-hidden="true" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {typeImages.length === 0 ? (
                <div className="text-center py-8 bg-neutral-800/30 rounded border border-dashed border-neutral-700">
                  <FontAwesomeIcon icon={faImage} className="text-4xl text-neutral-600 mb-3" />
                  <p className="text-neutral-400">No {type.label.toLowerCase()} available</p>
                  <div className="flex gap-2 justify-center mt-3">
                    <button
                      onClick={() => handleSearchProviders(type.key)}
                      className="btn btn-secondary btn-sm"
                    >
                      <FontAwesomeIcon icon={faSearch} className="mr-2" aria-hidden="true" />
                      Search Providers
                    </button>
                    <button
                      onClick={() => handleUploadClick(type.key)}
                      className="btn btn-primary btn-sm"
                      disabled={uploadImageMutation.isPending}
                    >
                      <FontAwesomeIcon icon={faUpload} className="mr-2" aria-hidden="true" />
                      Upload {type.label}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {typeImages.map((image) => {
                    const assetCandidate = imageToAssetCandidate(image, type.key);
                    const providerName = image.url ? 'Provider' : 'Custom';

                    return (
                      <div key={image.id} className="relative">
                        {/* AssetCard in display mode */}
                        <AssetCard
                          asset={assetCandidate}
                          provider={providerName}
                          onClick={() => setFullscreenImage(image)}
                          mode="display"
                        />

                        {/* Lock indicator badge - Top Right (if any images are locked) */}
                        {image.locked && (
                          <div className="absolute top-2 right-2 bg-warning/90 text-white text-[9px] font-semibold px-1.5 py-0.5 rounded flex items-center gap-1 pointer-events-none">
                            <FontAwesomeIcon icon={faLock} className="text-[9px]" />
                            <span>LOCKED</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Upload indicator */}
      {uploadImageMutation.isPending && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-neutral-800 rounded-lg p-6 border border-neutral-700">
            <FontAwesomeIcon icon={faSpinner} spin className="text-3xl text-primary mb-3" />
            <div className="text-white">Uploading image...</div>
          </div>
        </div>
      )}

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
              alt="Fullscreen view"
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
                      if (confirm('Delete this image?')) {
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

      {/* Asset Selection Dialog */}
      {assetDialogOpen && selectedAssetType && (
        <AssetSelectionDialog
          isOpen={assetDialogOpen}
          onClose={() => setAssetDialogOpen(false)}
          onSelect={handleAssetSelect}
          assetType={selectedAssetType}
          currentAsset={images[selectedAssetType]?.[0]}
          providerResults={providerResults}
          isLoading={isLoadingProviders}
          error={providerError as Error | null}
        />
      )}
    </div>
  );
};
