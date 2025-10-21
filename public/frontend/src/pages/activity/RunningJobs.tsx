import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useJobs, useJobStats } from '@/hooks/useJobs';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faSpinner,
  faCheck,
  faTimes,
  faClock
} from '@fortawesome/free-solid-svg-icons';

export const RunningJobs: React.FC = () => {
  const { data: jobs, isLoading } = useJobs();
  const { data: stats } = useJobStats();

  if (isLoading) {
    return (
      <div className="content-spacing">
        <div className="flex items-center justify-center py-32 text-neutral-400">
          Loading jobs...
        </div>
      </div>
    );
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'processing':
      case 'retrying':
        return faSpinner;
      case 'completed':
        return faCheck;
      case 'failed':
        return faTimes;
      default:
        return faClock;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'processing':
      case 'retrying':
        return 'text-primary-500';
      case 'completed':
        return 'text-green-500';
      case 'failed':
        return 'text-red-500';
      default:
        return 'text-neutral-400';
    }
  };

  const isRunning = (status: string) => status === 'processing' || status === 'retrying';

  return (
    <div className="content-spacing">
      <h1 className="text-2xl font-bold text-white mb-6">Running Jobs</h1>

      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-neutral-400">{stats.pending}</div>
              <div className="text-sm text-neutral-500">Pending</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-primary-500">{stats.running}</div>
              <div className="text-sm text-neutral-500">Running</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-green-500">{stats.completed}</div>
              <div className="text-sm text-neutral-500">Completed</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-red-500">{stats.failed}</div>
              <div className="text-sm text-neutral-500">Failed</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Jobs Table */}
      <Card>
        <CardHeader>
          <CardTitle>Active Jobs</CardTitle>
        </CardHeader>
        <CardContent>
          {!jobs || jobs.length === 0 ? (
            <div className="text-center py-8 text-neutral-400">
              No active jobs
            </div>
          ) : (
            <div className="space-y-3">
              {jobs.map(job => (
                <div
                  key={job.id}
                  className="flex items-center gap-4 p-4 rounded-lg bg-neutral-800/50 border border-neutral-700"
                >
                  {/* Status Icon */}
                  <div className={`w-8 h-8 flex items-center justify-center ${getStatusColor(job.status)}`}>
                    <FontAwesomeIcon
                      icon={getStatusIcon(job.status)}
                      className={isRunning(job.status) ? 'animate-spin' : ''}
                    />
                  </div>

                  {/* Job Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-white">{job.type}</span>
                      <span className="text-xs text-neutral-400">
                        Priority: {job.priority}
                      </span>
                    </div>

                    {/* Progress Bar */}
                    {isRunning(job.status) && job.progress !== undefined && (
                      <div className="mb-1">
                        <div className="h-2 bg-neutral-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary-500 transition-all duration-300"
                            style={{ width: `${job.progress}%` }}
                          />
                        </div>
                        <div className="text-xs text-neutral-400 mt-1">
                          {job.progress}% - {job.message || 'Processing...'}
                        </div>
                      </div>
                    )}

                    {/* Error Message */}
                    {job.status === 'failed' && job.error && (
                      <div className="text-sm text-red-400">{job.error}</div>
                    )}

                    {/* Completed Message */}
                    {job.status === 'completed' && job.message && (
                      <div className="text-sm text-green-400">{job.message}</div>
                    )}

                    {/* Retry Info */}
                    {job.status === 'retrying' && (
                      <div className="text-sm text-yellow-400">
                        Retrying... (Attempt {job.attempts}/{job.maxAttempts})
                      </div>
                    )}
                  </div>

                  {/* Timestamp */}
                  <div className="text-xs text-neutral-500">
                    {new Date(job.createdAt).toLocaleTimeString()}
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
