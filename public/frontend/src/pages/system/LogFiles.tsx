import React from 'react';

export const LogFiles: React.FC = () => {
  return (
    <div className="content-spacing">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card">
            <div className="card-body">
              <h3 className="text-lg text-primary mb-3">Application Logs</h3>
              <ul className="text-secondary">
                <li>• General application activity</li>
                <li>• Webhook processing logs</li>
                <li>• Metadata provider interactions</li>
                <li>• Database operation logs</li>
                <li>• User authentication events</li>
                <li>• Configuration change tracking</li>
              </ul>
            </div>
          </div>

          <div className="card">
            <div className="card-body">
              <h3 className="text-lg text-primary mb-3">Error & Debug Logs</h3>
              <ul className="text-secondary">
                <li>• Error messages and stack traces</li>
                <li>• Performance monitoring data</li>
                <li>• API request/response logging</li>
                <li>• System resource usage</li>
                <li>• Network connectivity issues</li>
                <li>• Debug information for troubleshooting</li>
              </ul>
            </div>
          </div>
      </div>
    </div>
  );
};