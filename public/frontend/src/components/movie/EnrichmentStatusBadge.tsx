import React from 'react';

type EnrichmentStatus = 'unidentified' | 'identified' | 'enriched';

interface EnrichmentStatusBadgeProps {
  status: EnrichmentStatus;
  showLabel?: boolean;
  size?: 'sm' | 'md';
}

/**
 * Badge component showing movie enrichment workflow state
 * - unidentified: Gray (needs identification)
 * - identified: Yellow (enrichment in progress)
 * - enriched: Green (complete)
 */
export const EnrichmentStatusBadge: React.FC<EnrichmentStatusBadgeProps> = ({
  status,
  showLabel = true,
  size = 'md',
}) => {
  const statusConfig = {
    unidentified: {
      label: 'Unidentified',
      bgColor: 'bg-neutral-600',
      textColor: 'text-neutral-200',
      dotColor: 'bg-neutral-400',
    },
    identified: {
      label: 'Enriching',
      bgColor: 'bg-yellow-600/20',
      textColor: 'text-yellow-400',
      dotColor: 'bg-yellow-400',
    },
    enriched: {
      label: 'Enriched',
      bgColor: 'bg-green-600/20',
      textColor: 'text-green-400',
      dotColor: 'bg-green-400',
    },
  };

  const config = statusConfig[status];
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm';

  return (
    <span
      className={`
        inline-flex items-center gap-1.5 rounded-full
        ${config.bgColor} ${config.textColor} ${sizeClasses}
        font-medium
      `}
      title={`Status: ${config.label}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dotColor}`} />
      {showLabel && <span>{config.label}</span>}
    </span>
  );
};
