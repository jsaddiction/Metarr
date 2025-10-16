import { useQuery } from '@tanstack/react-query';

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
  return useQuery({
    queryKey: ['jobs', 'history', filters],
    queryFn: async (): Promise<JobHistoryResponse> => {
      const params = new URLSearchParams();
      if (filters?.limit) params.set('limit', filters.limit.toString());
      if (filters?.type) params.set('type', filters.type);
      if (filters?.status) params.set('status', filters.status);

      const response = await fetch(`/api/jobs/history?${params}`);
      if (!response.ok) {
        throw new Error('Failed to fetch job history');
      }
      return response.json();
    },
    staleTime: 30000, // Consider data fresh for 30 seconds
  });
}
