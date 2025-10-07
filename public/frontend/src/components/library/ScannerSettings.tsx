import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPlus,
  faToggleOn,
  faToggleOff,
  faTrash,
  faEyeSlash,
  faLock,
  faTimes,
} from '@fortawesome/free-solid-svg-icons';

interface IgnorePattern {
  id: number;
  pattern: string;
  description?: string;
  is_system: boolean;
  enabled: boolean;
  created_at: string;
}

export const ScannerSettings: React.FC = () => {
  const [patterns, setPatterns] = useState<IgnorePattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newPattern, setNewPattern] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadPatterns();
  }, []);

  const loadPatterns = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/ignore-patterns');
      if (response.ok) {
        const data = await response.json();
        setPatterns(data);
      }
    } catch (error) {
      console.error('Failed to load ignore patterns:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!newPattern.trim()) return;

    try {
      setSaving(true);
      const response = await fetch('/api/ignore-patterns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pattern: newPattern.trim(),
          description: newDescription.trim() || undefined,
        }),
      });

      if (response.ok) {
        await loadPatterns();
        setShowAddModal(false);
        setNewPattern('');
        setNewDescription('');
      } else {
        const error = await response.json();
        alert(`Failed to add pattern: ${error.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to add ignore pattern:', error);
      alert('Failed to add ignore pattern');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (id: number, currentEnabled: boolean) => {
    try {
      const response = await fetch(`/api/ignore-patterns/${id}/toggle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !currentEnabled }),
      });

      if (response.ok) {
        await loadPatterns();
      }
    } catch (error) {
      console.error('Failed to toggle pattern:', error);
    }
  };

  const handleDelete = async (id: number, pattern: string, isSystem: boolean) => {
    if (isSystem) {
      alert('Cannot delete system patterns');
      return;
    }

    if (!confirm(`Are you sure you want to delete the pattern "${pattern}"?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/ignore-patterns/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await loadPatterns();
      } else {
        const error = await response.json();
        alert(`Failed to delete pattern: ${error.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to delete pattern:', error);
      alert('Failed to delete pattern');
    }
  };

  return (
    <div className="mt-12">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-white">Scanner Settings</h2>
        <p className="text-neutral-400 mt-1">
          Configure patterns to ignore files during library scanning
        </p>
      </div>

      <div className="card">
        <div className="card-body">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Ignore Patterns</h3>
            <button
              onClick={() => setShowAddModal(true)}
              className="btn btn-primary btn-sm"
            >
              <FontAwesomeIcon icon={faPlus} className="mr-2" />
              Add Pattern
            </button>
          </div>

          {loading ? (
            <div className="text-center py-8 text-neutral-400">
              Loading patterns...
            </div>
          ) : patterns.length === 0 ? (
            <div className="text-center py-8">
              <FontAwesomeIcon icon={faEyeSlash} className="text-neutral-600 text-4xl mb-3" />
              <p className="text-neutral-400">No ignore patterns configured</p>
              <p className="text-sm text-neutral-500 mt-2">
                Add patterns to automatically skip files during scanning
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-neutral-700">
                    <th className="text-left py-3 px-4 text-sm font-medium text-neutral-400">Pattern</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-neutral-400">Description</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-neutral-400">Type</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-neutral-400">Status</th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-neutral-400">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {patterns.map((pattern) => (
                    <tr key={pattern.id} className="border-b border-neutral-800">
                      <td className="py-3 px-4">
                        <code className="text-sm text-primary-400 bg-neutral-800/50 px-2 py-1 rounded">
                          {pattern.pattern}
                        </code>
                      </td>
                      <td className="py-3 px-4 text-sm text-neutral-300">
                        {pattern.description || '-'}
                      </td>
                      <td className="py-3 px-4">
                        {pattern.is_system ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-neutral-700 text-neutral-300">
                            <FontAwesomeIcon icon={faLock} className="mr-1" />
                            System
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary/20 text-primary-400">
                            Custom
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {pattern.enabled ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-success/20 text-success">
                            Enabled
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-neutral-700 text-neutral-400">
                            Disabled
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleToggle(pattern.id, pattern.enabled)}
                            className="btn btn-ghost btn-sm"
                            title={pattern.enabled ? 'Disable pattern' : 'Enable pattern'}
                          >
                            <FontAwesomeIcon
                              icon={pattern.enabled ? faToggleOn : faToggleOff}
                              className={pattern.enabled ? 'text-success' : 'text-neutral-500'}
                            />
                          </button>
                          <button
                            onClick={() => handleDelete(pattern.id, pattern.pattern, pattern.is_system)}
                            className={`btn btn-ghost btn-sm ${
                              pattern.is_system
                                ? 'opacity-50 cursor-not-allowed'
                                : 'text-error hover:bg-error/20'
                            }`}
                            disabled={pattern.is_system}
                            title={pattern.is_system ? 'Cannot delete system patterns' : 'Delete pattern'}
                          >
                            <FontAwesomeIcon icon={faTrash} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Add Pattern Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-neutral-800 rounded-lg border border-neutral-700 max-w-lg w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Add Ignore Pattern</h3>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setNewPattern('');
                  setNewDescription('');
                }}
                className="text-neutral-400 hover:text-white transition-colors"
              >
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-2">
                  Pattern <span className="text-error">*</span>
                </label>
                <input
                  type="text"
                  value={newPattern}
                  onChange={(e) => setNewPattern(e.target.value)}
                  placeholder="e.g., *sample*.mkv or *.nfo"
                  className="input w-full"
                  autoFocus
                />
                <p className="text-xs text-neutral-500 mt-1">
                  Use glob patterns: * for any characters, ? for single character
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-2">
                  Description
                </label>
                <input
                  type="text"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Optional description"
                  className="input w-full"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    setNewPattern('');
                    setNewDescription('');
                  }}
                  className="btn btn-ghost"
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  onClick={handleAdd}
                  className="btn btn-primary"
                  disabled={!newPattern.trim() || saving}
                >
                  {saving ? 'Adding...' : 'Add Pattern'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
