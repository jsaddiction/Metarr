/**
 * AssetSelectionModal Component
 *
 * Two-section modal for multi-asset selection:
 * - Top: Currently selected assets (clickable to remove)
 * - Bottom: Available provider results (clickable to add)
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faSpinner,
  faCheck,
  faTimes,
  faExclamationTriangle,
  faUpload,
} from '@fortawesome/free-solid-svg-icons';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { AssetType, AssetCandidate } from '../../types/asset';
import { getProviderDisplayName } from '../../utils/providerNames';

interface CurrentAsset {
  id: number;
  source_url: string | null;  // Original provider URL
  cache_url: string;          // Cache serving URL
  provider_name?: string | null;
  width?: number | null;
  height?: number | null;
  perceptualHash?: string;
}

interface ProviderAssetResult {
  images?: {
    [key in AssetType]?: AssetCandidate[];
  };
  success: boolean;
  error?: string;
}

interface ProviderResultsResponse {
  providers: {
    [providerName: string]: ProviderAssetResult;
  };
}

interface AssetSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (selectedAssets: Array<{ asset: AssetCandidate; provider: string }>) => Promise<void>;
  onUpload?: (file: File) => Promise<void>;
  assetType: AssetType;
  assetTypeLabel: string;
  currentAssets: CurrentAsset[];
  maxLimit: number;
  providerResults?: ProviderResultsResponse;
  isLoading?: boolean;
  isSaving?: boolean;
  error?: Error | null;
}

// Aspect ratios for most asset types - clearlogo uses fixed height instead
const ASSET_TYPE_ASPECT_RATIOS: Partial<Record<AssetType, string>> = {
  poster: 'aspect-[2/3]',
  fanart: 'aspect-[16/9]',
  banner: 'aspect-[1000/185]',
  // clearlogo: removed - uses fixed height with object-contain instead (variable aspect ratios)
  clearart: 'aspect-[1000/562]',
  landscape: 'aspect-[16/9]',
  keyart: 'aspect-[2/3]',
  discart: 'aspect-square',
};

// Grid columns based on asset type (responsive: mobile / tablet / desktop / xl)
const ASSET_TYPE_GRID_COLS: Record<AssetType, string> = {
  poster: 'grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8',       // Tall/portrait: more columns
  keyart: 'grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8',       // Tall/portrait: more columns
  fanart: 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5',       // 16:9: moderate columns
  landscape: 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5',    // 16:9: moderate columns
  clearart: 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5',     // Similar to 16:9
  banner: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3',       // Very wide (5.4:1): fewer columns
  clearlogo: 'grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',    // Wide (2.58:1): fewer columns than 16:9
  discart: 'grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8',      // Square: more columns
};

// Standardized height for selected assets row - width adjusts to maintain aspect ratio
// This ensures all asset types are clearly visible at the top
const SELECTED_ROW_HEIGHT = 'h-24'; // 96px - consistent height for all asset types

export const AssetSelectionModal: React.FC<AssetSelectionModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onUpload,
  assetType,
  assetTypeLabel,
  currentAssets,
  maxLimit,
  providerResults,
  isLoading = false,
  isSaving = false,
  error = null,
}) => {
  // Local state for selected assets
  const [selectedAssets, setSelectedAssets] = useState<Array<{ asset: AssetCandidate; provider: string }>>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize selected assets from currentAssets when dialog opens
  useEffect(() => {
    if (isOpen && currentAssets) {
      const initial = currentAssets.map((current) => ({
        asset: {
          providerId: 'tmdb' as const,
          providerResultId: current.id.toString(),
          assetType,
          url: current.source_url || current.cache_url,  // Use source_url (original provider URL)
          thumbnailUrl: current.cache_url,
          width: current.width ?? undefined,
          height: current.height ?? undefined,
        },
        provider: current.provider_name || 'Custom',
      }));
      setSelectedAssets(initial);
    }
  }, [isOpen, currentAssets, assetType]);

  // Extract all available assets from provider results
  const availableAssets = useMemo(() => {
    if (!providerResults?.providers) return [];

    const assets: Array<{ asset: AssetCandidate; provider: string }> = [];

    for (const [providerName, result] of Object.entries(providerResults.providers)) {
      if (!result || !result.images || !result.images[assetType]) continue;

      const providerAssets = result.images[assetType] || [];

      for (const asset of providerAssets) {
        assets.push({
          asset,
          provider: providerName,
        });
      }
    }

    // Sort by resolution (highest first)
    assets.sort((a, b) => (b.asset.width || 0) - (a.asset.width || 0));

    return assets;
  }, [providerResults, assetType]);

  // Check if an asset is already selected
  const isSelected = (asset: AssetCandidate) => {
    return selectedAssets.some((selected) => {
      // Match by URL or perceptual hash
      if (selected.asset.url === asset.url) return true;
      if (asset.perceptualHash && selected.asset.perceptualHash === asset.perceptualHash) return true;
      return false;
    });
  };

  // Add asset to selection
  const handleAddAsset = (asset: AssetCandidate, provider: string) => {
    if (selectedAssets.length >= maxLimit) return;
    if (isSelected(asset)) return;

    setSelectedAssets((prev) => [...prev, { asset, provider }]);
  };

  // Remove asset from selection
  const handleRemoveAsset = (index: number) => {
    setSelectedAssets((prev) => prev.filter((_, i) => i !== index));
  };

  // Handle save
  const handleSave = async () => {
    // Don't close the modal - let the parent close it after save completes
    // The isSaving prop will show loading state while save is in progress
    await onSave(selectedAssets);
  };

  // Handle upload
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0] || !onUpload) return;

    const file = e.target.files[0];
    setIsUploading(true);

    try {
      await onUpload(file);
      // File input will be cleared and modal will stay open to show the new image
    } catch (error) {
      console.error('Failed to upload image:', error);
      alert('Failed to upload image');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const aspectRatio = ASSET_TYPE_ASPECT_RATIOS[assetType];
  const gridCols = ASSET_TYPE_GRID_COLS[assetType];
  const emptySlotCount = Math.max(0, maxLimit - selectedAssets.length);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col p-0">
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png"
          onChange={handleFileSelect}
          className="hidden"
          aria-label="Upload image file"
        />

        <DialogHeader className="px-6 pt-4 pb-3 border-b border-neutral-700">
          <DialogTitle className="text-xl font-semibold text-white flex items-baseline gap-2">
            <span>Select {assetTypeLabel}</span>
            <span className="text-sm text-neutral-500 font-normal">
              Click to add or remove • Max: {maxLimit}
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* TOP SECTION: Selected Assets */}
        <div className="px-6 py-2 border-b-2 border-primary-500/30 bg-neutral-900/30">
          {selectedAssets.length > 0 && (
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs text-neutral-500">
                {selectedAssets.length} selected
              </div>
              <button
                onClick={() => setSelectedAssets([])}
                className="text-xs text-neutral-500 hover:text-error transition-colors"
              >
                Clear All
              </button>
            </div>
          )}

          {/* Horizontal scrollable row */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {/* Selected assets */}
            {selectedAssets.map((item, index) => (
              <div
                key={`selected-${index}`}
                className="relative flex-shrink-0 cursor-pointer group"
                onClick={() => handleRemoveAsset(index)}
              >
                {/* Standardized height for all asset types - width auto-adjusts to aspect ratio */}
                <div className={`relative ${SELECTED_ROW_HEIGHT} ${assetType === 'clearlogo' ? 'min-w-32 bg-neutral-800/50' : 'bg-neutral-800'} rounded flex items-center justify-center p-2 border-2 border-primary-500 transition-all group-hover:border-error overflow-hidden`}>
                  <img
                    src={item.asset.thumbnailUrl || item.asset.url}
                    alt={`Selected ${index + 1}`}
                    className="h-full w-auto object-contain group-hover:opacity-50 transition-opacity"
                  />
                  {/* Remove overlay on hover */}
                  <div className="absolute inset-0 bg-error/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <FontAwesomeIcon icon={faTimes} className="text-white text-xl" />
                  </div>
                </div>
                {/* Provider badge */}
                <div className="absolute bottom-1 left-1 right-1 bg-black/70 text-[10px] text-center text-white rounded px-1 py-0.5 truncate">
                  {getProviderDisplayName(item.provider)}
                </div>
              </div>
            ))}

            {/* Empty slots */}
            {Array.from({ length: emptySlotCount }).map((_, index) => (
              <div
                key={`empty-${index}`}
                className={`${SELECTED_ROW_HEIGHT} ${assetType === 'clearlogo' ? 'min-w-32' : aspectRatio ? 'w-24' : 'w-32'} flex-shrink-0 border-2 border-dashed border-neutral-600 rounded bg-neutral-800/30 flex items-center justify-center`}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 text-neutral-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
            ))}
          </div>
        </div>

        {/* BOTTOM SECTION: Available Candidates */}
        <div className="flex-1 overflow-y-auto px-6 py-3">
          {/* Loading State */}
          {isLoading && (
            <div className="text-center py-12">
              <FontAwesomeIcon icon={faSpinner} spin className="text-4xl text-primary-500 mb-4" />
              <p className="text-neutral-300">Fetching assets from providers...</p>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="bg-error/20 border border-error rounded-md p-4 mb-6">
              <div className="flex items-center gap-3">
                <FontAwesomeIcon icon={faExclamationTriangle} className="text-error text-xl" />
                <div>
                  <h4 className="font-semibold text-white mb-1">Failed to fetch assets</h4>
                  <p className="text-sm text-neutral-300">
                    {error instanceof Error ? error.message : 'Unknown error'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Grid of available assets */}
          {!isLoading && !error && (
            <>
              {availableAssets.length === 0 ? (
                <div className="text-center py-12 bg-neutral-800/30 rounded border border-dashed border-neutral-700">
                  <p className="text-neutral-400">No assets found from providers</p>
                </div>
              ) : (
                <div className={`grid ${gridCols} gap-2`}>
                  {availableAssets.map((item, index) => {
                    const selected = isSelected(item.asset);
                    const canSelect = selectedAssets.length < maxLimit;

                    return (
                      <div
                        key={`available-${index}`}
                        className={`relative group ${
                          selected
                            ? 'cursor-not-allowed'
                            : canSelect
                            ? 'cursor-pointer'
                            : 'cursor-not-allowed opacity-50'
                        }`}
                        onClick={() => !selected && canSelect && handleAddAsset(item.asset, item.provider)}
                      >
                        {/* Special handling for clearlogo: fixed height with object-contain */}
                        {assetType === 'clearlogo' ? (
                          <div
                            className={`relative min-h-24 w-full bg-neutral-800/50 rounded flex items-center justify-center p-3 border-2 transition-all ${
                              selected
                                ? 'border-neutral-600 opacity-40'
                                : canSelect
                                ? 'border-neutral-700 hover:border-primary-500 hover:shadow-lg hover:shadow-primary-500/20'
                                : 'border-neutral-700'
                            }`}
                          >
                            <img
                              src={item.asset.thumbnailUrl || item.asset.url}
                              alt={`Option ${index + 1}`}
                              className="w-full h-auto object-contain"
                              loading="lazy"
                            />
                          </div>
                        ) : (
                          <div
                            className={`${aspectRatio} bg-neutral-800 rounded overflow-hidden border-2 transition-all ${
                              selected
                                ? 'border-neutral-600 opacity-40'
                                : canSelect
                                ? 'border-neutral-700 hover:border-primary-500 hover:shadow-lg hover:shadow-primary-500/20'
                                : 'border-neutral-700'
                            }`}
                          >
                            <img
                              src={item.asset.thumbnailUrl || item.asset.url}
                              alt={`Option ${index + 1}`}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}

                        {/* Selected overlay */}
                        {selected && (
                          <div className="absolute inset-0 bg-primary-500/40 flex items-center justify-center">
                            <div className="bg-primary-500 rounded-full p-2">
                              <FontAwesomeIcon icon={faCheck} className="text-white text-lg" />
                            </div>
                          </div>
                        )}

                        {/* Hover overlay for available assets */}
                        {!selected && canSelect && (
                          <div className="absolute inset-0 bg-primary-500/0 group-hover:bg-primary-500/20 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                            <div className="bg-primary-500 rounded-full p-2 transform scale-0 group-hover:scale-100 transition-transform">
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-5 w-5 text-white"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                              </svg>
                            </div>
                          </div>
                        )}

                        {/* Info overlay at bottom */}
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="text-[9px] text-white font-semibold truncate">{getProviderDisplayName(item.provider)}</div>
                          {item.asset.width && item.asset.height && (
                            <div className="text-[9px] text-neutral-300">
                              {item.asset.width}×{item.asset.height}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="gap-2 border-t border-neutral-700 px-6 py-3">
          <div className="flex justify-between items-center w-full">
            {/* Left side - Upload button */}
            <div>
              {onUpload && (
                <Button
                  onClick={handleUploadClick}
                  variant="outline"
                  size="sm"
                  disabled={isUploading || selectedAssets.length >= maxLimit}
                >
                  {isUploading ? (
                    <>
                      <FontAwesomeIcon icon={faSpinner} spin className="mr-2" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <FontAwesomeIcon icon={faUpload} className="mr-2" />
                      Upload
                    </>
                  )}
                </Button>
              )}
            </div>

            {/* Right side - Cancel and Save */}
            <div className="flex gap-2">
              <Button onClick={onClose} variant="outline" size="sm" disabled={isSaving}>
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={selectedAssets.length === 0 || isSaving}
                size="sm"
              >
                {isSaving ? (
                  <>
                    <FontAwesomeIcon icon={faSpinner} spin className="mr-2" />
                    Saving...
                  </>
                ) : (
                  <>
                    Save {selectedAssets.length > 0 && `(${selectedAssets.length})`}
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
