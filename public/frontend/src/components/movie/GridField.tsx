import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLock, faLockOpen, faChevronUp, faChevronDown, faCalendar } from '@fortawesome/free-solid-svg-icons';
import { cn } from '@/lib/utils';

interface GridFieldProps {
  label: string;
  field: string;
  value: any;
  locked: boolean;
  type?: 'text' | 'number' | 'date';
  onChange: (value: any) => void;
  onToggleLock: (field: string) => void;
  className?: string;
}

export const GridField = React.memo<GridFieldProps>(
  ({ label, field, value, locked, type = 'text', onChange, onToggleLock, className = '' }) => {
    const dateInputRef = React.useRef<HTMLInputElement>(null);
    const hiddenDateInputRef = React.useRef<HTMLInputElement>(null);

    const handleIncrement = () => {
      const currentValue = parseFloat(value) || 0;
      onChange(currentValue + 1);
    };

    const handleDecrement = () => {
      const currentValue = parseFloat(value) || 0;
      onChange(currentValue - 1);
    };

    const handleCalendarClick = () => {
      if (hiddenDateInputRef.current) {
        hiddenDateInputRef.current.showPicker();
      }
    };

    const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      // Format from native date input (YYYY-MM-DD) is already correct
      onChange(e.target.value);
    };

    const handleTextDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;

      // Allow empty value
      if (value === '') {
        onChange('');
        return;
      }

      // Validate YYYY-MM-DD format
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(value)) {
        // Invalid format, don't update
        return;
      }

      // Validate it's a real date
      const date = new Date(value);
      if (isNaN(date.getTime())) {
        // Invalid date, don't update
        return;
      }

      // Ensure the date components match (handles cases like 2024-02-31)
      const [year, month, day] = value.split('-').map(Number);
      if (date.getFullYear() !== year || date.getMonth() + 1 !== month || date.getDate() !== day) {
        // Invalid date (e.g., Feb 31), don't update
        return;
      }

      onChange(value);
    };

    return (
      <div className={cn("min-w-0", className)}>
        <label className="text-xs font-medium text-neutral-400 mb-1 block">
          {label}
        </label>
        <div className={`flex items-stretch relative rounded transition-all group ${
          locked
            ? 'hover:ring-1 hover:ring-red-500 focus-within:ring-1 focus-within:ring-red-500'
            : 'hover:ring-1 hover:ring-primary-500 focus-within:ring-1 focus-within:ring-primary-500'
        }`}>
          {type === 'date' && (
            <input
              ref={hiddenDateInputRef}
              type="date"
              value={value || ''}
              onChange={handleDateChange}
              className="absolute opacity-0"
              style={{
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                zIndex: -1,
                pointerEvents: 'none',
                textAlign: 'right',
              }}
            />
          )}
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
          <input
            ref={type === 'date' ? dateInputRef : null}
            type={type === 'date' ? 'text' : type}
            value={value || ''}
            onChange={(e) => {
              if (type === 'number') {
                onChange(parseFloat(e.target.value));
              } else if (type === 'date') {
                handleTextDateChange(e);
              } else {
                onChange(e.target.value);
              }
            }}
            placeholder={type === 'date' ? 'YYYY-MM-DD' : undefined}
            className={`flex-1 h-8 px-2.5 py-1 text-sm bg-neutral-800 border text-neutral-200 transition-colors placeholder:text-neutral-500 focus-visible:outline-none rounded-r border-l-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
              type === 'number' || type === 'date' ? 'pr-6' : ''
            } ${
              locked
                ? 'border-red-500/50'
                : 'border-neutral-600'
            }`}
          />
          {type === 'number' && (
            <div className={cn(
              "absolute right-0 top-0 bottom-0 flex flex-col w-5 border-l rounded-r overflow-hidden",
              locked ? "border-red-500/50" : "border-neutral-600"
            )}>
              <button
                type="button"
                onClick={handleIncrement}
                className="px-2 flex-1 flex items-center justify-center bg-neutral-700 text-neutral-400 hover:bg-neutral-600 transition-colors"
                title="Increment"
              >
                <FontAwesomeIcon icon={faChevronUp} className="text-[10px]" />
              </button>
              <div className={cn("border-t", locked ? "border-red-500/50" : "border-neutral-600")}></div>
              <button
                type="button"
                onClick={handleDecrement}
                className="px-2 flex-1 flex items-center justify-center bg-neutral-700 text-neutral-400 hover:bg-neutral-600 transition-colors"
                title="Decrement"
              >
                <FontAwesomeIcon icon={faChevronDown} className="text-[10px]" />
              </button>
            </div>
          )}
          {type === 'date' && (
            <button
              type="button"
              onClick={handleCalendarClick}
              className={cn(
                "absolute right-0 top-0 bottom-0 w-8 flex items-center justify-center bg-neutral-700 text-neutral-400 hover:bg-neutral-600 transition-colors border-l rounded-r",
                locked ? "border-red-500/50" : "border-neutral-600"
              )}
              title="Select date"
            >
              <FontAwesomeIcon icon={faCalendar} className="text-xs" />
            </button>
          )}
        </div>
      </div>
    );
  }
);

GridField.displayName = 'GridField';
