import React from 'react';
import { useAutoSelectionStrategy, useSetAutoSelectionStrategy } from '../../hooks/useAutoSelection';
import { AutoSelectionStrategy } from '../../types/provider';

interface AutoSelectionStrategyToggleProps {
  onStrategyChange?: (strategy: AutoSelectionStrategy) => void;
}

export const AutoSelectionStrategyToggle: React.FC<AutoSelectionStrategyToggleProps> = ({
  onStrategyChange,
}) => {
  const { data: currentStrategy, isLoading } = useAutoSelectionStrategy();
  const setStrategy = useSetAutoSelectionStrategy();

  const handleStrategyChange = async (strategy: AutoSelectionStrategy) => {
    try {
      await setStrategy.mutateAsync(strategy);
      onStrategyChange?.(strategy);
    } catch (error) {
      console.error('Failed to set auto-selection strategy:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="card">
        <div className="card-body">
          <div className="animate-pulse">
            <div className="h-6 bg-neutral-700 rounded w-1/4 mb-4"></div>
            <div className="h-4 bg-neutral-700 rounded w-1/2"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-body">
        <h2 className="text-xl font-semibold text-white mb-2">Auto-Selection Strategy</h2>
        <p className="text-sm text-neutral-400 mb-6">
          Configure how Metarr automatically selects assets and metadata during enrichment (webhooks, scans, refreshes)
        </p>

        <div className="space-y-4">
          {/* Balanced Strategy */}
          <label
            className={`flex items-start gap-4 p-4 rounded-lg border-2 transition-all cursor-pointer ${
              currentStrategy === 'balanced'
                ? 'border-primary-500 bg-primary-900/20'
                : 'border-neutral-700 bg-neutral-800/50 hover:border-neutral-600'
            }`}
          >
            <input
              type="radio"
              name="strategy"
              value="balanced"
              checked={currentStrategy === 'balanced'}
              onChange={(e) => handleStrategyChange(e.target.value as AutoSelectionStrategy)}
              disabled={setStrategy.isPending}
              className="mt-1 w-5 h-5 text-primary-500 border-neutral-600 focus:ring-2 focus:ring-primary-500 focus:ring-offset-0"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg font-medium text-white">Balanced</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary-900/30 text-primary-300 border border-primary-700">
                  Recommended
                </span>
              </div>
              <p className="text-sm text-neutral-300 mb-2">
                Smart defaults based on quality and completeness. No configuration needed.
              </p>
              <div className="text-xs text-neutral-400 space-y-1">
                <div>• Assets: FanArt.tv first (highest quality), then TMDB/TVDB as fallback</div>
                <div>• Metadata: Best available source for each field</div>
                <div>• Technical fields: Always from local file analysis</div>
                <div>• Perfect for most users who want quality without complexity</div>
              </div>
            </div>
          </label>

          {/* Custom Strategy */}
          <label
            className={`flex items-start gap-4 p-4 rounded-lg border-2 transition-all cursor-pointer ${
              currentStrategy === 'custom'
                ? 'border-primary-500 bg-primary-900/20'
                : 'border-neutral-700 bg-neutral-800/50 hover:border-neutral-600'
            }`}
          >
            <input
              type="radio"
              name="strategy"
              value="custom"
              checked={currentStrategy === 'custom'}
              onChange={(e) => handleStrategyChange(e.target.value as AutoSelectionStrategy)}
              disabled={setStrategy.isPending}
              className="mt-1 w-5 h-5 text-primary-500 border-neutral-600 focus:ring-2 focus:ring-primary-500 focus:ring-offset-0"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg font-medium text-white">Custom</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-neutral-800 text-neutral-400 border border-neutral-700">
                  Advanced
                </span>
              </div>
              <p className="text-sm text-neutral-300 mb-2">
                Full control over provider priorities for each asset type and metadata field.
              </p>
              <div className="text-xs text-neutral-400 space-y-1">
                <div>• Configure priorities per asset type (posters, fanart, logos, etc.)</div>
                <div>• Configure priorities per metadata field (title, plot, cast, etc.)</div>
                <div>• Separate settings for Movies, TV Shows, and Music</div>
                <div>• For power users who want maximum control</div>
              </div>
            </div>
          </label>
        </div>

        {setStrategy.isPending && (
          <div className="mt-4 flex items-center gap-2 text-sm text-neutral-400">
            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Saving strategy...
          </div>
        )}

        {currentStrategy === 'custom' && (
          <div className="mt-6 p-4 bg-blue-900/20 border border-blue-800 rounded-lg">
            <p className="text-sm text-blue-300">
              <strong>Custom mode active.</strong> Use the configuration sections below to set your provider priorities.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
