import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faServer, faCheck, faTimes } from '@fortawesome/free-solid-svg-icons';
import { MediaPlayer } from '../../types/mediaPlayer';
import { ConnectionStatusIndicator } from './ConnectionStatusIndicator';

interface MediaPlayerCardProps {
  player: MediaPlayer;
  onClick: () => void;
}

export const MediaPlayerCard: React.FC<MediaPlayerCardProps> = ({ player, onClick }) => {
  return (
    <div
      onClick={onClick}
      className="card cursor-pointer hover:border-primary-500 transition-all duration-200 relative"
    >
      <ConnectionStatusIndicator
        status={player.connectionStatus}
        lastConnected={player.lastConnected}
        lastError={player.lastError}
      />

      <div className="card-body">
        <div className="flex items-start mb-3">
          <FontAwesomeIcon icon={faServer} className="text-primary-500 text-2xl mr-3 mt-1" />
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-white mb-1">{player.name}</h3>
            <p className="text-sm text-neutral-400">
              {player.type.charAt(0).toUpperCase() + player.type.slice(1)}
            </p>
          </div>
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-neutral-400">Host:</span>
            <span className="text-white">{player.host}:{player.port}</span>
          </div>

          {player.libraryGroup && (
            <div className="flex justify-between">
              <span className="text-neutral-400">Group:</span>
              <span className="text-primary-300">{player.libraryGroup}</span>
            </div>
          )}

          {player.jsonRpcVersion && (
            <div className="flex justify-between">
              <span className="text-neutral-400">API Version:</span>
              <span className="text-neutral-300">{player.jsonRpcVersion}</span>
            </div>
          )}

          <div className="flex justify-between items-center pt-2 border-t border-neutral-700">
            <span className="text-neutral-400">Status:</span>
            <span className="flex items-center">
              {player.enabled ? (
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
        </div>
      </div>
    </div>
  );
};