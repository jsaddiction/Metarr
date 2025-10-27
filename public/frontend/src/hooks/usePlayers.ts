/**
 * TanStack Query hooks for Media Players
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { mediaPlayerApi } from '../utils/api';
import {
  MediaPlayer,
  MediaPlayerFormData,
  TestConnectionResult,
  MediaPlayerStatus,
} from '../types/mediaPlayer';
import { useWebSocket } from '../contexts/WebSocketContext';
import { useEffect, useState } from 'react';
import { showErrorToast, showSuccessToast } from '../utils/errorHandling';

/**
 * Fetch all media players
 */
export const usePlayers = () => {
  return useQuery<MediaPlayer[], Error>({
    queryKey: ['players'],
    queryFn: () => mediaPlayerApi.getAll(),
  });
};

/**
 * Fetch a single media player by ID
 */
export const usePlayer = (id: number) => {
  return useQuery<MediaPlayer, Error>({
    queryKey: ['player', id],
    queryFn: () => mediaPlayerApi.getById(id),
    enabled: !!id,
  });
};

/**
 * Real-time player status from WebSocket
 * This is updated via WebSocket and automatically invalidates the players query
 */
export const usePlayerStatus = () => {
  return useQuery<MediaPlayerStatus[], Error>({
    queryKey: ['playerStatus'],
    queryFn: () => {
      // Initial load - return empty array, will be populated by WebSocket
      return Promise.resolve([]);
    },
    staleTime: Infinity, // Never stale, updated via WebSocket
  });
};

/**
 * Create a new media player
 */
export const useCreatePlayer = () => {
  const queryClient = useQueryClient();

  return useMutation<MediaPlayer, Error, MediaPlayerFormData>({
    mutationFn: (data: MediaPlayerFormData) => mediaPlayerApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['players'] });
      queryClient.invalidateQueries({ queryKey: ['mediaPlayerGroups'] });
      showSuccessToast('Media player created successfully');
    },
    onError: (error) => {
      showErrorToast(error, 'Create media player');
    },
  });
};

/**
 * Update a media player
 */
export const useUpdatePlayer = () => {
  const queryClient = useQueryClient();
  const { ws } = useWebSocket();

  return useMutation<MediaPlayer, Error, { id: number; updates: Partial<MediaPlayerFormData> }>({
    mutationFn: async ({ id, updates }) => {
      // Send update via WebSocket if connected
      if (ws && ws.getState() === 'connected') {
        ws.send({
          type: 'updatePlayer',
          playerId: id,
          updates,
        });
        // Wait a bit for the server to process
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // Also call REST API as fallback
      return mediaPlayerApi.update(id, updates);
    },
    onSuccess: (data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['players'] });
      queryClient.invalidateQueries({ queryKey: ['player', id] });
      queryClient.invalidateQueries({ queryKey: ['mediaPlayerGroups'] });
      showSuccessToast('Media player updated successfully');
    },
    onError: (error) => {
      showErrorToast(error, 'Update media player');
    },
  });
};

/**
 * Delete a media player
 */
export const useDeletePlayer = () => {
  const queryClient = useQueryClient();

  return useMutation<void, Error, number>({
    mutationFn: (id: number) => mediaPlayerApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['players'] });
      queryClient.invalidateQueries({ queryKey: ['mediaPlayerGroups'] });
      showSuccessToast('Media player deleted successfully');
    },
    onError: (error) => {
      showErrorToast(error, 'Delete media player');
    },
  });
};

/**
 * Test connection to a media player
 */
export const useTestConnection = () => {
  return useMutation<TestConnectionResult, Error, number>({
    mutationFn: (id: number) => mediaPlayerApi.testConnection(id),
  });
};

/**
 * Test connection without saving
 */
export const useTestConnectionUnsaved = () => {
  return useMutation<TestConnectionResult, Error, Partial<MediaPlayerFormData>>({
    mutationFn: (data: Partial<MediaPlayerFormData>) => mediaPlayerApi.testConnectionUnsaved(data),
  });
};

/**
 * Connect a media player
 */
export const useConnectPlayer = () => {
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean; message: string }, Error, number>({
    mutationFn: (id: number) => mediaPlayerApi.connect(id),
    onSuccess: (data, id) => {
      queryClient.invalidateQueries({ queryKey: ['players'] });
      queryClient.invalidateQueries({ queryKey: ['player', id] });
      queryClient.invalidateQueries({ queryKey: ['mediaPlayerGroups'] });
    },
  });
};

/**
 * Disconnect a media player
 */
export const useDisconnectPlayer = () => {
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean; message: string }, Error, number>({
    mutationFn: (id: number) => mediaPlayerApi.disconnect(id),
    onSuccess: (data, id) => {
      queryClient.invalidateQueries({ queryKey: ['players'] });
      queryClient.invalidateQueries({ queryKey: ['player', id] });
      queryClient.invalidateQueries({ queryKey: ['mediaPlayerGroups'] });
    },
  });
};
