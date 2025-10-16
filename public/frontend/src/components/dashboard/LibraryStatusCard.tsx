import React from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistance } from 'date-fns';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Progress } from '../ui/progress';
import { useLibraryScanProgress } from '../../hooks/useLibraryScanProgress';
import { useStartLibraryScan } from '../../hooks/useLibraryScans';

interface Library {
  id: number;
  name: string;
  type: string;
  path: string;
  stats?: {
    total: number;
    unidentified: number;
    identified: number;
    enriched: number;
    lastScan: string | null;
  };
}

interface LibraryStatusCardProps {
  library: Library;
}

export const LibraryStatusCard: React.FC<LibraryStatusCardProps> = ({ library }) => {
  const navigate = useNavigate();
  const { scanProgress, isScanning } = useLibraryScanProgress(library.id);
  const { mutate: startScan, isPending: isStartingScan } = useStartLibraryScan();

  const total = library.stats?.total || 0;
  const unidentified = library.stats?.unidentified || 0;
  const identified = library.stats?.identified || 0;
  const enriched = library.stats?.enriched || 0;

  const handleScan = () => {
    startScan(library.id);
  };

  const handleViewItems = () => {
    // Navigate to the appropriate page based on library type
    switch (library.type) {
      case 'movie':
        navigate('/metadata/movies');
        break;
      case 'tv':
        navigate('/metadata/series');
        break;
      case 'music':
        navigate('/metadata/music');
        break;
      default:
        navigate('/metadata/movies');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{library.name}</CardTitle>
        <CardDescription className="truncate" title={library.path}>
          {library.path}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="text-sm">
            <div className="font-semibold mb-2">Total: {total}</div>
            {total > 0 && (
              <div className="ml-4 text-muted-foreground space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-red-600">●</span>
                  <span>Unidentified: {unidentified}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-yellow-600">●</span>
                  <span>Identified: {identified}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-green-600">●</span>
                  <span>Enriched: {enriched}</span>
                </div>
              </div>
            )}
          </div>

          {isScanning && scanProgress && (
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">
                Scanning... {scanProgress.percentage}%
              </div>
              <Progress value={scanProgress.percentage} className="h-2" />
              {scanProgress.message && (
                <div className="text-xs text-muted-foreground">
                  {scanProgress.message}
                </div>
              )}
            </div>
          )}

          {!isScanning && library.stats?.lastScan && (
            <div className="text-xs text-muted-foreground">
              Last scan:{' '}
              {formatDistance(new Date(library.stats.lastScan), new Date(), {
                addSuffix: true,
              })}
            </div>
          )}

          {!isScanning && !library.stats?.lastScan && (
            <div className="text-xs text-muted-foreground">Never scanned</div>
          )}
        </div>
      </CardContent>
      <CardFooter className="gap-2">
        <Button
          size="sm"
          onClick={handleScan}
          disabled={isScanning || isStartingScan}
        >
          {isScanning ? 'Scanning...' : 'Scan'}
        </Button>
        <Button size="sm" variant="outline" onClick={handleViewItems}>
          View {library.type === 'movie' ? 'Movies' : library.type === 'tv' ? 'Series' : 'Music'}
        </Button>
      </CardFooter>
    </Card>
  );
};
