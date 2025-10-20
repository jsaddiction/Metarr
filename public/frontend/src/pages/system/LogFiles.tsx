import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const LogFiles: React.FC = () => {
  return (
    <div className="content-spacing">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Application Logs</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="text-secondary space-y-2">
                <li>• General application activity</li>
                <li>• Webhook processing logs</li>
                <li>• Metadata provider interactions</li>
                <li>• Database operation logs</li>
                <li>• User authentication events</li>
                <li>• Configuration change tracking</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Error & Debug Logs</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="text-secondary space-y-2">
                <li>• Error messages and stack traces</li>
                <li>• Performance monitoring data</li>
                <li>• API request/response logging</li>
                <li>• System resource usage</li>
                <li>• Network connectivity issues</li>
                <li>• Debug information for troubleshooting</li>
              </ul>
            </CardContent>
          </Card>
      </div>
    </div>
  );
};