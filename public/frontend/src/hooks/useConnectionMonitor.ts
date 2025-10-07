import { useEffect } from 'react';

/**
 * Hook to report SSE connection errors to the global connection monitor
 * Use this in components that maintain SSE connections
 */
export const useSSEConnectionMonitor = (
  eventSource: EventSource | null,
  onConnectionLost?: () => void
) => {
  useEffect(() => {
    if (!eventSource) return;

    const handleError = () => {
      // Notify parent component
      onConnectionLost?.();

      // Could also dispatch a custom event for global monitoring
      window.dispatchEvent(new CustomEvent('sse-connection-error', {
        detail: { timestamp: new Date() }
      }));
    };

    eventSource.addEventListener('error', handleError);

    return () => {
      eventSource.removeEventListener('error', handleError);
    };
  }, [eventSource, onConnectionLost]);
};

/**
 * Global connection state that can be accessed from anywhere
 */
class ConnectionMonitor {
  private listeners: Set<(connected: boolean) => void> = new Set();
  private connected: boolean = true;

  subscribe(callback: (connected: boolean) => void) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  setConnected(connected: boolean) {
    if (this.connected !== connected) {
      this.connected = connected;
      this.listeners.forEach(listener => listener(connected));
    }
  }

  isConnected() {
    return this.connected;
  }
}

export const globalConnectionMonitor = new ConnectionMonitor();
