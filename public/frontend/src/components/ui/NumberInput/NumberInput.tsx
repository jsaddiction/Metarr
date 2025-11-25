import React, { useCallback } from 'react';
import { Minus, Plus } from 'lucide-react';
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
    <div className={cn("flex items-stretch h-8", className)}>
      <button
        type="button"
        onClick={handleDecrement}
        disabled={disabled || value <= min}
        className="w-8 flex items-center justify-center bg-neutral-700 border border-neutral-600 border-r-0 rounded-l text-neutral-300 hover:bg-neutral-600 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-neutral-700 disabled:hover:text-neutral-300"
        title="Decrement"
      >
        <Minus className="h-3 w-3" />
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
        className="w-16 text-center text-sm bg-neutral-800 border-t border-b border-neutral-600 text-neutral-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button
        type="button"
        onClick={handleIncrement}
        disabled={disabled || value >= max}
        className="w-8 flex items-center justify-center bg-neutral-700 border border-neutral-600 border-l-0 rounded-r text-neutral-300 hover:bg-neutral-600 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-neutral-700 disabled:hover:text-neutral-300"
        title="Increment"
      >
        <Plus className="h-3 w-3" />
      </button>
    </div>
  );
}
