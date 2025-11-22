/**
 * EnrichmentHealthBadge - Color-coded badge for metadata completeness
 * Phase 5: Multi-Provider Metadata Aggregation
 */

import React from 'react';
import { Badge } from './badge';
import { cn } from '@/lib/utils';

interface EnrichmentHealthBadgeProps {
  completeness: number; // 0-100
  partial?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const EnrichmentHealthBadge: React.FC<EnrichmentHealthBadgeProps> = ({
  completeness,
  partial = false,
  size = 'md',
  className,
}) => {
  // Determine color and icon based on completeness
  const getColorClasses = () => {
    if (partial) {
      return 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800';
    }

    if (completeness >= 90) {
      return 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800';
    }

    if (completeness >= 60) {
      return 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800';
    }

    return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800';
  };

  const getIcon = () => {
    if (partial) {
      return '⚠';
    }

    if (completeness >= 90) {
      return '✓';
    }

    if (completeness >= 60) {
      return '●';
    }

    return '!';
  };

  const getSizeClasses = () => {
    switch (size) {
      case 'sm':
        return 'text-xs px-1.5 py-0.5';
      case 'lg':
        return 'text-base px-3 py-1';
      case 'md':
      default:
        return 'text-sm px-2 py-0.5';
    }
  };

  return (
    <Badge
      variant="outline"
      className={cn(
        'font-semibold tabular-nums',
        getColorClasses(),
        getSizeClasses(),
        className
      )}
      aria-label={`Metadata completeness: ${completeness}%${partial ? ' (partial)' : ''}`}
    >
      <span className="mr-1" aria-hidden="true">
        {getIcon()}
      </span>
      {completeness}%
    </Badge>
  );
};
