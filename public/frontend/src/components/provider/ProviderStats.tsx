import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChartLine } from '@fortawesome/free-solid-svg-icons';

interface ProviderStatsProps {
  // Future: stats?: ProviderStats from backend
}

export const ProviderStats: React.FC<ProviderStatsProps> = () => {
  // Placeholder implementation
  // TODO: Integrate with backend statistics API when available
  return (
    <div className="text-sm text-neutral-400 flex items-center gap-4 pt-2 border-t border-neutral-700">
      <div className="flex items-center gap-2">
        <FontAwesomeIcon icon={faChartLine} className="text-neutral-500" />
        <span>Statistics available after backend implementation</span>
      </div>
    </div>
  );
};
