import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGripVertical, faTrash, faUser } from '@fortawesome/free-solid-svg-icons';
import { TextInput } from '../ui/TextInput/TextInput';
import { cn } from '../../lib/utils';

interface SortableActorRowProps {
  actor: {
    actor_id: number;
    actor_name: string;
    role: string | null;
    role_locked: boolean;
  };
  index: number;
  onRoleChange: (actorId: number, role: string) => void;
  onRoleLockToggle: (actorId: number) => void;
  onRemove: (actorId: number) => void;
  onDragStart: (index: number) => void;
  onDragEnter: (index: number) => void;
  onDragEnd: () => void;
  isDragOver: boolean;
}

export function SortableActorRow({
  actor,
  index,
  onRoleChange,
  onRoleLockToggle,
  onRemove,
  onDragStart,
  onDragEnter,
  onDragEnd,
  isDragOver,
}: SortableActorRowProps) {
  const [imageError, setImageError] = useState(false);

  const handleRemoveClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onRemove(actor.actor_id);
  };

  return (
    <div
      draggable
      onDragStart={() => onDragStart(index)}
      onDragEnter={() => onDragEnter(index)}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
      className={cn(
        'flex items-center gap-3 transition-all duration-150 relative',
        isDragOver && 'before:absolute before:inset-x-0 before:-top-1 before:h-0.5 before:bg-primary-500 before:rounded-full'
      )}
    >
      {/* Slot number */}
      <div className="w-6 text-right text-sm text-neutral-500 font-mono flex-shrink-0">
        {index + 1}
      </div>

      {/* The row content */}
      <div
        className="flex-1 flex items-center gap-3 px-3 py-2 bg-neutral-900 rounded border border-neutral-700"
      >
        {/* Drag handle */}
        <div className="cursor-grab active:cursor-grabbing text-neutral-500 hover:text-neutral-300 p-1">
          <FontAwesomeIcon icon={faGripVertical} className="h-4 w-4" />
        </div>

        {/* Actor image */}
        <div className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center overflow-hidden flex-shrink-0">
          {!imageError && actor.actor_id ? (
            <img
              src={`/api/actors/${actor.actor_id}/image`}
              alt={actor.actor_name}
              className="w-full h-full object-cover"
              onError={() => setImageError(true)}
            />
          ) : (
            <FontAwesomeIcon icon={faUser} className="h-3 w-3 text-neutral-500" />
          )}
        </div>

        {/* Actor name (read-only) */}
        <div className="w-40 shrink-0 text-neutral-200 font-medium truncate" title={actor.actor_name}>
          {actor.actor_name}
        </div>

        {/* Role input with lock */}
        <div className="flex-1 min-w-[120px]">
          <TextInput
            value={actor.role || ''}
            onChange={(value) => onRoleChange(actor.actor_id, value)}
            placeholder="Character role..."
            locked={actor.role_locked}
            onToggleLock={() => onRoleLockToggle(actor.actor_id)}
          />
        </div>

        {/* Remove button */}
        <button
          type="button"
          onClick={handleRemoveClick}
          className="p-1.5 text-neutral-500 hover:text-red-400 hover:bg-neutral-800 rounded transition-colors flex-shrink-0"
          title="Remove actor from this movie"
        >
          <FontAwesomeIcon icon={faTrash} className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
