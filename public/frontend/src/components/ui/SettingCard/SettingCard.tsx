import React from 'react';
import type { SettingCardProps } from './types';

export function SettingCard({
  title,
  description,
  icon,
  children,
}: SettingCardProps) {
  return (
    <div className="card">
      <div className="card-header">
        <div className="flex items-center gap-3">
          {icon && <div className="text-primary-500">{icon}</div>}
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-white">{title}</h3>
            {description && <p className="text-sm text-neutral-400 mt-1">{description}</p>}
          </div>
        </div>
      </div>
      <div className="card-body">{children}</div>
    </div>
  );
}
