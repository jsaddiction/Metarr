import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faExternalLinkAlt, faEdit, faTrash, faStar, faClock } from '@fortawesome/free-solid-svg-icons';

interface Movie {
  id: string;
  title: string;
  studio: string;
  qualityProfile: string;
  status: 'monitored' | 'unmonitored' | 'missing';
  year?: number;
  posterUrl?: string;
  description?: string;
  imdbRating?: number;
  runtime?: number;
}

interface MovieOverviewViewProps {
  movies: Movie[];
  onMovieClick?: (movie: Movie) => void;
  onEditClick?: (movie: Movie) => void;
  onDeleteClick?: (movie: Movie) => void;
}

export const MovieOverviewView: React.FC<MovieOverviewViewProps> = ({
  movies,
  onMovieClick,
  onEditClick,
  onDeleteClick
}) => {
  const getStatusClass = (status: string) => {
    switch (status) {
      case 'monitored':
        return 'text-success';
      case 'missing':
        return 'text-error';
      default:
        return 'text-neutral-400';
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

  const formatRuntime = (minutes?: number) => {
    if (!minutes) return '';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  return (
    <div className="space-y-4">
      {movies.map((movie) => (
        <div
          key={movie.id}
          className="bg-neutral-800 rounded-lg border border-neutral-700 p-6 hover:bg-neutral-700 cursor-pointer transition-colors duration-200"
          onClick={() => onMovieClick?.(movie)}
        >
          <div className="flex gap-6">
            <div className="flex-shrink-0">
              {movie.posterUrl ? (
                <img
                  src={movie.posterUrl}
                  alt={movie.title}
                  className="w-24 h-36 object-cover rounded-md"
                />
              ) : (
                <div className="w-24 h-36 bg-neutral-600 rounded-md flex items-center justify-center">
                  <span className="text-2xl font-bold text-white">
                    {movie.title.charAt(0)}
                  </span>
                </div>
              )}
            </div>

            <div className="flex-1">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-xl font-semibold text-white">
                  {movie.title}
                  {movie.year && (
                    <span className="text-neutral-400 font-normal"> ({movie.year})</span>
                  )}
                </h3>

                <div className="flex space-x-1">
                  <button
                    className="btn btn-ghost p-2"
                    title="View Details"
                    onClick={(e) => {
                      e.stopPropagation();
                      onMovieClick?.(movie);
                    }}
                  >
                    <FontAwesomeIcon icon={faExternalLinkAlt} />
                  </button>
                  <button
                    className="btn btn-ghost p-2"
                    title="Edit Movie"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditClick?.(movie);
                    }}
                  >
                    <FontAwesomeIcon icon={faEdit} />
                  </button>
                  <button
                    className="btn btn-ghost p-2 text-error hover:bg-red-500 hover:text-white"
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

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <span className="text-sm text-neutral-400">Studio:</span>
                  <span className="ml-2 text-white">{movie.studio}</span>
                </div>

                <div>
                  <span className="text-sm text-neutral-400">Quality:</span>
                  <span className="ml-2 text-white">{movie.qualityProfile}</span>
                </div>

                <div>
                  <span className="text-sm text-neutral-400">Status:</span>
                  <span className={`ml-2 font-medium ${getStatusClass(movie.status)}`}>
                    {getStatusText(movie.status)}
                  </span>
                </div>

                {movie.imdbRating && (
                  <div className="flex items-center">
                    <FontAwesomeIcon icon={faStar} className="text-yellow-500 mr-1" />
                    <span className="text-white">{movie.imdbRating}/10</span>
                  </div>
                )}

                {movie.runtime && (
                  <div className="flex items-center">
                    <FontAwesomeIcon icon={faClock} className="text-neutral-400 mr-1" />
                    <span className="text-white">{formatRuntime(movie.runtime)}</span>
                  </div>
                )}
              </div>

              {movie.description && (
                <div className="text-neutral-300 text-sm leading-relaxed">
                  <p>{movie.description}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};