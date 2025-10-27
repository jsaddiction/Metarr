import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MediaPlayerFormData } from '../../types/mediaPlayer';

interface AddGroupMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: MediaPlayerFormData) => Promise<void>;
  groupName: string;
}

export const AddGroupMemberModal: React.FC<AddGroupMemberModalProps> = ({
  isOpen,
  onClose,
  onSave,
  groupName,
}) => {
  const [formData, setFormData] = useState({
    name: '',
    host: '',
    username: '',
    password: '',
  });
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const playerData: MediaPlayerFormData = {
        name: formData.name,
        type: 'kodi',
        host: formData.host,
        httpPort: 8080,
        username: formData.username,
        password: formData.password,
        enabled: true,
        groupName: groupName,
        isSharedMysql: true,
      };
      await onSave(playerData);
      handleClose();
    } catch (error) {
      console.error('Failed to add player to group:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    setFormData({ name: '', host: '', username: '', password: '' });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Player to "{groupName}"</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <Label htmlFor="name" className="text-sm text-neutral-300 mb-1 block">
              Player Name <span className="text-error">*</span>
            </Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Living Room"
              required
            />
          </div>

          <div>
            <Label htmlFor="host" className="text-sm text-neutral-300 mb-1 block">
              Host <span className="text-error">*</span>
            </Label>
            <Input
              id="host"
              value={formData.host}
              onChange={(e) => setFormData({ ...formData, host: e.target.value })}
              placeholder="e.g., 192.168.0.14"
              required
            />
            <p className="text-xs text-neutral-500 mt-1">
              HTTP Port 8080 with WebSocket (9090) automatic fallback
            </p>
          </div>

          <div>
            <Label htmlFor="username" className="text-sm text-neutral-300 mb-1 block">
              Username (optional)
            </Label>
            <Input
              id="username"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
            />
          </div>

          <div>
            <Label htmlFor="password" className="text-sm text-neutral-300 mb-1 block">
              Password (optional)
            </Label>
            <Input
              id="password"
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleClose} variant="outline">
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || !formData.name || !formData.host}
          >
            {isSaving ? 'Adding...' : 'Add Player'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
