/**
 * AssetSelectionModal Component
 *
 * Full-viewport modal with split-pane layout for asset selection.
 * Left Pane (30%): Current selection with large preview
 * Right Pane (70%): Candidate grid with filters and sorting
 *
 * Design Philosophy:
 * - Desktop-first (optimized for 1920x1080+ screens)
 * - Visual-first decision making (large previews, minimal metadata)
 * - Instant feedback (no loading spinners for local actions)
 */

import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faTimes,
  faLock,
  faLockOpen,
  faTrash,
  faSpinner,
  faExclamationTriangle,
} from '@fortawesome/free-solid-svg-icons';
import { useAssetCandidates } from '../../hooks/useAssetCandidates';
import type { AssetCandidate } from '../../types/asset';
import type { AssetType } from '../../types/asset';
import { useConfirm } from '../../hooks/useConfirm';

interface AssetSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  assetType: AssetType;
  assetTypeLabel: string;
  movieTitle: string;
  movieId: number;
  currentAssetUrl?: string;
  currentAssetId?: number;
  providerResults?: any; // Provider results from parent
  isLoadingProviders?: boolean;
  providerError?: Error | null;
}

export const AssetSelectionModal: React.FC<AssetSelectionModalProps> = ({
  isOpen,
  onClose,
  assetType,
  assetTypeLabel,
  movieTitle,
  movieId,
  currentAssetUrl,
  currentAssetId,
  providerResults,
  isLoadingProviders = false,
  providerError,
}) => {
  // Accessible confirmation dialog
  const { confirm, ConfirmDialog } = useConfirm();

  // State
  const [selectedCandidate, setSelectedCandidate] = useState<AssetCandidate | null>(null);
  const [providerFilter, setProviderFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('votes');

  // Extract candidates from provider results
  const candidates: AssetCandidate[] = React.useMemo(() => {
    if (!providerResults || !providerResults.providers) return [];

    const allCandidates: AssetCandidate[] = [];

    // Iterate through each provider's results
    for (const [providerName, providerData] of Object.entries(providerResults.providers)) {
      if (providerData && (providerData as any).images?.[assetType]) {
        const assets = (providerData as any).images[assetType];
        allCandidates.push(...assets);
      }
    }

    return allCandidates;
  }, [providerResults, assetType]);

  // Close modal on ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onClose]);

  // Reset selection when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedCandidate(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Handle apply selection - just close modal
  // Parent component (ImagesTab) will handle actual selection via replaceAssets API
  const handleApply = () => {
    if (selectedCandidate) {
      // TODO: Pass selected candidate back to parent component
      console.log('Selected candidate:', selectedCandidate);
      onClose();
    }
  };

  // Handle remove current selection
  const handleRemove = async () => {
    const confirmed = await confirm({
      title: 'Remove Asset',
      description: 'Remove this asset? You can select a new one from the candidates.',
      confirmText: 'Remove',
      cancelText: 'Cancel',
      variant: 'destructive',
    });

    if (!confirmed) {
      return;
    }

    // TODO: Implement reset asset endpoint
    console.log('Remove asset not yet implemented');
  };

  // Filter and sort candidates
  const filteredCandidates = candidates
    .filter(c => providerFilter === 'all' || c.provider === providerFilter)
    .sort((a, b) => {
      if (sortBy === 'votes') return (b.vote_count || 0) - (a.vote_count || 0);
      if (sortBy === 'resolution') return (b.width || 0) - (a.width || 0);
      return 0;
    });

  // Get unique providers for filter
  const providers = Array.from(new Set(candidates.map(c => c.provider)));

  // Determine what to show in left pane
  const displayAsset = selectedCandidate || (currentAssetUrl ? {
    url: currentAssetUrl,
    provider: 'Current',
    width: null,
    height: null,
    vote_count: null,
  } : null);

  return (
    <div
      className="fixed inset-0 z-50 flex bg-black/80"
      onClick={onClose}
    >
      {/* Modal content - offset by sidebar (left: 14rem = 224px = w-56) and header (top: 3.5rem = 56px = h-14) */}
      <div
        className="flex-1 flex ml-56 mt-14"
        onClick={(e) => e.stopPropagation()}
      >
        {/* LEFT PANE - Current Selection (30%) */}
        <div className="w-[30%] min-w-[320px] bg-neutral-900 border-r border-neutral-700 p-6 overflow-y-auto">
          <h3 className="text-lg font-semibold text-white mb-4">Current Selection</h3>

          {displayAsset ? (
            <div className="space-y-4">
              {/* Large Preview */}
              <div className="relative">
                <img
                  src={'url' in displayAsset ? displayAsset.url : (displayAsset as AssetCandidate).url}
                  alt="Preview"
                  className="w-full rounded-lg border border-neutral-700 object-contain"
                />
              </div>

              {/* Metadata */}
              <div className="space-y-2 text-sm">
                {'provider' in displayAsset && displayAsset.provider && (
                  <div className="flex justify-between">
                    <span className="text-neutral-400">Provider:</span>
                    <span className="text-white">{displayAsset.provider}</span>
                  </div>
                )}

                {displayAsset.width && displayAsset.height && (
                  <div className="flex justify-between">
                    <span className="text-neutral-400">Resolution:</span>
                    <span className="text-white">
                      {displayAsset.width} × {displayAsset.height}
                    </span>
                  </div>
                )}

                {displayAsset.vote_count !== null && displayAsset.vote_count !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-neutral-400">Votes:</span>
                    <span className="text-white">{displayAsset.vote_count}</span>
                  </div>
                )}

                {displayAsset.vote_average !== null && displayAsset.vote_average !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-neutral-400">Rating:</span>
                    <span className="text-white">{displayAsset.vote_average.toFixed(1)}</span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              {!selectedCandidate && currentAssetId && (
                <div className="flex flex-col gap-2 mt-4">
                  <button
                    onClick={handleRemove}
                    className="w-full px-4 py-2 rounded bg-neutral-700 hover:bg-neutral-600 text-white transition-colors flex items-center justify-center gap-2"
                  >
                    <FontAwesomeIcon icon={faTrash} />
                    Remove
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-neutral-500">
              <div className="text-6xl mb-4">⬜</div>
              <div className="text-center">
                <div className="font-medium mb-1">No {assetTypeLabel.toLowerCase()} selected</div>
                <div className="text-sm">Select from candidates →</div>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT PANE - Candidates Grid (70%) */}
        <div className="flex-1 bg-neutral-800 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-neutral-700">
            <h2 className="text-xl font-semibold text-white">
              Select {assetTypeLabel} for {movieTitle}
            </h2>
            <button
              onClick={onClose}
              className="w-10 h-10 flex items-center justify-center rounded hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors"
              aria-label="Close modal"
            >
              <FontAwesomeIcon icon={faTimes} />
            </button>
          </div>

          {/* Filters & Sort Bar */}
          <div className="flex items-center gap-4 p-4 border-b border-neutral-700">
            <select
              value={providerFilter}
              onChange={(e) => setProviderFilter(e.target.value)}
              className="bg-neutral-900 border border-neutral-700 rounded px-3 py-2 text-sm text-white"
            >
              <option value="all">All Providers</option>
              {providers.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-neutral-900 border border-neutral-700 rounded px-3 py-2 text-sm text-white"
            >
              <option value="votes">Sort by Votes</option>
              <option value="resolution">Sort by Resolution</option>
            </select>

            <div className="ml-auto text-sm text-neutral-400">
              {filteredCandidates.length} candidates
            </div>
          </div>

          {/* Candidates Grid */}
          <div className="flex-1 overflow-y-auto p-4">
            {isLoadingProviders ? (
              <div className="flex flex-col items-center justify-center h-64">
                <FontAwesomeIcon icon={faSpinner} spin className="text-4xl text-primary-500 mb-4" />
                <div className="text-neutral-400">Fetching from providers...</div>
                <div className="text-sm text-neutral-500 mt-2">This may take a few seconds</div>
              </div>
            ) : providerError ? (
              <div className="bg-error/20 border border-error rounded-md p-4">
                <div className="flex items-center gap-3">
                  <FontAwesomeIcon icon={faExclamationTriangle} className="text-error text-xl" />
                  <div>
                    <h4 className="font-semibold text-white mb-1">Failed to fetch from providers</h4>
                    <p className="text-sm text-neutral-300">
                      {providerError instanceof Error ? providerError.message : 'Unknown error'}
                    </p>
                  </div>
                </div>
              </div>
            ) : filteredCandidates.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-neutral-500">
                <div className="text-4xl mb-4">📭</div>
                <div>No candidates found</div>
              </div>
            ) : (
              <div className="grid grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                {filteredCandidates.map(candidate => (
                  <button
                    key={candidate.id}
                    onClick={() => setSelectedCandidate(candidate)}
                    className={`
                      relative group rounded-lg overflow-hidden border-2 transition-all
                      ${selectedCandidate?.id === candidate.id
                        ? 'border-primary-500 ring-2 ring-primary-500/50'
                        : 'border-neutral-700 hover:border-neutral-500'
                      }
                    `}
                  >
                    <img
                      src={candidate.url}
                      alt={`${assetTypeLabel} option`}
                      className="w-full aspect-[2/3] object-cover"
                      loading="lazy"
                    />

                    {/* Info overlay at bottom */}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-2">
                      <div className="text-xs text-white">
                        <div className="font-medium">{candidate.provider}</div>
                        {candidate.width && candidate.height && (
                          <div className="text-neutral-300">
                            {candidate.width} × {candidate.height}
                          </div>
                        )}
                        {candidate.vote_count !== null && candidate.vote_count !== undefined && (
                          <div className="text-neutral-300">
                            ⭐ {candidate.vote_count} votes
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Selected indicator */}
                    {selectedCandidate?.id === candidate.id && (
                      <div className="absolute top-2 right-2 bg-primary-500 rounded-full p-1.5">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-4 w-4 text-white"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-4 border-t border-neutral-700">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded bg-neutral-700 hover:bg-neutral-600 text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              disabled={!selectedCandidate}
              className="px-4 py-2 rounded bg-primary-600 hover:bg-primary-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              Apply Selection
            </button>
          </div>
        </div>
      </div>

      {/* Accessible Confirmation Dialog */}
      <ConfirmDialog />
    </div>
  );
};
