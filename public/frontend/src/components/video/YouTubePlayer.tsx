/**
 * YouTubePlayer Component
 *
 * Embedded YouTube player using the IFrame Player API for programmatic control
 * and proper error handling. This component handles:
 * - Loading the YouTube IFrame API script
 * - Creating and managing the YT.Player instance
 * - Error detection and user-friendly error messages
 * - Autoplay blocked detection
 * - Cleanup on unmount
 *
 * @see https://developers.google.com/youtube/iframe_api_reference
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faExclamationTriangle,
  faSpinner,
  faPlay,
  faVideoSlash,
} from '@fortawesome/free-solid-svg-icons';

// Extend Window interface for YouTube IFrame API
declare global {
  interface Window {
    YT?: typeof YT;
    onYouTubeIframeAPIReady?: () => void;
  }
}

// YouTube Player States
const PlayerState = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
} as const;

// YouTube Error Codes
const ErrorCode = {
  INVALID_PARAM: 2,
  HTML5_ERROR: 5,
  NOT_FOUND: 100,
  NOT_EMBEDDABLE: 101,
  NOT_EMBEDDABLE_ALT: 150,
} as const;

interface YouTubePlayerProps {
  /** YouTube video ID (not full URL) */
  videoId: string;
  /** Title for accessibility */
  title?: string;
  /** Whether to autoplay when ready */
  autoplay?: boolean;
  /** CSS class for the container */
  className?: string;
  /** Callback when video ends */
  onEnded?: () => void;
  /** Callback when an error occurs */
  onError?: (errorCode: number, message: string) => void;
  /** Callback when player is ready */
  onReady?: () => void;
}

type PlayerError = {
  type: 'unavailable' | 'not_embeddable' | 'playback_error' | 'load_error';
  message: string;
};

// Track API loading state globally to avoid multiple script loads
let apiLoadPromise: Promise<void> | null = null;
let apiLoaded = false;

/**
 * Load the YouTube IFrame API script
 * Returns a promise that resolves when the API is ready
 */
const loadYouTubeAPI = (): Promise<void> => {
  // Already loaded
  if (apiLoaded && window.YT?.Player) {
    return Promise.resolve();
  }

  // Loading in progress
  if (apiLoadPromise) {
    return apiLoadPromise;
  }

  // Start loading
  apiLoadPromise = new Promise((resolve, reject) => {
    // Check if script already exists
    if (document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      // Script exists, wait for API
      const checkReady = () => {
        if (window.YT?.Player) {
          apiLoaded = true;
          resolve();
        } else {
          setTimeout(checkReady, 100);
        }
      };
      checkReady();
      return;
    }

    // Set up the callback before adding the script
    const previousCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      apiLoaded = true;
      if (previousCallback) previousCallback();
      resolve();
    };

    // Create and add the script
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = () => {
      apiLoadPromise = null;
      reject(new Error('Failed to load YouTube IFrame API'));
    };

    const firstScript = document.getElementsByTagName('script')[0];
    firstScript.parentNode?.insertBefore(script, firstScript);

    // Timeout after 10 seconds
    setTimeout(() => {
      if (!apiLoaded) {
        apiLoadPromise = null;
        reject(new Error('YouTube IFrame API load timeout'));
      }
    }, 10000);
  });

  return apiLoadPromise;
};

/**
 * Get user-friendly error message from YouTube error code
 */
const getErrorMessage = (errorCode: number): PlayerError => {
  switch (errorCode) {
    case ErrorCode.INVALID_PARAM:
      return {
        type: 'playback_error',
        message: 'Invalid video ID',
      };
    case ErrorCode.HTML5_ERROR:
      return {
        type: 'playback_error',
        message: 'Video playback error',
      };
    case ErrorCode.NOT_FOUND:
      return {
        type: 'unavailable',
        message: 'Video not found or has been removed',
      };
    case ErrorCode.NOT_EMBEDDABLE:
    case ErrorCode.NOT_EMBEDDABLE_ALT:
      return {
        type: 'not_embeddable',
        message: 'This video cannot be embedded',
      };
    default:
      return {
        type: 'playback_error',
        message: 'An error occurred while playing the video',
      };
  }
};

/**
 * YouTubePlayer - Embedded YouTube player with error handling
 */
export const YouTubePlayer: React.FC<YouTubePlayerProps> = ({
  videoId,
  title = 'YouTube video',
  autoplay = true,
  className = '',
  onEnded,
  onError,
  onReady,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YT.Player | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<PlayerError | null>(null);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);

  // Use refs for callbacks to avoid re-initializing player when callbacks change
  const onEndedRef = useRef(onEnded);
  const onErrorRef = useRef(onError);
  const onReadyRef = useRef(onReady);

  // Keep refs in sync with props
  useEffect(() => {
    onEndedRef.current = onEnded;
    onErrorRef.current = onError;
    onReadyRef.current = onReady;
  }, [onEnded, onError, onReady]);

  // Clean up player on unmount or videoId change
  const destroyPlayer = useCallback(() => {
    if (playerRef.current) {
      try {
        playerRef.current.destroy();
      } catch {
        // Ignore errors during cleanup
      }
      playerRef.current = null;
    }
  }, []);

  // Initialize player
  useEffect(() => {
    let mounted = true;

    const initPlayer = async () => {
      if (!containerRef.current || !videoId) return;

      setIsLoading(true);
      setError(null);
      setAutoplayBlocked(false);

      try {
        // Load the API
        await loadYouTubeAPI();

        if (!mounted || !containerRef.current) return;

        // Create a div for the player inside our container
        const playerDiv = document.createElement('div');
        playerDiv.id = `yt-player-${videoId}-${Date.now()}`;
        containerRef.current.innerHTML = '';
        containerRef.current.appendChild(playerDiv);

        // Create the player with 100% size to fill container
        playerRef.current = new window.YT!.Player(playerDiv.id, {
          videoId,
          width: '100%',
          height: '100%',
          playerVars: {
            autoplay: autoplay ? 1 : 0,
            rel: 0, // Don't show related videos
            modestbranding: 1,
            playsinline: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: () => {
              if (!mounted) return;
              setIsLoading(false);
              onReadyRef.current?.();
            },
            onStateChange: (event: YT.OnStateChangeEvent) => {
              if (!mounted) return;
              if (event.data === PlayerState.ENDED) {
                onEndedRef.current?.();
              }
            },
            onError: (event: YT.OnErrorEvent) => {
              if (!mounted) return;
              const errorInfo = getErrorMessage(event.data);
              setError(errorInfo);
              setIsLoading(false);
              onErrorRef.current?.(event.data, errorInfo.message);
            },
          },
        });

        // Handle autoplay blocked (check after a short delay)
        if (autoplay) {
          setTimeout(() => {
            if (!mounted || !playerRef.current) return;
            try {
              const state = playerRef.current.getPlayerState();
              // If still unstarted or cued after autoplay was requested, it was likely blocked
              if (state === PlayerState.UNSTARTED || state === PlayerState.CUED) {
                setAutoplayBlocked(true);
              }
            } catch {
              // Player might not be ready yet, ignore
            }
          }, 1500);
        }
      } catch (err) {
        if (!mounted) return;
        setError({
          type: 'load_error',
          message: 'Failed to load video player',
        });
        setIsLoading(false);
      }
    };

    initPlayer();

    return () => {
      mounted = false;
      destroyPlayer();
    };
    // Only re-initialize when videoId or autoplay changes
    // Callbacks are accessed via refs to avoid unnecessary re-initialization
  }, [videoId, autoplay, destroyPlayer]);

  // Handle manual play when autoplay is blocked
  const handleManualPlay = useCallback(() => {
    if (playerRef.current) {
      try {
        playerRef.current.playVideo();
        setAutoplayBlocked(false);
      } catch {
        // Ignore errors
      }
    }
  }, []);

  // Error display
  if (error) {
    return (
      <div className={`flex flex-col items-center justify-center bg-neutral-900 text-neutral-400 ${className}`}>
        <FontAwesomeIcon
          icon={error.type === 'unavailable' ? faVideoSlash : faExclamationTriangle}
          className="text-4xl mb-3 text-neutral-500"
        />
        <p className="text-sm text-center px-4">{error.message}</p>
        {error.type === 'not_embeddable' && (
          <a
            href={`https://www.youtube.com/watch?v=${videoId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 text-xs text-primary-400 hover:text-primary-300 underline"
          >
            Watch on YouTube
          </a>
        )}
      </div>
    );
  }

  return (
    <div className={`relative bg-black overflow-hidden ${className}`}>
      {/* Player container - iframe will be sized via CSS */}
      <div ref={containerRef} className="absolute inset-0 [&>iframe]:w-full [&>iframe]:h-full [&>iframe]:border-0" />

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-neutral-900">
          <FontAwesomeIcon icon={faSpinner} className="text-3xl text-neutral-400 animate-spin" />
        </div>
      )}

      {/* Autoplay blocked overlay */}
      {autoplayBlocked && !isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <button
            onClick={handleManualPlay}
            className="flex flex-col items-center gap-2 text-white hover:text-primary-400 transition-colors"
            aria-label={`Play ${title}`}
          >
            <div className="w-16 h-16 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 transition-colors">
              <FontAwesomeIcon icon={faPlay} className="text-2xl ml-1" />
            </div>
            <span className="text-sm">Click to play</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default YouTubePlayer;
