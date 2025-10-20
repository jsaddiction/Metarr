import React, { useState } from 'react';
import { ViewControls, ViewMode } from '../components/ui/ViewControls';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const Artists: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('table');

  const handleRefresh = () => {
    console.log('Refreshing artist data...');
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
          searchPlaceholder="Filter artists..."
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
            <CardTitle>Artist Management Features</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-secondary space-y-2">
              <li>• Artist profiles with biographical information</li>
              <li>• Artist photos and promotional images</li>
              <li>• Discography and album artwork</li>
              <li>• Metadata completeness tracking</li>
              <li>• Integration with Lidarr for music metadata</li>
              <li>• MusicBrainz ID mapping</li>
            </ul>

            <div className="mt-4">
              <p className="text-muted text-sm">
                This interface will manage music artist data from MusicBrainz and other providers,
                ensuring consistent artist information across your music library.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
};