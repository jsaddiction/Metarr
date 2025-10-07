import React from 'react';

export const RunningJobs: React.FC = () => {
  return (
    <div className="content-spacing">
      <div className="card">
        <div className="card-body">
          <h3 className="text-lg text-primary mb-3">Running Jobs</h3>
          <ul className="text-secondary">
            <li>• Active webhook processing tasks</li>
            <li>• In-progress metadata fetches</li>
            <li>• Current provider API requests</li>
            <li>• Ongoing image downloads</li>
            <li>• Real-time job status monitoring</li>
            <li>• Queue position and priority</li>
            <li>• Estimated completion times</li>
            <li>• Retry attempts and status</li>
          </ul>
        </div>
      </div>
    </div>
  );
};