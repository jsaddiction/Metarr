import React from 'react';
import { PageContainer } from '@/components/ui/PageContainer';
import { LibraryStatusCard } from '@/components/dashboard/LibraryStatusCard';
import { MediaPlayerStatusCard } from '@/components/dashboard/MediaPlayerStatusCard';
import { RecentActivityList } from '@/components/dashboard/RecentActivityList';
import { useLibraries } from '@/hooks/useLibraryScans';
import { usePlayers } from '@/hooks/usePlayers';
import { useJobHistory } from '@/hooks/useJobs';
import { SectionHeader } from '@/components/ui/SectionHeader/SectionHeader';
import { EmptyState } from '@/components/ui/EmptyState/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState/LoadingState';
import { DataCard } from '@/components/ui/DataCard/DataCard';

export const Dashboard: React.FC = () => {
  const { data: libraries = [], isLoading: loadingLibraries } = useLibraries();
  const { data: playersData, isLoading: loadingPlayers } = usePlayers();
  const { data: jobHistoryData, isLoading: loadingHistory } = useJobHistory({ limit: 10 });

  const players = playersData?.players || [];
  const recentJobs = jobHistoryData?.history || [];

  return (
    <PageContainer
      title="Dashboard"
      subtitle="Overview of your libraries, media players, and recent activity"
    >
      <div className="section-stack">
        {/* Libraries Section */}
        <section>
          <SectionHeader title="Libraries" />

          {loadingLibraries && <LoadingState message="Loading libraries..." size="sm" />}

          {!loadingLibraries && libraries.length === 0 && (
            <DataCard>
              <EmptyState
                title="No libraries configured"
                action={{
                  label: 'Add a library to get started',
                  href: '/settings/libraries'
                }}
              />
            </DataCard>
          )}

          {!loadingLibraries && libraries.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {libraries.map((library) => (
                <LibraryStatusCard key={library.id} library={library} />
              ))}
            </div>
          )}
        </section>

        {/* Media Players Section */}
        <section>
          <SectionHeader title="Media Players" />

          {loadingPlayers && <LoadingState message="Loading media players..." size="sm" />}

          {!loadingPlayers && players.length === 0 && (
            <DataCard>
              <EmptyState
                title="No media players configured"
                action={{
                  label: 'Add a media player to get started',
                  href: '/settings/media-players'
                }}
              />
            </DataCard>
          )}

          {!loadingPlayers && players.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {players.map((player) => (
                <MediaPlayerStatusCard
                  key={player.id}
                  player={player}
                  status={undefined}
                />
              ))}
            </div>
          )}
        </section>

        {/* Recent Activity Section */}
        <section>
          <SectionHeader title="Recent Activity" />

          <DataCard title="Last 10 Jobs">
            {loadingHistory && <LoadingState message="Loading activity..." size="sm" />}
            {!loadingHistory && <RecentActivityList jobs={recentJobs} />}
          </DataCard>
        </section>
      </div>
    </PageContainer>
  );
};
