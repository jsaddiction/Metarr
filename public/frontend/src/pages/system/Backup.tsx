import React from 'react';

export const Backup: React.FC = () => {
  return (
    <div className="content-spacing">
      <div className="card">
          <div className="card-body">
            <h3 className="text-lg text-primary mb-3">Backup Management</h3>
            <ul className="text-secondary">
              <li>• Automated database backups</li>
              <li>• Configuration file exports</li>
              <li>• Metadata and settings preservation</li>
              <li>• Full system restore capabilities</li>
              <li>• Scheduled backup operations</li>
              <li>• Backup verification and integrity checks</li>
              <li>• Remote backup storage options</li>
            </ul>
          </div>
      </div>
    </div>
  );
};