import { useQuery } from '@tanstack/react-query';
import { parseApiError } from '../utils/errorHandling';

interface JobHistoryRecord {
  id: number;
  job_id: number;
  type: string;
  priority: number;
  payload: any;
  status: 'completed' | 'failed';
  error?: string | null;
  retry_count: number;
  created_at: string;
  started_at: string;
  completed_at: string;
  duration_ms: number;
}

interface JobHistoryFilters {
  limit?: number;
  type?: string;
  status?: 'completed' | 'failed';
}

interface JobHistoryResponse {
  history: JobHistoryRecord[];
}

export function useJobHistory(filters?: JobHistoryFilters) {
  return useQuery<JobHistoryResponse, Error>({
    queryKey: ['jobs', 'history', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.limit) params.set('limit', filters.limit.toString());
      if (filters?.type) params.set('type', filters.type);
      if (filters?.status) params.set('status', filters.status);

      const response = await fetch(`/api/jobs/history?${params}`);
      if (!response.ok) {
        const errorMessage = await parseApiError(response);
        throw new Error(errorMessage);
      }
      return response.json();
    },
    retry: 1,
    staleTime: 30000, // Consider data fresh for 30 seconds
  });
}
