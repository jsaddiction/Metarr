import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFilm, faTv, faMusic, faCheck, faTimes, faFolder, faRefresh } from '@fortawesome/free-solid-svg-icons';
import { Library } from '../../types/library';

interface LibraryCardProps {
  library: Library;
  onClick: () => void;
  onScan: (e: React.MouseEvent) => void;
  scanProgress?: {
    current: number;
    total: number;
    currentFile?: string;
  };
  isScanning?: boolean;
}

export const LibraryCard: React.FC<LibraryCardProps> = ({
  library,
  onClick,
  onScan,
  scanProgress,
  isScanning,
}) => {
  const getTypeIcon = () => {
    switch (library.type) {
      case 'movies':
        return faFilm;
      case 'tvshows':
        return faTv;
      case 'music':
        return faMusic;
      default:
        return faFolder;
    }
  };

  const getTypeLabel = () => {
    switch (library.type) {
      case 'movies':
        return 'Movies';
      case 'tvshows':
        return 'TV Shows';
      case 'music':
        return 'Music';
      default:
        return library.type;
    }
  };

  const getProgressPercentage = () => {
    if (!scanProgress || scanProgress.total === 0) return 0;
    return Math.round((scanProgress.current / scanProgress.total) * 100);
  };

  return (
    <div
      onClick={onClick}
      className="card cursor-pointer hover:border-primary-500 transition-all duration-200 relative"
    >
      <div className="card-body">
        <div className="flex items-start mb-3">
          <FontAwesomeIcon icon={getTypeIcon()} className="text-primary-500 text-2xl mr-3 mt-1" />
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-white mb-1">{library.name}</h3>
            <p className="text-sm text-neutral-400">{getTypeLabel()}</p>
          </div>
        </div>

        <div className="space-y-2 text-sm">
          <div>
            <span className="text-neutral-400 block mb-1">Path:</span>
            <span className="text-white font-mono text-xs break-all">{library.path}</span>
          </div>

          {/* Progress Bar (only shown when scanning) */}
          {isScanning && scanProgress && (
            <div className="pt-2">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-primary-400">Scanning...</span>
                <span className="text-neutral-400">
                  {scanProgress.current} / {scanProgress.total}
                </span>
              </div>
              <div className="w-full bg-neutral-700 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-primary-500 h-full transition-all duration-300 rounded-full"
                  style={{ width: `${getProgressPercentage()}%` }}
                ></div>
              </div>
              {scanProgress.currentFile && (
                <p className="text-xs text-neutral-500 mt-1 truncate">
                  {scanProgress.currentFile}
                </p>
              )}
            </div>
          )}

          <div className="flex justify-between items-center pt-2 border-t border-neutral-700">
            <span className="text-neutral-400">Status:</span>
            <span className="flex items-center">
              {library.enabled ? (
                <>
                  <FontAwesomeIcon icon={faCheck} className="text-success mr-1" />
                  <span className="text-success">Enabled</span>
                </>
              ) : (
                <>
                  <FontAwesomeIcon icon={faTimes} className="text-neutral-500 mr-1" />
                  <span className="text-neutral-500">Disabled</span>
                </>
              )}
            </span>
          </div>

          {/* Scan Button */}
          <button
            onClick={onScan}
            disabled={isScanning || !library.enabled}
            className="btn btn-secondary w-full mt-2"
          >
            <FontAwesomeIcon icon={faRefresh} className={`mr-2 ${isScanning ? 'animate-spin' : ''}`} />
            {isScanning ? 'Scanning...' : 'Scan Library'}
          </button>
        </div>
      </div>
    </div>
  );
};
