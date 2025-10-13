import React, { useState, useRef, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faRefresh,
  faTableList,
  faTableCells,
  faListUl,
  faSort,
  faFilter,
  faSearch,
  faEye,
  faChevronDown
} from '@fortawesome/free-solid-svg-icons';

export type ViewMode = 'table' | 'poster' | 'overview';

interface ViewControlsProps {
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  showRefresh?: boolean;
  showViewOptions?: boolean;
  showSort?: boolean;
  showFilter?: boolean;
  viewMode?: ViewMode;
  onRefresh?: () => void;
  onViewModeChange?: (mode: ViewMode) => void;
  onSortChange?: (sort: string) => void;
  onFilterChange?: (filter: string) => void;
  children?: React.ReactNode;
}

export const ViewControls: React.FC<ViewControlsProps> = ({
  searchPlaceholder = 'Filter...',
  searchValue = '',
  onSearchChange,
  showRefresh = true,
  showViewOptions = true,
  showSort = true,
  showFilter = true,
  viewMode = 'table',
  onRefresh,
  onViewModeChange,
  onSortChange,
  onFilterChange,
  children
}) => {
  const [showViewDropdown, setShowViewDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowViewDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const getViewIcon = (mode: ViewMode) => {
    switch (mode) {
      case 'poster':
        return faTableCells;
      case 'overview':
        return faListUl;
      case 'table':
      default:
        return faTableList;
    }
  };

  const getViewLabel = (mode: ViewMode) => {
    switch (mode) {
      case 'poster':
        return 'Posters';
      case 'overview':
        return 'Overview';
      case 'table':
      default:
        return 'Table';
    }
  };

  const handleViewModeSelect = (mode: ViewMode) => {
    onViewModeChange?.(mode);
    setShowViewDropdown(false);
  };
  return (
    <div className="sticky top-16 z-30 bg-neutral-800 border-b border-neutral-700 px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <FontAwesomeIcon icon={faSearch} className="h-4 w-4 text-neutral-400" aria-hidden="true" />
            </div>
            <input
              type="text"
              placeholder={searchPlaceholder}
              className="form-input pl-10 pr-4 py-2 w-64 bg-neutral-700 border-neutral-600 text-white placeholder-neutral-400"
              value={searchValue}
              onChange={(e) => onSearchChange?.(e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {children}

          <div className="flex items-center space-x-1">
            {showRefresh && (
              <button
                className="btn btn-ghost p-2"
                title="Refresh"
                onClick={onRefresh}
                aria-label="Refresh view"
              >
                <FontAwesomeIcon icon={faRefresh} aria-hidden="true" />
              </button>
            )}

            {showViewOptions && (
              <div className="relative" ref={dropdownRef}>
                <button
                  className="btn btn-ghost p-2 flex items-center space-x-1"
                  title="View Options"
                  onClick={() => setShowViewDropdown(!showViewDropdown)}
                  aria-label="View options"
                  aria-expanded={showViewDropdown}
                >
                  <FontAwesomeIcon icon={faEye} aria-hidden="true" />
                  <FontAwesomeIcon icon={faChevronDown} className="h-3 w-3" aria-hidden="true" />
                </button>

                {showViewDropdown && (
                  <div className="absolute right-0 mt-2 w-48 bg-neutral-800 border border-neutral-700 rounded-md shadow-lg z-50" role="menu">
                    <div className="py-1">
                      <button
                        className={`w-full text-left px-4 py-2 text-sm flex items-center space-x-2 hover:bg-neutral-700 ${
                          viewMode === 'table'
                            ? 'bg-primary-500 text-white'
                            : 'text-neutral-300'
                        }`}
                        onClick={() => handleViewModeSelect('table')}
                        role="menuitem"
                      >
                        <FontAwesomeIcon icon={faTableList} aria-hidden="true" />
                        <span>Table</span>
                      </button>
                      <button
                        className={`w-full text-left px-4 py-2 text-sm flex items-center space-x-2 hover:bg-neutral-700 ${
                          viewMode === 'poster'
                            ? 'bg-primary-500 text-white'
                            : 'text-neutral-300'
                        }`}
                        onClick={() => handleViewModeSelect('poster')}
                        role="menuitem"
                      >
                        <FontAwesomeIcon icon={faTableCells} aria-hidden="true" />
                        <span>Posters</span>
                      </button>
                      <button
                        className={`w-full text-left px-4 py-2 text-sm flex items-center space-x-2 hover:bg-neutral-700 ${
                          viewMode === 'overview'
                            ? 'bg-primary-500 text-white'
                            : 'text-neutral-300'
                        }`}
                        onClick={() => handleViewModeSelect('overview')}
                        role="menuitem"
                      >
                        <FontAwesomeIcon icon={faListUl} aria-hidden="true" />
                        <span>Overview</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {showSort && (
              <button
                className="btn btn-ghost p-2"
                title="Sort Options"
                onClick={() => onSortChange?.('toggle')}
                aria-label="Sort options"
              >
                <FontAwesomeIcon icon={faSort} aria-hidden="true" />
              </button>
            )}

            {showFilter && (
              <button
                className="btn btn-ghost p-2"
                title="Filter Options"
                onClick={() => onFilterChange?.('toggle')}
                aria-label="Filter options"
              >
                <FontAwesomeIcon icon={faFilter} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};