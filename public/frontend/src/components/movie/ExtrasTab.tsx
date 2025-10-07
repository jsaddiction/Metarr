import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faVideo,
  faClosedCaptioning,
  faMusic,
  faTrash,
  faPlus,
  faFile,
  faCheck,
  faExclamationTriangle,
} from '@fortawesome/free-solid-svg-icons';

interface ExtrasTabProps {
  movieId: number;
}

interface Trailer {
  id: number;
  file_path: string;
  file_size: number;
  duration?: number;
  resolution?: string;
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

export const ExtrasTab: React.FC<ExtrasTabProps> = ({ movieId }) => {
  const [trailer, setTrailer] = useState<Trailer | null>(null);
  const [subtitles, setSubtitles] = useState<Subtitle[]>([]);
  const [themeSong, setThemeSong] = useState<ThemeSong | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchExtras();
  }, [movieId]);

  const fetchExtras = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/movies/${movieId}/extras`);
      if (response.ok) {
        const data = await response.json();
        setTrailer(data.trailer || null);
        setSubtitles(data.subtitles || []);
        setThemeSong(data.themeSong || null);
      }
    } catch (error) {
      console.error('Failed to fetch extras:', error);
    } finally {
      setLoading(false);
    }
  };

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

  const deleteTrailer = async () => {
    if (!trailer) return;
    if (!confirm('Are you sure you want to delete the trailer?')) return;

    try {
      const response = await fetch(`/api/movies/${movieId}/extras/trailer`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await fetchExtras();
      }
    } catch (error) {
      console.error('Failed to delete trailer:', error);
    }
  };

  const deleteSubtitle = async (subtitleId: number) => {
    if (!confirm('Are you sure you want to delete this subtitle?')) return;

    try {
      const response = await fetch(`/api/movies/${movieId}/extras/subtitles/${subtitleId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await fetchExtras();
      }
    } catch (error) {
      console.error('Failed to delete subtitle:', error);
    }
  };

  const deleteThemeSong = async () => {
    if (!themeSong) return;
    if (!confirm('Are you sure you want to delete the theme song?')) return;

    try {
      const response = await fetch(`/api/movies/${movieId}/extras/theme`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await fetchExtras();
      }
    } catch (error) {
      console.error('Failed to delete theme song:', error);
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
    <div className="space-y-6">
      {/* Trailer Section */}
      <div className="card">
        <div className="card-body">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white flex items-center">
              <FontAwesomeIcon icon={faVideo} className="mr-2 text-primary" />
              Trailer
            </h3>
            {!trailer && (
              <button className="btn btn-primary btn-sm">
                <FontAwesomeIcon icon={faPlus} className="mr-2" />
                Add Trailer
              </button>
            )}
          </div>

          {trailer ? (
            <div className="border border-neutral-700 rounded-lg p-4 bg-neutral-800/50">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-2">
                    <FontAwesomeIcon icon={faFile} className="text-neutral-400" />
                    <span className="text-neutral-200 font-mono text-sm">
                      {trailer.file_path.split('/').pop()}
                    </span>
                  </div>
                  <div className="flex items-center space-x-4 text-sm text-neutral-400">
                    <span>{formatFileSize(trailer.file_size)}</span>
                    {trailer.duration && <span>{formatDuration(trailer.duration)}</span>}
                    {trailer.resolution && <span>{trailer.resolution}</span>}
                  </div>
                </div>
                <button
                  onClick={deleteTrailer}
                  className="btn btn-ghost btn-sm text-error hover:bg-error/20"
                >
                  <FontAwesomeIcon icon={faTrash} />
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 bg-neutral-800/30 rounded border border-dashed border-neutral-700">
              <FontAwesomeIcon icon={faVideo} className="text-4xl text-neutral-600 mb-3" />
              <p className="text-neutral-400 mb-3">No trailer detected</p>
              <p className="text-sm text-neutral-500">
                Place a video file with "-trailer" suffix in the movie directory
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Subtitles Section */}
      <div className="card">
        <div className="card-body">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white flex items-center">
              <FontAwesomeIcon icon={faClosedCaptioning} className="mr-2 text-primary" />
              Subtitles
              {subtitles.length > 0 && (
                <span className="ml-2 text-sm text-neutral-400 font-normal">
                  ({subtitles.length})
                </span>
              )}
            </h3>
          </div>

          {subtitles.length > 0 ? (
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
                          {subtitle.file_path.split('/').pop()}
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
                      onClick={() => deleteSubtitle(subtitle.id)}
                      className="btn btn-ghost btn-sm text-error hover:bg-error/20"
                    >
                      <FontAwesomeIcon icon={faTrash} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 bg-neutral-800/30 rounded border border-dashed border-neutral-700">
              <FontAwesomeIcon icon={faClosedCaptioning} className="text-4xl text-neutral-600 mb-3" />
              <p className="text-neutral-400 mb-3">No subtitles detected</p>
              <p className="text-sm text-neutral-500">
                Place .srt, .ass, or .sub files in the movie directory
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Theme Song Section */}
      <div className="card">
        <div className="card-body">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white flex items-center">
              <FontAwesomeIcon icon={faMusic} className="mr-2 text-primary" />
              Theme Song
            </h3>
            {!themeSong && (
              <button className="btn btn-primary btn-sm">
                <FontAwesomeIcon icon={faPlus} className="mr-2" />
                Add Theme
              </button>
            )}
          </div>

          {themeSong ? (
            <div className="border border-neutral-700 rounded-lg p-4 bg-neutral-800/50">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-2">
                    <FontAwesomeIcon icon={faFile} className="text-neutral-400" />
                    <span className="text-neutral-200 font-mono text-sm">
                      {themeSong.file_path.split('/').pop()}
                    </span>
                  </div>
                  <div className="flex items-center space-x-4 text-sm text-neutral-400">
                    <span>{formatFileSize(themeSong.file_size)}</span>
                    {themeSong.duration && <span>{formatDuration(themeSong.duration)}</span>}
                  </div>
                </div>
                <button
                  onClick={deleteThemeSong}
                  className="btn btn-ghost btn-sm text-error hover:bg-error/20"
                >
                  <FontAwesomeIcon icon={faTrash} />
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 bg-neutral-800/30 rounded border border-dashed border-neutral-700">
              <FontAwesomeIcon icon={faMusic} className="text-4xl text-neutral-600 mb-3" />
              <p className="text-neutral-400 mb-3">No theme song detected</p>
              <p className="text-sm text-neutral-500">
                Place an audio file named "theme.mp3" in the movie directory
              </p>
            </div>
          )}
        </div>
      </div>

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
    </div>
  );
};
