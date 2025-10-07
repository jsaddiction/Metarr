import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus } from '@fortawesome/free-solid-svg-icons';

interface AddLibraryCardProps {
  onClick: () => void;
}

export const AddLibraryCard: React.FC<AddLibraryCardProps> = ({ onClick }) => {
  return (
    <div
      onClick={onClick}
      className="card cursor-pointer hover:border-primary-500 transition-all duration-200 border-dashed flex items-center justify-center min-h-[200px]"
    >
      <div className="text-center">
        <FontAwesomeIcon icon={faPlus} className="text-primary-500 text-4xl mb-3" />
        <p className="text-neutral-300 font-medium">Add Library</p>
        <p className="text-neutral-500 text-sm mt-1">Configure a new media library</p>
      </div>
    </div>
  );
};
