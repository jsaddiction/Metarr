import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes, faCheck, faX, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { MediaPlayer, MediaPlayerFormData, MediaPlayerType, TestConnectionStatus } from '../../types/mediaPlayer';
import { mediaPlayerApi } from '../../utils/api';
import { useMediaPlayerGroups } from '../../hooks/useMediaPlayerGroups';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useConfirm } from '../../hooks/useConfirm';

interface MediaPlayerConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: MediaPlayerFormData) => Promise<void>;
  onDelete?: (id: number) => Promise<void>;
  player?: MediaPlayer;
  type?: MediaPlayerType;
  preSelectedGroupName?: string; // Pre-fill group name for quick-add to group
}

export const MediaPlayerConfigModal: React.FC<MediaPlayerConfigModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onDelete,
  player,
  type,
  preSelectedGroupName,
}) => {
  // Accessible confirmation dialog
  const { confirm, ConfirmDialog } = useConfirm();

  const [formData, setFormData] = useState<MediaPlayerFormData>({
    name: '',
    type: type || 'kodi',
    host: '',
    httpPort: 8080,
    username: '',
    password: '',
    enabled: true,
    libraryGroup: '',
    groupName: '',
    isSharedMysql: false,
  });

  const [testStatus, setTestStatus] = useState<TestConnectionStatus>('idle');
  const [testMessage, setTestMessage] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  // Fetch existing groups
  const { data: groups = [] } = useMediaPlayerGroups();

  // Filter groups for Kodi players only (type === 'kodi')
  const kodiGroups = groups.filter(g => g.type === 'kodi');

  useEffect(() => {
    if (player) {
      setFormData({
        name: player.name,
        type: player.type,
        host: player.host,
        httpPort: player.httpPort,
        username: player.username || '',
        password: player.password || '',
        enabled: player.enabled,
        libraryGroup: player.libraryGroup || '',
        groupName: '', // Will be populated from API when we fetch groups
        isSharedMysql: false,
      });
    } else if (type) {
      // Quick-add to group: pre-fill group name and enable shared MySQL
      if (preSelectedGroupName) {
        setFormData((prev) => ({
          ...prev,
          type,
          groupName: preSelectedGroupName,
          isSharedMysql: true,
        }));
      } else {
        setFormData((prev) => ({ ...prev, type }));
      }
    }
  }, [player, type, preSelectedGroupName]);

  if (!isOpen) return null;

  const handleChange = (field: keyof MediaPlayerFormData, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleTest = async () => {
    setTestStatus('testing');
    setTestMessage('');

    try {
      const result = await mediaPlayerApi.testConnectionUnsaved({
        ...formData,
        httpPort: parseInt(formData.httpPort.toString()),
      });

      if (result.success) {
        setTestStatus('success');
        setTestMessage(result.version ? `JSON-RPC ${result.version} detected` : 'Connection successful');

        // Auto-reset after 2 seconds
        setTimeout(() => {
          setTestStatus('idle');
          setTestMessage('');
        }, 2000);
      } else {
        setTestStatus('error');
        setTestMessage(result.error || 'Connection failed');

        // Auto-reset after 3 seconds
        setTimeout(() => {
          setTestStatus('idle');
          setTestMessage('');
        }, 3000);
      }
    } catch (error: any) {
      setTestStatus('error');
      setTestMessage(error.message || 'Connection failed');

      setTimeout(() => {
        setTestStatus('idle');
        setTestMessage('');
      }, 3000);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave({
        ...formData,
        httpPort: parseInt(formData.httpPort.toString()),
      });
      onClose();
    } catch (error) {
      console.error('Failed to save media player:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!player || !onDelete) return;

    const confirmed = await confirm({
      title: 'Delete Media Player',
      description: `Are you sure you want to delete ${player.name}? This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'destructive',
    });

    if (!confirmed) return;

    try {
      await onDelete(player.id);
      onClose();
    } catch (error) {
      console.error('Failed to delete media player:', error);
    }
  };

  const getTestButtonContent = () => {
    switch (testStatus) {
      case 'testing':
        return <FontAwesomeIcon icon={faSpinner} spin />;
      case 'success':
        return <FontAwesomeIcon icon={faCheck} className="text-success" />;
      case 'error':
        return <FontAwesomeIcon icon={faX} className="text-error" />;
      default:
        return 'Test';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {player ? `Edit ${player.name}` : `Add ${formData.type.charAt(0).toUpperCase() + formData.type.slice(1)}`}
          </DialogTitle>
          <DialogDescription>
            Configure connection settings for your media player
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto space-y-4 px-6 py-4">
          {/* Name */}
          <div>
            <Label htmlFor="player-name" className="block text-sm font-medium text-neutral-300 mb-1">
              Name <span className="text-error">*</span>
            </Label>
            <Input
              id="player-name"
              type="text"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="e.g., Living Room Kodi"
              required
            />
          </div>

          {/* Enabled */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="enabled"
              checked={formData.enabled}
              onCheckedChange={(checked) => handleChange('enabled', checked as boolean)}
            />
            <Label htmlFor="enabled" className="text-sm text-neutral-300 cursor-pointer">
              Enabled
            </Label>
          </div>

          {/* Host */}
          <div>
            <Label htmlFor="player-host" className="block text-sm font-medium text-neutral-300 mb-1">
              Host <span className="text-error">*</span>
            </Label>
            <Input
              id="player-host"
              type="text"
              value={formData.host}
              onChange={(e) => handleChange('host', e.target.value)}
              placeholder="e.g., 192.168.1.100 or kodi.local"
              required
            />
          </div>

          {/* HTTP Port */}
          <div>
            <Label htmlFor="player-httpPort" className="block text-sm font-medium text-neutral-300 mb-1">
              HTTP Port <span className="text-error">*</span>
            </Label>
            <Input
              id="player-httpPort"
              type="number"
              value={formData.httpPort}
              onChange={(e) => handleChange('httpPort', parseInt(e.target.value))}
              placeholder="8080"
              required
            />
            <p className="text-xs text-neutral-500 mt-1">
              Default: 8080. WebSocket (9090) will be tried first with automatic fallback.
            </p>
          </div>

          {/* Username */}
          <div>
            <Label htmlFor="player-username" className="block text-sm font-medium text-neutral-300 mb-1">
              Username
            </Label>
            <Input
              id="player-username"
              type="text"
              value={formData.username}
              onChange={(e) => handleChange('username', e.target.value)}
              placeholder="Optional"
            />
          </div>

          {/* Password */}
          <div>
            <Label htmlFor="player-password" className="block text-sm font-medium text-neutral-300 mb-1">
              Password
            </Label>
            <Input
              id="player-password"
              type="password"
              value={formData.password}
              onChange={(e) => handleChange('password', e.target.value)}
              placeholder="Optional"
            />
          </div>

          {/* Shared MySQL Backend (Kodi only) */}
          {formData.type === 'kodi' && (
            <div className="space-y-4 p-4 border border-neutral-700 rounded-lg bg-neutral-800/30">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="isSharedMysql"
                  checked={formData.isSharedMysql}
                  onCheckedChange={(checked) => handleChange('isSharedMysql', checked as boolean)}
                />
                <Label htmlFor="isSharedMysql" className="text-sm text-neutral-300 cursor-pointer font-medium">
                  Shared MySQL Backend
                </Label>
              </div>
              <p className="text-xs text-neutral-500 -mt-2">
                Enable if multiple Kodi instances share the same MySQL database. This allows them to be grouped together.
              </p>

              {/* Group Name Input (enabled only if shared MySQL is checked) */}
              <div>
                <Label
                  htmlFor="group-name"
                  className={`block text-sm font-medium mb-1 ${formData.isSharedMysql ? 'text-neutral-300' : 'text-neutral-600'}`}
                >
                  Group Name
                </Label>
                <Input
                  id="group-name"
                  type="text"
                  value={formData.groupName}
                  onChange={(e) => handleChange('groupName', e.target.value)}
                  placeholder={formData.isSharedMysql ? "Select existing or type new group name" : "Disabled (standalone player)"}
                  disabled={!formData.isSharedMysql}
                  className={!formData.isSharedMysql ? 'opacity-50 cursor-not-allowed' : ''}
                  list="group-names-datalist"
                />
                <datalist id="group-names-datalist">
                  {kodiGroups.map(group => (
                    <option key={group.id} value={group.name} />
                  ))}
                </datalist>
                <p className="text-xs text-neutral-500 mt-1">
                  {formData.isSharedMysql
                    ? kodiGroups.length > 0
                      ? 'Select an existing group or type a new name to create one. Players in the same group share library updates.'
                      : 'Type a new group name. Players in the same group share library updates.'
                    : 'This player will be created as a standalone instance with its own group.'
                  }
                </p>
              </div>
            </div>
          )}


          {/* Test Result Message */}
          {testMessage && (
            <Alert className={
              testStatus === 'success' ? 'bg-success/20 border-success text-success' :
              testStatus === 'error' ? 'bg-error/20 border-error text-error' :
              'bg-neutral-800 border-neutral-700 text-neutral-300'
            }>
              <AlertDescription className="text-sm">
                {testMessage}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className="gap-2">
          {/* Delete button (left side, only when editing) */}
          {player && onDelete && (
            <div className="mr-auto">
              <Button
                onClick={handleDelete}
                variant="outline"
                className="border-red-500 text-red-500 hover:bg-red-500 hover:text-white"
              >
                Delete
              </Button>
            </div>
          )}

          {/* Right side buttons */}
          <Button
            onClick={handleTest}
            disabled={testStatus === 'testing' || !formData.host || !formData.httpPort}
            variant="outline"
          >
            {getTestButtonContent()}
          </Button>
          <Button onClick={onClose} variant="outline">
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || !formData.name || !formData.host || !formData.httpPort}
          >
            {isSaving ? <FontAwesomeIcon icon={faSpinner} spin /> : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Accessible Confirmation Dialog */}
      <ConfirmDialog />
    </Dialog>
  );
};