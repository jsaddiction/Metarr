import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUserGroup, faSpinner, faLock, faLockOpen } from '@fortawesome/free-solid-svg-icons';
import { useCast, useUpdateCast } from '../../hooks/useCast';
import { SortableActorRow } from './SortableActorRow';
import { RemovedActorsList } from './RemovedActorsList';
import { TabSection } from '../ui/TabSection';

interface CastTabProps {
  movieId: number;
}

interface LocalActorState {
  actor_id: number;
  actor_name: string;
  role: string | null;
  actor_order: number;
  role_locked: boolean;
  removed: boolean;
}

export const CastTab: React.FC<CastTabProps> = ({ movieId }) => {
  const { data: castData, isLoading } = useCast(movieId);
  const updateCast = useUpdateCast();

  // Local state for tracking changes
  const [localActors, setLocalActors] = useState<LocalActorState[]>([]);
  const [localOrderLocked, setLocalOrderLocked] = useState(false);
  const [originalState, setOriginalState] = useState<{
    actors: LocalActorState[];
    orderLocked: boolean;
  } | null>(null);

  // Drag state
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Initialize local state from server data
  useEffect(() => {
    if (castData) {
      const actors = castData.actors.map((a, idx) => ({
        actor_id: a.actor_id,
        actor_name: a.actor_name,
        role: a.role,
        actor_order: a.actor_order ?? idx + 1,
        role_locked: a.role_locked,
        removed: a.removed,
      }));
      setLocalActors(actors);
      setLocalOrderLocked(castData.actors_order_locked);
      setOriginalState({
        actors: JSON.parse(JSON.stringify(actors)),
        orderLocked: castData.actors_order_locked,
      });
    }
  }, [castData]);

  // Split actors into active and removed
  const activeActors = useMemo(
    () => localActors.filter((a) => !a.removed).sort((a, b) => a.actor_order - b.actor_order),
    [localActors]
  );

  const removedActors = useMemo(
    () => localActors.filter((a) => a.removed),
    [localActors]
  );

  // Detect if there are unsaved changes
  const hasChanges = useMemo(() => {
    if (!originalState) return false;
    const currentJson = JSON.stringify({
      actors: localActors,
      orderLocked: localOrderLocked,
    });
    const originalJson = JSON.stringify({
      actors: originalState.actors,
      orderLocked: originalState.orderLocked,
    });
    return currentJson !== originalJson;
  }, [localActors, localOrderLocked, originalState]);

  // Handle drag start
  const handleDragStart = useCallback((index: number) => {
    dragItem.current = index;
  }, []);

  // Handle drag enter
  const handleDragEnter = useCallback((index: number) => {
    dragOverItem.current = index;
    setDragOverIndex(index);
  }, []);

  // Handle drag end - perform the reorder
  const handleDragEnd = useCallback(() => {
    if (dragItem.current === null || dragOverItem.current === null) {
      setDragOverIndex(null);
      return;
    }

    if (dragItem.current !== dragOverItem.current) {
      setLocalActors((items) => {
        const activeItems = items.filter((a) => !a.removed);
        const removedItems = items.filter((a) => a.removed);

        // Reorder the active items
        const reordered = Array.from(activeItems);
        const [moved] = reordered.splice(dragItem.current!, 1);
        reordered.splice(dragOverItem.current!, 0, moved);

        // Update actor_order based on new positions
        const updatedActive = reordered.map((a, idx) => ({
          ...a,
          actor_order: idx + 1,
        }));

        return [...updatedActive, ...removedItems];
      });

      // Auto-lock order when user reorders
      setLocalOrderLocked(true);
    }

    dragItem.current = null;
    dragOverItem.current = null;
    setDragOverIndex(null);
  }, []);

  // Handle role change
  const handleRoleChange = useCallback((actorId: number, role: string) => {
    setLocalActors((items) =>
      items.map((a) => (a.actor_id === actorId ? { ...a, role: role || null } : a))
    );
  }, []);

  // Handle role lock toggle
  const handleRoleLockToggle = useCallback((actorId: number) => {
    setLocalActors((items) =>
      items.map((a) => (a.actor_id === actorId ? { ...a, role_locked: !a.role_locked } : a))
    );
  }, []);

  // Handle remove actor
  const handleRemove = useCallback((actorId: number) => {
    setLocalActors((items) =>
      items.map((a) => (a.actor_id === actorId ? { ...a, removed: true } : a))
    );
  }, []);

  // Handle restore actor
  const handleRestore = useCallback((actorId: number) => {
    setLocalActors((items) => {
      const maxOrder = Math.max(...items.filter((a) => !a.removed).map((a) => a.actor_order), 0);
      return items.map((a) =>
        a.actor_id === actorId ? { ...a, removed: false, actor_order: maxOrder + 1 } : a
      );
    });
  }, []);

  // Handle order lock toggle
  const handleOrderLockToggle = useCallback(() => {
    setLocalOrderLocked((prev) => !prev);
  }, []);

  // Handle save
  const handleSave = useCallback(async () => {
    await updateCast.mutateAsync({
      movieId,
      data: {
        actors: localActors.map((a) => ({
          actor_id: a.actor_id,
          role: a.role,
          actor_order: a.actor_order,
          role_locked: a.role_locked,
          removed: a.removed,
        })),
        actors_order_locked: localOrderLocked,
      },
    });
  }, [movieId, localActors, localOrderLocked, updateCast]);

  // Handle revert - reset to original state
  const handleRevert = useCallback(() => {
    if (originalState) {
      setLocalActors(JSON.parse(JSON.stringify(originalState.actors)));
      setLocalOrderLocked(originalState.orderLocked);
    }
  }, [originalState]);

  if (isLoading) {
    return (
      <TabSection
        title="Actors"
        isEmpty={false}
        isLoading={true}
      >
        <div />
      </TabSection>
    );
  }

  const actorCount = activeActors.length;

  return (
    <div className="space-y-3">
      <TabSection
        title="Actors"
        count={actorCount}
        isEmpty={actorCount === 0 && removedActors.length === 0}
        emptyIcon={faUserGroup}
        emptyMessage="No actors found for this movie"
      >
        {/* Action buttons row */}
        <div className="flex items-center justify-between mb-4">
          {/* Order lock button */}
          <button
            type="button"
            onClick={handleOrderLockToggle}
            className="flex items-center gap-2 px-2 py-1 rounded hover:bg-neutral-800 transition-colors"
          >
            <FontAwesomeIcon
              icon={localOrderLocked ? faLock : faLockOpen}
              className={localOrderLocked ? 'text-red-400' : 'text-neutral-500'}
            />
            <span className="text-sm text-neutral-400">
              {localOrderLocked ? 'Order locked' : 'Order unlocked'}
            </span>
          </button>

          {/* Save/Revert buttons - only show when there are changes */}
          {hasChanges && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRevert}
                disabled={updateCast.isPending}
                className="px-3 py-1.5 text-sm text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded transition-colors disabled:opacity-50"
              >
                Revert
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={updateCast.isPending}
                className="px-3 py-1.5 text-sm bg-primary-600 hover:bg-primary-500 text-white rounded transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {updateCast.isPending && (
                  <FontAwesomeIcon icon={faSpinner} spin className="h-3 w-3" />
                )}
                Save
              </button>
            </div>
          )}
        </div>

        {/* Actor list with native drag-drop */}
        {actorCount > 0 && (
          <div className="space-y-2">
            {activeActors.map((actor, index) => (
              <SortableActorRow
                key={actor.actor_id}
                actor={actor}
                index={index}
                onRoleChange={handleRoleChange}
                onRoleLockToggle={handleRoleLockToggle}
                onRemove={handleRemove}
                onDragStart={handleDragStart}
                onDragEnter={handleDragEnter}
                onDragEnd={handleDragEnd}
                isDragOver={dragOverIndex === index && dragOverIndex !== dragItem.current}
              />
            ))}
          </div>
        )}

        {/* Removed actors section */}
        <RemovedActorsList
          actors={removedActors.map((a) => ({
            actor_id: a.actor_id,
            actor_name: a.actor_name,
            role: a.role,
          }))}
          onRestore={handleRestore}
        />
      </TabSection>
    </div>
  );
};
