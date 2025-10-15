import * as React from 'react';
import { Bookmark, BookmarkCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BookmarkToggleProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * Whether the item is monitored (true) or unmonitored (false)
   */
  monitored: boolean;

  /**
   * Callback fired when the bookmark is clicked
   */
  onToggle?: (monitored: boolean) => void;

  /**
   * Size variant
   */
  size?: 'sm' | 'md' | 'lg';

  /**
   * Loading state
   */
  loading?: boolean;
}

/**
 * BookmarkToggle Component
 *
 * A toggle button styled like Sonarr/Radarr's bookmark icon.
 * - Monitored (true): Filled bookmark icon (purple/blue)
 * - Unmonitored (false): Outline bookmark icon (gray)
 *
 * When unmonitored, ALL automation is frozen for that item.
 * This is separate from field locks - unmonitored stops everything.
 */
export const BookmarkToggle = React.forwardRef<HTMLButtonElement, BookmarkToggleProps>(
  ({ monitored, onToggle, size = 'md', loading = false, className, disabled, ...props }, ref) => {
    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation(); // Prevent row click in tables
      if (!loading && !disabled && onToggle) {
        onToggle(!monitored);
      }
    };

    const sizeClasses = {
      sm: 'h-6 w-6',
      md: 'h-8 w-8',
      lg: 'h-10 w-10',
    };

    const iconSizeClasses = {
      sm: 'h-3.5 w-3.5',
      md: 'h-4 w-4',
      lg: 'h-5 w-5',
    };

    return (
      <button
        ref={ref}
        type="button"
        onClick={handleClick}
        disabled={disabled || loading}
        className={cn(
          'inline-flex items-center justify-center rounded-md transition-all',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'disabled:pointer-events-none disabled:opacity-50',
          sizeClasses[size],
          // Monitored: filled bookmark with purple/blue color
          monitored &&
            'text-purple-500 hover:text-purple-600 dark:text-purple-400 dark:hover:text-purple-300',
          // Unmonitored: outline bookmark with gray color
          !monitored &&
            'text-gray-400 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-500',
          className
        )}
        title={
          monitored
            ? 'Monitored - Automation enabled (click to unmonitor)'
            : 'Unmonitored - Automation frozen (click to monitor)'
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
        ) : monitored ? (
          // Filled bookmark (monitored)
          <BookmarkCheck className={iconSizeClasses[size]} />
        ) : (
          // Outline bookmark (unmonitored)
          <Bookmark className={iconSizeClasses[size]} />
        )}
      </button>
    );
  }
);

BookmarkToggle.displayName = 'BookmarkToggle';
