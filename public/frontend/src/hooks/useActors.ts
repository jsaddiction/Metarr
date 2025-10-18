import { useQuery } from '@tanstack/react-query';

interface Actor {
  id: number;
  name: string;
  name_normalized: string;
  tmdb_id?: number;
  imdb_id?: string;
  image_cache_path?: string;
  image_hash?: string;
  identification_status: 'identified' | 'enriched';
  enrichment_priority: number;
  name_locked: boolean;
  image_locked: boolean;
  movie_count: number;
  created_at: string;
  updated_at: string;
}

interface ActorListResult {
  actors: Actor[];
  total: number;
}

export const useActors = () => {
  return useQuery<ActorListResult>({
    queryKey: ['actors'],
    queryFn: async () => {
      const response = await fetch('/api/actors?limit=10000'); // Fetch all actors at once
      if (!response.ok) {
        throw new Error('Failed to fetch actors');
      }
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - will be updated via WebSocket when changed
  });
};
