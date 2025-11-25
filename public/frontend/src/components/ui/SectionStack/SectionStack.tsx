import React from 'react';
import { cn } from '@/lib/utils';

export interface SectionStackProps {
  spacing?: 'default' | 'compact';
  children: React.ReactNode;
}

export function SectionStack({ spacing = 'default', children }: SectionStackProps) {
  return (
    <div className={cn(spacing === 'compact' ? 'section-stack-compact' : 'section-stack')}>
      {children}
    </div>
  );
}
