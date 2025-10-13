import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faServer } from '@fortawesome/free-solid-svg-icons';
import { MediaPlayerType } from '../../types/mediaPlayer';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

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
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Media Player</DialogTitle>
          <DialogDescription>
            Select a media player type to configure its connection settings
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-6 py-4">
          <h3 className="text-lg font-semibold text-neutral-200">Media Players</h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {players.map((player) => (
              <Card
                key={player.type}
                onClick={() => player.enabled && onSelect(player.type)}
                className={`
                  cursor-pointer transition-all duration-200
                  ${player.enabled
                    ? 'hover:outline hover:outline-2 hover:outline-primary hover:border-primary'
                    : 'opacity-50 cursor-not-allowed'
                  }
                `}
              >
                <CardContent className="text-center py-8">
                  <FontAwesomeIcon
                    icon={faServer}
                    className={`text-4xl mb-3 ${player.enabled ? 'text-primary-500' : 'text-neutral-600'}`}
                  />
                  <h4 className="text-lg font-semibold text-white mb-1">{player.name}</h4>
                  {!player.enabled && (
                    <p className="text-xs text-neutral-500">Coming Soon</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button onClick={onClose} variant="outline">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};