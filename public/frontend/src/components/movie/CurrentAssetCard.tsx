/**
 * CurrentAssetCard Component
 *
 * Displays a currently selected asset with provider source badge.
 * Uses the reusable ZoomableImage component for consistent zoom behavior.
 */

import React from 'react';
import { ZoomableImage } from '../ui/ZoomableImage';

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
  return (
    <ZoomableImage
      src={imageUrl}
      alt={`${assetType} from ${source}`}
      aspectRatio={aspectRatio}
      badge={source}
      badgeAriaLabel={`Source: ${source}`}
    />
  );
};
