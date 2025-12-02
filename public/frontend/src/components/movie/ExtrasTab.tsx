import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faClosedCaptioning,
  faMusic,
  faTrash,
  faPlus,
  faFile,
  faExclamationTriangle,
} from '@fortawesome/free-solid-svg-icons';
import {
  useMovieExtras,
  useDeleteSubtitle,
  useDeleteThemeSong,
} from '../../hooks/useMovieAssets';
import { useConfirm } from '../../hooks/useConfirm';
import { TabSection } from '../ui/TabSection';
import { TrailerSection } from './TrailerSection';

interface ExtrasTabProps {
  movieId: number;
  movieTitle?: string;
}

interface Subtitle {
  id: number;
  language: string;
  file_path: string;
  file_size: number;
  format?: string;
  forced: boolean;
}

interface ThemeSong {
  id: number;
  file_path: string;
  file_size: number;
  duration?: number;
}

export const ExtrasTab: React.FC<ExtrasTabProps> = ({ movieId, movieTitle = 'Movie' }) => {
  // Accessible confirmation dialog
  const { confirm, ConfirmDialog } = useConfirm();

  // Use TanStack Query hooks
  const { data: extras, isLoading: loading } = useMovieExtras(movieId);
  const deleteSubtitleMutation = useDeleteSubtitle(movieId);
  const deleteThemeMutation = useDeleteThemeSong(movieId);

  // Extract data from query result
  const subtitles = extras?.subtitles || [];
  const themeSong = extras?.themeSong || null;

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const formatDuration = (seconds?: number): string => {
    if (!seconds) return 'Unknown';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleDeleteSubtitle = async (subtitleId: number) => {
    const confirmed = await confirm({
      title: 'Delete Subtitle',
      description: 'Are you sure you want to delete this subtitle? This action cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'destructive',
    });

    if (!confirmed) return;

    try {
      await deleteSubtitleMutation.mutateAsync(subtitleId);
    } catch (error) {
      console.error('Failed to delete subtitle:', error);
      alert('Failed to delete subtitle');
    }
  };

  const handleDeleteThemeSong = async () => {
    if (!themeSong) return;

    const confirmed = await confirm({
      title: 'Delete Theme Song',
      description: 'Are you sure you want to delete the theme song? This action cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'destructive',
    });

    if (!confirmed) return;

    try {
      await deleteThemeMutation.mutateAsync();
    } catch (error) {
      console.error('Failed to delete theme song:', error);
      alert('Failed to delete theme song');
    }
  };

  if (loading) {
    return (
      <div className="card">
        <div className="card-body text-center py-12">
          <div className="text-neutral-400">Loading extras...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Trailer Section - New trailer management component */}
      <TrailerSection movieId={movieId} movieTitle={movieTitle} />

      {/* Subtitles Section */}
      <TabSection
        title="Subtitles"
        count={subtitles.length}
        isEmpty={subtitles.length === 0}
        emptyIcon={faClosedCaptioning}
        emptyMessage="No subtitles detected"
      >
        <div className="space-y-2">
          {subtitles.map((subtitle) => (
            <div
              key={subtitle.id}
              className="border border-neutral-700 rounded-lg p-4 bg-neutral-800/50"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-2">
                    <FontAwesomeIcon icon={faFile} className="text-neutral-400" />
                    <span className="text-neutral-200 font-mono text-sm">
                      {subtitle.file_path ? subtitle.file_path.split('/').pop() : 'Unknown filename'}
                    </span>
                    {subtitle.forced && (
                      <span className="badge badge-warning badge-sm">Forced</span>
                    )}
                  </div>
                  <div className="flex items-center space-x-4 text-sm text-neutral-400">
                    <span className="uppercase font-semibold">{subtitle.language}</span>
                    <span>{formatFileSize(subtitle.file_size)}</span>
                    {subtitle.format && <span className="uppercase">{subtitle.format}</span>}
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteSubtitle(subtitle.id)}
                  className="btn btn-ghost btn-sm text-error hover:bg-error/20"
                >
                  <FontAwesomeIcon icon={faTrash} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </TabSection>

      {/* Theme Song Section */}
      <TabSection
        title="Theme Song"
        isEmpty={!themeSong}
        emptyIcon={faMusic}
        emptyMessage="No theme song detected"
        onAction={!themeSong ? () => {} : undefined}
        actionLabel="Add Theme"
        actionIcon={faPlus}
      >
        {themeSong && (
          <div className="border border-neutral-700 rounded-lg p-4 bg-neutral-800/50">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-2 mb-2">
                  <FontAwesomeIcon icon={faFile} className="text-neutral-400" />
                  <span className="text-neutral-200 font-mono text-sm">
                    {themeSong.file_path ? themeSong.file_path.split('/').pop() : 'Unknown filename'}
                  </span>
                </div>
                <div className="flex items-center space-x-4 text-sm text-neutral-400">
                  <span>{formatFileSize(themeSong.file_size)}</span>
                  {themeSong.duration && <span>{formatDuration(themeSong.duration)}</span>}
                </div>
              </div>
              <button
                onClick={handleDeleteThemeSong}
                className="btn btn-ghost btn-sm text-error hover:bg-error/20"
              >
                <FontAwesomeIcon icon={faTrash} />
              </button>
            </div>
          </div>
        )}
      </TabSection>

      {/* Info card */}
      <div className="card bg-info/10 border-info/30">
        <div className="card-body py-3">
          <div className="flex items-start space-x-3">
            <FontAwesomeIcon icon={faExclamationTriangle} className="text-info mt-0.5" />
            <div className="text-sm text-neutral-300">
              <p className="font-semibold mb-1">Extras Detection</p>
              <p className="text-neutral-400">
                Extras are detected during library scans. Files must follow Kodi naming conventions.
                Trailers should end with "-trailer", and theme songs should be named "theme.mp3" or
                similar.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Accessible Confirmation Dialog */}
      <ConfirmDialog />
    </div>
  );
};
