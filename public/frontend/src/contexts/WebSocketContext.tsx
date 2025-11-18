/**
 * WebSocket Context - Provides WebSocket connection to React components
 */

import React, { createContext, useContext, useEffect, useState, useRef, useCallback, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ResilientWebSocket } from '../services/ResilientWebSocket';
import { ConnectionState, ServerMessage } from '../types/websocket';
import { Job } from '../hooks/useJobs';

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

  // Batching for enrichment updates (avoid UI spam during bulk enrichment)
  const enrichmentBatchRef = useRef<Set<number>>(new Set());
  const enrichmentTimerRef = useRef<NodeJS.Timeout | null>(null);

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

        // Show toast notifications for connection state changes (except initial connection)
        if (state === 'error') {
          console.error('[WebSocket] Connection error');
          // Don't show toast on initial connection error (too spammy)
        } else if (state === 'connected' && globalWs && (globalWs as any).reconnectAttempts > 0) {
          toast.success('WebSocket reconnected', {
            description: 'Real-time updates restored',
          });
        }
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

    // Cleanup function to prevent memory leaks
    return () => {
      // Clear any pending enrichment batch timers
      if (enrichmentTimerRef.current) {
        clearTimeout(enrichmentTimerRef.current);
        enrichmentTimerRef.current = null;
      }
      // Note: WebSocket persists for app lifetime (singleton pattern)
      // Only disconnect when user closes tab/navigates away (handled by browser)
    };
  }, []);

  /**
   * Batch enrichment updates to avoid spamming the UI
   * Collects movie IDs and flushes after 500ms of no new updates
   */
  const batchEnrichmentUpdate = useCallback((movieId: number) => {
    enrichmentBatchRef.current.add(movieId);

    // Clear existing timer
    if (enrichmentTimerRef.current) {
      clearTimeout(enrichmentTimerRef.current);
    }

    // Flush batch after 500ms of no new updates
    enrichmentTimerRef.current = setTimeout(() => {
      const batch = Array.from(enrichmentBatchRef.current);
      enrichmentBatchRef.current.clear();

      console.log(`[WebSocket] Flushing batch of ${batch.length} enrichment updates`);

      // Invalidate queries for all movies in batch
      batch.forEach((id) => {
        queryClient.invalidateQueries({ queryKey: ['movie', id] });
        queryClient.invalidateQueries({ queryKey: ['movieImages', id] });
        queryClient.invalidateQueries({ queryKey: ['movieExtras', id] });
      });

      // Refetch movies list once for all updates
      queryClient.refetchQueries({ queryKey: ['movies'] });
    }, 500);
  }, [queryClient]);

  /**
   * Handle server messages and invalidate relevant queries
   */
  const handleServerMessage = React.useCallback((message: ServerMessage) => {
    switch (message.type) {
      case 'welcome':
        console.log('[WebSocket] Welcome message:', message);
        break;

      case 'moviesChanged':
        // Use batching for enrichment updates (avoid UI spam during bulk enrichment)
        if (message.movieIds && message.movieIds.length > 0) {
          // Batch updates for enrichment to avoid spamming
          message.movieIds.forEach((id) => batchEnrichmentUpdate(id));

          // Also invalidate actors since they're discovered during movie scanning
          queryClient.invalidateQueries({ queryKey: ['actors'] });
        } else {
          // Non-enrichment updates (immediate refetch)
          queryClient.invalidateQueries({ queryKey: ['movies'] });
          queryClient.refetchQueries({ queryKey: ['movies'] });
          queryClient.invalidateQueries({ queryKey: ['actors'] });
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

        // Force refetch movies list during scanning to show newly discovered movies in real-time
        // Using refetchQueries instead of invalidateQueries to trigger immediate update
        queryClient.refetchQueries({ queryKey: ['movies'] });

        // Also invalidate actors since they're discovered during movie scanning
        queryClient.invalidateQueries({ queryKey: ['actors'] });

        if (message.status === 'completed') {
          console.log('[WebSocket] Scan completed - movies and actors refetched');
        } else if (message.status === 'running') {
          console.log('[WebSocket] Scan progress - movies and actors refetched');
        }
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

      case 'job:started':
        // Job started - invalidate jobs list and stats
        queryClient.invalidateQueries({ queryKey: ['jobs'] });
        queryClient.invalidateQueries({ queryKey: ['jobStats'] });
        break;

      case 'job:progress':
        // Update specific job progress optimistically
        if ((message as any).jobId !== undefined) {
          queryClient.setQueryData<Job[]>(['jobs'], (old) => {
            if (!old) return old;
            return old.map(job =>
              job.id === (message as any).jobId
                ? { ...job, progress: (message as any).progress, message: (message as any).message }
                : job
            );
          });
        }
        break;

      case 'job:completed':
        // Job completed - invalidate jobs list and stats
        queryClient.invalidateQueries({ queryKey: ['jobs'] });
        queryClient.invalidateQueries({ queryKey: ['jobStats'] });
        toast.success(`Job completed: ${(message as any).type || 'Unknown'}`);
        break;

      case 'job:failed':
        // Job failed - invalidate jobs list and stats
        queryClient.invalidateQueries({ queryKey: ['jobs'] });
        queryClient.invalidateQueries({ queryKey: ['jobStats'] });
        toast.error(`Job failed: ${(message as any).error || 'Unknown error'}`);
        break;

      case 'enrichment.complete':
        // Enrichment completed - invalidate movie and actor queries
        const entityId = (message as any).entityId;
        if (entityId) {
          console.log(`[WebSocket] Enrichment complete for movie ${entityId} - invalidating queries`);
          queryClient.invalidateQueries({ queryKey: ['movies'] }); // Movies list (plural)
          queryClient.invalidateQueries({ queryKey: ['movie', entityId] }); // Single movie detail
          queryClient.invalidateQueries({ queryKey: ['movieImages', entityId] });
          queryClient.invalidateQueries({ queryKey: ['movieExtras', entityId] });
          queryClient.invalidateQueries({ queryKey: ['actors'] }); // Actors may have been added

          // Show success toast with sonar effect
          toast.success('Enrichment complete', {
            description: `Movie metadata and assets updated`,
          });
        }
        break;

      case 'providerScrapeStart':
        // Provider scrape started - update UI to show progress
        console.log('[WebSocket] Provider scrape started:', message);
        break;

      case 'providerScrapeProviderStart':
        // Individual provider started scraping
        console.log('[WebSocket] Provider started:', (message as any).provider);
        break;

      case 'providerScrapeProviderComplete':
        // Individual provider completed scraping
        console.log('[WebSocket] Provider completed:', (message as any).provider, 'success:', (message as any).success);
        break;

      case 'providerScrapeProviderRetry':
        // Provider retrying after failure
        console.log('[WebSocket] Provider retrying:', (message as any).provider, `(${(message as any).attempt}/${(message as any).maxRetries})`);
        break;

      case 'providerScrapeProviderTimeout':
        // Provider timed out
        console.warn('[WebSocket] Provider timeout:', (message as any).provider);
        break;

      case 'providerScrapeComplete':
        // All providers completed scraping
        console.log('[WebSocket] Provider scrape complete:', {
          completed: (message as any).completedProviders,
          failed: (message as any).failedProviders,
          timedOut: (message as any).timedOutProviders,
        });
        // Invalidate movie data after provider scrape
        if ((message as any).movieId) {
          queryClient.invalidateQueries({ queryKey: ['movie', (message as any).movieId] });
          queryClient.invalidateQueries({ queryKey: ['movieImages', (message as any).movieId] });
        }
        break;

      case 'providerScrapeError':
        // Provider scrape encountered an error
        console.error('[WebSocket] Provider scrape error:', (message as any).error);
        toast.error('Provider scrape failed', {
          description: (message as any).error,
        });
        break;

      case 'jobStatus':
        // Job status update
        console.log('[WebSocket] Job status:', {
          id: (message as any).jobId,
          type: (message as any).jobType,
          status: (message as any).status,
        });
        queryClient.invalidateQueries({ queryKey: ['jobs'] });
        queryClient.invalidateQueries({ queryKey: ['jobStats'] });
        break;

      case 'jobQueueStats':
      case 'queue:stats':
        // Job queue statistics update (handle both new and old event names)
        console.log('[WebSocket] Job queue stats:', {
          pending: (message as any).pending,
          processing: (message as any).processing,
          completed: (message as any).completed,
          failed: (message as any).failed,
        });
        queryClient.invalidateQueries({ queryKey: ['jobStats'] });
        break;

      default:
        // Handle other message types
        break;
    }
  }, [queryClient, batchEnrichmentUpdate]);

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
