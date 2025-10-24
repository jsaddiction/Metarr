# Job Chaining Refactor Plan

## Overview

Refactor synchronous workflow processing in `processMovieWebhook` to use event-driven job chaining pattern, where each job completion triggers the next job in the workflow.

---

## Current Implementation (Synchronous)

```typescript
// jobHandlers.ts - processMovieWebhook()
1. Insert/update movie in database
2. Discover assets from filesystem (synchronous)
3. Fetch assets from TMDB (synchronous)
4. Auto-select assets if enabled (synchronous)
5. Publish if YOLO mode (synchronous)
```

**Problems:**
- Long-running webhook handler blocks job queue
- No visibility into individual step progress
- Single failure point - entire workflow fails
- Can't pause/resume workflow
- No independent retry logic per step

---

## Target Implementation (Job Chaining)

```typescript
// Each step becomes a separate job that chains to the next
webhook-received → scan-movie → discover-assets → fetch-provider-assets → select-assets → publish
```

### Job Chain Flow

```
handleWebhookReceived(job)
  └─> Creates: scan-movie job

handleScanMovie(job)
  ├─> Updates/inserts movie in DB
  └─> Creates: discover-assets job (if workflow.scanning enabled)

handleDiscoverAssets(job)
  ├─> Scans filesystem for assets
  └─> Creates: fetch-provider-assets job (if workflow.identification enabled)

handleFetchProviderAssets(job)
  ├─> Fetches from TMDB/TVDB
  └─> Creates: select-assets job (if workflow.enrichment enabled)

handleSelectAssets(job)
  ├─> Auto-selects best assets
  └─> Creates: publish job (if workflow.publishing enabled)

handlePublish(job)
  └─> Publishes to library
```

---

## Implementation Steps

### Step 1: Update Job Handlers

```typescript
// handleScanMovie - modified to chain
private async handleScanMovie(job: Job): Promise<void> {
  const { movie, libraryId } = job.payload;

  // 1. Insert/update movie
  let movieId = await this.upsertMovie(movie);

  // 2. Check workflow settings
  const workflowEnabled = await this.isWorkflowEnabled('scanning');
  if (!workflowEnabled) {
    logger.info('Workflow scanning disabled, stopping chain');
    return;
  }

  // 3. Chain to next job
  await this.jobQueue.addJob({
    type: 'discover-assets',
    priority: 3,
    payload: {
      entityType: 'movie',
      entityId: movieId,
      path: movie.path,
      libraryId,
      chainContext: {
        source: 'webhook',
        tmdbId: movie.tmdbId
      }
    }
  });
}

// handleDiscoverAssets - chains to enrichment
private async handleDiscoverAssets(job: Job): Promise<void> {
  const { entityType, entityId, path, chainContext } = job.payload;

  // 1. Discover assets
  await this.assetDiscovery.scanDirectory(path, entityType, entityId);

  // 2. Check workflow settings
  const identificationEnabled = await this.isWorkflowEnabled('identification');
  if (!identificationEnabled || !chainContext?.tmdbId) {
    logger.info('Workflow identification disabled or no tmdbId, stopping chain');
    return;
  }

  // 3. Chain to next job
  await this.jobQueue.addJob({
    type: 'fetch-provider-assets',
    priority: 5,
    payload: {
      entityType,
      entityId,
      tmdbId: chainContext.tmdbId,
      chainContext
    }
  });
}
```

### Step 2: Add Workflow Control Helper

```typescript
private async isWorkflowEnabled(stage: string): Promise<boolean> {
  const result = await this.db.query<{value: string}>(
    'SELECT value FROM app_settings WHERE key = ?',
    [`workflow.${stage}`]
  );

  if (result.length === 0) {
    return false; // Default to disabled
  }

  return result[0].value === 'true';
}
```

### Step 3: Update WebSocket Events

Each job handler should emit progress events:

```typescript
private async handleDiscoverAssets(job: Job): Promise<void> {
  // Emit start event
  websocketBroadcaster.broadcast({
    type: 'job.progress',
    jobId: job.id,
    stage: 'discover-assets',
    status: 'started',
    entityType: job.payload.entityType,
    entityId: job.payload.entityId
  });

  // Do work...

  // Emit complete event
  websocketBroadcaster.broadcast({
    type: 'job.progress',
    jobId: job.id,
    stage: 'discover-assets',
    status: 'completed',
    entityType: job.payload.entityType,
    entityId: job.payload.entityId
  });
}
```

---

## Workflow Control Integration

### Database Settings

```sql
-- app_settings table entries
INSERT OR REPLACE INTO app_settings (key, value) VALUES
  ('workflow.scanning', 'false'),      -- Filesystem discovery
  ('workflow.identification', 'false'), -- Provider metadata fetch
  ('workflow.enrichment', 'false'),    -- Asset selection
  ('workflow.publishing', 'false');    -- Library publishing
```

### API Endpoints

```typescript
// GET /api/settings/workflow
{
  scanning: false,
  identification: false,
  enrichment: false,
  publishing: false
}

// PUT /api/settings/workflow
{
  scanning: true,
  identification: true
  // partial updates allowed
}
```

---

## Benefits of Job Chaining

1. **Visibility**: Each step is a separate job with its own status
2. **Resilience**: Individual retry logic per step
3. **Control**: Can pause workflow by disabling stages
4. **Performance**: Non-blocking, parallel processing
5. **Debugging**: Clear job history for each step
6. **Flexibility**: Easy to add/remove workflow stages

---

## Migration Path

### Phase 1: Parallel Implementation
- Keep existing `processMovieWebhook` for backward compatibility
- Add new chaining handlers alongside
- Use feature flag to switch between implementations

### Phase 2: Testing & Validation
- Test with workflow stages disabled/enabled
- Verify job chains complete correctly
- Monitor performance and error rates

### Phase 3: Cutover
- Switch to job chaining by default
- Remove synchronous implementation
- Update documentation

---

## Testing Strategy

### Unit Tests
```typescript
describe('Job Chaining', () => {
  it('should chain discover-assets after scan-movie', async () => {
    // Enable workflow
    await db.execute('INSERT INTO app_settings (key, value) VALUES (?, ?)',
      ['workflow.scanning', 'true']);

    // Process scan-movie job
    await handler.handleScanMovie(mockJob);

    // Verify next job created
    const jobs = await jobQueue.getJobs('discover-assets');
    expect(jobs).toHaveLength(1);
    expect(jobs[0].payload.entityId).toBe(movieId);
  });

  it('should stop chain when workflow disabled', async () => {
    // Disable workflow
    await db.execute('INSERT INTO app_settings (key, value) VALUES (?, ?)',
      ['workflow.scanning', 'false']);

    // Process scan-movie job
    await handler.handleScanMovie(mockJob);

    // Verify no next job created
    const jobs = await jobQueue.getJobs('discover-assets');
    expect(jobs).toHaveLength(0);
  });
});
```

### Integration Tests
- Test complete webhook → publish chain
- Test with various workflow configurations
- Test failure recovery and retries
- Test WebSocket event emissions

---

## Rollback Plan

If issues arise:
1. Disable job chaining via feature flag
2. Revert to synchronous processing
3. Clear job queue of chained jobs
4. Investigate and fix issues
5. Re-enable after fixes

---

## Timeline

- **Week 1**: Implement job chaining handlers
- **Week 2**: Add workflow control integration
- **Week 3**: Testing and validation
- **Week 4**: Gradual rollout and monitoring