import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const Files: React.FC = () => {
  return (
    <div className="content-spacing">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Naming Conventions</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="text-secondary space-y-2">
                <li>• Movie file naming patterns</li>
                <li>• TV series and episode formats</li>
                <li>• Music album and track naming</li>
                <li>• Special character handling</li>
                <li>• Multi-part media naming</li>
                <li>• Custom naming templates</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>File Organization</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="text-secondary space-y-2">
                <li>• Directory structure preferences</li>
                <li>• Folder creation rules</li>
                <li>• File sorting and categorization</li>
                <li>• Duplicate file handling</li>
                <li>• Archive extraction settings</li>
                <li>• Cleanup and maintenance rules</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Metadata Files</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="text-secondary space-y-2">
                <li>• NFO file generation settings</li>
                <li>• Sidecar file preferences</li>
                <li>• Subtitle file handling</li>
                <li>• Theme and trailer file management</li>
                <li>• Artwork file organization</li>
                <li>• Metadata embedding options</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Watch Folders & Monitoring</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="text-secondary space-y-2">
                <li>• File system monitoring settings</li>
                <li>• Watch folder configuration</li>
                <li>• Auto-import preferences</li>
                <li>• File change detection</li>
                <li>• Processing queue management</li>
                <li>• Error handling and retry logic</li>
              </ul>
            </CardContent>
          </Card>
      </div>
    </div>
  );
};
