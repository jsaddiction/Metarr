/**
 * TanStack Query hooks for Library Scans
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { libraryApi } from '../utils/api';
import {
  Library,
  LibraryFormData,
  ScanJob,
  DirectoryEntry,
  ValidatePathResult,
} from '../types/library';
import { useWebSocket } from '../contexts/WebSocketContext';
import { useEffect, useState } from 'react';

/**
 * Fetch all libraries
 */
export const useLibraries = () => {
  return useQuery<Library[], Error>({
    queryKey: ['libraries'],
    queryFn: () => libraryApi.getAll(),
  });
};

/**
 * Fetch a single library by ID
 */
export const useLibrary = (id: number) => {
  return useQuery<Library, Error>({
    queryKey: ['library', id],
    queryFn: () => libraryApi.getById(id),
    enabled: !!id,
  });
};

/**
 * Real-time active scans from WebSocket
 */
export const useActiveScans = () => {
  const { ws, isConnected } = useWebSocket();
  const [scans, setScans] = useState<Map<number, ScanJob>>(new Map());

  useEffect(() => {
    if (!ws || !isConnected) {
      return;
    }

    const handleScanStatus = (message: any) => {
      if (message.type === 'scanStatus') {
        setScans((prev) => {
          const next = new Map(prev);

          const scanJob: ScanJob = {
            id: message.scanId,
            libraryId: message.libraryId,
            status: message.status,
            progressCurrent: message.progressCurrent,
            progressTotal: message.progressTotal,
            currentFile: message.currentFile,
            errorsCount: message.errorsCount || 0,
            startedAt: message.timestamp,
            completedAt: ['completed', 'failed', 'cancelled'].includes(message.status)
              ? message.timestamp
              : undefined,
          };

          if (scanJob.status === 'running') {
            next.set(message.scanId, scanJob);
          } else {
            // Remove completed/failed/cancelled scans after a delay
            setTimeout(() => {
              setScans((prev) => {
                const updated = new Map(prev);
                updated.delete(message.scanId);
                return updated;
              });
            }, 5000);
            next.set(message.scanId, scanJob);
          }

          return next;
        });
      }
    };

    ws.on('scanStatus', handleScanStatus);

    return () => {
      ws.off('scanStatus', handleScanStatus);
    };
  }, [ws, isConnected]);

  return Array.from(scans.values());
};

/**
 * Create a new library
 */
export const useCreateLibrary = () => {
  const queryClient = useQueryClient();

  return useMutation<Library, Error, LibraryFormData>({
    mutationFn: (data: LibraryFormData) => libraryApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['libraries'] });
    },
  });
};

/**
 * Update a library
 */
export const useUpdateLibrary = () => {
  const queryClient = useQueryClient();

  return useMutation<Library, Error, { id: number; updates: Partial<LibraryFormData> }>({
    mutationFn: ({ id, updates }) => libraryApi.update(id, updates),
    onSuccess: (data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['libraries'] });
      queryClient.invalidateQueries({ queryKey: ['library', id] });
    },
  });
};

/**
 * Delete a library
 */
export const useDeleteLibrary = () => {
  const queryClient = useQueryClient();

  return useMutation<void, Error, number>({
    mutationFn: (id: number) => libraryApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['libraries'] });
    },
  });
};

/**
 * Start a library scan
 */
export const useStartLibraryScan = () => {
  const queryClient = useQueryClient();

  return useMutation<ScanJob, Error, number>({
    mutationFn: (libraryId: number) => {
      // Use REST API POST only - no WebSocket
      // WebSocket is only used for real-time status updates (via scanStatus messages)
      return libraryApi.startScan(libraryId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activeScans'] });
    },
  });
};

/**
 * Cancel a library scan
 */
export const useCancelLibraryScan = () => {
  const queryClient = useQueryClient();
  const { ws } = useWebSocket();

  return useMutation<void, Error, number>({
    mutationFn: async (scanId: number) => {
      // Send cancel request via WebSocket if connected
      if (ws && ws.getState() === 'connected') {
        ws.send({
          type: 'cancelLibraryScan',
          scanId,
        });
      }
      // Note: There's no REST API for this yet
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activeScans'] });
    },
  });
};

/**
 * Validate a directory path
 */
export const useValidatePath = () => {
  return useMutation<ValidatePathResult, Error, string>({
    mutationFn: (path: string) => libraryApi.validatePath(path),
  });
};

/**
 * Browse a directory
 */
export const useBrowsePath = (path: string) => {
  return useQuery<DirectoryEntry[], Error>({
    queryKey: ['browsePath', path],
    queryFn: () => libraryApi.browsePath(path),
    enabled: !!path,
  });
};

/**
 * Get available drives (Windows)
 */
export const useDrives = () => {
  return useQuery<string[], Error>({
    queryKey: ['drives'],
    queryFn: () => libraryApi.getDrives(),
  });
};
