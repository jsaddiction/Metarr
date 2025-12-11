# Notification

Notification sends filtered alerts about workflow events through configured notification channels (Discord, Pushover, Telegram, Slack, Kodi on-screen).

## What is Notification?

Given workflow events (completion, failure, etc.), notification:

1. **Collects** event details from the workflow
2. **Filters** against channel configuration
3. **Delivers** to matching channels
4. **Reports** delivery status

```
INPUT: Workflow event (phase completion, error, etc.)
    │
    └──► NOTIFICATION
              │
              ├──► Step 1: COLLECT EVENT
              │         └──► Gather workflow results
              │         └──► Determine event type
              │         └──► Build notification payload
              │
              ├──► Step 2: FILTER CHANNELS
              │         └──► Load enabled channels
              │         └──► Check event filters per channel
              │         └──► Skip uninterested channels
              │
              ├──► Step 3: DELIVER
              │         └──► Send to each matching channel
              │         └──► Handle failures gracefully
              │         └──► Log results
              │
              └──► Step 4: COMPLETE
                        └──► Mark notification job complete

OUTPUT: Users notified through configured channels
```

## Why Notification?

Notification keeps users informed about library changes without notification fatigue.

**Without notification:**
- Users must manually check Metarr for updates
- Important failures go unnoticed
- No awareness of completed workflows

**With notification:**
- Configurable event filtering
- Multiple channel options
- Rich notifications with posters (where supported)
- Per-channel event selection

## Supported Channels

| Channel | Integration | Rich Content |
|---------|-------------|--------------|
| **Discord** | Webhook | Embeds with posters |
| **Pushover** | API | Mobile push notifications |
| **Telegram** | Bot API | Markdown messages |
| **Slack** | Webhook | Formatted messages |
| **Kodi** | JSON-RPC | On-screen notifications |

**Note**: Email/SMTP intentionally not supported due to complexity.

## Event Types

All events use **past tense naming** to indicate completed actions:

| Event | Default Enabled | Description |
|-------|-----------------|-------------|
| `scan_completed` | No | Library scan finished |
| `scan_failed` | Yes | Library scan encountered errors |
| `enrichment_completed` | No | Metadata enrichment finished |
| `enrichment_failed` | Yes | Metadata enrichment failed |
| `publishing_completed` | Yes | Assets published to library |
| `publishing_failed` | Yes | Asset publishing failed |
| `player_sync_completed` | No | Players notified successfully |
| `player_sync_failed` | Yes | Player sync failed |
| `verification_completed` | Yes | Verification found/repaired issues |
| `download_completed` | Yes | Webhook download processed |
| `upgrade_completed` | Yes | Media upgraded to better quality |
| `error_occurred` | Yes | System errors, provider failures |

## Channel Configuration

Each channel has:
- **enabled**: Master toggle for the channel
- **eventFilters**: Array of event types this channel receives
- **config**: Channel-specific settings (webhook URL, tokens, etc.)

### Example Configuration

```json
{
  "discord": {
    "enabled": true,
    "eventFilters": ["download_completed", "upgrade_completed", "error_occurred"],
    "config": {
      "webhook_url": "https://discord.com/api/webhooks/...",
      "username": "Metarr"
    }
  },
  "kodi": {
    "enabled": true,
    "eventFilters": ["download_completed"],
    "config": {
      "player_ids": "all",
      "duration": 5000
    }
  }
}
```

## Trigger Patterns

### Individual Phase Notifications

Each phase can create notification jobs for significant events:
- `scan_completed`, `enrichment_failed`, `publishing_completed`

### Workflow Completion Notifications

The final phase (Player Sync) can create a summary notification:
- Includes results from the entire automation chain
- Example: "Download processed: The Matrix (1999) - scanned, enriched, published, synced"

### Independent Notifications

- Verification creates notifications outside the main chain
- Manual user actions can trigger notifications
- System errors generate immediate notifications

## Chain Position

Notification runs **independently** from the main automation chain:

```
SCANNING → ENRICHMENT → PUBLISHING → PLAYER SYNC
                                          │
                                          └──► NOTIFICATION (independent)

VERIFICATION (independent) ──► NOTIFICATION (independent)
```

Any phase or independent job can trigger notification jobs.

## Error Handling

| Error | Behavior |
|-------|----------|
| Channel offline | Log failure, continue with others |
| Invalid credentials | Disable channel, alert user |
| Timeout | Log warning, continue |
| Rate limited | Back off and retry once |
| Network error | Log, continue with others |

**Key principle**: Notification failures never block workflow completion.

## Performance

- **Parallel delivery**: Send to all channels simultaneously
- **Timeout protection**: 10-second timeout per channel
- **Non-blocking**: Failures don't affect workflow
- **Lowest priority**: Notification jobs run after all other work

## Related Documentation

- [Operational Concepts](../README.md) - Pipeline overview
- [PlayerSync](../PlayerSync/) - Terminal phase that may trigger notifications
- [Verification](../Verification/) - Independent job that may trigger notifications
- [Kodi Implementation](../../implementation/PlayerSync/KODI.md) - Kodi integration details
