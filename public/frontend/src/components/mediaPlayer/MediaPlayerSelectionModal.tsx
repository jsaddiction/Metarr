import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes, faServer } from '@fortawesome/free-solid-svg-icons';
import { MediaPlayerType } from '../../types/mediaPlayer';

interface MediaPlayerSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (type: MediaPlayerType) => void;
}

export const MediaPlayerSelectionModal: React.FC<MediaPlayerSelectionModalProps> = ({
  isOpen,
  onClose,
  onSelect,
}) => {
  if (!isOpen) return null;

  const players = [
    { type: 'kodi' as MediaPlayerType, name: 'Kodi', enabled: true },
    { type: 'jellyfin' as MediaPlayerType, name: 'Jellyfin', enabled: false },
    { type: 'plex' as MediaPlayerType, name: 'Plex', enabled: false },
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="text-2xl font-semibold">Add Media Player</h2>
          <button onClick={onClose} className="modal-close-btn">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        <div className="modal-body">
          <div className="bg-primary-950 border border-primary-800 rounded-md p-4 mb-6">
            <p className="text-neutral-300">
              Metarr supports popular media players for library management and real-time synchronization.
              Select a media player type to configure its connection settings.
            </p>
          </div>

          <h3 className="text-lg font-semibold text-neutral-200 mb-4">Media Players</h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {players.map((player) => (
              <div
                key={player.type}
                onClick={() => player.enabled && onSelect(player.type)}
                className={`
                  card cursor-pointer transition-all duration-200
                  ${player.enabled
                    ? 'hover:border-primary-500'
                    : 'opacity-50 cursor-not-allowed'
                  }
                `}
              >
                <div className="card-body text-center py-8">
                  <FontAwesomeIcon
                    icon={faServer}
                    className={`text-4xl mb-3 ${player.enabled ? 'text-primary-500' : 'text-neutral-600'}`}
                  />
                  <h4 className="text-lg font-semibold text-white mb-1">{player.name}</h4>
                  {!player.enabled && (
                    <p className="text-xs text-neutral-500">Coming Soon</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="modal-footer">
          <button onClick={onClose} className="btn btn-secondary">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};