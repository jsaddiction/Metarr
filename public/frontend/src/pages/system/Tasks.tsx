import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const Tasks: React.FC = () => {
  return (
    <div className="content-spacing">
      <Card>
        <CardHeader>
          <CardTitle>Task Management</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="text-secondary space-y-2">
            <li>• Scheduled metadata refresh jobs</li>
            <li>• Image download and processing queue</li>
            <li>• Database maintenance tasks</li>
            <li>• Webhook processing status</li>
            <li>• Provider API sync operations</li>
            <li>• Media library update tasks</li>
            <li>• Background cleanup operations</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
};