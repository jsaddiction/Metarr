import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGripVertical, faTrash, faUser } from '@fortawesome/free-solid-svg-icons';
import { TextInput } from '../ui/TextInput/TextInput';
import { cn } from '../../lib/utils';

/**
 * Convert image hash to cache URL
 * Cache structure: /cache/actors/{first2chars}/{next2chars}/{fullhash}.jpg
 */
function getActorImageUrl(hash: string | null): string | null {
  if (!hash) return null;
  const first2 = hash.substring(0, 2);
  const next2 = hash.substring(2, 4);
  return `/cache/actors/${first2}/${next2}/${hash}.jpg`;
}

interface SortableActorRowProps {
  actor: {
    actor_id: number;
    actor_name: string;
    role: string | null;
    role_locked: boolean;
    image_hash: string | null;
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

      {/* The row content - handle and trash are flush with edges */}
      <div
        className="flex-1 flex items-stretch bg-neutral-900 rounded border border-neutral-700 overflow-hidden"
      >
        {/* Drag handle - flush left, part of the row */}
        <div className="w-8 flex-shrink-0 bg-neutral-700 border-r border-neutral-600 text-neutral-400 hover:bg-neutral-600 cursor-grab active:cursor-grabbing flex items-center justify-center transition-colors">
          <FontAwesomeIcon icon={faGripVertical} className="text-sm" />
        </div>

        {/* Middle content with padding */}
        <div className="flex-1 flex items-center gap-4 px-4 py-1.5">
          {/* Actor image */}
          <div className="w-18 h-18 rounded-full bg-neutral-800 flex items-center justify-center overflow-hidden flex-shrink-0">
            {(() => {
              const imageUrl = getActorImageUrl(actor.image_hash);
              if (!imageError && imageUrl) {
                return (
                  <img
                    src={imageUrl}
                    alt={actor.actor_name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    onError={() => setImageError(true)}
                  />
                );
              }
              return <FontAwesomeIcon icon={faUser} className="h-5 w-5 text-neutral-500" />;
            })()}
          </div>

          {/* Actor name (top) and Role (bottom) - stacked */}
          <div className="flex-1 min-w-0 flex flex-col gap-1.5">
            {/* Actor name (read-only) */}
            <div className="text-neutral-200 font-medium truncate" title={actor.actor_name}>
              {actor.actor_name}
            </div>
            {/* Role input with lock - constrained width */}
            <div className="max-w-sm">
              <TextInput
                value={actor.role || ''}
                onChange={(value) => onRoleChange(actor.actor_id, value)}
                placeholder="Character role..."
                locked={actor.role_locked}
                onToggleLock={() => onRoleLockToggle(actor.actor_id)}
              />
            </div>
          </div>
        </div>

        {/* Remove button - flush right, part of the row */}
        <button
          type="button"
          onClick={handleRemoveClick}
          className="w-8 flex-shrink-0 bg-neutral-700 border-l border-neutral-600 text-neutral-400 hover:bg-red-500/20 hover:text-red-400 flex items-center justify-center transition-colors"
          title="Remove actor from this movie"
        >
          <FontAwesomeIcon icon={faTrash} className="text-sm" />
        </button>
      </div>
    </div>
  );
}
