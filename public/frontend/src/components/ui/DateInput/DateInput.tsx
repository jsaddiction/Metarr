import React, { useCallback, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCalendar, faLock, faLockOpen } from '@fortawesome/free-solid-svg-icons';
import { cn } from '@/lib/utils';
import type { DateInputProps } from './types';

export function DateInput({
  value,
  onChange,
  disabled = false,
  className,
  id,
  title,
  locked,
  onToggleLock,
}: DateInputProps) {
  const hiddenDateInputRef = useRef<HTMLInputElement>(null);

  const handleCalendarClick = useCallback(() => {
    if (hiddenDateInputRef.current) {
      hiddenDateInputRef.current.showPicker();
    }
  }, []);

  const handleDateChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
    },
    [onChange]
  );

  const handleTextDateChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;

      // Allow empty value
      if (newValue === '') {
        onChange('');
        return;
      }

      // Validate YYYY-MM-DD format
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(newValue)) {
        return;
      }

      // Validate it's a real date
      const date = new Date(newValue);
      if (isNaN(date.getTime())) {
        return;
      }

      // Ensure the date components match
      const [year, month, day] = newValue.split('-').map(Number);
      if (date.getFullYear() !== year || date.getMonth() + 1 !== month || date.getDate() !== day) {
        return;
      }

      onChange(newValue);
    },
    [onChange]
  );

  const hasLock = locked !== undefined && onToggleLock !== undefined;

  if (!hasLock) {
    return (
      <div className={cn('relative inline-flex h-8', className)}>
        <input
          ref={hiddenDateInputRef}
          type="date"
          value={value || ''}
          onChange={handleDateChange}
          className="absolute opacity-0 pointer-events-none"
          style={{ zIndex: -1 }}
        />
        <input
          id={id}
          type="text"
          value={value || ''}
          onChange={handleTextDateChange}
          placeholder="YYYY-MM-DD"
          disabled={disabled}
          title={title}
          className="w-full pr-6 pl-3 text-sm bg-neutral-800 border border-neutral-600 rounded text-neutral-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed placeholder:text-neutral-500"
        />
        <button
          type="button"
          onClick={handleCalendarClick}
          disabled={disabled}
          className="absolute right-0 top-0 bottom-0 w-6 flex items-center justify-center bg-neutral-700 border-l border-neutral-600 rounded-r text-neutral-300 hover:bg-neutral-600 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Select date"
        >
          <FontAwesomeIcon icon={faCalendar} className="text-xs" />
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'min-w-0 flex items-stretch rounded transition-all group',
        locked
          ? 'hover:ring-1 hover:ring-red-500 focus-within:ring-1 focus-within:ring-red-500'
          : 'hover:ring-1 hover:ring-primary-500 focus-within:ring-1 focus-within:ring-primary-500',
        className
      )}
    >
      <input
        ref={hiddenDateInputRef}
        type="date"
        value={value || ''}
        onChange={handleDateChange}
        className="absolute opacity-0 pointer-events-none"
        style={{ zIndex: -1 }}
      />
      <button
        type="button"
        onClick={onToggleLock}
        className={cn(
          'w-7 rounded-l border flex items-center justify-center transition-colors',
          locked
            ? 'bg-red-500/20 border-red-500/50 text-red-400 hover:bg-red-500/30'
            : 'bg-neutral-700 border-neutral-600 text-neutral-400 hover:bg-neutral-600'
        )}
        title={locked ? 'Locked' : 'Unlocked'}
      >
        <FontAwesomeIcon icon={locked ? faLock : faLockOpen} className="text-sm" />
      </button>
      <div className="relative flex-1 min-w-0">
        <input
          id={id}
          type="text"
          value={value || ''}
          onChange={handleTextDateChange}
          placeholder="YYYY-MM-DD"
          disabled={disabled}
          title={title}
          className={cn(
            'w-full h-8 pr-7 pl-2.5 py-1 text-sm bg-neutral-800 border border-l-0 rounded-r text-neutral-200 focus-visible:outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed placeholder:text-neutral-500',
            locked ? 'border-red-500/50' : 'border-neutral-600'
          )}
        />
        <button
          type="button"
          onClick={handleCalendarClick}
          disabled={disabled}
          className={cn(
            'absolute right-0 top-0 bottom-0 w-7 flex items-center justify-center bg-neutral-700 text-neutral-300 hover:bg-neutral-600 hover:text-white transition-colors border-l border-t border-r border-b rounded-r disabled:opacity-50 disabled:cursor-not-allowed',
            locked ? 'border-red-500/50' : 'border-neutral-600'
          )}
          title="Select date"
        >
          <FontAwesomeIcon icon={faCalendar} className="text-sm" />
        </button>
      </div>
    </div>
  );
}
