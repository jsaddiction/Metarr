import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const Events: React.FC = () => {
  return (
    <div className="content-spacing">
      <Card>
        <CardHeader>
          <CardTitle>Event Monitoring</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="text-secondary space-y-2">
            <li>• Webhook processing events</li>
            <li>• Metadata update notifications</li>
            <li>• System error alerts</li>
            <li>• Provider API status changes</li>
            <li>• User action tracking</li>
            <li>• Performance threshold breaches</li>
            <li>• Security and authentication events</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
};