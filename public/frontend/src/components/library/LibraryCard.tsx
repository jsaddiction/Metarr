import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFilm, faTv, faMusic, faFolder, faRefresh } from '@fortawesome/free-solid-svg-icons';
import { Library } from '../../types/library';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

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
    <Card
      onClick={onClick}
      className="cursor-pointer hover:outline hover:outline-2 hover:outline-primary hover:border-primary hover:bg-primary/5 transition-all duration-200 relative"
    >
      <CardContent className="p-6">
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

          {/* Progress Bar (always rendered to prevent layout shift) */}
          <div className={`pt-2 transition-opacity duration-200 ${isScanning && scanProgress ? 'opacity-100' : 'opacity-0 invisible'}`}>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-primary-400">Scanning...</span>
              <span className="text-neutral-400">
                {scanProgress ? `${scanProgress.current} / ${scanProgress.total}` : '0 / 0'}
              </span>
            </div>
            <div className="w-full bg-neutral-700 rounded-full h-2 overflow-hidden">
              <div
                className="bg-primary-500 h-full transition-all duration-300 rounded-full"
                style={{ width: `${getProgressPercentage()}%` }}
              ></div>
            </div>
            <p className="text-xs text-neutral-500 mt-1 truncate">
              {scanProgress?.currentFile || '\u00A0'}
            </p>
          </div>

          {/* Scan Button */}
          <Button
            onClick={onScan}
            disabled={isScanning}
            variant="outline"
            className="w-full mt-2"
          >
            <FontAwesomeIcon icon={faRefresh} className={`mr-2 ${isScanning ? 'animate-spin' : ''}`} />
            {isScanning ? 'Scanning...' : 'Scan Library'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
