import React, { useState, useEffect } from 'react';
import { MediaPlayer, MediaPlayerFormData, MediaPlayerType } from '../../types/mediaPlayer';
import { mediaPlayerApi } from '../../utils/api';
import { AddMediaPlayerCard } from '../../components/mediaPlayer/AddMediaPlayerCard';
import { MediaPlayerCard } from '../../components/mediaPlayer/MediaPlayerCard';
import { MediaPlayerSelectionModal } from '../../components/mediaPlayer/MediaPlayerSelectionModal';
import { MediaPlayerConfigModal } from '../../components/mediaPlayer/MediaPlayerConfigModal';

export const MediaPlayers: React.FC = () => {
  const [players, setPlayers] = useState<MediaPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSelectionModal, setShowSelectionModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [selectedType, setSelectedType] = useState<MediaPlayerType | undefined>();
  const [selectedPlayer, setSelectedPlayer] = useState<MediaPlayer | undefined>();

  useEffect(() => {
    loadPlayers();
  }, []);

  const loadPlayers = async () => {
    try {
      setLoading(true);
      const data = await mediaPlayerApi.getAll();
      setPlayers(data);
    } catch (error) {
      console.error('Failed to load media players:', error);
    } finally {
      setLoading(false);
    }
  };

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
        await mediaPlayerApi.update(selectedPlayer.id, data);
      } else {
        await mediaPlayerApi.create(data);
      }
      await loadPlayers();
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
          {players.map((player) => (
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