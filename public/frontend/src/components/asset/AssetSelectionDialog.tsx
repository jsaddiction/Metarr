import React, { useState, useMemo, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faSpinner,
  faUpload,
  faLockOpen,
  faExclamationTriangle,
  faImage,
} from '@fortawesome/free-solid-svg-icons';
import {
  AssetSelectionDialogProps,
  AssetCandidate,
  FilterOptions,
  SortOption,
  AssetType,
} from '../../types/asset';
import { AssetCard } from './AssetCard';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

// Asset type display names and aspect ratios
const ASSET_TYPE_INFO: Record<
  AssetType,
  {
    displayName: string;
    aspectRatio: string;
    description: string;
    currentAssetWidth: string; // Tailwind width class for current asset display
  }
> = {
  poster: {
    displayName: 'Poster',
    aspectRatio: 'aspect-[2/3]',
    description: '2:3 portrait (1000x1500)',
    currentAssetWidth: 'w-20', // Portrait - narrower width
  },
  fanart: {
    displayName: 'Fanart',
    aspectRatio: 'aspect-[16/9]',
    description: '16:9 widescreen (1920x1080)',
    currentAssetWidth: 'w-32', // Wide - wider width
  },
  banner: {
    displayName: 'Banner',
    aspectRatio: 'aspect-[1000/185]',
    description: 'Wide banner (1000x185)',
    currentAssetWidth: 'w-40', // Very wide - widest
  },
  clearlogo: {
    displayName: 'Clear Logo',
    aspectRatio: 'aspect-[800/310]',
    description: 'Logo (800x310)',
    currentAssetWidth: 'w-32', // Wide-ish
  },
  clearart: {
    displayName: 'Clear Art',
    aspectRatio: 'aspect-[1000/562]',
    description: 'Clear art (1000x562)',
    currentAssetWidth: 'w-32', // Wide-ish
  },
  landscape: {
    displayName: 'Landscape',
    aspectRatio: 'aspect-[16/9]',
    description: '16:9 widescreen (1920x1080)',
    currentAssetWidth: 'w-32', // Wide - wider width
  },
  keyart: {
    displayName: 'Key Art',
    aspectRatio: 'aspect-[2/3]',
    description: '2:3 portrait (1000x1500)',
    currentAssetWidth: 'w-20', // Portrait - narrower width
  },
  discart: {
    displayName: 'Disc Art',
    aspectRatio: 'aspect-square',
    description: '1:1 square (1000x1000)',
    currentAssetWidth: 'w-24', // Square - medium width
  },
};

export const AssetSelectionDialog: React.FC<AssetSelectionDialogProps> = ({
  isOpen,
  onClose,
  onSelect,
  assetType,
  currentAsset,
  providerResults,
  isLoading = false,
  error = null,
}) => {
  const [selectedAsset, setSelectedAsset] = useState<{
    asset: AssetCandidate;
    provider: string;
  } | null>(null);
  const [filters, setFilters] = useState<FilterOptions>({
    provider: 'all',
    quality: 'all',
    sortBy: 'score',
  });

  // Extract all assets for this asset type from all providers
  const allAssets = useMemo(() => {
    if (!providerResults?.providers) return [];

    const assets: Array<{ asset: AssetCandidate; provider: string; score?: number }> = [];

    for (const [providerName, result] of Object.entries(providerResults.providers)) {
      // Skip if provider failed or returned no data
      if (!result || !result.images || !result.images[assetType]) continue;

      const providerAssets = result.images[assetType] || [];

      for (const asset of providerAssets) {
        // Check if this asset is recommended
        const recommendation = providerResults.recommendations?.[assetType];
        const score =
          recommendation && recommendation.asset.url === asset.url ? recommendation.score : undefined;

        assets.push({
          asset,
          provider: providerName,
          score,
        });
      }
    }

    return assets;
  }, [providerResults, assetType]);

  // Get recommendation (only present for automated workflows)
  const recommendation = providerResults?.recommendations?.[assetType];

  // Get unique providers
  const providers = useMemo(() => {
    const uniqueProviders = new Set(allAssets.map((a) => a.provider));
    return ['all', ...Array.from(uniqueProviders)];
  }, [allAssets]);

  // Filter and sort assets
  const filteredAndSortedAssets = useMemo(() => {
    let filtered = [...allAssets];

    // Filter by provider
    if (filters.provider !== 'all') {
      filtered = filtered.filter((a) => a.provider === filters.provider);
    }

    // Filter by quality
    if (filters.quality !== 'all') {
      filtered = filtered.filter((a) => {
        const width = a.asset.width || 0;
        if (filters.quality === '4k') return width >= 3840;
        if (filters.quality === 'hd') return width >= 1280 && width < 3840;
        if (filters.quality === 'sd') return width > 0 && width < 1280;
        return true;
      });
    }

    // Sort - default by resolution (highest first) for manual selection
    filtered.sort((a, b) => {
      switch (filters.sortBy) {
        case 'score':
          return (b.score || 0) - (a.score || 0);
        case 'resolution':
          return (b.asset.width || 0) - (a.asset.width || 0);
        case 'votes':
          return (b.asset.votes || 0) - (a.asset.votes || 0);
        case 'provider':
          return a.provider.localeCompare(b.provider);
        default:
          return (b.asset.width || 0) - (a.asset.width || 0); // Default sort by resolution
      }
    });

    return filtered;
  }, [allAssets, filters]);

  // Reset selection when dialog opens
  useEffect(() => {
    if (isOpen) {
      setSelectedAsset(null);
      setFilters({
        provider: 'all',
        quality: 'all',
        sortBy: 'resolution', // Default to resolution for manual selection
      });
    }
  }, [isOpen]);

  // Calculate minimum card width based on asset type for responsive grid
  const getMinCardWidth = () => {
    // Base these on reasonable minimum widths that maintain aspect ratio
    switch (assetType) {
      case 'fanart':
      case 'landscape':
        return 300; // 16:9 ratio cards
      case 'banner':
        return 600; // Very wide banners
      case 'clearlogo':
        return 350; // Wide logos
      case 'clearart':
        return 300; // Wide art
      case 'discart':
        return 180; // Square discs
      case 'keyart':
      case 'poster':
      default:
        return 150; // Portrait posters
    }
  };

  // Handle select button click
  const handleSelect = () => {
    if (selectedAsset) {
      onSelect(selectedAsset.asset, selectedAsset.provider);
      onClose();
    }
  };

  // Handle quick select (use recommended) - only for automated workflows
  const handleQuickSelect = () => {
    if (recommendation) {
      onSelect(recommendation.asset, recommendation.provider);
      onClose();
    }
  };

  if (!isOpen) return null;

  const assetInfo = ASSET_TYPE_INFO[assetType];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col p-0">
        {/* Header with Current Asset and Filters - Fixed Height */}
        <div className="px-6 py-3 border-b border-neutral-700 bg-neutral-900/50 flex-shrink-0" style={{ height: '140px' }}>
          <div className="flex gap-4 h-full">
            {/* Current Asset - Left Side - Fills Height */}
            {currentAsset && (
              <div className="flex-shrink-0 h-full">
                <div className="relative h-full">
                  <div className={`${assetInfo.aspectRatio} h-full bg-neutral-900 rounded overflow-hidden border-2 border-primary-500/50`}>
                    <img
                      src={currentAsset.cache_url}
                      alt="Current"
                      className="w-full h-full object-cover"
                    />

                    {/* Lock Badge if Locked - Top Right */}
                    {currentAsset.locked && (
                      <div className="absolute top-1.5 right-1.5 bg-warning/90 text-white text-[9px] font-semibold px-1.5 py-0.5 rounded flex items-center gap-1">
                        <FontAwesomeIcon icon={faLockOpen} className="text-[9px]" aria-hidden="true" />
                        <span>LOCKED</span>
                      </div>
                    )}

                    {/* Info Overlay at Bottom */}
                    <div className="absolute bottom-0 left-0 right-0 bg-black/75 backdrop-blur-sm px-2 py-1.5">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[10px] font-semibold text-primary-300 truncate">
                          {currentAsset.provider || 'Custom'}
                        </span>
                      </div>
                      {currentAsset.width && currentAsset.height && (
                        <div className="text-[10px] text-neutral-300">
                          {currentAsset.width}×{currentAsset.height}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Right Side - Title at Top, Filters at Bottom */}
            <div className="flex-1 flex flex-col justify-between h-full">
              {/* Title Row */}
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h2 id="asset-selection-title" className="text-xl font-semibold">Select {assetInfo.displayName}</h2>
                  <p className="text-xs text-neutral-400 mt-0.5">{assetInfo.description}</p>
                </div>
              </div>

              {/* Filter Controls Row - Bottom Aligned */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="block text-xs font-medium text-neutral-300 mb-1">
                    Provider
                  </Label>
                  <Select
                    value={filters.provider}
                    onValueChange={(value) => setFilters({ ...filters, provider: value })}
                  >
                    <SelectTrigger className="w-full text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {providers.map((provider) => (
                        <SelectItem key={provider} value={provider}>
                          {provider === 'all' ? 'All Providers' : provider.toUpperCase()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="block text-xs font-medium text-neutral-300 mb-1">Quality</Label>
                  <Select
                    value={filters.quality}
                    onValueChange={(value) => setFilters({ ...filters, quality: value })}
                  >
                    <SelectTrigger className="w-full text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Qualities</SelectItem>
                      <SelectItem value="4k">4K (3840px+)</SelectItem>
                      <SelectItem value="hd">HD (1280px+)</SelectItem>
                      <SelectItem value="sd">SD (&lt;1280px)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="block text-xs font-medium text-neutral-300 mb-1">Sort By</Label>
                  <Select
                    value={filters.sortBy}
                    onValueChange={(value) => setFilters({ ...filters, sortBy: value as SortOption })}
                  >
                    <SelectTrigger className="w-full text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="resolution">Resolution</SelectItem>
                      <SelectItem value="provider">Provider</SelectItem>
                      <SelectItem value="votes">Votes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Body - Scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Loading State */}
          {isLoading && (
            <div className="text-center py-12">
              <FontAwesomeIcon icon={faSpinner} spin className="text-4xl text-primary-500 mb-4" aria-hidden="true" />
              <p className="text-neutral-300">Fetching assets from providers...</p>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="bg-error/20 border border-error rounded-md p-4 mb-6">
              <div className="flex items-center gap-3">
                <FontAwesomeIcon icon={faExclamationTriangle} className="text-error text-xl" aria-hidden="true" />
                <div>
                  <h4 className="font-semibold text-white mb-1">Failed to fetch assets</h4>
                  <p className="text-sm text-neutral-300">
                    {error instanceof Error ? error.message : 'Unknown error'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Content */}
          {!isLoading && !error && (
            <>
              {/* Recommended (only for automated workflows) */}
              {recommendation && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                    Recommended (Best Match)
                    <span className="text-sm font-normal text-neutral-400">
                      {Math.round(recommendation.score * 100)}% match
                    </span>
                  </h3>
                  <div className="flex gap-4 bg-primary-900/20 rounded-lg p-4 border border-primary-500">
                    <div className={`${assetInfo.aspectRatio} w-32 flex-shrink-0 bg-neutral-900 rounded overflow-hidden`}>
                      <img
                        src={recommendation.asset.thumbnailUrl || recommendation.asset.url}
                        alt="Recommended"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1">
                      <div className="text-sm text-primary-300 font-semibold mb-1">
                        {recommendation.provider}
                      </div>
                      {recommendation.asset.width && recommendation.asset.height && (
                        <div className="text-sm text-neutral-300 mb-2">
                          {recommendation.asset.width}×{recommendation.asset.height}
                        </div>
                      )}
                      <div className="text-sm text-neutral-400 mb-3">{recommendation.reason}</div>
                      <Button onClick={handleQuickSelect} size="sm">
                        Use This
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* All Options */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-white mb-3">
                  All Options ({filteredAndSortedAssets.length} found)
                </h3>

                {filteredAndSortedAssets.length === 0 ? (
                  <div className="text-center py-12 bg-neutral-800/30 rounded border border-dashed border-neutral-700">
                    <FontAwesomeIcon icon={faImage} className="text-4xl text-neutral-600 mb-3" aria-hidden="true" />
                    <p className="text-neutral-400">No assets found with current filters</p>
                  </div>
                ) : (
                  <div
                    className="grid gap-3"
                    style={{
                      gridTemplateColumns: `repeat(auto-fill, minmax(${getMinCardWidth()}px, 1fr))`
                    }}
                  >
                    {filteredAndSortedAssets.map((item, index) => (
                      <AssetCard
                        key={`${item.provider}-${item.asset.url}-${index}`}
                        asset={item.asset}
                        provider={item.provider}
                        isSelected={
                          selectedAsset?.asset.url === item.asset.url &&
                          selectedAsset?.provider === item.provider
                        }
                        isRecommended={
                          recommendation?.asset.url === item.asset.url &&
                          recommendation?.provider === item.provider
                        }
                        score={item.score}
                        onClick={() => setSelectedAsset(item)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="gap-2 border-t border-neutral-700">
          <Button onClick={onClose} variant="outline">
            Cancel
          </Button>
          <Button
            onClick={handleSelect}
            disabled={!selectedAsset}
          >
            Select Asset
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
