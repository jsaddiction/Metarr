import React, { useCallback } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NumberInputProps } from './types';

export function NumberInput({
  value,
  onChange,
  min = 0,
  max = 999,
  step = 1,
  disabled = false,
  className,
  id,
  title,
}: NumberInputProps) {
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
    <div className={cn("relative inline-flex h-8", className)}>
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
        className="w-full pr-6 pl-3 text-sm bg-neutral-800 border border-neutral-600 rounded text-neutral-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <div className="absolute right-0 top-0 bottom-0 flex flex-col w-5 border-l border-neutral-600">
        <button
          type="button"
          onClick={handleIncrement}
          disabled={disabled || value >= max}
          className="flex-1 flex items-center justify-center bg-neutral-700 border-b border-neutral-600 rounded-tr text-neutral-300 hover:bg-neutral-600 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-neutral-700 disabled:hover:text-neutral-300"
          title="Increment"
        >
          <ChevronUp className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={handleDecrement}
          disabled={disabled || value <= min}
          className="flex-1 flex items-center justify-center bg-neutral-700 rounded-br text-neutral-300 hover:bg-neutral-600 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-neutral-700 disabled:hover:text-neutral-300"
          title="Decrement"
        >
          <ChevronDown className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
