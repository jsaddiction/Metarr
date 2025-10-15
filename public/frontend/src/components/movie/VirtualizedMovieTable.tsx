import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBolt } from '@fortawesome/free-solid-svg-icons';
import { Movie } from '../../types/movie';
import { MovieRow } from './MovieRow';

interface VirtualizedMovieTableProps {
  movies: Movie[];
  onMovieClick?: (movie: Movie) => void;
  onRefreshClick?: (movie: Movie) => void;
}

export const VirtualizedMovieTable: React.FC<VirtualizedMovieTableProps> = ({
  movies,
  onMovieClick,
  onRefreshClick
}) => {
  return (
    <div className="bg-neutral-800 rounded-lg border border-neutral-700 overflow-hidden">
      {/* Fixed Table Header */}
      <div className="bg-neutral-700 grid grid-cols-[40px_25%_auto_80px] py-3 px-4 border-b border-neutral-600">
        <div className="font-medium text-neutral-200 text-center" title="Monitored Status">
          {/* Bookmark icon header */}
        </div>
        <div className="font-medium text-neutral-200">Movie Title</div>
        <div className="font-medium text-neutral-200">Metadata</div>
        <div className="font-medium text-neutral-200 text-center">
          <FontAwesomeIcon icon={faBolt} title="Actions" />
        </div>
      </div>

      {/* Movie Rows */}
      <div className="max-h-[600px] overflow-y-auto">
        {movies.map((movie) => (
          <MovieRow
            key={movie.id}
            movie={movie}
            onClick={onMovieClick}
            onRefresh={onRefreshClick}
          />
        ))}
      </div>
    </div>
  );
};
