import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLock, faLockOpen } from '@fortawesome/free-solid-svg-icons';

interface TextAreaFieldProps {
  label: string;
  field: string;
  value: any;
  locked: boolean;
  onChange: (value: any) => void;
  onToggleLock: (field: string) => void;
  rows?: number;
}

export const TextAreaField = React.memo<TextAreaFieldProps>(
  ({ label, field, value, locked, onChange, onToggleLock, rows = 2 }) => (
    <div>
      <label className="text-xs font-medium text-neutral-400 mb-1 block">
        {label}
      </label>
      <div className={`flex items-stretch rounded transition-all ${
        locked
          ? 'hover:ring-1 hover:ring-red-500 focus-within:ring-1 focus-within:ring-red-500'
          : 'hover:ring-1 hover:ring-primary-500 focus-within:ring-1 focus-within:ring-primary-500'
      }`}>
        <button
          type="button"
          onClick={() => onToggleLock(field)}
          className={`px-2 rounded-l border flex items-center transition-colors ${
            locked
              ? 'bg-red-500/20 border-red-500/50 text-red-400 hover:bg-red-500/30'
              : 'bg-neutral-700 border-neutral-600 text-neutral-400 hover:bg-neutral-600'
          }`}
          title={locked ? 'Locked' : 'Unlocked'}
        >
          <FontAwesomeIcon icon={locked ? faLock : faLockOpen} className="text-xs" />
        </button>
        <textarea
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          className={`flex-1 w-full border bg-neutral-800 px-2.5 py-1.5 text-sm text-neutral-200 placeholder:text-neutral-500 focus-visible:outline-none resize-none border-l-0 rounded-r transition-colors ${
            locked
              ? 'border-red-500/50'
              : 'border-neutral-600'
          }`}
          rows={rows}
        />
      </div>
    </div>
  )
);

TextAreaField.displayName = 'TextAreaField';
