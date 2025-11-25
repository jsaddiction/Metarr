import React from 'react';
import { PageContainer } from '@/components/ui/PageContainer';
import { SettingCard } from '@/components/ui/SettingCard';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useJobs, useJobStats } from '@/hooks/useJobs';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faSpinner,
  faCheck,
  faTimes,
  faClock,
  faClipboardList,
  faPlayCircle,
  faCheckCircle,
  faTimesCircle
} from '@fortawesome/free-solid-svg-icons';

export const RunningJobs: React.FC = () => {
  const { data: jobs, isLoading } = useJobs();
  const { data: stats } = useJobStats();

  if (isLoading) {
    return (
      <PageContainer title="Running Jobs" subtitle="Monitor active and queued job processing">
        <div className="flex items-center justify-center py-32 text-neutral-400">
          Loading jobs...
        </div>
      </PageContainer>
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
    <PageContainer
      title="Running Jobs"
      subtitle="Monitor active and queued job processing"
    >
      <div className="section-stack">
        {/* Statistics Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <SettingCard
              title="Pending"
              icon={<FontAwesomeIcon icon={faClipboardList} className="w-5 h-5" />}
              variant="subtle"
            >
              <div className="text-3xl font-bold text-neutral-400">{stats.pending}</div>
            </SettingCard>

            <SettingCard
              title="Running"
              icon={<FontAwesomeIcon icon={faPlayCircle} className="w-5 h-5" />}
              variant="subtle"
            >
              <div className="text-3xl font-bold text-primary-500">{stats.running}</div>
            </SettingCard>

            <SettingCard
              title="Completed"
              icon={<FontAwesomeIcon icon={faCheckCircle} className="w-5 h-5" />}
              variant="subtle"
            >
              <div className="text-3xl font-bold text-green-500">{stats.completed}</div>
            </SettingCard>

            <SettingCard
              title="Failed"
              icon={<FontAwesomeIcon icon={faTimesCircle} className="w-5 h-5" />}
              variant="subtle"
            >
              <div className="text-3xl font-bold text-red-500">{stats.failed}</div>
            </SettingCard>
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
    </PageContainer>
  );
};
