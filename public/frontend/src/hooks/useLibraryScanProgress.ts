import { useState, useEffect } from 'react';
import { useWebSocket } from '../contexts/WebSocketContext';
import { toast } from 'sonner';

export interface JobProgress {
  current: number;
  total: number;
  percentage: number;
  message?: string;
  detail?: string;
}

export function useLibraryScanProgress(libraryId: number) {
  const [scanProgress, setScanProgress] = useState<JobProgress | null>(null);
  const { socket, isConnected } = useWebSocket();

  useEffect(() => {
    if (!socket || !isConnected) return;

    const handleScanProgress = (data: any) => {
      if (data.libraryId === libraryId) {
        setScanProgress(data.progress);
      }
    };

    const handleScanCompleted = (data: any) => {
      if (data.libraryId === libraryId) {
        setScanProgress(null);
        toast.success(`Library scan completed`, {
          description: data.libraryName || 'Scan finished successfully',
        });
      }
    };

    const handleScanFailed = (data: any) => {
      if (data.libraryId === libraryId) {
        setScanProgress(null);
        toast.error(`Library scan failed`, {
          description: data.error || 'An error occurred during scanning',
        });
      }
    };

    // Subscribe to scan events
    socket.on('scan:progress', handleScanProgress);
    socket.on('scan:completed', handleScanCompleted);
    socket.on('scan:failed', handleScanFailed);

    return () => {
      socket.off('scan:progress', handleScanProgress);
      socket.off('scan:completed', handleScanCompleted);
      socket.off('scan:failed', handleScanFailed);
    };
  }, [socket, isConnected, libraryId]);

  return { scanProgress, isScanning: scanProgress !== null };
}
