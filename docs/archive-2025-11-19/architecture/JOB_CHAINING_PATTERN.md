# Job Chaining Pattern Analysis

**Purpose**: Document the current job chaining pattern and validate against industry best practices.

**Created**: 2025-01-29

---

## Current Implementation Pattern

### How Metarr Currently Chains Jobs

```
Job Handler A completes
    ↓
Check workflow settings
    ↓
Create Job B (if enabled)
    ↓
Job B handler starts
    ↓
Check workflow settings
    ↓
Decide: process or skip
```

### Example: Current discover-assets Handler

```typescript
// AssetJobHandlers.ts - handleDiscoverAssets()

// 1. Do the work (scan directory)
const result = await this.assetDiscovery.scanDirectory(directoryPath, entityType, entityId);

// 2. Check workflow setting
if (!job.manual) {
  const identificationEnabled = await this.workflowControl.isEnabled('identification');
  if (!identificationEnabled) {
    logger.info('Identification workflow disabled, stopping chain');
    return; // STOP - don't create next job
  }
}

// 3. Chain to next job (enrich-metadata)
const enrichJobId = await this.jobQueue.addJob({
  type: 'enrich-metadata',
  priority: 5,
  payload: { entityType, entityId, manual: false, forceRefresh: false },
});

logger.info('Asset discovery complete, chained to enrich-metadata', { enrichJobId });
```

### Example: Current enrich-metadata Handler

```typescript
// AssetJobHandlers.ts - handleEnrichMetadata()

// 1. Do the work (enrichment)
const result = await this.enrichment.enrich({
  entityId,
  entityType,
  manual,
  forceRefresh,
});

// 2. Check workflow setting
if (!manual) {
  const publishingEnabled = await this.workflowControl.isEnabled('publishing');
  if (!publishingEnabled) {
    logger.info('Publishing workflow disabled, stopping chain');
    return; // STOP - don't create next job
  }
}

// 3. Chain to next job (publish)
const publishJobId = await this.jobQueue.addJob({
  type: 'publish',
  priority: manual ? 3 : 5,
  payload: { entityType, entityId, libraryPath, mediaFilename },
});

logger.info('Enrichment complete, chained to publish', { publishJobId });
```

**Pattern**: Job A checks if Job B is enabled, then creates Job B. Job B doesn't need to check again.

---

## Alternative Pattern: Next Job Decides

### Proposed Alternative Pattern

```
Job Handler A completes
    ↓
ALWAYS create Job B
    ↓
Job B handler starts
    ↓
Check workflow settings
    ↓
If enabled: process
If disabled: log and return (no-op)
```

### Example: Alternative enrich-metadata Handler

```typescript
// AssetJobHandlers.ts - handleEnrichMetadata()

// 1. Check workflow setting FIRST
if (!job.manual) {
  const enrichmentEnabled = await this.workflowControl.isEnabled('enrichment');
  if (!enrichmentEnabled) {
    logger.info('Enrichment workflow disabled, skipping');
    return; // NO-OP - exit immediately
  }
}

// 2. Do the work (enrichment)
const result = await this.enrichment.enrich({ entityId, entityType, manual, forceRefresh });

// 3. ALWAYS chain to next job (publish decides if it runs)
const publishJobId = await this.jobQueue.addJob({
  type: 'publish',
  priority: manual ? 3 : 5,
  payload: { entityType, entityId },
});

logger.info('Enrichment complete, chained to publish', { publishJobId });
```

### Example: Alternative publish Handler

```typescript
// AssetJobHandlers.ts - handlePublish()

// 1. Check workflow setting FIRST
if (!job.manual) {
  const publishingEnabled = await this.workflowControl.isEnabled('publishing');
  if (!publishingEnabled) {
    logger.info('Publishing workflow disabled, skipping');
    return; // NO-OP - exit immediately
  }
}

// 2. Do the work (publish)
await this.publishing.publish({ entityType, entityId });

// 3. Chain to notification jobs
for (const playerGroup of playerGroups) {
  await this.jobQueue.addJob({
    type: `notify-${playerGroup.type}`,
    payload: { groupId: playerGroup.id },
  });
}
```

**Pattern**: Job A always creates Job B. Job B checks if it should run and decides internally.

---

## Industry Best Practices

### Pattern 1: "Smart Producer" (Current Metarr Pattern)
**Used by**: Celery (Python), Sidekiq (Ruby), Laravel Queues (PHP)

**Pros**:
- Fewer unnecessary jobs created
- Cleaner job queue (only jobs that will run)
- Simpler job logs (no skipped jobs)

**Cons**:
- Job A needs to know about Job B's config
- Workflow logic spread across multiple handlers
- Harder to change workflow without touching all handlers

**Example (Celery)**:
```python
@app.task
def process_upload(file_id):
    result = process(file_id)

    # Check if next step enabled
    if settings.ENABLE_THUMBNAILS:
        create_thumbnails.delay(file_id)  # Create next job
```

### Pattern 2: "Dumb Producer, Smart Consumer" (Alternative)
**Used by**: AWS Step Functions, Azure Durable Functions, Temporal.io

**Pros**:
- Each job is self-contained
- Workflow logic in one place (the consumer)
- Easy to add/remove jobs from chain
- Clear separation of concerns

**Cons**:
- More jobs in queue (some will no-op)
- Slightly more overhead (job creation + immediate exit)
- Job metrics include skipped jobs

**Example (Temporal)**:
```typescript
async function uploadWorkflow(fileId: string) {
  await processUpload(fileId);
  await createThumbnails(fileId);  // Always called
  await notifyUser(fileId);         // Always called
}

// Each activity checks if it should run
async function createThumbnails(fileId: string) {
  if (!config.enableThumbnails) {
    logger.info('Thumbnails disabled, skipping');
    return;
  }
  // Do work...
}
```

### Pattern 3: "Workflow Engine" (Hybrid)
**Used by**: Airflow, Prefect, n8n, Zapier

**Pros**:
- Centralized workflow definition
- DAG (directed acyclic graph) visualization
- Conditional branching built-in
- Easy to modify flows

**Cons**:
- Additional infrastructure (workflow engine)
- More complex setup
- Overkill for simple chains

**Example (Airflow)**:
```python
with DAG('media_pipeline') as dag:
    scan = ScanTask()
    enrich = EnrichTask()
    publish = PublishTask()

    scan >> enrich >> publish  # Define chain

    # Each task checks its own config internally
```

---

## Analysis: Which Pattern for Metarr?

### Current Metarr Approach: Pattern 1 (Smart Producer)

**Matches existing pattern**:
```typescript
// discover-assets checks if enrichment enabled
if (identificationEnabled) {
  await jobQueue.addJob({ type: 'enrich-metadata' });
}

// enrich-metadata checks if publishing enabled
if (publishingEnabled) {
  await jobQueue.addJob({ type: 'publish' });
}
```

**This is CORRECT for current codebase because**:
1. It matches the existing pattern in WebhookJobHandlers, ScheduledJobHandlers
2. Fewer jobs in queue = cleaner logs
3. WorkflowControlService cache prevents excessive DB queries
4. Simpler to understand: "create next job only if needed"

### Proposed Change: Add `workflow.auto_publish`

**Current problem**: `workflow.publishing` controls TWO things:
1. Whether publish job should run
2. Whether enrich should chain to publish

**Proposed solution**: Split into TWO settings:
```typescript
workflow.publishing      // Can publish jobs run? (safety toggle)
workflow.auto_publish    // Should enrich chain to publish? (automation toggle)
```

### Recommended Implementation (Matches Current Pattern)

```typescript
// AssetJobHandlers.ts - handleEnrichMetadata()

// 1. Do enrichment work
const result = await this.enrichment.enrich({ entityId, entityType, manual, forceRefresh });

// 2. Check if we should auto-chain to publish
if (!manual) {
  // Check auto-publish setting (new)
  const autoPublish = await this.workflowControl.isEnabled('auto_publish');

  if (!autoPublish) {
    logger.info('Auto-publish disabled, stopping chain (user review required)');
    return; // STOP - user must manually trigger publish
  }

  // Check publishing is enabled (safety check)
  const publishingEnabled = await this.workflowControl.isEnabled('publishing');

  if (!publishingEnabled) {
    logger.info('Publishing workflow disabled, stopping chain');
    return; // STOP - publishing disabled globally
  }
}

// 3. Chain to publish (if we got here, it's enabled)
const publishJobId = await this.jobQueue.addJob({
  type: 'publish',
  priority: manual ? 3 : 5,
  payload: { entityType, entityId },
});

logger.info('Enrichment complete, chained to publish', { publishJobId });
```

```typescript
// AssetJobHandlers.ts - handlePublish()

// 1. Check if publishing is globally enabled (safety check)
if (!job.manual) {
  const publishingEnabled = await this.workflowControl.isEnabled('publishing');

  if (!publishingEnabled) {
    logger.info('Publishing workflow disabled, skipping');
    return; // NO-OP - safety toggle prevents all publishing
  }
}

// 2. Do publish work
await this.publishing.publish({ entityType, entityId });

// 3. Chain to notification jobs (always, regardless of workflow settings)
for (const playerGroup of playerGroups) {
  await this.jobQueue.addJob({
    type: `notify-${playerGroup.type}`,
    payload: { groupId: playerGroup.id },
  });
}
```

---

## Workflow Settings Semantics

### Current Settings (5 stages)
```typescript
workflow.webhooks        // Process incoming webhooks from *arr apps
workflow.scanning        // Scan libraries for new files
workflow.identification  // Fetch metadata from TMDB/TVDB
workflow.enrichment      // Fetch assets and select best
workflow.publishing      // Publish to library and notify players
```

### Proposed Settings (6 stages)
```typescript
workflow.webhooks        // Process incoming webhooks from *arr apps
workflow.scanning        // Scan libraries for new files
workflow.identification  // Fetch metadata from TMDB/TVDB
workflow.enrichment      // Fetch assets and select best
workflow.auto_publish    // Auto-chain from enrich to publish (NEW)
workflow.publishing      // Enable publish job execution (safety toggle)
```

### How They Work Together

**Scenario 1: Full Automation** (old behavior)
```
workflow.enrichment = true
workflow.auto_publish = true   ← NEW
workflow.publishing = true

Result: scan → enrich → publish (automatic)
```

**Scenario 2: Manual Review** (new default)
```
workflow.enrichment = true
workflow.auto_publish = false  ← NEW DEFAULT
workflow.publishing = true

Result: scan → enrich → [STOP] → user clicks "Publish" → publish
```

**Scenario 3: Development Mode** (safety)
```
workflow.enrichment = true
workflow.auto_publish = false
workflow.publishing = false    ← Safety off

Result: scan → enrich → [STOP] → user clicks "Publish" → [BLOCKED]
Error: "Publishing workflow disabled"
```

**Scenario 4: Enrich Only**
```
workflow.enrichment = true
workflow.auto_publish = false
workflow.publishing = false

Result: User can enrich but cannot publish (dev/testing mode)
```

---

## Answer to Your Questions

### Question 1: "Each job is in charge of its own responsibilities"
**Answer**: YES, this is correct and matches current pattern.

Each job handler:
- Checks if IT should run (workflow setting for itself)
- Does its work
- Checks if NEXT job should be created (workflow setting for next)
- Creates next job (or stops)

### Question 2: "When a phase completes, it should create a job for the next phase"
**Answer**: YES, but with conditional logic.

Current pattern (KEEP THIS):
```typescript
// Job A completes its work
doWork();

// Job A checks if Job B is enabled
if (workflow.isEnabled('jobB')) {
  jobQueue.addJob({ type: 'jobB' });
}
```

### Question 3: "The next phase will decide if any action is to be taken based on config"
**Answer**: PARTIALLY. In current pattern:
- Previous job decides if next job is CREATED
- Next job decides if it should RUN (checks config at start)

Both checks happen, providing defense-in-depth:
```typescript
// Job A (enrich)
if (autoPublish && publishing) {
  jobQueue.addJob({ type: 'publish' });  // Create
}

// Job B (publish)
if (!publishingEnabled) {
  return;  // Skip
}
```

### Question 4: "Is this the way the industry does it?"
**Answer**: YES, Pattern 1 ("Smart Producer") is very common.

Used by: Celery, Sidekiq, Laravel Queues, BullMQ, Bee-Queue

Alternative patterns exist but are overkill for Metarr's needs.

### Question 5: "Is this how other phases are implemented?"
**Answer**: YES, checking current codebase shows consistent pattern:

- `handleDiscoverAssets` → checks `identification` → creates `enrich-metadata`
- `handleEnrichMetadata` → checks `publishing` → creates `publish`
- `handlePublish` → checks player groups → creates `notify-*`

---

## Recommendation

**KEEP CURRENT PATTERN** but add `workflow.auto_publish`:

1. ✅ Matches existing codebase
2. ✅ Industry-standard approach
3. ✅ Clean logs (no skipped jobs)
4. ✅ Simple to understand

**Add one new setting**: `workflow.auto_publish`
- Default: `false` (manual review gate)
- Purpose: Control enrichment → publish chaining
- Separate from: `workflow.publishing` (safety toggle)

**Implementation**:
- Enrich handler checks `auto_publish` before creating publish job
- Publish handler checks `publishing` at start (safety)
- User can enrich + review + manually publish

---

## Updated Job Flow

### Automated Workflow (`auto_publish = true`)
```
scan → discover-assets → enrich-metadata → publish → notify-players
       └─ checks         └─ checks          └─ checks
          identification    auto_publish       publishing
```

### Manual Review Workflow (`auto_publish = false`)
```
scan → discover-assets → enrich-metadata → [STOP]
       └─ checks         └─ checks
          identification    auto_publish (false)

User reviews in UI, clicks "Publish"

[User Action] → publish → notify-players
                └─ checks
                   publishing
```

---

## Conclusion

Your understanding is correct:
1. ✅ Each job owns its responsibilities
2. ✅ Completing job creates next job (conditionally)
3. ✅ Next job checks config at start (defense-in-depth)
4. ✅ Matches industry Pattern 1 (Smart Producer)
5. ✅ Consistent with existing Metarr implementation

**Action**: Add `workflow.auto_publish` setting, keep existing chaining pattern.
