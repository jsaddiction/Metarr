import React, { useState } from 'react';
import { MediaPlayer, MediaPlayerFormData } from '../../types/mediaPlayer';
import { AddMediaPlayerCard } from '../../components/mediaPlayer/AddMediaPlayerCard';
import { MediaPlayerGroupCard } from '../../components/mediaPlayer/MediaPlayerGroupCard';
import { MediaPlayerWizard } from '../../components/mediaPlayer/MediaPlayerWizard';
import { AddGroupMemberModal } from '../../components/mediaPlayer/AddGroupMemberModal';
import { MediaPlayerConfigModal } from '../../components/mediaPlayer/MediaPlayerConfigModal';
import { useMediaPlayerGroupsWithMembers } from '../../hooks/useMediaPlayerGroupsWithMembers';
import { useCreatePlayer, useUpdatePlayer, useDeletePlayer } from '../../hooks/usePlayers';

export const MediaPlayers: React.FC = () => {
  // Use TanStack Query hooks for data fetching
  const { data: groups = [], isLoading: loading } = useMediaPlayerGroupsWithMembers();

  // Mutations
  const createPlayer = useCreatePlayer();
  const updatePlayer = useUpdatePlayer();
  const deletePlayer = useDeletePlayer();

  const [showWizard, setShowWizard] = useState(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showGroupSettingsModal, setShowGroupSettingsModal] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<MediaPlayer | undefined>();
  const [selectedGroupId, setSelectedGroupId] = useState<number | undefined>();
  const [selectedGroupName, setSelectedGroupName] = useState<string | undefined>();

  const handleAddClick = () => {
    setShowWizard(true);
  };

  const handlePlayerClick = (playerId: number) => {
    // Find player across all groups
    const player = groups
      .flatMap((g) => g.members)
      .find((p) => p.id === playerId);

    if (player) {
      setSelectedPlayer(player);
      setShowEditModal(true);
    }
  };

  const handleAddPlayerToGroup = (groupId: number, groupName: string) => {
    // Quick action: Open simplified add member modal
    setSelectedGroupName(groupName);
    setShowAddMemberModal(true);
  };

  const handleWizardComplete = async (players: MediaPlayerFormData[]) => {
    // Create all players from wizard (could be multiple for groups)
    // Don't throw - log errors and continue to allow wizard to close
    for (const playerData of players) {
      try {
        await createPlayer.mutateAsync(playerData);
      } catch (error) {
        console.error('Failed to create player:', playerData.name, error);
        // Continue creating other players even if one fails
      }
    }
  };

  const handleEditSave = async (data: MediaPlayerFormData) => {
    try {
      if (selectedPlayer) {
        await updatePlayer.mutateAsync({ id: selectedPlayer.id, updates: data });
      }
      handleCloseEditModal();
    } catch (error) {
      console.error('Failed to update media player:', error);
      throw error;
    }
  };

  const handleCloseEditModal = () => {
    setShowEditModal(false);
    setSelectedPlayer(undefined);
  };

  const handleAddMemberSave = async (data: MediaPlayerFormData) => {
    await createPlayer.mutateAsync(data);
    setShowAddMemberModal(false);
    setSelectedGroupName(undefined);
  };

  const handleGroupSettingsClick = (groupId: number) => {
    setSelectedGroupId(groupId);
    setShowGroupSettingsModal(true);
  };

  const handleCloseGroupSettingsModal = () => {
    setShowGroupSettingsModal(false);
    setSelectedGroupId(undefined);
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AddMediaPlayerCard onClick={handleAddClick} />
          {groups.map((group) => (
            <MediaPlayerGroupCard
              key={group.id}
              group={group}
              onPlayerClick={handlePlayerClick}
              onGroupSettingsClick={handleGroupSettingsClick}
              onAddPlayerToGroup={handleAddPlayerToGroup}
            />
          ))}
        </div>
      )}

      <MediaPlayerWizard
        isOpen={showWizard}
        onClose={() => setShowWizard(false)}
        onComplete={handleWizardComplete}
      />

      <AddGroupMemberModal
        isOpen={showAddMemberModal}
        onClose={() => {
          setShowAddMemberModal(false);
          setSelectedGroupName(undefined);
        }}
        onSave={handleAddMemberSave}
        groupName={selectedGroupName || ''}
      />

      <MediaPlayerConfigModal
        isOpen={showEditModal}
        onClose={handleCloseEditModal}
        onSave={handleEditSave}
        onDelete={async (id) => {
          await deletePlayer.mutateAsync(id);
        }}
        player={selectedPlayer}
      />

      {/* TODO: Implement GroupSettingsModal for path mappings */}
      {showGroupSettingsModal && selectedGroupId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-neutral-900 p-6 rounded-lg border border-neutral-700 max-w-2xl w-full">
            <h2 className="text-xl font-semibold text-white mb-4">Group Settings (Coming Soon)</h2>
            <p className="text-neutral-400 mb-4">
              This modal will allow you to configure path mappings for group ID: {selectedGroupId}
            </p>
            <button
              onClick={handleCloseGroupSettingsModal}
              className="px-4 py-2 bg-primary rounded hover:bg-primary/80"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};