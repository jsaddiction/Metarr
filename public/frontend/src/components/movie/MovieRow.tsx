import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faFile,
  faImage,
  faImages,
  faSquare,
  faFlag,
  faCircle,
  faCompactDisc,
  faPlay,
  faClosedCaptioning,
  faMusic,
  faUserGroup,
} from '@fortawesome/free-solid-svg-icons';
import { Search, CheckCircle, Sparkles, Upload, MoreVertical } from 'lucide-react';
import { MovieListItem } from '../../types/movie';
import { AssetIndicator } from './AssetIndicator';
import { BookmarkToggle } from '../ui/BookmarkToggle';
import { useToggleMonitored } from '../../hooks/useMovies';
import { EnrichmentStatusBadge } from './EnrichmentStatusBadge';
import { useTriggerJob } from '../../hooks/useJobs';
import { useNavigate } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface MovieRowProps {
  movie: MovieListItem;
  onClick?: (movie: MovieListItem) => void;
  onRefresh?: (movie: MovieListItem) => void;
}

export const MovieRow = React.memo<MovieRowProps>(({ movie, onClick, onRefresh }) => {
  const toggleMonitored = useToggleMonitored();
  const triggerJob = useTriggerJob();
  const navigate = useNavigate();

  const handleClick = () => {
    onClick?.(movie);
  };

  const handleToggleMonitored = (newMonitoredStatus: boolean) => {
    toggleMonitored.mutate(movie.id);
  };

  return (
    <tr
      className="border-b border-neutral-700 transition-colors hover:bg-primary-500/10 cursor-pointer"
      onClick={handleClick}
    >
      {/* Monitored/Bookmark Column */}
      <td className="p-2 align-middle text-center">
        <BookmarkToggle
          monitored={movie.monitored}
          onToggle={handleToggleMonitored}
          loading={toggleMonitored.isPending}
          size="sm"
        />
      </td>

      {/* Title Column */}
      <td className="p-2 align-middle">
        <div className="flex flex-col">
          <span className="font-medium">{movie.title}</span>
          {movie.year && (
            <span className="text-sm text-neutral-500">({movie.year})</span>
          )}
        </div>
      </td>

      {/* Status Column */}
      <td className="p-2 align-middle">
        <EnrichmentStatusBadge
          status={movie.identification_status || 'unidentified'}
          size="sm"
        />
      </td>

      {/* Metadata Column */}
      <td className="p-2 align-middle">
        <div className="flex items-center space-x-3">
          {/* NFO Indicator */}
          <AssetIndicator
            icon={faFile}
            status={movie.assetStatuses.nfo}
            tooltip="NFO File"
          />

          {/* Image Indicators */}
          <AssetIndicator
            icon={faImage}
            status={movie.assetStatuses.poster}
            count={movie.assetCounts.poster}
            tooltip="Poster"
            showCount={true}
          />
          <AssetIndicator
            icon={faImages}
            status={movie.assetStatuses.fanart}
            count={movie.assetCounts.fanart}
            tooltip="Fanart Backgrounds"
            showCount={true}
          />
          <AssetIndicator
            icon={faImages}
            status={movie.assetStatuses.landscape}
            count={movie.assetCounts.landscape}
            tooltip="Landscape"
          />
          <AssetIndicator
            icon={faSquare}
            status={movie.assetStatuses.keyart}
            count={movie.assetCounts.keyart}
            tooltip="Key Art"
            showCount={true}
          />
          <AssetIndicator
            icon={faFlag}
            status={movie.assetStatuses.banner}
            count={movie.assetCounts.banner}
            tooltip="Banner"
          />
          <AssetIndicator
            icon={faCircle}
            status={movie.assetStatuses.clearart}
            count={movie.assetCounts.clearart}
            tooltip="Clear Art"
          />
          <AssetIndicator
            icon={faCircle}
            status={movie.assetStatuses.clearlogo}
            count={movie.assetCounts.clearlogo}
            tooltip="Clear Logo"
          />
          <AssetIndicator
            icon={faCompactDisc}
            status={movie.assetStatuses.discart}
            count={movie.assetCounts.discart}
            tooltip="Disc Art"
          />

          {/* Media Asset Indicators */}
          <AssetIndicator
            icon={faPlay}
            status={movie.assetStatuses.trailer}
            count={movie.assetCounts.trailer}
            tooltip="Trailers"
            showCount={true}
          />
          <AssetIndicator
            icon={faClosedCaptioning}
            status={movie.assetStatuses.subtitle}
            count={movie.assetCounts.subtitle}
            tooltip="Subtitles"
            showCount={true}
          />
          <AssetIndicator
            icon={faMusic}
            status={movie.assetStatuses.theme}
            count={movie.assetCounts.theme}
            tooltip="Theme Songs"
          />
          <AssetIndicator
            icon={faUserGroup}
            status={movie.assetCounts.actor > 0 ? 'complete' : 'none'}
            count={movie.assetCounts.actor}
            tooltip="Actors"
            showCount={true}
          />
        </div>
      </td>

      {/* Actions Column */}
      <td className="p-2 align-middle text-center">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="btn btn-ghost p-2"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreVertical className="w-4 h-4" />
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-48">
            {/* Show Identify only for unidentified movies */}
            {movie.identification_status === 'unidentified' && (
              <>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/media/movies/${movie.id}/edit`);
                  }}
                >
                  <Search className="w-4 h-4" />
                  <span>Identify</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}

            {/* Verify - always available */}
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                triggerJob.mutate({ movieId: movie.id, jobType: 'verify' });
              }}
            >
              <CheckCircle className="w-4 h-4" />
              <span>Verify</span>
            </DropdownMenuItem>

            {/* Enrich - only if identified */}
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                triggerJob.mutate({ movieId: movie.id, jobType: 'enrich' });
              }}
              disabled={movie.identification_status === 'unidentified'}
            >
              <Sparkles className="w-4 h-4" />
              <span>Enrich</span>
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            {/* Publish - only if enriched */}
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                triggerJob.mutate({ movieId: movie.id, jobType: 'publish' });
              }}
              disabled={movie.identification_status !== 'enriched'}
            >
              <Upload className="w-4 h-4" />
              <span>Publish</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
});

MovieRow.displayName = 'MovieRow';
