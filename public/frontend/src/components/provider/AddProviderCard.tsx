import React from 'react';
import { Card } from '@/components/ui/card';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus } from '@fortawesome/free-solid-svg-icons';
import { cn } from '@/lib/utils';

interface AddProviderCardProps {
  onClick: () => void;
  disabled?: boolean;
}

export const AddProviderCard: React.FC<AddProviderCardProps> = ({ onClick, disabled = false }) => {
  return (
    <Card
      onClick={disabled ? undefined : onClick}
      className={cn(
        'transition-all duration-200 border-dashed flex items-center justify-center min-h-[200px]',
        disabled
          ? 'opacity-50 cursor-not-allowed'
          : 'cursor-pointer hover:outline hover:outline-2 hover:outline-primary hover:border-primary hover:bg-primary/5'
      )}
    >
      <div className="text-center p-6">
        <FontAwesomeIcon
          icon={faPlus}
          className={cn(
            'text-4xl mb-3',
            disabled ? 'text-neutral-600' : 'text-primary-500'
          )}
        />
        <p className={cn(
          'font-medium',
          disabled ? 'text-neutral-500' : 'text-neutral-300'
        )}>
          {disabled ? 'All Providers Enabled' : 'Add Provider'}
        </p>
        <p className="text-neutral-500 text-sm mt-1">
          {disabled ? 'No more providers available' : 'Configure a new metadata provider'}
        </p>
      </div>
    </Card>
  );
};
