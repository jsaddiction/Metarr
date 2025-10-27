/**
 * AssetSelectionModal v2 - Skeleton Slot Pattern
 *
 * Design:
 * - Top: N skeleton slots (based on maxLimit)
 *   - Filled slots show current assets (click to remove)
 *   - Empty slots show skeleton (click to select from providers)
 *   - Selected pending slots show provider asset with checkmark
 * - Bottom: Provider candidates grid for selection
 */

import React, { useState, useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faTimes,
  faSpinner,
  faExclamationTriangle,
  faCheck,
  faUpload,
} from '@fortawesome/free-solid-svg-icons';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { AssetCandidate } from '../../types/asset';
import type { AssetType } from '../../types/asset';
import { getProviderDisplayName } from '../../utils/providerNames';

interface CurrentAsset {
  id: number;
  cache_url: string;
  provider_name: string | null;
  width: number | null;
  height: number | null;
}

interface Slot {
  index: number;
  current: CurrentAsset | null; // Existing asset in library
  pending: AssetCandidate | null; // Newly selected asset (not yet saved)
  removed: boolean; // User clicked to remove current asset
}

interface AssetSelectionModalV2Props {
  isOpen: boolean;
  onClose: () => void;
  assetType: AssetType;
  assetTypeLabel: string;
  movieTitle: string;
  movieId: number;
  currentAssets: CurrentAsset[];
  maxLimit: number;
  providerResults?: any;
  isLoadingProviders?: boolean;
  providerError?: Error | null;
  onApply: (allAssets: AssetCandidate[]) => Promise<void>;
  onUpload?: (file: File) => Promise<void>;
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
const SELECTED_ROW_HEIGHT = 'h-24'; // 96px - consistent height for all asset types

export const AssetSelectionModalV2: React.FC<AssetSelectionModalV2Props> = ({
  isOpen,
  onClose,
  assetType,
  assetTypeLabel,
  movieTitle,
  movieId,
  currentAssets,
  maxLimit,
  providerResults,
  isLoadingProviders = false,
  providerError,
  onApply,
  onUpload,
}) => {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [isApplying, setIsApplying] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize slots when modal opens or currentAssets change
  useEffect(() => {
    if (!isOpen) return;

    const initialSlots: Slot[] = [];

    // Fill slots with current assets
    for (let i = 0; i < maxLimit; i++) {
      initialSlots.push({
        index: i,
        current: currentAssets[i] || null,
        pending: null,
        removed: false,
      });
    }

    setSlots(initialSlots);
  }, [isOpen, currentAssets, maxLimit]);

  // Extract candidates from provider results
  const candidates: AssetCandidate[] = React.useMemo(() => {
    if (!providerResults || !providerResults.providers) return [];

    const allCandidates: AssetCandidate[] = [];

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

  if (!isOpen) return null;

  // Handle clicking on a slot
  const handleSlotClick = (slotIndex: number) => {
    setSlots(prev => {
      return prev.map((slot, index) => {
        if (index !== slotIndex) return slot;

        // Create new slot object for the clicked slot
        const updatedSlot = { ...slot };

        // If slot has pending selection, clear it
        if (updatedSlot.pending) {
          updatedSlot.pending = null;
          return updatedSlot;
        }

        // If slot has current asset, toggle removal
        if (updatedSlot.current) {
          updatedSlot.removed = !updatedSlot.removed;
          return updatedSlot;
        }

        return slot;
      });
    });
  };

  // Handle selecting a provider candidate
  const handleCandidateSelect = (candidate: AssetCandidate) => {
    // Check if already selected in any slot
    const alreadySelected = slots.some(s => s.pending?.url === candidate.url);
    if (alreadySelected) {
      // Deselect it
      setSlots(prev => prev.map(s =>
        s.pending?.url === candidate.url ? { ...s, pending: null } : s
      ));
      return;
    }

    // Find first truly empty slot (no current, no pending, or marked as removed with no pending)
    const emptySlotIndex = slots.findIndex(s =>
      (!s.current && !s.pending) || (s.removed && !s.pending)
    );

    if (emptySlotIndex === -1) {
      alert(`All ${maxLimit} slots are full. Remove an existing asset first.`);
      return;
    }

    // Assign candidate to the empty slot
    setSlots(prev => prev.map((slot, index) =>
      index === emptySlotIndex ? { ...slot, pending: candidate } : slot
    ));
  };

  // Handle apply - build final asset list including uploads
  const handleApply = async () => {
    setIsApplying(true);
    try {
      // Build final asset list from slots (including uploads)
      const finalAssets: AssetCandidate[] = [];

      for (const slot of slots) {
        if (slot.pending) {
          // New selection (provider or upload) - include with uploadFile if present
          finalAssets.push(slot.pending);
        } else if (slot.current && !slot.removed) {
          // Keep existing asset (convert to AssetCandidate format)
          finalAssets.push({
            url: slot.current.cache_url,
            width: slot.current.width || undefined,
            height: slot.current.height || undefined,
            providerId: (slot.current.provider_name || 'existing') as any,
            providerResultId: slot.current.id.toString(),
            assetType: assetType,
          });
        }
        // If slot.removed && !slot.pending, don't include (asset deleted)
      }

      // Apply all assets (uploads and provider selections together)
      await onApply(finalAssets);

      // Revoke object URLs to prevent memory leaks
      slots.forEach(slot => {
        if (slot.pending?.uploadFile && slot.pending.url.startsWith('blob:')) {
          URL.revokeObjectURL(slot.pending.url);
        }
      });

      onClose();
    } catch (error) {
      console.error('Failed to apply selection:', error);
      alert('Failed to apply selection. Please try again.');
    } finally {
      setIsApplying(false);
    }
  };

  // Handle upload
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;

    const file = e.target.files[0];

    // Validate file type
    if (!file.type.match(/image\/(jpeg|jpg|png)/)) {
      alert('Please select a JPEG or PNG image');
      return;
    }

    // Create a local object URL for preview
    const localUrl = URL.createObjectURL(file);

    // Create an image to get dimensions
    const img = new Image();
    img.onload = () => {
      // Add as a pending asset (staged change)
      const uploadedAsset: AssetCandidate = {
        url: localUrl,
        width: img.width,
        height: img.height,
        providerId: 'custom' as any,
        providerResultId: `upload-${Date.now()}`,
        assetType: assetType,
        uploadFile: file, // Store file for later upload
      };

      // Find first truly empty slot (no current, no pending, or marked as removed)
      const emptySlotIndex = slots.findIndex(s =>
        (!s.current && !s.pending) || (s.removed && !s.pending)
      );

      if (emptySlotIndex === -1) {
        alert(`All ${maxLimit} slots are full. Remove an existing asset first.`);
        URL.revokeObjectURL(localUrl);
        return;
      }

      // Add to pending slot
      setSlots(prev => prev.map((slot, index) =>
        index === emptySlotIndex ? { ...slot, pending: uploadedAsset } : slot
      ));
    };

    img.onerror = () => {
      alert('Failed to load image');
      URL.revokeObjectURL(localUrl);
    };

    img.src = localUrl;

    // Clear file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Count changes
  const pendingAdditions = slots.filter(s => s.pending).length;
  const pendingRemovals = slots.filter(s => s.removed && !s.pending).length;
  const hasChanges = pendingAdditions > 0 || pendingRemovals > 0;

  // Get aspect ratio and grid columns for this asset type
  const aspectRatio = ASSET_TYPE_ASPECT_RATIOS[assetType];
  const gridCols = ASSET_TYPE_GRID_COLS[assetType];

  // Calculate skeleton width based on aspect ratio and fixed height (h-24 = 96px)
  const getSkeletonWidth = (): number | null => {
    if (assetType === 'clearlogo') return null; // Use min-w-32 for clearlogo

    // Calculate width from aspect ratio (format: 'aspect-[w/h]')
    const match = aspectRatio?.match(/aspect-\[(\d+)\/(\d+)\]/);
    if (match) {
      const w = parseInt(match[1]);
      const h = parseInt(match[2]);
      return (96 * w) / h; // 96px height (h-24)
    }
    return 96; // Fallback to square
  };

  const skeletonWidthPx = getSkeletonWidth();

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
          {slots.filter(s => (s.current && !s.removed) || s.pending).length > 0 && (
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs text-neutral-500">
                {slots.filter(s => (s.current && !s.removed) || s.pending).length} selected
              </div>
              <button
                onClick={() => setSlots(prev => prev.map(s => ({ ...s, pending: null, removed: s.current ? true : false })))}
                className="text-xs text-neutral-500 hover:text-error transition-colors"
              >
                Clear All
              </button>
            </div>
          )}

          {/* Horizontal scrollable row - ALL slots visible (filled or empty) */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {slots.map((slot) => {
              // Determine if this slot has visible content (not removed)
              const hasVisibleContent = slot.pending || (slot.current && !slot.removed);

              if (hasVisibleContent) {
                // FILLED SLOT - Show asset with remove hover effect
                return (
                  <div
                    key={slot.index}
                    className="relative flex-shrink-0 cursor-pointer group"
                    onClick={() => handleSlotClick(slot.index)}
                  >
                    <div className={`relative ${SELECTED_ROW_HEIGHT} ${assetType === 'clearlogo' ? 'min-w-32 bg-neutral-800/50' : 'bg-neutral-800'} rounded flex items-center justify-center p-2 border-2 border-primary-500 transition-all group-hover:border-error overflow-hidden`}
                      style={skeletonWidthPx && assetType !== 'clearlogo' ? { width: `${skeletonWidthPx}px` } : undefined}
                    >
                      <img
                        src={slot.pending?.url || slot.current?.cache_url}
                        alt={slot.pending ? 'New selection' : 'Current'}
                        className="h-full w-auto object-contain group-hover:opacity-50 transition-opacity"
                      />
                      {/* Remove overlay on hover */}
                      <div className="absolute inset-0 bg-error/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <FontAwesomeIcon icon={faTimes} className="text-white text-xl" />
                      </div>
                    </div>
                    {/* Provider badge */}
                    <div className="absolute bottom-1 left-1 right-1 bg-black/70 text-[10px] text-center text-white rounded px-1 py-0.5 truncate">
                      {slot.pending ? 'NEW' : getProviderDisplayName(slot.current?.provider_name || 'Custom')}
                    </div>
                  </div>
                );
              } else {
                // EMPTY SLOT - Show skeleton (clickable to trigger provider selection)
                return (
                  <div
                    key={slot.index}
                    className={`${SELECTED_ROW_HEIGHT} ${assetType === 'clearlogo' ? 'min-w-32' : ''} flex-shrink-0 border-2 border-dashed border-neutral-600 rounded bg-neutral-800/30 flex items-center justify-center cursor-pointer hover:border-primary-500 transition-colors`}
                    style={skeletonWidthPx && assetType !== 'clearlogo' ? { width: `${skeletonWidthPx}px` } : undefined}
                    onClick={() => {
                      // Scroll to provider grid when clicking empty slot
                      document.querySelector('.overflow-y-auto')?.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
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
                );
              }
            })}
          </div>
        </div>

        {/* BOTTOM SECTION: Available Candidates */}
        <div className="flex-1 overflow-y-auto px-6 py-3">
          {/* Loading State */}
          {isLoadingProviders && (
            <div className="text-center py-12">
              <FontAwesomeIcon icon={faSpinner} spin className="text-4xl text-primary-500 mb-4" />
              <p className="text-neutral-300">Fetching assets from providers...</p>
            </div>
          )}

          {/* Error State */}
          {providerError && (
            <div className="bg-error/20 border border-error rounded-md p-4 mb-6">
              <div className="flex items-center gap-3">
                <FontAwesomeIcon icon={faExclamationTriangle} className="text-error text-xl" />
                <div>
                  <h4 className="font-semibold text-white mb-1">Failed to fetch assets</h4>
                  <p className="text-sm text-neutral-300">
                    {providerError instanceof Error ? providerError.message : 'Unknown error'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Grid of available assets */}
          {!isLoadingProviders && !providerError && (
            <>
              {candidates.length === 0 ? (
                <div className="text-center py-12 bg-neutral-800/30 rounded border border-dashed border-neutral-700">
                  <p className="text-neutral-400">No assets found from providers</p>
                </div>
              ) : (
                <div className={`grid ${gridCols} gap-2`}>
                  {candidates.map((candidate, idx) => {
                    const isSelected = slots.some(s => s.pending?.url === candidate.url);
                    const canSelect = slots.filter(s => (s.current && !s.removed) || s.pending).length < maxLimit;

                    return (
                      <div
                        key={`candidate-${idx}`}
                        className={`relative group ${
                          isSelected
                            ? 'cursor-not-allowed'
                            : canSelect
                            ? 'cursor-pointer'
                            : 'cursor-not-allowed opacity-50'
                        }`}
                        onClick={() => !isSelected && canSelect && handleCandidateSelect(candidate)}
                      >
                        {/* Special handling for clearlogo: fixed height with object-contain */}
                        {assetType === 'clearlogo' ? (
                          <div
                            className={`relative min-h-24 w-full bg-neutral-800/50 rounded flex items-center justify-center p-3 border-2 transition-all ${
                              isSelected
                                ? 'border-neutral-600 opacity-40'
                                : canSelect
                                ? 'border-neutral-700 hover:border-primary-500 hover:shadow-lg hover:shadow-primary-500/20'
                                : 'border-neutral-700'
                            }`}
                          >
                            <img
                              src={candidate.url}
                              alt={`Option ${idx + 1}`}
                              className="w-full h-auto object-contain"
                              loading="lazy"
                            />
                          </div>
                        ) : (
                          <div
                            className={`${aspectRatio} bg-neutral-800 rounded overflow-hidden border-2 transition-all ${
                              isSelected
                                ? 'border-neutral-600 opacity-40'
                                : canSelect
                                ? 'border-neutral-700 hover:border-primary-500 hover:shadow-lg hover:shadow-primary-500/20'
                                : 'border-neutral-700'
                            }`}
                          >
                            <img
                              src={candidate.url}
                              alt={`Option ${idx + 1}`}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}

                        {/* Selected overlay */}
                        {isSelected && (
                          <div className="absolute inset-0 bg-primary-500/40 flex items-center justify-center">
                            <div className="bg-primary-500 rounded-full p-2">
                              <FontAwesomeIcon icon={faCheck} className="text-white text-lg" />
                            </div>
                          </div>
                        )}

                        {/* Hover overlay for available assets */}
                        {!isSelected && canSelect && (
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

                        {/* Info overlay at bottom - only on hover */}
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="text-[9px] text-white font-semibold truncate">
                            {getProviderDisplayName((candidate as any).providerId || 'Unknown')}
                          </div>
                          {candidate.width && candidate.height && (
                            <div className="text-[9px] text-neutral-300">
                              {candidate.width}×{candidate.height}
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
                  disabled={slots.filter(s => (s.current && !s.removed) || s.pending).length >= maxLimit}
                  type="button"
                >
                  <FontAwesomeIcon icon={faUpload} className="mr-2" />
                  Upload
                </Button>
              )}
            </div>

            {/* Right side - Action buttons */}
            <div className="flex gap-2">
              <Button
                onClick={onClose}
                variant="outline"
                type="button"
              >
                Cancel
              </Button>
              <Button
                onClick={handleApply}
                disabled={!hasChanges || isApplying}
                type="button"
              >
                {isApplying && <FontAwesomeIcon icon={faSpinner} spin className="mr-2" />}
                Save ({slots.filter(s => (s.current && !s.removed) || s.pending).length})
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
