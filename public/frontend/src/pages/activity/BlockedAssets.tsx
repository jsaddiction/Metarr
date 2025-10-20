import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const BlockedAssets: React.FC = () => {
  return (
    <div className="content-spacing">
      <Card>
        <CardHeader>
          <CardTitle>Blocked Assets</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="text-secondary space-y-2">
            <li>• Failed metadata downloads</li>
            <li>• Unavailable provider resources</li>
            <li>• Missing or broken image URLs</li>
            <li>• API rate-limited requests</li>
            <li>• Corrupted file downloads</li>
            <li>• Retry queue management</li>
            <li>• Manual override options</li>
            <li>• Error diagnostics and logs</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
};
