import React from 'react';

interface PopularityIndicatorProps {
  value: number | null;
  className?: string;
}

/**
 * Display TMDB popularity metric
 */
export const PopularityIndicator: React.FC<PopularityIndicatorProps> = ({ value, className = '' }) => {
  if (value === null || value === undefined) {
    return null;
  }

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <span className="text-xs font-medium text-neutral-400">Popularity:</span>
      <span className="text-sm font-semibold text-neutral-200">
        {value.toFixed(1)}
      </span>
    </div>
  );
};
