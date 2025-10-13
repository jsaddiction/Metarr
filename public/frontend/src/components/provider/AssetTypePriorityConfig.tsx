import React, { useState } from 'react';
import { useAssetTypePriorities, useUpdateAssetTypePriority } from '../../hooks/usePriorities';
import { AssetTypePriority } from '../../types/provider';

// Asset type display names and categorization
const ASSET_TYPE_NAMES: Record<string, string> = {
  // Movies
  movie_poster: 'Posters',
  movie_fanart: 'Fanart',
  movie_clearlogo: 'Clear Logos',
  movie_clearart: 'Clear Art',
  movie_discart: 'Disc Art',
  movie_trailer: 'Trailers',

  // TV Shows
  tv_poster: 'Posters',
  tv_fanart: 'Fanart',
  tv_banner: 'Banners',
  tv_clearlogo: 'Clear Logos',
  tv_clearart: 'Clear Art',
  tv_characterart: 'Character Art',
  tv_landscape: 'Landscape',
  tv_thumb: 'Thumbnails',

  // Music
  artist_thumb: 'Artist Thumbnails',
  artist_logo: 'Artist Logos',
  artist_fanart: 'Artist Fanart',
  artist_banner: 'Artist Banners',
  album_thumb: 'Album Covers',
  album_cdart: 'CD Art',
  album_spine: 'Album Spines',
};

// Categorize asset types by media type
const getAssetCategory = (assetType: string): 'movie' | 'tv' | 'music' | null => {
  if (assetType.startsWith('movie_')) return 'movie';
  if (assetType.startsWith('tv_')) return 'tv';
  if (assetType.startsWith('artist_') || assetType.startsWith('album_')) return 'music';
  return null;
};

const CATEGORY_LABELS = {
  movie: 'Movies',
  tv: 'TV Shows',
  music: 'Music',
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

interface AssetTypePriorityModalProps {
  priority: AssetTypePriority;
  onClose: () => void;
  onSave: (providerOrder: string[]) => void;
  isSaving: boolean;
}

const AssetTypePriorityModal: React.FC<AssetTypePriorityModalProps> = ({
  priority,
  onClose,
  onSave,
  isSaving,
}) => {
  const filteredOrder = priority.providerOrder.filter(p => p !== 'local');
  const [providerOrder, setProviderOrder] = useState<string[]>(filteredOrder);

  const handleMoveProvider = (fromIndex: number, toIndex: number) => {
    const newOrder = [...providerOrder];
    const [movedItem] = newOrder.splice(fromIndex, 1);
    newOrder.splice(toIndex, 0, movedItem);
    setProviderOrder(newOrder);
  };

  const getOrdinal = (n: number): string => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  const hasChanges = JSON.stringify(providerOrder) !== JSON.stringify(filteredOrder);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl max-w-md w-full mx-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="asset-priority-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="mb-4">
            <h3 id="asset-priority-title" className="text-lg font-semibold text-white">
              {ASSET_TYPE_NAMES[priority.assetType] || priority.assetType}
            </h3>
            <p className="text-sm text-neutral-400 mt-1">
              Reorder providers by priority
            </p>
          </div>

          <div className="space-y-2 mb-6">
            {providerOrder.map((provider, index) => (
              <div
                key={provider}
                className="flex items-center gap-2 p-3 bg-neutral-900 rounded border border-neutral-700"
              >
                <div className="flex-shrink-0 w-12 text-center">
                  <span className="text-xs font-semibold text-primary-400">
                    {getOrdinal(index + 1)}
                  </span>
                </div>
                <div className="flex-1">
                  <span className="text-sm font-medium text-neutral-300">
                    {PROVIDER_NAMES[provider] || provider}
                  </span>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => handleMoveProvider(index, index - 1)}
                    disabled={index === 0}
                    className="p-1.5 rounded hover:bg-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    title="Move up"
                    aria-label="Move provider up in priority"
                  >
                    <svg className="w-4 h-4 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleMoveProvider(index, index + 1)}
                    disabled={index === providerOrder.length - 1}
                    className="p-1.5 rounded hover:bg-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    title="Move down"
                    aria-label="Move provider down in priority"
                  >
                    <svg className="w-4 h-4 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => onSave(providerOrder)}
              disabled={!hasChanges || isSaving}
              className="btn btn-primary flex-1"
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              onClick={onClose}
              disabled={isSaving}
              className="btn btn-secondary flex-1"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const AssetTypePriorityConfig: React.FC = () => {
  const { data: priorities = [], isLoading } = useAssetTypePriorities();
  const updatePriority = useUpdateAssetTypePriority();
  const [editingPriority, setEditingPriority] = useState<AssetTypePriority | null>(null);

  // Filter out Local provider and single-provider asset types
  const configurablePriorities = priorities
    .map(p => ({
      ...p,
      providerOrder: p.providerOrder.filter(provider => provider !== 'local'),
    }))
    .filter(p => p.providerOrder.length > 1);

  // Group by category
  const groupedPriorities = configurablePriorities.reduce((acc, priority) => {
    const category = getAssetCategory(priority.assetType);
    if (category) {
      if (!acc[category]) acc[category] = [];
      acc[category].push(priority);
    }
    return acc;
  }, {} as Record<string, AssetTypePriority[]>);

  const handleSave = async (providerOrder: string[]) => {
    if (!editingPriority) return;

    try {
      await updatePriority.mutateAsync({
        assetType: editingPriority.assetType,
        providerOrder,
      });
      setEditingPriority(null);
    } catch (error: any) {
      console.error('Failed to update priority:', error);
    }
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
    <>
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold text-white">Asset Selection Priority</h3>
          <p className="text-sm text-neutral-400 mt-1">
            Configure provider priority for each asset type
          </p>
        </div>

        <div className="p-4 bg-primary-900/20 border border-primary-700 rounded">
          <p className="text-sm text-primary-300">
            <span className="font-semibold">Quality Rule:</span> Higher quality assets (resolution, file size) always win. Priority order is only used as a tiebreaker when quality is equal.
          </p>
        </div>

        {/* Render each category */}
        {(['movie', 'tv', 'music'] as const).map((category, categoryIndex) => {
          const categoryPriorities = groupedPriorities[category] || [];
          if (categoryPriorities.length === 0) return null;

          return (
            <div key={category}>
              {categoryIndex > 0 && <hr className="border-neutral-700 my-6" />}

              <div className="mb-4">
                <h4 className="text-md font-semibold text-white">{CATEGORY_LABELS[category]}</h4>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {categoryPriorities.map((priority) => (
                  <button
                    key={priority.assetType}
                    onClick={() => setEditingPriority(priority)}
                    className="card card-body text-left hover:border-primary-600 transition-colors cursor-pointer p-4"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h5 className="font-semibold text-white text-sm">
                        {ASSET_TYPE_NAMES[priority.assetType] || priority.assetType}
                      </h5>
                      <svg
                        className="w-4 h-4 text-neutral-500 flex-shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        aria-hidden="true"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>

                    {/* Pills with arrows */}
                    <div className="flex flex-wrap items-center gap-2">
                      {priority.providerOrder.map((provider, idx) => (
                        <React.Fragment key={provider}>
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-primary-900/30 text-primary-300 border border-primary-700">
                            {PROVIDER_NAMES[provider] || provider}
                          </span>
                          {idx < priority.providerOrder.length - 1 && (
                            <svg className="w-3 h-3 text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          )}
                        </React.Fragment>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}

        {configurablePriorities.length === 0 && (
          <div className="card">
            <div className="card-body text-center py-12">
              <p className="text-neutral-500">
                No configurable asset types found. Asset types with only one provider are automatically configured.
              </p>
            </div>
          </div>
        )}
      </div>

      {editingPriority && (
        <AssetTypePriorityModal
          priority={editingPriority}
          onClose={() => setEditingPriority(null)}
          onSave={handleSave}
          isSaving={updatePriority.isPending}
        />
      )}
    </>
  );
};
