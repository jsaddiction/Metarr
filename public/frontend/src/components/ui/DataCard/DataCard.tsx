import React from 'react';
import { DataCardProps } from './types';

export function DataCard({ title, description, action, children, noPadding = false }: DataCardProps) {
  return (
    <div className="card">
      {(title || description || action) && (
        <div className="card-header">
          <div className="flex items-center justify-between">
            <div>
              {title && <h3 className="text-lg font-semibold text-white">{title}</h3>}
              {description && <p className="text-sm text-neutral-400 mt-1">{description}</p>}
            </div>
            {action}
          </div>
        </div>
      )}
      <div className={noPadding ? 'p-0' : 'card-body'}>
        {children}
      </div>
    </div>
  );
}
