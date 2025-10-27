import { useQuery } from '@tanstack/react-query';
import { mediaPlayerApi } from '../utils/api';
import { MediaPlayerGroup } from '../types/mediaPlayer';

export function useMediaPlayerGroupsWithMembers() {
  return useQuery<MediaPlayerGroup[]>({
    queryKey: ['mediaPlayerGroups', 'withMembers'],
    queryFn: () => mediaPlayerApi.getGroupsWithMembers(),
    staleTime: 10000, // Consider fresh for 10 seconds
  });
}
