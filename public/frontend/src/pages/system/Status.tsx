import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useSystemInfo, useProviderStatus } from '@/hooks/useSystemStatus';
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
  const { data: providers, isLoading: loadingProviders } = useProviderStatus();

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

  if (loadingSystem || loadingProviders) {
    return (
      <div className="content-spacing">
        <div className="flex items-center justify-center py-32 text-neutral-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          Loading system status...
        </div>
      </div>
    );
  }

  // Check if database is operational (we have system data)
  const databaseConnected = !!systemInfo;

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
                <div className="text-xl font-bold text-green-500 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5" />
                  Operational
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
                    databaseConnected ? 'text-green-500' : 'text-red-500'
                  }`}
                >
                  {databaseConnected ? (
                    <>
                      <CheckCircle2 className="w-5 h-5" />
                      Connected
                    </>
                  ) : (
                    <>
                      <XCircle className="w-5 h-5" />
                      Disconnected
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
                {systemInfo?.memory.used.heapUsed
                  ? formatBytes(systemInfo.memory.used.heapUsed)
                  : 'Unknown'}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Database Statistics */}
      {systemInfo?.database && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Database Statistics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-primary-500">
                  {systemInfo.database.movies.toLocaleString()}
                </div>
                <div className="text-sm text-neutral-500">Movies</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-primary-500">
                  {systemInfo.database.libraries.toLocaleString()}
                </div>
                <div className="text-sm text-neutral-500">Libraries</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-primary-500">
                  {systemInfo.database.mediaPlayers.toLocaleString()}
                </div>
                <div className="text-sm text-neutral-500">Media Players</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Job Queue Status */}
      {systemInfo?.jobQueue && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Job Queue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-neutral-400">
                  {systemInfo.jobQueue.pending}
                </div>
                <div className="text-sm text-neutral-500">Pending</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-primary-500">
                  {systemInfo.jobQueue.processing}
                </div>
                <div className="text-sm text-neutral-500">Processing</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-white">
                  {systemInfo.jobQueue.total}
                </div>
                <div className="text-sm text-neutral-500">Total Active</div>
              </div>
            </div>
            {systemInfo.jobQueue.oldestPendingAge !== null && systemInfo.jobQueue.oldestPendingAge > 0 && (
              <div className="mt-4 pt-4 border-t border-neutral-700 text-center">
                <div className="text-sm text-neutral-400">
                  Oldest pending job:{' '}
                  <span className="text-white font-medium">
                    {Math.round(systemInfo.jobQueue.oldestPendingAge / 1000)}s ago
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Provider Status */}
      <Card>
        <CardHeader>
          <CardTitle>Provider Status</CardTitle>
        </CardHeader>
        <CardContent>
          {!providers || providers.length === 0 ? (
            <div className="text-center py-8 text-neutral-400">No providers configured</div>
          ) : (
            <div className="space-y-3">
              {providers.map((provider) => (
                <div
                  key={provider.name}
                  className="flex items-center justify-between p-4 rounded-lg bg-neutral-800/50 border border-neutral-700"
                >
                  <div className="flex items-center gap-3">
                    <Globe className="w-5 h-5 text-primary-500" />
                    <div>
                      <div className="font-medium text-white">{provider.displayName}</div>
                      {provider.lastError && (
                        <div className="text-xs text-red-400 flex items-center gap-1 mt-1">
                          <AlertTriangle className="w-3 h-3" />
                          {provider.lastError}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    {provider.rateLimit && (
                      <div className="text-sm text-neutral-400">
                        {provider.rateLimit.total} req/window
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      {provider.enabled ? (
                        <span className="text-xs px-2 py-1 rounded bg-green-600/20 text-green-400">
                          Enabled
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-1 rounded bg-neutral-600/20 text-neutral-400">
                          Disabled
                        </span>
                      )}

                      {provider.connected ? (
                        <CheckCircle2 className="w-5 h-5 text-green-500" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-500" />
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};