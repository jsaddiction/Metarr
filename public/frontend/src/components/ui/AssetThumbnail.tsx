import React from 'react';
import { AssetCandidate } from '../../hooks/useAssetCandidates';

interface AssetThumbnailProps {
  candidate: AssetCandidate;
  selected?: boolean;
  blocked?: boolean;
  onClick?: () => void;
  onBlock?: () => void;
  onUnblock?: () => void;
}

/**
 * Asset Thumbnail Component
 *
 * Displays an asset candidate with:
 * - Image thumbnail
 * - Provider badge (TMDB/FanArt/TVDB)
 * - Score badge (0-100)
 * - Selection indicator (checkmark)
 * - Block/unblock button
 * - Metadata (resolution, language, votes)
 */
export const AssetThumbnail: React.FC<AssetThumbnailProps> = ({
  candidate,
  selected = false,
  blocked = false,
  onClick,
  onBlock,
  onUnblock,
}) => {
  const getProviderColor = (provider: string): string => {
    switch (provider.toLowerCase()) {
      case 'tmdb':
        return 'bg-blue-600';
      case 'fanart':
        return 'bg-purple-600';
      case 'tvdb':
        return 'bg-green-600';
      case 'local':
        return 'bg-gray-600';
      default:
        return 'bg-gray-500';
    }
  };

  const getScoreColor = (score: number): string => {
    if (score >= 80) return 'bg-green-600';
    if (score >= 60) return 'bg-yellow-600';
    if (score >= 40) return 'bg-orange-600';
    return 'bg-red-600';
  };

  const resolution = candidate.width && candidate.height
    ? `${candidate.width}x${candidate.height}`
    : 'Unknown';

  const aspectRatio = candidate.width && candidate.height
    ? (candidate.width / candidate.height).toFixed(2)
    : 'N/A';

  return (
    <div
      className={`
        relative group rounded-lg overflow-hidden border-2 transition-all cursor-pointer
        ${selected ? 'border-blue-500 ring-2 ring-blue-500' : 'border-gray-700 hover:border-gray-600'}
        ${blocked ? 'opacity-50' : ''}
      `}
      onClick={onClick}
    >
      {/* Image */}
      <div className="relative aspect-[2/3] bg-gray-800">
        <img
          src={candidate.url}
          alt={`${candidate.asset_type} from ${candidate.provider}`}
          className="w-full h-full object-cover"
          loading="lazy"
          onError={(e) => {
            // Fallback to placeholder on error
            e.currentTarget.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="300"%3E%3Crect fill="%23374151" width="200" height="300"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" fill="%239CA3AF" font-family="sans-serif" font-size="14"%3EImage Unavailable%3C/text%3E%3C/svg%3E';
          }}
        />

        {/* Selection indicator */}
        {selected && (
          <div className="absolute top-2 right-2 bg-blue-500 text-white rounded-full p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        )}

        {/* Blocked indicator */}
        {blocked && (
          <div className="absolute top-2 left-2 bg-red-500 text-white rounded-full p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
        )}

        {/* Provider badge */}
        <div className={`absolute top-2 left-2 ${getProviderColor(candidate.provider)} text-white text-xs font-semibold px-2 py-1 rounded ${blocked ? 'left-10' : ''}`}>
          {candidate.provider.toUpperCase()}
        </div>

        {/* Score badge */}
        <div className={`absolute bottom-2 right-2 ${getScoreColor(candidate.score)} text-white text-xs font-semibold px-2 py-1 rounded`}>
          {Math.round(candidate.score)}
        </div>

        {/* Hover overlay with metadata */}
        <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-80 transition-all opacity-0 group-hover:opacity-100 flex flex-col justify-center items-center text-white text-sm p-4">
          <div className="space-y-1 text-center">
            <p><strong>Resolution:</strong> {resolution}</p>
            <p><strong>Aspect Ratio:</strong> {aspectRatio}</p>
            {candidate.language && (
              <p><strong>Language:</strong> {candidate.language.toUpperCase()}</p>
            )}
            {candidate.vote_average !== null && candidate.vote_count !== null && (
              <p>
                <strong>Rating:</strong> {candidate.vote_average.toFixed(1)} ({candidate.vote_count} votes)
              </p>
            )}
          </div>

          {/* Block/Unblock button */}
          <div className="mt-4 flex gap-2">
            {!blocked && onBlock && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onBlock();
                }}
                className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-xs font-semibold"
              >
                Block
              </button>
            )}
            {blocked && onUnblock && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onUnblock();
                }}
                className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-xs font-semibold"
              >
                Unblock
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Footer with compact info */}
      <div className="bg-gray-800 p-2 text-xs text-gray-400">
        <div className="flex justify-between items-center">
          <span>{resolution}</span>
          <span className="font-semibold text-white">{Math.round(candidate.score)}/100</span>
        </div>
      </div>
    </div>
  );
};
