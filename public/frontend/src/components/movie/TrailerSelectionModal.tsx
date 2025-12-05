/**
 * TrailerSelectionModal Component
 *
 * Modal for selecting, adding, and managing trailer candidates.
 * Features:
 * - Preview trailers before selecting
 * - Explicit select button (clicking doesn't auto-select)
 * - Add trailer via URL (YouTube, Vimeo, etc.)
 * - Upload trailer file
 * - View scoring breakdown
 *
 * Player Components:
 * - YouTubePlayer: IFrame API player for YouTube URLs (error handling, autoplay detection)
 * - Future: CachedVideoPlayer for downloaded/uploaded videos using HTML5 video + streaming API
 */

import React, { useState, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faTimes,
  faCheck,
  faSpinner,
  faExclamationTriangle,
  faLink,
  faUpload,
  faVideo,
  faExternalLinkAlt,
  faPlay,
  faClock,
  faTrophy,
  faGlobe,
  faRedo,
} from '@fortawesome/free-solid-svg-icons';
import {
  useTrailerCandidates,
  useSelectTrailer,
  useAddTrailerUrl,
  useUploadTrailer,
  useRetryTrailerDownload,
  useVerifyCandidates,
  useTestCandidate,
  TrailerCandidate,
  CandidateVerificationStatus,
} from '../../hooks/useTrailer';
import { YouTubePlayer } from '../video/YouTubePlayer';

interface TrailerSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  movieId: number;
  movieTitle: string;
  currentTrailerId?: number;
}

/**
 * Extract YouTube video ID from various YouTube URL formats
 */
const extractYouTubeId = (url: string): string | null => {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&?/]+)/,
    /youtube\.com\/v\/([^&?/]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
};

/**
 * Check if URL is a YouTube URL
 */
const isYouTubeUrl = (url: string): boolean => {
  return /youtube\.com|youtu\.be/.test(url);
};

/**
 * Inline preview card for trailer candidates
 *
 * Preview approach:
 * - YouTube URLs: Use YouTube embed iframe (designed for cross-origin)
 * - Cached/downloaded videos: Could use streaming endpoint (future)
 * - Other URLs: Show thumbnail only with link to open in new tab
 */
const TrailerPreviewCard: React.FC<{
  candidate: TrailerCandidate;
  isSelected: boolean;
  verificationStatus?: CandidateVerificationStatus;
  onTestAndSelect: () => Promise<{ success: boolean; message: string }>;
  isTesting: boolean;
  onRetry: () => void;
  isRetryPending: boolean;
}> = ({ candidate, isSelected, verificationStatus, onTestAndSelect, isTesting, onRetry, isRetryPending }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Format file size
  const formatSize = (bytes: number | null): string => {
    if (!bytes) return 'Unknown size';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  // Format resolution
  const formatResolution = (width: number | null, height: number | null): string => {
    if (!width || !height) return 'Unknown';
    if (height >= 2160) return '4K';
    if (height >= 1080) return '1080p';
    if (height >= 720) return '720p';
    if (height >= 480) return '480p';
    return `${width}x${height}`;
  };

  // Format duration as mm:ss or h:mm:ss
  const formatDuration = (seconds: number | null): string | null => {
    if (!seconds) return null;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Get source label
  const getSourceLabel = (): string => {
    if (candidate.source_type === 'upload') return 'Uploaded';
    if (candidate.source_type === 'user') return 'Added URL';
    if (candidate.provider_name) return candidate.provider_name;
    return 'Provider';
  };

  // Determine preview type
  const youtubeId = candidate.source_url ? extractYouTubeId(candidate.source_url) : null;
  const isYouTube = candidate.source_url ? isYouTubeUrl(candidate.source_url) : false;

  // Open source URL in new tab (for non-YouTube URLs)
  const handleOpenExternal = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (candidate.source_url) {
      window.open(candidate.source_url, '_blank', 'noopener,noreferrer');
    }
  }, [candidate.source_url]);

  const isUnavailable = candidate.failure_reason === 'unavailable';

  return (
    <div
      className={`
        border rounded-lg overflow-hidden transition-all
        ${isUnavailable ? 'opacity-60' : ''}
        ${isSelected
          ? 'border-primary-500 bg-primary-500/10'
          : 'border-neutral-700 bg-neutral-800/50 hover:border-neutral-500'
        }
      `}
    >
      <div className="flex">
        {/* Video/Thumbnail Area */}
        <div className={`relative w-64 h-36 flex-shrink-0 bg-black ${isSelected ? 'ring-2 ring-primary-500' : ''}`}>
          {youtubeId && isPlaying ? (
            // YouTube player - only loaded when user clicks to play
            <YouTubePlayer
              videoId={youtubeId}
              title={candidate.title || 'Trailer preview'}
              autoplay={true}
              className="w-full h-full"
            />
          ) : youtubeId ? (
            // YouTube thumbnail with play button (lazy load approach)
            <>
              <img
                src={`https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`}
                alt={candidate.title || 'Trailer thumbnail'}
                className="absolute inset-0 w-full h-full object-cover"
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsPlaying(true);
                }}
                className="absolute inset-0 flex items-center justify-center bg-black/40 hover:bg-black/20 transition-colors cursor-pointer group"
                aria-label={`Play ${candidate.title || 'trailer'}`}
              >
                <FontAwesomeIcon
                  icon={faPlay}
                  className="text-primary-400 group-hover:text-primary-300 text-2xl transition-colors"
                />
              </button>
            </>
          ) : (
            // Non-YouTube: show thumbnail with external link
            <>
              {candidate.thumbnail_url ? (
                <img
                  src={candidate.thumbnail_url}
                  alt={candidate.title || 'Trailer thumbnail'}
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-neutral-600">
                  <FontAwesomeIcon icon={faVideo} className="text-4xl" />
                </div>
              )}

              {/* External link overlay */}
              {candidate.source_url && (
                <button
                  onClick={handleOpenExternal}
                  className="absolute inset-0 flex items-center justify-center bg-black/40 hover:bg-black/30 transition-colors cursor-pointer"
                  title="Open in new tab"
                >
                  <div className="w-12 h-12 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 transition-colors">
                    <FontAwesomeIcon icon={faExternalLinkAlt} className="text-white text-lg" />
                  </div>
                </button>
              )}

              {/* External badge */}
              {!isYouTube && candidate.source_url && (
                <div className="absolute top-2 left-2">
                  <span className="text-white text-xs bg-black/60 px-1.5 py-0.5 rounded">
                    External
                  </span>
                </div>
              )}
            </>
          )}

          {/* Duration badge - bottom right corner overlay */}
          {candidate.duration_seconds && (
            <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/80 rounded text-xs text-white font-medium">
              {formatDuration(candidate.duration_seconds)}
            </div>
          )}

          {/* Selected checkmark overlay - top right */}
          {isSelected && (
            <div className="absolute top-2 right-2 w-6 h-6 bg-primary-500 rounded-full flex items-center justify-center">
              <FontAwesomeIcon icon={faCheck} className="text-white text-xs" />
            </div>
          )}
        </div>

        {/* Info Area */}
        <div className="flex-1 p-3 flex flex-col min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h4 className="font-medium text-white truncate text-sm flex items-center gap-1.5">
                <span className="truncate">{candidate.title || candidate.tmdb_name || 'Unknown Trailer'}</span>
                {!!candidate.tmdb_official && (
                  <FontAwesomeIcon icon={faTrophy} className="text-primary-400 flex-shrink-0" title="Official" />
                )}
              </h4>
              <div className="flex items-center gap-2 mt-1 text-xs text-neutral-400 flex-wrap">
                <span>{getSourceLabel()}</span>
                {candidate.tmdb_language && (
                  <>
                    <span>•</span>
                    <span className="inline-flex items-center gap-1">
                      <FontAwesomeIcon icon={faGlobe} className="text-neutral-500" />
                      {candidate.tmdb_language.toUpperCase()}
                    </span>
                  </>
                )}
                {(candidate.best_width && candidate.best_height) && (
                  <>
                    <span>•</span>
                    <span>{formatResolution(candidate.best_width, candidate.best_height)}</span>
                  </>
                )}
                {candidate.estimated_size_bytes && (
                  <>
                    <span>•</span>
                    <span>{formatSize(candidate.estimated_size_bytes)}</span>
                  </>
                )}
              </div>
            </div>

          </div>

          {/* Status indicators */}
          <div className="flex items-center gap-3 mt-2 text-xs">
            {candidate.failed_at && (
              <>
                <span className={isUnavailable ? 'text-neutral-500' : 'text-warning'}>
                  <FontAwesomeIcon icon={faExclamationTriangle} className="mr-1" />
                  {isUnavailable
                    ? 'Video unavailable'
                    : candidate.failure_reason === 'rate_limited'
                      ? 'Rate limited'
                      : 'Download error'}
                </span>
                {candidate.source_url && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isUnavailable) {
                        // Show confirmation for unavailable videos
                        if (window.confirm(
                          'This video was previously marked as unavailable. ' +
                          'It may have been deleted or made private. ' +
                          'Do you want to retry anyway?'
                        )) {
                          onRetry();
                        }
                      } else {
                        onRetry();
                      }
                    }}
                    disabled={isRetryPending}
                    className={`
                      px-2 py-0.5 rounded text-xs font-medium transition-colors flex items-center gap-1
                      ${isUnavailable
                        ? 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700'
                        : 'text-warning hover:text-white hover:bg-warning/20'
                      }
                      ${isRetryPending ? 'opacity-50 cursor-wait' : ''}
                    `}
                    title={isUnavailable ? 'Retry (video may be unavailable)' : 'Retry download'}
                  >
                    <FontAwesomeIcon icon={isRetryPending ? faSpinner : faRedo} spin={isRetryPending} />
                    Retry
                  </button>
                )}
              </>
            )}
            {!candidate.analyzed && !candidate.failed_at && (
              <span className="text-neutral-500">
                <FontAwesomeIcon icon={faClock} className="mr-1" />
                Not analyzed
              </span>
            )}
          </div>

          {/* Select Button - uses test-then-select pattern */}
          <div className="mt-auto pt-2 flex justify-end">
            <button
              onClick={async (e) => {
                e.stopPropagation();
                if (isSelected || isTesting) return;

                // Clear previous result
                setTestResult(null);

                try {
                  const result = await onTestAndSelect();
                  setTestResult(result);

                  // Clear result after 3 seconds
                  setTimeout(() => setTestResult(null), 3000);
                } catch (error) {
                  setTestResult({
                    success: false,
                    message: error instanceof Error ? error.message : 'Test failed'
                  });
                  setTimeout(() => setTestResult(null), 3000);
                }
              }}
              disabled={isSelected || isTesting || verificationStatus === 'unavailable'}
              title={
                verificationStatus === 'unavailable'
                  ? 'Video is unavailable'
                  : testResult?.message
              }
              className={`
                w-24 px-3 py-1.5 rounded text-sm font-medium transition-all flex items-center justify-center gap-2 relative
                ${isSelected
                  ? 'bg-primary-600 text-white cursor-default'
                  : testResult?.success === false
                    ? 'border border-error text-error'
                    : testResult?.success === true
                      ? 'border border-success text-success'
                      : 'border border-primary-500 text-primary-400 hover:bg-primary-500 hover:text-white'
                }
                ${(isTesting || verificationStatus === 'unavailable') ? 'opacity-50 cursor-not-allowed' : ''}
              `}
            >
              {isTesting ? (
                <>
                  <FontAwesomeIcon icon={faSpinner} spin />
                  Testing...
                </>
              ) : isSelected ? (
                <>
                  <FontAwesomeIcon icon={faCheck} />
                  Selected
                </>
              ) : testResult?.success === true ? (
                <span className="text-success">✓</span>
              ) : testResult?.success === false ? (
                <span className="text-error">✗</span>
              ) : (
                'Select'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const TrailerSelectionModal: React.FC<TrailerSelectionModalProps> = ({
  isOpen,
  onClose,
  movieId,
  movieTitle,
  currentTrailerId,
}) => {
  // State
  const [activeTab, setActiveTab] = useState<'candidates' | 'url' | 'upload'>('candidates');
  const [urlInput, setUrlInput] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileTitle, setFileTitle] = useState('');
  const [verificationResults, setVerificationResults] = useState<Record<number, CandidateVerificationStatus>>({});
  const [testingCandidateId, setTestingCandidateId] = useState<number | null>(null);

  // Queries and mutations
  const { data: candidates, isLoading, error } = useTrailerCandidates(movieId);
  const selectMutation = useSelectTrailer(movieId);
  const addUrlMutation = useAddTrailerUrl(movieId);
  const uploadMutation = useUploadTrailer(movieId);
  const retryMutation = useRetryTrailerDownload(movieId);
  const verifyMutation = useVerifyCandidates(movieId);
  const testMutation = useTestCandidate(movieId);

  // Verify candidates when modal opens
  useEffect(() => {
    if (isOpen && candidates && candidates.length > 0) {
      // Reset verification results
      setVerificationResults({});

      // Trigger parallel verification
      verifyMutation.mutate(undefined, {
        onSuccess: (data) => {
          setVerificationResults(data.results);
        },
      });
    }
  }, [isOpen, candidates?.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Format file size
  const formatSize = (bytes: number | null): string => {
    if (!bytes) return 'Unknown size';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  // Handle test and select - tests download first, then selects if successful
  const handleTestAndSelect = async (candidateId: number): Promise<{ success: boolean; message: string }> => {
    // Find the candidate
    const candidate = candidates?.find(c => c.id === candidateId);
    if (!candidate) {
      return { success: false, message: 'Candidate not found' };
    }

    // Uploads don't need testing - select directly
    if (candidate.source_type === 'upload') {
      try {
        await selectMutation.mutateAsync(candidateId);
        onClose();
        return { success: true, message: 'Selected' };
      } catch (error) {
        return { success: false, message: error instanceof Error ? error.message : 'Selection failed' };
      }
    }

    // Test download first
    setTestingCandidateId(candidateId);
    try {
      const testResult = await testMutation.mutateAsync(candidateId);

      if (!testResult.success) {
        // Test failed - don't select, show error
        const errorMessages: Record<string, string> = {
          'unavailable': 'Video is unavailable or removed',
          'rate_limited': 'Rate limited by provider',
          'region_blocked': 'Video not available in your region',
          'format_error': 'No compatible format available',
        };
        return {
          success: false,
          message: testResult.error ? errorMessages[testResult.error] || testResult.message || 'Test failed' : 'Test failed',
        };
      }

      // Test passed - proceed with selection
      await selectMutation.mutateAsync(candidateId);
      onClose();
      return { success: true, message: 'Download queued' };
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'Test failed' };
    } finally {
      setTestingCandidateId(null);
    }
  };

  // Handle add URL
  const handleAddUrl = async () => {
    if (!urlInput.trim()) return;

    try {
      await addUrlMutation.mutateAsync({ url: urlInput.trim(), autoSelect: true });
      setUrlInput('');
      setActiveTab('candidates');
      onClose();
    } catch (error) {
      console.error('Failed to add trailer URL:', error);
    }
  };

  // Handle file upload
  const handleUpload = async () => {
    if (!selectedFile) return;

    try {
      await uploadMutation.mutateAsync({
        file: selectedFile,
        title: fileTitle || undefined,
      });
      setSelectedFile(null);
      setFileTitle('');
      setActiveTab('candidates');
      onClose();
    } catch (error) {
      console.error('Failed to upload trailer:', error);
    }
  };

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      // Use filename without extension as default title
      const name = file.name.replace(/\.[^/.]+$/, '');
      setFileTitle(name);
    }
  };

  // Close on ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isSubmitting = selectMutation.isPending || addUrlMutation.isPending || uploadMutation.isPending;

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
        onClick={onClose}
      >
        <div
          className="bg-neutral-900 rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col mx-4"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-neutral-700">
            <h2 className="text-xl font-semibold text-white">
              Select Trailer for {movieTitle}
            </h2>
            <button
              onClick={onClose}
              className="w-10 h-10 flex items-center justify-center rounded hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors"
              aria-label="Close modal"
            >
              <FontAwesomeIcon icon={faTimes} />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-neutral-700">
            <button
              onClick={() => setActiveTab('candidates')}
              className={`px-6 py-3 text-sm font-medium transition-colors ${
                activeTab === 'candidates'
                  ? 'text-primary-400 border-b-2 border-primary-400'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <FontAwesomeIcon icon={faVideo} className="mr-2" />
              Candidates ({candidates?.length || 0})
            </button>
            <button
              onClick={() => setActiveTab('url')}
              className={`px-6 py-3 text-sm font-medium transition-colors ${
                activeTab === 'url'
                  ? 'text-primary-400 border-b-2 border-primary-400'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <FontAwesomeIcon icon={faLink} className="mr-2" />
              Add URL
            </button>
            <button
              onClick={() => setActiveTab('upload')}
              className={`px-6 py-3 text-sm font-medium transition-colors ${
                activeTab === 'upload'
                  ? 'text-primary-400 border-b-2 border-primary-400'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <FontAwesomeIcon icon={faUpload} className="mr-2" />
              Upload
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {activeTab === 'candidates' && (
              <>
                {isLoading ? (
                  <div className="flex items-center justify-center h-64">
                    <FontAwesomeIcon icon={faSpinner} spin className="text-4xl text-primary-500" />
                  </div>
                ) : error ? (
                  <div className="bg-error/20 border border-error rounded-md p-4">
                    <div className="flex items-center gap-3">
                      <FontAwesomeIcon icon={faExclamationTriangle} className="text-error text-xl" />
                      <div>
                        <h4 className="font-semibold text-white mb-1">Failed to load candidates</h4>
                        <p className="text-sm text-neutral-300">
                          {error instanceof Error ? error.message : 'Unknown error'}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : candidates && candidates.length > 0 ? (
                  <div className="space-y-3">
                    {/* Instructions */}
                    <p className="text-neutral-400 text-sm mb-4">
                      Click to preview trailers, then use the Select button to choose one.
                    </p>
                    {[...candidates]
                      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
                      .map((candidate) => (
                        <TrailerPreviewCard
                          key={candidate.id}
                          candidate={candidate}
                          isSelected={candidate.is_selected}
                          verificationStatus={verificationResults[candidate.id]}
                          onTestAndSelect={() => handleTestAndSelect(candidate.id)}
                          isTesting={testingCandidateId === candidate.id}
                          onRetry={() => retryMutation.mutate(candidate.id)}
                          isRetryPending={retryMutation.isPending}
                        />
                      ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-64 text-neutral-500">
                    <FontAwesomeIcon icon={faVideo} className="text-4xl mb-4" />
                    <div>No trailer candidates available</div>
                    <div className="text-sm mt-2">Add a trailer via URL or upload</div>
                  </div>
                )}
              </>
            )}

            {activeTab === 'url' && (
              <div className="max-w-lg mx-auto py-8">
                <h3 className="text-lg font-medium text-white mb-4">Add Trailer from URL</h3>
                <p className="text-neutral-400 text-sm mb-6">
                  Enter a URL from YouTube, Vimeo, or any other site supported by yt-dlp.
                  The trailer will be downloaded and analyzed automatically.
                </p>

                <div className="space-y-4">
                  <div>
                    <label htmlFor="trailer-url" className="block text-sm font-medium text-neutral-300 mb-2">
                      Video URL
                    </label>
                    <input
                      id="trailer-url"
                      type="url"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      placeholder="https://www.youtube.com/watch?v=..."
                      className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-primary-500"
                      disabled={isSubmitting}
                    />
                  </div>

                  {addUrlMutation.isError && (
                    <div className="text-error text-sm">
                      {addUrlMutation.error instanceof Error
                        ? addUrlMutation.error.message
                        : 'Failed to add trailer'}
                    </div>
                  )}

                  <button
                    onClick={handleAddUrl}
                    disabled={!urlInput.trim() || isSubmitting}
                    className="w-full px-4 py-3 rounded-lg bg-primary-600 hover:bg-primary-700 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {addUrlMutation.isPending ? (
                      <>
                        <FontAwesomeIcon icon={faSpinner} spin />
                        Adding...
                      </>
                    ) : (
                      <>
                        <FontAwesomeIcon icon={faLink} />
                        Add Trailer
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'upload' && (
              <div className="max-w-lg mx-auto py-8">
                <h3 className="text-lg font-medium text-white mb-4">Upload Trailer File</h3>
                <p className="text-neutral-400 text-sm mb-6">
                  Upload a video file from your computer. Supported formats: MP4, MKV, WebM, AVI.
                  Maximum size: 500MB.
                </p>

                <div className="space-y-4">
                  {/* File input */}
                  <div>
                    <label htmlFor="trailer-file" className="block text-sm font-medium text-neutral-300 mb-2">
                      Video File
                    </label>
                    <input
                      id="trailer-file"
                      type="file"
                      accept="video/*"
                      onChange={handleFileChange}
                      className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-primary-600 file:text-white file:cursor-pointer"
                      disabled={isSubmitting}
                    />
                  </div>

                  {/* Title input */}
                  {selectedFile && (
                    <div>
                      <label htmlFor="trailer-title" className="block text-sm font-medium text-neutral-300 mb-2">
                        Title (optional)
                      </label>
                      <input
                        id="trailer-title"
                        type="text"
                        value={fileTitle}
                        onChange={(e) => setFileTitle(e.target.value)}
                        placeholder="Official Trailer"
                        className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-primary-500"
                        disabled={isSubmitting}
                      />
                    </div>
                  )}

                  {/* File info */}
                  {selectedFile && (
                    <div className="text-neutral-400 text-sm">
                      Selected: {selectedFile.name} ({formatSize(selectedFile.size)})
                    </div>
                  )}

                  {uploadMutation.isError && (
                    <div className="text-error text-sm">
                      {uploadMutation.error instanceof Error
                        ? uploadMutation.error.message
                        : 'Failed to upload trailer'}
                    </div>
                  )}

                  <button
                    onClick={handleUpload}
                    disabled={!selectedFile || isSubmitting}
                    className="w-full px-4 py-3 rounded-lg bg-primary-600 hover:bg-primary-700 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {uploadMutation.isPending ? (
                      <>
                        <FontAwesomeIcon icon={faSpinner} spin />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <FontAwesomeIcon icon={faUpload} />
                        Upload Trailer
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-4 border-t border-neutral-700">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded bg-neutral-700 hover:bg-neutral-600 text-white transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
