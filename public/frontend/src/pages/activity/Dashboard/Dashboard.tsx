import React from 'react';
import { PageContainer } from '@/components/ui/PageContainer';
import { LibraryStatusCard } from '@/components/dashboard/LibraryStatusCard';
import { MediaPlayerStatusCard } from '@/components/dashboard/MediaPlayerStatusCard';
import { RecentActivityList } from '@/components/dashboard/RecentActivityList';
import { useLibraries } from '@/hooks/useLibraryScans';
import { usePlayers } from '@/hooks/usePlayers';
import { useJobHistory } from '@/hooks/useJobs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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
          <h2 className="text-2xl font-bold mb-4">Libraries</h2>

          {loadingLibraries && (
            <div className="text-muted-foreground">Loading libraries...</div>
          )}

          {!loadingLibraries && libraries.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground mb-4">No libraries configured</p>
                <a
                  href="/settings/libraries"
                  className="text-primary underline-offset-4 hover:underline"
                >
                  Add a library to get started
                </a>
              </CardContent>
            </Card>
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
          <h2 className="text-2xl font-bold mb-4">Media Players</h2>

          {loadingPlayers && (
            <div className="text-muted-foreground">Loading media players...</div>
          )}

          {!loadingPlayers && players.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground mb-4">No media players configured</p>
                <a
                  href="/settings/media-players"
                  className="text-primary underline-offset-4 hover:underline"
                >
                  Add a media player to get started
                </a>
              </CardContent>
            </Card>
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
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold">Recent Activity</h2>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Last 10 Jobs</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingHistory && (
                <div className="text-muted-foreground">Loading activity...</div>
              )}

              {!loadingHistory && <RecentActivityList jobs={recentJobs} />}
            </CardContent>
          </Card>
        </section>
      </div>
    </PageContainer>
  );
};
