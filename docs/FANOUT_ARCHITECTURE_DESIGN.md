# Fan-Out Architecture: Design Decisions

**Date**: 2025-10-15
**Topic**: How notifications fan out from webhooks

---

## 🤔 The Question

**If a webhook creates a notification job, how do all the notifiers use it?**

Two possible architectures:

### **Option A: Parent Notification Handler (Coordinator)**
```
webhook-received job
         │
         ├─→ scan-movie job
         └─→ notify job (PARENT)
                 │
                 ├─→ Check kodi config → Notify Kodi
                 ├─→ Check discord config → Notify Discord
                 └─→ Check pushover config → Notify Pushover
```

One job, one handler, multiple notifications inside.

### **Option B: Multiple Specific Notification Jobs (Fan-Out)**
```
webhook-received job
         │
         ├─→ scan-movie job
         ├─→ notify-kodi job
         ├─→ notify-discord job
         └─→ notify-pushover job
```

Multiple jobs, each job removed after completion.

---

## ✅ **Recommended: Option B (Multiple Specific Jobs)**

### Why Option B is Better

#### **1. Isolation & Failure Independence**
```
If Kodi notification fails:
  ❌ Option A: Entire notify job fails → retry ALL notifications
  ✅ Option B: Only notify-kodi job retries → others succeeded

Real scenario:
- Kodi server offline → notify-kodi job retries
- Discord notification succeeded → already removed from queue
- Pushover notification succeeded → already removed from queue
```

#### **2. Independent Retry Logic**
```typescript
// Option B: Each notifier has its own retry config
await jobQueue.addJob({
  type: 'notify-kodi',
  max_retries: 3,  // Kodi flaky, retry more
  payload: {...}
});

await jobQueue.addJob({
  type: 'notify-discord',
  max_retries: 1,  // Discord reliable, retry less
  payload: {...}
});

await jobQueue.addJob({
  type: 'notify-pushover',
  max_retries: 2,
  payload: {...}
});
```

#### **3. Observability**
```
Job History:
✅ [notify-kodi]     - completed - 500ms
✅ [notify-discord]  - completed - 200ms
❌ [notify-pushover] - failed - "API key invalid"

vs.

❌ [notify] - failed - "One of the notifications failed" (which one??)
```

#### **4. Conditional Execution**
```typescript
// Webhook handler decides which jobs to create
const config = await getNotificationConfig();

if (config.kodi.enabled) {
  await jobQueue.addJob({ type: 'notify-kodi', ... });
}

if (config.discord.enabled) {
  await jobQueue.addJob({ type: 'notify-discord', ... });
}

// Don't create jobs for disabled services!
```

**Option A would need to check inside the handler:**
```typescript
async handleNotify(job) {
  // Check all configs inside handler
  if (kodiEnabled) await notifyKodi();
  if (discordEnabled) await notifyDiscord();
  // Handler becomes complex coordinator
}
```

#### **5. Priority Differences**
```typescript
// Media players more important than user notifications
await jobQueue.addJob({
  type: 'notify-kodi',
  priority: 5,  // NORMAL (critical for library refresh)
  payload: {...}
});

await jobQueue.addJob({
  type: 'notify-discord',
  priority: 7,  // LOWER (nice-to-have)
  payload: {...}
});
```

#### **6. Parallelization**
```
Option B: All notification jobs picked at once (if workers available)
├─ Worker 1: Processing notify-kodi
├─ Worker 2: Processing notify-discord
└─ Worker 3: Processing notify-pushover

Option A: Single notify job blocks one worker
└─ Worker 1: Processing notify (sequential inside)
```

---

## 🏗️ **Implementation: Fan-Out Pattern**

### Webhook Handler (Producer)

```typescript
async handleWebhookReceived(job: Job): Promise<void> {
  const { source, eventType, movie } = job.payload;

  logger.info('[JobHandlers] Processing webhook', {
    service: 'JobHandlers',
    handler: 'handleWebhookReceived',
    jobId: job.id,
    source,
    eventType
  });

  // Log to activity_log
  await logActivity('webhook', source, eventType, job.payload);

  // Fan out based on event type
  if (eventType === 'Download') {
    // 1. Create scan job
    await this.jobQueue.addJob({
      type: 'scan-movie',
      priority: 2, // HIGH
      payload: {
        moviePath: movie.folderPath,
        tmdbId: movie.tmdbId,
        title: movie.title,
        year: movie.year
      },
      max_retries: 3
    });

    // 2. Fan out to notification jobs
    await this.createNotificationJobs('movie.downloaded', {
      movieId: movie.id,
      title: movie.title,
      year: movie.year
    });

    logger.info('[JobHandlers] Webhook fan-out complete', {
      jobId: job.id,
      eventType,
      jobsCreated: ['scan-movie', 'notifications']
    });
  }
}

/**
 * Create notification jobs for all enabled services
 */
private async createNotificationJobs(
  event: string,
  context: any
): Promise<void> {
  const config = await this.getNotificationConfig();

  // Only create jobs for enabled services
  const jobsCreated: string[] = [];

  // Kodi notification (media player refresh)
  if (config.kodi?.enabled) {
    await this.jobQueue.addJob({
      type: 'notify-kodi',
      priority: 5, // NORMAL
      payload: { event, context },
      max_retries: 3 // Retry if Kodi offline
    });
    jobsCreated.push('notify-kodi');
  }

  // Jellyfin notification (media player refresh)
  if (config.jellyfin?.enabled) {
    await this.jobQueue.addJob({
      type: 'notify-jellyfin',
      priority: 5,
      payload: { event, context },
      max_retries: 3
    });
    jobsCreated.push('notify-jellyfin');
  }

  // Discord notification (user notification)
  if (config.discord?.enabled) {
    await this.jobQueue.addJob({
      type: 'notify-discord',
      priority: 7, // LOWER (nice-to-have)
      payload: { event, context },
      max_retries: 1 // Don't spam Discord
    });
    jobsCreated.push('notify-discord');
  }

  // Pushover notification (user notification)
  if (config.pushover?.enabled) {
    await this.jobQueue.addJob({
      type: 'notify-pushover',
      priority: 7,
      payload: { event, context },
      max_retries: 1
    });
    jobsCreated.push('notify-pushover');
  }

  logger.info('[JobHandlers] Notification jobs created', {
    event,
    jobsCreated
  });
}
```

### Individual Notifier Handlers (Consumers)

```typescript
/**
 * Notify Kodi media players
 */
async handleNotifyKodi(job: Job): Promise<void> {
  logger.info('[JobHandlers] Processing Kodi notification', {
    service: 'JobHandlers',
    handler: 'handleNotifyKodi',
    jobId: job.id
  });

  const { event, context } = job.payload;

  // Get all Kodi groups
  const kodiGroups = await this.getMediaPlayerGroups('kodi');

  if (kodiGroups.length === 0) {
    logger.warn('[JobHandlers] No Kodi groups configured', {
      jobId: job.id
    });
    return; // Job completes (no-op)
  }

  // Notify each group
  for (const group of kodiGroups) {
    try {
      await this.notificationService.notifyKodi(group.id, event, context);
      logger.info('[JobHandlers] Kodi group notified', {
        jobId: job.id,
        groupId: group.id,
        groupName: group.name
      });
    } catch (error: any) {
      logger.error('[JobHandlers] Failed to notify Kodi group', {
        jobId: job.id,
        groupId: group.id,
        error: error.message
      });
      // Don't throw - continue with other groups
      // If ALL groups fail, throw at the end
    }
  }
}

/**
 * Notify Discord webhook
 */
async handleNotifyDiscord(job: Job): Promise<void> {
  logger.info('[JobHandlers] Processing Discord notification', {
    service: 'JobHandlers',
    handler: 'handleNotifyDiscord',
    jobId: job.id
  });

  const { event, context } = job.payload;
  const config = await this.getNotificationConfig('discord');

  // Format message based on event
  let message: string;
  if (event === 'movie.downloaded') {
    message = `🎬 **${context.title}** (${context.year}) has been downloaded!`;
  } else if (event === 'movie.upgraded') {
    message = `⬆️ **${context.title}** has been upgraded to better quality!`;
  } else {
    message = `📢 Event: ${event}`;
  }

  // Send to Discord
  await this.notificationService.sendDiscordWebhook(
    config.webhookUrl,
    message
  );

  logger.info('[JobHandlers] Discord notified', {
    jobId: job.id,
    event
  });
}

/**
 * Notify Pushover
 */
async handleNotifyPushover(job: Job): Promise<void> {
  logger.info('[JobHandlers] Processing Pushover notification', {
    service: 'JobHandlers',
    handler: 'handleNotifyPushover',
    jobId: job.id
  });

  const { event, context } = job.payload;
  const config = await this.getNotificationConfig('pushover');

  // Format notification
  const notification = {
    token: config.apiToken,
    user: config.userKey,
    title: 'Metarr',
    message: `${context.title} (${context.year}) downloaded`,
    priority: event === 'movie.downloaded' ? 0 : -1
  };

  await this.notificationService.sendPushoverNotification(notification);

  logger.info('[JobHandlers] Pushover notified', {
    jobId: job.id,
    event
  });
}
```

---

## 🔄 **Job Lifecycle: Completed = Removed**

### Your Observation: "Once completed, job is removed"

**✅ Correct!** This is the design we implemented:

```
┌─────────────┐
│  job_queue  │  status = 'pending'
└──────┬──────┘
       │
       │ pickNextJob()
       ▼
┌─────────────┐
│  job_queue  │  status = 'processing'
└──────┬──────┘
       │
       │ completeJob()
       ▼
┌─────────────┐
│ job_history │  status = 'completed'  ← MOVED HERE
└─────────────┘
       │
       └─ REMOVED from job_queue
```

**Why?**
- ✅ Active queue only contains work to be done
- ✅ Completed jobs archived to history
- ✅ Fast queries (no filtering completed jobs)
- ✅ Clean separation (queue vs audit trail)

**Industry Standard**: This matches **BullMQ**, **Celery**, **AWS SQS**

---

## ⏰ **Scheduled Tasks: Two Approaches**

### Your Question: "Cron that produces jobs OR job that's never removed?"

Let's compare both approaches:

### **Option 1: External Cron Produces Jobs** (Current)

```typescript
class FileScannerScheduler {
  start() {
    // Every night at 3 AM, CREATE a job
    cron.schedule('0 3 * * *', async () => {
      await jobQueue.addJob({
        type: 'scheduled-file-scan',
        priority: 8,
        payload: { trigger: 'scheduler' }
      });
    });
  }
}
```

**Flow**:
```
FileScannerScheduler (cron: 0 3 * * *)
         │
         └─→ Creates job at 3 AM
                 │
                 ▼
           [scheduled-file-scan] job
                 │
                 │ Processed
                 ▼
           Moved to history (completed)
                 │
         Next day at 3 AM: New job created
```

**Pros**:
- ✅ Simple: Scheduler creates jobs, queue processes them
- ✅ Consistent: Scheduled jobs follow same queue logic
- ✅ Observable: Job history shows every execution
- ✅ Flexible: Easy to change schedule (just restart app)

**Cons**:
- ❌ External dependency (cron library)
- ❌ Schedule not in database (can't change without restart)

---

### **Option 2: Persistent Recurring Jobs** (Alternative)

```sql
-- Add recurring columns to job_queue
ALTER TABLE job_queue ADD COLUMN recurring TEXT;      -- '0 3 * * *' or NULL
ALTER TABLE job_queue ADD COLUMN last_completed DATETIME;
ALTER TABLE job_queue ADD COLUMN next_run DATETIME;
```

```typescript
// Job stays in queue, never removed
async completeRecurringJob(jobId: number): Promise<void> {
  const job = await this.storage.getJob(jobId);

  if (job.recurring) {
    // Calculate next run time
    const nextRun = calculateNextRun(job.recurring); // Parse cron

    // Update job, don't remove
    await db.execute(
      `UPDATE job_queue
       SET status = 'pending',
           last_completed = CURRENT_TIMESTAMP,
           next_run = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [nextRun, jobId]
    );

    // Archive to history (for audit)
    await this.archiveJobExecution(jobId);
  } else {
    // Normal job: Remove from queue
    await this.completeJob(jobId);
  }
}

// Picker skips recurring jobs until next_run
async pickNextJob(): Promise<Job | null> {
  const jobs = await db.query(
    `SELECT * FROM job_queue
     WHERE status = 'pending'
       AND (next_run IS NULL OR next_run <= CURRENT_TIMESTAMP)
     ORDER BY priority ASC, created_at ASC
     LIMIT 1`
  );
  // ...
}
```

**Flow**:
```
[scheduled-file-scan] job (recurring: '0 3 * * *')
         │
         │ Processed at 3 AM
         ▼
   status = 'pending'
   last_completed = 2025-10-15 03:00:00
   next_run = 2025-10-16 03:00:00
         │
         │ (stays in queue, skipped until next_run)
         │
         │ Next day at 3 AM
         ▼
   Picked again, processed, next_run updated
```

**Pros**:
- ✅ Schedule in database (can change without restart)
- ✅ Job persistence (survives restarts)
- ✅ No external cron dependency

**Cons**:
- ❌ More complex (need to calculate next_run, skip logic)
- ❌ Active queue cluttered with sleeping jobs
- ❌ Risk of accidental deletion (if you delete the job, schedule gone)

---

## 🎯 **Recommendation**

### **Use Option 1: External Cron (Current Approach)**

**Why?**
1. **Simpler**: Scheduler creates jobs, queue processes them
2. **Cleaner**: Active queue only contains ready-to-process jobs
3. **Consistent**: Scheduled jobs follow same lifecycle as other jobs
4. **Observable**: Every execution logged in job_history

**Industry Examples**:
- ✅ **Celery Beat**: External scheduler creates periodic tasks
- ✅ **Kubernetes CronJobs**: External scheduler creates pods
- ✅ **AWS EventBridge**: External scheduler triggers Lambda

### **When to Use Option 2: Persistent Recurring Jobs**

Use this if you need:
- Dynamic schedule changes without restart
- User-defined recurring jobs (e.g., "Export report every Monday")
- Multi-tenant with per-tenant schedules

**Industry Examples**:
- ✅ **BullMQ**: Repeatable jobs with cron syntax
- ✅ **APScheduler**: Persistent job store
- ✅ **Sidekiq-Cron**: Redis-backed recurring jobs

---

## 📊 **Architecture Comparison**

### **Fan-Out: Parent Handler vs Multiple Jobs**

| Aspect | Parent Handler (Option A) | Multiple Jobs (Option B) |
|--------|--------------------------|--------------------------|
| **Failure Isolation** | ❌ One failure = retry all | ✅ Independent retry |
| **Retry Logic** | ❌ Same for all notifiers | ✅ Per-notifier config |
| **Observability** | ❌ One job entry | ✅ Separate history per notifier |
| **Parallelization** | ❌ Sequential inside handler | ✅ Parallel processing |
| **Priority** | ❌ Same for all | ✅ Different per notifier |
| **Conditional Execution** | ⚠️ Check inside handler | ✅ Don't create job if disabled |
| **Complexity** | ⚠️ Handler is coordinator | ✅ Simple handlers |

**Winner**: Option B (Multiple Jobs) ✅

---

### **Scheduled Tasks: Cron vs Persistent**

| Aspect | External Cron (Option 1) | Persistent Jobs (Option 2) |
|--------|-------------------------|---------------------------|
| **Simplicity** | ✅ Simple | ❌ Complex (next_run calc) |
| **Queue Clutter** | ✅ Clean queue | ❌ Sleeping jobs in queue |
| **Dynamic Schedules** | ❌ Needs restart | ✅ Change in DB |
| **Observability** | ✅ Every run in history | ✅ Every run in history |
| **Risk** | ✅ Can't accidentally delete | ❌ Delete job = lose schedule |
| **Industry Standard** | ✅ Celery, K8s, AWS | ✅ BullMQ, APScheduler |

**Winner**: Option 1 (External Cron) for simplicity ✅
**Use Option 2** if you need dynamic schedules

---

## ✅ **Final Recommendation**

### **Fan-Out Architecture**:
```
webhook-received job
         │
         ├─→ scan-movie job
         ├─→ notify-kodi job       ← Separate jobs
         ├─→ notify-discord job    ← Separate jobs
         └─→ notify-pushover job   ← Separate jobs

Each job completes → removed → archived to history
```

### **Scheduled Tasks**:
```
FileScannerScheduler (external cron)
         │
         └─→ Creates job at scheduled time
                 │
                 ▼
           [scheduled-file-scan] job
                 │
                 │ Processed
                 ▼
           Completed → removed → archived

Next scheduled time: New job created
```

---

## 🚀 **Implementation Summary**

**What to implement**:
1. ✅ Multiple specific notification jobs (not parent)
2. ✅ Webhook handler fans out to multiple jobs
3. ✅ Each notifier checks its own config
4. ✅ Jobs removed after completion (archived to history)
5. ✅ Keep external cron schedulers (FileScannerScheduler, etc.)

**What NOT to implement**:
1. ❌ Parent notification handler (coordinator)
2. ❌ Persistent recurring jobs in queue

**Result**: Clean, simple, scalable architecture matching industry best practices! ✅
