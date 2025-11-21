import React from 'react';

interface StatusBadgeProps {
  status: string | null;
}

const STATUS_CONFIG: Record<string, { color: string; bgColor: string; dotColor: string }> = {
  'Released': {
    color: 'text-green-400',
    bgColor: 'bg-green-600/20',
    dotColor: 'bg-green-400',
  },
  'Post Production': {
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-600/20',
    dotColor: 'bg-yellow-400',
  },
  'In Production': {
    color: 'text-blue-400',
    bgColor: 'bg-blue-600/20',
    dotColor: 'bg-blue-400',
  },
  'Rumored': {
    color: 'text-neutral-400',
    bgColor: 'bg-neutral-600/20',
    dotColor: 'bg-neutral-400',
  },
  'Canceled': {
    color: 'text-red-400',
    bgColor: 'bg-red-600/20',
    dotColor: 'bg-red-400',
  },
};

const DEFAULT_CONFIG = {
  color: 'text-neutral-400',
  bgColor: 'bg-neutral-600/20',
  dotColor: 'bg-neutral-400',
};

/**
 * Color-coded badge for production status
 */
export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  if (!status) {
    return null;
  }

  const config = STATUS_CONFIG[status] || DEFAULT_CONFIG;

  return (
    <span
      className={`
        inline-flex items-center gap-1.5 px-2.5 py-1
        rounded-full font-medium text-xs
        ${config.bgColor} ${config.color}
      `}
      title={`Status: ${status}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dotColor}`} />
      <span>{status}</span>
    </span>
  );
};
