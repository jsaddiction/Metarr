import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faStar, faCheck } from '@fortawesome/free-solid-svg-icons';
import { AssetCandidate, AssetQuality } from '../../types/asset';

interface AssetCardProps {
  asset: AssetCandidate;
  provider: string;
  isSelected?: boolean;
  isRecommended?: boolean;
  score?: number;
  onClick?: () => void;
  mode?: 'selection' | 'display'; // selection = for choosing assets, display = just showing current assets
}

export const AssetCard: React.FC<AssetCardProps> = ({
  asset,
  provider,
  isSelected = false,
  isRecommended = false,
  score,
  onClick,
  mode = 'selection',
}) => {
  // Get aspect ratio for the asset type
  // Cards will size dynamically based on parent container
  const getAspectRatio = () => {
    switch (asset.assetType) {
      case 'fanart':
      case 'landscape':
        return 'aspect-[16/9]';
      case 'banner':
        return 'aspect-[1000/185]';
      case 'clearlogo':
        return 'aspect-[800/310]';
      case 'clearart':
        return 'aspect-[1000/562]';
      case 'discart':
        return 'aspect-square';
      case 'keyart':
      case 'poster':
      default:
        return 'aspect-[2/3]';
    }
  };

  // Determine if this asset type should use object-contain instead of object-cover
  // Logos and clear art with transparency need to be fully visible
  const shouldContain = asset.assetType && ['clearlogo', 'clearart', 'discart'].includes(asset.assetType);

  const aspectRatio = getAspectRatio();
  // Format quality badge
  const getQualityBadge = (quality?: AssetQuality, width?: number, height?: number) => {
    if (quality === '4k' || (width && width >= 3840)) {
      return { label: '4K', color: 'bg-purple-600' };
    }
    if (quality === 'hd' || (width && width >= 1280)) {
      return { label: 'HD', color: 'bg-primary-500' };
    }
    if (quality === 'sd') {
      return { label: 'SD', color: 'bg-neutral-600' };
    }
    return null;
  };

  // Format resolution text
  const getResolutionText = () => {
    if (asset.width && asset.height) {
      return `${asset.width}×${asset.height}`;
    }
    return null;
  };

  // Format provider name for display
  const getProviderDisplayName = (name: string) => {
    const displayNames: Record<string, string> = {
      tmdb: 'TMDB',
      fanart_tv: 'FanArt.tv',
      tvdb: 'TVDB',
      omdb: 'OMDb',
      imdb: 'IMDb',
    };
    return displayNames[name.toLowerCase()] || name;
  };

  // Format vote count
  const formatVotes = (votes?: number) => {
    if (!votes) return null;
    if (votes >= 1000) {
      return `${(votes / 1000).toFixed(1)}k`;
    }
    return votes.toString();
  };

  const qualityBadge = getQualityBadge(asset.quality, asset.width, asset.height);
  const resolution = getResolutionText();
  const votes = formatVotes(asset.votes);

  const isSelectionMode = mode === 'selection';

  // Keyboard event handler for accessibility
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Enter or Space key activates the card (standard keyboard interaction)
    if (onClick && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault(); // Prevent page scroll on Space
      onClick();
    }
  };

  // Use button for selection mode (interactive), div for display mode (non-interactive)
  const Component = isSelectionMode ? 'button' : 'div';

  return (
    <Component
      onClick={isSelectionMode ? onClick : undefined}
      onKeyDown={isSelectionMode ? handleKeyDown : undefined}
      tabIndex={isSelectionMode ? 0 : undefined}
      type={isSelectionMode ? 'button' : undefined}
      aria-label={isSelectionMode ? `Select ${asset.assetType} from ${provider}, ${resolution || 'unknown resolution'}` : undefined}
      aria-pressed={isSelectionMode ? isSelected : undefined}
      className={`
        relative group border rounded overflow-hidden
        transition-all duration-200
        ${isSelectionMode ? 'cursor-pointer' : ''}
        ${isSelectionMode ? 'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-neutral-900' : ''}
        ${isSelected && isSelectionMode
          ? 'border-primary-500 shadow-lg ring-2 ring-primary-500'
          : 'border-neutral-700'
        }
        ${isSelectionMode && !isSelected ? 'hover:border-primary-400' : ''}
        w-full text-left
      `}
    >
      {/* Image Container - Dynamic sizing based on grid */}
      <div className={`relative ${aspectRatio} bg-neutral-900 w-full overflow-hidden`}>
        <img
          src={asset.thumbnailUrl || asset.url}
          alt={`${asset.assetType} from ${provider}`}
          className={`absolute inset-0 w-full h-full ${shouldContain ? 'object-contain' : 'object-cover'}`}
          loading="lazy"
        />

        {/* Recommended Badge (Top Left) - Selection mode only */}
        {isSelectionMode && isRecommended && (
          <div className="absolute top-1.5 left-1.5 bg-primary-600 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded flex items-center gap-1">
            <FontAwesomeIcon icon={faStar} className="text-warning" aria-hidden="true" />
            <span>Best</span>
          </div>
        )}

        {/* Quality Badge (Top Right) */}
        {qualityBadge && (
          <div className={`absolute top-1.5 right-1.5 ${qualityBadge.color} text-white text-[10px] font-semibold px-1.5 py-0.5 rounded`}>
            {qualityBadge.label}
          </div>
        )}

        {/* Selected Overlay - Selection mode only */}
        {isSelectionMode && isSelected && (
          <div className="absolute inset-0 bg-primary-500/20 flex items-center justify-center">
            <div className="bg-primary-500 text-white rounded-full w-10 h-10 flex items-center justify-center">
              <FontAwesomeIcon icon={faCheck} className="text-xl" aria-hidden="true" />
            </div>
          </div>
        )}

        {/* Hover Overlay - Selection mode only */}
        {isSelectionMode && !isSelected && (
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <div className="text-white text-sm font-semibold">Select</div>
          </div>
        )}
      </div>

      {/* Info Below Image - Compact Single Row */}
      <div className="bg-neutral-800 px-2 py-1 flex items-center justify-between text-[10px]">
        <span className="font-semibold text-primary-300 truncate">
          {getProviderDisplayName(provider)}
        </span>
        <span className="text-neutral-300 ml-2 flex-shrink-0">
          {resolution || 'Unknown'}
        </span>
      </div>
    </Component>
  );
};
