import React, { useCallback } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLock, faLockOpen } from '@fortawesome/free-solid-svg-icons';
import { cn } from '@/lib/utils';
import type { NumberInputWithLockProps } from './types';

export function NumberInputWithLock({
  value,
  onChange,
  locked = false,
  onToggleLock,
  min = 0,
  max = 999,
  step = 1,
  disabled = false,
  className,
  id,
  title,
}: NumberInputWithLockProps) {
  const handleIncrement = useCallback(() => {
    if (disabled) return;
    const newValue = Math.min(value + step, max);
    if (newValue !== value) {
      onChange(newValue);
    }
  }, [value, step, max, disabled, onChange]);

  const handleDecrement = useCallback(() => {
    if (disabled) return;
    const newValue = Math.max(value - step, min);
    if (newValue !== value) {
      onChange(newValue);
    }
  }, [value, step, min, disabled, onChange]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseInt(e.target.value, 10);
    if (!isNaN(newValue) && newValue >= min && newValue <= max) {
      onChange(newValue);
    }
  }, [min, max, onChange]);

  return (
    <div className={cn(
      "flex items-stretch rounded transition-all group",
      locked
        ? "hover:ring-1 hover:ring-red-500 focus-within:ring-1 focus-within:ring-red-500"
        : "hover:ring-1 hover:ring-primary-500 focus-within:ring-1 focus-within:ring-primary-500",
      className
    )}>
      <button
        type="button"
        onClick={onToggleLock}
        className={cn(
          "w-7 rounded-l border flex items-center justify-center transition-colors",
          locked
            ? "bg-red-500/20 border-red-500/50 text-red-400 hover:bg-red-500/30"
            : "bg-neutral-700 border-neutral-600 text-neutral-400 hover:bg-neutral-600"
        )}
        title={locked ? 'Locked' : 'Unlocked'}
      >
        <FontAwesomeIcon icon={locked ? faLock : faLockOpen} className="text-sm" />
      </button>
      <input
        id={id}
        type="number"
        value={value}
        onChange={handleInputChange}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        title={title}
        className={cn(
          "flex-1 h-8 px-2.5 py-1 text-sm bg-neutral-800 border rounded-none border-l-0 text-neutral-200 focus-visible:outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
          locked ? "border-red-500/50" : "border-neutral-600"
        )}
      />
      <div className={cn(
        "w-7 flex flex-col border-t border-b border-r rounded-r overflow-hidden",
        locked ? "border-red-500/50" : "border-neutral-600"
      )}>
        <button
          type="button"
          onClick={handleIncrement}
          disabled={disabled || value >= max}
          className="flex-1 flex items-center justify-center bg-neutral-700 text-neutral-400 hover:bg-neutral-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-neutral-700"
          title="Increment"
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
        <div className={cn("border-t", locked ? "border-red-500/50" : "border-neutral-600")}></div>
        <button
          type="button"
          onClick={handleDecrement}
          disabled={disabled || value <= min}
          className="flex-1 flex items-center justify-center bg-neutral-700 text-neutral-400 hover:bg-neutral-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-neutral-700"
          title="Decrement"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
