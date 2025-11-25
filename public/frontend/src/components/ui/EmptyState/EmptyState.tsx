import React from 'react';
import { EmptyStateProps } from './types';

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="py-8 text-center">
      {icon && <div className="text-muted-foreground text-4xl mb-4">{icon}</div>}
      <p className="text-foreground mb-2">{title}</p>
      {description && <p className="text-muted-foreground text-sm mb-4">{description}</p>}
      {action && (
        action.href ? (
          <a
            href={action.href}
            className="text-primary hover:text-primary/80 underline-offset-4 hover:underline"
          >
            {action.label}
          </a>
        ) : (
          <button
            onClick={action.onClick}
            className="text-primary hover:text-primary/80 underline-offset-4 hover:underline"
          >
            {action.label}
          </button>
        )
      )}
    </div>
  );
}
