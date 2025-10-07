import React, { useState } from 'react';
import { ViewControls } from '../components/ui/ViewControls';

export const Activity: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');

  const handleRefresh = () => {
    console.log('Refreshing activity feed...');
  };

  return (
    <div className="content-spacing">
      <div className="card">
        <div className="card-body">
          <h3 className="text-lg text-primary mb-3">Activity Features</h3>
          <ul className="text-secondary">
            <li>• Real-time webhook processing logs</li>
            <li>• Metadata update notifications</li>
            <li>• Provider API call tracking</li>
            <li>• Error and warning alerts</li>
            <li>• System health monitoring</li>
            <li>• User action history</li>
          </ul>

          <div className="mt-4">
            <p className="text-muted text-sm">
              This interface will display real-time activity from Sonarr, Radarr, and Lidarr
              webhooks, along with metadata processing status and system health information.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};