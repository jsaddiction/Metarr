/**
 * EnrichmentStatusSection - Movie detail enrichment status display
 * Phase 5: Multi-Provider Metadata Aggregation
 */

import React, { useEffect, useState } from 'react';
import { formatDistance } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Progress } from '../ui/progress';
import { Alert, AlertDescription } from '../ui/alert';
import { Skeleton } from '../ui/skeleton';
import { useMovieEnrichmentStatus, useTriggerMovieEnrich } from '../../hooks/useEnrichment';
import { useWebSocket } from '../../contexts/WebSocketContext';
import { EnrichmentProgressEvent, EnrichmentCompleteEvent } from '../../types/enrichment';
import { cn } from '@/lib/utils';

interface EnrichmentStatusSectionProps {
  movieId: number;
}

export const EnrichmentStatusSection: React.FC<EnrichmentStatusSectionProps> = ({ movieId }) => {
  const { data, isLoading, error, refetch } = useMovieEnrichmentStatus(movieId);
  const { mutate: triggerEnrich, isPending: isEnriching } = useTriggerMovieEnrich();
  const { ws, isConnected } = useWebSocket();

  // Real-time enrichment progress from WebSocket
  const [liveProgress, setLiveProgress] = useState<EnrichmentProgressEvent | null>(null);
  const [isEnrichmentRunning, setIsEnrichmentRunning] = useState(false);

  // Subscribe to enrichment WebSocket events
  useEffect(() => {
    if (!ws || !isConnected) return;

    const handleMessage = (message: any) => {
      if (message.movieId !== movieId) return;

      if (message.type === 'enrichment:progress') {
        setLiveProgress(message as EnrichmentProgressEvent);
        setIsEnrichmentRunning(true);
      } else if (message.type === 'enrichment:complete') {
        setLiveProgress(null);
        setIsEnrichmentRunning(false);
        refetch(); // Refresh status after completion
      } else if (message.type === 'enrichment:failed') {
        setLiveProgress(null);
        setIsEnrichmentRunning(false);
      }
    };

    ws.on('enrichment:progress', handleMessage);
    ws.on('enrichment:complete', handleMessage);
    ws.on('enrichment:failed', handleMessage);

    return () => {
      ws.off('enrichment:progress', handleMessage);
      ws.off('enrichment:complete', handleMessage);
      ws.off('enrichment:failed', handleMessage);
    };
  }, [ws, isConnected, movieId, refetch]);

  const handleRefresh = () => {
    triggerEnrich({ movieId, force: false });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Enrichment Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-2 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Enrichment Status</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertDescription>
              Failed to load enrichment status
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const getProgressColor = () => {
    if (data.partial) return 'bg-amber-500';
    if (data.completeness >= 90) return 'bg-green-500';
    if (data.completeness >= 60) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Enrichment Status</CardTitle>
        {isEnrichmentRunning && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
            Enriching...
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Partial enrichment warning */}
        {data.partial && (
          <Alert className="bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800">
            <AlertDescription className="text-amber-900 dark:text-amber-100">
              <div className="font-semibold flex items-center gap-2">
                <span>⚠</span>
                Partial enrichment - some providers failed
              </div>
              {data.rateLimitedProviders.length > 0 && (
                <div className="text-sm mt-1">
                  Rate-limited providers: {data.rateLimitedProviders.join(', ')}
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* Live enrichment progress */}
        {isEnrichmentRunning && liveProgress && (
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">
              Current provider: <span className="font-medium">{liveProgress.currentProvider}</span>
            </div>
            <Progress
              value={liveProgress.progress}
              className="h-2"
              aria-label={`Enrichment progress: ${liveProgress.progress}%`}
            />
            <div className="text-xs text-muted-foreground space-y-1">
              <div>Completed: {liveProgress.providersComplete.join(', ') || 'None'}</div>
              <div>Remaining: {liveProgress.providersRemaining.join(', ') || 'None'}</div>
            </div>
          </div>
        )}

        {/* Completeness status (when not enriching) */}
        {!isEnrichmentRunning && (
          <>
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium">Completeness</span>
                <span className="text-sm font-bold tabular-nums">{data.completeness}%</span>
              </div>
              <Progress
                value={data.completeness}
                className={cn('h-2', getProgressColor())}
                aria-label={`Metadata completeness: ${data.completeness}%`}
              />
            </div>

            {/* Last enriched info */}
            {data.lastEnriched && (
              <div className="text-sm text-muted-foreground space-y-1">
                <div>
                  Last enriched:{' '}
                  {formatDistance(new Date(data.lastEnriched), new Date(), { addSuffix: true })}
                </div>
                {data.enrichmentDuration && (
                  <div>Duration: {data.enrichmentDuration.toFixed(1)} seconds</div>
                )}
              </div>
            )}

            {!data.lastEnriched && (
              <div className="text-sm text-muted-foreground">Never enriched</div>
            )}

            {/* Missing fields */}
            {data.missingFields.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">
                  Missing Fields ({data.missingFields.length})
                </h4>
                <ul className="space-y-1 text-sm text-muted-foreground ml-4">
                  {data.missingFields.map((field) => (
                    <li key={field.field} className="list-disc">
                      {field.displayName}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        {/* Action button */}
        <Button
          onClick={handleRefresh}
          disabled={isEnriching || isEnrichmentRunning}
          className="w-full"
        >
          {isEnriching || isEnrichmentRunning ? 'Enriching...' : 'Refresh Metadata'}
        </Button>
      </CardContent>
    </Card>
  );
};
