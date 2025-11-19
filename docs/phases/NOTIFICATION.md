# Notification Phase

**Purpose**: Send filtered notifications about phase completion or workflow events through configured notification channels.

**Related Docs**:
- Parent: [Phase Overview](OVERVIEW.md)
- Related: [Kodi Player](../players/KODI.md) (for on-screen notifications)

## Quick Reference

- **Independent phase**: Runs outside the main automation chain
- **Event-driven**: Any phase can trigger notification jobs
- **Idempotent**: Multiple notification attempts cause no harm
- **Filtered**: Only sends notifications matching channel configuration
- **Fault-tolerant**: Failed channels don't block others
- **Configurable**: Per-channel event filtering

---

## Overview

The notification phase operates independently from the main automation chain. Any phase can trigger a notification job when significant events occur (completion, failure, etc.), and the completion of an entire workflow can trigger a summary notification. This allows users to stay informed about media library changes without being overwhelmed by notification fatigue.

**Key Difference**: Unlike the main phase chain (Scan → Enrich → Publish → Sync), notification runs independently based on events.

---

## Triggers

| Trigger Type | Description | Priority |
|--------------|-------------|----------|
| **Phase completion** | Any phase can create notification jobs | 1 (LOWEST) |
| **Phase failure** | Error conditions trigger notifications | 5 (NORMAL) |
| **Workflow completion** | End-to-end automation chain completion | 1 (LOWEST) |
| **Manual** | User explicitly requests notification | 10 (HIGH) |
| **Verification** | After verification finds and repairs issues | 5 (NORMAL) |

---

## Process Flow

```
1. EVENT COLLECTION
   ├── Gather workflow results from job context
   ├── Determine event type(s) triggered
   ├── Extract relevant metadata
   └── Build notification payload

2. CHANNEL FILTERING
   ├── Load enabled notification channels
   ├── Check each channel's event filter
   ├── Skip channels not interested in this event
   └── Build delivery queue

3. NOTIFICATION DELIVERY
   ├── Send to each filtered channel
   ├── Handle delivery failures gracefully
   ├── Log delivery results
   └── Retry failed deliveries (optional)

4. STATE UPDATE
   ├── Log notification activity
   └── Clear notification job

5. JOB COMPLETION
   └── Mark notification job as complete
```

---

## Notification Event Types

All event types use **past tense naming** to indicate completed actions.

| Event Type | Description | Default Enabled |
|------------|-------------|-----------------|
| `scan_completed` | Library scan finished | No |
| `scan_failed` | Library scan encountered errors | Yes |
| `enrichment_completed` | Metadata enrichment finished | No |
| `enrichment_failed` | Metadata enrichment failed | Yes |
| `publishing_completed` | Assets published to library | Yes |
| `publishing_failed` | Asset publishing failed | Yes |
| `player_sync_completed` | Players notified successfully | No |
| `player_sync_failed` | Player sync failed | Yes |
| `verification_completed` | Verification found/repaired issues | Yes |
| `verification_failed` | Verification encountered errors | Yes |
| `download_completed` | Webhook download processed | Yes |
| `upgrade_completed` | Media upgraded to better quality | Yes |
| `error_occurred` | System errors, provider failures | Yes |

---

## Notification Channels

### Supported Channels

1. **Kodi On-Screen** - Native Kodi notifications (requires at least one Kodi player)
2. **Discord** - Webhook integration
3. **Pushover** - Push notifications to mobile devices
4. **Telegram** - Bot API integration
5. **Slack** - Webhook integration

**Note**: Email/SMTP intentionally not supported due to complexity.

### Channel Configuration

```typescript
interface NotificationChannelConfig {
  channel: string; // 'kodi', 'discord', 'pushover', 'telegram', 'slack'
  enabled: boolean;
  eventFilters: string[]; // Array of enabled event types
  config: ChannelSpecificConfig;
}
```

---

## Event Payload Structure

```typescript
interface NotificationEvent {
  type: string; // 'download_completed', 'error_occurred', etc.
  title: string; // Short title
  message: string; // Detailed message
  severity: 'info' | 'warning' | 'error';
  timestamp: string; // ISO 8601
  metadata?: {
    entityType?: string; // 'movie', 'series', 'episode'
    entityId?: number;
    posterUrl?: string; // For rich notifications
    workflowId?: string; // Job chain ID
    [key: string]: any;
  };
}
```

---

## Channel Implementations

### Kodi On-Screen

```typescript
async function sendKodiNotification(
  event: NotificationEvent,
  config: KodiNotificationConfig
): Promise<void> {
  const players = config.player_ids === 'all'
    ? await db.getAllKodiPlayers()
    : await db.getKodiPlayers(config.player_ids);

  for (const player of players) {
    await kodiClient.rpc(player, 'GUI.ShowNotification', {
      title: event.title,
      message: event.message,
      displaytime: config.duration || 5000,
      image: getSeverityIcon(event.severity),
    });
  }
}
```

### Discord Webhook

```typescript
async function sendDiscordNotification(
  event: NotificationEvent,
  config: DiscordNotificationConfig
): Promise<void> {
  const embed = {
    title: event.title,
    description: event.message,
    color: getSeverityColor(event.severity),
    timestamp: event.timestamp,
    footer: { text: 'Metarr' },
  };

  if (event.metadata?.posterUrl) {
    embed.thumbnail = { url: event.metadata.posterUrl };
  }

  await fetch(config.webhook_url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: config.username || 'Metarr',
      avatar_url: config.avatar_url,
      embeds: [embed],
    }),
  });
}
```

### Pushover

```typescript
async function sendPushoverNotification(
  event: NotificationEvent,
  config: PushoverNotificationConfig
): Promise<void> {
  const formData = new URLSearchParams({
    token: config.api_token,
    user: config.user_key,
    title: event.title,
    message: event.message,
    priority: config.priority?.toString() || '0',
    sound: config.sound || 'pushover',
  });

  await fetch('https://api.pushover.net/1/messages.json', {
    method: 'POST',
    body: formData,
  });
}
```

### Telegram

```typescript
async function sendTelegramNotification(
  event: NotificationEvent,
  config: TelegramNotificationConfig
): Promise<void> {
  const url = `https://api.telegram.org/bot${config.bot_token}/sendMessage`;

  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: config.chat_id,
      text: `*${event.title}*\n${event.message}`,
      parse_mode: 'Markdown',
    }),
  });
}
```

### Slack

```typescript
async function sendSlackNotification(
  event: NotificationEvent,
  config: SlackNotificationConfig
): Promise<void> {
  await fetch(config.webhook_url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channel: config.channel,
      username: config.username || 'Metarr',
      text: `*${event.title}*\n${event.message}`,
      icon_emoji: ':movie_camera:',
    }),
  });
}
```

---

## Configuration

```typescript
interface NotificationConfig {
  // Global settings
  enabled: boolean; // Master notification toggle

  // Channels
  channels: {
    [channelName: string]: NotificationChannelConfig;
  };
}
```

### Example Configuration

```json
{
  "enabled": true,
  "channels": {
    "discord": {
      "channel": "discord",
      "enabled": true,
      "eventFilters": [
        "download_completed",
        "upgrade_completed",
        "error_occurred"
      ],
      "config": {
        "webhook_url": "https://discord.com/api/webhooks/...",
        "username": "Metarr",
        "avatar_url": "https://example.com/metarr-icon.png"
      }
    },
    "kodi": {
      "channel": "kodi",
      "enabled": true,
      "eventFilters": ["download_completed", "upgrade_completed"],
      "config": {
        "player_ids": "all",
        "duration": 5000
      }
    }
  }
}
```

**Configuration via UI**: Settings → Notifications
**Configuration via API**: `GET/PATCH /api/v1/settings/notifications`

---

## Error Handling

| Error Type | Behavior |
|------------|----------|
| **Channel offline** | Log failure, don't retry |
| **Invalid credentials** | Disable channel, alert user |
| **Timeout** | Log warning, continue with other channels |
| **Rate limited** | Back off and retry once |
| **Network error** | Log failure, continue with other channels |

---

## Performance Considerations

- **Parallel delivery**: Send to all channels simultaneously
- **Timeout protection**: 10-second timeout per channel
- **Non-blocking**: Notification failures don't block workflow completion
- **Debouncing**: Batch similar events within 30 seconds (future enhancement)

---

## Trigger Patterns

### Individual Phase Notifications

Each phase can create notification jobs for significant events:
- `scan_completed`, `enrichment_failed`, `publishing_completed`

### Workflow Completion Notifications

The final phase (Player Sync) can create a summary notification:
- Includes results from the entire automation chain
- Example: "Download processed: The Matrix (1999) - scanned, enriched, published, synced"

### Independent Notifications

- Verification phase creates notifications outside the chain
- Manual user actions can trigger notifications
- System errors can generate immediate notifications

---

## Phase Independence

The notification phase is **not part of the sequential automation chain**. Instead, it operates as an independent job that can be triggered by any phase or workflow event.

**Chain Position**: Not in chain (independent)

---

## See Also

- [Phase Overview](OVERVIEW.md) - Phase system architecture
- [Verification Phase](VERIFICATION.md) - Another independent phase
- [Kodi Player](../players/KODI.md) - Kodi JSON-RPC integration for on-screen notifications
- [Database Schema](../architecture/DATABASE.md) - Notification configuration tables
