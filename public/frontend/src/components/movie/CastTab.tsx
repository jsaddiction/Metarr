import React from 'react';
import { ActorsList } from './ActorsList';
import { useMovie } from '../../hooks/useMovies';

interface CastTabProps {
  movieId: number;
}

export const CastTab: React.FC<CastTabProps> = ({ movieId }) => {
  const { data: movieData } = useMovie(movieId);

  const actors = movieData?.actors || [];

  const handleActorsUpdate = async (updatedActors: Array<{ name: string; role?: string; order?: number }>) => {
    try {
      await fetch(`/api/movies/${movieId}/metadata`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actors: updatedActors }),
      });
    } catch (error) {
      console.error('Failed to save actors:', error);
    }
  };

  return (
    <div className="space-y-3">
      <ActorsList
        actors={actors}
        onUpdate={handleActorsUpdate}
      />
    </div>
  );
};
