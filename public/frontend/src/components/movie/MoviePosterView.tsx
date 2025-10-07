import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faExternalLinkAlt, faEdit, faTrash } from '@fortawesome/free-solid-svg-icons';

interface Movie {
  id: string;
  title: string;
  studio: string;
  qualityProfile: string;
  status: 'monitored' | 'unmonitored' | 'missing';
  year?: number;
  posterUrl?: string;
  imdbRating?: number;
}

interface MoviePosterViewProps {
  movies: Movie[];
  onMovieClick?: (movie: Movie) => void;
  onEditClick?: (movie: Movie) => void;
  onDeleteClick?: (movie: Movie) => void;
}

export const MoviePosterView: React.FC<MoviePosterViewProps> = ({
  movies,
  onMovieClick,
  onEditClick,
  onDeleteClick
}) => {
  const getStatusClass = (status: string) => {
    switch (status) {
      case 'monitored':
        return 'bg-success text-white';
      case 'missing':
        return 'bg-error text-white';
      default:
        return 'bg-neutral-600 text-neutral-300';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'monitored':
        return 'Monitored';
      case 'missing':
        return 'Missing';
      default:
        return 'Unmonitored';
    }
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {movies.map((movie) => (
        <div
          key={movie.id}
          className="group cursor-pointer"
          onClick={() => onMovieClick?.(movie)}
        >
          <div className="relative aspect-[2/3] overflow-hidden rounded-lg">
            {movie.posterUrl ? (
              <img
                src={movie.posterUrl}
                alt={movie.title}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            ) : (
              <div className="w-full h-full bg-neutral-600 flex items-center justify-center">
                <span className="text-4xl font-bold text-white">
                  {movie.title.charAt(0)}
                </span>
              </div>
            )}

            {/* Hover overlay */}
            <div className="absolute inset-0 bg-black/75 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
              <div className="flex space-x-2">
                <button
                  className="btn btn-secondary p-2"
                  title="View Details"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMovieClick?.(movie);
                  }}
                >
                  <FontAwesomeIcon icon={faExternalLinkAlt} />
                </button>
                <button
                  className="btn btn-secondary p-2"
                  title="Edit Movie"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditClick?.(movie);
                  }}
                >
                  <FontAwesomeIcon icon={faEdit} />
                </button>
                <button
                  className="btn btn-secondary p-2 text-error hover:bg-red-500 hover:text-white"
                  title="Delete Movie"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteClick?.(movie);
                  }}
                >
                  <FontAwesomeIcon icon={faTrash} />
                </button>
              </div>
            </div>

            {/* Status badge */}
            <div className={`absolute top-2 left-2 px-2 py-1 rounded text-xs font-medium ${getStatusClass(movie.status)}`}>
              {getStatusText(movie.status)}
            </div>
          </div>

          <div className="mt-2">
            <h3 className="font-medium text-white truncate">
              {movie.title}
              {movie.year && (
                <span className="text-neutral-400 font-normal"> ({movie.year})</span>
              )}
            </h3>
            <p className="text-sm text-neutral-400 truncate">{movie.qualityProfile}</p>
          </div>
        </div>
      ))}
    </div>
  );
};