import React, { useState } from 'react';
import { MediaPlayer, MediaPlayerFormData, MediaPlayerType } from '../../types/mediaPlayer';
import { AddMediaPlayerCard } from '../../components/mediaPlayer/AddMediaPlayerCard';
import { MediaPlayerCard } from '../../components/mediaPlayer/MediaPlayerCard';
import { MediaPlayerSelectionModal } from '../../components/mediaPlayer/MediaPlayerSelectionModal';
import { MediaPlayerConfigModal } from '../../components/mediaPlayer/MediaPlayerConfigModal';
import { usePlayers, usePlayerStatus, useCreatePlayer, useUpdatePlayer, useDeletePlayer } from '../../hooks/usePlayers';

export const MediaPlayers: React.FC = () => {
  // Use TanStack Query hooks for data fetching
  const { data: players = [], isLoading: loading } = usePlayers();
  const { data: playerStatuses = [] } = usePlayerStatus();

  // Mutations
  const createPlayer = useCreatePlayer();
  const updatePlayer = useUpdatePlayer();
  const deletePlayer = useDeletePlayer();

  const [showSelectionModal, setShowSelectionModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [selectedType, setSelectedType] = useState<MediaPlayerType | undefined>();
  const [selectedPlayer, setSelectedPlayer] = useState<MediaPlayer | undefined>();

  // Merge player data with real-time status
  const playersWithStatus = players.map(player => {
    const status = playerStatuses.find(s => s.playerId === player.id);
    return {
      ...player,
      connectionStatus: status?.connectionStatus || 'disconnected',
      lastSeen: status?.lastSeen,
    };
  });

  const handleAddClick = () => {
    setShowSelectionModal(true);
  };

  const handleTypeSelect = (type: MediaPlayerType) => {
    setSelectedType(type);
    setShowSelectionModal(false);
    setShowConfigModal(true);
  };

  const handlePlayerClick = (player: MediaPlayer) => {
    setSelectedPlayer(player);
    setSelectedType(undefined);
    setShowConfigModal(true);
  };

  const handleSave = async (data: MediaPlayerFormData) => {
    try {
      if (selectedPlayer) {
        await updatePlayer.mutateAsync({ id: selectedPlayer.id, updates: data });
      } else {
        await createPlayer.mutateAsync(data);
      }
      handleCloseConfigModal();
    } catch (error) {
      console.error('Failed to save media player:', error);
      throw error;
    }
  };

  const handleCloseConfigModal = () => {
    setShowConfigModal(false);
    setSelectedPlayer(undefined);
    setSelectedType(undefined);
  };

  return (
    <div className="content-spacing">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Media Players</h1>
        <p className="text-neutral-400 mt-1">
          Configure connections to your media players for automatic library updates
        </p>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <p className="text-neutral-400">Loading media players...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AddMediaPlayerCard onClick={handleAddClick} />
          {playersWithStatus.map((player) => (
            <MediaPlayerCard
              key={player.id}
              player={player}
              onClick={() => handlePlayerClick(player)}
            />
          ))}
        </div>
      )}

      <MediaPlayerSelectionModal
        isOpen={showSelectionModal}
        onClose={() => setShowSelectionModal(false)}
        onSelect={handleTypeSelect}
      />

      <MediaPlayerConfigModal
        isOpen={showConfigModal}
        onClose={handleCloseConfigModal}
        onSave={handleSave}
        player={selectedPlayer}
        type={selectedType}
      />
    </div>
  );
};