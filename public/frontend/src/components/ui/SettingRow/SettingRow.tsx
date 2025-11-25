import React from 'react';
import { Label } from '@/components/ui/label';
import type { SettingRowProps } from './types';

export function SettingRow({ label, description, children }: SettingRowProps) {
  return (
    <div className="setting-row">
      <div className="flex-1">
        <Label className="text-white">{label}</Label>
        {description && <p className="text-sm text-neutral-400 mt-1">{description}</p>}
      </div>
      <div className="flex items-center">{children}</div>
    </div>
  );
}
