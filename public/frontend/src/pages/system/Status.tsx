import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useSystemInfo } from '@/hooks/useSystemStatus';
import { usePlayerActivity } from '@/hooks/usePlayerActivity';
import { ConnectionBadge } from '@/components/mediaPlayer/ConnectionBadge';
import { ActivityDisplay } from '@/components/mediaPlayer/ActivityDisplay';
import {
  CheckCircle2,
  XCircle,
  Server,
  Database,
  Clock,
  Globe,
  AlertTriangle,
  Loader2,
} from 'lucide-react';

export const Status: React.FC = () => {
  const { data: systemInfo, isLoading: loadingSystem } = useSystemInfo();
  const { data: activityStates } = usePlayerActivity();

  const formatUptime = (seconds: number): string => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const formatBytes = (bytes: number): string => {
    const mb = bytes / 1024 / 1024;
    const gb = mb / 1024;
    if (gb >= 1) return `${gb.toFixed(2)} GB`;
    return `${mb.toFixed(2)} MB`;
  };

  if (loadingSystem) {
    return (
      <div className="content-spacing">
        <div className="flex items-center justify-center py-32 text-neutral-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          Loading system status...
        </div>
      </div>
    );
  }

  // Determine overall system status
  const databaseHealthy = systemInfo?.health.database.healthy ?? false;
  const jobQueueHealthy = systemInfo?.health.jobQueue.healthy ?? false;
  const cacheAccessible = systemInfo?.health.cache.accessible ?? false;
  const jobsStuck = systemInfo?.health.jobQueue.stuck ?? false;

  // System is operational if all critical components are healthy
  const systemOperational = databaseHealthy && jobQueueHealthy && cacheAccessible;
  const systemDegraded = !systemOperational && (databaseHealthy || jobQueueHealthy);

  return (
    <div className="content-spacing">
      <h1 className="text-2xl font-bold text-white mb-6">System Status</h1>

      {/* System Health Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Server className="w-8 h-8 text-primary-500" />
              <div>
                <div className="text-sm text-neutral-400">System</div>
                <div
                  className={`text-xl font-bold flex items-center gap-2 ${
                    systemOperational
                      ? 'text-green-500'
                      : systemDegraded
                      ? 'text-yellow-500'
                      : 'text-red-500'
                  }`}
                >
                  {systemOperational ? (
                    <>
                      <CheckCircle2 className="w-5 h-5" />
                      Operational
                    </>
                  ) : systemDegraded ? (
                    <>
                      <AlertTriangle className="w-5 h-5" />
                      Degraded
                    </>
                  ) : (
                    <>
                      <XCircle className="w-5 h-5" />
                      Down
                    </>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Database className="w-8 h-8 text-primary-500" />
              <div>
                <div className="text-sm text-neutral-400">Database</div>
                <div
                  className={`text-xl font-bold flex items-center gap-2 ${
                    databaseHealthy ? 'text-green-500' : 'text-red-500'
                  }`}
                >
                  {databaseHealthy ? (
                    <>
                      <CheckCircle2 className="w-5 h-5" />
                      Healthy
                    </>
                  ) : (
                    <>
                      <XCircle className="w-5 h-5" />
                      Unhealthy
                    </>
                  )}
                </div>
                {systemInfo?.health.database.responseTime !== undefined && (
                  <div className="text-xs text-neutral-500 mt-1">
                    {systemInfo.health.database.responseTime}ms
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Clock className="w-8 h-8 text-primary-500" />
              <div>
                <div className="text-sm text-neutral-400">Uptime</div>
                <div className="text-xl font-bold text-white">
                  {systemInfo?.uptime ? formatUptime(systemInfo.uptime) : 'Unknown'}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* System Information */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>System Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex justify-between py-2 border-b border-neutral-700">
              <span className="text-neutral-400">Version</span>
              <span className="text-white font-medium">{systemInfo?.version || 'Unknown'}</span>
            </div>

            <div className="flex justify-between py-2 border-b border-neutral-700">
              <span className="text-neutral-400">Platform</span>
              <span className="text-white font-medium">
                {systemInfo?.platform || 'Unknown'} ({systemInfo?.arch || 'Unknown'})
              </span>
            </div>

            <div className="flex justify-between py-2 border-b border-neutral-700">
              <span className="text-neutral-400">Node Version</span>
              <span className="text-white font-medium">{systemInfo?.nodeVersion || 'Unknown'}</span>
            </div>

            <div className="flex justify-between py-2 border-b border-neutral-700">
              <span className="text-neutral-400">Memory Used</span>
              <span className="text-white font-medium">
                {systemInfo?.memory.used.heapUsed ? (
                  <>
                    {formatBytes(systemInfo.memory.used.heapUsed)}
                    <span className="text-neutral-500 ml-2">
                      ({(systemInfo.memory.percentUsed * 100).toFixed(1)}%)
                    </span>
                  </>
                ) : (
                  'Unknown'
                )}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Component Health */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Component Health</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Job Queue Health */}
            <div className="flex items-center justify-between p-4 rounded-lg bg-neutral-800/50 border border-neutral-700">
              <div className="flex items-center gap-3">
                <div
                  className={`w-3 h-3 rounded-full ${
                    jobQueueHealthy && !jobsStuck ? 'bg-green-500' : 'bg-red-500'
                  }`}
                />
                <div>
                  <div className="font-medium text-white">Job Queue</div>
                  {jobsStuck && (
                    <div className="text-xs text-yellow-400 flex items-center gap-1 mt-1">
                      <AlertTriangle className="w-3 h-3" />
                      Jobs stuck for &gt;5 minutes
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-sm text-neutral-400">
                  {systemInfo?.health.jobQueue.pending || 0} pending
                </div>
                <div className="text-sm text-primary-500">
                  {systemInfo?.health.jobQueue.processing || 0} processing
                </div>
              </div>
            </div>

            {/* Cache Health */}
            <div className="flex items-center justify-between p-4 rounded-lg bg-neutral-800/50 border border-neutral-700">
              <div className="flex items-center gap-3">
                <div
                  className={`w-3 h-3 rounded-full ${
                    cacheAccessible ? 'bg-green-500' : 'bg-red-500'
                  }`}
                />
                <div>
                  <div className="font-medium text-white">Cache Storage</div>
                  <div className="text-xs text-neutral-500 mt-1">
                    {systemInfo?.health.cache.path || 'Unknown'}
                  </div>
                </div>
              </div>
              <div className="text-sm text-neutral-400">
                {cacheAccessible ? 'Accessible' : 'Not Accessible'}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Provider & Media Player Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Providers */}
        <Card>
          <CardHeader>
            <CardTitle>Metadata Providers</CardTitle>
          </CardHeader>
          <CardContent>
            {!systemInfo?.health.providers || systemInfo.health.providers.length === 0 ? (
              <div className="text-center py-8 text-neutral-400">No providers available</div>
            ) : (
              <div className="space-y-3">
                {systemInfo.health.providers.map((provider) => (
                  <div
                    key={provider.name}
                    className="flex items-center justify-between p-3 rounded-lg bg-neutral-800/50 border border-neutral-700"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-2 h-2 rounded-full ${
                          provider.healthy ? 'bg-green-500' : 'bg-red-500'
                        }`}
                      />
                      <div>
                        <div className="font-medium text-white text-sm">{provider.displayName}</div>
                        {provider.lastError && (
                          <div className="text-xs text-red-400 flex items-center gap-1 mt-1">
                            <AlertTriangle className="w-3 h-3" />
                            {provider.lastError}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {provider.responseTime !== null && (
                        <div className="text-xs text-neutral-500">
                          {provider.responseTime}ms
                        </div>
                      )}
                      {provider.healthy ? (
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-500" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Media Players - Live Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Media Players</CardTitle>
          </CardHeader>
          <CardContent>
            {!activityStates || activityStates.length === 0 ? (
              <div className="text-center py-8 text-neutral-400">No players configured</div>
            ) : (
              <div className="space-y-3">
                {activityStates.map((state) => (
                  <div
                    key={state.playerId}
                    className="p-3 rounded-lg bg-neutral-800/50 border border-neutral-700"
                  >
                    {/* Player Header */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <div className="font-medium text-white text-sm">{state.playerName}</div>
                      </div>
                      <ConnectionBadge mode={state.connectionMode} />
                    </div>

                    {/* Live Activity */}
                    <ActivityDisplay activity={state.activity} compact />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};