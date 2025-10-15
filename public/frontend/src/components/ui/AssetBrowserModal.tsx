import React from 'react';
import {
  useAssetCandidates,
  useSelectAsset,
  useBlockAsset,
  useUnblockAsset,
  useResetAssetSelection,
} from '../../hooks/useAssetCandidates';
import { AssetCandidateGrid } from './AssetCandidateGrid';

interface AssetBrowserModalProps {
  isOpen: boolean;
  onClose: () => void;
  entityId: number;
  assetType: string;
  assetTypeLabel?: string;
}

/**
 * Asset Browser Modal Component
 *
 * Full-screen modal for browsing and selecting asset candidates.
 * Features:
 * - Fetches candidates from API
 * - Grid display with sorting/filtering
 * - Select/block/unblock actions
 * - Reset selection button
 * - Close with ESC key
 */
export const AssetBrowserModal: React.FC<AssetBrowserModalProps> = ({
  isOpen,
  onClose,
  entityId,
  assetType,
  assetTypeLabel,
}) => {
  // Fetch candidates
  const { data: candidates = [], isLoading } = useAssetCandidates(
    entityId,
    assetType,
    false // Don't include blocked by default
  );

  // Mutations
  const selectAsset = useSelectAsset();
  const blockAsset = useBlockAsset();
  const unblockAsset = useUnblockAsset();
  const resetSelection = useResetAssetSelection();

  // Handle select
  const handleSelect = (candidateId: number) => {
    selectAsset.mutate({ candidateId, selectedBy: 'user' });
  };

  // Handle block
  const handleBlock = (candidateId: number) => {
    blockAsset.mutate({ candidateId, entityId, assetType, blockedBy: 'user' });
  };

  // Handle unblock
  const handleUnblock = (candidateId: number) => {
    unblockAsset.mutate({ candidateId, entityId, assetType });
  };

  // Handle reset selection
  const handleReset = () => {
    if (confirm('Are you sure you want to reset the selection? This will deselect all candidates.')) {
      resetSelection.mutate({ entityId, assetType });
    }
  };

  // Close on ESC key
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const label = assetTypeLabel || assetType.charAt(0).toUpperCase() + assetType.slice(1);
  const selectedCandidate = candidates.find(c => c.is_selected);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75">
      <div className="bg-gray-900 rounded-lg shadow-xl w-full h-full max-w-7xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <div>
            <h2 className="text-2xl font-bold text-white">
              Browse {label} Candidates
            </h2>
            <p className="text-sm text-gray-400 mt-1">
              {candidates.length} candidates available
              {selectedCandidate && (
                <span className="ml-2 text-blue-400">
                  • Current: {selectedCandidate.provider.toUpperCase()} (score: {Math.round(selectedCandidate.score)})
                </span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Reset button */}
            {selectedCandidate && (
              <button
                onClick={handleReset}
                disabled={resetSelection.isPending}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
              >
                {resetSelection.isPending ? 'Resetting...' : 'Reset Selection'}
              </button>
            )}

            {/* Close button */}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          <AssetCandidateGrid
            candidates={candidates}
            onSelect={handleSelect}
            onBlock={handleBlock}
            onUnblock={handleUnblock}
            isLoading={isLoading}
          />
        </div>

        {/* Footer */}
        <div className="border-t border-gray-800 p-4 bg-gray-800">
          <div className="flex items-center justify-between text-sm text-gray-400">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-green-600 rounded"></div>
                <span>80-100: Excellent</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-yellow-600 rounded"></div>
                <span>60-79: Good</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-orange-600 rounded"></div>
                <span>40-59: Fair</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-red-600 rounded"></div>
                <span>0-39: Poor</span>
              </div>
            </div>
            <div>
              <span className="text-gray-500">Press </span>
              <kbd className="px-2 py-1 bg-gray-700 rounded text-xs">ESC</kbd>
              <span className="text-gray-500"> to close</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
