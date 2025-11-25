import React from 'react';
import type { PageContainerProps } from './types';

export function PageContainer({ title, subtitle, children }: PageContainerProps) {
  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
