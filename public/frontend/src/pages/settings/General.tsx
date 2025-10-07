import React from 'react';

export const General: React.FC = () => {
  return (
    <div className="content-spacing">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card">
            <div className="card-body">
              <h3 className="text-lg text-primary mb-3">Application Settings</h3>
              <ul className="text-secondary">
                <li>• Default language and localization</li>
                <li>• Theme and UI preferences</li>
                <li>• Date and time formats</li>
                <li>• Default view modes and layouts</li>
                <li>• Auto-refresh intervals</li>
                <li>• Performance optimization settings</li>
              </ul>
            </div>
          </div>

          <div className="card">
            <div className="card-body">
              <h3 className="text-lg text-primary mb-3">Database & Storage</h3>
              <ul className="text-secondary">
                <li>• Database connection settings</li>
                <li>• Storage paths and directories</li>
                <li>• Backup and restore configuration</li>
                <li>• Data retention policies</li>
                <li>• Cache management settings</li>
                <li>• Import/export preferences</li>
              </ul>
            </div>
          </div>

          <div className="card">
            <div className="card-body">
              <h3 className="text-lg text-primary mb-3">Logging & Monitoring</h3>
              <ul className="text-secondary">
                <li>• Log levels and verbosity</li>
                <li>• Log retention and rotation</li>
                <li>• Error reporting settings</li>
                <li>• Performance monitoring</li>
                <li>• Debug mode configuration</li>
                <li>• Audit trail settings</li>
              </ul>
            </div>
          </div>

          <div className="card">
            <div className="card-body">
              <h3 className="text-lg text-primary mb-3">Security & Authentication</h3>
              <ul className="text-secondary">
                <li>• User authentication methods</li>
                <li>• API key management</li>
                <li>• Session timeout settings</li>
                <li>• HTTPS and SSL configuration</li>
                <li>• Access control and permissions</li>
                <li>• Two-factor authentication</li>
              </ul>
            </div>
          </div>
      </div>
    </div>
  );
};