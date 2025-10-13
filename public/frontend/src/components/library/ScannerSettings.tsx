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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

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
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: number; pattern: string; isSystem: boolean } | null>(null);

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

  const handleDeleteClick = (id: number, pattern: string, isSystem: boolean) => {
    if (isSystem) {
      return;
    }
    setDeleteConfirm({ id, pattern, isSystem });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) return;

    try {
      const response = await fetch(`/api/ignore-patterns/${deleteConfirm.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await loadPatterns();
        setDeleteConfirm(null);
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
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-white">Scanner Settings</h2>
        <p className="text-neutral-400 mt-1">
          Configure patterns to ignore files during library scanning
        </p>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Ignore Patterns</h3>
            <Button
              onClick={() => setShowAddModal(true)}
              size="sm"
            >
              <FontAwesomeIcon icon={faPlus} className="mr-2" />
              Add Pattern
            </Button>
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
                          <Badge variant="outline" className="bg-neutral-700 text-neutral-300 border-neutral-600">
                            <FontAwesomeIcon icon={faLock} className="mr-1" />
                            System
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-primary/20 text-primary-400 border-primary">
                            Custom
                          </Badge>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {pattern.enabled ? (
                          <Badge variant="outline" className="bg-success/20 text-success border-success">
                            Enabled
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-neutral-700 text-neutral-400 border-neutral-600">
                            Disabled
                          </Badge>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            onClick={() => handleToggle(pattern.id, pattern.enabled)}
                            variant="ghost"
                            size="sm"
                            title={pattern.enabled ? 'Disable pattern' : 'Enable pattern'}
                          >
                            <FontAwesomeIcon
                              icon={pattern.enabled ? faToggleOn : faToggleOff}
                              className={pattern.enabled ? 'text-success' : 'text-neutral-500'}
                            />
                          </Button>
                          <Button
                            onClick={() => handleDeleteClick(pattern.id, pattern.pattern, pattern.is_system)}
                            variant="ghost"
                            size="sm"
                            disabled={pattern.is_system}
                            title={pattern.is_system ? 'Cannot delete system patterns' : 'Delete pattern'}
                            className={pattern.is_system ? '' : 'text-error hover:bg-error/20'}
                          >
                            <FontAwesomeIcon icon={faTrash} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Pattern Dialog */}
      <Dialog open={showAddModal} onOpenChange={(open) => {
        if (!saving) {
          setShowAddModal(open);
          if (!open) {
            setNewPattern('');
            setNewDescription('');
          }
        }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Ignore Pattern</DialogTitle>
            <DialogDescription>
              Create a new pattern to ignore files during library scanning
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 px-6">
            <div>
              <Label htmlFor="pattern" className="block text-sm font-medium text-neutral-300 mb-2">
                Pattern <span className="text-error">*</span>
              </Label>
              <Input
                id="pattern"
                type="text"
                value={newPattern}
                onChange={(e) => setNewPattern(e.target.value)}
                placeholder="e.g., *sample*.mkv or *.nfo"
                autoFocus
              />
              <p className="text-xs text-neutral-500 mt-1">
                Use glob patterns: * for any characters, ? for single character
              </p>
            </div>

            <div>
              <Label htmlFor="description" className="block text-sm font-medium text-neutral-300 mb-2">
                Description
              </Label>
              <Input
                id="description"
                type="text"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Optional description"
              />
            </div>
          </div>

          <DialogFooter className="px-6 pb-6 pt-4">
            <Button
              variant="outline"
              onClick={() => {
                setShowAddModal(false);
                setNewPattern('');
                setNewDescription('');
              }}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAdd}
              disabled={!newPattern.trim() || saving}
            >
              {saving ? 'Adding...' : 'Add Pattern'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation AlertDialog */}
      <AlertDialog open={deleteConfirm !== null} onOpenChange={(open) => {
        if (!open) setDeleteConfirm(null);
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Ignore Pattern</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the pattern <strong>"{deleteConfirm?.pattern}"</strong>?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDeleteConfirm();
              }}
              className="bg-error hover:bg-error/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
