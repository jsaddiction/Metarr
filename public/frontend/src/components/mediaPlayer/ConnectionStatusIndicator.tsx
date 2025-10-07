import React from 'react';
import { ConnectionStatus } from '../../types/mediaPlayer';

interface ConnectionStatusIndicatorProps {
  status: ConnectionStatus;
  lastConnected?: string;
  lastError?: string;
}

export const ConnectionStatusIndicator: React.FC<ConnectionStatusIndicatorProps> = ({
  status,
  lastConnected,
  lastError,
}) => {
  const getStatusClass = () => {
    switch (status) {
      case 'connected':
        return 'status-connected';
      case 'error':
        return 'bg-error';
      default:
        return 'bg-neutral-600';
    }
  };

  const getTooltipText = () => {
    if (status === 'connected' && lastConnected) {
      return `Connected since ${new Date(lastConnected).toLocaleString()}`;
    }
    if (status === 'error' && lastError) {
      return `Error: ${lastError}`;
    }
    return 'Disconnected';
  };

  return (
    <div className="absolute top-2 right-2" title={getTooltipText()}>
      <div className={`w-3 h-3 rounded-full ${getStatusClass()}`} />
    </div>
  );
};