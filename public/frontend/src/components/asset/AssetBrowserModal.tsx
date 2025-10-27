/**
 * TODO: This component needs to be refactored for the new cache-aside pattern.
 *
 * The select/block/unblock functionality has been removed.
 * This modal should now simply:
 * 1. Display cached candidates from provider_cache_assets
 * 2. Allow user to browse and view them
 * 3. Parent component handles actual selection via replaceAssets API
 *
 * For now, returning simple "not implemented" message.
 */

import React from 'react';
import { useAssetCandidates } from '../../hooks/useAssetCandidates';

interface AssetBrowserModalProps {
  isOpen: boolean;
  onClose: () => void;
  entityId: number;
  assetType: string;
  assetTypeLabel?: string;
}

export const AssetBrowserModal: React.FC<AssetBrowserModalProps> = ({
  isOpen,
  onClose,
  entityId,
  assetType,
  assetTypeLabel,
}) => {
  // Fetch candidates from provider cache
  const { data: candidates = [], isLoading } = useAssetCandidates(
    entityId,
    assetType,
    false
  );

  if (!isOpen) return null;

  const label = assetTypeLabel || assetType.charAt(0).toUpperCase() + assetType.slice(1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75">
      <div className="bg-gray-900 rounded-lg shadow-xl w-full max-w-2xl p-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-4">
            Browse {label} Candidates
          </h2>
          <p className="text-gray-400 mb-6">
            This feature is being refactored for the new cache-aside pattern.
          </p>
          <p className="text-sm text-gray-500 mb-6">
            {candidates.length > 0
              ? `Found ${candidates.length} cached candidates from providers`
              : 'No cached candidates. Use "Search Providers" to fetch from TMDB, Fanart.tv, etc.'}
          </p>
          <button
            onClick={onClose}
            className="px-6 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
