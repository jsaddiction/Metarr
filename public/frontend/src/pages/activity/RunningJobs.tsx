import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const RunningJobs: React.FC = () => {
  return (
    <div className="content-spacing">
      <Card>
        <CardHeader>
          <CardTitle>Running Jobs</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="text-secondary space-y-2">
            <li>• Active webhook processing tasks</li>
            <li>• In-progress metadata fetches</li>
            <li>• Current provider API requests</li>
            <li>• Ongoing image downloads</li>
            <li>• Real-time job status monitoring</li>
            <li>• Queue position and priority</li>
            <li>• Estimated completion times</li>
            <li>• Retry attempts and status</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
};
