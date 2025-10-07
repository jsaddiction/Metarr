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
} from '@fortawesome/free-solid-svg-icons';
import {
  useMovieImages,
  useUploadImage,
  useToggleImageLock,
  useDeleteImage,
  useRecoverImages,
} from '../../hooks/useMovieAssets';

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
  const fileInputRef = useRef<HTMLInputElement>(null);

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
                {canUpload && (
                  <button
                    onClick={() => handleUploadClick(type.key)}
                    className="btn btn-primary btn-sm"
                    disabled={uploadImageMutation.isPending}
                  >
                    <FontAwesomeIcon icon={faUpload} className="mr-2" />
                    Upload
                  </button>
                )}
              </div>

              {typeImages.length === 0 ? (
                <div className="text-center py-8 bg-neutral-800/30 rounded border border-dashed border-neutral-700">
                  <FontAwesomeIcon icon={faImage} className="text-4xl text-neutral-600 mb-3" />
                  <p className="text-neutral-400">No {type.label.toLowerCase()} available</p>
                  <button
                    onClick={() => handleUploadClick(type.key)}
                    className="btn btn-secondary btn-sm mt-3"
                    disabled={uploadImageMutation.isPending}
                  >
                    <FontAwesomeIcon icon={faUpload} className="mr-2" />
                    Upload {type.label}
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {typeImages.map((image) => {
                    const filename = image.library_path?.split(/[\\/]/).pop() || image.cache_path?.split(/[\\/]/).pop() || 'Unknown';

                    return (
                      <div
                        key={image.id}
                        className="relative group border border-neutral-700 rounded-lg overflow-hidden bg-neutral-800"
                      >
                        {/* Image - Clickable */}
                        <div
                          className={`${type.aspectRatio} bg-neutral-900 cursor-pointer relative`}
                          onClick={() => setFullscreenImage(image)}
                        >
                          <img
                            src={image.cache_url}
                            alt={type.label}
                            className="w-full h-full object-contain"
                            loading="lazy"
                          />

                          {/* Dimensions overlay on image */}
                          {image.width && image.height && image.width > 0 && image.height > 0 && (
                            <div className="absolute top-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                              {image.width}×{image.height}
                            </div>
                          )}

                          {/* Lock indicator */}
                          {image.locked && (
                            <div className="absolute top-2 right-2 bg-warning text-neutral-900 rounded-full p-1.5">
                              <FontAwesomeIcon icon={faLock} className="text-xs" />
                            </div>
                          )}

                          {/* Hover overlay with actions */}
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center space-x-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleLock(image.id, image.locked);
                              }}
                              className={`btn btn-sm ${image.locked ? 'btn-warning' : 'btn-ghost'}`}
                              title={image.locked ? 'Locked' : 'Unlocked'}
                            >
                              <FontAwesomeIcon icon={image.locked ? faLock : faLockOpen} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteImage(image.id);
                              }}
                              className="btn btn-sm btn-ghost text-error hover:bg-error/20"
                              title="Delete"
                            >
                              <FontAwesomeIcon icon={faTrash} />
                            </button>
                          </div>
                        </div>

                        {/* Filename below image */}
                        <div className="p-2 bg-neutral-800/50">
                          <div className="text-xs text-neutral-300 truncate font-mono" title={filename}>
                            {filename}
                          </div>
                          {image.url && (
                            <div className="text-xs text-green-400 mt-1">Provider</div>
                          )}
                        </div>
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
        <div className="fixed inset-0 bg-black z-50 flex flex-col">
          {/* Header with back button */}
          <div className="flex items-center justify-between p-4 bg-black/90">
            <button
              onClick={() => setFullscreenImage(null)}
              className="btn btn-ghost text-white"
            >
              <FontAwesomeIcon icon={faArrowLeft} className="mr-2" />
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
            >
              <FontAwesomeIcon icon={faTimes} />
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
                    <FontAwesomeIcon icon={fullscreenImage.locked ? faLock : faLockOpen} className="mr-2" />
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
                    <FontAwesomeIcon icon={faTrash} className="mr-2" />
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
