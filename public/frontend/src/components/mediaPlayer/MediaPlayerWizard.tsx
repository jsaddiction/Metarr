import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faArrowRight, faCheck, faTrash } from '@fortawesome/free-solid-svg-icons';
import { MediaPlayerType, MediaPlayerFormData } from '../../types/mediaPlayer';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

interface MediaPlayerWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (players: MediaPlayerFormData[]) => Promise<void>;
}

type WizardStep = 'type' | 'kodi-mode' | 'group-name' | 'add-members' | 'single-config';

interface GroupMember {
  name: string;
  host: string;
  httpPort?: number;
  username?: string;
  password?: string;
}

export const MediaPlayerWizard: React.FC<MediaPlayerWizardProps> = ({
  isOpen,
  onClose,
  onComplete,
}) => {
  const [currentStep, setCurrentStep] = useState<WizardStep>('type');
  const [selectedType, setSelectedType] = useState<MediaPlayerType | null>(null);
  const [isSharedMysql, setIsSharedMysql] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [currentMember, setCurrentMember] = useState<GroupMember>({
    name: '',
    host: '',
    httpPort: 8080,
    username: '',
    password: '',
  });
  const [singlePlayerData, setSinglePlayerData] = useState<MediaPlayerFormData>({
    name: '',
    type: 'kodi',
    host: '',
    httpPort: 8080,
    username: '',
    password: '',
    enabled: true,
  });

  const handleTypeSelect = (type: MediaPlayerType) => {
    setSelectedType(type);
    if (type === 'kodi') {
      setCurrentStep('kodi-mode');
    } else {
      // Jellyfin/Plex go directly to single config
      setSinglePlayerData((prev) => ({ ...prev, type }));
      setCurrentStep('single-config');
    }
  };

  const handleKodiModeSelect = (shared: boolean) => {
    setIsSharedMysql(shared);
    if (shared) {
      setCurrentStep('group-name');
    } else {
      // Standalone Kodi
      setSinglePlayerData((prev) => ({ ...prev, type: 'kodi' }));
      setCurrentStep('single-config');
    }
  };

  const handleGroupNameNext = () => {
    if (groupName.trim()) {
      setCurrentStep('add-members');
    }
  };

  const handleAddMember = () => {
    if (currentMember.name && currentMember.host) {
      setGroupMembers([...groupMembers, { ...currentMember }]);
      // Clear form for next member
      setCurrentMember({ name: '', host: '', httpPort: 8080, username: '', password: '' });
    }
  };

  const handleRemoveMember = (index: number) => {
    setGroupMembers(groupMembers.filter((_, idx) => idx !== index));
  };

  const handleFinish = async () => {
    try {
      if (isSharedMysql && groupMembers.length > 0) {
        // Create multiple players in a shared MySQL group
        const players: MediaPlayerFormData[] = groupMembers.map((member) => ({
          name: member.name,
          type: 'kodi',
          host: member.host,
          httpPort: member.httpPort || 8080,
          username: member.username,
          password: member.password,
          enabled: true,
          groupName: groupName,
          isSharedMysql: true,
        }));
        await onComplete(players);
      } else {
        // Single player (standalone Kodi, Jellyfin, or Plex)
        await onComplete([singlePlayerData]);
      }
    } catch (error) {
      console.error('Error completing wizard:', error);
      // Continue to close wizard even if player creation failed
    } finally {
      handleClose();
    }
  };

  const handleClose = () => {
    // Reset wizard state
    setCurrentStep('type');
    setSelectedType(null);
    setIsSharedMysql(false);
    setGroupName('');
    setGroupMembers([]);
    setCurrentMember({ name: '', host: '', httpPort: 8080, username: '', password: '' });
    setSinglePlayerData({
      name: '',
      type: 'kodi',
      host: '',
      httpPort: 8080,
      username: '',
      password: '',
      enabled: true,
    });
    onClose();
  };

  const handleBack = () => {
    switch (currentStep) {
      case 'kodi-mode':
        setCurrentStep('type');
        break;
      case 'group-name':
        setCurrentStep('kodi-mode');
        break;
      case 'add-members':
        setCurrentStep('group-name');
        break;
      case 'single-config':
        if (selectedType === 'kodi') {
          setCurrentStep('kodi-mode');
        } else {
          setCurrentStep('type');
        }
        break;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {currentStep === 'type' && 'Add Media Player'}
            {currentStep === 'kodi-mode' && 'Kodi Configuration'}
            {currentStep === 'group-name' && 'Create Kodi Group'}
            {currentStep === 'add-members' && `Add Players to "${groupName}"`}
            {currentStep === 'single-config' && `Configure ${selectedType?.charAt(0).toUpperCase()}${selectedType?.slice(1)} Player`}
          </DialogTitle>
          <DialogDescription>
            {currentStep === 'type' && 'Select your media player type'}
            {currentStep === 'kodi-mode' && 'Choose your Kodi configuration mode'}
            {currentStep === 'group-name' && 'Name your group of shared MySQL Kodi instances'}
            {currentStep === 'add-members' && 'Add Kodi players to this group'}
            {currentStep === 'single-config' && 'Configure connection settings'}
          </DialogDescription>
        </DialogHeader>

        <div className="h-[400px] overflow-auto space-y-4 px-6 py-4">
          {/* Step 1: Type Selection */}
          {currentStep === 'type' && (
            <div className="flex flex-col items-center justify-center h-full w-full">
              <div className="grid grid-cols-3 gap-4 max-w-2xl">
                <button
                  onClick={() => handleTypeSelect('kodi')}
                  className="p-6 border-2 border-neutral-700 rounded-lg hover:border-primary hover:bg-primary/5 transition-all"
                >
                  <div className="text-4xl mb-2">🖥️</div>
                  <div className="text-sm font-medium text-white">Kodi</div>
                </button>
                <button
                  onClick={() => handleTypeSelect('jellyfin')}
                  className="p-6 border-2 border-neutral-700 rounded-lg hover:border-primary hover:bg-primary/5 transition-all"
                >
                  <div className="text-4xl mb-2">🎬</div>
                  <div className="text-sm font-medium text-white">Jellyfin</div>
                </button>
                <button
                  onClick={() => handleTypeSelect('plex')}
                  className="p-6 border-2 border-neutral-700 rounded-lg hover:border-primary hover:bg-primary/5 transition-all"
                >
                  <div className="text-4xl mb-2">📺</div>
                  <div className="text-sm font-medium text-white">Plex</div>
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Kodi Mode Selection */}
          {currentStep === 'kodi-mode' && (
            <div className="flex flex-col items-center justify-center h-full w-full">
              <div className="space-y-3 w-full max-w-lg">
                <button
                  onClick={() => handleKodiModeSelect(false)}
                  className="w-full p-4 border-2 border-neutral-700 rounded-lg hover:border-primary hover:bg-primary/5 transition-all text-left"
                >
                  <div className="font-medium text-white mb-1">Standalone Player</div>
                  <div className="text-xs text-neutral-400">Single Kodi instance with its own database</div>
                </button>
                <button
                  onClick={() => handleKodiModeSelect(true)}
                  className="w-full p-4 border-2 border-neutral-700 rounded-lg hover:border-violet-500 hover:bg-violet-500/5 transition-all text-left"
                >
                  <div className="font-medium text-white mb-1">Shared MySQL Group</div>
                  <div className="text-xs text-neutral-400">
                    Multiple Kodi instances sharing the same MySQL database
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Group Name */}
          {currentStep === 'group-name' && (
            <div className="flex flex-col items-center justify-center h-full w-full">
              <div className="w-full max-w-lg">
                <Label htmlFor="group-name" className="text-sm text-neutral-300 mb-2 block">
                  Group Name
                </Label>
                <Input
                  id="group-name"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="e.g., Home Theater"
                  className="mb-2"
                />
                <p className="text-xs text-neutral-500">
                  This name identifies the group of Kodi instances sharing a MySQL database.
                </p>
              </div>
            </div>
          )}

          {/* Step 4: Add Group Members */}
          {currentStep === 'add-members' && (
            <div className="flex flex-col h-full w-full">
              {/* Added Players Section */}
              <div className="px-6 py-3">
                <div className="flex flex-wrap gap-2">
                  {groupMembers.length === 0 ? (
                    // Skeleton placeholder
                    <div className="inline-flex items-start gap-1.5 px-2.5 py-1.5 bg-neutral-800/30 border border-neutral-700/50 border-dashed rounded text-xs min-w-[120px]">
                      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-2 rounded-full bg-neutral-700/50"></div>
                          <span className="text-neutral-600 text-xs">No players yet</span>
                        </div>
                        <span className="text-neutral-700 text-[10px] pl-3.5">Add players below</span>
                      </div>
                    </div>
                  ) : (
                    // Added player chips
                    groupMembers.map((member, idx) => (
                      <div
                        key={idx}
                        className="inline-flex items-start gap-1.5 px-2.5 py-1.5 bg-violet-500/10 border border-violet-500/30 rounded text-xs min-w-[120px]"
                      >
                        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                          <div className="flex items-center gap-1">
                            <FontAwesomeIcon icon={faCheck} className="text-violet-400 text-[10px] flex-shrink-0" />
                            <span className="text-white font-medium truncate">{member.name}</span>
                          </div>
                          <span className="text-neutral-500 text-[10px] pl-3.5 truncate">{member.host}</span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveMember(idx);
                          }}
                          className="text-neutral-500 hover:text-red-400 transition-colors flex-shrink-0 mt-0.5"
                          aria-label="Remove player"
                        >
                          <FontAwesomeIcon icon={faTrash} className="text-[10px]" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Divider */}
              <hr className="border-neutral-800" />

              {/* Form Section - Centered */}
              <div className="flex-1 flex items-center justify-center px-6">
                <div className="space-y-2.5 w-full max-w-lg">
                <div className="grid grid-cols-4 gap-2">
                  <div className="col-span-4">
                    <Label className="text-xs text-neutral-400 mb-1 block">Player Name</Label>
                    <Input
                      value={currentMember.name}
                      onChange={(e) => setCurrentMember({ ...currentMember, name: e.target.value })}
                      placeholder="Living Room"
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="col-span-3">
                    <Label className="text-xs text-neutral-400 mb-1 block">Host</Label>
                    <Input
                      value={currentMember.host}
                      onChange={(e) => setCurrentMember({ ...currentMember, host: e.target.value })}
                      placeholder="192.168.0.14"
                      className="h-9 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-neutral-400 mb-1 block">HTTP Port</Label>
                    <Input
                      type="number"
                      value={currentMember.httpPort || 8080}
                      onChange={(e) => setCurrentMember({ ...currentMember, httpPort: parseInt(e.target.value) || 8080 })}
                      placeholder="8080"
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs text-neutral-400 mb-1 block">Username (optional)</Label>
                    <Input
                      value={currentMember.username}
                      onChange={(e) => setCurrentMember({ ...currentMember, username: e.target.value })}
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs text-neutral-400 mb-1 block">Password (optional)</Label>
                    <Input
                      type="password"
                      value={currentMember.password}
                      onChange={(e) => setCurrentMember({ ...currentMember, password: e.target.value })}
                      className="h-9 text-sm"
                    />
                  </div>
                </div>
                <Button
                  onClick={handleAddMember}
                  disabled={!currentMember.name || !currentMember.host}
                  variant="outline"
                  size="sm"
                  className="w-full"
                >
                  + Add This Player
                </Button>
                </div>
              </div>
            </div>
          )}

          {/* Step 5: Single Player Config */}
          {currentStep === 'single-config' && (
            <div className="flex flex-col items-center justify-center h-full w-full">
              <div className="space-y-3 w-full max-w-lg">
                <div>
                  <Label className="text-sm text-neutral-300 mb-1 block">Name</Label>
                  <Input
                    value={singlePlayerData.name}
                    onChange={(e) => setSinglePlayerData({ ...singlePlayerData, name: e.target.value })}
                    placeholder="e.g., Kitchen"
                  />
                </div>
                <div>
                  <Label className="text-sm text-neutral-300 mb-1 block">Host</Label>
                  <Input
                    value={singlePlayerData.host}
                    onChange={(e) => setSinglePlayerData({ ...singlePlayerData, host: e.target.value })}
                    placeholder="e.g., 192.168.0.20"
                  />
                </div>
                <div>
                  <Label className="text-sm text-neutral-300 mb-1 block">HTTP Port</Label>
                  <Input
                    type="number"
                    value={singlePlayerData.httpPort}
                    onChange={(e) => setSinglePlayerData({ ...singlePlayerData, httpPort: parseInt(e.target.value) || 8080 })}
                    placeholder="8080"
                  />
                  <p className="text-xs text-neutral-500 mt-1">
                    Default: 8080. WebSocket (9090) will be tried first with automatic fallback.
                  </p>
                </div>
                <div>
                  <Label className="text-sm text-neutral-300 mb-1 block">Username (optional)</Label>
                  <Input
                    value={singlePlayerData.username}
                    onChange={(e) => setSinglePlayerData({ ...singlePlayerData, username: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-sm text-neutral-300 mb-1 block">Password (optional)</Label>
                  <Input
                    type="password"
                    value={singlePlayerData.password}
                    onChange={(e) => setSinglePlayerData({ ...singlePlayerData, password: e.target.value })}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={singlePlayerData.enabled}
                    onCheckedChange={(checked) =>
                      setSinglePlayerData({ ...singlePlayerData, enabled: checked as boolean })
                    }
                  />
                  <Label className="text-sm text-neutral-300 cursor-pointer">
                    Enabled
                  </Label>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <Button
            onClick={handleBack}
            variant="ghost"
            disabled={currentStep === 'type'}
            className="mr-auto"
          >
            <FontAwesomeIcon icon={faArrowLeft} className="mr-2" />
            Back
          </Button>

          <div className="flex gap-2">
            <Button onClick={handleClose} variant="outline">
              Cancel
            </Button>

            {currentStep === 'group-name' && (
              <Button onClick={handleGroupNameNext} disabled={!groupName.trim()}>
                Next
                <FontAwesomeIcon icon={faArrowRight} className="ml-2" />
              </Button>
            )}

            {currentStep === 'add-members' && (
              <Button onClick={handleFinish} disabled={groupMembers.length === 0}>
                Finish
              </Button>
            )}

            {currentStep === 'single-config' && (
              <Button
                onClick={handleFinish}
                disabled={!singlePlayerData.name || !singlePlayerData.host}
              >
                Create
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
