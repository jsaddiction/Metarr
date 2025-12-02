/**
 * TrailerSection Component
 *
 * Displays trailer management within the ExtrasTab.
 * Features:
 * - Clickable thumbnail that opens video player
 * - Lock indicator (from movie entity, not candidate)
 * - Add/Select/Delete actions
 * - Shows trailer metadata (duration, resolution, source)
 */

import React, { useState, useMemo } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faVideo,
  faPlay,
  faPlus,
  faTrash,
  faExchange,
  faSpinner,
  faExclamationTriangle,
} from '@fortawesome/free-solid-svg-icons';
import { TabSection } from '../ui/TabSection';
import { TrailerPlayer } from './TrailerPlayer';
import { TrailerSelectionModal } from './TrailerSelectionModal';
import {
  useTrailer,
  useDeleteTrailerSelection,
  useToggleTrailerLock,
  getTrailerStreamUrl,
} from '../../hooks/useTrailer';
import { useConfirm } from '../../hooks/useConfirm';

interface TrailerSectionProps {
  movieId: number;
  movieTitle: string;
}

export const TrailerSection: React.FC<TrailerSectionProps> = ({ movieId, movieTitle }) => {
  const { confirm, ConfirmDialog } = useConfirm();

  // State
  const [showPlayer, setShowPlayer] = useState(false);
  const [showSelectionModal, setShowSelectionModal] = useState(false);

  // Queries and mutations
  const { data: trailerData, isLoading, error } = useTrailer(movieId);
  const deleteMutation = useDeleteTrailerSelection(movieId);
  const toggleLockMutation = useToggleTrailerLock(movieId);

  // The selected trailer from API (has is_locked from movie entity)
  const currentTrailer = trailerData?.selected;

  // Find the full candidate data for the selected trailer (for thumbnail, tmdb info, etc.)
  const selectedCandidate = useMemo(() => {
    if (!currentTrailer || !trailerData?.candidates) return null;
    return trailerData.candidates.find(c => c.id === currentTrailer.id) || null;
  }, [currentTrailer, trailerData?.candidates]);

  // Merge data: use candidate data but override is_locked from currentTrailer
  const selectedTrailer = useMemo(() => {
    if (!currentTrailer) return null;
    return {
      ...selectedCandidate,
      ...currentTrailer,
      // Ensure candidate fields are available
      thumbnail_url: selectedCandidate?.thumbnail_url || null,
      tmdb_name: selectedCandidate?.tmdb_name || null,
      tmdb_official: selectedCandidate?.tmdb_official || false,
      best_width: selectedCandidate?.best_width || null,
      best_height: selectedCandidate?.best_height || null,
      failed_at: selectedCandidate?.failed_at || null,
      failure_reason: selectedCandidate?.failure_reason || null,
    };
  }, [currentTrailer, selectedCandidate]);

  const candidateCount = trailerData?.candidates?.length || 0;
  const trailersEnabled = trailerData?.trailersEnabled !== false;

  // Format duration as MM:SS
  const formatDuration = (seconds: number | null): string => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Format resolution
  const formatResolution = (width: number | null, height: number | null): string => {
    if (!width || !height) return '';
    if (height >= 2160) return '4K';
    if (height >= 1080) return '1080p';
    if (height >= 720) return '720p';
    if (height >= 480) return '480p';
    return `${width}x${height}`;
  };

  // Get source label
  const getSourceLabel = (trailer: { source_type?: string; provider_name?: string | null }): string => {
    if (trailer.source_type === 'upload') return 'Uploaded';
    if (trailer.source_type === 'user') return 'Added URL';
    if (trailer.provider_name) return trailer.provider_name;
    return 'Provider';
  };

  // Handle delete
  const handleDelete = async () => {
    const confirmed = await confirm({
      title: 'Remove Trailer',
      description: 'Remove the selected trailer? The candidate will still be available for re-selection.',
      confirmText: 'Remove',
      cancelText: 'Cancel',
      variant: 'destructive',
    });

    if (!confirmed) return;

    try {
      await deleteMutation.mutateAsync();
    } catch (error) {
      console.error('Failed to delete trailer:', error);
    }
  };

  // Handle toggle lock
  const handleToggleLock = async () => {
    if (!selectedTrailer) return;

    const isCurrentlyLocked = selectedTrailer.is_locked;

    if (isCurrentlyLocked) {
      // Unlocking - confirm
      const confirmed = await confirm({
        title: 'Unlock Trailer',
        description: 'Unlocking allows automatic trailer selection during enrichment. Continue?',
        confirmText: 'Unlock',
        cancelText: 'Cancel',
        variant: 'default',
      });

      if (!confirmed) return;
    }

    try {
      await toggleLockMutation.mutateAsync({ isCurrentlyLocked });
    } catch (error) {
      console.error('Failed to toggle lock:', error);
    }
  };

  // Handle play
  const handlePlay = () => {
    if (selectedTrailer?.cache_video_file_id) {
      setShowPlayer(true);
    }
  };

  if (isLoading) {
    return (
      <TabSection
        title="Trailer"
        isEmpty={true}
        emptyIcon={faVideo}
        emptyMessage="Loading..."
      >
        <div className="flex items-center justify-center py-8">
          <FontAwesomeIcon icon={faSpinner} spin className="text-2xl text-neutral-500" />
        </div>
      </TabSection>
    );
  }

  if (!trailersEnabled) {
    return (
      <TabSection
        title="Trailer"
        isEmpty={true}
        emptyIcon={faVideo}
        emptyMessage="Trailers are disabled in settings"
      />
    );
  }

  // Show error state but still allow action (to retry/add trailer)
  if (error) {
    return (
      <>
        <TabSection
          title="Trailer"
          isEmpty={true}
          emptyIcon={faExclamationTriangle}
          emptyMessage="Failed to load trailer data"
          onAction={() => setShowSelectionModal(true)}
          actionLabel="Add Trailer"
          actionIcon={faPlus}
        >
          <div className="text-error text-sm">
            {error instanceof Error ? error.message : 'Unknown error'}
          </div>
        </TabSection>

        {/* Selection Modal - still accessible on error */}
        <TrailerSelectionModal
          isOpen={showSelectionModal}
          onClose={() => setShowSelectionModal(false)}
          movieId={movieId}
          movieTitle={movieTitle}
          currentTrailerId={undefined}
        />
      </>
    );
  }

  return (
    <>
      <TabSection
        title="Trailer"
        count={candidateCount > 0 ? candidateCount : undefined}
        isEmpty={!selectedTrailer}
        emptyIcon={faVideo}
        emptyMessage="No trailer selected"
        onAction={() => setShowSelectionModal(true)}
        actionLabel={selectedTrailer ? 'Change' : 'Add Trailer'}
        actionIcon={selectedTrailer ? faExchange : faPlus}
        locked={selectedTrailer?.is_locked ?? false}
        onToggleLock={selectedTrailer ? handleToggleLock : undefined}
      >
        {selectedTrailer && (
          <div className="border border-neutral-700 rounded-lg overflow-hidden bg-neutral-800/50">
            <div className="flex">
              {/* Thumbnail (clickable to play) */}
              <div
                className="relative w-64 h-36 flex-shrink-0 cursor-pointer group"
                onClick={handlePlay}
              >
                {selectedTrailer.thumbnail_url ? (
                  <img
                    src={selectedTrailer.thumbnail_url}
                    alt={selectedTrailer.title || 'Trailer thumbnail'}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-neutral-700 flex items-center justify-center">
                    <FontAwesomeIcon icon={faVideo} className="text-neutral-500 text-3xl" />
                  </div>
                )}

                {/* Play overlay */}
                {selectedTrailer.cache_video_file_id && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="w-14 h-14 flex items-center justify-center rounded-full bg-white/20">
                      <FontAwesomeIcon icon={faPlay} className="text-white text-xl ml-1" />
                    </div>
                  </div>
                )}

                {/* Duration badge */}
                {selectedTrailer.duration_seconds && (
                  <div className="absolute bottom-2 right-2 bg-black/80 px-2 py-0.5 rounded text-xs text-white">
                    {formatDuration(selectedTrailer.duration_seconds)}
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 p-4 flex flex-col">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-medium text-neutral-200 mb-1">
                      {selectedTrailer.title || selectedTrailer.tmdb_name || 'Trailer'}
                    </h4>
                    <div className="flex items-center gap-3 text-sm text-neutral-400">
                      <span>{getSourceLabel(selectedTrailer)}</span>
                      {selectedTrailer.best_height && (
                        <span>{formatResolution(selectedTrailer.best_width, selectedTrailer.best_height)}</span>
                      )}
                      {selectedTrailer.tmdb_official && (
                        <span className="text-success">Official</span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={handleDelete}
                      disabled={deleteMutation.isPending}
                      className="btn btn-ghost btn-sm text-error hover:bg-error/20"
                      title="Remove trailer"
                    >
                      {deleteMutation.isPending ? (
                        <FontAwesomeIcon icon={faSpinner} spin />
                      ) : (
                        <FontAwesomeIcon icon={faTrash} />
                      )}
                    </button>
                  </div>
                </div>

                {/* Status messages */}
                {!selectedTrailer.cache_video_file_id && !selectedTrailer.failed_at && (
                  <div className="mt-auto text-sm text-neutral-500">
                    <FontAwesomeIcon icon={faSpinner} spin className="mr-2" />
                    Downloading...
                  </div>
                )}

                {selectedTrailer.failed_at && (
                  <div className="mt-auto text-sm text-error">
                    <FontAwesomeIcon icon={faExclamationTriangle} className="mr-2" />
                    {selectedTrailer.failure_reason || 'Download failed'}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </TabSection>

      {/* Video Player Modal */}
      <TrailerPlayer
        isOpen={showPlayer}
        onClose={() => setShowPlayer(false)}
        streamUrl={getTrailerStreamUrl(movieId)}
        title={selectedTrailer?.title || selectedTrailer?.tmdb_name || 'Trailer'}
      />

      {/* Selection Modal */}
      <TrailerSelectionModal
        isOpen={showSelectionModal}
        onClose={() => setShowSelectionModal(false)}
        movieId={movieId}
        movieTitle={movieTitle}
        currentTrailerId={selectedTrailer?.id}
      />

      {/* Confirmation Dialog */}
      <ConfirmDialog />
    </>
  );
};
