import React, { useState } from 'react';
import { useMetadataFieldPriorities, useUpdateMetadataFieldPriority } from '../../hooks/usePriorities';
import { MetadataFieldPriority } from '../../types/provider';

// Metadata field display names and descriptions
const METADATA_FIELD_INFO: Record<string, { name: string; description: string; category: 'video' | 'music' }> = {
  rating: { name: 'Rating', description: 'Movie/TV show rating score', category: 'video' },
  plot: { name: 'Plot Summary', description: 'Description and synopsis', category: 'video' },
  title: { name: 'Title', description: 'Media title', category: 'video' },
  original_title: { name: 'Original Title', description: 'Title in original language', category: 'video' },
  tagline: { name: 'Tagline', description: 'Short promotional tagline', category: 'video' },
  release_date: { name: 'Release Date', description: 'Air date or release date', category: 'video' },
  genre_video: { name: 'Genres (Movies/TV)', description: 'Genre classifications for movies and TV shows', category: 'video' },
  genre_music: { name: 'Genres (Music)', description: 'Genre classifications for music', category: 'music' },
  cast: { name: 'Cast', description: 'Actors and characters', category: 'video' },
  crew: { name: 'Crew', description: 'Directors, writers, producers', category: 'video' },
};

const CATEGORY_LABELS = {
  video: 'Movies & TV Shows',
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

interface MetadataFieldPriorityModalProps {
  priority: MetadataFieldPriority;
  onClose: () => void;
  onSave: (providerOrder: string[]) => void;
  isSaving: boolean;
}

const MetadataFieldPriorityModal: React.FC<MetadataFieldPriorityModalProps> = ({
  priority,
  onClose,
  onSave,
  isSaving,
}) => {
  const filteredOrder = priority.providerOrder.filter(p => p !== 'local');
  const [providerOrder, setProviderOrder] = useState<string[]>(filteredOrder);
  const fieldInfo = METADATA_FIELD_INFO[priority.fieldName] || { name: priority.fieldName, description: '', category: 'video' as const };

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
        aria-labelledby="metadata-priority-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="mb-4">
            <h3 id="metadata-priority-title" className="text-lg font-semibold text-white">
              {fieldInfo.name}
            </h3>
            <p className="text-sm text-neutral-400 mt-1">
              {fieldInfo.description}
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

export const MetadataFieldPriorityConfig: React.FC = () => {
  const { data: priorities = [], isLoading } = useMetadataFieldPriorities();
  const updatePriority = useUpdateMetadataFieldPriority();
  const [editingPriority, setEditingPriority] = useState<MetadataFieldPriority | null>(null);

  // Filter out Local provider, forced fields, and single-provider fields
  const configurablePriorities = priorities
    .filter(p => !p.forcedProvider)
    .map(p => ({
      ...p,
      providerOrder: p.providerOrder.filter(provider => provider !== 'local'),
    }))
    .filter(p => p.providerOrder.length > 1);

  // Group by category (video vs music)
  const groupedPriorities = configurablePriorities.reduce((acc, priority) => {
    const fieldInfo = METADATA_FIELD_INFO[priority.fieldName];
    const category = fieldInfo?.category || 'video';
    if (!acc[category]) acc[category] = [];
    acc[category].push(priority);
    return acc;
  }, {} as Record<string, MetadataFieldPriority[]>);

  const handleSave = async (providerOrder: string[]) => {
    if (!editingPriority) return;

    try {
      await updatePriority.mutateAsync({
        fieldName: editingPriority.fieldName,
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
          <p className="text-neutral-400">Loading metadata field priorities...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold text-white">Metadata Selection Priority</h3>
          <p className="text-sm text-neutral-400 mt-1">
            Choose which provider to trust for each metadata field
          </p>
        </div>

        <div className="p-4 bg-neutral-800/50 border border-neutral-700 rounded">
          <p className="text-sm text-neutral-400">
            <span className="font-semibold text-neutral-300">Technical fields</span> (runtime, codecs, resolution, etc.) are always sourced from local file analysis and are not configurable.
          </p>
        </div>

        {/* Render each category */}
        {(['video', 'music'] as const).map((category, categoryIndex) => {
          const categoryPriorities = groupedPriorities[category] || [];
          if (categoryPriorities.length === 0) return null;

          return (
            <div key={category}>
              {categoryIndex > 0 && <hr className="border-neutral-700 my-6" />}

              <div className="mb-4">
                <h4 className="text-md font-semibold text-white">{CATEGORY_LABELS[category]}</h4>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {categoryPriorities.map((priority) => {
                  const fieldInfo = METADATA_FIELD_INFO[priority.fieldName] || { name: priority.fieldName, description: '', category: 'video' as const };
                  return (
                    <button
                      key={priority.fieldName}
                      onClick={() => setEditingPriority(priority)}
                      className="card card-body text-left hover:border-primary-600 transition-colors cursor-pointer p-4"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <h5 className="font-semibold text-white text-sm">
                            {fieldInfo.name}
                          </h5>
                          <p className="text-xs text-neutral-500 mt-0.5">
                            {fieldInfo.description}
                          </p>
                        </div>
                        <svg
                          className="w-4 h-4 text-neutral-500 flex-shrink-0 ml-2"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          aria-hidden="true"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>

                      {/* Pills with arrows */}
                      <div className="flex flex-wrap items-center gap-2 mt-2">
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
                  );
                })}
              </div>
            </div>
          );
        })}

        {configurablePriorities.length === 0 && (
          <div className="card">
            <div className="card-body text-center py-12">
              <p className="text-neutral-500">
                No configurable metadata fields found. Fields with only one provider are automatically configured.
              </p>
            </div>
          </div>
        )}
      </div>

      {editingPriority && (
        <MetadataFieldPriorityModal
          priority={editingPriority}
          onClose={() => setEditingPriority(null)}
          onSave={handleSave}
          isSaving={updatePriority.isPending}
        />
      )}
    </>
  );
};
