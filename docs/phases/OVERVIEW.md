# Phase System Overview

**Purpose**: Understand Metarr's phase-based architecture and automated workflow system.

**Related Docs**:
- Parent: [/CLAUDE.md](/CLAUDE.md)
- Related: [Database Schema](../architecture/DATABASE.md), [Job Queue](../architecture/JOB_QUEUE.md)

## Quick Reference

- **Phases are independent**: Each runs standalone, can be disabled
- **Phases are idempotent**: Safe to run multiple times
- **Phases are chainable**: Completion triggers next phase job
- **Job-driven automation**: Workers process jobs, respect configuration
- **Two independent phases**: Notification and Verification run outside the main chain

---

## Core Philosophy

### Independence

Each phase operates as an isolated unit:
- Has clear inputs and outputs
- Can run without other phases
- Maintains own error handling
- Emits own progress events

### Idempotency

Phases can run multiple times safely:
- Re-scanning updates changed files only
- Re-enrichment refreshes metadata without duplication
- Re-publishing replaces assets atomically
- No corruption from repeated execution

### Chainability

Phases form an automated pipeline:
```
Scan → Enrichment → Publishing → Player Sync
         ↓             ↓             ↓
    (optional)    (optional)    (optional)
```

Each phase completion creates a job for the next phase. If a phase is disabled, the job passes through immediately to the next phase.

---

## Phase Status Table

| Phase | Status | Purpose | Required | Chain Position |
|-------|--------|---------|----------|----------------|
| **[Scanning](SCANNING.md)** | ✅ Implemented | Discover & classify files | Yes | 1st (entry point) |
| **[Enrichment](ENRICHMENT.md)** | ✅ Implemented | Fetch metadata & select assets | No | 2nd |
| **[Publishing](PUBLISHING.md)** | ✅ Implemented | Deploy assets to library | No | 3rd |
| **[Player Sync](PLAYER_SYNC.md)** | ⚠️ Partial | Update media players | No | 4th (terminal) |
| **[Notification](NOTIFICATION.md)** | ✅ Implemented | Send filtered notifications | No* | Independent |
| **[Verification](VERIFICATION.md)** | ✅ Implemented | Ensure cache↔library consistency | No* | Independent |

\* Notification and Verification phases run independently and are not part of the sequential automation chain

---

## Job-Driven Automation Flow

```
User Action / Webhook
        ↓
  Job Created (priority: HIGH)
        ↓
  Worker Claims Job
        ↓
  Phase 1: Scanning
        ↓
  Phase Complete?
        ↓
  Create Next Phase Job
        ↓
  Phase 2: Enrichment (if enabled)
        ↓
  (Disabled? Skip to next phase)
        ↓
  Phase 3: Publishing (if enabled)
        ↓
  Phase 4: Player Sync (if enabled)
        ↓
  Workflow Complete
        ↓
  (Optional: Create Notification Job)
```

### Job Priority System

Jobs are processed by priority (1-10, higher = more urgent):

| Priority | Job Type | Example Use |
|----------|----------|-------------|
| **10** | User-initiated | Manual scan, manual enrichment |
| **8** | Webhook download | Radarr/Sonarr import notification |
| **5** | Automated workflow | Scheduled enrichment refresh |
| **3** | Verification | Background consistency checks |
| **1** | Cleanup | Garbage collection, temp file cleanup |

### Worker Pool

- Default: 4 concurrent workers
- Workers claim jobs atomically
- Failed jobs retry with exponential backoff
- Max retries: 3 attempts
- Dead letter queue for permanent failures

---

## Phase Configuration

Each phase can be enabled/disabled independently via `PhaseConfigService`:

```typescript
interface PhaseConfig {
  scanning: {
    enabled: true; // Always enabled (required phase)
  };
  enrichment: {
    enabled: boolean; // Default: true
    autoSelectAssets: boolean; // Default: false
    preferredLanguage: string; // Default: 'en'
  };
  publishing: {
    enabled: boolean; // Default: true
    cleanupUnselected: boolean; // Default: true
  };
  playerSync: {
    enabled: boolean; // Default: true
    autoSync: boolean; // Default: false
  };
}
```

**Configuration via UI**: Settings → General → Phases
**Configuration via API**: `GET/PATCH /api/v1/settings/phase-config`

---

## Workflow Triggers

### Manual Triggers

- **User clicks "Scan Library"**: Creates scan job for entire library
- **User clicks "Scan Directory"**: Creates scan job for specific path
- **User clicks "Enrich"**: Creates enrichment job (force_refresh=true)
- **User clicks "Publish"**: Creates publishing job for enriched items
- **User clicks "Sync Players"**: Creates player sync job

### Automated Triggers

- **Webhook received**: Radarr/Sonarr sends download notification → scan job
- **Scheduled scan**: Daily/weekly library scan (configurable)
- **Scheduled enrichment**: Weekly metadata refresh (configurable)
- **Phase completion**: Each phase creates next phase job (if enabled)

---

## Phase Pass-Through Behavior

When a phase is disabled, jobs pass through immediately:

```typescript
async function processEnrichmentJob(job: Job): Promise<void> {
  const config = await phaseConfigService.get('enrichment');

  if (!config.enabled) {
    logger.info('Enrichment disabled, passing to next phase');
    await createPublishingJob(job.payload.entityId);
    return; // Job completes immediately
  }

  // Phase enabled - execute
  await enrichmentService.enrich(job.payload);
  await createPublishingJob(job.payload.entityId);
}
```

This ensures the automation chain continues even when phases are disabled.

---

## Error Handling

### Phase-Level Errors

- **Non-destructive failures**: Log error, mark job failed, don't create next job
- **Recoverable errors**: Retry with exponential backoff (provider timeout, network error)
- **Fatal errors**: Mark job as permanently failed, send error notification

### Chain Termination

If a phase fails and cannot recover:
1. Job marked as failed (status='failed')
2. Error logged with context
3. **Next phase job NOT created** (chain terminates)
4. Notification job created (if error notifications enabled)
5. User can retry manually from UI

---

## Independent Phases

### Notification Phase

- **Not in automation chain**: Triggered by events, not phase completion
- **Any phase can notify**: Scan, Enrichment, Publishing, Player Sync all can create notification jobs
- **Filtered delivery**: Only sends to channels interested in event type
- **Non-blocking**: Notification failures don't affect workflow

See [Notification Phase](NOTIFICATION.md) for details.

### Verification Phase

- **Not in automation chain**: Runs on schedule or manual trigger
- **Consistency checks**: Detects cache↔library discrepancies
- **Self-healing**: Automatically restores missing/corrupted files
- **Independent triggers**: Schedule, manual, post-incident

See [Verification Phase](VERIFICATION.md) for details.

---

## Performance Characteristics

### Scanning Phase
- **Speed**: ~100-200 movies/minute (depends on FFprobe)
- **Bottleneck**: FFprobe analysis for new files
- **Optimization**: Concurrent directory processing (default: 5)

### Enrichment Phase
- **Speed**: ~5-10 movies/minute (provider rate limits)
- **Bottleneck**: Provider API calls, image downloads
- **Optimization**: Parallel provider queries, batch database updates

### Publishing Phase
- **Speed**: ~50-100 movies/minute
- **Bottleneck**: File copy operations
- **Optimization**: Batch NFO generation

### Player Sync Phase
- **Speed**: Near-instant (network dependent)
- **Bottleneck**: Network latency to players
- **Optimization**: Parallel player notifications

---

## See Also

- [Scanning Phase](SCANNING.md) - File discovery and classification
- [Enrichment Phase](ENRICHMENT.md) - Metadata fetch and asset selection
- [Publishing Phase](PUBLISHING.md) - Asset deployment to library
- [Player Sync Phase](PLAYER_SYNC.md) - Media player notifications
- [Verification Phase](VERIFICATION.md) - Consistency checking
- [Notification Phase](NOTIFICATION.md) - Event notifications
- [Database Schema](../architecture/DATABASE.md) - Complete data model
- [Job Queue Architecture](../architecture/JOB_QUEUE.md) - Job processing system
