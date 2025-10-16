import React from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistance } from 'date-fns';
import { Button } from '../ui/button';
import {
  Webhook,
  FolderSearch,
  Download,
  Sparkles,
  Check,
  Bell,
  Calendar,
  Search,
  LucideIcon,
} from 'lucide-react';

interface JobHistoryRecord {
  id: number;
  job_id: number;
  type: string;
  priority: number;
  payload: any;
  status: 'completed' | 'failed';
  error?: string | null;
  retry_count: number;
  created_at: string;
  started_at: string;
  completed_at: string;
  duration_ms: number;
}

interface RecentActivityListProps {
  jobs: JobHistoryRecord[];
}

const jobTypeIcons: Record<string, LucideIcon> = {
  'webhook-received': Webhook,
  'library-scan': FolderSearch,
  'directory-scan': Search,
  'cache-asset': Download,
  'enrich-metadata': Sparkles,
  'publish': Check,
  'notify-kodi': Bell,
  'notify-jellyfin': Bell,
  'notify-plex': Bell,
  'scheduled-file-scan': Calendar,
  'scheduled-provider-update': Calendar,
};

function formatJobDescription(job: JobHistoryRecord): string {
  switch (job.type) {
    case 'library-scan':
      return `Scanned ${job.payload.libraryName || 'library'}`;
    case 'webhook-received':
      return `Webhook: ${job.payload.source || 'Unknown'} - ${job.payload.title || 'Unknown'}`;
    case 'enrich-metadata':
      return `Enriched metadata for ${job.payload.title || 'item'}`;
    case 'notify-kodi':
    case 'notify-jellyfin':
    case 'notify-plex':
      return `Notified ${job.payload.playerName || 'media player'}`;
    case 'directory-scan':
      // Extract just the directory name from the full path
      const directoryPath = job.payload.directoryPath || job.payload.path || 'directory';
      const dirName = directoryPath.split('/').pop() || directoryPath;
      return `Scanned ${dirName}`;
    case 'cache-asset':
      return `Cached ${job.payload.assetType || 'asset'}`;
    case 'scheduled-file-scan':
      return `Scheduled file scan`;
    case 'scheduled-provider-update':
      return `Scheduled provider update`;
    default:
      return job.type.replace(/-/g, ' ');
  }
}

export const RecentActivityList: React.FC<RecentActivityListProps> = ({ jobs }) => {
  const navigate = useNavigate();

  if (jobs.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>No recent activity</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {jobs.map((job) => {
        const Icon = jobTypeIcons[job.type] || FolderSearch;

        return (
          <div key={job.id} className="flex items-start gap-3 text-sm py-2">
            <div className="text-muted-foreground whitespace-nowrap text-xs mt-0.5">
              {formatDistance(new Date(job.completed_at), new Date(), {
                addSuffix: true,
              })}
            </div>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Icon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
              <span className="truncate">{formatJobDescription(job)}</span>
              {job.status === 'completed' && (
                <span className="text-green-600 flex-shrink-0">✓</span>
              )}
              {job.status === 'failed' && (
                <span className="text-red-600 flex-shrink-0" title={job.error || 'Failed'}>
                  ✗
                </span>
              )}
              <span className="text-xs text-muted-foreground flex-shrink-0">
                {Math.abs(job.duration_ms / 1000).toFixed(1)}s
              </span>
            </div>
          </div>
        );
      })}

      <div className="pt-2">
        <Button variant="link" className="h-auto p-0" onClick={() => navigate('/activity/history')}>
          View All History →
        </Button>
      </div>
    </div>
  );
};
