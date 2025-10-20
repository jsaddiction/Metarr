/**
 * EmptySlotCard Component
 *
 * Displays an empty skeleton slot for assets that haven't been selected yet.
 * Shows a dashed border with a "+" icon to indicate the slot can be filled.
 */

import React from 'react';
import { Card, CardContent } from '../ui/card';

interface EmptySlotCardProps {
  assetType: string;
  onClick?: () => void;
}

export const EmptySlotCard: React.FC<EmptySlotCardProps> = ({ assetType, onClick }) => {
  return (
    <Card
      className="relative border-2 border-dashed border-gray-600 bg-gray-800/50 hover:border-primary-500 hover:bg-gray-800/70 transition-all cursor-pointer"
      onClick={onClick}
    >
      <CardContent className="p-0">
        <div className="aspect-[2/3] flex flex-col items-center justify-center text-gray-500">
          {/* Plus icon */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-12 w-12 mb-2"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 4v16m8-8H4"
            />
          </svg>
          <span className="text-sm font-medium">Add {assetType}</span>
        </div>
      </CardContent>
    </Card>
  );
};
