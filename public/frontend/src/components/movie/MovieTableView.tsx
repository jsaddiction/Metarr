import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faRefresh,
  faFile,
  faImage,
  faPlay,
  faClosedCaptioning,
  faMusic,
  faImages,
  faFlag,
  faSquare,
  faCircle,
  faCompactDisc,
  faBolt
} from '@fortawesome/free-solid-svg-icons';

interface MovieMetadata {
  nfoProgress: number;
  images: {
    poster: number;
    fanart: number;
    landscape: number;
    keyart: number;
    banner: number;
    clearart: number;
    clearlogo: number;
    discart: number;
  };
  trailers: number;
  subtitles: number;
  tunes: number;
}

interface Movie {
  id: string;
  title: string;
  studio: string;
  qualityProfile: string;
  status: 'monitored' | 'unmonitored' | 'missing';
  year?: number;
  runtime?: number;
  imdbRating?: number;
  metadata?: MovieMetadata;
}

interface MovieTableViewProps {
  movies: Movie[];
  onMovieClick?: (movie: Movie) => void;
}

export const MovieTableView: React.FC<MovieTableViewProps> = ({
  movies,
  onMovieClick
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

  const getImageTypeDescription = (type: string) => {
    const descriptions = {
      poster: 'Movie Poster',
      fanart: 'Fanart Background',
      landscape: 'Landscape Image',
      keyart: 'Key Art',
      banner: 'Banner Image',
      clearart: 'Clear Art',
      clearlogo: 'Clear Logo',
      discart: 'Disc Art'
    };
    return descriptions[type as keyof typeof descriptions] || type;
  };

  const renderImageIcon = (type: string, count: number, icon: any) => {
    const hasAsset = count > 0;
    const canHaveMultiple = ['poster', 'fanart'].includes(type);
    const description = getImageTypeDescription(type);

    return (
      <div className="relative inline-flex items-center" title={description}>
        <FontAwesomeIcon
          icon={icon}
          className={`w-4 h-4 ${
            hasAsset ? 'text-success' : 'text-neutral-600'
          }`}
          aria-hidden="true"
        />
        {canHaveMultiple && count > 1 && (
          <span className="absolute -top-1 -right-1 bg-primary-500 text-white text-xs rounded-full px-1 min-w-[16px] h-4 flex items-center justify-center">
            {count}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="bg-neutral-800 rounded-lg border border-neutral-700 overflow-hidden">
      <table className="w-full">
        <thead className="bg-neutral-700">
          <tr>
            <th className="text-left py-3 px-4 font-medium text-neutral-200 w-1/4">Movie Title</th>
            <th className="text-left py-3 px-4 font-medium text-neutral-200 flex-1">Metadata</th>
            <th className="text-center py-3 px-4 font-medium text-neutral-200 w-20">
              <FontAwesomeIcon icon={faBolt} title="Actions" aria-label="Actions" />
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-700">
          {movies.map((movie) => (
            <tr
              key={movie.id}
              className="hover:bg-neutral-700 cursor-pointer transition-colors duration-200"
              onClick={() => onMovieClick?.(movie)}
            >
              <td className="py-4 px-4">
                <div className="flex flex-col">
                  <span className="text-white font-medium">{movie.title}</span>
                  {movie.year && (
                    <span className="text-neutral-400 text-sm">({movie.year})</span>
                  )}
                </div>
              </td>

              {/* Single Row Metadata Column */}
              <td className="py-4 px-4">
                {movie.metadata && (
                  <div className="flex items-center space-x-3">
                    {/* NFO Icon */}
                    <div className="relative inline-flex items-center" title="NFO File">
                      <FontAwesomeIcon
                        icon={faFile}
                        className={`w-4 h-4 ${
                          movie.metadata.nfoProgress > 70 ? 'text-success' : 'text-neutral-600'
                        }`}
                        aria-hidden="true"
                      />
                    </div>

                    {/* Image Icons */}
                    {renderImageIcon('poster', movie.metadata.images.poster, faImage)}
                    {renderImageIcon('fanart', movie.metadata.images.fanart, faImages)}
                    {renderImageIcon('landscape', movie.metadata.images.landscape, faImages)}
                    {renderImageIcon('keyart', movie.metadata.images.keyart, faSquare)}
                    {renderImageIcon('banner', movie.metadata.images.banner, faFlag)}
                    {renderImageIcon('clearart', movie.metadata.images.clearart, faCircle)}
                    {renderImageIcon('clearlogo', movie.metadata.images.clearlogo, faCircle)}
                    {renderImageIcon('discart', movie.metadata.images.discart, faCompactDisc)}

                    {/* Media Asset Icons */}
                    <div className="relative inline-flex items-center" title="Trailers">
                      <FontAwesomeIcon
                        icon={faPlay}
                        className={`w-4 h-4 ${
                          movie.metadata.trailers > 0 ? 'text-success' : 'text-neutral-600'
                        }`}
                        aria-hidden="true"
                      />
                      {movie.metadata.trailers > 1 && (
                        <span className="absolute -top-1 -right-1 bg-primary-500 text-white text-xs rounded-full px-1 min-w-[16px] h-4 flex items-center justify-center">
                          {movie.metadata.trailers}
                        </span>
                      )}
                    </div>
                    <div className="relative inline-flex items-center" title="Subtitles">
                      <FontAwesomeIcon
                        icon={faClosedCaptioning}
                        className={`w-4 h-4 ${
                          movie.metadata.subtitles > 0 ? 'text-success' : 'text-neutral-600'
                        }`}
                        aria-hidden="true"
                      />
                      {movie.metadata.subtitles > 1 && (
                        <span className="absolute -top-1 -right-1 bg-primary-500 text-white text-xs rounded-full px-1 min-w-[16px] h-4 flex items-center justify-center">
                          {movie.metadata.subtitles}
                        </span>
                      )}
                    </div>
                    <div className="relative inline-flex items-center" title="Theme Songs">
                      <FontAwesomeIcon
                        icon={faMusic}
                        className={`w-4 h-4 ${
                          movie.metadata.tunes > 0 ? 'text-success' : 'text-neutral-600'
                        }`}
                        aria-hidden="true"
                      />
                      {movie.metadata.tunes > 1 && (
                        <span className="absolute -top-1 -right-1 bg-primary-500 text-white text-xs rounded-full px-1 min-w-[16px] h-4 flex items-center justify-center">
                          {movie.metadata.tunes}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </td>

              <td className="py-4 px-4 text-center">
                <button
                  className="btn btn-ghost p-2"
                  title="Refresh Metadata"
                  aria-label="Refresh metadata"
                  onClick={(e) => {
                    e.stopPropagation();
                    console.log('Refreshing metadata for:', movie.title);
                    // TODO: Implement metadata refresh
                  }}
                >
                  <FontAwesomeIcon icon={faRefresh} aria-hidden="true" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};