import React, { useState, useEffect, useCallback, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes, faFolder, faSpinner, faCheck, faX, faTrash } from '@fortawesome/free-solid-svg-icons';
import { Library, LibraryFormData, MediaLibraryType } from '../../types/library';
import { libraryApi } from '../../utils/api';
import { DirectoryBrowserModal } from './DirectoryBrowserModal';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

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
    type: 'movie',
    path: '',
    auto_enrich: true,
    auto_publish: false,
  });

  const [showBrowser, setShowBrowser] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [scanAfterSave, setScanAfterSave] = useState(true); // Default to true for new libraries
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Path validation state
  const [pathValidation, setPathValidation] = useState<{
    status: 'idle' | 'validating' | 'valid' | 'invalid';
    message?: string;
  }>({ status: 'idle' });

  const validationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Debounced path validation
  const validatePath = useCallback(async (path: string) => {
    if (!path.trim()) {
      setPathValidation({ status: 'idle' });
      return;
    }

    setPathValidation({ status: 'validating' });

    try {
      const result = await libraryApi.validatePath(path);
      if (result.valid) {
        setPathValidation({ status: 'valid', message: 'Path is accessible with read/write permissions' });
      } else {
        setPathValidation({ status: 'invalid', message: result.error || 'Path is not accessible' });
      }
    } catch (error: any) {
      setPathValidation({ status: 'invalid', message: error.message || 'Failed to validate path' });
    }
  }, []);

  useEffect(() => {
    if (library) {
      setFormData({
        name: library.name,
        type: library.type,
        path: library.path,
        auto_enrich: library.auto_enrich,
        auto_publish: library.auto_publish,
        description: library.description,
      });
      // Validate existing library path on open
      if (library.path) {
        validatePath(library.path);
      }
    } else {
      setFormData({
        name: '',
        type: 'movie',
        path: '',
        auto_enrich: true,
        auto_publish: false,
      });
      setPathValidation({ status: 'idle' });
      setScanAfterSave(true); // Reset to default (checked) for new libraries
    }
  }, [library, validatePath]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (validationTimeoutRef.current) {
        clearTimeout(validationTimeoutRef.current);
      }
    };
  }, []);

  if (!isOpen) return null;

  const handleChange = (field: keyof LibraryFormData, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));

    // Clear any error messages when user makes changes
    if (errorMessage) {
      setErrorMessage('');
    }

    // Debounced path validation
    if (field === 'path') {
      // Clear any pending validation
      if (validationTimeoutRef.current) {
        clearTimeout(validationTimeoutRef.current);
      }

      // Set validating state immediately if there's a value
      if (value.trim()) {
        setPathValidation({ status: 'validating' });
      } else {
        setPathValidation({ status: 'idle' });
      }

      // Debounce the actual validation call
      validationTimeoutRef.current = setTimeout(() => {
        validatePath(value);
      }, 800); // 800ms debounce
    }
  };

  const handleBrowse = () => {
    setShowBrowser(true);
  };

  const handlePathSelect = (path: string) => {
    setFormData((prev) => ({ ...prev, path }));
    setShowBrowser(false);

    // Clear any error messages
    if (errorMessage) {
      setErrorMessage('');
    }

    // Validate the selected path immediately (no debounce for browser selection)
    if (path.trim()) {
      validatePath(path);
    }
  };

  const handleSave = async () => {
    // Don't allow save if path validation is invalid or still validating
    if (pathValidation.status === 'invalid' || pathValidation.status === 'validating') {
      return;
    }

    setErrorMessage('');
    setIsSaving(true);

    try {
      await onSave(formData, scanAfterSave);
      // Close immediately on success
      onClose();
    } catch (error: any) {
      setErrorMessage(error.message || 'Failed to save library');
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

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => {
        // Prevent closing during save or delete operation
        if (!open && (isSaving || isDeleting)) return;
        onClose();
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {library ? `Edit ${library.name}` : 'Add Library'}
            </DialogTitle>
            <DialogDescription>
              {library ? 'Update your library configuration.' : 'Configure a new media library.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 px-6 py-4">
              {/* Name */}
              <div>
                <Label htmlFor="library-name" className="block text-sm font-medium text-neutral-300 mb-1">
                  Name <span className="text-error">*</span>
                </Label>
                <Input
                  id="library-name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  placeholder="e.g., Main Movie Library"
                  required
                />
              </div>

              {/* Type */}
              <div>
                <Label htmlFor="library-type" className="block text-sm font-medium text-neutral-300 mb-1">
                  Type <span className="text-error">*</span>
                </Label>
                <Select
                  value={formData.type}
                  onValueChange={(value) => handleChange('type', value as MediaLibraryType)}
                >
                  <SelectTrigger id="library-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="movie">Movies</SelectItem>
                    <SelectItem value="tv">TV Shows</SelectItem>
                    <SelectItem value="music">Music</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Path */}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Label htmlFor="library-path" className="text-sm font-medium text-neutral-300">
                    Path <span className="text-error">*</span>
                  </Label>
                  {/* Validation indicator next to label */}
                  {pathValidation.status === 'validating' && (
                    <FontAwesomeIcon icon={faSpinner} spin className="text-neutral-400 text-sm" />
                  )}
                  {pathValidation.status === 'valid' && (
                    <FontAwesomeIcon icon={faCheck} className="text-green-500 text-sm" />
                  )}
                  {pathValidation.status === 'invalid' && (
                    <FontAwesomeIcon icon={faX} className="text-error text-sm" />
                  )}
                </div>
                <div className="relative">
                  <Input
                    id="library-path"
                    type="text"
                    value={formData.path}
                    onChange={(e) => handleChange('path', e.target.value)}
                    className={`pr-24 ${
                      pathValidation.status === 'valid'
                        ? 'border-green-500 focus:border-green-500 focus:ring-green-500/20'
                        : pathValidation.status === 'invalid'
                        ? 'border-error focus:border-error focus:ring-error/20'
                        : ''
                    }`}
                    placeholder="/path/to/movies or C:\Movies"
                    required
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleBrowse}
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-8 px-3"
                  >
                    <FontAwesomeIcon icon={faFolder} className="mr-1.5" />
                    Browse
                  </Button>
                </div>
                {pathValidation.message && (
                  <p className={`text-xs mt-1 ${
                    pathValidation.status === 'valid' ? 'text-green-500' : 'text-error'
                  }`}>
                    {pathValidation.message}
                  </p>
                )}
                {!pathValidation.message && (
                  <p className="text-xs text-neutral-500 mt-1">
                    Path to the directory containing your media files
                  </p>
                )}
              </div>

              <hr className="border-neutral-700" />

              {/* Auto-Enrich Toggle */}
              <div className="flex items-center justify-between">
                <Label htmlFor="auto-enrich" className="text-sm font-medium text-neutral-300 cursor-pointer">
                  Auto-Enrich
                </Label>
                <Switch
                  id="auto-enrich"
                  checked={formData.auto_enrich}
                  onCheckedChange={(checked) => handleChange('auto_enrich', checked)}
                />
              </div>

              {/* Auto-Publish Toggle */}
              <div className="flex items-center justify-between">
                <Label htmlFor="auto-publish" className="text-sm font-medium text-neutral-300 cursor-pointer">
                  Auto-Publish
                </Label>
                <Switch
                  id="auto-publish"
                  checked={formData.auto_publish}
                  disabled={!formData.auto_enrich}
                  onCheckedChange={(checked) => handleChange('auto_publish', checked)}
                />
              </div>

              {/* Scan After Save */}
              {!library && (
                <div className="flex items-center justify-between">
                  <Label htmlFor="scanAfterSave" className="text-sm font-medium text-neutral-300 cursor-pointer">
                    Scan After Save
                  </Label>
                  <Switch
                    id="scanAfterSave"
                    checked={scanAfterSave}
                    onCheckedChange={(checked) => setScanAfterSave(checked as boolean)}
                  />
                </div>
              )}

              {/* Error Message */}
              {errorMessage && (
                <Alert className="bg-error/20 border-error">
                  <AlertDescription className="text-error text-sm">
                    {errorMessage}
                  </AlertDescription>
                </Alert>
              )}
          </div>

          <DialogFooter className="!justify-between px-6 py-4">
            <div className="flex gap-2">
              {library && onDelete && (
                <Button
                  variant="destructive"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={isDeleting}
                >
                  <FontAwesomeIcon icon={faTrash} className="mr-2" />
                  Delete Library
                </Button>
              )}
            </div>
            <Button
              onClick={handleSave}
              disabled={
                isSaving ||
                !formData.name ||
                !formData.path ||
                pathValidation.status === 'invalid' ||
                pathValidation.status === 'validating'
              }
            >
              {isSaving ? (
                <>
                  <FontAwesomeIcon icon={faSpinner} spin className="mr-2" />
                  Saving...
                </>
              ) : (
                'Save'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DirectoryBrowserModal
        isOpen={showBrowser}
        onClose={() => setShowBrowser(false)}
        onSelect={handlePathSelect}
        initialPath={formData.path}
      />

      {/* Delete Confirmation AlertDialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={(open) => {
        // Prevent closing during delete operation
        if (!open && isDeleting) return;
        setShowDeleteConfirm(open);
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Library</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{library?.name}</strong>? This will remove the library and all associated database entries. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={isDeleting}
              className="bg-error hover:bg-error/90"
            >
              {isDeleting ? <FontAwesomeIcon icon={faSpinner} spin className="mr-2" /> : null}
              {isDeleting ? 'Deleting...' : 'Continue'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
