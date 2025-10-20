import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const General: React.FC = () => {
  return (
    <div className="content-spacing">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Application Settings</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="text-secondary space-y-2">
                <li>• Default language and localization</li>
                <li>• Theme and UI preferences</li>
                <li>• Date and time formats</li>
                <li>• Default view modes and layouts</li>
                <li>• Auto-refresh intervals</li>
                <li>• Performance optimization settings</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Database & Storage</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="text-secondary space-y-2">
                <li>• Database connection settings</li>
                <li>• Storage paths and directories</li>
                <li>• Backup and restore configuration</li>
                <li>• Data retention policies</li>
                <li>• Cache management settings</li>
                <li>• Import/export preferences</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Logging & Monitoring</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="text-secondary space-y-2">
                <li>• Log levels and verbosity</li>
                <li>• Log retention and rotation</li>
                <li>• Error reporting settings</li>
                <li>• Performance monitoring</li>
                <li>• Debug mode configuration</li>
                <li>• Audit trail settings</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Security & Authentication</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="text-secondary space-y-2">
                <li>• User authentication methods</li>
                <li>• API key management</li>
                <li>• Session timeout settings</li>
                <li>• HTTPS and SSL configuration</li>
                <li>• Access control and permissions</li>
                <li>• Two-factor authentication</li>
              </ul>
            </CardContent>
          </Card>
      </div>
    </div>
  );
};