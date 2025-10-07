import React from 'react';

export const BlockedAssets: React.FC = () => {
  return (
    <div className="content-spacing">
      <div className="card">
        <div className="card-body">
          <h3 className="text-lg text-primary mb-3">Blocked Assets</h3>
          <ul className="text-secondary">
            <li>• Failed metadata downloads</li>
            <li>• Unavailable provider resources</li>
            <li>• Missing or broken image URLs</li>
            <li>• API rate-limited requests</li>
            <li>• Corrupted file downloads</li>
            <li>• Retry queue management</li>
            <li>• Manual override options</li>
            <li>• Error diagnostics and logs</li>
          </ul>
        </div>
      </div>
    </div>
  );
};