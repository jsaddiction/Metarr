import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBolt } from '@fortawesome/free-solid-svg-icons';
import { MovieListItem } from '../../types/movie';
import { MovieRow } from './MovieRow';
import { EnrichmentStatusBadge } from './EnrichmentStatusBadge';

interface VirtualizedMovieTableProps {
  movies: MovieListItem[];
  onMovieClick?: (movie: MovieListItem) => void;
  onRefreshClick?: (movie: MovieListItem) => void;
}

export const VirtualizedMovieTable: React.FC<VirtualizedMovieTableProps> = ({
  movies,
  onMovieClick,
  onRefreshClick
}) => {
  return (
    <div className="rounded-lg border border-neutral-700 overflow-hidden">
      <div className="relative w-full overflow-auto">
        <table className="w-full caption-bottom text-sm">
          {/* Fixed Table Header */}
          <thead className="[&_tr]:border-b sticky top-0 bg-neutral-950 z-10">
            <tr className="border-b border-neutral-700 transition-colors">
              <th className="h-10 px-2 text-center align-middle font-medium text-muted-foreground w-[40px]" title="Monitored Status">
                {/* Bookmark icon header */}
              </th>
              <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground w-[25%]">
                Movie Title
              </th>
              <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground w-[140px]">
                Status
              </th>
              <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground">
                Metadata
              </th>
              <th className="h-10 px-2 text-center align-middle font-medium text-muted-foreground w-[80px]">
                <FontAwesomeIcon icon={faBolt} title="Actions" />
              </th>
            </tr>
          </thead>

          {/* Movie Rows */}
          <tbody className="[&_tr:last-child]:border-0">
            {movies.map((movie) => (
              <MovieRow
                key={movie.id}
                movie={movie}
                onClick={onMovieClick}
                onRefresh={onRefreshClick}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
