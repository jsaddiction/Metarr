/**
 * CompletenessStatCard - Dashboard widget for library-wide metadata completeness
 * Phase 5: Multi-Provider Metadata Aggregation
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Progress } from '../ui/progress';
import { EnrichmentHealthBadge } from '../ui/EnrichmentHealthBadge';
import { Button } from '../ui/button';
import { useLibraryStats } from '../../hooks/useEnrichment';
import { Skeleton } from '../ui/skeleton';
import { Alert, AlertDescription } from '../ui/alert';

export const CompletenessStatCard: React.FC = () => {
  const { data, isLoading, error, refetch } = useLibraryStats();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Metadata Completeness</CardTitle>
          <CardDescription>Library-wide enrichment status</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-2 w-full" />
            <div className="grid grid-cols-3 gap-4">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Metadata Completeness</CardTitle>
          <CardDescription>Library-wide enrichment status</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertDescription className="flex items-center justify-between">
              <span>Failed to load completeness data</span>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.total === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Metadata Completeness</CardTitle>
          <CardDescription>Library-wide enrichment status</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-6">
            <p>No movies in library</p>
            <p className="text-sm mt-2">Add a library to get started</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Metadata Completeness</CardTitle>
        <CardDescription>
          {data.total} {data.total === 1 ? 'movie' : 'movies'} in library
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Average completeness progress bar */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium">Library Average</span>
            <span className="text-sm font-bold tabular-nums">{data.averageCompleteness.toFixed(1)}%</span>
          </div>
          <Progress
            value={data.averageCompleteness}
            className="h-2"
            aria-label={`Library average completeness: ${data.averageCompleteness.toFixed(1)}%`}
          />
        </div>

        {/* Category breakdown */}
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-xs text-muted-foreground mb-1">Enriched</div>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {data.enriched}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground mb-1">Partial</div>
            <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
              {data.partiallyEnriched}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground mb-1">Missing</div>
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">
              {data.unenriched}
            </div>
          </div>
        </div>

        {/* Top incomplete movies */}
        {data.topIncomplete && data.topIncomplete.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-3">Most Incomplete Movies</h4>
            <div className="space-y-2">
              {data.topIncomplete.slice(0, 5).map((movie) => (
                <Link
                  key={movie.id}
                  to={`/media/movies/${movie.id}/edit`}
                  className="flex items-center justify-between p-2 rounded-md hover:bg-accent transition-colors group"
                >
                  <span className="text-sm group-hover:text-primary flex-1 truncate">
                    {movie.title}
                    {movie.year && (
                      <span className="text-muted-foreground ml-1">({movie.year})</span>
                    )}
                  </span>
                  <EnrichmentHealthBadge
                    completeness={movie.completeness}
                    size="sm"
                    className="ml-2 flex-shrink-0"
                  />
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* View all button */}
        {data.unenriched > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            asChild
          >
            <Link to="/media/movies?filter=incomplete&sort=completeness:asc">
              View All Incomplete Movies
            </Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
};
