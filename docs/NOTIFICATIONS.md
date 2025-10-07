# Notification System

This document details Metarr's event-driven notification architecture that sends alerts to various channels (Kodi, Pushover, Discord, etc.) based on system events.

---

## Architecture Overview

Metarr uses a **queue-based, event-driven notification system** that decouples application events from notification delivery.

```
┌──────────────────────────────────────────────────────────────┐
│                    APPLICATION LAYER                          │
│  (Webhooks, Scans, User Actions, Health Checks)              │
└────────────────────┬─────────────────────────────────────────┘
                     │ Emits Events
                     ▼
┌──────────────────────────────────────────────────────────────┐
│                   EVENT EMITTER                               │
│  notificationEvents.emit('movie.download.complete', {...})   │
└────────────────────┬─────────────────────────────────────────┘
                     │ Queues Events
                     ▼
┌──────────────────────────────────────────────────────────────┐
│                 NOTIFICATION QUEUE                            │
│  (In-memory + database persistence)                          │
└────────────────────┬─────────────────────────────────────────┘
                     │ Processes Queue
                     ▼
┌──────────────────────────────────────────────────────────────┐
│               NOTIFICATION PROCESSOR                          │
│  1. Load subscriptions for event                             │
│  2. Filter by channel capabilities                           │
│  3. Render message templates                                 │
│  4. Send to channels                                         │
└────────────────────┬─────────────────────────────────────────┘
                     │ Delivers to Channels
                     ▼
┌──────────────────────────────────────────────────────────────┐
│              NOTIFICATION CHANNELS                            │
│                                                               │
│  ┌─────────────┐  ┌──────────┐  ┌─────────┐  ┌──────────┐  │
│  │ Kodi        │  │ Pushover │  │ Discord │  │ Email    │  │
│  │ (per player)│  │ (global) │  │ (global)│  │ (global) │  │
│  └─────────────┘  └──────────┘  └─────────┘  └──────────┘  │
└──────────────────────────────────────────────────────────────┘
```

---

## Core Concepts

### 1. Events

System-wide events that can trigger notifications. Events have:
- **Name**: e.g., `movie.download.complete`
- **Category**: `movie`, `series`, `health`, `system`
- **Severity**: `info`, `success`, `warning`, `error`
- **Data Payload**: Event-specific metadata

### 2. Notification Channels

Where notifications are sent. Channels have:
- **Type**: `kodi`, `pushover`, `discord`, `slack`, `email`, `webhook`
- **Configuration**: Type-specific settings (API keys, URLs, etc.)
- **Capabilities**: What the channel can display (`text`, `images`, `rich_media`)
- **Link to Media Player** (optional): For Kodi channels

### 3. Subscriptions

Rules defining which events send to which channels:
- **Channel + Event**: Many-to-many relationship
- **Enabled/Disabled**: Per subscription
- **Custom Templates**: Override default messages
- **Filters** (future): Conditional routing based on metadata

### 4. Capabilities

Channels declare what they can display:
- `text`: Plain text messages
- `images`: Can embed images
- `rich_media`: Rich formatting (embeds, buttons, etc.)
- `interactive`: Supports user interaction

Events declare what they require. Processor only sends to capable channels.

---

## Database Schema

### notification_channels

Defines WHERE to send notifications.

```sql
CREATE TABLE notification_channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,                    -- "Living Room Kodi", "Pushover", "Discord"
  type TEXT NOT NULL,                    -- 'kodi', 'pushover', 'discord', 'slack', 'email', 'webhook'
  enabled BOOLEAN DEFAULT 1,

  -- Link to media player (for Kodi channels)
  media_player_id INTEGER,               -- NULL for global channels like Pushover

  -- Type-specific configuration (JSON)
  config TEXT,                           -- For non-Kodi channels

  -- Capabilities (JSON array)
  capabilities TEXT NOT NULL,            -- ["text", "images"]

  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (media_player_id) REFERENCES media_players(id) ON DELETE CASCADE
);

CREATE INDEX idx_notification_channels_type ON notification_channels(type);
CREATE INDEX idx_notification_channels_enabled ON notification_channels(enabled);
CREATE INDEX idx_notification_channels_player ON notification_channels(media_player_id);
```

**Channel Types**:
- **Kodi**: Linked to `media_players` table, inherits connection config
- **Global Services**: Pushover, Discord, Slack, Email - standalone configuration

### notification_event_types

Defines all possible events in the system.

```sql
CREATE TABLE notification_event_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_name TEXT NOT NULL UNIQUE,       -- 'movie.download.complete'
  category TEXT NOT NULL,                -- 'movie', 'series', 'health', 'system'
  description TEXT,

  -- Defaults
  default_enabled BOOLEAN DEFAULT 1,
  default_severity TEXT DEFAULT 'info',  -- 'info', 'warning', 'error', 'success'

  -- Required capabilities
  required_capabilities TEXT,            -- JSON: ["text"] or ["text", "images"]

  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

**Event Examples**:
```sql
INSERT INTO notification_event_types (event_name, category, description, default_severity, required_capabilities) VALUES
  ('movie.download.started', 'movie', 'Download queued', 'info', '["text"]'),
  ('movie.download.complete', 'movie', 'Download finished', 'success', '["text", "images"]'),
  ('movie.file.deleted', 'movie', 'File deleted', 'warning', '["text"]'),
  ('health.issue.detected', 'health', 'Health problem', 'error', '["text"]'),
  ('system.scan.complete', 'system', 'Library scan complete', 'success', '["text"]');
```

### notification_subscriptions

Defines WHICH events send to WHICH channels.

```sql
CREATE TABLE notification_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL,
  event_name TEXT NOT NULL,
  enabled BOOLEAN DEFAULT 1,

  -- Message customization
  message_template TEXT,                 -- NULL = use default

  -- Filtering (future)
  filter_conditions TEXT,                -- JSON: {"quality": "1080p"}

  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (channel_id) REFERENCES notification_channels(id) ON DELETE CASCADE,
  FOREIGN KEY (event_name) REFERENCES notification_event_types(event_name) ON DELETE CASCADE,

  UNIQUE(channel_id, event_name)
);

CREATE INDEX idx_notification_subscriptions_channel ON notification_subscriptions(channel_id);
CREATE INDEX idx_notification_subscriptions_event ON notification_subscriptions(event_name);
```

### notification_queue

Transient queue for async processing.

```sql
CREATE TABLE notification_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_name TEXT NOT NULL,
  event_data TEXT NOT NULL,              -- JSON: full payload
  status TEXT DEFAULT 'pending',         -- 'pending', 'processing', 'completed', 'failed'
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  error_message TEXT,

  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  processed_at TEXT
);

CREATE INDEX idx_notification_queue_status ON notification_queue(status);
```

### notification_delivery_log

Tracks delivery success/failure per channel.

```sql
CREATE TABLE notification_delivery_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  queue_id INTEGER,
  channel_id INTEGER NOT NULL,
  event_name TEXT NOT NULL,
  status TEXT NOT NULL,                  -- 'sent', 'failed'
  error_message TEXT,
  delivery_time_ms INTEGER,

  created_at TEXT DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (queue_id) REFERENCES notification_queue(id) ON DELETE CASCADE,
  FOREIGN KEY (channel_id) REFERENCES notification_channels(id) ON DELETE CASCADE
);
```

---

## Configuration Examples

### Example 1: Living Room Kodi Notifications

```sql
-- Kodi media player already configured
INSERT INTO media_players (id, name, type, host, port, enabled)
VALUES (1, 'Living Room Kodi', 'kodi', '192.168.1.100', 8080, 1);

-- Create notification channel linked to media player
INSERT INTO notification_channels (name, type, enabled, media_player_id, capabilities)
VALUES ('Living Room Kodi Notifications', 'kodi', 1, 1, '["text", "images"]');

-- Subscribe to events
INSERT INTO notification_subscriptions (channel_id, event_name, enabled, message_template) VALUES
  (1, 'movie.download.complete', 1, '✅ Ready to watch: {{movie.title}}'),
  (1, 'movie.upgrade.available', 1, 'Upgrade downloading: {{movie.title}}');
```

**Result**: Living Room Kodi receives notifications for downloads and upgrades.

### Example 2: Bedroom Kodi (Disabled Notifications)

```sql
-- Media player configured
INSERT INTO media_players (id, name, type, host, port, enabled)
VALUES (2, 'Bedroom Kodi', 'kodi', '192.168.1.101', 8080, 1);

-- Notification channel DISABLED
INSERT INTO notification_channels (name, type, enabled, media_player_id, capabilities)
VALUES ('Bedroom Kodi Notifications', 'kodi', 0, 2, '["text", "images"]');
```

**Result**: Bedroom Kodi receives no notifications (channel disabled).

### Example 3: Pushover (Global Service)

```sql
-- Create Pushover channel (no media_player_id)
INSERT INTO notification_channels (name, type, enabled, config, capabilities) VALUES
  ('Pushover', 'pushover', 1,
   '{"apiKey": "abc123", "userKey": "def456"}',
   '["text", "images", "links"]');

-- Subscribe to critical events only
INSERT INTO notification_subscriptions (channel_id, event_name, enabled, message_template) VALUES
  (3, 'movie.download.complete', 1, '✅ {{movie.title}} ({{movie.year}}) downloaded'),
  (3, 'movie.file.deleted', 1, '⚠️ File deleted: {{movie.title}}'),
  (3, 'health.issue.detected', 1, '⚠️ {{health.message}}');
```

**Result**: Pushover receives downloads, deletions, and health issues.

### Example 4: Discord (Rich Media)

```sql
-- Create Discord channel
INSERT INTO notification_channels (name, type, enabled, config, capabilities) VALUES
  ('Discord', 'discord', 1,
   '{"webhookUrl": "https://discord.com/api/webhooks/..."}',
   '["text", "images", "rich_media", "embeds"]');

-- Subscribe to all movie events
INSERT INTO notification_subscriptions (channel_id, event_name, enabled) VALUES
  (4, 'movie.download.complete', 1),
  (4, 'movie.download.started', 1),
  (4, 'movie.file.deleted', 1);
```

**Result**: Discord receives rich embeds with poster images for all movie events.

---

## Event Emission

Application code emits events using the global `notificationEvents` emitter:

```typescript
import { notificationEvents } from './services/notificationEventEmitter';

// Emit download complete event
await notificationEvents.emit('movie.download.complete', {
  entityType: 'movie',
  entityId: movieId,
  description: `Movie downloaded: ${movie.title}`,
  movie: {
    id: movieId,
    title: movie.title,
    year: movie.year,
    tmdbId: movie.tmdbId,
    quality: movieFile.quality,
    path: filePath
  }
});

// Emit health issue event
await notificationEvents.emit('health.issue.detected', {
  entityType: 'system',
  description: issue.message,
  health: {
    level: issue.level,      // 'Warning', 'Error'
    message: issue.message,
    type: issue.type,
    wikiUrl: issue.wikiUrl
  }
});

// Emit scan complete event
await notificationEvents.emit('system.scan.complete', {
  entityType: 'system',
  description: 'Library scan completed',
  scan: {
    added: stats.added,
    updated: stats.updated,
    removed: stats.removed,
    durationMs: stats.durationMs
  }
});
```

**Key Points**:
- Events are async (non-blocking)
- Event data is flexible (any JSON-serializable object)
- Failures don't crash application (logged only)

---

## Message Templates

Templates use `{{variable}}` syntax for dynamic content:

```typescript
// Default template
"✅ Downloaded: {{movie.title}} ({{movie.year}})"

// Custom template with quality
"✅ {{movie.title}} downloaded in {{movie.quality}}"

// Template with nested data
"Health Issue: {{health.message}} ({{health.level}})"
```

### Template Rendering

```typescript
function renderTemplate(template: string, eventData: any): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
    const value = getNestedValue(eventData, path.trim());
    return value !== undefined ? String(value) : match;
  });
}

function getNestedValue(obj: any, path: string): any {
  const keys = path.split('.');
  let current = obj;
  for (const key of keys) {
    if (current && typeof current === 'object' && key in current) {
      current = current[key];
    } else {
      return undefined;
    }
  }
  return current;
}
```

### Example Rendering

```typescript
const template = "✅ {{movie.title}} ({{movie.year}}) - {{movie.quality}}";
const eventData = {
  movie: {
    title: "The Matrix",
    year: 1999,
    quality: "Bluray-1080p"
  }
};

const result = renderTemplate(template, eventData);
// Result: "✅ The Matrix (1999) - Bluray-1080p"
```

---

## Channel-Specific Implementations

### Kodi Notifications

```typescript
async function sendKodiNotification(config: any, message: string): Promise<void> {
  // Config inherited from media_players table
  const kodi = new KodiClient(config.host, config.port, config.username, config.password);

  await kodi.sendNotification('Metarr', message, {
    displayTime: 5000,  // 5 seconds
    image: 'DefaultIconInfo.png'
  });
}
```

**Capabilities**: `["text", "images"]`

**Limitations**:
- Short messages only (Kodi UI constraint)
- Limited formatting (plain text)
- No persistent history

### Pushover Notifications

```typescript
async function sendPushoverNotification(
  config: any,
  message: string,
  eventData: any
): Promise<void> {
  const response = await fetch('https://api.pushover.net/1/messages.json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: config.apiKey,
      user: config.userKey,
      message,
      title: 'Metarr',
      priority: eventData.health?.level === 'Error' ? 1 : 0,
      url: eventData.movie?.tmdbUrl,  // Optional link
      url_title: 'View on TMDB'
    })
  });

  if (!response.ok) {
    throw new Error(`Pushover API error: ${response.statusText}`);
  }
}
```

**Capabilities**: `["text", "images", "links"]`

**Features**:
- Push to mobile devices
- Priority levels
- Persistent history
- Rich links

### Discord Notifications

```typescript
async function sendDiscordNotification(
  config: any,
  message: string,
  eventData: any
): Promise<void> {
  const embed = eventData.movie ? {
    title: eventData.movie.title,
    description: message,
    thumbnail: { url: eventData.movie.posterUrl },
    fields: [
      { name: 'Year', value: String(eventData.movie.year), inline: true },
      { name: 'Quality', value: eventData.movie.quality, inline: true }
    ],
    color: 0x5865F2,  // Discord blurple
    timestamp: new Date().toISOString()
  } : null;

  const response = await fetch(config.webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: embed ? null : message,  // Text fallback
      embeds: embed ? [embed] : undefined
    })
  });

  if (!response.ok) {
    throw new Error(`Discord API error: ${response.statusText}`);
  }
}
```

**Capabilities**: `["text", "images", "rich_media", "embeds"]`

**Features**:
- Rich embeds with images
- Color coding by severity
- Persistent channel history
- Markdown formatting

---

## Queue Processing

### Processing Flow

1. **Event Emitted** → Insert into `notification_queue`
2. **Processor Wakes** → Query pending items
3. **For Each Event**:
   - Load subscriptions
   - Filter by capabilities
   - Render templates
   - Send to channels
   - Log delivery status
4. **Update Queue** → Mark completed or retry

### Retry Logic

```typescript
// Max 3 retries with exponential backoff
if (error && retryCount < maxRetries) {
  const delay = Math.pow(2, retryCount) * 1000;  // 1s, 2s, 4s
  await sleep(delay);
  await db.execute(
    `UPDATE notification_queue SET status = 'pending', retry_count = retry_count + 1 WHERE id = ?`,
    [queueId]
  );
} else if (retryCount >= maxRetries) {
  await db.execute(
    `UPDATE notification_queue SET status = 'failed', error_message = ? WHERE id = ?`,
    [error.message, queueId]
  );
}
```

---

## UI Configuration

### Notification Channels Page

**Add Channel**:
1. Select type (Kodi, Pushover, Discord, etc.)
2. If Kodi: Select from existing media players
3. If other: Enter API keys/URLs
4. Enable/disable channel
5. Test delivery

**Edit Channel**:
- Update configuration
- Enable/disable
- Delete channel (cascades to subscriptions)

### Notification Subscriptions Page

**View**: Matrix of Events × Channels

| Event | Living Room Kodi | Pushover | Discord |
|-------|------------------|----------|---------|
| Download Complete | ✅ Enabled | ✅ Enabled | ✅ Enabled |
| Download Started | ❌ Disabled | ❌ Disabled | ✅ Enabled |
| File Deleted | ❌ Disabled | ✅ Enabled | ✅ Enabled |
| Health Issue | ✅ Enabled | ✅ Enabled | ❌ Disabled |

**Edit Subscription**:
- Enable/disable
- Customize message template
- Preview rendered message

---

## Best Practices

1. **Start Minimal**: Enable only essential notifications to avoid spam
2. **Channel Purpose**: Kodi for playback-related events, Pushover for important alerts
3. **Test Templates**: Preview before enabling to ensure formatting is correct
4. **Monitor Delivery**: Check `notification_delivery_log` for failures
5. **Prune Queue**: Old completed/failed items can be deleted (retention policy)

---

## Troubleshooting

### Notifications Not Sending

1. Check channel is enabled: `SELECT * FROM notification_channels WHERE enabled = 1`
2. Check subscription exists: `SELECT * FROM notification_subscriptions WHERE channel_id = ? AND event_name = ?`
3. Check capabilities match: Event requires `["text", "images"]` but channel only has `["text"]`
4. Check delivery log for errors: `SELECT * FROM notification_delivery_log WHERE status = 'failed'`

### Template Not Rendering

- Verify variable path is correct: `{{movie.title}}` not `{{title}}`
- Check event data structure in `activity_log.metadata`
- Test template rendering manually in UI

### Kodi Notifications Not Appearing

- Verify Kodi player is online and accessible
- Check Kodi notification settings (may be disabled in Kodi settings)
- Test with manual notification via Kodi API

---

## Related Documentation

- [WEBHOOKS.md](WEBHOOKS.md) - Webhook events that trigger notifications
- [WORKFLOWS.md](WORKFLOWS.md) - Application workflows that emit events
- [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) - Complete schema documentation
