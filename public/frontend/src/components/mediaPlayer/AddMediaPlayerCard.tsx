import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus } from '@fortawesome/free-solid-svg-icons';

interface AddMediaPlayerCardProps {
  onClick: () => void;
}

export const AddMediaPlayerCard: React.FC<AddMediaPlayerCardProps> = ({ onClick }) => {
  return (
    <div
      onClick={onClick}
      className="card cursor-pointer hover:border-primary-500 transition-all duration-200 flex items-center justify-center min-h-[200px]"
    >
      <div className="text-center">
        <FontAwesomeIcon icon={faPlus} className="text-5xl text-neutral-500 mb-2" />
        <p className="text-neutral-400">Add Media Player</p>
      </div>
    </div>
  );
};