import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes, faFolder, faSpinner, faCheck, faX, faTrash } from '@fortawesome/free-solid-svg-icons';
import { Library, LibraryFormData, MediaLibraryType } from '../../types/library';
import { libraryApi } from '../../utils/api';
import { DirectoryBrowserModal } from './DirectoryBrowserModal';

interface LibraryConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: LibraryFormData, scanAfterSave: boolean) => Promise<void>;
  onDelete?: (id: number) => Promise<void>;
  library?: Library;
}

export const LibraryConfigModal: React.FC<LibraryConfigModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onDelete,
  library,
}) => {
  const [formData, setFormData] = useState<LibraryFormData>({
    name: '',
    type: 'movies',
    path: 'C:\\',
    enabled: true,
  });

  const [showBrowser, setShowBrowser] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<'idle' | 'success' | 'error'>('idle');
  const [validationMessage, setValidationMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [scanAfterSave, setScanAfterSave] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (library) {
      setFormData({
        name: library.name,
        type: library.type,
        path: library.path,
        enabled: library.enabled,
      });
    } else {
      setFormData({
        name: '',
        type: 'movies',
        path: 'C:\\',
        enabled: true,
      });
    }
  }, [library]);

  if (!isOpen) return null;

  const handleChange = (field: keyof LibraryFormData, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Reset validation when path changes
    if (field === 'path') {
      setValidationResult('idle');
      setValidationMessage('');
    }
  };

  const handleBrowse = () => {
    setShowBrowser(true);
  };

  const handlePathSelect = (path: string) => {
    setFormData((prev) => ({ ...prev, path }));
    setShowBrowser(false);
    // Auto-validate after selection
    validatePath(path);
  };

  const validatePath = async (pathToValidate?: string) => {
    const path = pathToValidate || formData.path;

    if (!path) {
      setValidationResult('error');
      setValidationMessage('Path is required');
      return;
    }

    setValidating(true);
    setValidationResult('idle');
    setValidationMessage('');

    try {
      const result = await libraryApi.validatePath(path);

      if (result.valid) {
        setValidationResult('success');
        setValidationMessage('Path is valid and accessible');

        // Auto-reset after 2 seconds
        setTimeout(() => {
          setValidationResult('idle');
          setValidationMessage('');
        }, 2000);
      } else {
        setValidationResult('error');
        setValidationMessage(result.error || 'Path is invalid or not accessible');

        // Auto-reset after 3 seconds
        setTimeout(() => {
          setValidationResult('idle');
          setValidationMessage('');
        }, 3000);
      }
    } catch (error: any) {
      setValidationResult('error');
      setValidationMessage(error.message || 'Failed to validate path');

      setTimeout(() => {
        setValidationResult('idle');
        setValidationMessage('');
      }, 3000);
    } finally {
      setValidating(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(formData, scanAfterSave);
      onClose();
    } catch (error) {
      console.error('Failed to save library:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!library || !onDelete) return;

    setIsDeleting(true);
    try {
      await onDelete(library.id);
      setShowDeleteConfirm(false);
      onClose();
    } catch (error) {
      console.error('Failed to delete library:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const getValidationButtonContent = () => {
    if (validating) {
      return <FontAwesomeIcon icon={faSpinner} spin />;
    }
    if (validationResult === 'success') {
      return <FontAwesomeIcon icon={faCheck} className="text-success" />;
    }
    if (validationResult === 'error') {
      return <FontAwesomeIcon icon={faX} className="text-error" />;
    }
    return 'Validate';
  };

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-container max-w-2xl" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2 className="text-2xl font-semibold">
              {library ? `Edit ${library.name}` : 'Add Library'}
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
                  placeholder="e.g., Main Movie Library"
                  required
                />
              </div>

              {/* Type */}
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-1">
                  Type <span className="text-error">*</span>
                </label>
                <select
                  value={formData.type}
                  onChange={(e) => handleChange('type', e.target.value as MediaLibraryType)}
                  className="input w-full"
                  required
                >
                  <option value="movies">Movies</option>
                  <option value="tvshows">TV Shows</option>
                  <option value="music">Music</option>
                </select>
              </div>

              {/* Path */}
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-1">
                  Path <span className="text-error">*</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={formData.path}
                    onChange={(e) => handleChange('path', e.target.value)}
                    className="input flex-1"
                    placeholder="C:\Movies"
                    required
                  />
                  <button
                    type="button"
                    onClick={handleBrowse}
                    className="btn btn-secondary"
                  >
                    <FontAwesomeIcon icon={faFolder} className="mr-2" />
                    Browse
                  </button>
                </div>
                <p className="text-xs text-neutral-500 mt-1">
                  Path to the directory containing your media files
                </p>
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

              {/* Scan After Save */}
              {!library && (
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="scanAfterSave"
                    checked={scanAfterSave}
                    onChange={(e) => setScanAfterSave(e.target.checked)}
                    className="w-4 h-4 text-primary-500 rounded focus:ring-primary-500"
                  />
                  <label htmlFor="scanAfterSave" className="ml-2 text-sm text-neutral-300">
                    Scan library after saving
                  </label>
                </div>
              )}

              {/* Validation Result Message */}
              {validationMessage && (
                <div
                  className={`p-3 rounded-md ${
                    validationResult === 'success'
                      ? 'bg-success/20 border border-success'
                      : validationResult === 'error'
                      ? 'bg-error/20 border border-error'
                      : 'bg-neutral-800 border border-neutral-700'
                  }`}
                >
                  <p
                    className={`text-sm ${
                      validationResult === 'success'
                        ? 'text-success'
                        : validationResult === 'error'
                        ? 'text-error'
                        : 'text-neutral-300'
                    }`}
                  >
                    {validationMessage}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="modal-footer">
            <div className="flex-1 flex justify-start">
              {library && onDelete && (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={isDeleting}
                  className="btn btn-error"
                >
                  <FontAwesomeIcon icon={faTrash} className="mr-2" />
                  Delete Library
                </button>
              )}
            </div>
            <button
              onClick={() => validatePath()}
              disabled={validating || !formData.path}
              className="btn btn-secondary"
            >
              {getValidationButtonContent()}
            </button>
            <button onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || !formData.name || !formData.path}
              className="btn btn-primary"
            >
              {isSaving ? <FontAwesomeIcon icon={faSpinner} spin /> : 'Save'}
            </button>
          </div>
        </div>
      </div>

      <DirectoryBrowserModal
        isOpen={showBrowser}
        onClose={() => setShowBrowser(false)}
        onSelect={handlePathSelect}
        initialPath={formData.path}
      />

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="modal-container max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="text-2xl font-semibold text-error">Confirm Delete</h2>
              <button onClick={() => setShowDeleteConfirm(false)} className="modal-close-btn">
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>

            <div className="modal-body">
              <p className="text-neutral-300 mb-4">
                Are you sure you want to delete <strong>{library?.name}</strong>?
              </p>
              <p className="text-sm text-neutral-400">
                This will remove the library and all associated database entries. This action cannot be undone.
              </p>
            </div>

            <div className="modal-footer">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="btn btn-secondary"
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="btn btn-error"
                disabled={isDeleting}
              >
                {isDeleting ? <FontAwesomeIcon icon={faSpinner} spin /> : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
