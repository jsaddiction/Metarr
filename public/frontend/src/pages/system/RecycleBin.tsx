import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faTrash,
  faSpinner,
  faBroom,
  faExclamationTriangle,
  faInfoCircle,
} from '@fortawesome/free-solid-svg-icons';
import {
  useRecycleBinStats,
  useCleanupExpired,
  useCleanupPending,
  useEmptyRecycleBin,
} from '../../hooks/useRecycleBin';
import { useConfirm } from '../../hooks/useConfirm';

export const RecycleBin: React.FC = () => {
  // Accessible confirmation dialog
  const { confirm, ConfirmDialog } = useConfirm();

  const { data: stats, isLoading } = useRecycleBinStats();
  const cleanupExpiredMutation = useCleanupExpired();
  const cleanupPendingMutation = useCleanupPending();
  const emptyRecycleBinMutation = useEmptyRecycleBin();
  const [processingAction, setProcessingAction] = useState<string | null>(null);

  const handleCleanupExpired = async () => {
    const confirmed = await confirm({
      title: 'Clean Up Expired Files',
      description: 'Remove all expired files from the recycle bin? This cannot be undone.',
      confirmText: 'Clean Up',
      cancelText: 'Cancel',
      variant: 'destructive',
    });

    if (!confirmed) {
      return;
    }

    setProcessingAction('expired');
    try {
      await cleanupExpiredMutation.mutateAsync();
      alert('Expired files cleaned up successfully');
    } catch (error) {
      console.error('Failed to cleanup expired files:', error);
      alert('Failed to cleanup expired files');
    } finally {
      setProcessingAction(null);
    }
  };

  const handleCleanupPending = async () => {
    const confirmed = await confirm({
      title: 'Clean Up Pending Items',
      description: 'Clean up pending recycle items (failed moves)? This will remove database entries.',
      confirmText: 'Clean Up',
      cancelText: 'Cancel',
    });

    if (!confirmed) {
      return;
    }

    setProcessingAction('pending');
    try {
      await cleanupPendingMutation.mutateAsync();
      alert('Pending items cleaned up successfully');
    } catch (error) {
      console.error('Failed to cleanup pending items:', error);
      alert('Failed to cleanup pending items');
    } finally {
      setProcessingAction(null);
    }
  };

  const handleEmptyRecycleBin = async () => {
    // First confirmation
    const firstConfirmed = await confirm({
      title: 'Empty Recycle Bin',
      description: 'Are you sure you want to PERMANENTLY DELETE all files in the recycle bin? This action cannot be undone!',
      confirmText: 'Continue',
      cancelText: 'Cancel',
      variant: 'destructive',
    });

    if (!firstConfirmed) {
      return;
    }

    // Second confirmation for safety
    const secondConfirmed = await confirm({
      title: 'Final Confirmation',
      description: 'This will delete ALL recycled files immediately, regardless of age. Are you absolutely sure?',
      confirmText: 'Yes, Delete All',
      cancelText: 'Cancel',
      variant: 'destructive',
    });

    if (!secondConfirmed) {
      return;
    }

    setProcessingAction('empty');
    try {
      const result = await emptyRecycleBinMutation.mutateAsync();
      alert(`Recycle bin emptied. ${result.data.deletedCount} files permanently deleted.`);
    } catch (error) {
      console.error('Failed to empty recycle bin:', error);
      alert('Failed to empty recycle bin');
    } finally {
      setProcessingAction(null);
    }
  };

  if (isLoading) {
    return (
      <div className="content-spacing">
        <h1 className="text-2xl font-bold text-white mb-6">Recycle Bin</h1>
        <div className="flex items-center justify-center py-12">
          <FontAwesomeIcon icon={faSpinner} className="text-primary animate-spin mr-2" />
          <span className="text-neutral-400">Loading recycle bin stats...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="content-spacing">
      <h1 className="text-2xl font-bold text-white mb-6">Recycle Bin</h1>

      {/* Info Banner */}
      <div className="mb-6 p-4 bg-info/10 border border-info/30 rounded-lg">
        <div className="flex items-start gap-3">
          <FontAwesomeIcon icon={faInfoCircle} className="text-info text-xl mt-0.5" />
          <div>
            <h3 className="text-white font-medium mb-1">About the Recycle Bin</h3>
            <p className="text-sm text-neutral-300">
              Files deleted by Metarr are moved to the recycle bin instead of being immediately removed.
              Recycled files are kept for 30 days before automatic cleanup. You can restore or permanently
              delete files from individual movie/episode pages.
            </p>
          </div>
        </div>
      </div>

      {/* Statistics Card */}
      <div className="card mb-6">
        <div className="card-body">
          <h2 className="text-xl font-semibold text-white mb-4">Statistics</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-neutral-800/50 border border-neutral-700 rounded-lg p-4">
              <div className="text-sm text-neutral-400 mb-1">Total Files</div>
              <div className="text-2xl font-bold text-white">{stats?.totalFiles || 0}</div>
            </div>

            <div className="bg-neutral-800/50 border border-neutral-700 rounded-lg p-4">
              <div className="text-sm text-neutral-400 mb-1">Total Size</div>
              <div className="text-2xl font-bold text-white">{stats?.totalSizeGB || '0.00'} GB</div>
            </div>

            <div className="bg-neutral-800/50 border border-neutral-700 rounded-lg p-4">
              <div className="text-sm text-neutral-400 mb-1">Pending Deletion</div>
              <div className="text-2xl font-bold text-warning">{stats?.pendingDeletion || 0}</div>
              {stats && stats.pendingDeletion > 0 && (
                <div className="text-xs text-neutral-500 mt-1">Failed moves</div>
              )}
            </div>

            <div className="bg-neutral-800/50 border border-neutral-700 rounded-lg p-4">
              <div className="text-sm text-neutral-400 mb-1">Oldest Entry</div>
              <div className="text-sm font-medium text-white">
                {stats?.oldestEntry
                  ? new Date(stats.oldestEntry).toLocaleDateString()
                  : 'N/A'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Actions Card */}
      <div className="card">
        <div className="card-body">
          <h2 className="text-xl font-semibold text-white mb-4">Maintenance Actions</h2>

          <div className="space-y-4">
            {/* Cleanup Expired */}
            <div className="bg-neutral-800/50 border border-neutral-700 rounded-lg p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h3 className="text-white font-medium mb-1">Cleanup Expired Files</h3>
                  <p className="text-sm text-neutral-400">
                    Permanently delete files that have been in the recycle bin for more than 30 days.
                    This operation runs automatically during scheduled maintenance.
                  </p>
                </div>
                <button
                  onClick={handleCleanupExpired}
                  disabled={processingAction !== null}
                  className="btn btn-secondary btn-sm whitespace-nowrap"
                >
                  {processingAction === 'expired' ? (
                    <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
                  ) : (
                    <FontAwesomeIcon icon={faBroom} />
                  )}
                  <span className="ml-2">Cleanup Expired</span>
                </button>
              </div>
            </div>

            {/* Cleanup Pending */}
            {stats && stats.pendingDeletion > 0 && (
              <div className="bg-warning/10 border border-warning/30 rounded-lg p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <h3 className="text-white font-medium mb-1 flex items-center gap-2">
                      <FontAwesomeIcon icon={faExclamationTriangle} className="text-warning" />
                      Cleanup Pending Items
                    </h3>
                    <p className="text-sm text-neutral-400">
                      Remove {stats.pendingDeletion} failed recycle operation{stats.pendingDeletion !== 1 ? 's' : ''} from the database.
                      These are files that were marked for deletion but the file move operation failed.
                    </p>
                  </div>
                  <button
                    onClick={handleCleanupPending}
                    disabled={processingAction !== null}
                    className="btn btn-warning btn-sm whitespace-nowrap"
                  >
                    {processingAction === 'pending' ? (
                      <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
                    ) : (
                      <FontAwesomeIcon icon={faBroom} />
                    )}
                    <span className="ml-2">Cleanup Pending</span>
                  </button>
                </div>
              </div>
            )}

            {/* Empty Recycle Bin */}
            <div className="bg-error/10 border border-error/30 rounded-lg p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h3 className="text-white font-medium mb-1 flex items-center gap-2">
                    <FontAwesomeIcon icon={faExclamationTriangle} className="text-error" />
                    Empty Recycle Bin
                  </h3>
                  <p className="text-sm text-neutral-400">
                    <strong className="text-error">Danger:</strong> Permanently delete ALL files in
                    the recycle bin, regardless of age. This action cannot be undone. Files cannot be
                    restored after this operation.
                  </p>
                </div>
                <button
                  onClick={handleEmptyRecycleBin}
                  disabled={processingAction !== null || !stats || stats.totalFiles === 0}
                  className="btn btn-error btn-sm whitespace-nowrap"
                >
                  {processingAction === 'empty' ? (
                    <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
                  ) : (
                    <FontAwesomeIcon icon={faTrash} />
                  )}
                  <span className="ml-2">Empty Bin</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Accessible Confirmation Dialog */}
      <ConfirmDialog />
    </div>
  );
};
