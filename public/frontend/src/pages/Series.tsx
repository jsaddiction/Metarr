import React, { useState } from 'react';
import { ViewControls, ViewMode } from '../components/ui/ViewControls';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const Series: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('table');

  const handleRefresh = () => {
    console.log('Refreshing series metadata...');
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
          searchPlaceholder="Filter series..."
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
        <Card>
          <CardHeader>
            <CardTitle>Series Metadata Features</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-secondary space-y-2">
              <li>• Series metadata completeness tracking</li>
              <li>• Season and episode information</li>
              <li>• Poster, backdrop, and episode stills</li>
              <li>• Integration with Sonarr webhooks</li>
              <li>• TVDB and TMDB data enrichment</li>
              <li>• Actor and crew information per episode</li>
              <li>• Centralized artwork collection</li>
            </ul>

            <div className="mt-4">
              <p className="text-muted text-sm">
                This interface will be implemented to work with Sonarr for comprehensive
                TV series metadata management, including detailed episode tracking and
                complete artwork collection for all seasons and episodes.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
};