import React, { useState } from 'react';
import { AssetCandidate } from '../../hooks/useAssetCandidates';
import { AssetThumbnail } from './AssetThumbnail';

interface AssetCandidateGridProps {
  candidates: AssetCandidate[];
  onSelect: (candidateId: number) => void;
  onBlock: (candidateId: number) => void;
  onUnblock: (candidateId: number) => void;
  isLoading?: boolean;
}

type SortBy = 'score' | 'resolution' | 'provider' | 'votes';
type FilterProvider = 'all' | 'tmdb' | 'fanart' | 'tvdb' | 'local';

/**
 * Asset Candidate Grid Component
 *
 * Displays a grid of asset candidates with:
 * - Sorting (score, resolution, provider, votes)
 * - Filtering (by provider)
 * - Show/hide blocked candidates
 * - Grid layout with responsive columns
 */
export const AssetCandidateGrid: React.FC<AssetCandidateGridProps> = ({
  candidates,
  onSelect,
  onBlock,
  onUnblock,
  isLoading = false,
}) => {
  const [sortBy, setSortBy] = useState<SortBy>('score');
  const [filterProvider, setFilterProvider] = useState<FilterProvider>('all');
  const [showBlocked, setShowBlocked] = useState(false);

  // Get unique providers
  const providers = Array.from(new Set(candidates.map(c => c.provider.toLowerCase())));

  // Filter candidates
  const filteredCandidates = candidates.filter(candidate => {
    // Filter by blocked status
    if (!showBlocked && candidate.is_blocked) return false;

    // Filter by provider
    if (filterProvider !== 'all' && candidate.provider.toLowerCase() !== filterProvider) {
      return false;
    }

    return true;
  });

  // Sort candidates
  const sortedCandidates = [...filteredCandidates].sort((a, b) => {
    switch (sortBy) {
      case 'score':
        return b.score - a.score;
      case 'resolution':
        const aPixels = (a.width || 0) * (a.height || 0);
        const bPixels = (b.width || 0) * (b.height || 0);
        return bPixels - aPixels;
      case 'provider':
        return a.provider.localeCompare(b.provider);
      case 'votes':
        return (b.vote_count || 0) - (a.vote_count || 0);
      default:
        return 0;
    }
  });

  // Count blocked candidates
  const blockedCount = candidates.filter(c => c.is_blocked).length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  if (candidates.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <svg className="mx-auto h-12 w-12 text-gray-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <p className="text-lg">No asset candidates available</p>
        <p className="text-sm mt-2">Try refreshing metadata from providers</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap gap-4 items-center justify-between bg-gray-800 p-4 rounded-lg">
        {/* Sort */}
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-400">Sort by:</label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className="bg-gray-700 border border-gray-600 rounded px-3 py-1 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value="score">Score</option>
            <option value="resolution">Resolution</option>
            <option value="provider">Provider</option>
            <option value="votes">Community Votes</option>
          </select>
        </div>

        {/* Filter by provider */}
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-400">Provider:</label>
          <select
            value={filterProvider}
            onChange={(e) => setFilterProvider(e.target.value as FilterProvider)}
            className="bg-gray-700 border border-gray-600 rounded px-3 py-1 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value="all">All Providers</option>
            {providers.map(provider => (
              <option key={provider} value={provider}>
                {provider.toUpperCase()}
              </option>
            ))}
          </select>
        </div>

        {/* Show blocked toggle */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showBlocked}
            onChange={(e) => setShowBlocked(e.target.checked)}
            className="w-4 h-4 text-purple-600 bg-gray-700 border-gray-600 rounded focus:ring-purple-500"
          />
          <span className="text-sm text-gray-400">
            Show blocked ({blockedCount})
          </span>
        </label>

        {/* Result count */}
        <div className="text-sm text-gray-400">
          {sortedCandidates.length} of {candidates.length} candidates
        </div>
      </div>

      {/* Grid */}
      {sortedCandidates.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <p>No candidates match the current filters</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {sortedCandidates.map(candidate => (
            <AssetThumbnail
              key={candidate.id}
              candidate={candidate}
              selected={candidate.is_selected}
              blocked={candidate.is_blocked}
              onClick={() => onSelect(candidate.id)}
              onBlock={() => onBlock(candidate.id)}
              onUnblock={() => onUnblock(candidate.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
};
