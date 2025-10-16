# Frontend Migration Plan

**Created**: 2025-10-16
**Purpose**: Align frontend with multi-phase job queue architecture and provide workflow visibility
**Status**: Planning Phase

---

## Executive Summary

The backend has implemented a multi-phase job queue architecture with priority-based execution and WebSocket progress broadcasting. The frontend needs to be updated to:

1. **Show library health at a glance** - Dashboard with status cards
2. **Enable workflow-based movie filtering** - Filter by identification_status
3. **Display real-time scan progress** - Progress bars on library cards + toast notifications
4. **Provide job queue visibility** - Activity history page
5. **Show system health** - System status page

---

## Current Backend Capabilities

### Available Endpoints ✅

**Libraries:**
- `GET /api/libraries` - List all libraries
- `GET /api/libraries/:id` - Get library by ID
- `GET /api/libraries/scan-status` - SSE stream for scan progress
- `POST /api/libraries/:id/scan` - Trigger library scan

**Movies:**
- `GET /api/movies` - List movies (includes `identification_status` field)
- `GET /api/movies/:id` - Get movie details
- `POST /api/movies/:id/refresh` - Trigger metadata refresh

**Media Players:**
- `GET /api/media-players` - List all players
- `GET /api/media-players/:id` - Get player by ID
- `GET /api/media-players/status` - SSE stream for player status

**Scheduler:**
- `GET /api/scheduler/status` - Get scheduler status

**Providers:**
- `GET /api/providers` - List configured providers

### Missing Endpoints ❌

**Job Queue API** (currently commented out in `src/routes/api.ts`):
- `GET /api/jobs` - List active jobs
- `GET /api/jobs/stats` - Queue statistics
- `GET /api/jobs/history` - Job history (completed/failed)
- `GET /api/jobs/:jobId` - Get specific job

**Library Stats:**
- Need to add stats to `GET /api/libraries/:id` response

### Identification Status Values

Movies have an `identification_status` field with these values:
- `'unidentified'` - Found in filesystem, no TMDB/TVDB match
- `'identified'` - Matched to provider (has tmdb_id or imdb_id)
- `'enriched'` - Metadata fetched from providers

---

## Implementation Plan

### Phase 1: Job Queue API (Backend - 2 days)

**Goal**: Implement missing job queue endpoints so frontend can display job activity

#### Backend Tasks

1. **Implement JobQueueService methods** (`src/services/jobQueue/JobQueueService.ts`):
   ```typescript
   async getActiveJobs(filters?: JobFilters): Promise<Job[]>
   async getJobHistory(filters?: JobHistoryFilters): Promise<JobHistoryRecord[]>
   async getStats(): Promise<QueueStats>
   async getJob(jobId: number): Promise<Job | null>
   ```

2. **Create JobController** (`src/controllers/jobController.ts`):
   ```typescript
   async getStats(req, res, next)      // GET /api/jobs/stats
   async getActive(req, res, next)     // GET /api/jobs
   async getHistory(req, res, next)    // GET /api/jobs/history
   async getJob(req, res, next)        // GET /api/jobs/:jobId
   ```

3. **Uncomment job routes** in `src/routes/api.ts`:
   ```typescript
   router.get('/jobs/stats', jobController.getStats);
   router.get('/jobs', jobController.getActive);
   router.get('/jobs/history', jobController.getHistory);
   router.get('/jobs/:jobId', jobController.getJob);
   ```

4. **Add library stats** to `GET /api/libraries/:id` response:
   ```typescript
   {
     id: 1,
     name: "Movies",
     path: "/movies",
     type: "movies",
     // Add stats here:
     stats: {
       total: 342,
       unidentified: 12,
       identified: 45,
       enriched: 285,
       lastScan: "2025-10-16T10:30:00Z"
     }
   }
   ```

#### API Response Formats

**GET /api/jobs/stats**:
```json
{
  "pending": 5,
  "processing": 2,
  "totalActive": 7,
  "oldestPendingAge": 120000
}
```

**GET /api/jobs** (with optional filters):
```json
{
  "jobs": [
    {
      "id": 123,
      "type": "directory-scan",
      "priority": 6,
      "status": "processing",
      "payload": { "libraryId": 1, "path": "/movies/Action" },
      "retry_count": 0,
      "max_retries": 3,
      "created_at": "2025-10-16T10:30:00Z",
      "started_at": "2025-10-16T10:30:05Z",
      "progress": {
        "current": 45,
        "total": 100,
        "percentage": 45,
        "message": "Scanning directory 45 of 100",
        "detail": "/movies/Action/The Matrix"
      }
    }
  ]
}
```

**GET /api/jobs/history**:
```json
{
  "history": [
    {
      "id": 1,
      "job_id": 120,
      "type": "library-scan",
      "priority": 3,
      "status": "completed",
      "payload": { "libraryId": 1 },
      "retry_count": 0,
      "created_at": "2025-10-16T10:00:00Z",
      "started_at": "2025-10-16T10:00:01Z",
      "completed_at": "2025-10-16T10:00:13Z",
      "duration_ms": 12000
    }
  ]
}
```

---

### Phase 2: Dashboard Page (Frontend - 3 days)

**Goal**: Create landing page showing library and media player status

**Route**: `/` (default landing page)

#### Page Layout

```
┌────────────────────────────────────────────────────────────────┐
│ Dashboard                                                      │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│ Libraries                                                      │
│ ┌──────────────────────┐  ┌──────────────────────┐            │
│ │ Movies Library       │  │ TV Shows Library     │            │
│ │ /mnt/media/movies    │  │ /mnt/media/tv        │            │
│ │                      │  │                      │            │
│ │ Total: 342           │  │ Total: 89            │            │
│ │ ├─ Unidentified: 12  │  │ ├─ Unidentified: 3   │            │
│ │ ├─ Identified: 45    │  │ ├─ Identified: 15    │            │
│ │ └─ Enriched: 285     │  │ └─ Enriched: 71      │            │
│ │                      │  │                      │            │
│ │ [Scanning... 82%]    │  │ Last scan: 2h ago    │            │
│ │ ████████░░           │  │                      │            │
│ │                      │  │                      │            │
│ │ [Scan] [View Movies] │  │ [Scan] [View Series] │            │
│ └──────────────────────┘  └──────────────────────┘            │
│                                                                │
│ Media Players                                                  │
│ ┌──────────────────────┐  ┌──────────────────────┐            │
│ │ 🟢 Living Room Kodi  │  │ 🔴 Bedroom Kodi      │            │
│ │ 192.168.1.100:8080   │  │ 192.168.1.101:8080   │            │
│ │ Playing: Inception   │  │ Not connected        │            │
│ │ 1:23:45 / 2:28:00    │  │                      │            │
│ └──────────────────────┘  └──────────────────────┘            │
│                                                                │
│ Recent Activity                             [View All History]│
│ ┌────────────────────────────────────────────────────────────┐│
│ │ 2m ago  • Library scan completed (Movies) - 12.3s          ││
│ │ 15m ago • Webhook received (Radarr: Inception)             ││
│ │ 1h ago  • Metadata enriched (Avatar) - 1.2s                ││
│ │ 2h ago  • Kodi notification failed (Living Room)           ││
│ └────────────────────────────────────────────────────────────┘│
└────────────────────────────────────────────────────────────────┘
```

#### Components to Build

**`src/pages/Dashboard.tsx`**:
```typescript
export const Dashboard: React.FC = () => {
  const { data: libraries } = useLibraries();
  const { data: players } = useMediaPlayers();
  const { data: recentJobs } = useJobHistory({ limit: 10 });

  return (
    <div className="content-spacing">
      <h1>Dashboard</h1>

      <section>
        <h2>Libraries</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {libraries?.map(library => (
            <LibraryStatusCard key={library.id} library={library} />
          ))}
        </div>
      </section>

      <section>
        <h2>Media Players</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {players?.map(player => (
            <MediaPlayerStatusCard key={player.id} player={player} />
          ))}
        </div>
      </section>

      <section>
        <h2>Recent Activity</h2>
        <RecentActivityList jobs={recentJobs?.history || []} />
      </section>
    </div>
  );
};
```

**`src/components/dashboard/LibraryStatusCard.tsx`**:
```typescript
interface LibraryStatusCardProps {
  library: Library;
}

export const LibraryStatusCard: React.FC<LibraryStatusCardProps> = ({ library }) => {
  const { scanProgress } = useLibraryScanProgress(library.id);
  const navigate = useNavigate();

  const total = library.stats?.total || 0;
  const unidentified = library.stats?.unidentified || 0;
  const identified = library.stats?.identified || 0;
  const enriched = library.stats?.enriched || 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{library.name}</CardTitle>
        <CardDescription>{library.path}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="text-sm">
            <div className="font-semibold">Total: {total}</div>
            <div className="ml-4 text-muted-foreground">
              <div>├─ Unidentified: {unidentified}</div>
              <div>├─ Identified: {identified}</div>
              <div>└─ Enriched: {enriched}</div>
            </div>
          </div>

          {scanProgress && (
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">
                Scanning... {scanProgress.percentage}%
              </div>
              <Progress value={scanProgress.percentage} />
              <div className="text-xs text-muted-foreground">
                {scanProgress.message}
              </div>
            </div>
          )}

          {!scanProgress && library.stats?.lastScan && (
            <div className="text-xs text-muted-foreground">
              Last scan: {formatDistance(new Date(library.stats.lastScan), new Date())} ago
            </div>
          )}
        </div>
      </CardContent>
      <CardFooter className="gap-2">
        <Button size="sm" onClick={() => handleScan(library.id)}>
          Scan
        </Button>
        <Button size="sm" variant="outline" onClick={() => navigate(`/metadata/${library.type}`)}>
          View {library.type}
        </Button>
      </CardFooter>
    </Card>
  );
};
```

**`src/components/dashboard/MediaPlayerStatusCard.tsx`**:
```typescript
interface MediaPlayerStatusCardProps {
  player: MediaPlayer;
}

export const MediaPlayerStatusCard: React.FC<MediaPlayerStatusCardProps> = ({ player }) => {
  const { status } = useMediaPlayerStatus(player.id);

  // Connection states:
  // - Kodi: "connected" = WebSocket established, "able to connect" = REST works
  // - Jellyfin/Plex: "able to connect" = REST works (no WebSocket)
  const connectionIcon = status?.connected ? '🟢' : '🔴';
  const connectionText = status?.connected
    ? (player.type === 'kodi' ? 'Connected' : 'Able to connect')
    : 'Not connected';

  return (
    <Card>
      <CardHeader>
        <CardTitle>{connectionIcon} {player.name}</CardTitle>
        <CardDescription>
          {player.host}:{player.port}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          <div className="text-sm">{connectionText}</div>

          {status?.playback && (
            <>
              <div className="text-sm font-medium">
                Playing: {status.playback.title}
              </div>
              <div className="text-xs text-muted-foreground">
                {formatTime(status.playback.position)} / {formatTime(status.playback.duration)}
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
```

**`src/components/dashboard/RecentActivityList.tsx`**:
```typescript
interface RecentActivityListProps {
  jobs: JobHistoryRecord[];
}

export const RecentActivityList: React.FC<RecentActivityListProps> = ({ jobs }) => {
  const navigate = useNavigate();

  return (
    <div className="space-y-2">
      {jobs.map(job => (
        <div key={job.id} className="flex items-start gap-3 text-sm">
          <div className="text-muted-foreground whitespace-nowrap">
            {formatDistance(new Date(job.completed_at), new Date())} ago
          </div>
          <div className="flex items-center gap-2">
            <JobTypeIcon type={job.type} />
            <span>{formatJobDescription(job)}</span>
            {job.status === 'completed' && (
              <span className="text-green-600">✓</span>
            )}
            {job.status === 'failed' && (
              <span className="text-red-600">✗</span>
            )}
          </div>
        </div>
      ))}

      <Button
        variant="link"
        onClick={() => navigate('/activity/history')}
      >
        View All History →
      </Button>
    </div>
  );
};
```

#### Hooks to Build

**`src/hooks/useLibraries.ts`** (enhance existing):
```typescript
export function useLibraries() {
  return useQuery({
    queryKey: ['libraries'],
    queryFn: async () => {
      const response = await fetch('/api/libraries');
      return response.json();
    },
  });
}
```

**`src/hooks/useLibraryScanProgress.ts`** (new):
```typescript
export function useLibraryScanProgress(libraryId: number) {
  const [scanProgress, setScanProgress] = useState<JobProgress | null>(null);
  const { socket } = useWebSocket();

  useEffect(() => {
    if (!socket) return;

    const handleScanProgress = (data: any) => {
      if (data.libraryId === libraryId) {
        setScanProgress(data.progress);
      }
    };

    const handleScanCompleted = (data: any) => {
      if (data.libraryId === libraryId) {
        setScanProgress(null);
        toast.success(`Library scan completed for ${data.libraryName}`);
      }
    };

    const handleScanFailed = (data: any) => {
      if (data.libraryId === libraryId) {
        setScanProgress(null);
        toast.error(`Library scan failed: ${data.error}`);
      }
    };

    socket.on('scan:progress', handleScanProgress);
    socket.on('scan:completed', handleScanCompleted);
    socket.on('scan:failed', handleScanFailed);

    return () => {
      socket.off('scan:progress', handleScanProgress);
      socket.off('scan:completed', handleScanCompleted);
      socket.off('scan:failed', handleScanFailed);
    };
  }, [socket, libraryId]);

  return { scanProgress };
}
```

**`src/hooks/useJobHistory.ts`** (new):
```typescript
export function useJobHistory(filters?: { limit?: number; type?: string }) {
  return useQuery({
    queryKey: ['jobs', 'history', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.limit) params.set('limit', filters.limit.toString());
      if (filters?.type) params.set('type', filters.type);

      const response = await fetch(`/api/jobs/history?${params}`);
      return response.json();
    },
  });
}
```

**`src/hooks/useMediaPlayerStatus.ts`** (new):
```typescript
export function useMediaPlayerStatus(playerId: number) {
  const [status, setStatus] = useState<any>(null);
  const { socket } = useWebSocket();

  useEffect(() => {
    if (!socket) return;

    const handlePlayerStatus = (data: any) => {
      if (data.playerId === playerId) {
        setStatus(data);
      }
    };

    socket.on('player:status', handlePlayerStatus);

    return () => {
      socket.off('player:status', handlePlayerStatus);
    };
  }, [socket, playerId]);

  return { status };
}
```

#### Toast Notifications

Use shadcn's Sonner component for toast notifications.

**Install Sonner** (if not already):
```bash
npm install sonner
```

**Update `src/App.tsx`**:
```typescript
import { Toaster } from 'sonner';

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WebSocketProvider>
        <AppRoutes />
        <Toaster position="bottom-right" />
        {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
      </WebSocketProvider>
    </QueryClientProvider>
  );
}
```

---

### Phase 3: Movies State Filtering (Frontend - 2 days)

**Goal**: Add filter dropdown to show movies by identification_status

#### Enhancement to Movies Page

**`src/pages/metadata/Movies.tsx`**:
```typescript
export const Movies: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('table');

  const { data: moviesData, isLoading, refetch } = useMovies({
    status: statusFilter === 'all' ? undefined : statusFilter
  });

  return (
    <>
      <div className="full-width-section">
        <ViewControls
          searchPlaceholder="Filter movies..."
          searchValue={searchTerm}
          onSearchChange={setSearchTerm}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onRefresh={refetch}

          // Add status filter
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
        />
      </div>

      <div className="content-spacing">
        <VirtualizedMovieTable
          movies={filteredMovies}
          onMovieClick={handleMovieClick}
          onRefreshClick={handleRefreshClick}
        />
      </div>
    </>
  );
};
```

**Enhance `src/components/ui/ViewControls.tsx`**:
```typescript
interface ViewControlsProps {
  // ... existing props
  statusFilter?: string;
  onStatusFilterChange?: (status: string) => void;
}

export const ViewControls: React.FC<ViewControlsProps> = ({
  // ... existing props
  statusFilter,
  onStatusFilterChange,
}) => {
  return (
    <div className="flex items-center gap-4">
      {/* Status Filter Dropdown */}
      {onStatusFilterChange && (
        <Select value={statusFilter} onValueChange={onStatusFilterChange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Movies" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Movies</SelectItem>
            <SelectItem value="unidentified">🔴 Unidentified</SelectItem>
            <SelectItem value="identified">🟡 Identified</SelectItem>
            <SelectItem value="enriched">🟢 Enriched</SelectItem>
          </SelectContent>
        </Select>
      )}

      {/* Existing search and view controls */}
      {/* ... */}
    </div>
  );
};
```

**Add State Badge to Movie Rows**:

**`src/components/movie/MovieStateBadge.tsx`** (new):
```typescript
interface MovieStateBadgeProps {
  status: 'unidentified' | 'identified' | 'enriched';
}

export const MovieStateBadge: React.FC<MovieStateBadgeProps> = ({ status }) => {
  const config = {
    unidentified: {
      icon: '🔴',
      label: 'Unidentified',
      className: 'bg-red-500/10 text-red-700 border-red-500/20',
    },
    identified: {
      icon: '🟡',
      label: 'Identified',
      className: 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20',
    },
    enriched: {
      icon: '🟢',
      label: 'Enriched',
      className: 'bg-green-500/10 text-green-700 border-green-500/20',
    },
  };

  const { icon, label, className } = config[status];

  return (
    <Badge variant="outline" className={className}>
      <span className="mr-1">{icon}</span>
      {label}
    </Badge>
  );
};
```

**Update `src/components/movie/MovieRow.tsx`**:
```typescript
// Add identification_status column
<TableCell>
  <MovieStateBadge status={movie.identification_status} />
</TableCell>
```

**Update `src/hooks/useMovies.ts`**:
```typescript
interface UseMoviesOptions {
  status?: string;
  libraryId?: number;
}

export function useMovies(options?: UseMoviesOptions) {
  return useQuery({
    queryKey: ['movies', options],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (options?.status) params.set('status', options.status);
      if (options?.libraryId) params.set('libraryId', options.libraryId.toString());

      const response = await fetch(`/api/movies?${params}`);
      return response.json();
    },
  });
}
```

**Backend Change Required**:

Ensure `GET /api/movies` returns `identification_status` in the response. Currently `MovieService.mapToMovie()` doesn't include it.

**Update `src/services/movieService.ts`**:
```typescript
private mapToMovie(row: any): Movie {
  return {
    id: row.id,
    title: row.title || '[Unknown]',
    year: row.year,
    studio: row.studio_name,
    monitored: row.monitored === 1,
    identification_status: row.identification_status, // ADD THIS
    assetCounts: { /* ... */ },
    assetStatuses: { /* ... */ },
  };
}
```

**Update `src/types/movie.ts`**:
```typescript
export interface Movie {
  id: number;
  title: string;
  year?: number;
  studio?: string;
  monitored: boolean;
  identification_status: 'unidentified' | 'identified' | 'enriched'; // ADD THIS
  assetCounts: AssetCounts;
  assetStatuses: AssetStatuses;
}
```

---

### Phase 4: Activity History Page (Frontend - 2 days)

**Goal**: Show job history from job_history table

**Route**: `/activity/history`

#### Page Layout

```
Activity → History

[Type: All ▼] [Status: All ▼] [Show: 100 ▼] [Search: _______]

┌────────────────────────────────────────────────────────────────┐
│ Time      Type              Description         Duration Status│
├────────────────────────────────────────────────────────────────┤
│ 2m ago    library-scan      Movies library      12.3s    ✓     │
│ 15m ago   webhook-received  Radarr: Inception   5.1s     ✓     │
│ 1h ago    enrich-metadata   Avatar             1.2s     ✓     │
│ 2h ago    notify-kodi       Living Room Kodi    0.5s     ✗     │
│ 3h ago    directory-scan    /movies/Action      3.4s     ✓     │
└────────────────────────────────────────────────────────────────┘
```

**`src/pages/activity/History.tsx`**:
```typescript
export const History: React.FC = () => {
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [limit, setLimit] = useState(100);

  const { data, isLoading } = useJobHistory({
    type: typeFilter === 'all' ? undefined : typeFilter,
    status: statusFilter === 'all' ? undefined : statusFilter as any,
    limit,
  });

  const jobs = data?.history || [];

  return (
    <div className="content-spacing">
      <div className="flex items-center gap-4 mb-6">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="library-scan">Library Scan</SelectItem>
            <SelectItem value="webhook-received">Webhook</SelectItem>
            <SelectItem value="enrich-metadata">Enrich Metadata</SelectItem>
            <SelectItem value="notify-kodi">Notify Kodi</SelectItem>
            {/* ... more job types */}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="completed">✓ Completed</SelectItem>
            <SelectItem value="failed">✗ Failed</SelectItem>
          </SelectContent>
        </Select>

        <Select value={limit.toString()} onValueChange={(v) => setLimit(Number(v))}>
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="Show 100" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="10">Show 10</SelectItem>
            <SelectItem value="50">Show 50</SelectItem>
            <SelectItem value="100">Show 100</SelectItem>
            <SelectItem value="300">Show 300</SelectItem>
            <SelectItem value="1000">Show 1000</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading && <div>Loading job history...</div>}

      {!isLoading && jobs.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          No job history found
        </div>
      )}

      {!isLoading && jobs.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.map(job => (
              <TableRow key={job.id}>
                <TableCell>
                  {formatDistance(new Date(job.completed_at), new Date())} ago
                </TableCell>
                <TableCell>
                  <Badge variant="outline">
                    <JobTypeIcon type={job.type} className="mr-1" />
                    {job.type}
                  </Badge>
                </TableCell>
                <TableCell>{formatJobDescription(job)}</TableCell>
                <TableCell>{(job.duration_ms / 1000).toFixed(1)}s</TableCell>
                <TableCell>
                  {job.status === 'completed' && (
                    <Badge variant="outline" className="bg-green-500/10 text-green-700">
                      ✓ Success
                    </Badge>
                  )}
                  {job.status === 'failed' && (
                    <Badge variant="outline" className="bg-red-500/10 text-red-700">
                      ✗ Failed
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
};
```

**Helper Functions**:

**`src/utils/jobFormatters.ts`** (new):
```typescript
import { JobHistoryRecord } from '../types/jobs';

export function formatJobDescription(job: JobHistoryRecord): string {
  switch (job.type) {
    case 'library-scan':
      return `Scanned ${job.payload.libraryName || 'library'}`;
    case 'webhook-received':
      return `Webhook: ${job.payload.source} - ${job.payload.title}`;
    case 'enrich-metadata':
      return `Enriched metadata for ${job.payload.title}`;
    case 'notify-kodi':
      return `Notified ${job.payload.playerName}`;
    case 'directory-scan':
      return `Scanned ${job.payload.path}`;
    default:
      return job.type;
  }
}
```

---

### Phase 5: System Status Page (Frontend - 2 days)

**Goal**: Show system health overview

**Route**: `/system/status`

#### Page Layout

```
System → Status

┌────────────────────────────────────────────────────────────────┐
│ Queue Statistics                                               │
├────────────────────────────────────────────────────────────────┤
│ Pending jobs: 5          Processing: 2                         │
│ Oldest pending: 2 minutes                                      │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│ Libraries                                                      │
├────────────────────────────────────────────────────────────────┤
│ Total libraries: 2                                             │
│ Total movies: 431    (Unidentified: 15, Identified: 60)       │
│ Total series: 89     (Unidentified: 3, Identified: 15)        │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│ Providers                                                      │
├────────────────────────────────────────────────────────────────┤
│ 🟢 TMDB       Enabled    Priority: 1                          │
│ 🟢 TVDB       Enabled    Priority: 2                          │
│ 🟢 FanArt.tv  Enabled    Priority: 3                          │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│ Media Players                                                  │
├────────────────────────────────────────────────────────────────┤
│ 🟢 Living Room Kodi    Connected                              │
│ 🔴 Bedroom Kodi        Not connected                          │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│ Schedulers                                                     │
├────────────────────────────────────────────────────────────────┤
│ File Scanner      Running    Next: in 15 minutes              │
│ Provider Updater  Running    Next: in 2 hours                 │
└────────────────────────────────────────────────────────────────┘
```

**`src/pages/system/Status.tsx`**:
```typescript
export const Status: React.FC = () => {
  const { data: queueStats } = useQuery({
    queryKey: ['jobs', 'stats'],
    queryFn: async () => {
      const response = await fetch('/api/jobs/stats');
      return response.json();
    },
  });

  const { data: libraries } = useLibraries();
  const { data: providers } = useProviders();
  const { data: players } = useMediaPlayers();
  const { data: schedulerStatus } = useQuery({
    queryKey: ['scheduler', 'status'],
    queryFn: async () => {
      const response = await fetch('/api/scheduler/status');
      return response.json();
    },
  });

  return (
    <div className="content-spacing space-y-6">
      {/* Queue Stats */}
      <Card>
        <CardHeader>
          <CardTitle>Queue Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-2xl font-bold">{queueStats?.pending || 0}</div>
              <div className="text-sm text-muted-foreground">Pending jobs</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{queueStats?.processing || 0}</div>
              <div className="text-sm text-muted-foreground">Processing</div>
            </div>
            <div>
              <div className="text-2xl font-bold">
                {queueStats?.oldestPendingAge
                  ? Math.floor(queueStats.oldestPendingAge / 60000)
                  : 0}m
              </div>
              <div className="text-sm text-muted-foreground">Oldest pending</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Libraries */}
      <Card>
        <CardHeader>
          <CardTitle>Libraries</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div>Total libraries: {libraries?.length || 0}</div>
            {libraries?.map(lib => (
              <div key={lib.id}>
                {lib.name}: {lib.stats?.total || 0} items
                {lib.stats && (
                  <span className="text-muted-foreground text-sm ml-2">
                    (Unidentified: {lib.stats.unidentified}, Identified: {lib.stats.identified})
                  </span>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Providers */}
      <Card>
        <CardHeader>
          <CardTitle>Providers</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {providers?.map(provider => (
              <div key={provider.name} className="flex items-center gap-2">
                <span>{provider.enabled ? '🟢' : '🔴'}</span>
                <span className="font-medium">{provider.name}</span>
                <Badge variant="outline">Priority: {provider.priority}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Media Players */}
      <Card>
        <CardHeader>
          <CardTitle>Media Players</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {players?.map(player => (
              <div key={player.id} className="flex items-center gap-2">
                <span>{player.enabled ? '🟢' : '🔴'}</span>
                <span className="font-medium">{player.name}</span>
                <span className="text-sm text-muted-foreground">
                  {player.enabled ? 'Connected' : 'Not connected'}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Schedulers */}
      <Card>
        <CardHeader>
          <CardTitle>Schedulers</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {schedulerStatus?.fileScanner && (
              <div>
                <div className="font-medium">File Scanner</div>
                <div className="text-sm text-muted-foreground">
                  Status: {schedulerStatus.fileScanner.running ? 'Running' : 'Stopped'}
                </div>
              </div>
            )}
            {schedulerStatus?.providerUpdater && (
              <div>
                <div className="font-medium">Provider Updater</div>
                <div className="text-sm text-muted-foreground">
                  Status: {schedulerStatus.providerUpdater.running ? 'Running' : 'Stopped'}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
```

---

## Timeline Summary

**Week 1:**
- Days 1-2: Backend job queue API implementation
- Days 3-5: Dashboard page (library cards, player cards, recent activity)

**Week 2:**
- Days 6-7: Movies state filtering + badges
- Days 8-10: Library scan progress (cards + toasts)

**Week 3:**
- Days 11-12: Activity History page
- Days 13-14: System Status page
- Day 15: Testing & polish

**Total**: 3 weeks (15 working days)

---

## Success Criteria

- [ ] Dashboard loads with library stats and player status
- [ ] Library scan shows real-time progress on cards
- [ ] Toast notifications appear for scan completion/failures
- [ ] Movies page can filter by identification_status
- [ ] State badges appear on movie rows
- [ ] Activity History shows job history from backend
- [ ] System Status shows health overview
- [ ] All WebSocket subscriptions auto-reconnect on disconnect
- [ ] Loading states and error handling throughout

---

## Open Questions Resolved

1. ✅ **Dashboard as landing page**: Yes
2. ✅ **Library stats location**: Option B - include in GET /api/libraries/:id
3. ✅ **Job queue API**: Implement full API (not activity_log shortcut)
4. ✅ **Media player status display**: Connection state + playback (if available)
5. ✅ **Scan progress display**: Progress on library cards + toast notifications

---

## Files to Create

**Backend:**
- `src/controllers/jobController.ts`

**Frontend:**
- `src/pages/Dashboard.tsx`
- `src/components/dashboard/LibraryStatusCard.tsx`
- `src/components/dashboard/MediaPlayerStatusCard.tsx`
- `src/components/dashboard/RecentActivityList.tsx`
- `src/components/movie/MovieStateBadge.tsx`
- `src/hooks/useLibraryScanProgress.ts`
- `src/hooks/useJobHistory.ts`
- `src/hooks/useMediaPlayerStatus.ts`
- `src/utils/jobFormatters.ts`
- `src/types/jobs.ts` (frontend job types)

**Files to Modify:**

**Backend:**
- `src/services/jobQueue/JobQueueService.ts` (add methods)
- `src/routes/api.ts` (uncomment job routes)
- `src/services/movieService.ts` (include identification_status in response)
- `src/services/libraryService.ts` (add stats to library response)

**Frontend:**
- `src/App.tsx` (add Toaster, change default route to Dashboard)
- `src/pages/metadata/Movies.tsx` (add status filter)
- `src/components/ui/ViewControls.tsx` (add status filter prop)
- `src/components/movie/MovieRow.tsx` (add state badge column)
- `src/pages/activity/History.tsx` (implement job history table)
- `src/pages/system/Status.tsx` (implement system health)
- `src/hooks/useMovies.ts` (add status filter param)
- `src/types/movie.ts` (add identification_status field)

---

## Next Steps

1. **Start with Phase 1**: Implement job queue API backend
2. **Then Phase 2**: Build Dashboard page
3. **Iterate through phases** with testing at each step

Ready to begin implementation?
