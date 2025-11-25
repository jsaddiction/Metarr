import React from 'react';
import { LoadingStateProps } from './types';

export function LoadingState({ message = 'Loading...', size = 'md' }: LoadingStateProps) {
  const sizeClasses = {
    sm: 'py-8',
    md: 'py-12',
    lg: 'py-32'
  };

  const spinnerSizes = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-12 h-12'
  };

  return (
    <div className={`flex flex-col items-center justify-center text-muted-foreground ${sizeClasses[size]}`}>
      <div className={`${spinnerSizes[size]} border-4 border-neutral-700 border-t-primary-500 rounded-full animate-spin mb-3`} />
      <p className="text-sm">{message}</p>
    </div>
  );
}
