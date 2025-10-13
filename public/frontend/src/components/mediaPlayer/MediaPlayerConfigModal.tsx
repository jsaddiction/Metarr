import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes, faCheck, faX, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { MediaPlayer, MediaPlayerFormData, MediaPlayerType, TestConnectionStatus } from '../../types/mediaPlayer';
import { mediaPlayerApi } from '../../utils/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface MediaPlayerConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: MediaPlayerFormData) => Promise<void>;
  player?: MediaPlayer;
  type?: MediaPlayerType;
}

export const MediaPlayerConfigModal: React.FC<MediaPlayerConfigModalProps> = ({
  isOpen,
  onClose,
  onSave,
  player,
  type,
}) => {
  const [formData, setFormData] = useState<MediaPlayerFormData>({
    name: '',
    type: type || 'kodi',
    host: '',
    port: 9090,
    username: '',
    password: '',
    enabled: true,
    libraryGroup: '',
    useWebsocket: true,
  });

  const [testStatus, setTestStatus] = useState<TestConnectionStatus>('idle');
  const [testMessage, setTestMessage] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (player) {
      setFormData({
        name: player.name,
        type: player.type,
        host: player.host,
        port: player.port,
        username: player.username || '',
        password: player.password || '',
        enabled: player.enabled,
        libraryGroup: player.libraryGroup || '',
        useWebsocket: player.useWebsocket,
      });
    } else if (type) {
      setFormData((prev) => ({ ...prev, type }));
    }
  }, [player, type]);

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
        port: parseInt(formData.port.toString()),
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
        port: parseInt(formData.port.toString()),
      });
      onClose();
    } catch (error) {
      console.error('Failed to save media player:', error);
    } finally {
      setIsSaving(false);
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

          {/* Port */}
          <div>
            <Label htmlFor="player-port" className="block text-sm font-medium text-neutral-300 mb-1">
              Port <span className="text-error">*</span>
            </Label>
            <Input
              id="player-port"
              type="number"
              value={formData.port}
              onChange={(e) => handleChange('port', parseInt(e.target.value))}
              placeholder="9090"
              required
            />
            <p className="text-xs text-neutral-500 mt-1">
              Default: 9090 for WebSocket, 8080 for HTTP
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

          {/* Library Group */}
          <div>
            <Label htmlFor="library-group" className="block text-sm font-medium text-neutral-300 mb-1">
              Library Group
            </Label>
            <Input
              id="library-group"
              type="text"
              value={formData.libraryGroup}
              onChange={(e) => handleChange('libraryGroup', e.target.value)}
              placeholder="e.g., Home"
            />
            <p className="text-xs text-neutral-500 mt-1">
              Group Kodi instances that share a library. Only one instance per group will perform library scans.
            </p>
          </div>

          {/* Use WebSocket */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="useWebsocket"
              checked={formData.useWebsocket}
              onCheckedChange={(checked) => handleChange('useWebsocket', checked as boolean)}
            />
            <Label htmlFor="useWebsocket" className="text-sm text-neutral-300 cursor-pointer">
              Use WebSocket Connection
            </Label>
          </div>
          <p className="text-xs text-neutral-500 -mt-2">
            WebSocket enables real-time state monitoring and notifications. HTTP fallback is available.
          </p>

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
          <Button
            onClick={handleTest}
            disabled={testStatus === 'testing' || !formData.host || !formData.port}
            variant="outline"
          >
            {getTestButtonContent()}
          </Button>
          <Button onClick={onClose} variant="outline">
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || !formData.name || !formData.host || !formData.port}
          >
            {isSaving ? <FontAwesomeIcon icon={faSpinner} spin /> : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};