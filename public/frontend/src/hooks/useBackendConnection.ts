import { useState, useEffect, useCallback } from 'react';
import { useWebSocket } from '../contexts/WebSocketContext';
import { globalConnectionMonitor } from './useConnectionMonitor';

interface BackendConnectionState {
  isConnected: boolean;
  error: string | null;
  lastChecked: Date | null;
}

export const useBackendConnection = () => {
  const { connectionState, isConnected } = useWebSocket();
  const [state, setState] = useState<BackendConnectionState>({
    isConnected: true,
    error: null,
    lastChecked: null,
  });

  useEffect(() => {
    // Update state based on WebSocket connection
    const now = new Date();

    if (connectionState === 'connected') {
      setState({
        isConnected: true,
        error: null,
        lastChecked: now,
      });
      globalConnectionMonitor.setConnected(true);
    } else if (connectionState === 'error') {
      setState({
        isConnected: false,
        error: 'Backend server disconnected. Attempting to reconnect...',
        lastChecked: now,
      });
      globalConnectionMonitor.setConnected(false);
    } else if (connectionState === 'disconnected') {
      setState({
        isConnected: false,
        error: 'Backend server disconnected. Attempting to reconnect...',
        lastChecked: now,
      });
      globalConnectionMonitor.setConnected(false);
    } else if (connectionState === 'connecting') {
      // Keep showing error during reconnection attempts
      setState((prev) => ({
        isConnected: false,
        error: prev.error || 'Connecting to backend server...',
        lastChecked: now,
      }));
    }
  }, [connectionState]);

  const dismissError = useCallback(() => {
    setState((prev) => ({
      ...prev,
      error: null,
    }));
  }, []);

  const recheckConnection = useCallback(() => {
    // WebSocket automatically handles reconnection
    // This is just for compatibility with existing code
    return Promise.resolve(isConnected);
  }, [isConnected]);

  return {
    ...state,
    dismissError,
    recheckConnection,
  };
};
