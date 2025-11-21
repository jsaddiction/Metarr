import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUserGroup, faPlus, faTrash, faEdit } from '@fortawesome/free-solid-svg-icons';

interface Actor {
  name: string;
  role?: string;
  order?: number;
}

interface ActorsListProps {
  actors: Actor[];
  onUpdate?: (actors: Actor[]) => void;
  readOnly?: boolean;
}

// Export isEditing state control for parent component
interface ActorsListExtendedProps extends ActorsListProps {
  isEditing?: boolean;
  onStartEdit?: () => void;
}

export const ActorsList: React.FC<ActorsListExtendedProps> = ({
  actors,
  onUpdate,
  readOnly = false,
  isEditing = false,
  onStartEdit
}) => {
  const [editedActors, setEditedActors] = useState<Actor[]>(actors);

  const handleAddActor = () => {
    const newActor: Actor = { name: '', role: '', order: editedActors.length + 1 };
    setEditedActors([...editedActors, newActor]);
  };

  const handleRemoveActor = (index: number) => {
    const updated = editedActors.filter((_, i) => i !== index);
    setEditedActors(updated);
  };

  const handleActorChange = (index: number, field: keyof Actor, value: string | number) => {
    const updated = [...editedActors];
    updated[index] = { ...updated[index], [field]: value };
    setEditedActors(updated);
  };

  const handleSave = () => {
    if (onUpdate) {
      onUpdate(editedActors);
    }
  };

  const handleCancel = () => {
    setEditedActors(actors);
  };

  const sortedActors = [...(isEditing ? editedActors : actors)].sort((a, b) => {
    const orderA = a.order ?? 999;
    const orderB = b.order ?? 999;
    return orderA - orderB;
  });

  if (sortedActors.length === 0 && !isEditing) {
    return null; // Let TabSection handle empty state
  }

  return (
    <div>
      {sortedActors.length > 0 ? (
        <div className="space-y-2">
          {/* Header Row */}
          <div className="grid grid-cols-[60px_1fr_1fr_80px] gap-4 px-4 py-2 text-sm font-semibold text-neutral-400 border-b border-neutral-700">
            <div>Order</div>
            <div>Name</div>
            <div>Role</div>
            {isEditing && <div>Actions</div>}
          </div>

          {/* Actor Rows */}
          {sortedActors.map((actor, index) => (
            <div
              key={index}
              className="grid grid-cols-[60px_1fr_1fr_80px] gap-4 px-4 py-3 bg-neutral-900 rounded hover:bg-neutral-850 transition-colors"
            >
              {isEditing ? (
                <>
                  <input
                    type="number"
                    value={actor.order || index + 1}
                    onChange={(e) => handleActorChange(index, 'order', parseInt(e.target.value) || 1)}
                    className="bg-neutral-800 text-white px-2 py-1 rounded border border-neutral-700 focus:border-purple-500 focus:outline-none"
                    min="1"
                  />
                  <input
                    type="text"
                    value={actor.name}
                    onChange={(e) => handleActorChange(index, 'name', e.target.value)}
                    placeholder="Actor name"
                    className="bg-neutral-800 text-white px-3 py-2 rounded border border-neutral-700 focus:border-purple-500 focus:outline-none"
                  />
                  <input
                    type="text"
                    value={actor.role || ''}
                    onChange={(e) => handleActorChange(index, 'role', e.target.value)}
                    placeholder="Character name"
                    className="bg-neutral-800 text-white px-3 py-2 rounded border border-neutral-700 focus:border-purple-500 focus:outline-none"
                  />
                  <button
                    onClick={() => handleRemoveActor(index)}
                    className="text-red-400 hover:text-red-300 transition-colors"
                    title="Remove actor"
                  >
                    <FontAwesomeIcon icon={faTrash} />
                  </button>
                </>
              ) : (
                <>
                  <div className="text-neutral-400 text-center">{actor.order || index + 1}</div>
                  <div className="text-white font-medium">{actor.name}</div>
                  <div className="text-neutral-400">{actor.role || '—'}</div>
                  <div></div>
                </>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
};
