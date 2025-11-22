# Phase 5: UI Components & API Design
## Multi-Provider Metadata Aggregation - User Interface

**Created**: 2025-11-22
**Author**: Casey (Frontend Specialist)
**Status**: Design Complete - Ready for Implementation

---

## Table of Contents

1. [API Endpoint Specifications](#api-endpoint-specifications)
2. [UI Component Designs](#ui-component-designs)
3. [Data Flow Diagrams](#data-flow-diagrams)
4. [User Interactions](#user-interactions)
5. [Implementation Notes](#implementation-notes)

---

## API Endpoint Specifications

### 1. Library Completeness Statistics

**Purpose**: Get library-wide completeness metrics for dashboard widget

```
GET /api/movies/enrichment/stats

Response: 200 OK
{
  "success": true,
  "data": {
    "total": 1523,
    "enriched": 1200,
    "partiallyEnriched": 250,
    "unenriched": 73,
    "averageCompleteness": 78.5,
    "topIncomplete": [
      {
        "id": 456,
        "title": "The Matrix",
        "year": 1999,
        "completeness": 45,
        "missingFields": ["tagline", "awards", "rotten_tomatoes_score"]
      },
      {
        "id": 789,
        "title": "Inception",
        "year": 2010,
        "completeness": 52,
        "missingFields": ["awards", "metacritic_score"]
      }
      // ... up to 10 items
    ]
  }
}

Error Cases:
- 500: Database error
```

---

### 2. Movie Enrichment Status

**Purpose**: Get detailed enrichment status for a specific movie

```
GET /api/movies/:id/enrichment-status

Response: 200 OK
{
  "success": true,
  "data": {
    "movieId": 123,
    "completeness": 85,
    "lastEnriched": "2025-11-22T10:30:00Z",
    "enrichmentDuration": 2.3,  // seconds
    "partial": false,
    "rateLimitedProviders": [],
    "missingFields": [
      {
        "field": "tagline",
        "displayName": "Tagline",
        "category": "metadata"
      },
      {
        "field": "awards",
        "displayName": "Awards",
        "category": "metadata"
      }
    ],
    "fieldSources": {
      "plot": "tmdb",
      "imdb_rating": "omdb",
      "rotten_tomatoes_score": "omdb",
      "poster": "fanart"
    }
  }
}

When Partial Enrichment Occurred:
{
  "success": true,
  "data": {
    "movieId": 456,
    "completeness": 65,
    "lastEnriched": "2025-11-22T09:15:00Z",
    "enrichmentDuration": 1.8,
    "partial": true,
    "rateLimitedProviders": ["omdb"],
    "missingFields": [
      {
        "field": "rotten_tomatoes_score",
        "displayName": "Rotten Tomatoes Score",
        "category": "ratings"
      },
      {
        "field": "metacritic_score",
        "displayName": "Metacritic Score",
        "category": "ratings"
      },
      {
        "field": "awards",
        "displayName": "Awards",
        "category": "metadata"
      }
    ],
    "fieldSources": {
      "plot": "tmdb",
      "poster": "fanart"
    }
  }
}

Error Cases:
- 404: Movie not found
- 500: Database error
```

---

### 3. Trigger Manual Enrichment

**Purpose**: User clicks "Refresh Metadata" button

```
POST /api/movies/:id/enrich
Content-Type: application/json

Request Body:
{
  "force": false  // Optional: bypass cache (default: false)
}

Response: 202 Accepted
{
  "success": true,
  "data": {
    "jobId": 789,
    "message": "Enrichment job queued",
    "estimatedDuration": 3  // seconds
  }
}

Error Cases:
- 404: Movie not found
- 409: Enrichment already in progress for this movie
- 429: Too many manual enrichment requests (rate limit)
- 500: Failed to queue job
```

---

### 4. Bulk Enrichment Status

**Purpose**: Get status of last and next scheduled bulk enrichment

```
GET /api/enrichment/bulk-status

Response: 200 OK
{
  "success": true,
  "data": {
    "lastRun": {
      "startedAt": "2025-11-22T03:00:00Z",
      "completedAt": "2025-11-22T03:45:23Z",
      "status": "completed",
      "stats": {
        "totalMovies": 1523,
        "processed": 1200,
        "skipped": 323,
        "failed": 0
      },
      "rateLimitHit": false,
      "rateLimitedProviders": []
    },
    "nextRun": {
      "scheduledAt": "2025-11-23T03:00:00Z",
      "timeUntil": 79200  // seconds (22 hours)
    },
    "currentRun": null  // or job details if running
  }
}

When Bulk Job is Running:
{
  "success": true,
  "data": {
    "lastRun": { ... },
    "nextRun": { ... },
    "currentRun": {
      "jobId": 890,
      "startedAt": "2025-11-22T03:00:00Z",
      "progress": 42,  // percentage
      "processedMovies": 640,
      "totalMovies": 1523,
      "currentMovie": {
        "id": 641,
        "title": "The Dark Knight"
      },
      "rateLimitedProviders": []
    }
  }
}

When Rate Limit Hit During Bulk:
{
  "success": true,
  "data": {
    "lastRun": {
      "startedAt": "2025-11-22T03:00:00Z",
      "completedAt": "2025-11-22T03:15:00Z",
      "status": "partial",  // stopped early
      "stats": {
        "totalMovies": 1523,
        "processed": 500,
        "skipped": 1023,  // stopped when rate limit hit
        "failed": 0
      },
      "rateLimitHit": true,
      "rateLimitedProviders": ["omdb"]
    },
    ...
  }
}

Error Cases:
- 500: Database error
```

---

### 5. Trigger Manual Bulk Enrichment

**Purpose**: "Run Now" button in Settings → Enrichment

```
POST /api/enrichment/bulk-run
Content-Type: application/json

Request Body:
{
  "force": false  // Optional: bypass cache (default: false)
}

Response: 202 Accepted
{
  "success": true,
  "data": {
    "jobId": 901,
    "message": "Bulk enrichment job started",
    "estimatedDuration": 2700  // seconds (~45 min for 1500 movies)
  }
}

Error Cases:
- 409: Bulk enrichment already running
- 429: Rate limited (manual run triggered too frequently)
- 500: Failed to start job
```

---

### 6. WebSocket Events for Real-Time Updates

**Purpose**: Live progress updates during enrichment

#### Connection
```typescript
const ws = new WebSocket('ws://localhost:3000/ws');
```

#### Subscribe to Movie Enrichment
```typescript
// Client sends
{
  "type": "subscribe",
  "channel": "movie:enrichment",
  "movieId": 123
}

// Server sends on progress
{
  "type": "enrichment:progress",
  "movieId": 123,
  "progress": 33,  // percentage
  "currentProvider": "omdb",
  "providersComplete": ["tmdb"],
  "providersRemaining": ["omdb", "fanart"]
}

// Server sends on completion
{
  "type": "enrichment:complete",
  "movieId": 123,
  "completeness": 92,
  "partial": false,
  "rateLimitedProviders": []
}

// Server sends on failure
{
  "type": "enrichment:failed",
  "movieId": 123,
  "error": "All providers failed"
}
```

#### Subscribe to Bulk Enrichment
```typescript
// Client sends
{
  "type": "subscribe",
  "channel": "bulk:enrichment"
}

// Server sends periodic updates
{
  "type": "bulk:progress",
  "jobId": 901,
  "progress": 42,
  "processedMovies": 640,
  "totalMovies": 1523,
  "currentMovie": {
    "id": 641,
    "title": "The Dark Knight"
  },
  "rateLimitedProviders": []
}

// Server sends when rate limit hit
{
  "type": "bulk:rate_limit",
  "jobId": 901,
  "provider": "omdb",
  "processedMovies": 500,
  "totalMovies": 1523,
  "message": "OMDB rate limit reached - stopping bulk enrichment"
}

// Server sends on completion
{
  "type": "bulk:complete",
  "jobId": 901,
  "stats": {
    "totalMovies": 1523,
    "processed": 1200,
    "skipped": 323,
    "failed": 0
  },
  "rateLimitHit": false
}
```

---

## UI Component Designs

### Component 1: CompletenessStatCard (Dashboard Widget)

**Location**: `public/frontend/src/components/dashboard/CompletenessStatCard.tsx`

**Props**:
```typescript
interface CompletenessStatCardProps {
  // No props - fetches its own data
}
```

**API**:
- `GET /api/movies/enrichment/stats`

**Visual Description**:
```
┌─────────────────────────────────────────────┐
│ Library Completeness                    [?] │ <- Tooltip: "Metadata completeness tracking"
├─────────────────────────────────────────────┤
│                                             │
│   Average: 78.5%                            │
│   ████████████████░░░░░░ (78.5%)           │ <- Progress bar
│                                             │
│   Enriched:  1200 / 1523 movies            │
│   Partial:   250                            │
│   Missing:   73                             │
│                                             │
│   Most Incomplete Movies:                   │
│   ┌───────────────────────────────────┐    │
│   │ The Matrix (1999)          45%    │    │
│   │ Inception (2010)           52%    │    │
│   │ Interstellar (2014)        58%    │    │
│   └───────────────────────────────────┘    │
│                                             │
│   [View All Incomplete Movies]             │
└─────────────────────────────────────────────┘
```

**Interactions**:
- Hover over `[?]` → Tooltip explaining completeness
- Click movie title → Navigate to movie edit page
- Click "View All Incomplete Movies" → Navigate to `/media/movies?filter=incomplete&sort=completeness:asc`

**Loading State**:
```
┌─────────────────────────────────────────────┐
│ Library Completeness                        │
├─────────────────────────────────────────────┤
│                                             │
│   Loading completeness data...             │
│   [Skeleton placeholder]                    │
│                                             │
└─────────────────────────────────────────────┘
```

**Empty State** (no movies):
```
┌─────────────────────────────────────────────┐
│ Library Completeness                        │
├─────────────────────────────────────────────┤
│                                             │
│   No movies in library                     │
│   Add a library to get started             │
│                                             │
└─────────────────────────────────────────────┘
```

**Error State**:
```
┌─────────────────────────────────────────────┐
│ Library Completeness                        │
├─────────────────────────────────────────────┤
│                                             │
│   ⚠ Failed to load completeness data       │
│   [Retry]                                   │
│                                             │
└─────────────────────────────────────────────┘
```

---

### Component 2: EnrichmentStatusSection (Movie Detail - Metadata Tab)

**Location**: `public/frontend/src/components/movie/EnrichmentStatusSection.tsx`

**Props**:
```typescript
interface EnrichmentStatusSectionProps {
  movieId: number;
}
```

**API**:
- `GET /api/movies/:id/enrichment-status`
- `POST /api/movies/:id/enrich` (on button click)
- WebSocket: `movie:enrichment` channel

**Visual Description** (Normal State):
```
┌─────────────────────────────────────────────────────┐
│ Enrichment Status                                   │
├─────────────────────────────────────────────────────┤
│                                                     │
│   Completeness: 85%                                 │
│   ████████████████████░░░░ (85%)                   │ <- Green progress bar
│                                                     │
│   Last enriched: 2 days ago                         │
│   Duration: 2.3 seconds                             │
│                                                     │
│   Missing Fields (3):                               │
│   • Tagline                                         │
│   • Awards                                          │
│   • Metacritic Score                                │
│                                                     │
│   [Refresh Metadata]                                │ <- Primary button
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Visual Description** (Partial Enrichment - Warning State):
```
┌─────────────────────────────────────────────────────┐
│ Enrichment Status                              ⚠    │ <- Warning icon
├─────────────────────────────────────────────────────┤
│                                                     │
│   Completeness: 65%                                 │
│   ████████████░░░░░░░░░░░░ (65%)                   │ <- Amber progress bar
│                                                     │
│   ⚠ Partial enrichment - some providers failed     │
│   Rate-limited providers: OMDB                      │
│                                                     │
│   Last enriched: 3 hours ago                        │
│   Duration: 1.8 seconds                             │
│                                                     │
│   Missing Fields (3):                               │
│   • Rotten Tomatoes Score (OMDB)                    │
│   • Metacritic Score (OMDB)                         │
│   • Awards (OMDB)                                   │
│                                                     │
│   [Refresh Metadata]  [View Provider Status]        │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Visual Description** (Enrichment In Progress):
```
┌─────────────────────────────────────────────────────┐
│ Enrichment Status                              🔄   │ <- Spinning icon
├─────────────────────────────────────────────────────┤
│                                                     │
│   Enriching metadata...                             │
│   Current provider: OMDB                            │
│   ████████░░░░░░░░░░░░░░░░ (33%)                   │ <- Animated progress
│                                                     │
│   Providers completed: TMDB                         │
│   Providers remaining: OMDB, Fanart                 │
│                                                     │
│   [Cancel]                                          │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Interactions**:
- Click "Refresh Metadata" → POST to enrich endpoint → Show progress state
- Click "View Provider Status" → Expand accordion with provider details
- Click "Cancel" (during enrichment) → Cancel job
- Real-time progress via WebSocket updates

---

### Component 3: BulkEnrichmentCard (Settings → General Page)

**Location**: `public/frontend/src/components/settings/BulkEnrichmentCard.tsx`

**Props**:
```typescript
interface BulkEnrichmentCardProps {
  // No props - fetches its own data
}
```

**API**:
- `GET /api/enrichment/bulk-status`
- `POST /api/enrichment/bulk-run` (on button click)
- WebSocket: `bulk:enrichment` channel

**Visual Description** (Idle State):
```
┌─────────────────────────────────────────────────────┐
│ Bulk Metadata Enrichment                            │
├─────────────────────────────────────────────────────┤
│                                                     │
│   Scheduled Run: Daily at 3:00 AM                   │
│   Next run: in 22 hours                             │
│                                                     │
│   Last Run: Nov 22, 2025 3:00 AM                    │
│   Status: ✓ Completed                               │
│   Processed: 1200 / 1523 movies                     │
│   Skipped: 323 (already enriched)                   │
│   Failed: 0                                         │
│   Duration: 45 minutes                              │
│                                                     │
│   [Run Now]  [View History]                         │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Visual Description** (Running State):
```
┌─────────────────────────────────────────────────────┐
│ Bulk Metadata Enrichment                       🔄   │
├─────────────────────────────────────────────────────┤
│                                                     │
│   Enriching library...                              │
│   ████████████████░░░░░░░░░░ (42%)                 │
│                                                     │
│   Progress: 640 / 1523 movies                       │
│   Current: The Dark Knight (2008)                   │
│   Elapsed: 18 minutes                               │
│   Estimated remaining: 25 minutes                   │
│                                                     │
│   [Cancel]                                          │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Visual Description** (Rate Limit Hit):
```
┌─────────────────────────────────────────────────────┐
│ Bulk Metadata Enrichment                       ⚠    │
├─────────────────────────────────────────────────────┤
│                                                     │
│   Last Run: Nov 22, 2025 3:00 AM                    │
│   Status: ⚠ Partial (Rate Limit Hit)                │
│   ⚠ OMDB rate limit reached - stopped early         │
│                                                     │
│   Processed: 500 / 1523 movies                      │
│   Remaining: 1023 (will retry tomorrow)             │
│   Duration: 15 minutes                              │
│                                                     │
│   Next run: in 22 hours                             │
│   (Will continue from movie #501)                   │
│                                                     │
│   [View Details]                                    │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Interactions**:
- Click "Run Now" → POST to bulk-run endpoint → Show running state
- Click "Cancel" → Cancel bulk job
- Click "View History" → Navigate to `/activity/history?type=bulk_enrichment`
- Click "View Details" → Expand accordion with provider details
- Real-time progress via WebSocket updates

---

### Component 4: EnrichmentHealthBadge (Reusable Component)

**Location**: `public/frontend/src/components/movie/EnrichmentHealthBadge.tsx`

**Props**:
```typescript
interface EnrichmentHealthBadgeProps {
  completeness: number;  // 0-100
  partial?: boolean;
  size?: 'sm' | 'md' | 'lg';
}
```

**Visual Description**:
```
Completeness >= 90%:
  [✓ 92%]  <- Green badge

Completeness 60-89%:
  [● 78%]  <- Yellow/amber badge

Completeness < 60%:
  [! 45%]  <- Red badge

Partial enrichment (any completeness):
  [⚠ 65%]  <- Amber badge with warning icon
```

**Usage Examples**:
```typescript
// In movie table row
<EnrichmentHealthBadge completeness={85} size="sm" />

// In movie detail header
<EnrichmentHealthBadge
  completeness={65}
  partial={true}
  size="md"
/>

// In dashboard widget
<EnrichmentHealthBadge completeness={92} size="lg" />
```

---

## Data Flow Diagrams

### Flow 1: Dashboard Completeness Widget

```
Component Mount
    ↓
useQuery → GET /api/movies/enrichment/stats
    ↓
Loading State → Show skeleton
    ↓
Data Received
    ↓
Render:
  - Average completeness (progress bar)
  - Category breakdown (enriched/partial/missing)
  - Top 10 incomplete movies list
    ↓
User Clicks Movie → Navigate to /media/movies/:id/edit
```

---

### Flow 2: Movie Detail - Manual Refresh

```
User on Movie Edit Page
    ↓
useQuery → GET /api/movies/:id/enrichment-status
    ↓
Render Enrichment Status Section
    ↓
User Clicks "Refresh Metadata"
    ↓
useMutation → POST /api/movies/:id/enrich
    ↓
Show Progress State (spinner)
    ↓
WebSocket Connected → Subscribe to movie:enrichment channel
    ↓
Receive Progress Events:
  - enrichment:progress (33%, 66%, 100%)
  - enrichment:complete
    ↓
Invalidate Queries:
  - ['movie', movieId] → Refetch movie data
  - ['movie', movieId, 'enrichment-status'] → Refetch status
    ↓
Show Success State → Updated completeness %
```

---

### Flow 3: Bulk Enrichment - Scheduled Job

```
Cron Job Triggers at 3:00 AM
    ↓
Backend → Create bulk enrichment job
    ↓
Job Queue → Process job
    ↓
For Each Movie (ORDER BY id ASC):
  ↓
  Fetch from providers (OMDB, TMDB, Fanart)
    ↓
  Check for rate limit:
    - If rate limit → STOP job, mark as partial
    - If success → Continue
    ↓
  Apply metadata (fill gaps logic)
    ↓
  Emit WebSocket event → bulk:progress
    ↓
Next Movie...
    ↓
Job Complete → Emit bulk:complete
    ↓
Users with Settings page open see real-time updates
```

---

### Flow 4: Bulk Enrichment - Manual Run

```
User on Settings → General Page
    ↓
useQuery → GET /api/enrichment/bulk-status
    ↓
Render Bulk Enrichment Card (Idle State)
    ↓
User Clicks "Run Now"
    ↓
useMutation → POST /api/enrichment/bulk-run
    ↓
Show Progress State
    ↓
WebSocket Connected → Subscribe to bulk:enrichment channel
    ↓
Receive Progress Events Every 5 Seconds:
  - bulk:progress (progress %, current movie)
    ↓
Update Progress Bar and Stats
    ↓
Receive Rate Limit Event (if hit):
  - bulk:rate_limit
    ↓
Show Warning State (rate limit hit)
    ↓
Receive Completion Event:
  - bulk:complete
    ↓
Invalidate Queries → Refetch bulk status
    ↓
Show Final Results
```

---

## User Interactions

### Scenario 1: User Wants to Know Library Health

**Entry Point**: Dashboard

1. User opens Metarr dashboard
2. Sees "Library Completeness" widget showing 78.5% average
3. Widget shows top 3 incomplete movies
4. User clicks "The Matrix (1999) - 45%" → Navigates to movie edit page
5. Sees enrichment status section showing missing fields
6. Clicks "Refresh Metadata" button
7. Watches real-time progress (33% → 66% → 100%)
8. Completeness updates to 92% (filled in missing fields)

**Result**: User successfully enriched a specific movie

---

### Scenario 2: User Notices Partial Enrichment Warning

**Entry Point**: Movie edit page

1. User edits movie "Inception"
2. Sees amber warning badge: "⚠ Partial enrichment - some providers failed"
3. Expands "Missing Fields" section:
   - Rotten Tomatoes Score (OMDB)
   - Metacritic Score (OMDB)
   - Awards (OMDB)
4. Sees "Rate-limited providers: OMDB"
5. Clicks "View Provider Status" → Opens modal showing:
   - TMDB: ✓ Success (last fetched 3 hours ago)
   - OMDB: ✗ Rate limited (will retry at 3 AM)
   - Fanart: ✓ Success (last fetched 3 hours ago)
6. User understands OMDB is temporarily unavailable
7. Decides to wait for automatic retry at 3 AM

**Result**: User informed about rate limit, no panic

---

### Scenario 3: User Wants to Force Bulk Enrichment

**Entry Point**: Settings → General

1. User navigates to Settings → General
2. Sees "Bulk Metadata Enrichment" card
3. Last run: 2 days ago (user just added OMDB API key)
4. Wants to enrich all movies immediately
5. Clicks "Run Now" button
6. Confirmation dialog: "This will enrich all 1523 movies. Continue?"
7. User confirms
8. Card updates to show progress:
   - Progress bar: 42%
   - Current: The Dark Knight (2008)
   - Processed: 640 / 1523
   - Elapsed: 18 minutes
   - Estimated remaining: 25 minutes
9. User leaves page (progress continues in background)
10. Returns later, sees "✓ Completed" status
11. Processed: 1523 / 1523 movies

**Result**: User successfully enriched entire library

---

### Scenario 4: Bulk Job Hits Rate Limit

**Entry Point**: Settings → General (background job)

1. Scheduled job runs at 3:00 AM
2. User is not logged in (job runs in background)
3. Job processes 500 movies successfully
4. Movie #501: OMDB rate limit detected
5. Job STOPS immediately (doesn't update movie #501)
6. Job marked as "partial" status
7. Next day at 8:00 AM, user opens Settings → General
8. Sees warning state:
   - "⚠ OMDB rate limit reached - stopped early"
   - Processed: 500 / 1523
   - Remaining: 1023 (will retry tomorrow)
9. User clicks "View Details" → Sees:
   - OMDB: Rate limit hit at 3:15 AM
   - TMDB: All requests successful
   - Fanart: All requests successful
10. User understands system will auto-retry tomorrow
11. Next day at 3:00 AM, job resumes from movie #501
12. If OMDB limit reset → completes remaining movies

**Result**: Graceful handling of rate limits, no data loss

---

## Implementation Notes

### Frontend Patterns to Follow

1. **TanStack Query Hooks** (existing pattern):
```typescript
// In hooks/useEnrichment.ts
export const useEnrichmentStats = () => {
  return useQuery({
    queryKey: ['enrichment', 'stats'],
    queryFn: () => enrichmentApi.getStats(),
    staleTime: 30000, // 30 seconds
  });
};

export const useMovieEnrichmentStatus = (movieId: number) => {
  return useQuery({
    queryKey: ['movie', movieId, 'enrichment-status'],
    queryFn: () => enrichmentApi.getMovieStatus(movieId),
    staleTime: 10000, // 10 seconds
  });
};

export const useTriggerEnrichment = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ movieId }: { movieId: number }) =>
      enrichmentApi.triggerEnrich(movieId),
    onSuccess: (data, { movieId }) => {
      queryClient.invalidateQueries({ queryKey: ['movie', movieId] });
      queryClient.invalidateQueries({
        queryKey: ['movie', movieId, 'enrichment-status']
      });
    },
  });
};
```

2. **WebSocket Integration** (existing pattern from library scans):
```typescript
// In components - similar to LibraryStatusCard.tsx pattern
const { data: enrichmentStatus } = useMovieEnrichmentStatus(movieId);
const [liveProgress, setLiveProgress] = useState<number | null>(null);

useEffect(() => {
  if (!movieId) return;

  const ws = new WebSocket(`ws://localhost:3000/ws`);

  ws.onopen = () => {
    ws.send(JSON.stringify({
      type: 'subscribe',
      channel: 'movie:enrichment',
      movieId,
    }));
  };

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.type === 'enrichment:progress') {
      setLiveProgress(message.progress);
    } else if (message.type === 'enrichment:complete') {
      setLiveProgress(null);
      queryClient.invalidateQueries(['movie', movieId, 'enrichment-status']);
    }
  };

  return () => ws.close();
}, [movieId]);
```

3. **Progress Bar** (existing component):
```typescript
import { Progress } from '@/components/ui/progress';

// Usage
<Progress
  value={completeness}
  className={cn(
    "h-2",
    completeness >= 90 && "bg-green-500",
    completeness >= 60 && completeness < 90 && "bg-yellow-500",
    completeness < 60 && "bg-red-500"
  )}
/>
```

4. **Card Component** (existing pattern):
```typescript
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

<Card>
  <CardHeader>
    <CardTitle>Library Completeness</CardTitle>
  </CardHeader>
  <CardContent>
    {/* Content here */}
  </CardContent>
</Card>
```

---

### Backend API Implementation Notes

1. **Add to movieApi** in `utils/api.ts`:
```typescript
export const enrichmentApi = {
  async getStats(): Promise<EnrichmentStatsResponse> {
    return fetchApi('/movies/enrichment/stats');
  },

  async getMovieStatus(movieId: number): Promise<MovieEnrichmentStatus> {
    return fetchApi(`/movies/${movieId}/enrichment-status`);
  },

  async triggerEnrich(movieId: number, force = false): Promise<TriggerEnrichResponse> {
    return fetchApi(`/movies/${movieId}/enrich`, {
      method: 'POST',
      body: JSON.stringify({ force }),
    });
  },

  async getBulkStatus(): Promise<BulkEnrichmentStatus> {
    return fetchApi('/enrichment/bulk-status');
  },

  async triggerBulkRun(force = false): Promise<TriggerBulkResponse> {
    return fetchApi('/enrichment/bulk-run', {
      method: 'POST',
      body: JSON.stringify({ force }),
    });
  },
};
```

2. **Add TypeScript types** in `types/enrichment.ts`:
```typescript
export interface EnrichmentStatsResponse {
  success: true;
  data: {
    total: number;
    enriched: number;
    partiallyEnriched: number;
    unenriched: number;
    averageCompleteness: number;
    topIncomplete: Array<{
      id: number;
      title: string;
      year?: number;
      completeness: number;
      missingFields: string[];
    }>;
  };
}

export interface MovieEnrichmentStatus {
  success: true;
  data: {
    movieId: number;
    completeness: number;
    lastEnriched: string | null;
    enrichmentDuration: number | null;
    partial: boolean;
    rateLimitedProviders: string[];
    missingFields: Array<{
      field: string;
      displayName: string;
      category: string;
    }>;
    fieldSources: Record<string, string>;
  };
}

// ... more types
```

---

### Responsive Design Considerations

1. **Dashboard Widget** (mobile):
```
- Stack statistics vertically on mobile
- Show only top 3 incomplete movies
- Make movie titles truncate with ellipsis
```

2. **Movie Detail Enrichment Section** (mobile):
```
- Progress bar full width
- Missing fields in single column
- Button full width on mobile
```

3. **Bulk Enrichment Card** (tablet):
```
- Two-column layout for stats on tablet
- Single column on mobile
```

---

### Accessibility Notes

1. **Progress Bars**:
   - Add `aria-label` with current percentage
   - Use `role="progressbar"` with `aria-valuenow`, `aria-valuemin`, `aria-valuemax`

2. **Status Indicators**:
   - Use both color AND icons (don't rely on color alone)
   - Provide text alternatives for visual indicators

3. **Buttons**:
   - Clear labels ("Refresh Metadata" not just "Refresh")
   - Loading states with `aria-busy="true"`
   - Disabled states with explanatory tooltips

4. **Real-time Updates**:
   - Use `aria-live="polite"` for progress updates
   - Don't interrupt user with `aria-live="assertive"`

---

### Testing Checklist

**Unit Tests** (Component):
- [ ] CompletenessStatCard renders loading state
- [ ] CompletenessStatCard renders data correctly
- [ ] CompletenessStatCard handles empty state
- [ ] EnrichmentStatusSection shows correct completeness
- [ ] EnrichmentStatusSection shows partial warning
- [ ] BulkEnrichmentCard shows running state

**Integration Tests** (API):
- [ ] GET /api/movies/enrichment/stats returns valid data
- [ ] GET /api/movies/:id/enrichment-status returns status
- [ ] POST /api/movies/:id/enrich triggers job
- [ ] POST /api/enrichment/bulk-run starts bulk job
- [ ] WebSocket events received correctly

**E2E Tests** (User Flow):
- [ ] User can view completeness on dashboard
- [ ] User can trigger manual refresh
- [ ] User sees real-time progress during enrichment
- [ ] User can start bulk enrichment
- [ ] User sees bulk progress updates

---

## Summary

This Phase 5 design provides:

1. **4 New API Endpoints** for completeness tracking
2. **4 New UI Components** for dashboard and movie detail pages
3. **WebSocket Integration** for real-time progress
4. **Clear Data Flow** from API → Hook → Component
5. **User-Friendly Interactions** with proper error/loading states

The design follows existing Metarr patterns:
- TanStack Query for data fetching
- Radix UI components (Progress, Card, Badge)
- WebSocket for real-time updates
- Tailwind CSS v4 for styling

**Next Steps**: Implementation by Sam (implementation specialist) can begin immediately.
