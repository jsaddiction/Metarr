import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircle } from '@fortawesome/free-solid-svg-icons';

interface ConnectionBadgeProps {
  mode: 'websocket' | 'http' | 'disconnected';
  className?: string;
}

export const ConnectionBadge: React.FC<ConnectionBadgeProps> = ({ mode, className = '' }) => {
  const config = {
    websocket: {
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
      label: 'WebSocket',
      tooltip: 'Live connection via WebSocket (port 9090)',
    },
    http: {
      color: 'text-orange-500',
      bgColor: 'bg-orange-500/10',
      label: 'HTTP',
      tooltip: 'HTTP polling every 30 seconds',
    },
    disconnected: {
      color: 'text-red-500',
      bgColor: 'bg-red-500/10',
      label: 'Offline',
      tooltip: 'Disconnected - attempting to reconnect',
    },
  };

  const { color, bgColor, label, tooltip } = config[mode];

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full ${bgColor} ${className}`}
      title={tooltip}
    >
      <FontAwesomeIcon icon={faCircle} className={`${color} text-[8px]`} />
      <span className={`text-xs font-medium ${color}`}>{label}</span>
    </div>
  );
};
