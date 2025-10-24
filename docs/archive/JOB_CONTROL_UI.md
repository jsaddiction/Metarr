# Job Control UI & Developer Mode

This document defines the UI controls and developer mode for authoritative control over job execution during development and debugging.

---

## Core Principle

**Developer Mode**: Manual control over every step of the job pipeline with the ability to:
- Execute individual jobs without chaining
- Skip specific steps in a chain
- Pause/resume job processing
- Inspect job payloads and results
- Modify job parameters before execution

---

## UI Control Components

### 1. Job Control Panel (Developer Mode)

Located at `/dev/jobs` or accessible via Settings → Developer → Job Control

```typescript
interface JobControlPanel {
  // Global controls
  globalSettings: {
    autoChaining: boolean;        // Enable/disable automatic job chaining
    developerMode: boolean;       // Show advanced controls
    pauseProcessing: boolean;     // Pause all job processing
    maxConcurrent: number;        // Limit concurrent jobs
  };

  // Job type controls
  jobTypes: Map<string, JobTypeControl>;

  // Active jobs monitor
  activeJobs: JobMonitor[];

  // Job history with replay
  history: JobHistoryEntry[];
}

interface JobTypeControl {
  type: string;                   // 'scan-movie', 'identify', etc.
  enabled: boolean;               // Can this job type run?
  autoChain: boolean;             // Should it queue next jobs?
  breakpoint: boolean;            // Pause before executing
  mockMode: boolean;              // Use mock handler instead
  parameters: JobParameterOverride[];
}
```

### 2. Movie Detail Job Controls

Add manual job triggers to each movie's detail page:

```tsx
// MovieDetailPage.tsx - Developer Controls Section
export function MovieJobControls({ movie }: { movie: Movie }) {
  const [devMode] = useDevMode();
  const { queueJob } = useJobQueue();
  const [customParams, setCustomParams] = useState({});

  if (!devMode) return null;

  return (
    <Card className="border-yellow-500">
      <CardHeader>
        <CardTitle className="text-yellow-500">
          🛠️ Developer Job Controls
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          {/* Individual Job Triggers */}
          <Button
            onClick={() => queueJob('identify-movie', {
              movieId: movie.id,
              autoChain: false  // Don't trigger next job
            })}
            variant="outline"
          >
            🔍 Identify Only
          </Button>

          <Button
            onClick={() => queueJob('enrich-metadata', {
              movieId: movie.id,
              providers: ['tmdb'],
              autoChain: false
            })}
            variant="outline"
          >
            📊 Enrich Metadata Only
          </Button>

          <Button
            onClick={() => queueJob('fetch-assets', {
              movieId: movie.id,
              assetTypes: ['poster', 'fanart'],
              autoChain: false
            })}
            variant="outline"
          >
            🖼️ Fetch Assets Only
          </Button>

          <Button
            onClick={() => queueJob('extract-subtitles', {
              movieId: movie.id,
              autoChain: false
            })}
            variant="outline"
          >
            📝 Extract Subtitles Only
          </Button>

          <Button
            onClick={() => queueJob('generate-nfo', {
              movieId: movie.id,
              autoChain: false
            })}
            variant="outline"
          >
            📄 Generate NFO Only
          </Button>

          <Button
            onClick={() => queueJob('publish-assets', {
              movieId: movie.id,
              autoChain: false
            })}
            variant="outline"
          >
            📤 Publish Only
          </Button>

          {/* Chain Controls */}
          <div className="col-span-2 border-t pt-4">
            <h4 className="font-semibold mb-2">Chain Execution</h4>

            <Button
              onClick={() => queueJob('scan-movie', {
                moviePath: movie.file_path,
                autoChain: true,
                stopAt: 'enrich-metadata'  // Stop after enrichment
              })}
              className="mr-2"
            >
              ⛓️ Run Until Enrichment
            </Button>

            <Button
              onClick={() => queueJob('scan-movie', {
                moviePath: movie.file_path,
                autoChain: true,
                skipJobs: ['fetch-assets', 'download-trailers']
              })}
            >
              ⛓️ Run Full Chain (Skip Assets)
            </Button>
          </div>

          {/* Custom Parameters */}
          <div className="col-span-2 border-t pt-4">
            <h4 className="font-semibold mb-2">Custom Parameters</h4>
            <JsonEditor
              value={customParams}
              onChange={setCustomParams}
              className="h-32"
            />
            <Button
              onClick={() => queueJob('custom', {
                movieId: movie.id,
                ...customParams
              })}
              className="mt-2"
            >
              🚀 Queue with Custom Params
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

### 3. Global Job Queue Monitor

A dedicated page for monitoring and controlling all jobs:

```tsx
// pages/DevJobQueue.tsx
export function DevJobQueue() {
  const { jobs, stats, controls } = useJobQueueMonitor();
  const [filter, setFilter] = useState<JobFilter>({});

  return (
    <div className="space-y-6">
      {/* Global Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Global Job Controls</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Switch
              checked={controls.autoChaining}
              onCheckedChange={(checked) =>
                controls.setAutoChaining(checked)
              }
            >
              Auto-Chain Jobs
            </Switch>

            <Switch
              checked={controls.paused}
              onCheckedChange={(checked) =>
                controls.setPaused(checked)
              }
            >
              Pause Processing
            </Switch>

            <Select
              value={controls.maxConcurrent}
              onValueChange={(value) =>
                controls.setMaxConcurrent(parseInt(value))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 Concurrent</SelectItem>
                <SelectItem value="3">3 Concurrent</SelectItem>
                <SelectItem value="5">5 Concurrent</SelectItem>
                <SelectItem value="10">10 Concurrent</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="destructive"
              onClick={() => controls.clearAllJobs()}
            >
              Clear All Jobs
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Job Type Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Job Type Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job Type</TableHead>
                <TableHead>Enabled</TableHead>
                <TableHead>Auto-Chain</TableHead>
                <TableHead>Breakpoint</TableHead>
                <TableHead>Mock Mode</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {JOB_TYPES.map(jobType => (
                <TableRow key={jobType}>
                  <TableCell>{jobType}</TableCell>
                  <TableCell>
                    <Switch
                      checked={controls.getJobTypeEnabled(jobType)}
                      onCheckedChange={(checked) =>
                        controls.setJobTypeEnabled(jobType, checked)
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={controls.getJobTypeAutoChain(jobType)}
                      onCheckedChange={(checked) =>
                        controls.setJobTypeAutoChain(jobType, checked)
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={controls.getJobTypeBreakpoint(jobType)}
                      onCheckedChange={(checked) =>
                        controls.setJobTypeBreakpoint(jobType, checked)
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={controls.getJobTypeMockMode(jobType)}
                      onCheckedChange={(checked) =>
                        controls.setJobTypeMockMode(jobType, checked)
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      onClick={() => controls.testJobType(jobType)}
                    >
                      Test
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Active Jobs */}
      <Card>
        <CardHeader>
          <CardTitle>Active Jobs ({stats.active})</CardTitle>
        </CardHeader>
        <CardContent>
          {jobs.active.map(job => (
            <JobMonitorRow
              key={job.id}
              job={job}
              onPause={() => controls.pauseJob(job.id)}
              onResume={() => controls.resumeJob(job.id)}
              onCancel={() => controls.cancelJob(job.id)}
              onInspect={() => controls.inspectJob(job.id)}
            />
          ))}
        </CardContent>
      </Card>

      {/* Job Queue */}
      <Card>
        <CardHeader>
          <CardTitle>Pending Jobs ({stats.pending})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {jobs.pending.map(job => (
              <div key={job.id} className="flex justify-between items-center p-2 border rounded">
                <div>
                  <span className="font-mono">{job.type}</span>
                  <span className="text-sm text-gray-500 ml-2">
                    Movie ID: {job.payload.movieId}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => controls.promoteJob(job.id)}
                  >
                    ⬆️ Promote
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => controls.editJob(job.id)}
                  >
                    ✏️ Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => controls.removeJob(job.id)}
                  >
                    ❌ Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

---

## Backend Implementation

### 1. Developer Mode Job Handler Wrapper

```typescript
// src/services/jobQueue/DevModeWrapper.ts
export class DevModeJobHandler {
  constructor(
    private originalHandler: JobHandler,
    private devControls: DevModeControls
  ) {}

  async handle(job: Job): Promise<void> {
    const jobTypeControl = this.devControls.getJobTypeControl(job.type);

    // Check if job type is enabled
    if (!jobTypeControl.enabled) {
      logger.info(`[DEV] Job type ${job.type} is disabled, skipping`);
      return;
    }

    // Check for breakpoint
    if (jobTypeControl.breakpoint) {
      logger.info(`[DEV] Breakpoint hit for ${job.type}, pausing...`);
      await this.devControls.waitForBreakpointRelease(job.id);
    }

    // Use mock handler if enabled
    if (jobTypeControl.mockMode) {
      logger.info(`[DEV] Using mock handler for ${job.type}`);
      return this.runMockHandler(job);
    }

    // Run original handler
    const result = await this.originalHandler(job);

    // Check if auto-chaining is disabled
    if (!jobTypeControl.autoChain) {
      logger.info(`[DEV] Auto-chaining disabled for ${job.type}, not queuing next jobs`);
      return result;
    }

    // Check for stop-at condition
    if (job.payload.stopAt === job.type) {
      logger.info(`[DEV] Stopping chain at ${job.type} as requested`);
      return result;
    }

    // Normal chaining continues
    return result;
  }

  private async runMockHandler(job: Job): Promise<void> {
    logger.info(`[MOCK] ${job.type} for entity ${job.payload.movieId}`);

    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Return mock result
    switch(job.type) {
      case 'identify-movie':
        return { tmdbId: 12345, title: 'Mock Movie' };
      case 'enrich-metadata':
        return { plot: 'Mock plot', year: 2024 };
      case 'fetch-assets':
        return { poster: 'mock-poster.jpg', fanart: 'mock-fanart.jpg' };
      default:
        return { success: true };
    }
  }
}
```

### 2. Developer Mode API Endpoints

```typescript
// src/routes/devJobControl.ts
export function createDevJobControlRouter(jobQueue: JobQueueService) {
  const router = Router();

  // Only enable in development
  if (process.env.NODE_ENV !== 'development') {
    return router;
  }

  // Get current controls
  router.get('/api/dev/job-controls', (req, res) => {
    res.json(jobQueue.getDevControls());
  });

  // Update global settings
  router.patch('/api/dev/job-controls/global', (req, res) => {
    jobQueue.updateDevControls(req.body);
    res.json({ success: true });
  });

  // Update job type settings
  router.patch('/api/dev/job-controls/type/:type', (req, res) => {
    jobQueue.updateJobTypeControl(req.params.type, req.body);
    res.json({ success: true });
  });

  // Queue test job
  router.post('/api/dev/jobs/test', async (req, res) => {
    const { type, payload, options } = req.body;
    const jobId = await jobQueue.add(type, payload, {
      ...options,
      isTest: true
    });
    res.json({ jobId });
  });

  // Modify pending job
  router.patch('/api/dev/jobs/:id', async (req, res) => {
    await jobQueue.modifyJob(req.params.id, req.body);
    res.json({ success: true });
  });

  // Replay completed job
  router.post('/api/dev/jobs/:id/replay', async (req, res) => {
    const job = await jobQueue.getJob(req.params.id);
    const newJobId = await jobQueue.add(job.type, job.payload, {
      replay: true,
      originalJobId: job.id
    });
    res.json({ newJobId });
  });

  // Release breakpoint
  router.post('/api/dev/breakpoint/:jobId/release', (req, res) => {
    jobQueue.releaseBreakpoint(req.params.jobId);
    res.json({ success: true });
  });

  return router;
}
```

### 3. Job Execution Control

```typescript
// src/services/jobQueue/JobQueueService.ts - Developer Mode Extensions
export class JobQueueService {
  private devMode: DevModeControls;

  constructor(storage: IJobQueueStorage) {
    this.storage = storage;
    this.devMode = new DevModeControls();

    // Load dev mode settings from localStorage/DB
    this.devMode.load();
  }

  async add(type: string, payload: any, options?: JobOptions): Promise<number> {
    // Check if we should skip chaining
    if (this.devMode.isEnabled() && options?.autoChain === false) {
      payload._noChain = true;
    }

    // Check if we should stop at specific job
    if (options?.stopAt) {
      payload._stopAt = options.stopAt;
    }

    // Check if we should skip certain jobs
    if (options?.skipJobs) {
      payload._skipJobs = options.skipJobs;
    }

    return this.storage.addJob({
      type,
      payload,
      priority: options?.priority || this.getDefaultPriority(type),
      metadata: {
        isTest: options?.isTest,
        autoChain: options?.autoChain ?? this.devMode.getJobTypeAutoChain(type),
        createdBy: options?.createdBy || 'system'
      }
    });
  }

  private async processJob(job: Job): Promise<void> {
    const handler = this.handlers.get(job.type);
    if (!handler) throw new Error(`No handler for job type: ${job.type}`);

    // Wrap handler in dev mode if enabled
    const actualHandler = this.devMode.isEnabled()
      ? new DevModeJobHandler(handler, this.devMode)
      : handler;

    try {
      // Emit start event
      this.emit('job:started', job);

      // Check for skip directive
      if (job.payload._skipJobs?.includes(job.type)) {
        logger.info(`[DEV] Skipping ${job.type} as requested`);
        this.emit('job:skipped', job);
        return;
      }

      // Execute handler
      const result = await actualHandler.handle(job);

      // Check if we should stop chaining
      if (job.payload._noChain) {
        logger.info(`[DEV] Not chaining from ${job.type} due to _noChain flag`);
      }

      this.emit('job:completed', job, result);
    } catch (error) {
      this.emit('job:failed', job, error);
      throw error;
    }
  }
}
```

---

## Configuration Storage

### Developer Mode Settings

```typescript
// src/services/devMode/DevModeSettings.ts
interface DevModeSettings {
  enabled: boolean;
  global: {
    autoChaining: boolean;
    pauseProcessing: boolean;
    maxConcurrent: number;
    logLevel: 'debug' | 'verbose';
  };
  jobTypes: Map<string, {
    enabled: boolean;
    autoChain: boolean;
    breakpoint: boolean;
    mockMode: boolean;
    customParams?: Record<string, any>;
  }>;
  breakpoints: Set<number>;  // Job IDs with active breakpoints
}

// Store in database for persistence
CREATE TABLE dev_mode_settings (
  id INTEGER PRIMARY KEY,
  settings JSON NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## UI Integration Points

### 1. Settings Page Developer Section

```tsx
// Settings > Developer > Job Control
<SettingsSection title="Developer Mode">
  <Switch
    checked={devMode.enabled}
    onCheckedChange={setDevModeEnabled}
    label="Enable Developer Mode"
    description="Show advanced job controls throughout the UI"
  />

  {devMode.enabled && (
    <>
      <Link to="/dev/jobs">
        <Button>Open Job Control Panel</Button>
      </Link>

      <Alert variant="warning">
        Developer mode disables automatic job chaining by default.
        Enable specific job types in the control panel.
      </Alert>
    </>
  )}
</SettingsSection>
```

### 2. Movie List Bulk Controls

```tsx
// Add to movie list toolbar
{devMode && (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="outline">
        🛠️ Dev Actions
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent>
      <DropdownMenuItem onClick={() => queueJobsForSelected('identify-movie')}>
        Identify Selected (No Chain)
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => queueJobsForSelected('enrich-metadata')}>
        Enrich Selected (No Chain)
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => queueJobsForSelected('fetch-assets')}>
        Fetch Assets (No Chain)
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={() => clearJobsForSelected()}>
        Clear Jobs for Selected
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
)}
```

### 3. Job Progress Indicator

```tsx
// Show job chain progress with ability to interrupt
export function JobChainProgress({ movieId }: { movieId: number }) {
  const { jobs, currentJob } = useMovieJobs(movieId);
  const devMode = useDevMode();

  return (
    <div className="space-y-2">
      {jobs.map(job => (
        <div key={job.id} className="flex items-center gap-2">
          <StatusIcon status={job.status} />
          <span className={job.id === currentJob?.id ? 'font-bold' : ''}>
            {job.type}
          </span>

          {devMode && job.status === 'pending' && (
            <Button
              size="xs"
              variant="ghost"
              onClick={() => skipJob(job.id)}
            >
              Skip
            </Button>
          )}

          {devMode && job.status === 'active' && (
            <Button
              size="xs"
              variant="destructive"
              onClick={() => cancelJob(job.id)}
            >
              Cancel
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
```

---

## Testing Workflows

### 1. Test Individual Job Types

```bash
# Test subtitle extraction without triggering NFO generation
curl -X POST http://localhost:3000/api/dev/jobs/test \
  -H "Content-Type: application/json" \
  -d '{
    "type": "extract-subtitles",
    "payload": { "movieId": 1 },
    "options": { "autoChain": false }
  }'
```

### 2. Test Partial Chains

```bash
# Run identification and enrichment only
curl -X POST http://localhost:3000/api/dev/jobs/test \
  -H "Content-Type: application/json" \
  -d '{
    "type": "scan-movie",
    "payload": { "moviePath": "/movies/test.mkv" },
    "options": {
      "autoChain": true,
      "stopAt": "enrich-metadata"
    }
  }'
```

### 3. Test with Mock Handlers

```bash
# Enable mock mode for provider calls
curl -X PATCH http://localhost:3000/api/dev/job-controls/type/fetch-assets \
  -H "Content-Type: application/json" \
  -d '{
    "mockMode": true
  }'
```

---

## Benefits

1. **Controlled Testing**: Test each job handler in isolation
2. **Debugging**: Set breakpoints and inspect job state
3. **Development Safety**: Prevent cascading jobs during development
4. **Mock Testing**: Test UI without hitting real APIs
5. **Replay Capability**: Re-run failed jobs with modified parameters
6. **Performance Testing**: Control concurrency and measure throughput

---

## Migration to Production

When ready for production:

1. **Disable Developer Mode**: Set `NODE_ENV=production`
2. **Enable Auto-Chaining**: Default all job types to chain
3. **Remove Dev UI**: Dev controls won't render in production
4. **Clear Dev Settings**: Remove dev_mode_settings table
5. **Verify Job Flow**: Test complete chains work correctly

The developer mode provides complete control during development while maintaining the clean job-driven architecture for production.