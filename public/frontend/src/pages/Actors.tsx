import React, { useState } from 'react';
import { ViewControls, ViewMode } from '../components/ui/ViewControls';

export const Actors: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('table');

  const handleRefresh = () => {
    console.log('Refreshing actor data...');
  };

  const handleSortChange = (sort: string) => {
    console.log('Sort changed:', sort);
  };

  const handleFilterChange = (filter: string) => {
    console.log('Filter changed:', filter);
  };

  return (
    <>
      <div className="full-width-section">
        <ViewControls
          searchPlaceholder="Filter actors..."
          searchValue={searchTerm}
          onSearchChange={setSearchTerm}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onRefresh={handleRefresh}
          onSortChange={handleSortChange}
          onFilterChange={handleFilterChange}
        />
      </div>

      <div className="content-spacing">
        <div className="card">
          <div className="card-body">
            <h3 className="text-lg text-primary mb-3">Actor Management Features</h3>
            <ul className="text-secondary">
              <li>• Actor profiles with biographical information</li>
              <li>• Profile images and headshots</li>
              <li>• Filmography and role information</li>
              <li>• Metadata completeness tracking</li>
              <li>• Centralized image collection for all movies/series</li>
            </ul>

            <div className="mt-4">
              <p className="text-muted text-sm">
                This interface will manage actor data collected from TMDB and other providers,
                ensuring consistent actor information across your entire media library.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};