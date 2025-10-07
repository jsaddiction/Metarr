import { useState, useEffect } from 'react';
import { MediaPlayerStatus } from '../types/mediaPlayer';
import { mediaPlayerApi } from '../utils/api';

export function useMediaPlayerStatus() {
  const [statuses, setStatuses] = useState<Map<number, MediaPlayerStatus>>(new Map());
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    try {
      unsubscribe = mediaPlayerApi.subscribeToStatus((statusArray) => {
        const statusMap = new Map<number, MediaPlayerStatus>();
        statusArray.forEach((status) => {
          statusMap.set(status.id, status);
        });
        setStatuses(statusMap);
        setIsConnected(true);
      });
    } catch (error) {
      console.error('Failed to subscribe to media player status:', error);
      setIsConnected(false);
    }

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  return {
    statuses,
    isConnected,
    getStatus: (id: number) => statuses.get(id),
  };
}