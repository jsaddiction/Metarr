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

export const ActorsList: React.FC<ActorsListProps> = ({ actors, onUpdate, readOnly = false }) => {
  const [isEditing, setIsEditing] = useState(false);
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
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditedActors(actors);
    setIsEditing(false);
  };

  const sortedActors = [...(isEditing ? editedActors : actors)].sort((a, b) => {
    const orderA = a.order ?? 999;
    const orderB = b.order ?? 999;
    return orderA - orderB;
  });

  return (
    <div className="bg-neutral-800 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <FontAwesomeIcon icon={faUserGroup} className="text-purple-400 text-xl" />
          <h3 className="text-xl font-semibold text-white">Actors</h3>
          <span className="text-neutral-400 text-sm">({sortedActors.length})</span>
        </div>
        {!readOnly && !isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors"
          >
            <FontAwesomeIcon icon={faEdit} />
            <span>Edit Actors</span>
          </button>
        )}
      </div>

      {sortedActors.length === 0 ? (
        <div className="text-neutral-400 text-center py-8">
          No actors found
          {!readOnly && (
            <button
              onClick={() => setIsEditing(true)}
              className="ml-2 text-purple-400 hover:text-purple-300"
            >
              Add actors
            </button>
          )}
        </div>
      ) : (
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
      )}

      {/* Edit Mode Actions */}
      {isEditing && (
        <div className="mt-6 flex items-center justify-between pt-4 border-t border-neutral-700">
          <button
            onClick={handleAddActor}
            className="flex items-center space-x-2 px-4 py-2 bg-neutral-700 hover:bg-neutral-600 text-white rounded transition-colors"
          >
            <FontAwesomeIcon icon={faPlus} />
            <span>Add Actor</span>
          </button>

          <div className="flex space-x-3">
            <button
              onClick={handleCancel}
              className="px-4 py-2 bg-neutral-700 hover:bg-neutral-600 text-white rounded transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors"
            >
              Save Changes
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
