import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFilm, faTv, faMusic, faQuestionCircle, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { dataSelectionApi, providerApi } from '../../utils/api';
import { ProviderPriorityEditor } from '../../components/provider/ProviderPriorityEditor';
import type { DataSelectionConfig, ProviderWithMetadata } from '../../types/provider';

type SelectionMode = 'balanced' | 'custom';
type MediaType = 'movies' | 'tvshows' | 'music';

export const DataSelection: React.FC = () => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<MediaType>('movies');
  const [showModeHelp, setShowModeHelp] = useState(false);

  // Fetch data selection config
  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: ['dataSelection'],
    queryFn: () => dataSelectionApi.getConfig(),
  });

  // Fetch all providers to get display names
  const { data: providersData } = useQuery({
    queryKey: ['providers'],
    queryFn: () => providerApi.getAll(),
  });

  // Update mode mutation
  const updateModeMutation = useMutation({
    mutationFn: (mode: SelectionMode) => dataSelectionApi.updateMode(mode),
    onSuccess: (newConfig) => {
      queryClient.setQueryData(['dataSelection'], newConfig);
    },
  });

  const handleModeChange = (newMode: SelectionMode) => {
    updateModeMutation.mutate(newMode);
  };

  if (configLoading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <FontAwesomeIcon icon={faSpinner} className="w-8 h-8 text-primary-400 animate-spin" />
      </div>
    );
  }

  if (!config) {
    return (
      <div className="p-6">
        <div className="text-center text-neutral-400">Failed to load data selection configuration</div>
      </div>
    );
  }

  const mode = config.mode;
  const providers = providersData?.providers || [];

  return (
    <div className="p-6">
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Data Selection</h1>
        <p className="text-sm text-neutral-400 mt-1">
          Configure provider priorities for metadata and images
        </p>
      </div>

      {/* Mode Selection */}
      <div className="mb-6 p-4 bg-neutral-800 border border-neutral-700 rounded-lg">
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-neutral-300">Mode:</label>

          <div className="flex gap-4" role="radiogroup" aria-label="Data selection mode">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                value="balanced"
                checked={mode === 'balanced'}
                onChange={(e) => handleModeChange(e.target.value as SelectionMode)}
                disabled={updateModeMutation.isPending}
                className="w-4 h-4 text-primary-500 border-neutral-600 focus:ring-2 focus:ring-primary-500 focus:ring-offset-0"
              />
              <span className="text-sm text-neutral-300">Balanced</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                value="custom"
                checked={mode === 'custom'}
                onChange={(e) => handleModeChange(e.target.value as SelectionMode)}
                disabled={updateModeMutation.isPending}
                className="w-4 h-4 text-primary-500 border-neutral-600 focus:ring-2 focus:ring-primary-500 focus:ring-offset-0"
              />
              <span className="text-sm text-neutral-300">Custom</span>
            </label>
          </div>

          <button
            onClick={() => setShowModeHelp(true)}
            className="text-neutral-400 hover:text-primary-400 transition-colors"
            title="Learn about modes"
          >
            <FontAwesomeIcon icon={faQuestionCircle} className="w-4 h-4" />
          </button>

          {updateModeMutation.isPending && (
            <FontAwesomeIcon icon={faSpinner} className="w-4 h-4 text-primary-400 animate-spin" />
          )}
        </div>

        {/* Current mode description */}
        <p className="text-xs text-neutral-400 mt-2">
          {mode === 'balanced'
            ? 'Using optimized defaults - best for most users'
            : 'Custom provider priorities - full control over data selection'}
        </p>
      </div>

      {/* Media Type Tabs */}
      <div className="mb-6 border-b border-neutral-700">
        <nav className="flex gap-1" role="tablist" aria-label="Media type tabs">
          <button
            id="tab-movies"
            role="tab"
            aria-selected={activeTab === 'movies'}
            aria-controls="tabpanel-movies"
            onClick={() => setActiveTab('movies')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'movies'
                ? 'border-primary-500 text-primary-400'
                : 'border-transparent text-neutral-400 hover:text-neutral-300'
            }`}
          >
            <FontAwesomeIcon icon={faFilm} />
            <span>Movies</span>
          </button>

          <button
            id="tab-tvshows"
            role="tab"
            aria-selected={activeTab === 'tvshows'}
            aria-controls="tabpanel-tvshows"
            onClick={() => setActiveTab('tvshows')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'tvshows'
                ? 'border-primary-500 text-primary-400'
                : 'border-transparent text-neutral-400 hover:text-neutral-300'
            }`}
          >
            <FontAwesomeIcon icon={faTv} />
            <span>TV Shows</span>
          </button>

          <button
            id="tab-music"
            role="tab"
            aria-selected={activeTab === 'music'}
            aria-controls="tabpanel-music"
            onClick={() => setActiveTab('music')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'music'
                ? 'border-primary-500 text-primary-400'
                : 'border-transparent text-neutral-400 hover:text-neutral-300'
            }`}
          >
            <FontAwesomeIcon icon={faMusic} />
            <span>Music</span>
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      <div
        id={`tabpanel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`tab-${activeTab}`}
        className="space-y-6"
      >
        {/* Metadata Priority Section */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-4">Metadata Priority</h2>
          <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-4">
            {mode === 'balanced' ? (
              <BalancedModeDisplay
                category="metadata"
                mediaType={activeTab}
                providers={providers}
              />
            ) : (
              <CustomModeEditor
                category="metadata"
                mediaType={activeTab}
                config={config}
                providers={providers}
              />
            )}
          </div>
        </div>

        <hr className="border-neutral-700" />

        {/* Image Priority Section */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-4">Image Priority</h2>
          <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-4">
            {mode === 'balanced' ? (
              <BalancedModeDisplay
                category="images"
                mediaType={activeTab}
                providers={providers}
              />
            ) : (
              <CustomModeEditor
                category="images"
                mediaType={activeTab}
                config={config}
                providers={providers}
              />
            )}
          </div>
        </div>
      </div>

      {/* Mode Help Modal */}
      {showModeHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowModeHelp(false)}>
          <div
            className="bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl max-w-md w-full mx-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mode-help-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 id="mode-help-title" className="text-lg font-semibold text-white">Selection Modes</h3>
                <button
                  onClick={() => setShowModeHelp(false)}
                  className="text-neutral-400 hover:text-white transition-colors"
                  aria-label="Close dialog"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <h4 className="font-medium text-primary-400 mb-2">Balanced Mode</h4>
                  <p className="text-sm text-neutral-300">
                    Uses optimized default priorities for all metadata and images. Best for most users who want a "just works" experience without configuration.
                  </p>
                  <ul className="text-xs text-neutral-400 mt-2 ml-4 list-disc space-y-1">
                    <li>Pre-configured provider priorities</li>
                    <li>Optimized for quality and reliability</li>
                    <li>No manual configuration needed</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-medium text-primary-400 mb-2">Custom Mode</h4>
                  <p className="text-sm text-neutral-300">
                    Full control over provider priorities for each metadata field and image type. Configure exactly which providers to use and in what order.
                  </p>
                  <ul className="text-xs text-neutral-400 mt-2 ml-4 list-disc space-y-1">
                    <li>Per-field provider ordering</li>
                    <li>Disable specific providers for specific data</li>
                    <li>Advanced users only</li>
                  </ul>
                </div>

                <div className="p-3 bg-neutral-900/50 border border-neutral-700 rounded">
                  <p className="text-xs text-neutral-400">
                    <span className="font-semibold text-primary-400">Note:</span> Custom settings are preserved when switching modes. You can safely toggle between modes without losing your configuration.
                  </p>
                </div>
              </div>

              <div className="mt-6">
                <button
                  onClick={() => setShowModeHelp(false)}
                  className="btn btn-primary w-full"
                >
                  Got it
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Display balanced mode defaults
 */
const BalancedModeDisplay: React.FC<{
  category: 'metadata' | 'images';
  mediaType: MediaType;
  providers: ProviderWithMetadata[];
}> = ({ category, mediaType, providers }) => {
  // Fetch balanced defaults for a sample field
  const sampleField = category === 'metadata' ? 'title' : 'poster';

  const { data: providerOrder, isLoading } = useQuery({
    queryKey: ['providerOrder', category, mediaType, sampleField],
    queryFn: () => dataSelectionApi.getProviderOrder(category, mediaType, sampleField),
  });

  if (isLoading) {
    return (
      <div className="text-center py-8 text-neutral-400">
        <FontAwesomeIcon icon={faSpinner} className="w-6 h-6 animate-spin mb-2" />
        <p>Loading balanced defaults...</p>
      </div>
    );
  }

  const getProviderDisplayName = (name: string) => {
    const provider = providers.find(p => p.config.providerName === name);
    return provider?.metadata.displayName || name;
  };

  return (
    <div className="space-y-4">
      <div className="text-center py-4">
        <p className="text-sm text-neutral-300 mb-4">
          Using balanced defaults for {mediaType} {category}
        </p>
        <div className="flex items-center justify-center gap-2">
          {providerOrder?.map((providerName, index) => (
            <React.Fragment key={providerName}>
              <div className="px-3 py-1 bg-neutral-700 rounded text-sm text-neutral-200">
                {getProviderDisplayName(providerName)}
              </div>
              {index < providerOrder.length - 1 && (
                <span className="text-neutral-500">→</span>
              )}
            </React.Fragment>
          ))}
        </div>
        <p className="text-xs text-neutral-400 mt-4">
          Switch to Custom mode to configure provider priorities
        </p>
      </div>
    </div>
  );
};

/**
 * Custom mode priority editor
 */
const CustomModeEditor: React.FC<{
  category: 'metadata' | 'images';
  mediaType: MediaType;
  config: DataSelectionConfig;
  providers: ProviderWithMetadata[];
}> = ({ category, mediaType, config, providers }) => {
  const queryClient = useQueryClient();

  // Define sample fields for each media type and category
  const getFieldsForType = (type: MediaType, cat: 'metadata' | 'images'): string[] => {
    if (cat === 'metadata') {
      if (type === 'movies') return ['title', 'plot', 'rating', 'year', 'runtime'];
      if (type === 'tvshows') return ['title', 'plot', 'rating', 'network', 'status'];
      if (type === 'music') return ['artist', 'album', 'genre', 'year'];
    } else {
      if (type === 'movies') return ['poster', 'fanart', 'banner', 'clearlogo', 'clearart'];
      if (type === 'tvshows') return ['poster', 'fanart', 'banner', 'clearlogo', 'characterart'];
      if (type === 'music') return ['artistthumb', 'artistlogo', 'albumcover', 'cdart'];
    }
    return [];
  };

  const fields = getFieldsForType(mediaType, category);
  const [selectedField, setSelectedField] = useState(fields[0]);

  // Get current priority for selected field
  const fieldKey = `${mediaType}.${selectedField}`;
  const priorities = category === 'metadata' ? config.customMetadataPriorities : config.customImagePriorities;
  const currentPriority = priorities[fieldKey];

  // Fetch provider order for this field
  const { data: providerOrder, isLoading } = useQuery({
    queryKey: ['providerOrder', category, mediaType, selectedField],
    queryFn: () => dataSelectionApi.getProviderOrder(category, mediaType, selectedField),
  });

  const handleSave = async (newProviderOrder: string[], newDisabled: string[]) => {
    await dataSelectionApi.updateFieldPriority(
      mediaType,
      category,
      selectedField,
      newProviderOrder,
      newDisabled
    );

    // Invalidate cache
    queryClient.invalidateQueries(['dataSelection']);
    queryClient.invalidateQueries(['providerOrder', category, mediaType, selectedField]);
  };

  if (isLoading) {
    return (
      <div className="text-center py-8 text-neutral-400">
        <FontAwesomeIcon icon={faSpinner} className="w-6 h-6 animate-spin mb-2" />
        <p>Loading configuration...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Field Selector */}
      <div>
        <label className="block text-sm font-medium text-neutral-300 mb-2">
          Select Field
        </label>
        <div className="flex flex-wrap gap-2">
          {fields.map((field) => (
            <button
              key={field}
              onClick={() => setSelectedField(field)}
              className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
                selectedField === field
                  ? 'bg-primary-600 text-white'
                  : 'bg-neutral-700 text-neutral-300 hover:bg-neutral-600'
              }`}
            >
              {field.charAt(0).toUpperCase() + field.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Priority Editor */}
      {providerOrder && (
        <ProviderPriorityEditor
          providers={providers}
          initialOrder={providerOrder}
          initialDisabled={currentPriority?.disabled || []}
          onSave={handleSave}
          fieldName={selectedField}
          category={category}
        />
      )}
    </div>
  );
};
