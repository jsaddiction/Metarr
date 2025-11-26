import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRotateLeft, faUser } from '@fortawesome/free-solid-svg-icons';

interface RemovedActorRowProps {
  actor: {
    actor_id: number;
    actor_name: string;
    role: string | null;
  };
  onRestore: (actorId: number) => void;
}

function RemovedActorRow({ actor, onRestore }: RemovedActorRowProps) {
  const [imageError, setImageError] = useState(false);

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-neutral-900/50 rounded border border-neutral-800">
      <div className="flex items-center gap-3">
        {/* Actor image */}
        <div className="w-6 h-6 rounded-full bg-neutral-800 flex items-center justify-center overflow-hidden flex-shrink-0">
          {!imageError && actor.actor_id ? (
            <img
              src={`/api/actors/${actor.actor_id}/image`}
              alt={actor.actor_name}
              className="w-full h-full object-cover"
              onError={() => setImageError(true)}
            />
          ) : (
            <FontAwesomeIcon icon={faUser} className="h-2.5 w-2.5 text-neutral-600" />
          )}
        </div>
        <span className="text-neutral-400">{actor.actor_name}</span>
        {actor.role && (
          <span className="text-neutral-600 text-sm">
            as {actor.role}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={() => onRestore(actor.actor_id)}
        className="flex items-center gap-1.5 px-2 py-1 text-sm text-primary-400 hover:text-primary-300 hover:bg-neutral-800 rounded transition-colors"
        title="Restore actor"
      >
        <FontAwesomeIcon icon={faRotateLeft} className="h-3.5 w-3.5" />
        Restore
      </button>
    </div>
  );
}

interface RemovedActorsListProps {
  actors: Array<{
    actor_id: number;
    actor_name: string;
    role: string | null;
  }>;
  onRestore: (actorId: number) => void;
}

export function RemovedActorsList({ actors, onRestore }: RemovedActorsListProps) {
  if (actors.length === 0) {
    return null;
  }

  return (
    <div className="mt-6">
      <h4 className="text-sm font-medium text-neutral-400 mb-3">
        Removed Actors ({actors.length})
      </h4>
      <div className="space-y-2">
        {actors.map((actor) => (
          <RemovedActorRow
            key={actor.actor_id}
            actor={actor}
            onRestore={onRestore}
          />
        ))}
      </div>
    </div>
  );
}
