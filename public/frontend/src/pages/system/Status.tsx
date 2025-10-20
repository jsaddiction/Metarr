import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const Status: React.FC = () => {
  return (
    <div className="content-spacing">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>System Health</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="text-secondary space-y-2">
                <li>• Application uptime and availability</li>
                <li>• Memory and CPU usage monitoring</li>
                <li>• Database connection status</li>
                <li>• External API connectivity</li>
                <li>• Disk space utilization</li>
                <li>• Network performance metrics</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Service Status</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="text-secondary space-y-2">
                <li>• Webhook processing service</li>
                <li>• Metadata provider APIs</li>
                <li>• Background job scheduler</li>
                <li>• Image processing service</li>
                <li>• Database maintenance tasks</li>
                <li>• File system operations</li>
              </ul>
            </CardContent>
          </Card>
      </div>
    </div>
  );
};