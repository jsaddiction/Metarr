import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGripVertical, faSave, faUndo, faCheck } from '@fortawesome/free-solid-svg-icons';
import { ProviderWithMetadata } from '../../types/provider';

interface ProviderPriorityEditorProps {
  providers: ProviderWithMetadata[];
  initialOrder: string[];
  initialDisabled?: string[];
  onSave: (providerOrder: string[], disabled: string[]) => Promise<void>;
  fieldName: string;
  category: 'metadata' | 'images';
}

export const ProviderPriorityEditor: React.FC<ProviderPriorityEditorProps> = ({
  providers,
  initialOrder,
  initialDisabled = [],
  onSave,
  fieldName,
  category,
}) => {
  const [providerOrder, setProviderOrder] = useState<string[]>(initialOrder);
  const [disabled, setDisabled] = useState<string[]>(initialDisabled);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Update when initial values change
  useEffect(() => {
    setProviderOrder(initialOrder);
    setDisabled(initialDisabled);
  }, [initialOrder, initialDisabled]);

  const getProviderDisplayName = (name: string) => {
    const provider = providers.find(p => p.config.providerName === name);
    return provider?.metadata.displayName || name;
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.effectAllowed = 'move';
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    if (draggedIndex === null || draggedIndex === index) return;

    const newOrder = [...providerOrder];
    const draggedItem = newOrder[draggedIndex];
    newOrder.splice(draggedIndex, 1);
    newOrder.splice(index, 0, draggedItem);

    setProviderOrder(newOrder);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const handleToggleDisabled = (providerName: string) => {
    if (disabled.includes(providerName)) {
      setDisabled(disabled.filter(d => d !== providerName));
    } else {
      setDisabled([...disabled, providerName]);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      await onSave(providerOrder, disabled);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (error) {
      console.error('Failed to save priority:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setProviderOrder(initialOrder);
    setDisabled(initialDisabled);
  };

  const hasChanges =
    JSON.stringify(providerOrder) !== JSON.stringify(initialOrder) ||
    JSON.stringify(disabled.sort()) !== JSON.stringify(initialDisabled.sort());

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-neutral-200">
            {fieldName.charAt(0).toUpperCase() + fieldName.slice(1)} Priority
          </h3>
          <p className="text-xs text-neutral-400 mt-1">
            Drag to reorder • Uncheck to disable
          </p>
        </div>
        <div className="flex gap-2">
          {hasChanges && (
            <button
              onClick={handleReset}
              disabled={isSaving}
              className="px-3 py-1.5 text-xs font-medium text-neutral-300 hover:text-white bg-neutral-700 hover:bg-neutral-600 rounded transition-colors disabled:opacity-50"
              title="Reset to saved values"
            >
              <FontAwesomeIcon icon={faUndo} className="mr-1.5" />
              Reset
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
              saveSuccess
                ? 'bg-green-600 text-white'
                : 'bg-primary-600 hover:bg-primary-500 text-white disabled:opacity-50 disabled:cursor-not-allowed'
            }`}
          >
            {isSaving ? (
              <>
                <FontAwesomeIcon icon={faGripVertical} className="mr-1.5 animate-spin" />
                Saving...
              </>
            ) : saveSuccess ? (
              <>
                <FontAwesomeIcon icon={faCheck} className="mr-1.5" />
                Saved!
              </>
            ) : (
              <>
                <FontAwesomeIcon icon={faSave} className="mr-1.5" />
                Save
              </>
            )}
          </button>
        </div>
      </div>

      {/* Draggable Provider List */}
      <div className="space-y-1">
        {providerOrder.map((providerName, index) => {
          const isDisabled = disabled.includes(providerName);
          const isDragging = draggedIndex === index;

          return (
            <div
              key={providerName}
              onDragOver={(e) => handleDragOver(e, index)}
              className={`flex items-center gap-3 p-3 rounded border transition-all ${
                isDragging
                  ? 'bg-primary-900/30 border-primary-500 scale-105 opacity-50'
                  : isDisabled
                  ? 'bg-neutral-800/30 border-neutral-700/50 opacity-60'
                  : 'bg-neutral-800 border-neutral-700 hover:border-neutral-600'
              }`}
            >
              {/* Priority Number */}
              <div className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                isDisabled
                  ? 'bg-neutral-700 text-neutral-500'
                  : 'bg-primary-600 text-white'
              }`}>
                {index + 1}
              </div>

              {/* Drag Handle */}
              <div
                draggable={!isDisabled}
                onDragStart={(e) => handleDragStart(e, index)}
                onDragEnd={handleDragEnd}
                className={`p-1 -m-1 ${
                  isDisabled
                    ? 'text-neutral-600 cursor-not-allowed'
                    : 'text-neutral-400 hover:text-neutral-300 cursor-grab active:cursor-grabbing'
                }`}
              >
                <FontAwesomeIcon icon={faGripVertical} className="pointer-events-none" />
              </div>

              {/* Provider Name */}
              <div className="flex-1">
                <span className={`text-sm font-medium ${
                  isDisabled ? 'text-neutral-500' : 'text-neutral-200'
                }`}>
                  {getProviderDisplayName(providerName)}
                </span>
              </div>

              {/* Enable/Disable Checkbox */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!isDisabled}
                  onChange={() => handleToggleDisabled(providerName)}
                  className="w-4 h-4 rounded border-neutral-600 bg-neutral-700 text-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-offset-0"
                />
                <span className="text-xs text-neutral-400">Enabled</span>
              </label>
            </div>
          );
        })}
      </div>

      {/* Info */}
      {disabled.length > 0 && (
        <div className="p-3 bg-yellow-900/20 border border-yellow-800 rounded">
          <p className="text-xs text-yellow-300">
            <strong>Note:</strong> {disabled.length} provider{disabled.length > 1 ? 's' : ''} disabled for this {category} field.
            {' '}Disabled providers will be skipped during automation.
          </p>
        </div>
      )}
    </div>
  );
};
