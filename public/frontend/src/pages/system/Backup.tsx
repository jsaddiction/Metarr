import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const Backup: React.FC = () => {
  return (
    <div className="content-spacing">
      <Card>
        <CardHeader>
          <CardTitle>Backup Management</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="text-secondary space-y-2">
            <li>• Automated database backups</li>
            <li>• Configuration file exports</li>
            <li>• Metadata and settings preservation</li>
            <li>• Full system restore capabilities</li>
            <li>• Scheduled backup operations</li>
            <li>• Backup verification and integrity checks</li>
            <li>• Remote backup storage options</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
};