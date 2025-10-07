import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes, faCheck, faX, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { MediaPlayer, MediaPlayerFormData, MediaPlayerType, TestConnectionStatus } from '../../types/mediaPlayer';
import { mediaPlayerApi } from '../../utils/api';

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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="text-2xl font-semibold">
            {player ? `Edit ${player.name}` : `Add ${formData.type.charAt(0).toUpperCase() + formData.type.slice(1)}`}
          </h2>
          <button onClick={onClose} className="modal-close-btn">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        <div className="modal-body">
          <div className="space-y-4">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-1">
                Name <span className="text-error">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                className="input w-full"
                placeholder="e.g., Living Room Kodi"
                required
              />
            </div>

            {/* Enabled */}
            <div className="flex items-center">
              <input
                type="checkbox"
                id="enabled"
                checked={formData.enabled}
                onChange={(e) => handleChange('enabled', e.target.checked)}
                className="w-4 h-4 text-primary-500 rounded focus:ring-primary-500"
              />
              <label htmlFor="enabled" className="ml-2 text-sm text-neutral-300">
                Enabled
              </label>
            </div>

            {/* Host */}
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-1">
                Host <span className="text-error">*</span>
              </label>
              <input
                type="text"
                value={formData.host}
                onChange={(e) => handleChange('host', e.target.value)}
                className="input w-full"
                placeholder="e.g., 192.168.1.100 or kodi.local"
                required
              />
            </div>

            {/* Port */}
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-1">
                Port <span className="text-error">*</span>
              </label>
              <input
                type="number"
                value={formData.port}
                onChange={(e) => handleChange('port', parseInt(e.target.value))}
                className="input w-full"
                placeholder="9090"
                required
              />
              <p className="text-xs text-neutral-500 mt-1">
                Default: 9090 for WebSocket, 8080 for HTTP
              </p>
            </div>

            {/* Username */}
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-1">
                Username
              </label>
              <input
                type="text"
                value={formData.username}
                onChange={(e) => handleChange('username', e.target.value)}
                className="input w-full"
                placeholder="Optional"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-1">
                Password
              </label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => handleChange('password', e.target.value)}
                className="input w-full"
                placeholder="Optional"
              />
            </div>

            {/* Library Group */}
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-1">
                Library Group
              </label>
              <input
                type="text"
                value={formData.libraryGroup}
                onChange={(e) => handleChange('libraryGroup', e.target.value)}
                className="input w-full"
                placeholder="e.g., Home"
              />
              <p className="text-xs text-neutral-500 mt-1">
                Group Kodi instances that share a library. Only one instance per group will perform library scans.
              </p>
            </div>

            {/* Use WebSocket */}
            <div className="flex items-center">
              <input
                type="checkbox"
                id="useWebsocket"
                checked={formData.useWebsocket}
                onChange={(e) => handleChange('useWebsocket', e.target.checked)}
                className="w-4 h-4 text-primary-500 rounded focus:ring-primary-500"
              />
              <label htmlFor="useWebsocket" className="ml-2 text-sm text-neutral-300">
                Use WebSocket Connection
              </label>
            </div>
            <p className="text-xs text-neutral-500 -mt-2">
              WebSocket enables real-time state monitoring and notifications. HTTP fallback is available.
            </p>

            {/* Test Result Message */}
            {testMessage && (
              <div className={`p-3 rounded-md ${
                testStatus === 'success' ? 'bg-success/20 border border-success' :
                testStatus === 'error' ? 'bg-error/20 border border-error' :
                'bg-neutral-800 border border-neutral-700'
              }`}>
                <p className={`text-sm ${
                  testStatus === 'success' ? 'text-success' :
                  testStatus === 'error' ? 'text-error' :
                  'text-neutral-300'
                }`}>
                  {testMessage}
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button
            onClick={handleTest}
            disabled={testStatus === 'testing' || !formData.host || !formData.port}
            className="btn btn-secondary"
          >
            {getTestButtonContent()}
          </button>
          <button onClick={onClose} className="btn btn-secondary">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || !formData.name || !formData.host || !formData.port}
            className="btn btn-primary"
          >
            {isSaving ? <FontAwesomeIcon icon={faSpinner} spin /> : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};