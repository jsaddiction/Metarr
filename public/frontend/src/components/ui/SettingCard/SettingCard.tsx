import React from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { SettingCardProps } from './types';

export function SettingCard({
  title,
  description,
  icon,
  variant = 'default',
  children,
}: SettingCardProps) {
  return (
    <Card className={cn(variant === 'subtle' ? 'card-raised-subtle' : 'card-raised')}>
      <CardHeader>
        <div className="flex items-center gap-3">
          {icon && <div className="text-primary-500">{icon}</div>}
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-white">{title}</h3>
            {description && <p className="text-sm text-neutral-400 mt-1">{description}</p>}
          </div>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
