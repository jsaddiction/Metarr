import { useQuery } from '@tanstack/react-query';
import { parseApiError } from '../utils/errorHandling';

/**
 * System information from backend - Health-focused status
 * Maps to GET /api/system/info response
 */
export interface SystemInfo {
  name: string;
  version: string;
  description: string;
  status: 'operational' | 'degraded' | 'down';
  timestamp: string;

  // Process health
  uptime: number; // seconds
  nodeVersion: string;
  platform: string;
  arch: string;
  memory: {
    used: {
      rss: number;
      heapTotal: number;
      heapUsed: number;
      external: number;
      arrayBuffers: number;
    };
    percentUsed: number;
  };

  // Component health
  health: {
    database: {
      healthy: boolean;
      responseTime: number; // milliseconds
    };
    jobQueue: {
      healthy: boolean;
      pending: number;
      processing: number;
      stuck: boolean; // true if jobs are stuck for > 5 minutes
    };
    cache: {
      accessible: boolean;
      path: string;
    };
    providers: Array<{
      name: string;
      displayName: string;
      healthy: boolean;
      responseTime: number | null; // milliseconds
      lastChecked: string;
      lastError?: string;
    }>;
    mediaPlayers: Array<{
      id: number;
      name: string;
      type: string;
      healthy: boolean;
      status: 'connected' | 'disconnected' | 'error';
      lastConnected?: string;
      lastError?: string;
    }>;
  };
}

/**
 * Provider status with configuration and metadata
 * Derived from GET /api/providers response
 */
export interface ProviderStatus {
  name: string;
  displayName: string;
  enabled: boolean;
  connected: boolean; // Based on lastTestStatus
  lastError?: string;
  rateLimit?: {
    remaining: number;
    total: number;
    resetAt: string;
  };
}

/**
 * Fetch system information
 * Includes uptime, platform, database stats, job queue stats, and provider sync status
 */
export const useSystemInfo = () => {
  return useQuery<SystemInfo, Error>({
    queryKey: ['systemInfo'],
    queryFn: async () => {
      const response = await fetch('/api/system/info');
      if (!response.ok) {
        const errorMessage = await parseApiError(response);
        throw new Error(errorMessage);
      }
      return response.json();
    },
    retry: 1,
    staleTime: 10000, // 10 seconds
    refetchInterval: 30000, // Refetch every 30 seconds for live updates
  });
};

/**
 * Fetch provider status from all configured providers
 * Transforms provider configuration into status format
 */
export const useProviderStatus = () => {
  return useQuery<ProviderStatus[], Error>({
    queryKey: ['providerStatus'],
    queryFn: async () => {
      const response = await fetch('/api/providers');
      if (!response.ok) {
        const errorMessage = await parseApiError(response);
        throw new Error(errorMessage);
      }
      const data = await response.json();

      // Transform ProviderWithMetadata[] to ProviderStatus[]
      return data.providers.map((provider: any) => ({
        name: provider.metadata.name,
        displayName: provider.metadata.displayName,
        enabled: provider.config.enabled,
        connected: provider.config.lastTestStatus === 'success',
        lastError: provider.config.lastTestError,
        rateLimit: provider.metadata.rateLimit ? {
          remaining: provider.metadata.rateLimit.requests,
          total: provider.metadata.rateLimit.requests,
          resetAt: new Date(Date.now() + provider.metadata.rateLimit.windowSeconds * 1000).toISOString(),
        } : undefined,
      }));
    },
    retry: 1,
    staleTime: 5000, // 5 seconds
    refetchInterval: 15000, // Refetch every 15 seconds
  });
};
