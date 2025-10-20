import React, { useState } from 'react';
import { ViewControls, ViewMode } from '../components/ui/ViewControls';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const Music: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('table');

  const handleRefresh = () => {
    console.log('Refreshing music metadata...');
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
          searchPlaceholder="Filter music..."
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
            <CardTitle>Music Metadata Features</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-secondary space-y-2">
              <li>• Album and track metadata completeness</li>
              <li>• Album artwork and artist images</li>
              <li>• Integration with Lidarr webhooks</li>
              <li>• MusicBrainz data enrichment</li>
              <li>• Genre and release information</li>
              <li>• Metadata scoring and quality tracking</li>
            </ul>

            <div className="mt-4">
              <p className="text-muted text-sm">
                This interface will be implemented to work with Lidarr for comprehensive
                music library metadata management and artwork collection.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
};