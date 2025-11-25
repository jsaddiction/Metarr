import React from 'react';
import { PageContainer } from '@/components/ui/PageContainer';
import { SettingCard } from '@/components/ui/SettingCard';
import { ShieldAlert } from 'lucide-react';

export const BlockedAssets: React.FC = () => {
  return (
    <PageContainer
      title="Blocked Assets"
      subtitle="Manage failed downloads and unavailable resources"
    >
      <SettingCard
        title="Coming Soon"
        description="Blocked asset management is under development"
        icon={<ShieldAlert className="w-5 h-5" />}
      >
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
      </SettingCard>
    </PageContainer>
  );
};
