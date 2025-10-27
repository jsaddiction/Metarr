import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { PlayerActivityState } from '../types/mediaPlayer';
import { mediaPlayerApi } from '../utils/api';

/**
 * Hook to fetch and subscribe to player activity state
 * Combines initial fetch with real-time WebSocket updates
 */
export function usePlayerActivity(playerId?: number) {
  const queryClient = useQueryClient();

  // Fetch initial state
  const query = useQuery<PlayerActivityState[]>({
    queryKey: ['playerActivity'],
    queryFn: async () => {
      return await mediaPlayerApi.getAllActivityStates();
    },
    staleTime: 5000, // Consider fresh for 5 seconds
  });

  // Subscribe to WebSocket updates
  useEffect(() => {
    // Get WebSocket connection
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data);

        if (message.type === 'player:activity') {
          const state: PlayerActivityState = message.payload;

          // Update the query cache with new state
          queryClient.setQueryData<PlayerActivityState[]>(['playerActivity'], (old) => {
            if (!old) return [state];

            const index = old.findIndex((s) => s.playerId === state.playerId);
            if (index >= 0) {
              // Update existing state
              const updated = [...old];
              updated[index] = state;
              return updated;
            } else {
              // Add new state
              return [...old, state];
            }
          });
        }
      } catch (error) {
        console.error('Failed to process WebSocket message', error);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    return () => {
      ws.close();
    };
  }, [queryClient]);

  // If playerId is provided, filter to single player
  if (playerId !== undefined) {
    return {
      ...query,
      data: query.data?.find((s) => s.playerId === playerId),
    };
  }

  return query;
}
