import React, { useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLock, faLockOpen } from '@fortawesome/free-solid-svg-icons';
import { cn } from '@/lib/utils';
import type { TextInputProps } from './types';

export function TextInput({
  value,
  onChange,
  placeholder,
  disabled = false,
  className,
  id,
  title,
  locked,
  onToggleLock,
}: TextInputProps) {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
    },
    [onChange]
  );

  const hasLock = locked !== undefined && onToggleLock !== undefined;

  if (!hasLock) {
    return (
      <input
        id={id}
        type="text"
        value={value || ''}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        title={title}
        className={cn(
          'h-8 px-3 text-sm bg-neutral-800 border border-neutral-600 rounded text-neutral-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed placeholder:text-neutral-500',
          className
        )}
      />
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
      <input
        id={id}
        type="text"
        value={value || ''}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        title={title}
        className={cn(
          'flex-1 min-w-0 h-8 px-2.5 py-1 text-sm bg-neutral-800 border border-l-0 rounded-r text-neutral-200 focus-visible:outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed placeholder:text-neutral-500',
          locked ? 'border-red-500/50' : 'border-neutral-600'
        )}
      />
    </div>
  );
}
