import { useQuery } from '@tanstack/react-query';
import { mediaPlayerApi } from '../utils/api';

export interface MediaPlayerGroup {
  id: number;
  name: string;
  type: string;
  max_members: number | null;
}

export function useMediaPlayerGroups() {
  return useQuery({
    queryKey: ['mediaPlayerGroups'],
    queryFn: () => mediaPlayerApi.getGroups(),
    staleTime: 30000, // Consider fresh for 30 seconds
  });
}
