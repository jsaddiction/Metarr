import React, { useState } from 'react';
import { AssetSelectionDialog } from './AssetSelectionDialog';
import { AssetCandidate, AssetType } from '../../types/asset';

/**
 * Example Usage Component
 *
 * This component demonstrates how to integrate the AssetSelectionDialog
 * into your existing movie editor or images tab.
 *
 * Integration Steps:
 *
 * 1. Import the dialog:
 *    import { AssetSelectionDialog } from '../../components/asset';
 *
 * 2. Add state for dialog open/close and selected asset type:
 *    const [isDialogOpen, setIsDialogOpen] = useState(false);
 *    const [selectedAssetType, setSelectedAssetType] = useState<AssetType>('poster');
 *
 * 3. Add click handler to your asset slot (e.g., poster thumbnail):
 *    onClick={() => {
 *      setSelectedAssetType('poster');
 *      setIsDialogOpen(true);
 *    }}
 *
 * 4. Render the dialog:
 *    <AssetSelectionDialog
 *      isOpen={isDialogOpen}
 *      onClose={() => setIsDialogOpen(false)}
 *      onSelect={handleAssetSelect}
 *      movieId={movieId}
 *      assetType={selectedAssetType}
 *      currentAsset={currentAssets[selectedAssetType]}
 *    />
 *
 * 5. Handle selection:
 *    const handleAssetSelect = async (asset: AssetCandidate, provider: string) => {
 *      // Download and save the asset
 *      await api.saveAsset(movieId, asset, provider);
 *      // Refresh your images
 *      refetch();
 *    };
 */

interface ExampleProps {
  movieId: number;
}

export const AssetSelectionExample: React.FC<ExampleProps> = ({ movieId }) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedAssetType, setSelectedAssetType] = useState<AssetType>('poster');

  const handleAssetSelect = async (asset: AssetCandidate, provider: string) => {
    console.log('Selected asset:', {
      assetType: asset.assetType,
      provider,
      url: asset.url,
      width: asset.width,
      height: asset.height,
    });

    // TODO: Implement your asset save logic here
    // Example:
    // await api.saveAsset(movieId, {
    //   assetType: asset.assetType,
    //   url: asset.url,
    //   provider,
    // });

    // Close dialog after selection
    setIsDialogOpen(false);
  };

  return (
    <div className="p-6">
      <h2 className="text-2xl font-semibold mb-4">Asset Selection Example</h2>

      <div className="grid grid-cols-4 gap-4 mb-6">
        {(['poster', 'fanart', 'banner', 'clearlogo'] as AssetType[]).map((type) => (
          <button
            key={type}
            onClick={() => {
              setSelectedAssetType(type);
              setIsDialogOpen(true);
            }}
            className="btn btn-primary"
          >
            Select {type}
          </button>
        ))}
      </div>

      <AssetSelectionDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        onSelect={handleAssetSelect}
        movieId={movieId}
        assetType={selectedAssetType}
      />
    </div>
  );
};
