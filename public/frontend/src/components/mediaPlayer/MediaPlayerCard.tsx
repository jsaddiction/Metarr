import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faServer } from '@fortawesome/free-solid-svg-icons';
import { MediaPlayer } from '../../types/mediaPlayer';
import { Card, CardContent } from '@/components/ui/card';

interface MediaPlayerCardProps {
  player: MediaPlayer;
  onClick: () => void;
}

export const MediaPlayerCard: React.FC<MediaPlayerCardProps> = ({ player, onClick }) => {
  return (
    <Card
      onClick={onClick}
      className="cursor-pointer hover:outline hover:outline-2 hover:outline-primary hover:border-primary hover:bg-primary/5 transition-all duration-200"
    >
      <CardContent className="p-6">
        {/* Header */}
        <div className="flex items-start mb-3">
          <FontAwesomeIcon
            icon={faServer}
            className="text-primary-500 text-2xl mr-3 mt-1 flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-white mb-1 truncate">{player.name}</h3>
            <p className="text-sm text-neutral-400">
              {player.type.charAt(0).toUpperCase() + player.type.slice(1)}
            </p>
          </div>
        </div>

        {/* Player Details */}
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-neutral-400">Host:</span>
            <span className="text-white">{player.host}:{player.httpPort}</span>
          </div>

          {player.jsonRpcVersion && (
            <div className="flex justify-between">
              <span className="text-neutral-400">API Version:</span>
              <span className="text-neutral-300">{player.jsonRpcVersion}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};