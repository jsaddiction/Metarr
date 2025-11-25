import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { DataCardProps } from './types';

export function DataCard({ title, description, action, children, noPadding = false }: DataCardProps) {
  return (
    <Card className="bg-neutral-800 border border-neutral-700 rounded-xl">
      {(title || description || action) && (
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              {title && <CardTitle>{title}</CardTitle>}
              {description && <CardDescription>{description}</CardDescription>}
            </div>
            {action}
          </div>
        </CardHeader>
      )}
      <CardContent className={noPadding ? 'p-0' : ''}>
        {children}
      </CardContent>
    </Card>
  );
}
