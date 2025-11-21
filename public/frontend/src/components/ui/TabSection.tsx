import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLock, faLockOpen, faSpinner, type IconDefinition } from '@fortawesome/free-solid-svg-icons';

interface TabSectionProps {
  // Visual Identity
  title: string;
  icon?: IconDefinition;

  // Counts & Status
  count?: number;
  maxCount?: number;

  // Locking System
  locked?: boolean;
  onToggleLock?: () => void;

  // Actions
  onAction?: () => void;
  actionLabel?: string;
  actionIcon?: IconDefinition;

  // Empty State
  isEmpty?: boolean;
  emptyIcon?: IconDefinition;
  emptyMessage?: string;
  emptyAction?: {
    label: string;
    onClick: () => void;
    icon?: IconDefinition;
  };

  // Layout
  children?: React.ReactNode;
  className?: string;
  contentClassName?: string;

  // Loading
  isLoading?: boolean;
}

export const TabSection: React.FC<TabSectionProps> = ({
  title,
  icon,
  count,
  maxCount,
  locked = false,
  onToggleLock,
  onAction,
  actionLabel = 'Edit',
  actionIcon,
  isEmpty = false,
  emptyIcon,
  emptyMessage = 'No items found',
  emptyAction,
  children,
  className = '',
  contentClassName = '',
  isLoading = false,
}) => {
  // Determine if count exceeds limit
  const isOverLimit = count !== undefined && maxCount !== undefined && count > maxCount;

  return (
    <div className={`card ${className}`}>
      {/* Header */}
      <div className="card-body">
        <div className="flex items-center justify-between mb-4">
          {/* Left: Lock + Icon + Title + Count */}
          <div className="flex items-center gap-2">
            {/* Lock button (optional) */}
            {onToggleLock && (
              <button
                onClick={onToggleLock}
                className={`
                  btn btn-sm btn-ghost transition-all duration-200
                  ${locked ? 'text-amber-400 hover:bg-amber-400/10 hover:scale-110' : 'text-neutral-400 hover:scale-110'}
                `}
                title={locked ? 'Locked - click to unlock' : 'Unlocked - click to lock'}
                aria-label={locked ? `Unlock ${title}` : `Lock ${title}`}
              >
                <FontAwesomeIcon icon={locked ? faLock : faLockOpen} aria-hidden="true" />
              </button>
            )}

            {/* Optional section icon */}
            {icon && (
              <FontAwesomeIcon
                icon={icon}
                className="text-primary text-lg transition-transform hover:scale-110"
                aria-hidden="true"
              />
            )}

            {/* Title with count */}
            <h3 className="text-lg font-semibold text-white">
              {title}
              {count !== undefined && (
                <span className={`
                  text-sm font-normal ml-2 transition-colors
                  ${isOverLimit ? 'text-amber-400' : 'text-neutral-400'}
                `}>
                  ({count}{maxCount !== undefined ? `/${maxCount}` : ''})
                </span>
              )}
            </h3>
          </div>

          {/* Right: Action button (optional) */}
          {onAction && (
            <button
              onClick={onAction}
              className="btn btn-secondary btn-sm"
            >
              {actionIcon && <FontAwesomeIcon icon={actionIcon} className="mr-2" aria-hidden="true" />}
              {actionLabel}
            </button>
          )}
        </div>

        {/* Content */}
        <div className={contentClassName}>
          {isLoading ? (
            // Loading state
            <div className="text-center py-8">
              <FontAwesomeIcon icon={faSpinner} spin className="text-3xl text-neutral-400 mb-3" />
              <p className="text-neutral-400">Loading...</p>
            </div>
          ) : isEmpty ? (
            // Empty state
            <div className="text-center py-8 bg-neutral-800/30 rounded border border-dashed border-neutral-700">
              {emptyIcon && (
                <FontAwesomeIcon
                  icon={emptyIcon}
                  className="text-4xl text-neutral-600 mb-3"
                  aria-hidden="true"
                />
              )}
              <p className="text-neutral-400 mb-3">{emptyMessage}</p>
              {emptyAction && (
                <button
                  onClick={emptyAction.onClick}
                  className="btn btn-secondary btn-sm mt-3"
                >
                  {emptyAction.icon && (
                    <FontAwesomeIcon
                      icon={emptyAction.icon}
                      className="mr-2"
                      aria-hidden="true"
                    />
                  )}
                  {emptyAction.label}
                </button>
              )}
            </div>
          ) : (
            // Normal content
            children
          )}
        </div>
      </div>
    </div>
  );
};
