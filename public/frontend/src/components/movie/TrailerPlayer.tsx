/**
 * TrailerPlayer Component
 *
 * Simple video player modal for locally cached trailers.
 * Uses native browser video controls which handle:
 * - Play/pause
 * - Seeking
 * - Time display
 * - Fullscreen
 * - Volume control
 *
 * Keyboard: Escape to close modal
 */

import React, { useRef, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes } from '@fortawesome/free-solid-svg-icons';

interface TrailerPlayerProps {
  isOpen: boolean;
  onClose: () => void;
  streamUrl: string;
  title?: string;
}

export const TrailerPlayer: React.FC<TrailerPlayerProps> = ({
  isOpen,
  onClose,
  streamUrl,
  title = 'Trailer',
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Handle keyboard controls (Escape to close)
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  // Cleanup on close
  useEffect(() => {
    if (!isOpen && videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/95"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with title and close button */}
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-white font-medium">{title}</h3>
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/20 text-white transition-colors"
            aria-label="Close player"
          >
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        {/* Video with native controls */}
        <video
          ref={videoRef}
          src={streamUrl}
          className="w-full rounded-lg"
          controls
          autoPlay
          playsInline
          onError={(e) => {
            console.error('Video error:', e.currentTarget.error);
          }}
        />
      </div>
    </div>
  );
};
