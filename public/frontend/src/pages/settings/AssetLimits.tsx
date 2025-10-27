/**
 * Asset Limits Settings Page
 *
 * Allows users to configure the maximum number of assets (posters, fanart, etc.)
 * that can be selected per media item.
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner, faUndo, faInfoCircle } from '@fortawesome/free-solid-svg-icons';
import { useConfirm } from '../../hooks/useConfirm';

interface AssetLimitMetadata {
  assetType: string;
  displayName: string;
  defaultMax: number;
  minAllowed: number;
  maxAllowed: number;
  description: string;
  currentLimit: number;
}

export const AssetLimits: React.FC = () => {
  // Accessible confirmation dialog
  const { confirm, ConfirmDialog } = useConfirm();

  const queryClient = useQueryClient();
  const [localLimits, setLocalLimits] = useState<Record<string, number>>({});

  // Fetch asset limits with metadata
  const { data: limitsData, isLoading } = useQuery<AssetLimitMetadata[]>({
    queryKey: ['asset-limits-metadata'],
    queryFn: async () => {
      const response = await fetch('/api/settings/asset-limits/metadata');
      if (!response.ok) throw new Error('Failed to fetch asset limits');
      return response.json();
    },
  });

  // Update asset limit mutation
  const updateLimitMutation = useMutation({
    mutationFn: async ({ assetType, limit }: { assetType: string; limit: number }) => {
      const response = await fetch(`/api/settings/asset-limits/${assetType}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update limit');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asset-limits'] });
      queryClient.invalidateQueries({ queryKey: ['asset-limits-metadata'] });
      setLocalLimits({});
    },
  });

  // Reset limit mutation
  const resetLimitMutation = useMutation({
    mutationFn: async (assetType: string) => {
      const response = await fetch(`/api/settings/asset-limits/${assetType}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to reset limit');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asset-limits'] });
      queryClient.invalidateQueries({ queryKey: ['asset-limits-metadata'] });
      setLocalLimits({});
    },
  });

  // Reset all limits mutation
  const resetAllMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/settings/asset-limits/reset-all', {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to reset all limits');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asset-limits'] });
      queryClient.invalidateQueries({ queryKey: ['asset-limits-metadata'] });
      setLocalLimits({});
    },
  });

  const handleLimitChange = (assetType: string, value: number) => {
    setLocalLimits((prev) => ({ ...prev, [assetType]: value }));
  };

  const handleSave = (assetType: string, limit: number) => {
    updateLimitMutation.mutate({ assetType, limit });
  };

  const handleReset = async (assetType: string) => {
    const confirmed = await confirm({
      title: 'Reset Asset Limit',
      description: `Reset ${assetType} limit to default?`,
      confirmText: 'Reset',
      cancelText: 'Cancel',
    });

    if (confirmed) {
      resetLimitMutation.mutate(assetType);
    }
  };

  const handleResetAll = async () => {
    const confirmed = await confirm({
      title: 'Reset All Asset Limits',
      description: 'Reset all asset limits to defaults? This will affect all asset types.',
      confirmText: 'Reset All',
      cancelText: 'Cancel',
      variant: 'destructive',
    });

    if (confirmed) {
      resetAllMutation.mutate();
    }
  };

  const getCurrentLimit = (assetType: string, currentLimit: number) => {
    return localLimits[assetType] !== undefined ? localLimits[assetType] : currentLimit;
  };

  const hasLocalChanges = (assetType: string) => {
    return localLimits[assetType] !== undefined;
  };

  if (isLoading) {
    return (
      <div className="content-spacing">
        <div className="text-center py-12">
          <FontAwesomeIcon icon={faSpinner} spin className="text-3xl text-neutral-400 mb-3" />
          <div className="text-neutral-400">Loading asset limits...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="content-spacing">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-2">Asset Limits Configuration</h1>
        <p className="text-neutral-400 text-sm">
          Configure the maximum number of assets (posters, fanart, etc.) that can be selected per media item.
          Set to 0 to disable an asset type entirely.
        </p>
      </div>

      {/* Info Card */}
      <Card className="mb-6 border-primary-500/30 bg-primary-900/10">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <FontAwesomeIcon icon={faInfoCircle} className="text-primary-500 text-xl flex-shrink-0 mt-0.5" />
            <div className="text-sm text-neutral-300 space-y-2">
              <p>
                <strong>Media Player Compatibility:</strong> These limits are based on capabilities of Kodi, Jellyfin, and Plex.
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li><strong>Posters & Fanart:</strong> Support multiple images. Kodi rotates fanart in slideshows.</li>
                <li><strong>Banner, Logo, Art:</strong> Most players use a single image.</li>
                <li><strong>Disabled (0):</strong> Asset type won't be shown or enriched.</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Asset Limits Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {limitsData?.map((asset) => {
          const currentValue = getCurrentLimit(asset.assetType, asset.currentLimit);
          const hasChanges = hasLocalChanges(asset.assetType);
          const isDefault = asset.currentLimit === asset.defaultMax && !hasChanges;

          return (
            <Card key={asset.assetType}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{asset.displayName}</span>
                  {isDefault && (
                    <span className="text-xs font-normal text-neutral-500">(Default)</span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-neutral-400">{asset.description}</p>

                <div>
                  <Label htmlFor={`limit-${asset.assetType}`} className="text-sm font-medium text-neutral-300 mb-2 block">
                    Maximum Limit
                  </Label>
                  <input
                    id={`limit-${asset.assetType}`}
                    type="number"
                    min={asset.minAllowed}
                    max={asset.maxAllowed}
                    value={currentValue}
                    onChange={(e) => handleLimitChange(asset.assetType, parseInt(e.target.value, 10))}
                    className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <p className="text-xs text-neutral-500 mt-1">
                    Range: {asset.minAllowed} - {asset.maxAllowed} (Default: {asset.defaultMax})
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={() => handleSave(asset.assetType, currentValue)}
                    disabled={!hasChanges || updateLimitMutation.isPending}
                    size="sm"
                  >
                    {updateLimitMutation.isPending ? (
                      <>
                        <FontAwesomeIcon icon={faSpinner} spin className="mr-2" />
                        Saving...
                      </>
                    ) : (
                      'Save'
                    )}
                  </Button>
                  {!isDefault && (
                    <Button
                      onClick={() => handleReset(asset.assetType)}
                      disabled={resetLimitMutation.isPending}
                      variant="outline"
                      size="sm"
                    >
                      <FontAwesomeIcon icon={faUndo} className="mr-2" />
                      Reset to Default
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Reset All Button */}
      <div className="mt-6 flex justify-end">
        <Button
          onClick={handleResetAll}
          disabled={resetAllMutation.isPending}
          variant="outline"
        >
          <FontAwesomeIcon icon={faUndo} className="mr-2" />
          Reset All to Defaults
        </Button>
      </div>

      {/* Accessible Confirmation Dialog */}
      <ConfirmDialog />
    </div>
  );
};
