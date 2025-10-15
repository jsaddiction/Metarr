# WebSocket Job Progress Tracking

**Date**: 2025-10-15
**Feature**: Real-time job progress updates via WebSocket

---

## 🎯 Overview

Long-running jobs (library scans, metadata enrichment, asset downloads) can now report progress in real-time via WebSocket. The frontend can subscribe to these updates and show progress bars/spinners to users.

---

## 📊 Architecture

### Data Flow

```
Job Handler (Backend)
         │
         │ await jobQueue.updateJobProgress(job.id, {...})
         ▼
   JobQueueService
         │
         │ websocketBroadcaster.broadcast('job:progress', {...})
         ▼
   WebSocket Server
         │
         ├─→ Connected Client 1 (Frontend)
         ├─→ Connected Client 2 (Frontend)
         └─→ Connected Client 3 (Frontend)
              │
              └─→ Updates UI (progress bar, spinner, status text)
```

### WebSocket Events

**Job Lifecycle Events** (already implemented):
- `job:created` - Job added to queue
- `job:started` - Job picked for processing
- `job:progress` - **NEW** - Progress update during processing
- `job:completed` - Job finished successfully
- `job:failed` - Job failed (with retry info)

**Queue Stats** (already implemented):
- `queue:stats` - Queue statistics (pending, processing counts)

---

## 🔧 Implementation

### Backend: Reporting Progress

Job handlers can report progress using `jobQueue.updateJobProgress()`:

```typescript
async handleLibraryScan(job: Job): Promise<void> {
  const { libraryId, libraryPath } = job.payload;

  logger.info('[JobHandlers] Processing library scan', {
    service: 'JobHandlers',
    handler: 'handleLibraryScan',
    jobId: job.id,
    libraryId
  });

  // Get all directories to scan
  const directories = await this.getDirectories(libraryPath);
  const total = directories.length;

  logger.info('[JobHandlers] Found directories to scan', {
    jobId: job.id,
    total
  });

  // Scan each directory and report progress
  for (let i = 0; i < directories.length; i++) {
    const dir = directories[i];

    // Update progress
    await this.jobQueue.updateJobProgress(job.id, {
      current: i + 1,
      total,
      percentage: Math.round(((i + 1) / total) * 100),
      message: `Scanning directory ${i + 1} of ${total}`,
      detail: dir.name
    });

    // Do the actual work
    try {
      await this.scanDirectory(dir.path);
    } catch (error: any) {
      logger.error('[JobHandlers] Failed to scan directory', {
        jobId: job.id,
        directory: dir.path,
        error: error.message
      });
      // Continue with other directories
    }
  }

  logger.info('[JobHandlers] Library scan complete', {
    jobId: job.id,
    directoriesScanned: total
  });
}
```

### Frontend: Listening for Progress

```typescript
// React hook for job progress tracking
function useJobProgress(jobId: number) {
  const [progress, setProgress] = useState<JobProgress | null>(null);

  useEffect(() => {
    // Listen for progress updates
    const handleProgress = (data: { jobId: number; progress: JobProgress }) => {
      if (data.jobId === jobId) {
        setProgress(data.progress);
      }
    };

    // Subscribe to WebSocket event
    socket.on('job:progress', handleProgress);

    return () => {
      socket.off('job:progress', handleProgress);
    };
  }, [jobId]);

  return progress;
}

// Component example
function LibraryScanProgress({ jobId }: { jobId: number }) {
  const progress = useJobProgress(jobId);

  if (!progress) {
    return <div>Waiting to start...</div>;
  }

  return (
    <div>
      <div className="progress-bar">
        <div
          className="progress-fill"
          style={{ width: `${progress.percentage}%` }}
        />
      </div>
      <div className="progress-info">
        <span>{progress.message}</span>
        <span>{progress.percentage}%</span>
      </div>
      {progress.detail && (
        <div className="progress-detail">{progress.detail}</div>
      )}
    </div>
  );
}
```

---

## 📋 Progress Interface

```typescript
export interface JobProgress {
  current: number;    // Current step (e.g., 5)
  total: number;      // Total steps (e.g., 10)
  percentage: number; // Percentage complete (0-100)
  message?: string;   // Current operation (e.g., "Scanning directory 5 of 10")
  detail?: string;    // Additional detail (e.g., "/movies/The Matrix")
}
```

---

## 🎨 Use Cases

### 1. Library Scan

```typescript
await jobQueue.updateJobProgress(job.id, {
  current: 15,
  total: 100,
  percentage: 15,
  message: 'Scanning movie directories',
  detail: 'The Matrix (1999)'
});
```

**Frontend displays:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 15%
Scanning movie directories
The Matrix (1999)
```

---

### 2. Metadata Enrichment

```typescript
await jobQueue.updateJobProgress(job.id, {
  current: 3,
  total: 5,
  percentage: 60,
  message: 'Enriching metadata',
  detail: 'Fetching from TMDB'
});
```

**Frontend displays:**
```
████████████████████████████████▪▪▪▪▪▪▪▪▪▪▪▪▪▪ 60%
Enriching metadata
Fetching from TMDB
```

---

### 3. Asset Download

```typescript
await jobQueue.updateJobProgress(job.id, {
  current: 23,
  total: 50,
  percentage: 46,
  message: 'Downloading assets',
  detail: 'poster_4k.jpg (2.5 MB)'
});
```

**Frontend displays:**
```
████████████████████████████▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪ 46%
Downloading assets
poster_4k.jpg (2.5 MB)
```

---

## 🔍 When to Report Progress

**Report progress for**:
- ✅ Library scans (many directories)
- ✅ Bulk metadata enrichment (many movies)
- ✅ Asset downloads (many files)
- ✅ Publishing (multiple operations)
- ✅ Scheduled tasks (long-running)

**Don't report progress for**:
- ❌ Quick operations (< 5 seconds)
- ❌ Webhook processing (fan-out is instant)
- ❌ Notifications (too fast)
- ❌ Database queries (too fast)

---

## 📡 WebSocket Protocol

### Event: `job:progress`

**Payload**:
```json
{
  "jobId": 123,
  "progress": {
    "current": 5,
    "total": 10,
    "percentage": 50,
    "message": "Scanning directory 5 of 10",
    "detail": "/movies/The Matrix"
  }
}
```

**Frequency**: Update every N operations (not every item)
```typescript
// Good: Update every 10 items
if (i % 10 === 0) {
  await jobQueue.updateJobProgress(...);
}

// Bad: Update every item (too many WebSocket messages)
await jobQueue.updateJobProgress(...); // In tight loop
```

---

## 🎯 Example: Library Scan with Progress

```typescript
async handleScheduledFileScan(job: Job): Promise<void> {
  logger.info('[JobHandlers] Starting scheduled file scan', {
    service: 'JobHandlers',
    handler: 'handleScheduledFileScan',
    jobId: job.id
  });

  // Get all libraries
  const libraries = await this.db.query<{ id: number; name: string; path: string }>(
    'SELECT id, name, path FROM libraries WHERE enabled = 1'
  );

  const totalLibraries = libraries.length;

  // Scan each library
  for (let i = 0; i < libraries.length; i++) {
    const library = libraries[i];

    // Report progress (per library)
    await this.jobQueue.updateJobProgress(job.id, {
      current: i + 1,
      total: totalLibraries,
      percentage: Math.round(((i + 1) / totalLibraries) * 100),
      message: `Scanning library ${i + 1} of ${totalLibraries}`,
      detail: library.name
    });

    // Get directories in library
    const directories = await this.getDirectories(library.path);
    const totalDirs = directories.length;

    logger.info('[JobHandlers] Scanning library', {
      jobId: job.id,
      libraryId: library.id,
      libraryName: library.name,
      directories: totalDirs
    });

    // Scan each directory (report every 10 directories)
    for (let j = 0; j < directories.length; j++) {
      const dir = directories[j];

      // Report sub-progress every 10 directories
      if (j % 10 === 0) {
        await this.jobQueue.updateJobProgress(job.id, {
          current: i + 1,
          total: totalLibraries,
          percentage: Math.round(((i + (j / totalDirs)) / totalLibraries) * 100),
          message: `Scanning ${library.name}`,
          detail: `${j} of ${totalDirs} directories`
        });
      }

      // Scan directory
      try {
        await this.scanDirectory(library.id, dir.path);
      } catch (error: any) {
        logger.error('[JobHandlers] Directory scan failed', {
          jobId: job.id,
          directory: dir.path,
          error: error.message
        });
        // Continue with other directories
      }
    }

    logger.info('[JobHandlers] Library scan complete', {
      jobId: job.id,
      libraryId: library.id,
      directoriesScanned: totalDirs
    });
  }

  logger.info('[JobHandlers] Scheduled file scan complete', {
    jobId: job.id,
    librariesScanned: totalLibraries
  });
}
```

---

## 🚀 Benefits

1. **Real-time Feedback**: Users see progress instantly
2. **No Polling**: WebSocket push (not HTTP polling)
3. **Minimal Overhead**: Progress not stored in DB (just broadcasted)
4. **Cancellation Feedback**: User knows job is still running
5. **Debugging**: See exactly where long-running job is stuck

---

## 🎨 Frontend Implementation Ideas

### Progress Bar Component
```tsx
function JobProgressBar({ jobId }: { jobId: number }) {
  const progress = useJobProgress(jobId);
  const [status, setStatus] = useState<'pending' | 'processing' | 'completed' | 'failed'>('pending');

  // Listen for job lifecycle events
  useEffect(() => {
    const handleStarted = (data: { jobId: number }) => {
      if (data.jobId === jobId) setStatus('processing');
    };

    const handleCompleted = (data: { jobId: number }) => {
      if (data.jobId === jobId) setStatus('completed');
    };

    const handleFailed = (data: { jobId: number }) => {
      if (data.jobId === jobId) setStatus('failed');
    };

    socket.on('job:started', handleStarted);
    socket.on('job:completed', handleCompleted);
    socket.on('job:failed', handleFailed);

    return () => {
      socket.off('job:started', handleStarted);
      socket.off('job:completed', handleCompleted);
      socket.off('job:failed', handleFailed);
    };
  }, [jobId]);

  if (status === 'completed') {
    return <div className="success">✓ Job completed!</div>;
  }

  if (status === 'failed') {
    return <div className="error">✗ Job failed</div>;
  }

  if (status === 'pending') {
    return <div className="pending">Waiting to start...</div>;
  }

  // Processing
  return (
    <div className="job-progress">
      <div className="progress-bar">
        <div
          className="fill"
          style={{ width: `${progress?.percentage || 0}%` }}
        />
      </div>
      <div className="info">
        <span>{progress?.message || 'Processing...'}</span>
        <span className="percentage">{progress?.percentage || 0}%</span>
      </div>
      {progress?.detail && (
        <div className="detail">{progress.detail}</div>
      )}
    </div>
  );
}
```

### Job Queue Dashboard
```tsx
function JobQueueDashboard() {
  const [activeJobs, setActiveJobs] = useState<Job[]>([]);

  useEffect(() => {
    // Fetch active jobs
    fetch('/api/jobs').then(r => r.json()).then(setActiveJobs);

    // Listen for new jobs
    socket.on('job:created', (data) => {
      setActiveJobs(prev => [...prev, data]);
    });

    socket.on('job:completed', (data) => {
      setActiveJobs(prev => prev.filter(j => j.jobId !== data.jobId));
    });

    socket.on('job:failed', (data) => {
      setActiveJobs(prev => prev.filter(j => j.jobId !== data.jobId));
    });

    return () => {
      socket.off('job:created');
      socket.off('job:completed');
      socket.off('job:failed');
    };
  }, []);

  return (
    <div className="job-queue">
      <h2>Active Jobs ({activeJobs.length})</h2>
      {activeJobs.map(job => (
        <JobProgressBar key={job.jobId} jobId={job.jobId} />
      ))}
    </div>
  );
}
```

---

## ✅ Summary

**What we built**:
- ✅ `JobProgress` interface for structured progress data
- ✅ `updateJobProgress()` method on JobQueueService
- ✅ WebSocket broadcasting of `job:progress` events
- ✅ Progress not stored in DB (ephemeral, real-time only)

**What handlers can do**:
```typescript
// Report progress in long-running jobs
await jobQueue.updateJobProgress(job.id, {
  current: 5,
  total: 10,
  percentage: 50,
  message: 'Current operation',
  detail: 'Additional context'
});
```

**What frontend can do**:
```typescript
// Listen for progress updates
socket.on('job:progress', (data) => {
  if (data.jobId === myJobId) {
    updateProgressBar(data.progress.percentage);
    updateStatusText(data.progress.message);
  }
});
```

**Result**: Real-time job progress tracking with minimal overhead! 🚀
