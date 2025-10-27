import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUndo, faTrash, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { useRecycleBinForMovie, useRestoreFile, usePermanentlyDeleteFile } from '../../hooks/useRecycleBin';
import { useConfirm } from '../../hooks/useConfirm';

interface RecycleBinTabProps {
  movieId: number;
}

export const RecycleBinTab: React.FC<RecycleBinTabProps> = ({ movieId }) => {
  const { confirm, ConfirmDialog } = useConfirm();
  const { data: recycleBinFiles, isLoading } = useRecycleBinForMovie(movieId);
  const restoreMutation = useRestoreFile();
  const deleteMutation = usePermanentlyDeleteFile();
  const [processingId, setProcessingId] = useState<number | null>(null);

  const handleRestore = async (recycleId: number, fileName: string) => {
    const confirmed = await confirm({
      title: 'Restore File',
      description: `Restore "${fileName}" to its original location?`,
      confirmText: 'Restore',
      cancelText: 'Cancel',
    });

    if (!confirmed) {
      return;
    }

    setProcessingId(recycleId);
    try {
      await restoreMutation.mutateAsync(recycleId);
    } catch (error) {
      console.error('Failed to restore file:', error);
      alert('Failed to restore file');
    } finally {
      setProcessingId(null);
    }
  };

  const handlePermanentDelete = async (recycleId: number, fileName: string) => {
    const confirmed = await confirm({
      title: 'Permanently Delete File',
      description: `Permanently delete "${fileName}"? This cannot be undone!`,
      confirmText: 'Delete Permanently',
      cancelText: 'Cancel',
      variant: 'destructive',
    });

    if (!confirmed) {
      return;
    }

    setProcessingId(recycleId);
    try {
      await deleteMutation.mutateAsync(recycleId);
    } catch (error) {
      console.error('Failed to delete file:', error);
      alert('Failed to delete file');
    } finally {
      setProcessingId(null);
    }
  };

  const formatFileSize = (bytes: number | null): string => {
    if (!bytes) return 'Unknown';
    const kb = bytes / 1024;
    const mb = kb / 1024;
    const gb = mb / 1024;

    if (gb >= 1) return `${gb.toFixed(2)} GB`;
    if (mb >= 1) return `${mb.toFixed(2)} MB`;
    if (kb >= 1) return `${kb.toFixed(2)} KB`;
    return `${bytes} B`;
  };

  const formatDate = (dateString: string | null): string => {
    if (!dateString) return 'Pending';
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  if (isLoading) {
    return (
      <div className="card">
        <div className="card-body">
          <div className="flex items-center justify-center py-12">
            <FontAwesomeIcon icon={faSpinner} className="text-primary animate-spin mr-2" />
            <span className="text-neutral-400">Loading recycle bin...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-body">
        <h2 className="text-xl font-semibold text-white mb-2">Recycle Bin</h2>
        <p className="text-sm text-neutral-400 mb-4">
          Files that were removed from this movie's directory. Files are kept for 30 days before permanent deletion.
        </p>

        {recycleBinFiles && recycleBinFiles.length === 0 ? (
          <div className="bg-neutral-800/50 border border-neutral-700 rounded-lg p-8 text-center">
            <p className="text-neutral-400">No recycled files for this movie</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recycleBinFiles?.map((file) => (
              <div
                key={file.id}
                className="bg-neutral-800/50 border border-neutral-700 rounded-lg p-4 hover:bg-neutral-800/70 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-white font-medium mb-1 truncate">{file.fileName}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm text-neutral-400">
                      <div>
                        <span className="text-neutral-500">Size:</span> {formatFileSize(file.fileSize)}
                      </div>
                      <div>
                        <span className="text-neutral-500">Status:</span>{' '}
                        {file.status === 'recycled' ? (
                          <span className="text-warning">Recycled</span>
                        ) : (
                          <span className="text-neutral-400">Pending</span>
                        )}
                      </div>
                      <div>
                        <span className="text-neutral-500">Recycled:</span> {formatDate(file.recycledAt)}
                      </div>
                    </div>
                    <div className="text-xs text-neutral-500 mt-2 truncate">
                      <span className="text-neutral-600">Original:</span> {file.originalPath}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={() => handleRestore(file.id, file.fileName)}
                      disabled={processingId === file.id}
                      className="btn btn-sm btn-secondary"
                      title="Restore file to original location"
                    >
                      {processingId === file.id ? (
                        <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
                      ) : (
                        <FontAwesomeIcon icon={faUndo} />
                      )}
                      <span className="hidden md:inline ml-2">Restore</span>
                    </button>

                    <button
                      onClick={() => handlePermanentDelete(file.id, file.fileName)}
                      disabled={processingId === file.id}
                      className="btn btn-sm btn-error"
                      title="Permanently delete file"
                    >
                      {processingId === file.id ? (
                        <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
                      ) : (
                        <FontAwesomeIcon icon={faTrash} />
                      )}
                      <span className="hidden md:inline ml-2">Delete</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Accessible Confirmation Dialog */}
      <ConfirmDialog />
    </div>
  );
};
