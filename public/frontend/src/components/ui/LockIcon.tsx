import * as React from 'react';
import { Lock, LockOpen } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface LockIconProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * Whether the field is locked (true) or unlocked (false)
   */
  locked: boolean;

  /**
   * Callback fired when the lock icon is clicked
   */
  onToggle?: (locked: boolean) => void;

  /**
   * Size variant
   */
  size?: 'sm' | 'md' | 'lg';

  /**
   * Loading state
   */
  loading?: boolean;

  /**
   * Show only as indicator (not clickable)
   */
  indicatorOnly?: boolean;
}

/**
 * LockIcon Component
 *
 * A toggle icon for field-level locking.
 * - Locked (true): Red lock icon - automation CANNOT modify this field
 * - Unlocked (false): Gray lock open icon - automation CAN modify this field
 *
 * When a field is locked, enrichment services will skip updating it.
 * Locks are automatically set when user manually edits a field.
 *
 * This is separate from monitored status:
 * - monitored = false: ALL automation frozen (global stop)
 * - field locked = true: Only THAT field frozen (granular protection)
 */
export const LockIcon = React.forwardRef<HTMLButtonElement, LockIconProps>(
  (
    {
      locked,
      onToggle,
      size = 'sm',
      loading = false,
      indicatorOnly = false,
      className,
      disabled,
      ...props
    },
    ref
  ) => {
    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation(); // Prevent parent element clicks
      if (!loading && !disabled && !indicatorOnly && onToggle) {
        onToggle(!locked);
      }
    };

    const sizeClasses = {
      sm: 'h-4 w-4',
      md: 'h-5 w-5',
      lg: 'h-6 w-6',
    };

    const iconSizeClasses = {
      sm: 'h-3 w-3',
      md: 'h-4 w-4',
      lg: 'h-5 w-5',
    };

    const buttonClasses = cn(
      'inline-flex items-center justify-center rounded-sm transition-all',
      'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
      !indicatorOnly && 'hover:bg-neutral-700',
      indicatorOnly && 'cursor-default',
      disabled && 'pointer-events-none opacity-50',
      sizeClasses[size],
      className
    );

    const iconClasses = cn(
      iconSizeClasses[size],
      // Locked: red color (field is protected)
      locked && 'text-red-500 dark:text-red-400',
      // Unlocked: gray color (field can be modified)
      !locked && 'text-gray-400 dark:text-gray-600'
    );

    if (indicatorOnly) {
      // Just show the icon, not clickable
      return (
        <div
          className={buttonClasses}
          title={
            locked
              ? 'Field locked - automation will not modify'
              : 'Field unlocked - automation can modify'
          }
        >
          {loading ? (
            <svg
              className={cn('animate-spin', iconSizeClasses[size])}
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          ) : locked ? (
            <Lock className={iconClasses} />
          ) : (
            <LockOpen className={iconClasses} />
          )}
        </div>
      );
    }

    return (
      <button
        ref={ref}
        type="button"
        onClick={handleClick}
        disabled={disabled || loading}
        className={buttonClasses}
        title={
          locked
            ? 'Locked - Click to unlock (allow automation)'
            : 'Unlocked - Click to lock (prevent automation)'
        }
        {...props}
      >
        {loading ? (
          // Loading spinner
          <svg
            className={cn('animate-spin', iconSizeClasses[size])}
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        ) : locked ? (
          // Locked icon (red)
          <Lock className={iconClasses} />
        ) : (
          // Unlocked icon (gray)
          <LockOpen className={iconClasses} />
        )}
      </button>
    );
  }
);

LockIcon.displayName = 'LockIcon';
