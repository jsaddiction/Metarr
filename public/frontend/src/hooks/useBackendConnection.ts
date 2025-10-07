import { useState, useEffect, useCallback, useRef } from 'react';
import { globalConnectionMonitor } from './useConnectionMonitor';

interface BackendConnectionState {
  isConnected: boolean;
  error: string | null;
  lastChecked: Date | null;
}

const HEALTH_CHECK_INTERVAL = 15000; // Check every 15 seconds when connected
const RETRY_INTERVAL = 3000; // Retry every 3 seconds when disconnected
const HEALTH_ENDPOINT = '/api/health';
const REQUEST_TIMEOUT = 5000; // 5 second timeout for health checks

export const useBackendConnection = () => {
  const [state, setState] = useState<BackendConnectionState>({
    isConnected: true,
    error: null,
    lastChecked: null,
  });

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const checkConnection = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

      const response = await fetch(HEALTH_ENDPOINT, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        setState({
          isConnected: true,
          error: null,
          lastChecked: new Date(),
        });

        // Update global connection monitor
        globalConnectionMonitor.setConnected(true);

        // If we recovered from an error, switch to normal interval
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
        intervalRef.current = setInterval(checkConnection, HEALTH_CHECK_INTERVAL);

        return true;
      } else {
        throw new Error(`Server returned ${response.status}`);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error && error.name === 'AbortError'
          ? 'Backend server is not responding. Please check if the server is running.'
          : 'Unable to connect to backend server. Please check your connection.';

      setState({
        isConnected: false,
        error: errorMessage,
        lastChecked: new Date(),
      });

      // Update global connection monitor
      globalConnectionMonitor.setConnected(false);

      // If we're disconnected, check more frequently
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      retryTimeoutRef.current = setTimeout(checkConnection, RETRY_INTERVAL);

      return false;
    }
  }, []);

  const dismissError = useCallback(() => {
    setState((prev) => ({
      ...prev,
      error: null,
    }));
  }, []);

  useEffect(() => {
    // Initial health check
    checkConnection();

    // Cleanup on unmount
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [checkConnection]);

  return {
    ...state,
    dismissError,
    recheckConnection: checkConnection,
  };
};
