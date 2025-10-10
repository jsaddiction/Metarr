import React, { useState } from 'react';
import { useAssetTypePriorities, useUpdateAssetTypePriority } from '../../hooks/usePriorities';
import { AssetTypePriority } from '../../types/provider';

// Asset type display names
const ASSET_TYPE_NAMES: Record<string, string> = {
  poster: 'Posters',
  fanart: 'Fanart (Backdrops)',
  banner: 'Banners',
  clearlogo: 'Clear Logos',
  clearart: 'Clear Art',
  landscape: 'Landscape',
  characterart: 'Character Art',
  discart: 'Disc Art',
  thumb: 'Thumbnails',
  trailer: 'Trailers',
  theme: 'Theme Music',
};

// Provider display names
const PROVIDER_NAMES: Record<string, string> = {
  tmdb: 'TMDB',
  tvdb: 'TVDB',
  fanart_tv: 'FanArt.tv',
  theaudiodb: 'TheAudioDB',
  local: 'Local Files',
  imdb: 'IMDb',
  musicbrainz: 'MusicBrainz',
};

interface DraggableProviderItemProps {
  provider: string;
  index: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}

const DraggableProviderItem: React.FC<DraggableProviderItemProps> = ({
  provider,
  index,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}) => {
  const getOrdinal = (n: number): string => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  return (
    <div className="flex items-center gap-2 p-2 bg-neutral-800 rounded border border-neutral-700">
      {/* Priority indicator */}
      <div className="flex-shrink-0 w-12 text-center">
        <span className="text-xs font-semibold text-primary-400">
          {getOrdinal(index + 1)}
        </span>
      </div>

      {/* Provider name */}
      <div className="flex-1">
        <span className="text-sm text-neutral-300">
          {PROVIDER_NAMES[provider] || provider}
        </span>
      </div>

      {/* Move buttons */}
      <div className="flex gap-1">
        <button
          onClick={onMoveUp}
          disabled={isFirst}
          className="p-1 rounded hover:bg-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed"
          title="Move up"
        >
          <svg className="w-4 h-4 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        </button>
        <button
          onClick={onMoveDown}
          disabled={isLast}
          className="p-1 rounded hover:bg-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed"
          title="Move down"
        >
          <svg className="w-4 h-4 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export const AssetTypePriorityConfig: React.FC = () => {
  const { data: priorities = [], isLoading } = useAssetTypePriorities();
  const updatePriority = useUpdateAssetTypePriority();

  const [expandedAssetType, setExpandedAssetType] = useState<string | null>(null);
  const [editingOrder, setEditingOrder] = useState<Record<string, string[]>>({});

  // Filter out Local provider (it's infrastructure, doesn't provide web assets)
  const filterLocalProvider = (providerOrder: string[]): string[] => {
    return providerOrder.filter(p => p !== 'local');
  };

  const handleExpandToggle = (assetType: string) => {
    if (expandedAssetType === assetType) {
      setExpandedAssetType(null);
      // Clear editing state
      const newEditingOrder = { ...editingOrder };
      delete newEditingOrder[assetType];
      setEditingOrder(newEditingOrder);
    } else {
      setExpandedAssetType(assetType);
      // Initialize editing state with current order (filtered)
      const priority = priorities.find(p => p.assetType === assetType);
      if (priority) {
        const filtered = filterLocalProvider(priority.providerOrder);
        setEditingOrder({ ...editingOrder, [assetType]: [...filtered] });
      }
    }
  };

  const handleMoveProvider = (assetType: string, fromIndex: number, toIndex: number) => {
    const currentOrder = editingOrder[assetType] || [];
    const newOrder = [...currentOrder];
    const [movedItem] = newOrder.splice(fromIndex, 1);
    newOrder.splice(toIndex, 0, movedItem);
    setEditingOrder({ ...editingOrder, [assetType]: newOrder });
  };

  const handleSave = async (assetType: string) => {
    const newOrder = editingOrder[assetType];
    if (!newOrder) return;

    try {
      await updatePriority.mutateAsync({ assetType, providerOrder: newOrder });
      setExpandedAssetType(null);
      const newEditingOrder = { ...editingOrder };
      delete newEditingOrder[assetType];
      setEditingOrder(newEditingOrder);
    } catch (error: any) {
      console.error('Failed to update priority:', error);
    }
  };

  const handleCancel = (assetType: string) => {
    setExpandedAssetType(null);
    const newEditingOrder = { ...editingOrder };
    delete newEditingOrder[assetType];
    setEditingOrder(newEditingOrder);
  };

  if (isLoading) {
    return (
      <div className="card">
        <div className="card-body">
          <p className="text-neutral-400">Loading asset type priorities...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-body">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-white">Asset Selection Priority</h3>
          <p className="text-sm text-neutral-400 mt-1">
            Customize provider priority for each asset type
          </p>
        </div>

        {/* Quality Rule Explanation */}
        <div className="mb-4 p-3 bg-primary-900/20 border border-primary-700 rounded">
          <p className="text-sm text-primary-300">
            <span className="font-semibold">Quality Rule:</span> Higher quality assets (resolution, file size) always win. Priority order is only used as a tiebreaker when quality is equal.
          </p>
        </div>

        <div className="space-y-2">
          {priorities.map((priority) => {
            const isExpanded = expandedAssetType === priority.assetType;
            const filteredOrder = filterLocalProvider(priority.providerOrder);
            const currentOrder = editingOrder[priority.assetType] || filteredOrder;
            const hasChanges = editingOrder[priority.assetType] !== undefined;

            return (
              <div key={priority.assetType} className="border border-neutral-700 rounded-lg overflow-hidden">
                {/* Header */}
                <button
                  onClick={() => handleExpandToggle(priority.assetType)}
                  className="w-full p-3 bg-neutral-800/50 hover:bg-neutral-800 flex items-center justify-between transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-white">
                      {ASSET_TYPE_NAMES[priority.assetType] || priority.assetType}
                    </span>
                    <span className="text-xs text-neutral-500">
                      {filteredOrder.slice(0, 3).map((p, idx) => (
                        <span key={p}>
                          {idx > 0 && ' → '}
                          {PROVIDER_NAMES[p] || p}
                        </span>
                      ))}
                      {filteredOrder.length > 3 && ` (+${filteredOrder.length - 3} more)`}
                    </span>
                  </div>
                  <svg
                    className={`w-5 h-5 text-neutral-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="p-4 bg-neutral-900/30">
                    <div className="space-y-2 mb-4">
                      {currentOrder.map((provider, index) => (
                        <DraggableProviderItem
                          key={provider}
                          provider={provider}
                          index={index}
                          onMoveUp={() => handleMoveProvider(priority.assetType, index, index - 1)}
                          onMoveDown={() => handleMoveProvider(priority.assetType, index, index + 1)}
                          isFirst={index === 0}
                          isLast={index === currentOrder.length - 1}
                        />
                      ))}
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSave(priority.assetType)}
                        disabled={!hasChanges || updatePriority.isPending}
                        className="btn btn-primary flex-1"
                      >
                        {updatePriority.isPending ? 'Saving...' : 'Save Changes'}
                      </button>
                      <button
                        onClick={() => handleCancel(priority.assetType)}
                        disabled={updatePriority.isPending}
                        className="btn btn-secondary flex-1"
                      >
                        Cancel
                      </button>
                    </div>

                  </div>
                )}
              </div>
            );
          })}
        </div>

        {priorities.length === 0 && (
          <p className="text-center text-neutral-500 py-8">
            No asset type priorities configured
          </p>
        )}
      </div>
    </div>
  );
};
