import React, { useState, useEffect } from 'react';
import { Library, LibraryFormData, ScanProgressEvent } from '../../types/library';
import { libraryApi } from '../../utils/api';
import { AddLibraryCard } from '../../components/library/AddLibraryCard';
import { LibraryCard } from '../../components/library/LibraryCard';
import { LibraryConfigModal } from '../../components/library/LibraryConfigModal';
import { ScannerSettings } from '../../components/library/ScannerSettings';

export const Libraries: React.FC = () => {
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [loading, setLoading] = useState(true);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [selectedLibrary, setSelectedLibrary] = useState<Library | undefined>();
  const [scanProgress, setScanProgress] = useState<Map<number, ScanProgressEvent>>(new Map());
  const [scanningLibraries, setScanningLibraries] = useState<Set<number>>(new Set());

  useEffect(() => {
    loadLibraries();

    // Subscribe to scan progress updates
    const cleanup = libraryApi.subscribeToScanProgress(
      // On progress
      (event) => {
        setScanProgress((prev) => {
          const updated = new Map(prev);
          updated.set(event.libraryId, event);
          return updated;
        });
        setScanningLibraries((prev) => new Set(prev).add(event.libraryId));
      },
      // On completed
      (event) => {
        setScanProgress((prev) => {
          const updated = new Map(prev);
          updated.delete(event.libraryId);
          return updated;
        });
        setScanningLibraries((prev) => {
          const updated = new Set(prev);
          updated.delete(event.libraryId);
          return updated;
        });
        // Reload libraries to get updated data
        loadLibraries();
      },
      // On failed
      (event) => {
        setScanProgress((prev) => {
          const updated = new Map(prev);
          updated.delete(event.libraryId);
          return updated;
        });
        setScanningLibraries((prev) => {
          const updated = new Set(prev);
          updated.delete(event.libraryId);
          return updated;
        });
        console.error(`Library scan failed: ${event.error}`);
      }
    );

    return () => {
      cleanup();
    };
  }, []);

  const loadLibraries = async () => {
    try {
      setLoading(true);
      const data = await libraryApi.getAll();
      setLibraries(data);
    } catch (error) {
      console.error('Failed to load libraries:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddClick = () => {
    setSelectedLibrary(undefined);
    setShowConfigModal(true);
  };

  const handleLibraryClick = (library: Library) => {
    setSelectedLibrary(library);
    setShowConfigModal(true);
  };

  const handleSave = async (data: LibraryFormData, scanAfterSave: boolean) => {
    try {
      if (selectedLibrary) {
        await libraryApi.update(selectedLibrary.id, data);
      } else {
        const newLibrary = await libraryApi.create(data);

        // Trigger scan if requested
        if (scanAfterSave && newLibrary.enabled) {
          await libraryApi.startScan(newLibrary.id);
          setScanningLibraries((prev) => new Set(prev).add(newLibrary.id));
        }
      }
      await loadLibraries();
      handleCloseConfigModal();
    } catch (error) {
      console.error('Failed to save library:', error);
      throw error;
    }
  };

  const handleScan = async (e: React.MouseEvent, libraryId: number) => {
    e.stopPropagation(); // Prevent card click

    try {
      await libraryApi.startScan(libraryId);
      setScanningLibraries((prev) => new Set(prev).add(libraryId));
    } catch (error: any) {
      console.error('Failed to start scan:', error);
      alert(`Failed to start scan: ${error.message}`);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await libraryApi.delete(id);
      await loadLibraries();
    } catch (error: any) {
      console.error('Failed to delete library:', error);
      alert(`Failed to delete library: ${error.message}`);
      throw error;
    }
  };

  const handleCloseConfigModal = () => {
    setShowConfigModal(false);
    setSelectedLibrary(undefined);
  };

  return (
    <div className="content-spacing">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Libraries</h1>
        <p className="text-neutral-400 mt-1">
          Manage your media library directories and scan for content
        </p>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <p className="text-neutral-400">Loading libraries...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AddLibraryCard onClick={handleAddClick} />
          {libraries.map((library) => (
            <LibraryCard
              key={library.id}
              library={library}
              onClick={() => handleLibraryClick(library)}
              onScan={(e) => handleScan(e, library.id)}
              isScanning={scanningLibraries.has(library.id)}
              scanProgress={
                scanProgress.has(library.id)
                  ? {
                      current: scanProgress.get(library.id)!.progressCurrent,
                      total: scanProgress.get(library.id)!.progressTotal,
                      currentFile: scanProgress.get(library.id)!.currentFile,
                    }
                  : undefined
              }
            />
          ))}
        </div>
      )}

      <ScannerSettings />

      <LibraryConfigModal
        isOpen={showConfigModal}
        onClose={handleCloseConfigModal}
        onSave={handleSave}
        onDelete={handleDelete}
        library={selectedLibrary}
      />
    </div>
  );
};
