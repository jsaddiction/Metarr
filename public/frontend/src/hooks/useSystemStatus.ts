import { useQuery } from '@tanstack/react-query';
import { parseApiError } from '../utils/errorHandling';

/**
 * System information from backend
 * Maps to GET /api/system/info response
 */
export interface SystemInfo {
  name: string;
  version: string;
  description: string;
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
    free: number;
  };
  database: {
    movies: number;
    libraries: number;
    mediaPlayers: number;
  };
  jobQueue: {
    pending: number;
    processing: number;
    total: number;
    oldestPendingAge: number | null;
  };
  providers: Array<{
    name: string;
    lastSync: string | null;
  }>;
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
