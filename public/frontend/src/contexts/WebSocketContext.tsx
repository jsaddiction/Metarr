/**
 * WebSocket Context - Provides WebSocket connection to React components
 */

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ResilientWebSocket } from '../services/ResilientWebSocket';
import { ConnectionState, ServerMessage } from '../types/websocket';

interface WebSocketContextValue {
  ws: ResilientWebSocket | null;
  connectionState: ConnectionState;
  isConnected: boolean;
}

const WebSocketContext = createContext<WebSocketContextValue | undefined>(undefined);

interface WebSocketProviderProps {
  children: ReactNode;
}

// Singleton WebSocket instance (survives React StrictMode re-renders)
let globalWs: ResilientWebSocket | null = null;
let globalConnectionState: ConnectionState = 'disconnected';

export const WebSocketProvider: React.FC<WebSocketProviderProps> = ({ children }) => {
  const queryClient = useQueryClient();
  const [connectionState, setConnectionState] = useState<ConnectionState>(globalConnectionState);

  useEffect(() => {
    // Only create WebSocket if it doesn't exist
    if (!globalWs) {
      // Determine WebSocket URL based on current location
      // In development, Vite proxy will forward /ws to backend (ws://localhost:3000/ws)
      // In production, /ws will connect directly to the backend on the same host
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.hostname;
      const port = window.location.port;
      const wsUrl = `${protocol}//${host}:${port}/ws`;

      console.log('[WebSocketContext] Initializing WebSocket connection to', wsUrl);

      // Create WebSocket instance
      globalWs = new ResilientWebSocket({
        url: wsUrl,
        reconnectInterval: 1000,
        maxReconnectInterval: 30000,
        pingInterval: 30000,
      });

      // Subscribe to connection state changes
      globalWs.onStateChange((state) => {
        globalConnectionState = state;
        setConnectionState(state);
      });

      // Subscribe to server messages and invalidate queries
      globalWs.on('*', (message: ServerMessage) => {
        handleServerMessage(message);
      });

      // Connect
      globalWs.connect();
    } else {
      // WebSocket already exists, just sync state
      console.log('[WebSocketContext] Reusing existing WebSocket connection');
      setConnectionState(globalConnectionState);
    }

    // No cleanup - WebSocket persists for app lifetime
    // Only disconnect when user closes tab/navigates away (handled by browser)
  }, []);

  /**
   * Handle server messages and invalidate relevant queries
   */
  const handleServerMessage = React.useCallback((message: ServerMessage) => {
    switch (message.type) {
      case 'welcome':
        console.log('[WebSocket] Welcome message:', message);
        break;

      case 'moviesChanged':
        // Invalidate movies queries
        queryClient.invalidateQueries({ queryKey: ['movies'] });
        if (message.movieIds.length > 0) {
          message.movieIds.forEach((id) => {
            queryClient.invalidateQueries({ queryKey: ['movie', id] });
            queryClient.invalidateQueries({ queryKey: ['movieImages', id] });
            queryClient.invalidateQueries({ queryKey: ['movieExtras', id] });
          });
        }
        break;

      case 'playerStatus':
        // Invalidate player queries
        queryClient.invalidateQueries({ queryKey: ['players'] });
        queryClient.invalidateQueries({ queryKey: ['player', message.playerId] });
        queryClient.invalidateQueries({ queryKey: ['playerStatus'] });
        break;

      case 'scanStatus':
        // Invalidate scan queries
        queryClient.invalidateQueries({ queryKey: ['activeScans'] });
        queryClient.invalidateQueries({ queryKey: ['scan', message.scanId] });
        break;

      case 'libraryChanged':
        // Invalidate library queries
        queryClient.invalidateQueries({ queryKey: ['libraries'] });
        queryClient.invalidateQueries({ queryKey: ['library', message.libraryId] });
        break;

      case 'resyncData':
        // Full resync - invalidate everything in scope
        if (message.scope === 'all') {
          queryClient.invalidateQueries();
        } else {
          queryClient.invalidateQueries({ queryKey: [message.scope] });
        }
        break;

      case 'error':
        console.error('[WebSocket] Server error:', message);
        break;

      case 'conflict':
        console.warn('[WebSocket] Data conflict:', message);
        // Invalidate the affected query to refetch fresh data
        queryClient.invalidateQueries();
        break;

      default:
        // Handle other message types
        break;
    }
  }, [queryClient]);

  const value: WebSocketContextValue = {
    ws: globalWs,
    connectionState,
    isConnected: connectionState === 'connected',
  };

  return <WebSocketContext.Provider value={value}>{children}</WebSocketContext.Provider>;
};

/**
 * Hook to access WebSocket connection
 */
export const useWebSocket = (): WebSocketContextValue => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
};
