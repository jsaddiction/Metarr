import React, { useState } from 'react';
import { useMetadataFieldPriorities, useUpdateMetadataFieldPriority } from '../../hooks/usePriorities';

// Metadata field display names and descriptions
const METADATA_FIELD_INFO: Record<string, { name: string; description: string }> = {
  rating: { name: 'Rating', description: 'Movie/TV show rating score' },
  plot: { name: 'Plot Summary', description: 'Description and synopsis' },
  title: { name: 'Title', description: 'Media title' },
  original_title: { name: 'Original Title', description: 'Title in original language' },
  tagline: { name: 'Tagline', description: 'Short promotional tagline' },
  release_date: { name: 'Release Date', description: 'Air date or release date' },
  genres: { name: 'Genres', description: 'Genre classifications' },
  cast: { name: 'Cast', description: 'Actors and characters' },
  crew: { name: 'Crew', description: 'Directors, writers, producers' },
  runtime: { name: 'Runtime', description: 'Duration (forced to Local)' },
  video_codec: { name: 'Video Codec', description: 'Video encoding (forced to Local)' },
  audio_codec: { name: 'Audio Codec', description: 'Audio encoding (forced to Local)' },
  resolution: { name: 'Resolution', description: 'Video resolution (forced to Local)' },
  aspect_ratio: { name: 'Aspect Ratio', description: 'Display aspect ratio (forced to Local)' },
  bitrate: { name: 'Bitrate', description: 'Video bitrate (forced to Local)' },
  framerate: { name: 'Framerate', description: 'Frames per second (forced to Local)' },
  audio_channels: { name: 'Audio Channels', description: 'Audio channel count (forced to Local)' },
  duration: { name: 'Duration', description: 'Total duration (forced to Local)' },
  file_size: { name: 'File Size', description: 'Media file size (forced to Local)' },
  container_format: { name: 'Container Format', description: 'File container (forced to Local)' },
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

export const MetadataFieldPriorityConfig: React.FC = () => {
  const { data: priorities = [], isLoading } = useMetadataFieldPriorities();
  const updatePriority = useUpdateMetadataFieldPriority();

  const [expandedField, setExpandedField] = useState<string | null>(null);
  const [editingOrder, setEditingOrder] = useState<Record<string, string[]>>({});

  // Filter out Local provider from priorities (it's infrastructure, only for technical fields)
  const filterLocalProvider = (providerOrder: string[]): string[] => {
    return providerOrder.filter(p => p !== 'local');
  };

  // Hide forced fields entirely (they're always Local, user has no choice)
  const configurableFields = priorities.filter(p => !p.forcedProvider);

  const handleExpandToggle = (fieldName: string) => {
    if (expandedField === fieldName) {
      setExpandedField(null);
      // Clear editing state
      const newEditingOrder = { ...editingOrder };
      delete newEditingOrder[fieldName];
      setEditingOrder(newEditingOrder);
    } else {
      setExpandedField(fieldName);
      // Initialize editing state with current order (filtered)
      const priority = configurableFields.find(p => p.fieldName === fieldName);
      if (priority) {
        const filtered = filterLocalProvider(priority.providerOrder);
        setEditingOrder({ ...editingOrder, [fieldName]: [...filtered] });
      }
    }
  };

  const handleMoveProvider = (fieldName: string, fromIndex: number, toIndex: number) => {
    const currentOrder = editingOrder[fieldName] || [];
    const newOrder = [...currentOrder];
    const [movedItem] = newOrder.splice(fromIndex, 1);
    newOrder.splice(toIndex, 0, movedItem);
    setEditingOrder({ ...editingOrder, [fieldName]: newOrder });
  };

  const handleSave = async (fieldName: string) => {
    const newOrder = editingOrder[fieldName];
    if (!newOrder) return;

    try {
      await updatePriority.mutateAsync({ fieldName, providerOrder: newOrder });
      setExpandedField(null);
      const newEditingOrder = { ...editingOrder };
      delete newEditingOrder[fieldName];
      setEditingOrder(newEditingOrder);
    } catch (error: any) {
      console.error('Failed to update priority:', error);
    }
  };

  const handleCancel = (fieldName: string) => {
    setExpandedField(null);
    const newEditingOrder = { ...editingOrder };
    delete newEditingOrder[fieldName];
    setEditingOrder(newEditingOrder);
  };

  const renderFieldRow = (priority: any) => {
    const isExpanded = expandedField === priority.fieldName;
    const filteredOrder = filterLocalProvider(priority.providerOrder);
    const currentOrder = editingOrder[priority.fieldName] || filteredOrder;
    const hasChanges = editingOrder[priority.fieldName] !== undefined;
    const fieldInfo = METADATA_FIELD_INFO[priority.fieldName] || { name: priority.fieldName, description: '' };

    return (
      <div key={priority.fieldName} className="border border-neutral-700 rounded-lg overflow-hidden">
        {/* Header */}
        <button
          onClick={() => handleExpandToggle(priority.fieldName)}
          className="w-full p-3 bg-neutral-800/50 hover:bg-neutral-800 flex items-center justify-between transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="flex-1 text-left">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-white">
                  {fieldInfo.name}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-neutral-500">
                  {filteredOrder.slice(0, 3).map((p: string, idx: number) => (
                    <span key={p}>
                      {idx > 0 && ' → '}
                      {PROVIDER_NAMES[p] || p}
                    </span>
                  ))}
                  {filteredOrder.length > 3 && ` (+${filteredOrder.length - 3} more)`}
                </span>
              </div>
              {fieldInfo.description && (
                <p className="text-xs text-neutral-600 mt-0.5">{fieldInfo.description}</p>
              )}
            </div>
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
              {currentOrder.map((provider: string, index: number) => (
                <DraggableProviderItem
                  key={provider}
                  provider={provider}
                  index={index}
                  onMoveUp={() => handleMoveProvider(priority.fieldName, index, index - 1)}
                  onMoveDown={() => handleMoveProvider(priority.fieldName, index, index + 1)}
                  isFirst={index === 0}
                  isLast={index === currentOrder.length - 1}
                />
              ))}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => handleSave(priority.fieldName)}
                disabled={!hasChanges || updatePriority.isPending}
                className="btn btn-primary flex-1"
              >
                {updatePriority.isPending ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                onClick={() => handleCancel(priority.fieldName)}
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
    <div className="card">
      <div className="card-body">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-white">Metadata Selection Priority</h3>
          <p className="text-sm text-neutral-400 mt-1">
            Choose which provider to trust for each metadata field
          </p>
        </div>

        {/* Info notice about technical fields */}
        <div className="mb-4 p-3 bg-neutral-800/50 border border-neutral-700 rounded">
          <p className="text-xs text-neutral-400">
            <span className="font-semibold text-neutral-300">Technical fields</span> (runtime, codecs, resolution, etc.) are always sourced from local file analysis and are not configurable.
          </p>
        </div>

        {/* Configurable Fields */}
        {configurableFields.length > 0 && (
          <div className="space-y-2">
            {configurableFields.map((priority) => renderFieldRow(priority))}
          </div>
        )}

        {configurableFields.length === 0 && (
          <p className="text-center text-neutral-500 py-8">
            No metadata field priorities configured
          </p>
        )}
      </div>
    </div>
  );
};
