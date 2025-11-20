import React from 'react';

interface DataGridSection {
  label: string;
  value: string | number | null;
}

interface ReadOnlyDataGridProps {
  sections: DataGridSection[];
  tooltip?: string;
  className?: string;
}

/**
 * 2-column grid for displaying technical details (read-only)
 */
export const ReadOnlyDataGrid: React.FC<ReadOnlyDataGridProps> = ({ sections, tooltip, className = '' }) => {
  const formatValue = (value: string | number | null): string => {
    if (value === null || value === undefined || value === '') {
      return '-';
    }
    return String(value);
  };

  return (
    <div
      className={`rounded-lg border border-neutral-700 bg-neutral-800/30 p-3 ${className}`}
      title={tooltip}
    >
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        {sections.map((section, index) => (
          <React.Fragment key={index}>
            {/* Label */}
            <div className="text-xs font-medium text-neutral-400">
              {section.label}
            </div>
            {/* Value */}
            <div className="text-sm text-neutral-300">
              {formatValue(section.value)}
            </div>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};
