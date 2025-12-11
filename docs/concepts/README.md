# Operational Concepts

Metarr processes media through a pipeline of jobs, each with its own triggers and configuration.

## Main Pipeline

```
SCANNING → ENRICHMENT → PUBLISHING → PLAYER SYNC
```

```
┌─────────────────────────────────────────────────────────────────┐
│                        SCANNING                                  │
│  Discover files → Classify → Extract identity                   │
│  Output: Identified media item ready for enrichment             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                       ENRICHMENT                                 │
│  Scrape providers → Download assets → Cache selections          │
│  Output: Media item with selected assets in protected cache     │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                       PUBLISHING                                 │
│  Deploy to library → Generate NFO → Copy assets                 │
│  Output: Library folder ready for media players                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      PLAYER SYNC                                 │
│  Notify players → Trigger targeted scans → Report status        │
│  Output: Media players aware of library changes                 │
└─────────────────────────────────────────────────────────────────┘
```

## Independent Jobs

These run outside the main pipeline on schedule or manual trigger:

```
┌─────────────────────────────────────────────────────────────────┐
│                      VERIFICATION                                │
│  Compare cache↔library → Detect discrepancies → Auto-repair     │
│  Output: Consistent state, verification report                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      NOTIFICATION                                │
│  Filter events → Route to channels → Deliver alerts             │
│  Output: Users notified via Discord/Pushover/Telegram/etc       │
└─────────────────────────────────────────────────────────────────┘
```

## Job Documentation

### Main Pipeline

| Job | Documentation | Purpose |
|-----|---------------|---------|
| [Scanning](./Scanning/README.md) | Discover, classify, identify media |
| [Enrichment](./Enrichment/README.md) | Gather metadata and select assets |
| [Publishing](./Publishing/README.md) | Deploy to library for players |
| [Player Sync](./PlayerSync/README.md) | Notify media players of changes |

### Independent Jobs

| Job | Documentation | Purpose |
|-----|---------------|---------|
| [Verification](./Verification/README.md) | Ensure cache↔library consistency |
| [Notification](./Notification/README.md) | Send filtered alerts to users |

## Job Independence

Each job can run independently:

| Job | Trigger Examples | Can Skip? |
|-----|------------------|-----------|
| Scanning | Webhook, manual, scheduled, file watcher | No (required) |
| Enrichment | Auto after scan, manual, bulk | Yes (use existing metadata) |
| Publishing | Auto after enrich, manual, republish | Yes (stay in cache only) |
| Player Sync | Auto after publish, manual | Yes (skip player updates) |
| Verification | Scheduled, manual, post-incident | Yes (independent) |
| Notification | Event-triggered, manual | Yes (independent) |

## Auto-Chain Configuration

Jobs can automatically trigger the next:

```
Scanning complete + auto_enrich=true → Queue Enrichment
Enrichment complete + auto_publish=true → Queue Publishing
Publishing complete + auto_sync=true → Queue Player Sync
```

## Job Configuration

Each job can be enabled/disabled and configured independently:

```typescript
interface JobConfig {
  scanning: {
    enabled: true; // Always enabled (required)
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
  verification: {
    enabled: boolean; // Default: true
    schedule: string; // Cron expression
    autoRepair: boolean; // Default: true
  };
  notification: {
    enabled: boolean; // Default: true
    channels: NotificationChannelConfig[];
  };
}
```

**Configuration via UI**: Settings → General → Jobs
**Configuration via API**: `GET/PATCH /api/v1/settings/job-config`

## Media Type Implementations

Each job has media-specific implementations:

| Media Type | Implementation | Status |
|------------|----------------|--------|
| Movies | [implementation/Movies/](../implementation/Movies/) | Complete |
| TV Shows | Planned | - |
| Music | Planned | - |

## Related Documentation

- [Implementation Details](../implementation/) - Media-specific implementation
- [Architecture Overview](../architecture/) - System design
- [Job Queue](../architecture/JOB_QUEUE.md) - How jobs are processed
- [Asset Management](../architecture/ASSET_MANAGEMENT/) - Cache and library tiers
