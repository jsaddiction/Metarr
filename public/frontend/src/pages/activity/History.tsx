import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const History: React.FC = () => {
  return (
    <div className="content-spacing">
      <Card>
        <CardHeader>
          <CardTitle>Activity History</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="text-secondary space-y-2">
            <li>• Completed webhook processing logs</li>
            <li>• Historical metadata updates</li>
            <li>• Past provider API calls</li>
            <li>• Resolved errors and warnings</li>
            <li>• Previous system events</li>
            <li>• User action timeline</li>
            <li>• Job completion history with timestamps</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
};
