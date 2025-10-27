import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircle, faPlay, faPause, faRotate } from '@fortawesome/free-solid-svg-icons';
import { PlayerActivityState } from '../../types/mediaPlayer';

interface ActivityDisplayProps {
  activity: PlayerActivityState['activity'];
  compact?: boolean;
}

export const ActivityDisplay: React.FC<ActivityDisplayProps> = ({ activity, compact = false }) => {
  const getActivityIcon = () => {
    switch (activity.type) {
      case 'playing':
        return <FontAwesomeIcon icon={faPlay} className="text-green-400" />;
      case 'paused':
        return <FontAwesomeIcon icon={faPause} className="text-yellow-400" />;
      case 'scanning':
        return <FontAwesomeIcon icon={faRotate} className="text-blue-400 animate-spin" />;
      case 'idle':
      default:
        return <FontAwesomeIcon icon={faCircle} className="text-neutral-600 text-[8px]" />;
    }
  };

  const formatTime = (seconds?: number): string => {
    if (seconds === undefined) return '--:--';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${minutes}:${String(secs).padStart(2, '0')}`;
  };

  const getActivityText = () => {
    switch (activity.type) {
      case 'playing':
      case 'paused':
        return activity.details || activity.type;
      case 'scanning':
        return `Scanning ${activity.details || 'Library'}`;
      case 'idle':
      default:
        return 'Idle';
    }
  };

  const hasProgress =
    activity.progress &&
    (activity.progress.percentage !== undefined || activity.progress.currentSeconds !== undefined);

  if (compact) {
    return (
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        {getActivityIcon()}
        <span className="text-xs text-neutral-400 truncate">{getActivityText()}</span>
        {hasProgress && activity.progress?.percentage !== undefined && (
          <div className="flex-shrink-0 w-16 h-1.5 bg-neutral-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-violet-500 transition-all duration-300"
              style={{ width: `${activity.progress.percentage}%` }}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 p-2 rounded bg-neutral-900/50">
      <div className="flex-shrink-0 mt-0.5">{getActivityIcon()}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-white">
          {activity.type.charAt(0).toUpperCase() + activity.type.slice(1)}
        </div>
        {activity.details && <div className="text-xs text-neutral-400 truncate">{activity.details}</div>}

        {/* Playback progress bar and time */}
        {hasProgress && (activity.type === 'playing' || activity.type === 'paused') && (
          <div className="mt-2 space-y-1">
            {activity.progress?.percentage !== undefined && (
              <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-violet-500 transition-all duration-300"
                  style={{ width: `${activity.progress.percentage}%` }}
                />
              </div>
            )}
            {activity.progress?.currentSeconds !== undefined && (
              <div className="flex justify-between text-[10px] text-neutral-500">
                <span>{formatTime(activity.progress.currentSeconds)}</span>
                <span>{formatTime(activity.progress.totalSeconds)}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
