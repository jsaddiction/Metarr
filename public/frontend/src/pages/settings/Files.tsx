import React from 'react';

export const Files: React.FC = () => {
  return (
    <div className="content-spacing">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card">
            <div className="card-body">
              <h3 className="text-lg text-primary mb-3">Naming Conventions</h3>
              <ul className="text-secondary">
                <li>• Movie file naming patterns</li>
                <li>• TV series and episode formats</li>
                <li>• Music album and track naming</li>
                <li>• Special character handling</li>
                <li>• Multi-part media naming</li>
                <li>• Custom naming templates</li>
              </ul>
            </div>
          </div>

          <div className="card">
            <div className="card-body">
              <h3 className="text-lg text-primary mb-3">File Organization</h3>
              <ul className="text-secondary">
                <li>• Directory structure preferences</li>
                <li>• Folder creation rules</li>
                <li>• File sorting and categorization</li>
                <li>• Duplicate file handling</li>
                <li>• Archive extraction settings</li>
                <li>• Cleanup and maintenance rules</li>
              </ul>
            </div>
          </div>

          <div className="card">
            <div className="card-body">
              <h3 className="text-lg text-primary mb-3">Metadata Files</h3>
              <ul className="text-secondary">
                <li>• NFO file generation settings</li>
                <li>• Sidecar file preferences</li>
                <li>• Subtitle file handling</li>
                <li>• Theme and trailer file management</li>
                <li>• Artwork file organization</li>
                <li>• Metadata embedding options</li>
              </ul>
            </div>
          </div>

          <div className="card">
            <div className="card-body">
              <h3 className="text-lg text-primary mb-3">Watch Folders & Monitoring</h3>
              <ul className="text-secondary">
                <li>• File system monitoring settings</li>
                <li>• Watch folder configuration</li>
                <li>• Auto-import preferences</li>
                <li>• File change detection</li>
                <li>• Processing queue management</li>
                <li>• Error handling and retry logic</li>
              </ul>
            </div>
          </div>
      </div>
    </div>
  );
};