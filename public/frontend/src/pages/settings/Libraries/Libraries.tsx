import React, { useState } from 'react';
import { PageContainer } from '@/components/ui/PageContainer';
import { LoadingState } from '@/components/ui/LoadingState/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState/EmptyState';
import { Library, LibraryFormData } from '@/types/library';
import { AddLibraryCard } from '@/components/library/AddLibraryCard';
import { LibraryCard } from '@/components/library/LibraryCard';
import { LibraryConfigModal } from '@/components/library/LibraryConfigModal';
import { ScannerSettings } from '@/components/library/ScannerSettings';
import { useLibraries, useActiveScans, useCreateLibrary, useUpdateLibrary, useDeleteLibrary, useStartLibraryScan } from '@/hooks/useLibraryScans';
import { AnimatedTabs, AnimatedTabsContent } from '@/components/ui/AnimatedTabs';

type TabType = 'libraries' | 'scanner';

export const Libraries: React.FC = () => {
  // Use TanStack Query hooks for data fetching
  const { data: libraries = [], isLoading: loading } = useLibraries();
  const activeScans = useActiveScans();

  // Mutations
  const createLibrary = useCreateLibrary();
  const updateLibrary = useUpdateLibrary();
  const deleteLibrary = useDeleteLibrary();
  const startScan = useStartLibraryScan();

  const [activeTab, setActiveTab] = useState<TabType>('libraries');
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [selectedLibrary, setSelectedLibrary] = useState<Library | undefined>();

  // Build scan progress map from active scans
  const scanProgress = new Map(
    activeScans.map(scan => [scan.libraryId, {
      libraryId: scan.libraryId,
      scanId: scan.id,
      phase: scan.status,
      progressCurrent: scan.progressCurrent || 0,
      progressTotal: scan.progressTotal || 0,
      currentFile: scan.currentFile || '',
      startedAt: scan.startedAt
    }])
  );

  const scanningLibraries = new Set(activeScans.map(scan => scan.libraryId));

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
        await updateLibrary.mutateAsync({ id: selectedLibrary.id, updates: data });
      } else {
        const newLibrary = await createLibrary.mutateAsync(data);

        // Trigger scan if requested
        if (scanAfterSave) {
          // Start scan via POST request only (no WebSocket)
          // The backend will handle any conflicts (e.g., if scan is already running)
          await startScan.mutateAsync(newLibrary.id).catch((scanError: any) => {
            // Silently ignore 409 conflicts (scan already running)
            // This is rare for newly created libraries but can happen in edge cases
            if (scanError.message?.includes('already') || scanError.message?.includes('409')) {
              console.log('Scan already running for library', newLibrary.id);
            } else {
              // Log other errors but don't block the flow
              console.error('Failed to start scan after library creation:', scanError);
            }
          });
        }
      }
      // Don't close the modal here - let the modal handle its own closing
      // after displaying the success/error result to the user
      // handleCloseConfigModal();
    } catch (error) {
      console.error('Failed to save library:', error);
      throw error;
    }
  };

  const handleScan = async (e: React.MouseEvent, libraryId: number) => {
    e.stopPropagation(); // Prevent card click

    // Check if library is already scanning (via activeScans state from WebSocket)
    const isAlreadyScanning = activeScans.some(scan => scan.libraryId === libraryId);

    if (isAlreadyScanning) {
      console.log('Library scan already in progress');
      return;
    }

    try {
      await startScan.mutateAsync(libraryId);
    } catch (error: any) {
      console.error('Failed to start scan:', error);
      // Only show alert if it's not a 409 (already scanning)
      if (!error.message?.includes('already')) {
        alert(`Failed to start scan: ${error.message}`);
      }
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteLibrary.mutateAsync(id);
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
    <PageContainer
      title="Libraries"
      subtitle="Manage your media library directories and scan for content"
    >
      <AnimatedTabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as TabType)}
        tabs={[
          { value: 'libraries', label: 'Libraries' },
          { value: 'scanner', label: 'Scanner Settings' },
        ]}
        className="mb-6"
      >
        <AnimatedTabsContent value="libraries" className="space-y-6">
          {loading ? (
            <LoadingState message="Loading libraries..." />
          ) : (
            <>
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

              {libraries.length === 0 && (
                <EmptyState
                  title="No libraries configured"
                  description="Click 'Add Library' to get started."
                />
              )}
            </>
          )}
        </AnimatedTabsContent>

        <AnimatedTabsContent value="scanner" className="space-y-6">
          <ScannerSettings />
        </AnimatedTabsContent>
      </AnimatedTabs>

      <LibraryConfigModal
        isOpen={showConfigModal}
        onClose={handleCloseConfigModal}
        onSave={handleSave}
        onDelete={handleDelete}
        library={selectedLibrary}
      />
    </PageContainer>
  );
};
