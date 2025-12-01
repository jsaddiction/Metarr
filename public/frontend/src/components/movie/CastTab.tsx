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
  image_hash: string | null;
}

export const CastTab: React.FC<CastTabProps> = ({ movieId }) => {
  const { data: castData, isLoading } = useCast(movieId);
  const updateCast = useUpdateCast();

  // Local state for tracking changes
  const [localActors, setLocalActors] = useState<LocalActorState[]>([]);
  const [originalState, setOriginalState] = useState<{
    actors: LocalActorState[];
    orderLocked: boolean;
  } | null>(null);
  // Track if user has manually toggled the lock (null = no manual override)
  const [manualLockOverride, setManualLockOverride] = useState<boolean | null>(null);

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
        image_hash: a.image_hash,
      }));
      setLocalActors(actors);
      setOriginalState({
        actors: JSON.parse(JSON.stringify(actors)),
        orderLocked: castData.actors_order_locked,
      });
      setManualLockOverride(null); // Reset manual override when server data loads
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

  // Check if the current order differs from the original order
  const orderChanged = useMemo(() => {
    if (!originalState) return false;
    const originalOrder = originalState.actors
      .filter((a) => !a.removed)
      .sort((a, b) => a.actor_order - b.actor_order)
      .map((a) => a.actor_id);
    const currentOrder = localActors
      .filter((a) => !a.removed)
      .sort((a, b) => a.actor_order - b.actor_order)
      .map((a) => a.actor_id);
    return JSON.stringify(originalOrder) !== JSON.stringify(currentOrder);
  }, [localActors, originalState]);

  // Derive the effective lock state:
  // - If user manually toggled, use that value
  // - Else if order changed and server was unlocked, show locked (auto-lock)
  // - Else show server state
  const effectiveLockState = useMemo(() => {
    if (manualLockOverride !== null) {
      return manualLockOverride;
    }
    if (orderChanged && originalState && !originalState.orderLocked) {
      return true; // Auto-lock when order changes and server was unlocked
    }
    return originalState?.orderLocked ?? false;
  }, [manualLockOverride, orderChanged, originalState]);

  // Detect if there are unsaved changes
  const hasChanges = useMemo(() => {
    if (!originalState) return false;

    // Check if lock state changed
    const lockChanged = effectiveLockState !== originalState.orderLocked;
    if (lockChanged) return true;

    // Check if order changed (by actor_id sequence, not actor_order values)
    if (orderChanged) return true;

    // Check if any actor's role, role_locked, or removed status changed
    for (const localActor of localActors) {
      const originalActor = originalState.actors.find((a) => a.actor_id === localActor.actor_id);
      if (!originalActor) return true; // New actor somehow
      if (localActor.role !== originalActor.role) return true;
      if (localActor.role_locked !== originalActor.role_locked) return true;
      if (localActor.removed !== originalActor.removed) return true;
    }

    return false;
  }, [localActors, effectiveLockState, orderChanged, originalState]);

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

  // Handle order lock toggle - sets manual override
  const handleOrderLockToggle = useCallback(() => {
    setManualLockOverride((prev) => {
      // Toggle from current effective state
      const currentEffective = prev !== null
        ? prev
        : (orderChanged && originalState && !originalState.orderLocked)
          ? true
          : originalState?.orderLocked ?? false;
      return !currentEffective;
    });
  }, [orderChanged, originalState]);

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
        actors_order_locked: effectiveLockState,
      },
    });
  }, [movieId, localActors, effectiveLockState, updateCast]);

  // Handle revert - reset to original state
  const handleRevert = useCallback(() => {
    if (originalState) {
      setLocalActors(JSON.parse(JSON.stringify(originalState.actors)));
      setManualLockOverride(null); // Clear manual override, will show server state
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
        {/* Action buttons row - ml-9 aligns with row content (past the w-6 index + gap-3) */}
        <div className="flex items-center justify-between mb-4 ml-9">
          {/* Order lock button */}
          <button
            type="button"
            onClick={handleOrderLockToggle}
            className="flex items-center gap-2 px-2 py-1 rounded hover:bg-neutral-800 transition-colors"
          >
            <FontAwesomeIcon
              icon={effectiveLockState ? faLock : faLockOpen}
              className={effectiveLockState ? 'text-red-400' : 'text-neutral-500'}
            />
            <span className="text-sm text-neutral-400">
              {effectiveLockState ? 'Order locked' : 'Order unlocked'}
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
            image_hash: a.image_hash,
          }))}
          onRestore={handleRestore}
        />
      </TabSection>
    </div>
  );
};
