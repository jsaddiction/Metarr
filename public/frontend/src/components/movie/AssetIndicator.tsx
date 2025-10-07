import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { AssetStatus } from '../../types/movie';

interface AssetIndicatorProps {
  icon: IconDefinition;
  status: AssetStatus;
  count?: number;
  tooltip: string;
  showCount?: boolean;
}

export const AssetIndicator = React.memo<AssetIndicatorProps>(({
  icon,
  status,
  count = 0,
  tooltip,
  showCount = false
}) => {
  const getStatusColor = (status: AssetStatus): string => {
    switch (status) {
      case 'complete':
        return 'text-success';
      case 'partial':
        return 'text-warning';
      case 'none':
      default:
        return 'text-neutral-600';
    }
  };

  return (
    <div className="relative inline-flex items-center" title={tooltip}>
      <FontAwesomeIcon
        icon={icon}
        className={`w-4 h-4 ${getStatusColor(status)}`}
      />
      {showCount && count > 1 && (
        <span className="absolute -top-1 -right-1 bg-primary-500 text-white text-xs rounded-full px-1 min-w-[16px] h-4 flex items-center justify-center">
          {count}
        </span>
      )}
    </div>
  );
});

AssetIndicator.displayName = 'AssetIndicator';
