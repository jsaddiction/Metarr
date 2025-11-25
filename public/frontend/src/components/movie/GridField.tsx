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
        <div className={cn(
          "min-w-0 flex items-stretch rounded transition-all group",
          locked
            ? 'hover:ring-1 hover:ring-red-500 focus-within:ring-1 focus-within:ring-red-500'
            : 'hover:ring-1 hover:ring-primary-500 focus-within:ring-1 focus-within:ring-primary-500'
        )}>
          <button
            type="button"
            onClick={() => onToggleLock(field)}
            className={`w-7 rounded-l border flex items-center justify-center transition-colors ${
              locked
                ? 'bg-red-500/20 border-red-500/50 text-red-400 hover:bg-red-500/30'
                : 'bg-neutral-700 border-neutral-600 text-neutral-400 hover:bg-neutral-600'
            }`}
            title={locked ? 'Locked' : 'Unlocked'}
          >
            <FontAwesomeIcon icon={locked ? faLock : faLockOpen} className="text-sm" />
          </button>
          {type === 'date' ? (
            <div className="relative flex-1 min-w-0">
              <input
                ref={hiddenDateInputRef}
                type="date"
                value={value || ''}
                onChange={handleDateChange}
                className="absolute opacity-0 pointer-events-none"
                style={{ zIndex: -1 }}
              />
              <input
                ref={dateInputRef}
                type="text"
                value={value || ''}
                onChange={handleTextDateChange}
                placeholder="YYYY-MM-DD"
                className={`w-full h-8 pr-7 pl-2.5 py-1 text-sm bg-neutral-800 border border-l-0 rounded-r text-neutral-200 transition-colors placeholder:text-neutral-500 focus-visible:outline-none ${
                  locked ? 'border-red-500/50' : 'border-neutral-600'
                }`}
              />
              <button
                type="button"
                onClick={handleCalendarClick}
                className={cn(
                  "absolute right-0 top-0 bottom-0 w-7 flex items-center justify-center bg-neutral-700 text-neutral-400 hover:bg-neutral-600 transition-colors border-l border-t border-r border-b rounded-r",
                  locked ? "border-red-500/50" : "border-neutral-600"
                )}
                title="Select date"
              >
                <FontAwesomeIcon icon={faCalendar} className="text-sm" />
              </button>
            </div>
          ) : (
            <>
              <input
                type={type}
                value={value || ''}
                onChange={(e) => {
                  if (type === 'number') {
                    onChange(parseFloat(e.target.value));
                  } else {
                    onChange(e.target.value);
                  }
                }}
                className={`flex-1 min-w-0 h-8 px-2.5 py-1 text-sm bg-neutral-800 border text-neutral-200 transition-colors placeholder:text-neutral-500 focus-visible:outline-none ${
                  type === 'number' ? 'rounded-none border-r-0' : 'rounded-r'
                } border-l-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                  locked ? 'border-red-500/50' : 'border-neutral-600'
                }`}
              />
              {type === 'number' && (
                <div className={`w-7 flex flex-col border-t border-b border-r rounded-r overflow-hidden ${
                  locked ? 'border-red-500/50' : 'border-neutral-600'
                }`}>
                  <button
                    type="button"
                    onClick={handleIncrement}
                    className="flex-1 flex items-center justify-center bg-neutral-700 text-neutral-400 hover:bg-neutral-600 transition-colors"
                    title="Increment"
                  >
                    <FontAwesomeIcon icon={faChevronUp} className="text-sm" />
                  </button>
                  <div className={`border-t ${locked ? 'border-red-500/50' : 'border-neutral-600'}`}></div>
                  <button
                    type="button"
                    onClick={handleDecrement}
                    className="flex-1 flex items-center justify-center bg-neutral-700 text-neutral-400 hover:bg-neutral-600 transition-colors"
                    title="Decrement"
                  >
                    <FontAwesomeIcon icon={faChevronDown} className="text-sm" />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }
);

GridField.displayName = 'GridField';
