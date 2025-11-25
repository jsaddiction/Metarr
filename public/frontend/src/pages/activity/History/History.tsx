import React from 'react';
import { PageContainer } from '@/components/ui/PageContainer';
import { SettingCard } from '@/components/ui/SettingCard';
import { Clock } from 'lucide-react';

export const History: React.FC = () => {
  return (
    <PageContainer
      title="Activity History"
      subtitle="View completed jobs, metadata updates, and system events"
    >
      <SettingCard
        title="Coming Soon"
        description="Activity history tracking is under development"
        icon={<Clock className="w-5 h-5" />}
      >
        <ul className="text-secondary space-y-2">
          <li>• Completed webhook processing logs</li>
          <li>• Historical metadata updates</li>
          <li>• Past provider API calls</li>
          <li>• Resolved errors and warnings</li>
          <li>• Previous system events</li>
          <li>• User action timeline</li>
          <li>• Job completion history with timestamps</li>
        </ul>
      </SettingCard>
    </PageContainer>
  );
};
