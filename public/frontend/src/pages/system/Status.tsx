import React from 'react';

export const Status: React.FC = () => {
  return (
    <div className="content-spacing">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card">
            <div className="card-body">
              <h3 className="text-lg text-primary mb-3">System Health</h3>
              <ul className="text-secondary">
                <li>• Application uptime and availability</li>
                <li>• Memory and CPU usage monitoring</li>
                <li>• Database connection status</li>
                <li>• External API connectivity</li>
                <li>• Disk space utilization</li>
                <li>• Network performance metrics</li>
              </ul>
            </div>
          </div>

          <div className="card">
            <div className="card-body">
              <h3 className="text-lg text-primary mb-3">Service Status</h3>
              <ul className="text-secondary">
                <li>• Webhook processing service</li>
                <li>• Metadata provider APIs</li>
                <li>• Background job scheduler</li>
                <li>• Image processing service</li>
                <li>• Database maintenance tasks</li>
                <li>• File system operations</li>
              </ul>
            </div>
          </div>
      </div>
    </div>
  );
};