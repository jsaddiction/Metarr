import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFolder, faChevronRight, faLevelUpAlt, faHardDrive } from '@fortawesome/free-solid-svg-icons';
import { DirectoryEntry } from '../../types/library';
import { libraryApi } from '../../utils/api';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface DirectoryBrowserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (path: string) => void;
  initialPath?: string;
}

interface PlatformInfo {
  platform: string;
  isWindows: boolean;
  separator: string;
}

export const DirectoryBrowserModal: React.FC<DirectoryBrowserModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  initialPath,
}) => {
  const [currentPath, setCurrentPath] = useState<string>(initialPath || '/');
  const [directories, setDirectories] = useState<DirectoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drives, setDrives] = useState<string[]>([]);
  const [platformInfo, setPlatformInfo] = useState<PlatformInfo>({
    platform: 'linux',
    isWindows: false,
    separator: '/',
  });

  // Load platform info, drives, and initialize path
  useEffect(() => {
    const initializePath = async () => {
      if (!isOpen) return;

      try {
        // Get platform info
        const platform = await libraryApi.getPlatform();
        setPlatformInfo(platform);

        // Get available drives (Windows only)
        if (platform.isWindows) {
          const availableDrives = await libraryApi.getDrives();
          setDrives(availableDrives);

          // Determine starting path
          if (initialPath && initialPath.trim()) {
            setCurrentPath(initialPath);
          } else if (availableDrives.length > 0) {
            setCurrentPath(availableDrives[0]);
          } else {
            setCurrentPath('C:\\');
          }
        } else {
          // Unix/Linux/Mac
          if (initialPath && initialPath.trim()) {
            setCurrentPath(initialPath);
          } else {
            setCurrentPath('/');
          }
        }
      } catch (err) {
        console.error('Failed to initialize path:', err);
        // Fallback
        if (initialPath && initialPath.trim()) {
          setCurrentPath(initialPath);
        } else {
          setCurrentPath('/');
        }
      }
    };

    initializePath();
  }, [isOpen, initialPath]);

  useEffect(() => {
    if (isOpen && currentPath) {
      loadDirectories(currentPath);
    }
  }, [isOpen, currentPath]);

  const loadDirectories = async (path: string) => {
    setLoading(true);
    setError(null);

    try {
      const dirs = await libraryApi.browsePath(path);
      setDirectories(dirs);
    } catch (err: any) {
      setError(err.message || 'Failed to load directories');
      setDirectories([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDirectoryClick = (dir: DirectoryEntry) => {
    setCurrentPath(dir.path);
  };

  const handleSelectCurrent = () => {
    onSelect(currentPath);
    onClose();
  };

  const handleDriveChange = (drive: string) => {
    setCurrentPath(drive);
  };

  const getBreadcrumbs = (): string[] => {
    if (platformInfo.isWindows) {
      const parts = currentPath.split(/[\\/]/).filter(Boolean);

      // Windows: Extract drive letter (e.g., "C:\")
      if (currentPath.match(/^[A-Z]:\\/i)) {
        const drive = parts[0] + '\\'; // e.g., "C:\" to match drives array format
        const remaining = parts.slice(1);
        return [drive, ...remaining];
      }

      return parts;
    } else {
      // Unix: Split by forward slash
      const parts = currentPath.split('/').filter(Boolean);
      return ['/', ...parts];
    }
  };

  const navigateToBreadcrumb = (index: number) => {
    const parts = getBreadcrumbs();
    const selectedParts = parts.slice(0, index + 1);

    if (platformInfo.isWindows) {
      if (index === 0) {
        // Navigate to drive root (e.g., "C:\") - already has backslash
        setCurrentPath(selectedParts[0]);
      } else {
        // Navigate to subdirectory - drive already has backslash, so don't double it
        setCurrentPath(selectedParts[0] + selectedParts.slice(1).join('\\'));
      }
    } else {
      // Unix
      if (index === 0) {
        setCurrentPath('/');
      } else {
        setCurrentPath('/' + selectedParts.slice(1).join('/'));
      }
    }
  };

  if (!isOpen) return null;

  const breadcrumbs = getBreadcrumbs();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-neutral-700 flex-shrink-0">
          <DialogTitle>Browse Directory</DialogTitle>
        </DialogHeader>

        {/* Fixed Header with Breadcrumb Navigation */}
        <div className="px-6 py-3 border-b border-neutral-700 flex-shrink-0 bg-neutral-900/50">
          <div className="flex items-center gap-2 p-2 bg-neutral-800 rounded-md">
            {/* Drive Selector for Windows */}
            {platformInfo.isWindows && drives.length > 0 && (
              <>
                <FontAwesomeIcon icon={faHardDrive} className="text-primary-400 ml-1" />
                <Select
                  value={breadcrumbs[0]}
                  onValueChange={handleDriveChange}
                >
                  <SelectTrigger className="w-20 h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {drives.map(drive => (
                      <SelectItem key={drive} value={drive}>
                        {drive}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {breadcrumbs.length > 1 && (
                  <FontAwesomeIcon icon={faChevronRight} className="text-neutral-500 text-xs" />
                )}
              </>
            )}

            {/* Breadcrumbs */}
            {breadcrumbs.map((part, index) => {
              // Skip drive letter on Windows (already in dropdown)
              if (platformInfo.isWindows && index === 0) return null;

              return (
                <React.Fragment key={index}>
                  {index > (platformInfo.isWindows ? 1 : 0) && (
                    <FontAwesomeIcon
                      icon={faChevronRight}
                      className="text-neutral-500 text-xs"
                    />
                  )}
                  <Button
                    onClick={() => navigateToBreadcrumb(index)}
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-sm text-primary-400 hover:text-primary-300 hover:bg-neutral-700"
                  >
                    {part === '/' ? 'Root' : part}
                  </Button>
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Scrollable Directory List */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading && (
            <div className="flex items-center justify-center h-full text-neutral-400">
              <div className="text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 mb-3"></div>
                <p>Loading directories...</p>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-error mb-2">Error loading directories</p>
                <p className="text-sm text-neutral-400 mb-4">{error}</p>
                <Button
                  onClick={() => loadDirectories(currentPath)}
                  variant="outline"
                >
                  Retry
                </Button>
              </div>
            </div>
          )}

          {!loading && !error && directories.length === 0 && (
            <div className="flex items-center justify-center h-full text-neutral-400">
              <p>No subdirectories found</p>
            </div>
          )}

          {!loading && !error && directories.length > 0 && (
            <div className="border border-neutral-700 rounded-md divide-y divide-neutral-700">
              {directories.map((dir, index) => (
                <Button
                  key={index}
                  onClick={() => handleDirectoryClick(dir)}
                  variant="ghost"
                  className={`w-full justify-start p-4 rounded-none hover:bg-neutral-800 ${
                    dir.name === '..' ? 'bg-neutral-800/50' : ''
                  }`}
                >
                  <FontAwesomeIcon
                    icon={dir.name === '..' ? faLevelUpAlt : faFolder}
                    className={`mr-3 ${dir.name === '..' ? 'text-primary-300' : 'text-primary-400'}`}
                  />
                  <span className={`${dir.name === '..' ? 'text-neutral-300 font-medium' : 'text-neutral-200'}`}>
                    {dir.name === '..' ? 'Parent Directory (..)' : dir.name}
                  </span>
                </Button>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t border-neutral-700 flex-shrink-0">
          <Button onClick={onClose} variant="outline">
            Cancel
          </Button>
          <Button onClick={handleSelectCurrent}>
            Select Current Directory
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
