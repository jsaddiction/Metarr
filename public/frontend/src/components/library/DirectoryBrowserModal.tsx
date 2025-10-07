import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes, faFolder, faChevronRight, faHome, faLevelUpAlt } from '@fortawesome/free-solid-svg-icons';
import { DirectoryEntry } from '../../types/library';
import { libraryApi } from '../../utils/api';

interface DirectoryBrowserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (path: string) => void;
  initialPath?: string;
}

export const DirectoryBrowserModal: React.FC<DirectoryBrowserModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  initialPath = 'C:\\',
}) => {
  const [currentPath, setCurrentPath] = useState<string>(initialPath);
  const [directories, setDirectories] = useState<DirectoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const getBreadcrumbs = (): string[] => {
    const parts = currentPath.split(/[\\/]/).filter(Boolean);

    // Windows: Start with drive letter
    if (currentPath.match(/^[A-Z]:\\/i)) {
      const drive = currentPath.substring(0, 3);
      const remaining = parts.slice(1);
      return [drive, ...remaining];
    }

    // Unix: Start with root
    return ['/', ...parts];
  };

  const navigateToBreadcrumb = (index: number) => {
    const parts = getBreadcrumbs();
    const selectedParts = parts.slice(0, index + 1);

    if (currentPath.match(/^[A-Z]:\\/i)) {
      // Windows
      if (index === 0) {
        setCurrentPath(selectedParts[0]);
      } else {
        setCurrentPath(selectedParts.join('\\'));
      }
    } else {
      // Unix
      setCurrentPath(selectedParts.join('/'));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container max-w-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="text-2xl font-semibold">Browse Directory</h2>
          <button onClick={onClose} className="modal-close-btn">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        <div className="modal-body">
          {/* Breadcrumb Navigation */}
          <div className="flex items-center mb-4 p-3 bg-neutral-800 rounded-md overflow-x-auto">
            <FontAwesomeIcon icon={faHome} className="text-neutral-400 mr-2" />

            {/* Breadcrumbs */}
            {getBreadcrumbs().map((part, index) => (
              <React.Fragment key={index}>
                {index > 0 && (
                  <FontAwesomeIcon
                    icon={faChevronRight}
                    className="text-neutral-500 mx-1 text-sm"
                  />
                )}
                <button
                  onClick={() => navigateToBreadcrumb(index)}
                  className="text-primary-400 hover:text-primary-300 transition-colors px-2 py-1 rounded hover:bg-neutral-700"
                >
                  {part}
                </button>
              </React.Fragment>
            ))}
          </div>

          {/* Current Path Display */}
          <div className="mb-4 p-3 bg-neutral-800 rounded-md">
            <p className="text-sm text-neutral-400">Current Path:</p>
            <p className="text-white font-mono break-all">{currentPath}</p>
          </div>

          {/* Directory List */}
          <div className="border border-neutral-700 rounded-md max-h-96 overflow-y-auto">
            {loading && (
              <div className="p-8 text-center text-neutral-400">
                Loading directories...
              </div>
            )}

            {error && (
              <div className="p-8 text-center">
                <p className="text-error mb-2">Error loading directories</p>
                <p className="text-sm text-neutral-400">{error}</p>
                <button
                  onClick={() => loadDirectories(currentPath)}
                  className="btn btn-secondary mt-4"
                >
                  Retry
                </button>
              </div>
            )}

            {!loading && !error && directories.length === 0 && (
              <div className="p-8 text-center text-neutral-400">
                No subdirectories found
              </div>
            )}

            {!loading && !error && directories.length > 0 && (
              <div className="divide-y divide-neutral-700">
                {directories.map((dir, index) => (
                  <button
                    key={index}
                    onClick={() => handleDirectoryClick(dir)}
                    className={`w-full flex items-center p-3 hover:bg-neutral-700 transition-colors text-left ${
                      dir.name === '..' ? 'bg-neutral-800/50' : ''
                    }`}
                  >
                    <FontAwesomeIcon
                      icon={dir.name === '..' ? faLevelUpAlt : faFolder}
                      className={`mr-3 ${dir.name === '..' ? 'text-primary-300' : 'text-primary-400'}`}
                    />
                    <span className={dir.name === '..' ? 'text-neutral-300 font-medium' : 'text-neutral-200'}>
                      {dir.name === '..' ? 'Parent Directory (..)' : dir.name}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button onClick={onClose} className="btn btn-secondary">
            Cancel
          </button>
          <button onClick={handleSelectCurrent} className="btn btn-primary">
            Select Current Directory
          </button>
        </div>
      </div>
    </div>
  );
};
