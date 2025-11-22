/**
 * BulkEnrichmentCard - Bulk metadata enrichment status and controls
 * Phase 5: Multi-Provider Metadata Aggregation
 */

import React, { useEffect, useState } from 'react';
import { formatDistance, formatDistanceToNow } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Progress } from '../ui/progress';
import { Alert, AlertDescription } from '../ui/alert';
import { Skeleton } from '../ui/skeleton';
import { useBulkStatus, useTriggerBulkEnrich } from '../../hooks/useEnrichment';
import { useWebSocket } from '../../contexts/WebSocketContext';
import { BulkProgressEvent } from '../../types/enrichment';
import { cn } from '@/lib/utils';

export const BulkEnrichmentCard: React.FC = () => {
  const { data, isLoading, error, refetch } = useBulkStatus();
  const { mutate: triggerBulk, isPending: isTriggeringBulk } = useTriggerBulkEnrich();
  const { ws, isConnected } = useWebSocket();

  // Real-time bulk progress from WebSocket
  const [liveProgress, setLiveProgress] = useState<BulkProgressEvent | null>(null);

  // Subscribe to bulk enrichment WebSocket events
  useEffect(() => {
    if (!ws || !isConnected) return;

    const handleMessage = (message: any) => {
      if (message.type === 'bulk:progress') {
        setLiveProgress(message as BulkProgressEvent);
      } else if (message.type === 'bulk:complete' || message.type === 'bulk:rate_limit') {
        setLiveProgress(null);
        refetch(); // Refresh status after completion or rate limit
      }
    };

    ws.on('bulk:progress', handleMessage);
    ws.on('bulk:complete', handleMessage);
    ws.on('bulk:rate_limit', handleMessage);

    return () => {
      ws.off('bulk:progress', handleMessage);
      ws.off('bulk:complete', handleMessage);
      ws.off('bulk:rate_limit', handleMessage);
    };
  }, [ws, isConnected, refetch]);

  const handleRunNow = () => {
    if (window.confirm('This will enrich all movies in your library. Continue?')) {
      triggerBulk({ force: false });
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Bulk Metadata Enrichment</CardTitle>
          <CardDescription>Scheduled library-wide enrichment</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-10 w-32" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Bulk Metadata Enrichment</CardTitle>
          <CardDescription>Scheduled library-wide enrichment</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertDescription>Failed to load bulk enrichment status</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const isRunning = !!data.currentRun || !!liveProgress;
  const currentProgress = liveProgress || data.currentRun;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Bulk Metadata Enrichment</CardTitle>
          <CardDescription>Scheduled library-wide enrichment</CardDescription>
        </div>
        {isRunning && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
            Running...
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Next scheduled run */}
        {!isRunning && data.nextRun && (
          <div className="text-sm">
            <div className="font-medium mb-1">Scheduled Run</div>
            <div className="text-muted-foreground">
              Daily at {new Date(data.nextRun.scheduledAt).toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
              })}
            </div>
            <div className="text-muted-foreground">
              Next run: {formatDistanceToNow(new Date(data.nextRun.scheduledAt), { addSuffix: true })}
            </div>
          </div>
        )}

        {/* Running state */}
        {isRunning && currentProgress && (
          <div className="space-y-4">
            <div className="text-sm font-medium">Enriching library...</div>
            <Progress
              value={currentProgress.progress}
              className="h-2"
              aria-label={`Bulk enrichment progress: ${currentProgress.progress}%`}
            />
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground">Progress</div>
                <div className="font-medium">
                  {currentProgress.processedMovies} / {currentProgress.totalMovies} movies
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Current</div>
                <div className="font-medium truncate">{currentProgress.currentMovie.title}</div>
              </div>
            </div>
            {currentProgress.rateLimitedProviders.length > 0 && (
              <Alert className="bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800">
                <AlertDescription className="text-sm text-amber-900 dark:text-amber-100">
                  Rate-limited providers: {currentProgress.rateLimitedProviders.join(', ')}
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* Last run status */}
        {!isRunning && data.lastRun && (
          <div className="space-y-3">
            <div className="text-sm font-medium">Last Run</div>

            {/* Rate limit warning */}
            {data.lastRun.rateLimitHit && (
              <Alert className="bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800">
                <AlertDescription className="text-amber-900 dark:text-amber-100">
                  <div className="font-semibold flex items-center gap-2">
                    <span>⚠</span>
                    Rate limit reached - stopped early
                  </div>
                  <div className="text-sm mt-1">
                    {data.lastRun.rateLimitedProviders.join(', ')} rate limit hit
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {/* Success status */}
            {!data.lastRun.rateLimitHit && data.lastRun.status === 'completed' && (
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                <span>✓</span>
                <span className="text-sm font-medium">Completed</span>
              </div>
            )}

            {/* Run details */}
            <div className="text-sm text-muted-foreground space-y-1">
              <div>
                Started: {new Date(data.lastRun.startedAt).toLocaleString()}
              </div>
              {data.lastRun.completedAt && (
                <div>
                  Duration: {formatDistance(
                    new Date(data.lastRun.startedAt),
                    new Date(data.lastRun.completedAt)
                  )}
                </div>
              )}
            </div>

            {/* Statistics */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground">Processed</div>
                <div className="font-medium">
                  {data.lastRun.stats.processed} / {data.lastRun.stats.totalMovies}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Skipped</div>
                <div className="font-medium">{data.lastRun.stats.skipped}</div>
              </div>
              {data.lastRun.stats.failed > 0 && (
                <div>
                  <div className="text-muted-foreground">Failed</div>
                  <div className="font-medium text-red-600 dark:text-red-400">
                    {data.lastRun.stats.failed}
                  </div>
                </div>
              )}
            </div>

            {/* Resume info for partial runs */}
            {data.lastRun.rateLimitHit && data.nextRun && (
              <div className="text-xs text-muted-foreground mt-2">
                Will resume from movie #{data.lastRun.stats.processed + 1} at next scheduled run
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2">
          <Button
            onClick={handleRunNow}
            disabled={isRunning || isTriggeringBulk}
            variant="default"
          >
            {isTriggeringBulk ? 'Starting...' : 'Run Now'}
          </Button>
          {/* Future: Add View History button */}
        </div>
      </CardContent>
    </Card>
  );
};
