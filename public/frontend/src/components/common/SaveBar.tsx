import React from 'react';
import { createPortal } from 'react-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPencil, faSave, faUndo } from '@fortawesome/free-solid-svg-icons';

interface SaveBarProps {
  hasChanges: boolean;
  onSave: () => void;
  onReset: () => void;
  saving?: boolean;
}

export const SaveBar: React.FC<SaveBarProps> = ({ hasChanges, onSave, onReset, saving = false }) => {
  // Render nothing if there are no changes
  if (!hasChanges) return null;

  // Create portal to render outside the normal component tree
  // This prevents re-renders of the parent component from affecting the save bar
  return createPortal(
    <div
      className="fixed bottom-0 left-0 right-0 bg-neutral-800 border-t-2 border-primary-500 px-6 py-3 flex items-center justify-between shadow-2xl z-50 animate-slide-up"
    >
      <div className="flex items-center gap-4">
        <FontAwesomeIcon icon={faPencil} className="text-primary-500" />
        <div className="flex flex-col">
          <span className="text-sm font-medium">Unsaved changes</span>
          <span className="text-xs text-neutral-400">You have modified this tab</span>
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onReset} className="btn btn-ghost btn-sm" disabled={saving}>
          <FontAwesomeIcon icon={faUndo} className="mr-1.5" />
          Reset
        </button>
        <button onClick={onSave} className="btn btn-primary btn-sm" disabled={saving}>
          <FontAwesomeIcon icon={faSave} className="mr-1.5" />
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>,
    document.body
  );
};
