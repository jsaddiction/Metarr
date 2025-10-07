import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowLeft,
  faSave,
  faFile,
  faImage,
  faVideo,
  faArchive,
  faFileAlt,
  faQuestion,
  faEyeSlash,
  faCheck,
  faTrash,
  faTags,
  faTimes,
  faTag,
  faExclamationTriangle,
} from '@fortawesome/free-solid-svg-icons';
import { MetadataTab } from '../../components/movie/MetadataTab';
import { ImagesTab } from '../../components/movie/ImagesTab';
import { ExtrasTab } from '../../components/movie/ExtrasTab';
import { useMovie } from '../../hooks/useMovies';
import {
  useUnknownFiles,
  useAssignUnknownFile,
  useIgnoreUnknownFile,
  useIgnoreUnknownFilePattern,
  useDeleteUnknownFile,
} from '../../hooks/useMovieAssets';

type TabType = 'metadata' | 'images' | 'extras' | 'unknown-files';

interface AssignModalData {
  fileId: number;
  fileName: string;
}

export const MovieEdit: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const movieId = id ? parseInt(id) : null;

  // Fetch movie data with TanStack Query
  const { data: movie, isLoading: movieLoading, error: movieError } = useMovie(movieId);

  // Fetch unknown files with TanStack Query
  const { data: unknownFiles = [], isLoading: loadingUnknownFiles } = useUnknownFiles(movieId);

  // Mutations for unknown files
  const assignFileMutation = useAssignUnknownFile(movieId!);
  const ignoreFileMutation = useIgnoreUnknownFile(movieId!);
  const ignorePatternMutation = useIgnoreUnknownFilePattern(movieId!);
  const deleteFileMutation = useDeleteUnknownFile(movieId!);

  const [activeTab, setActiveTab] = useState<TabType>('metadata');
  const [assignModal, setAssignModal] = useState<AssignModalData | null>(null);
  const [selectedFileType, setSelectedFileType] = useState<string>('');
  const [processingAction, setProcessingAction] = useState(false);

  const handleIgnorePattern = async (fileId: number) => {
    try {
      await ignorePatternMutation.mutateAsync(fileId);
    } catch (error) {
      console.error('Failed to ignore pattern:', error);
      alert('Failed to ignore pattern');
    }
  };

  const handleDelete = async (fileId: number, fileName: string) => {
    if (!confirm(`Are you sure you want to delete "${fileName}"? This will remove the file from your filesystem.`)) {
      return;
    }

    try {
      await deleteFileMutation.mutateAsync(fileId);
    } catch (error) {
      console.error('Failed to delete file:', error);
      alert('Failed to delete file');
    }
  };

  const handleAssign = (fileId: number, fileName: string) => {
    setAssignModal({ fileId, fileName });
  };

  // Helper: Get file extension
  const getFileExtension = (fileName: string): string => {
    return fileName.split('.').pop()?.toLowerCase() || '';
  };

  // Helper: Get valid file type options based on file extension
  const getValidFileTypes = (fileName: string): { category: string; types: Array<{ value: string; label: string }> } => {
    const ext = getFileExtension(fileName);

    const imageExts = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tiff'];
    const videoExts = ['mp4', 'mkv', 'avi', 'mov', 'webm', 'm4v', 'mpg', 'mpeg', 'wmv', 'flv'];
    const subtitleExts = ['srt', 'sub', 'ass', 'ssa', 'vtt', 'idx'];
    const audioExts = ['mp3', 'flac', 'wav', 'aac', 'm4a', 'ogg'];

    if (imageExts.includes(ext)) {
      return {
        category: 'image',
        types: [
          { value: 'poster', label: 'Poster' },
          { value: 'fanart', label: 'Fanart' },
          { value: 'landscape', label: 'Landscape' },
          { value: 'keyart', label: 'Keyart' },
          { value: 'banner', label: 'Banner' },
          { value: 'clearart', label: 'Clear Art' },
          { value: 'clearlogo', label: 'Clear Logo' },
          { value: 'discart', label: 'Disc Art' },
        ],
      };
    }
    if (videoExts.includes(ext)) {
      return {
        category: 'video',
        types: [{ value: 'trailer', label: 'Trailer' }],
      };
    }
    if (subtitleExts.includes(ext)) {
      return {
        category: 'subtitle',
        types: [{ value: 'subtitle', label: 'Subtitle' }],
      };
    }
    if (audioExts.includes(ext)) {
      return {
        category: 'audio',
        types: [{ value: 'theme', label: 'Theme Song' }],
      };
    }

    // Unknown file type - allow all options
    return {
      category: 'unknown',
      types: [
        { value: 'poster', label: 'Poster' },
        { value: 'fanart', label: 'Fanart' },
        { value: 'landscape', label: 'Landscape' },
        { value: 'keyart', label: 'Keyart' },
        { value: 'banner', label: 'Banner' },
        { value: 'clearart', label: 'Clear Art' },
        { value: 'clearlogo', label: 'Clear Logo' },
        { value: 'discart', label: 'Disc Art' },
        { value: 'trailer', label: 'Trailer' },
        { value: 'subtitle', label: 'Subtitle' },
        { value: 'theme', label: 'Theme Song' },
        { value: 'extra', label: 'Extra Content' },
      ],
    };
  };

  const handleAssignSubmit = async () => {
    if (!assignModal || !selectedFileType) return;

    setProcessingAction(true);
    try {
      await assignFileMutation.mutateAsync({
        fileId: assignModal.fileId,
        fileType: selectedFileType
      });

      // Success! Close modal and clear selection
      // TanStack Query will automatically refresh unknown files list
      // Backend broadcasts moviesChanged, which will invalidate movieImages/movieExtras
      setAssignModal(null);
      setSelectedFileType('');
    } catch (error: any) {
      console.error('Failed to assign file:', error);
      alert(`Failed to assign file: ${error.message || 'Unknown error'}`);
    } finally {
      setProcessingAction(false);
    }
  };

  const handleIgnoreFile = async () => {
    if (!assignModal) return;

    setProcessingAction(true);
    try {
      await ignoreFileMutation.mutateAsync(assignModal.fileId);
      setAssignModal(null);
    } catch (error) {
      console.error('Failed to ignore file:', error);
      alert('Failed to ignore file. Please try again.');
    } finally {
      setProcessingAction(false);
    }
  };

  const handleDeleteFile = async () => {
    if (!assignModal) return;

    if (!confirm(`Are you sure you want to permanently delete "${assignModal.fileName}"? This cannot be undone.`)) {
      return;
    }

    setProcessingAction(true);
    try {
      await deleteFileMutation.mutateAsync(assignModal.fileId);
      setAssignModal(null);
    } catch (error) {
      console.error('Failed to delete file:', error);
      alert('Failed to delete file. Please try again.');
    } finally {
      setProcessingAction(false);
    }
  };

  const handleBack = () => {
    navigate('/metadata/movies');
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'video': return faVideo;
      case 'image': return faImage;
      case 'archive': return faArchive;
      case 'text': return faFileAlt;
      default: return faQuestion;
    }
  };

  const getRelativePath = (filePath: string, libraryPath: string): string => {
    // Remove any trailing nulls, control characters, or invisible characters
    const cleanPath = filePath.trim().replace(/[\x00-\x1F\x7F-\x9F]/g, '');
    const cleanLibraryPath = libraryPath.trim().replace(/[\x00-\x1F\x7F-\x9F]/g, '');

    // Remove the library path from the file path to get relative path
    // Handle both forward and backward slashes
    let relativePath = cleanPath.replace(cleanLibraryPath, '');

    // Remove leading slash if present
    relativePath = relativePath.replace(/^[/\\]/, '');

    return relativePath;
  };

  // Show loading state
  if (movieLoading) {
    return (
      <div className="content-spacing">
        <div className="flex items-center mb-6">
          <button onClick={handleBack} className="btn btn-ghost" title="Back to Movies">
            <FontAwesomeIcon icon={faArrowLeft} />
          </button>
          <h1 className="text-2xl font-bold text-white ml-4">Loading...</h1>
        </div>
        <div className="text-center py-8 text-neutral-400">
          Loading movie data...
        </div>
      </div>
    );
  }

  // Show error state
  if (movieError || !movie) {
    return (
      <div className="content-spacing">
        <div className="flex items-center mb-6">
          <button onClick={handleBack} className="btn btn-ghost" title="Back to Movies">
            <FontAwesomeIcon icon={faArrowLeft} />
          </button>
          <h1 className="text-2xl font-bold text-white ml-4">Error</h1>
        </div>
        <div className="text-center py-8">
          <p className="text-error mb-2">Failed to load movie</p>
          <p className="text-sm text-neutral-400">{movieError?.message || 'Movie not found'}</p>
          <button onClick={handleBack} className="btn btn-primary mt-4">
            Back to Movies
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="content-spacing">
      {/* Header */}
      <div className="flex items-center mb-6">
        <button
          onClick={handleBack}
          className="btn btn-ghost"
          title="Back to Movies"
        >
          <FontAwesomeIcon icon={faArrowLeft} />
        </button>
        <h1 className="text-2xl font-bold text-white ml-4">
          Edit Movie: {movie.title} {movie.year ? `(${movie.year})` : ''}
        </h1>
      </div>

      {/* Tabs */}
      <div className="border-b border-neutral-700 mb-6">
        <nav className="flex space-x-8">
          <button
            onClick={() => setActiveTab('metadata')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'metadata'
                ? 'border-primary-500 text-primary-500'
                : 'border-transparent text-neutral-400 hover:text-neutral-300 hover:border-neutral-300'
            }`}
          >
            Metadata
          </button>
          <button
            onClick={() => setActiveTab('images')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'images'
                ? 'border-primary-500 text-primary-500'
                : 'border-transparent text-neutral-400 hover:text-neutral-300 hover:border-neutral-300'
            }`}
          >
            Images
          </button>
          <button
            onClick={() => setActiveTab('extras')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'extras'
                ? 'border-primary-500 text-primary-500'
                : 'border-transparent text-neutral-400 hover:text-neutral-300 hover:border-neutral-300'
            }`}
          >
            Extras
          </button>
          <button
            onClick={() => setActiveTab('unknown-files')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'unknown-files'
                ? 'border-primary-500 text-primary-500'
                : 'border-transparent text-neutral-400 hover:text-neutral-300 hover:border-neutral-300'
            }`}
          >
            Unknown Files
            {unknownFiles.length > 0 && (
              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-error/20 text-error">
                {unknownFiles.length}
              </span>
            )}
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'metadata' && id && <MetadataTab movieId={parseInt(id)} />}

        {activeTab === 'images' && id && <ImagesTab movieId={parseInt(id)} />}

        {activeTab === 'extras' && id && <ExtrasTab movieId={parseInt(id)} />}

        {activeTab === 'unknown-files' && (
          <div className="card">
            <div className="card-body">
              <h2 className="text-xl font-semibold text-white mb-2">Unknown Files</h2>
              <p className="text-sm text-neutral-400 mb-4">
                Files in this movie's folder that aren't recognized as video, NFO, images, trailers, or subtitles.
              </p>

              {/* Action descriptions - above the list */}
              {unknownFiles.length > 0 && (
                <div className="mb-4 p-2.5 bg-neutral-800/30 rounded border border-neutral-700/50">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                    <div>
                      <h4 className="font-medium text-neutral-200 mb-0.5 flex items-center text-sm">
                        <FontAwesomeIcon icon={faEyeSlash} className="mr-2 text-neutral-500 w-4" />
                        Ignore Pattern
                      </h4>
                      <p className="text-neutral-400 leading-tight">
                        Adds filename pattern to ignore list
                      </p>
                    </div>
                    <div>
                      <h4 className="font-medium text-neutral-200 mb-0.5 flex items-center text-sm">
                        <FontAwesomeIcon icon={faTrash} className="mr-2 text-neutral-500 w-4" />
                        Delete
                      </h4>
                      <p className="text-neutral-400 leading-tight">
                        Permanently removes file from filesystem
                      </p>
                    </div>
                    <div>
                      <h4 className="font-medium text-neutral-200 mb-0.5 flex items-center text-sm">
                        <FontAwesomeIcon icon={faTags} className="mr-2 text-neutral-500 w-4" />
                        Assign
                      </h4>
                      <p className="text-neutral-400 leading-tight">
                        Categorize file type for Metarr
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {loadingUnknownFiles ? (
                <div className="text-center py-8 text-neutral-400">
                  Loading unknown files...
                </div>
              ) : unknownFiles.length === 0 ? (
                <div className="text-center py-8">
                  <FontAwesomeIcon icon={faCheck} className="text-success text-4xl mb-3" />
                  <p className="text-neutral-200">No unknown files detected</p>
                  <p className="text-sm text-neutral-400 mt-2">
                    All files in this movie's directory are recognized
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {unknownFiles.map((file) => (
                    <div
                      key={file.id}
                      className="border border-yellow-600/30 bg-yellow-500/5 rounded-md px-4 py-2 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-4">
                        {/* Icon - Left, centered vertically */}
                        <div className="flex-shrink-0">
                          <FontAwesomeIcon
                            icon={getCategoryIcon(file.category)}
                            className="text-3xl text-neutral-300"
                          />
                        </div>

                        {/* File info - Two rows */}
                        <div className="flex-1 min-w-0">
                          {/* Top row: Relative path */}
                          <div className="flex items-center space-x-2">
                            <h3 className="font-mono text-sm break-all text-neutral-100">
                              {getRelativePath(file.file_path, file.library_path || '')}
                            </h3>
                          </div>

                          {/* Bottom row: File details */}
                          <div className="flex items-center space-x-3 mt-1 text-sm text-neutral-400">
                            <span className="capitalize">{file.category}</span>
                            <span>•</span>
                            <span className="uppercase">{file.extension.replace('.', '')}</span>
                            <span>•</span>
                            <span>{formatFileSize(file.file_size)}</span>
                          </div>
                        </div>

                        {/* Actions - Right column */}
                        <div className="flex-shrink-0 flex items-center gap-2">
                          <button
                            onClick={() => handleIgnorePattern(file.id)}
                            className="btn btn-ghost btn-sm"
                            title="Add this filename pattern to ignore list"
                          >
                            <FontAwesomeIcon icon={faEyeSlash} />
                          </button>
                          <button
                            onClick={() => handleDelete(file.id, file.file_name)}
                            className="btn btn-ghost btn-sm text-error hover:bg-error/20"
                            title="Delete this file permanently"
                          >
                            <FontAwesomeIcon icon={faTrash} />
                          </button>
                          <button
                            onClick={() => handleAssign(file.id, file.file_name)}
                            className="btn btn-secondary btn-sm"
                            title="Assign this file a category"
                          >
                            <FontAwesomeIcon icon={faTags} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Resolve Unknown File Modal */}
      {assignModal && (() => {
        const validTypes = getValidFileTypes(assignModal.fileName);
        const ext = getFileExtension(assignModal.fileName);

        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-neutral-800 rounded-lg border border-neutral-700 max-w-md w-full p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Resolve Unknown File</h3>
                <button
                  onClick={() => { setAssignModal(null); setSelectedFileType(''); }}
                  className="text-neutral-400 hover:text-white transition-colors"
                  disabled={processingAction}
                >
                  <FontAwesomeIcon icon={faTimes} />
                </button>
              </div>

              {/* File Info */}
              <div className="mb-4">
                <p className="font-mono text-sm text-white break-all mb-1">{assignModal.fileName}</p>
                <p className="text-xs text-neutral-400">
                  {ext.toUpperCase()}
                  {validTypes.category !== 'unknown' && (
                    <span className="ml-2 text-green-400">• {validTypes.category} detected</span>
                  )}
                </p>
              </div>

              {/* Assign Section */}
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-2">Assign as:</label>
                  <select
                    value={selectedFileType}
                    onChange={(e) => setSelectedFileType(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-700 rounded px-3 py-2 text-white focus:outline-none focus:border-primary-500 mb-2"
                    disabled={processingAction}
                  >
                    <option value="">-- Select Type --</option>
                    {validTypes.types.map(type => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={handleAssignSubmit}
                    disabled={!selectedFileType || processingAction}
                    className="w-full btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {processingAction ? 'Processing...' : 'Assign & Save'}
                  </button>
                </div>

                {/* Secondary Actions */}
                <div className="pt-3 border-t border-neutral-700 space-y-2">
                  <button
                    onClick={handleIgnoreFile}
                    disabled={processingAction}
                    className="w-full btn btn-ghost text-sm disabled:opacity-50"
                  >
                    <FontAwesomeIcon icon={faEyeSlash} className="mr-2" />
                    {processingAction ? 'Processing...' : 'Ignore File'}
                  </button>
                  <button
                    onClick={handleDeleteFile}
                    disabled={processingAction}
                    className="w-full btn btn-ghost text-red-400 hover:bg-red-950/30 text-sm disabled:opacity-50"
                  >
                    <FontAwesomeIcon icon={faTrash} className="mr-2" />
                    {processingAction ? 'Processing...' : 'Delete Permanently'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
