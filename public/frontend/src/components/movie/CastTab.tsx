import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUserGroup, faEdit } from '@fortawesome/free-solid-svg-icons';
import { ActorsList } from './ActorsList';
import { useMovie } from '../../hooks/useMovies';
import { TabSection } from '../ui/TabSection';

interface CastTabProps {
  movieId: number;
}

export const CastTab: React.FC<CastTabProps> = ({ movieId }) => {
  const { data: movieData } = useMovie(movieId);
  const [isEditing, setIsEditing] = useState(false);

  const actors = movieData?.actors || [];

  const handleActorsUpdate = async (updatedActors: Array<{ name: string; role?: string; order?: number }>) => {
    try {
      await fetch(`/api/movies/${movieId}/metadata`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actors: updatedActors }),
      });
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to save actors:', error);
    }
  };

  return (
    <div className="space-y-3">
      <TabSection
        title="Actors"
        count={actors.length}
        isEmpty={actors.length === 0}
        emptyIcon={faUserGroup}
        emptyMessage="No actors found"
        emptyAction={{
          label: 'Add Actors',
          onClick: () => setIsEditing(true),
          icon: faEdit,
        }}
        onAction={!isEditing ? () => setIsEditing(true) : undefined}
        actionLabel="Edit Actors"
        actionIcon={faEdit}
      >
        <ActorsList
          actors={actors}
          onUpdate={handleActorsUpdate}
          isEditing={isEditing}
        />
      </TabSection>
    </div>
  );
};
