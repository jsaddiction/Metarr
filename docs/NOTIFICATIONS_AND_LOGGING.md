# Notifications, Activity Logging, and System Authentication

**⚠️ Implementation Status**: **Partially Implemented / [Planned Features]**

**Implemented**:
- ✅ Notification configuration service (`notificationConfigService.ts`)
- ✅ Activity log API endpoints (`activityLogController.ts`)
- ✅ Activity log database schema
- ✅ Notification config database schema

**[Planned]**:
- ⏳ Notification channel implementations (Kodi, Discord, Pushover, Telegram, Slack)
- ⏳ Authentication system (login, session management, password change)
- ⏳ Log file rotation and management
- ⏳ Frontend UI for notification configuration
- ⏳ Frontend UI for activity log viewing
- ⏳ Frontend UI for authentication

---

This document covers Metarr's notification channels, activity logging system, log file management, and authentication.

## Notification System

Metarr can send notifications to various platforms when important events occur.

### Supported Notification Channels

1. **Kodi On-Screen** - Native Kodi notifications (requires at least one Kodi media player configured)
2. **Discord** - Webhook integration
3. **Pushover** - Push notifications to mobile devices
4. **Telegram** - Bot API integration
5. **Slack** - Webhook integration

**Note:** Email/SMTP is intentionally not supported due to complexity (server config, authentication, delivery issues).

---

## Notification Event Types

All event types use **past tense naming** to indicate completed actions.

| Event Type | Description | Default Enabled |
|------------|-------------|-----------------|
| `download_completed` | Media download finished (from webhook) | Yes |
| `metadata_updated` | Metadata enrichment completed | No |
| `scan_completed` | Library scan finished | No |
| `scan_failed` | Library scan encountered errors | Yes |
| `playback_interrupted` | Playback stopped for upgrade | Yes |
| `error_occurred` | System errors, provider failures | Yes |
| `webhook_received` | New webhook processed | No |

---

## Configuration Schema

### Database Table

```sql
CREATE TABLE notification_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel TEXT NOT NULL UNIQUE,     -- 'kodi', 'discord', 'pushover', 'telegram', 'slack'
  enabled BOOLEAN DEFAULT 0,
  config JSON NOT NULL,              -- Channel-specific settings
  event_types JSON NOT NULL,         -- Array of enabled event types
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### Configuration Examples

**Kodi:**
```json
{
  "channel": "kodi",
  "enabled": true,
  "config": {
    "player_ids": [1, 2],  // Send to specific players, or "all"
    "duration": 5000,       // ms to display notification
    "icon": "info"         // info, warning, error
  },
  "event_types": ["download_completed", "playback_interrupted", "error_occurred"]
}
```

**Discord:**
```json
{
  "channel": "discord",
  "enabled": true,
  "config": {
    "webhook_url": "https://discord.com/api/webhooks/123456/abcdef",
    "username": "Metarr",
    "avatar_url": "https://example.com/metarr-icon.png"
  },
  "event_types": ["download_completed", "error_occurred"]
}
```

**Pushover:**
```json
{
  "channel": "pushover",
  "enabled": true,
  "config": {
    "user_key": "user_key_here",
    "api_token": "api_token_here",
    "priority": 0,          // -2 to 2 (0 = normal)
    "sound": "pushover"     // Notification sound
  },
  "event_types": ["download_completed", "error_occurred", "playback_interrupted"]
}
```

**Telegram:**
```json
{
  "channel": "telegram",
  "enabled": true,
  "config": {
    "bot_token": "123456:ABC-DEF...",
    "chat_id": "-1001234567890"
  },
  "event_types": ["download_completed", "scan_completed", "error_occurred"]
}
```

**Slack:**
```json
{
  "channel": "slack",
  "enabled": true,
  "config": {
    "webhook_url": "https://hooks.slack.com/services/T00/B00/XXX",
    "channel": "#media",
    "username": "Metarr"
  },
  "event_types": ["download_completed", "error_occurred"]
}
```

---

## Notification Implementations

### Kodi On-Screen Notification

```typescript
async function sendKodiNotification(
  event: NotificationEvent,
  config: KodiNotificationConfig
): Promise<void> {
  const players = config.player_ids === 'all'
    ? await db.getAllKodiPlayers()
    : await db.getKodiPlayers(config.player_ids);

  for (const player of players) {
    await kodiClient.sendRequest(player.host, player.port, {
      jsonrpc: '2.0',
      method: 'GUI.ShowNotification',
      params: {
        title: event.title,
        message: event.message,
        displaytime: config.duration,
        image: config.icon
      }
    });
  }
}
```

**Example:**
```json
{
  "title": "Download Complete",
  "message": "The Matrix Resurrections (2021) ready to watch",
  "displaytime": 5000,
  "image": "info"
}
```

---

### Discord Webhook

```typescript
async function sendDiscordNotification(
  event: NotificationEvent,
  config: DiscordNotificationConfig
): Promise<void> {
  const embed = {
    title: event.title,
    description: event.message,
    color: getColorForEventType(event.type),  // Green for success, red for error, etc.
    timestamp: new Date().toISOString(),
    footer: {
      text: 'Metarr'
    }
  };

  if (event.metadata?.posterUrl) {
    embed.thumbnail = { url: event.metadata.posterUrl };
  }

  await fetch(config.webhook_url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: config.username,
      avatar_url: config.avatar_url,
      embeds: [embed]
    })
  });
}
```

**Example Message:**
```
📥 Download Complete
The Matrix Resurrections (2021) ready to watch

Quality: 1080p WEBDL
Size: 8.5 GB
Added: 3 fanarts, 1 poster, 1 trailer
```

---

### Pushover Notification

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
    priority: config.priority.toString(),
    sound: config.sound
  });

  await fetch('https://api.pushover.net/1/messages.json', {
    method: 'POST',
    body: formData
  });
}
```

---

### Telegram Bot

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
      parse_mode: 'Markdown'
    })
  });
}
```

---

### Slack Webhook

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
      username: config.username,
      text: `*${event.title}*\n${event.message}`,
      icon_emoji: ':movie_camera:'
    })
  });
}
```

---

## Notification Event Structure

```typescript
interface NotificationEvent {
  type: string;               // 'download_completed', 'error_occurred', etc. (past tense)
  title: string;              // Short title
  message: string;            // Detailed message
  severity: 'info' | 'warning' | 'error';
  timestamp: string;          // ISO 8601
  metadata?: {
    entityType?: string;      // 'movie', 'series', 'episode'
    entityId?: number;
    posterUrl?: string;       // For rich notifications
    [key: string]: any;
  };
}
```

**Example:**
```json
{
  "type": "download_completed",
  "title": "Download Completed",
  "message": "The Matrix Resurrections (2021) ready to watch",
  "severity": "info",
  "timestamp": "2025-10-03T14:35:22Z",
  "metadata": {
    "entityType": "movie",
    "entityId": 12345,
    "title": "The Matrix Resurrections",
    "year": 2021,
    "quality": "1080p",
    "posterUrl": "https://image.tmdb.org/t/p/w500/..."
  }
}
```

---

## Activity Logging System

Metarr tracks all significant events in an activity log for auditing and troubleshooting.

### Database Schema

```sql
CREATE TABLE activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  event_type TEXT NOT NULL,          -- 'download', 'scan', 'edit', 'error', 'playback'
  severity TEXT NOT NULL,             -- 'info', 'warning', 'error'
  entity_type TEXT,                   -- 'movie', 'series', 'episode'
  entity_id INTEGER,
  description TEXT NOT NULL,
  metadata JSON,                      -- Additional context
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_activity_timestamp ON activity_log(timestamp DESC);
CREATE INDEX idx_activity_type ON activity_log(event_type);
CREATE INDEX idx_activity_severity ON activity_log(severity);
CREATE INDEX idx_activity_entity ON activity_log(entity_type, entity_id);
```

### Event Types

All activity log event types use **past tense naming** for consistency.

| Event Type | Description | Example |
|------------|-------------|---------|
| `download_completed` | Webhook received, media downloaded | "Download completed: The Matrix Resurrections (2021)" |
| `scan_completed` | Library scan finished successfully | "Library scan completed: 1,450 movies, 3 added, 12 updated" |
| `scan_failed` | Library scan encountered errors | "Library scan failed: Permission denied on /movies" |
| `user_edited` | User manual edits | "User locked plot for The Matrix" |
| `metadata_enriched` | Metadata enrichment from providers | "Metadata enriched from TMDB for The Matrix" |
| `error_occurred` | Errors, failures | "Error occurred: Failed to download poster (404 Not Found)" |
| `playback_started` | Playback started on media player | "Playback started: The Matrix on Living Room Kodi" |
| `playback_stopped` | Playback stopped on media player | "Playback stopped: The Matrix on Living Room Kodi" |
| `webhook_received` | Webhook processing | "Webhook received from Radarr (download event)" |
| `backup_created` | Backup created | "Database backup created: metarr_backup_20251003.sql" |
| `backup_restored` | Backup restored | "Database restored from backup: metarr_backup_20251003.sql" |
| `cleanup_completed` | Scheduled cleanup task finished | "Cleanup completed: 15 deleted images removed" |

### Logging Examples

**Download Event:**
```json
{
  "timestamp": "2025-10-03T14:35:22Z",
  "event_type": "download_completed",
  "severity": "info",
  "entity_type": "movie",
  "entity_id": 12345,
  "description": "Download completed: The Matrix Resurrections (2021)",
  "metadata": {
    "source": "radarr",
    "webhook_type": "download",
    "is_upgrade": true,
    "quality": "1080p",
    "size_bytes": 8589934592
  }
}
```

**Library Scan Event:**
```json
{
  "timestamp": "2025-10-03T15:00:00Z",
  "event_type": "scan_completed",
  "severity": "info",
  "entity_type": null,
  "entity_id": null,
  "description": "Library scan completed",
  "metadata": {
    "library_id": 1,
    "library_name": "Movies",
    "total_items": 1450,
    "added": 3,
    "updated": 12,
    "removed": 1,
    "duration_ms": 45000
  }
}
```

**User Edit Event:**
```json
{
  "timestamp": "2025-10-03T16:20:10Z",
  "event_type": "user_edited",
  "severity": "info",
  "entity_type": "movie",
  "entity_id": 12345,
  "description": "User edited plot field",
  "metadata": {
    "field": "plot",
    "previous_value": "Set in the 22nd century...",
    "new_value": "My custom description",
    "locked": true,
    "user_id": 1
  }
}
```

**Error Event:**
```json
{
  "timestamp": "2025-10-03T17:45:30Z",
  "event_type": "error_occurred",
  "severity": "error",
  "entity_type": "movie",
  "entity_id": 67890,
  "description": "Error occurred: Failed to download poster (HTTP 404)",
  "metadata": {
    "provider": "tmdb",
    "url": "https://image.tmdb.org/t/p/original/missing.jpg",
    "error_code": 404,
    "error_message": "Not Found"
  }
}
```

---

## Activity Feed UI

### Frontend Display

**Settings → System → Activity**

```
┌────────────────────────────────────────────────────────────┐
│ Activity Log                                               │
│ [Filter: All ▼] [Search...]                    [Export]   │
├────────────────────────────────────────────────────────────┤
│                                                            │
│ 🎬 Download Complete                      2 minutes ago   │
│    The Matrix Resurrections (2021)                        │
│    Quality: 1080p, Size: 8.5 GB                           │
│    [View Details →]                                        │
│                                                            │
│ 📝 User Edit                              15 minutes ago  │
│    Star Wars (1977) - plot locked                         │
│    [View Movie →]                                          │
│                                                            │
│ 📊 Library Scan Completed                 1 hour ago      │
│    Movies library: 1,450 items (3 added, 12 updated)      │
│    [View Report →]                                         │
│                                                            │
│ ❌ Error                                   2 hours ago     │
│    Failed to download poster for Dune (2021)              │
│    HTTP 404: Not Found                                    │
│    [View Details →]                                        │
│                                                            │
│ [Load More]                                                │
└────────────────────────────────────────────────────────────┘
```

### Filter Options

- **All Events** - Show everything
- **Downloads** - Only webhook downloads
- **Scans** - Library scan operations
- **Edits** - User manual changes
- **Errors** - Failures and warnings
- **Playback** - Kodi playback events

### Real-Time Updates (SSE)

```typescript
// Frontend subscribes to activity stream
const eventSource = new EventSource('/api/activity/stream');

eventSource.addEventListener('activity', (event) => {
  const activityEvent = JSON.parse(event.data);
  // Prepend to activity feed
  prependActivityToFeed(activityEvent);
});
```

---

## Log File Management

Metarr writes structured log files for debugging and troubleshooting.

### Log File Structure

**Single Monolithic Log:**
```
/logs/
  metarr.log           (current, actively written)
  metarr.log.1         (previous rotation)
  metarr.log.2
  ...
  metarr.log.10        (oldest, deleted on next rotation)
```

### Log Rotation

**Rotation Trigger:** File size reaches limit (default: 50 MB)
**Retention:** Keep N rotations (default: 10)
**Compression:** Optional gzip for old rotations (metarr.log.3.gz)

### Log Levels

| Level | Description | Use Case |
|-------|-------------|----------|
| `ERROR` | Errors that require attention | Always logged |
| `WARN` | Warnings, non-critical issues | Always logged |
| `INFO` | Important events, user actions | Default level |
| `DEBUG` | Detailed flow, useful for troubleshooting | Enable for debugging |
| `TRACE` | Verbose, everything | Enable for deep debugging |

### Log Entry Format

```
[TIMESTAMP] [LEVEL] [SOURCE] Message
Additional context (JSON)
```

**Example:**
```
[2025-10-03 14:35:22] [INFO] [WebhookController] Received Radarr download webhook
{"tmdbId":603,"title":"The Matrix","eventType":"download","isUpgrade":true}

[2025-10-03 14:35:23] [DEBUG] [MetadataService] Fetching metadata from TMDB
{"movieId":12345,"tmdbId":603,"endpoint":"/movie/603?append_to_response=credits,videos,images"}

[2025-10-03 14:35:24] [INFO] [ImageService] Downloaded poster for The Matrix
{"movieId":12345,"url":"https://image.tmdb.org/t/p/original/...","width":2000,"height":3000}

[2025-10-03 14:35:25] [ERROR] [ImageService] Failed to download fanart
{"movieId":12345,"url":"https://image.tmdb.org/t/p/original/missing.jpg","statusCode":404,"error":"Not Found"}
```

---

## Log Configuration

### Database Schema

```sql
CREATE TABLE log_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  log_level TEXT NOT NULL DEFAULT 'INFO',  -- ERROR, WARN, INFO, DEBUG, TRACE
  rotation_size_mb INTEGER NOT NULL DEFAULT 50,
  retention_count INTEGER NOT NULL DEFAULT 10,
  enable_compression BOOLEAN DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### Settings UI

**Settings → System → Logging**

```
┌────────────────────────────────────────────────────────┐
│ Log Configuration                                      │
├────────────────────────────────────────────────────────┤
│                                                        │
│ Log Level: [INFO ▼]                                   │
│   (ERROR, WARN, INFO, DEBUG, TRACE)                   │
│                                                        │
│ Rotation:                                              │
│   File Size Limit: [50] MB                            │
│   Retention Count: [10] rotations                     │
│                                                        │
│ ☑ Compress old logs (gzip)                            │
│                                                        │
│ [Save Settings]                                        │
└────────────────────────────────────────────────────────┘
```

---

## Log Viewing & Download

### UI Display

**Settings → System → Logs**

```
┌────────────────────────────────────────────────────────┐
│ Log Files                                              │
├────────────────────────────────────────────────────────┤
│ File              Size      Modified           Actions │
│ metarr.log        24.5 MB   2025-10-03 14:35  [View] [Download] │
│ metarr.log.1      50.0 MB   2025-10-02 08:12  [Download] [Delete] │
│ metarr.log.2      50.0 MB   2025-10-01 19:34  [Download] [Delete] │
│ metarr.log.3.gz   12.3 MB   2025-09-30 11:22  [Download] [Delete] │
│                                                        │
│ [Download All (ZIP)] [Delete Old Logs]                │
└────────────────────────────────────────────────────────┘

Live Log View (metarr.log - last 1000 lines)
[Auto-refresh ☑] [Download] [Clear]

┌────────────────────────────────────────────────────────┐
│ [2025-10-03 14:35:22] [INFO] Webhook received...       │
│ [2025-10-03 14:35:23] [DEBUG] Fetching metadata...     │
│ [2025-10-03 14:35:24] [INFO] Downloaded poster...      │
│ [2025-10-03 14:35:25] [ERROR] Failed to download...    │
│ ...                                                    │
└────────────────────────────────────────────────────────┘
```

### Live Log Tail (SSE)

```typescript
// Backend: Stream new log lines via SSE
app.get('/api/logs/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');

  const watcher = fs.watch('/logs/metarr.log', (eventType) => {
    if (eventType === 'change') {
      const newLines = readNewLogLines();
      res.write(`data: ${JSON.stringify(newLines)}\n\n`);
    }
  });

  req.on('close', () => watcher.close());
});
```

```typescript
// Frontend: Display live log updates
const eventSource = new EventSource('/api/logs/stream');

eventSource.addEventListener('message', (event) => {
  const lines = JSON.parse(event.data);
  appendToLogView(lines);
});
```

---

## Authentication System

Metarr uses a simple single-user authentication system.

### User Model

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,       -- bcrypt hash
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

**Single Admin User:**
- Username: `admin` (default, can be changed)
- Password: Set during initial setup or in settings

### Authentication Flow

```
User → Login Page
  ├─ Enter username/password
  └─ POST /api/auth/login
       ├─ Verify credentials
       └─ Generate session token (JWT)
            └─ Store in HTTP-only cookie
                 └─ Redirect to dashboard
```

### Session Management

```typescript
// JWT payload
interface SessionToken {
  userId: number;
  username: string;
  iat: number;      // Issued at
  exp: number;      // Expiration (7 days default)
}

// Middleware: Verify session on each request
async function requireAuth(req, res, next) {
  const token = req.cookies.session;

  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const payload = jwt.verify(token, SECRET_KEY);
    req.user = payload;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid session' });
  }
}
```

### Optional Disable (External Auth)

For users behind reverse proxy authentication (Authelia, Authentik, etc.):

**Settings → General → Authentication**

```
┌────────────────────────────────────────────────────────┐
│ Authentication                                         │
├────────────────────────────────────────────────────────┤
│                                                        │
│ [ ] Disable built-in authentication                   │
│                                                        │
│ ⚠️  Warning: Only disable if Metarr is behind a       │
│    reverse proxy with authentication (e.g., Authelia) │
│                                                        │
│ When disabled, all requests will be allowed.          │
│                                                        │
│ [Save Settings]                                        │
└────────────────────────────────────────────────────────┘
```

**Environment Variable:**
```env
DISABLE_AUTH=false  # Set to true to disable authentication
```

### Password Reset

```
Settings → General → Change Password

┌────────────────────────────────────────────────────────┐
│ Change Password                                        │
├────────────────────────────────────────────────────────┤
│                                                        │
│ Current Password: [**********]                        │
│ New Password:     [**********]                        │
│ Confirm:          [**********]                        │
│                                                        │
│ [Change Password]                                      │
└────────────────────────────────────────────────────────┘
```

### Initial Setup Wizard

On first startup, Metarr displays a setup wizard:

```
┌────────────────────────────────────────────────────────┐
│ Welcome to Metarr!                                     │
├────────────────────────────────────────────────────────┤
│                                                        │
│ Let's set up your administrator account.              │
│                                                        │
│ Username: [admin                ]                      │
│           (default, can be changed later)             │
│                                                        │
│ Password: [**********]                                │
│           (minimum 8 characters)                       │
│                                                        │
│ Confirm:  [**********]                                │
│                                                        │
│ [Create Account & Continue]                           │
└────────────────────────────────────────────────────────┘
```

**Database Initialization:**
```typescript
async function initializeAdminUser(username: string, password: string): Promise<void> {
  // Check if any users exist
  const existingUsers = await db.query('SELECT COUNT(*) as count FROM users');

  if (existingUsers[0].count > 0) {
    throw new Error('Admin user already exists');
  }

  // Hash password with bcrypt (10 rounds)
  const passwordHash = await bcrypt.hash(password, 10);

  // Insert admin user
  await db.run(`
    INSERT INTO users (username, password_hash)
    VALUES (?, ?)
  `, [username, passwordHash]);

  // Log activity
  await db.logActivity({
    event_type: 'user_created',
    severity: 'info',
    description: `Administrator account created: ${username}`,
    metadata: JSON.stringify({ username, created_via: 'setup_wizard' })
  });
}
```

### Session Token Generation

```typescript
import jwt from 'jsonwebtoken';

const SECRET_KEY = process.env.JWT_SECRET || generateRandomSecret();
const TOKEN_EXPIRATION = '7d'; // 7 days

interface SessionToken {
  userId: number;
  username: string;
  iat: number;      // Issued at (Unix timestamp)
  exp: number;      // Expiration (Unix timestamp)
}

async function generateSessionToken(userId: number, username: string): Promise<string> {
  const payload: Omit<SessionToken, 'iat' | 'exp'> = {
    userId,
    username
  };

  const token = jwt.sign(payload, SECRET_KEY, {
    expiresIn: TOKEN_EXPIRATION
  });

  return token;
}
```

### Login Implementation

```typescript
async function login(req: Request, res: Response): Promise<void> {
  const { username, password } = req.body;

  // Validate input
  if (!username || !password) {
    return res.status(400).json({
      error: 'Validation error',
      message: 'Username and password are required'
    });
  }

  // Find user
  const user = await db.query(
    'SELECT id, username, password_hash FROM users WHERE username = ?',
    [username]
  );

  if (user.length === 0) {
    // Generic error to prevent username enumeration
    return res.status(401).json({
      error: 'Authentication failed',
      message: 'Invalid username or password'
    });
  }

  // Verify password
  const isValidPassword = await bcrypt.compare(password, user[0].password_hash);

  if (!isValidPassword) {
    // Log failed attempt
    await db.logActivity({
      event_type: 'login_failed',
      severity: 'warning',
      description: `Failed login attempt for user: ${username}`,
      metadata: JSON.stringify({
        username,
        ip: req.ip,
        user_agent: req.headers['user-agent']
      })
    });

    return res.status(401).json({
      error: 'Authentication failed',
      message: 'Invalid username or password'
    });
  }

  // Generate session token
  const token = await generateSessionToken(user[0].id, user[0].username);

  // Set HTTP-only cookie
  res.cookie('session', token, {
    httpOnly: true,      // Prevent JavaScript access
    secure: process.env.NODE_ENV === 'production', // HTTPS only in production
    sameSite: 'strict',  // CSRF protection
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });

  // Log successful login
  await db.logActivity({
    event_type: 'user_logged_in',
    severity: 'info',
    description: `User logged in: ${username}`,
    metadata: JSON.stringify({
      username,
      ip: req.ip,
      user_agent: req.headers['user-agent']
    })
  });

  res.json({
    success: true,
    user: {
      id: user[0].id,
      username: user[0].username
    }
  });
}
```

### Logout Implementation

```typescript
async function logout(req: Request, res: Response): Promise<void> {
  const username = req.user?.username;

  // Clear session cookie
  res.clearCookie('session');

  // Log logout
  if (username) {
    await db.logActivity({
      event_type: 'user_logged_out',
      severity: 'info',
      description: `User logged out: ${username}`,
      metadata: JSON.stringify({ username })
    });
  }

  res.json({ success: true });
}
```

### Authentication Middleware

```typescript
async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Check if authentication is disabled
  if (process.env.DISABLE_AUTH === 'true') {
    // Bypass authentication, set dummy user
    req.user = { userId: 1, username: 'admin', iat: 0, exp: 0 };
    return next();
  }

  // Get token from cookie
  const token = req.cookies.session;

  if (!token) {
    return res.status(401).json({
      error: 'Not authenticated',
      message: 'No session token found. Please log in.'
    });
  }

  try {
    // Verify and decode token
    const payload = jwt.verify(token, SECRET_KEY) as SessionToken;

    // Check if user still exists
    const user = await db.query(
      'SELECT id, username FROM users WHERE id = ?',
      [payload.userId]
    );

    if (user.length === 0) {
      res.clearCookie('session');
      return res.status(401).json({
        error: 'Invalid session',
        message: 'User account no longer exists. Please log in again.'
      });
    }

    // Attach user to request
    req.user = payload;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.clearCookie('session');
      return res.status(401).json({
        error: 'Session expired',
        message: 'Your session has expired. Please log in again.'
      });
    }

    if (error instanceof jwt.JsonWebTokenError) {
      res.clearCookie('session');
      return res.status(401).json({
        error: 'Invalid session',
        message: 'Invalid session token. Please log in again.'
      });
    }

    // Unknown error
    return res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while verifying your session.'
    });
  }
}
```

### Password Change Implementation

```typescript
async function changePassword(req: Request, res: Response): Promise<void> {
  const { currentPassword, newPassword } = req.body;
  const userId = req.user.userId;

  // Validate input
  if (!currentPassword || !newPassword) {
    return res.status(400).json({
      error: 'Validation error',
      message: 'Current password and new password are required'
    });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({
      error: 'Validation error',
      message: 'New password must be at least 8 characters long'
    });
  }

  // Get current user
  const user = await db.query(
    'SELECT id, username, password_hash FROM users WHERE id = ?',
    [userId]
  );

  if (user.length === 0) {
    return res.status(404).json({
      error: 'User not found',
      message: 'User account not found'
    });
  }

  // Verify current password
  const isValidPassword = await bcrypt.compare(currentPassword, user[0].password_hash);

  if (!isValidPassword) {
    return res.status(401).json({
      error: 'Authentication failed',
      message: 'Current password is incorrect'
    });
  }

  // Hash new password
  const newPasswordHash = await bcrypt.hash(newPassword, 10);

  // Update password
  await db.run(
    'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [newPasswordHash, userId]
  );

  // Log password change
  await db.logActivity({
    event_type: 'password_changed',
    severity: 'info',
    description: `Password changed for user: ${user[0].username}`,
    metadata: JSON.stringify({
      user_id: userId,
      username: user[0].username
    })
  });

  res.json({ success: true });
}
```

### Security Best Practices

1. **Password Requirements**:
   - Minimum 8 characters
   - Hashed with bcrypt (10 rounds)
   - Never stored in plain text
   - Never logged or transmitted after initial setup

2. **Session Management**:
   - JWT tokens stored in HTTP-only cookies
   - 7-day expiration (configurable)
   - Automatic expiration handling
   - Secure flag enabled in production (HTTPS)
   - SameSite=strict for CSRF protection

3. **Login Security**:
   - Generic error messages (prevent username enumeration)
   - Failed login attempts logged
   - Successful logins logged with IP and user agent
   - Rate limiting (future enhancement)

4. **Disable Authentication**:
   - Only when behind reverse proxy with authentication
   - Environment variable: `DISABLE_AUTH=true`
   - Logs warning on startup when disabled
   - Bypasses middleware but still tracks dummy user

5. **Activity Logging**:
   - All authentication events logged
   - Login/logout tracked
   - Password changes recorded
   - Failed attempts monitored

---

## API Endpoints

### Notifications

```
GET    /api/notifications              # Get all notification configs
PUT    /api/notifications/:channel     # Update channel config
POST   /api/notifications/test/:channel # Test notification (send test message)
```

### Activity Log

```
GET    /api/activity                   # Get activity log (paginated)
GET    /api/activity/stream            # SSE stream for real-time events
GET    /api/activity/:id               # Get specific event details
DELETE /api/activity                   # Clear old activity (older than X days)
```

### Logs

```
GET    /api/logs                       # List log files
GET    /api/logs/:filename/download    # Download log file
DELETE /api/logs/:filename             # Delete old log file
GET    /api/logs/stream                # SSE stream for live log tail
GET    /api/logs/settings               # Get log configuration
PUT    /api/logs/settings               # Update log configuration
```

### Authentication

```
POST   /api/auth/login                 # Login (username, password)
POST   /api/auth/logout                # Logout (clear session)
GET    /api/auth/me                    # Get current user info
PUT    /api/auth/password              # Change password
```

---

## Best Practices

1. **Enable notifications selectively** - Too many notifications = notification fatigue
2. **Use Kodi for critical events** - On-screen notifications for playback interruptions
3. **Use Discord/Slack for monitoring** - Centralized notifications for all events
4. **Retain activity log** - Keep at least 30 days for troubleshooting
5. **Monitor log file size** - Ensure rotation is configured to prevent disk fill
6. **Use DEBUG level sparingly** - Only enable when troubleshooting issues
7. **Secure authentication** - Use strong passwords, disable auth only behind trusted proxy
8. **Test notifications** - Use test button to verify channel configuration
9. **Export activity log** - Periodically export for long-term archival
10. **Monitor error events** - Set up notifications for error severity to catch issues early
