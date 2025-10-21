import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faRefresh,
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
import { MovieListItem } from '../../types/movie';
import { AssetIndicator } from './AssetIndicator';
import { BookmarkToggle } from '../ui/BookmarkToggle';
import { useToggleMonitored } from '../../hooks/useToggleMonitored';
import { EnrichmentStatusBadge } from './EnrichmentStatusBadge';

interface MovieRowProps {
  movie: MovieListItem;
  onClick?: (movie: MovieListItem) => void;
  onRefresh?: (movie: MovieListItem) => void;
}

export const MovieRow = React.memo<MovieRowProps>(({ movie, onClick, onRefresh }) => {
  const toggleMonitored = useToggleMonitored();

  const handleClick = () => {
    onClick?.(movie);
  };

  const handleRefreshClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRefresh?.(movie);
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
        <button
          className="btn btn-ghost p-2"
          title="Refresh Metadata"
          onClick={handleRefreshClick}
        >
          <FontAwesomeIcon icon={faRefresh} />
        </button>
      </td>
    </tr>
  );
});

MovieRow.displayName = 'MovieRow';
