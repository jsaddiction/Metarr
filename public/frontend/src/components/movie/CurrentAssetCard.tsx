/**
 * CurrentAssetCard Component
 *
 * Displays a currently selected asset with provider source badge.
 * Uses the reusable ZoomableImage component for consistent zoom behavior.
 */

import React from 'react';
import { ZoomableImage } from '../ui/ZoomableImage';
import { getProviderDisplayName } from '../../utils/providerNames';

interface CurrentAssetCardProps {
  imageFileId: number;
  imageUrl: string;
  assetType: string;
  aspectRatio?: string;
  source: string;
  onRemove: (imageFileId: number) => void;
}

export const CurrentAssetCard: React.FC<CurrentAssetCardProps> = ({
  imageFileId,
  imageUrl,
  assetType,
  aspectRatio = 'aspect-[2/3]',
  source,
  onRemove,
}) => {
  const displayName = getProviderDisplayName(source);

  return (
    <ZoomableImage
      src={imageUrl}
      alt={`${assetType} from ${displayName}`}
      aspectRatio={aspectRatio}
      badge={displayName}
      badgeAriaLabel={`Source: ${displayName}`}
    />
  );
};
