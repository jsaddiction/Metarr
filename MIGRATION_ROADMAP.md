# 🚀 MIGRATION ROADMAP: Old → New Architecture

**Last Updated**: 2025-10-15 (Phase 0 Complete)
**Active Branch**: `master`
**Database**: SQLite3 (development - recreate on each migration change)

---

## 📊 QUICK STATUS CHECK

**Current Phase**: ✅ Phase 0 Complete | ⏳ Ready to start Phase 1
**Phase Progress**: 100% (Phase 0) | 0% (Phase 1)
**Overall Progress**: 16% (1 of 6 phases complete)
**Active Branch**: `master` (need to create `feature/phase-1-backend-core`)
**Next Action**: → Review Phase 1 plan, create branch, start Task 1.1

### Last Session Summary:
- ✅ Created clean database migration (20251015_001_clean_schema.ts)
- ✅ Archived old migrations to `_archive/`
- ✅ Updated all documentation (SSE → WebSocket)
- ✅ Database tested and working
- 🎯 **Next**: Begin Phase 1 - Backend Core Services

---

## ⚠️ CRITICAL DEVELOPMENT RULES

### 🔴 SERVER MANAGEMENT (READ THIS EVERY SESSION)

**IMPORTANT**: Claude (the AI assistant) does NOT manage development servers.

**YOU (the human) are responsible for:**
- Starting backend: `npm run dev` (nodemon auto-restarts on file changes)
- Starting frontend: `npm run dev:frontend` (Vite auto-restarts on file changes)
- Managing both servers via terminal
- Restarting servers when explicitly needed

**Claude will:**
- ❌ NEVER run `npm run dev` or `npm run dev:frontend` commands
- ❌ NEVER start/stop servers automatically
- ✅ ASK you to restart servers when necessary
- ✅ Tell you when file watchers should auto-reload
- ✅ Inform you if manual restart is needed (e.g., env changes, new dependencies)

### 🗄️ DATABASE DEVELOPMENT STRATEGY

**Development (Current Phase)**:
- Using **SQLite3** (`data/metarr.sqlite`)
- **Single migration approach**: All schema changes go into `20251015_001_clean_schema.ts`
- **Fresh start strategy**: Delete `data/metarr.sqlite` and run `npm run migrate` to recreate
- **Why**: Ensures consistent base architecture across development environments
- **No incremental migrations**: During active development, we rebuild from scratch

**Beta/Production (Future)**:
- Switch to **incremental migrations**: Each change gets its own migration file
- Keep migration history for upgrade paths
- Support multiple database types (PostgreSQL for production)

**Current Workflow**:
```bash
# When schema changes during development:
1. Update: src/database/migrations/20251015_001_clean_schema.ts
2. Delete: data/metarr.sqlite
3. Run: npm run migrate
4. Restart backend (if running)
```

---

## 🎯 MIGRATION OVERVIEW

### Goal
Transform Metarr from **overcomplicated old architecture** to **streamlined new architecture** while:
- Maintaining git history
- Enabling multi-session/multi-computer development
- Providing clear checkpoints
- Minimizing risk of getting lost

### Current State → Target State

| Aspect | Old Architecture | New Architecture |
|--------|------------------|------------------|
| **Communication** | REST + SSE | REST + WebSocket |
| **States** | 6 states (overcomplicated) | 3 states (simple) |
| **Asset System** | Three-tier (candidates → cache → library) | Two-tier (cache → library) |
| **Automation** | Three modes (Manual/YOLO/Hybrid) | Single mode with field locking |
| **Processing** | Lazy loading, staged, complex | Immediate processing, simple |
| **Job Queue** | Overcomplicated priority system | Simple database-backed queue |
| **Cache** | Complex inventory tracking | Simple content-addressed SHA256 |

### Success Criteria
- ✅ Database schema matches `DATABASE_SCHEMA.md`
- ✅ WebSocket communication works
- ✅ Real-time progress updates functional
- ✅ Field locking prevents automation overwrites
- ✅ Job queue processes tasks by priority
- ✅ Cache service manages content-addressed assets
- ✅ All old architecture code removed
- ✅ Frontend shows connection state
- ✅ Movies page works end-to-end

### Timeline
- **Phase 0**: ✅ Foundation (2 hours) - COMPLETED
- **Phase 1**: Backend Core Services (2-3 days)
- **Phase 2**: Backend Controllers & Routes (2 days)
- **Phase 3**: Frontend Infrastructure (2 days)
- **Phase 4**: Frontend Pages & Components (2 days)
- **Phase 5**: Integration & Testing (1-2 days)
- **Total**: ~10-12 days of focused work

---

## 📦 PHASE TRACKING

### ✅ Phase 0: Foundation (COMPLETED 2025-10-15)
**Branch**: `master`
**Status**: ✅ 100% Complete

- [x] Create clean database migration from `DATABASE_SCHEMA.md`
- [x] Archive old migrations to `_archive/`
- [x] Create migration runner script
- [x] Delete old database, run new migration
- [x] Verify new schema works
- [x] Update API_ARCHITECTURE.md (SSE → WebSocket)
- [x] Update ARCHITECTURE.md (SSE → WebSocket)
- [x] Update CLAUDE.md (SSE → WebSocket)

**Git Commits**:
- Initial: Archive old migrations
- Second: Create clean migration
- Third: Update documentation

**Validation**: ✅ `npm run migrate` works, new database created successfully

---

### ⏳ Phase 1: Backend Core Services (READY TO START)
**Branch**: `feature/phase-1-backend-core` (create this)
**Status**: ⬜ 0% Complete (0 of 5 tasks)
**Estimated Duration**: 2-3 days

**Goal**: Remove old architecture services, create new streamlined services

#### Task 1.1: Remove Old Services ⬜
**Files to Delete**:
```
src/services/assetCacheService.ts              (old three-tier cache)
src/services/assetSaveService.ts               (old three-tier)
src/services/autoSelectionService.ts           (overcomplicated algorithm)
src/services/dataSelectionService.ts           (overcomplicated)
src/services/enrichmentDecisionService.ts      (not needed)
src/services/scheduledEnrichmentService.ts     (replace with job queue)
```

**Why Removing**:
- Old three-tier asset system (candidates → cache → library)
- Overcomplicated auto-selection algorithms
- Lazy loading/staging concepts removed
- Will be replaced by simpler services

**Steps**:
1. Create branch: `git checkout -b feature/phase-1-backend-core`
2. Delete files listed above
3. Commit: `git commit -m "[Phase 1.1] Remove old architecture services"`
4. Push: `git push origin feature/phase-1-backend-core`

**Validation**: ✅ Code compiles (ignore TypeScript errors about missing imports - we'll fix in later tasks)

---

#### Task 1.2: Create WebSocketBroadcaster Service ⬜
**File to Create**: `src/services/websocketBroadcaster.ts`

**Purpose**: Central WebSocket server for broadcasting events to frontend

**Implementation** (from API_ARCHITECTURE.md):
```typescript
import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { EventEmitter } from 'events';

export class WebSocketBroadcaster extends EventEmitter {
  private wss: WebSocketServer;
  private clients: Map<string, WebSocket> = new Map();

  constructor(httpServer: Server) {
    super();
    this.wss = new WebSocketServer({
      server: httpServer,
      path: '/ws'
    });

    this.wss.on('connection', (ws: WebSocket) => {
      const clientId = this.generateClientId();
      this.clients.set(clientId, ws);

      // Send connection confirmation
      this.sendToClient(ws, {
        type: 'connection:established',
        clientId,
        timestamp: new Date().toISOString()
      });

      // Handle ping messages
      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'ping') {
          this.sendToClient(ws, {
            type: 'pong',
            timestamp: new Date().toISOString()
          });
        }
      });

      // Handle client disconnect
      ws.on('close', () => {
        this.clients.delete(clientId);
        console.log(`Client ${clientId} disconnected`);
      });

      ws.on('error', (error) => {
        console.error(`WebSocket error for client ${clientId}:`, error);
        this.clients.delete(clientId);
      });
    });
  }

  // Broadcast event to all connected clients
  broadcast(eventType: string, data: any): void {
    const message = JSON.stringify({
      type: eventType,
      data,
      timestamp: new Date().toISOString()
    });

    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  // Send to specific client
  private sendToClient(client: WebSocket, message: any): void {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  }

  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Clean up
  close(): void {
    this.clients.forEach((client) => client.close());
    this.clients.clear();
    this.wss.close();
  }
}
```

**Steps**:
1. Create file `src/services/websocketBroadcaster.ts`
2. Paste implementation above
3. Commit: `git commit -m "[Phase 1.2] Create WebSocketBroadcaster service"`
4. Push: `git push origin feature/phase-1-backend-core`

**Validation**: ✅ File compiles without errors

---

#### Task 1.3: Create CacheService ⬜
**File to Create**: `src/services/cacheService.ts`

**Purpose**: Manage content-addressed cache (SHA256-based asset storage)

**Key Features**:
- Store asset by content hash: `/cache/assets/{ab}/{cd}/{hash}.ext`
- Retrieve asset by hash
- Calculate SHA256 hash
- Create sharded directory structure
- Reference counting
- Deduplication

**Implementation Outline**:
```typescript
import crypto from 'crypto';
import fs from 'fs-extra';
import path from 'path';

export class CacheService {
  private cacheBasePath: string;

  constructor(cacheBasePath: string = 'data/cache/assets') {
    this.cacheBasePath = cacheBasePath;
    this.ensureCacheDirectoryExists();
  }

  async storeAsset(buffer: Buffer, extension: string): Promise<string> {
    // Calculate SHA256 hash
    const hash = this.calculateHash(buffer);

    // Create sharded path: /cache/assets/{ab}/{cd}/{hash}.ext
    const cachePath = this.getCachePath(hash, extension);

    // Check if already exists (deduplication)
    if (await fs.pathExists(cachePath)) {
      return hash;
    }

    // Create directory structure
    await fs.ensureDir(path.dirname(cachePath));

    // Write file
    await fs.writeFile(cachePath, buffer);

    return hash;
  }

  async retrieveAsset(hash: string, extension: string): Promise<Buffer> {
    const cachePath = this.getCachePath(hash, extension);

    if (!await fs.pathExists(cachePath)) {
      throw new Error(`Asset not found in cache: ${hash}`);
    }

    return fs.readFile(cachePath);
  }

  getCachePath(hash: string, extension: string): string {
    // Shard by first 4 characters: {ab}/{cd}/{full_hash}.ext
    const dir1 = hash.substring(0, 2);
    const dir2 = hash.substring(2, 4);
    return path.join(this.cacheBasePath, dir1, dir2, `${hash}${extension}`);
  }

  calculateHash(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  private async ensureCacheDirectoryExists(): Promise<void> {
    await fs.ensureDir(this.cacheBasePath);
  }

  async assetExists(hash: string, extension: string): Promise<boolean> {
    const cachePath = this.getCachePath(hash, extension);
    return fs.pathExists(cachePath);
  }

  async deleteAsset(hash: string, extension: string): Promise<void> {
    const cachePath = this.getCachePath(hash, extension);
    await fs.remove(cachePath);
  }
}
```

**Steps**:
1. Create file `src/services/cacheService.ts`
2. Implement CacheService class
3. Commit: `git commit -m "[Phase 1.3] Create CacheService for content-addressed storage"`
4. Push: `git push origin feature/phase-1-backend-core`

**Validation**: ✅ File compiles without errors

---

#### Task 1.4: Create JobQueueService ⬜
**File to Create**: `src/services/jobQueueService.ts`

**Purpose**: Database-backed job queue with priority levels

**Key Features**:
- Priority levels (1=critical, 2=high, 5=normal, 10=low)
- Retry logic with exponential backoff
- Job dependencies
- Status tracking (pending, running, completed, failed)

**Implementation Outline**:
```typescript
import { EventEmitter } from 'events';
import { DatabaseConnection } from '../types/database.js';

export interface Job {
  id?: number;
  job_type: 'webhook' | 'enrichment' | 'scan' | 'publish' | 'cleanup' | 'playback_restore';
  priority: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  payload: any;
  result?: any;
  error_message?: string;
  retry_count: number;
  max_retries: number;
  next_retry_at?: Date;
  started_at?: Date;
  completed_at?: Date;
  worker_id?: string;
  created_at?: Date;
  updated_at?: Date;
}

export class JobQueueService extends EventEmitter {
  private db: DatabaseConnection;
  private processing: boolean = false;
  private workerId: string;

  constructor(db: DatabaseConnection) {
    super();
    this.db = db;
    this.workerId = `worker_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async addJob(job: Partial<Job>): Promise<number> {
    const result = await this.db.execute(
      `INSERT INTO job_queue (
        job_type, priority, status, payload,
        retry_count, max_retries, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        job.job_type,
        job.priority || 5,
        'pending',
        JSON.stringify(job.payload),
        0,
        job.max_retries || 3
      ]
    );

    const jobId = result.insertId!;
    this.emit('jobAdded', { jobId, ...job });
    return jobId;
  }

  async getNextJob(): Promise<Job | null> {
    const jobs = await this.db.query<Job>(
      `SELECT * FROM job_queue
       WHERE status = 'pending'
       OR (status = 'failed' AND retry_count < max_retries AND next_retry_at <= CURRENT_TIMESTAMP)
       ORDER BY priority ASC, created_at ASC
       LIMIT 1`
    );

    if (jobs.length === 0) return null;

    const job = jobs[0];
    job.payload = JSON.parse(job.payload as any);
    return job;
  }

  async markJobRunning(jobId: number): Promise<void> {
    await this.db.execute(
      `UPDATE job_queue
       SET status = 'running', started_at = CURRENT_TIMESTAMP, worker_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [this.workerId, jobId]
    );
  }

  async markJobCompleted(jobId: number, result: any): Promise<void> {
    await this.db.execute(
      `UPDATE job_queue
       SET status = 'completed', result = ?, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [JSON.stringify(result), jobId]
    );

    this.emit('jobCompleted', { jobId, result });
  }

  async markJobFailed(jobId: number, error: string): Promise<void> {
    const job = await this.getJob(jobId);

    if (job && job.retry_count < job.max_retries) {
      // Schedule retry with exponential backoff
      const delayMs = Math.min(1000 * Math.pow(2, job.retry_count), 300000); // Max 5 minutes
      const nextRetryAt = new Date(Date.now() + delayMs);

      await this.db.execute(
        `UPDATE job_queue
         SET status = 'failed', error_message = ?, retry_count = retry_count + 1,
             next_retry_at = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [error, nextRetryAt.toISOString(), jobId]
      );
    } else {
      // Max retries reached
      await this.db.execute(
        `UPDATE job_queue
         SET status = 'failed', error_message = ?, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [error, jobId]
      );
    }

    this.emit('jobFailed', { jobId, error });
  }

  async getJob(jobId: number): Promise<Job | null> {
    const jobs = await this.db.query<Job>(
      'SELECT * FROM job_queue WHERE id = ?',
      [jobId]
    );

    if (jobs.length === 0) return null;

    const job = jobs[0];
    job.payload = JSON.parse(job.payload as any);
    if (job.result) job.result = JSON.parse(job.result as any);
    return job;
  }

  async startProcessing(pollInterval: number = 5000): Promise<void> {
    this.processing = true;

    const processNext = async () => {
      if (!this.processing) return;

      try {
        const job = await this.getNextJob();

        if (job) {
          await this.processJob(job);
        }
      } catch (error) {
        console.error('Job processing error:', error);
      }

      // Continue processing
      if (this.processing) {
        setTimeout(processNext, pollInterval);
      }
    };

    processNext();
  }

  stopProcessing(): void {
    this.processing = false;
  }

  private async processJob(job: Job): Promise<void> {
    await this.markJobRunning(job.id!);
    this.emit('jobStarted', { jobId: job.id, type: job.job_type, priority: job.priority });

    try {
      // Job execution will be handled by specific handlers
      // For now, just emit event for other services to handle
      this.emit(`process:${job.job_type}`, job);

      // Services will call markJobCompleted or markJobFailed
    } catch (error: any) {
      await this.markJobFailed(job.id!, error.message);
    }
  }
}
```

**Steps**:
1. Create file `src/services/jobQueueService.ts`
2. Implement JobQueueService class
3. Commit: `git commit -m "[Phase 1.4] Create JobQueueService for background tasks"`
4. Push: `git push origin feature/phase-1-backend-core`

**Validation**: ✅ File compiles without errors

---

#### Task 1.5: Integrate New Services into Main Server ⬜
**Files to Modify**:
- `src/index.ts` - Main server entry point

**Changes**:
1. Import WebSocketBroadcaster
2. Initialize WebSocketBroadcaster with HTTP server
3. Initialize CacheService
4. Initialize JobQueueService
5. Export as singletons for other services to use

**Implementation**:
```typescript
// In src/index.ts

import { WebSocketBroadcaster } from './services/websocketBroadcaster.js';
import { CacheService } from './services/cacheService.js';
import { JobQueueService } from './services/jobQueueService.js';

// After creating HTTP server
const server = http.createServer(app);

// Initialize services
export const wsBroadcaster = new WebSocketBroadcaster(server);
export const cacheService = new CacheService();
export const jobQueueService = new JobQueueService(db.getConnection());

// Start job queue processing
jobQueueService.startProcessing();

// Connect service events to WebSocket broadcaster
jobQueueService.on('jobStarted', (data) => {
  wsBroadcaster.broadcast('job:started', data);
});

jobQueueService.on('jobCompleted', (data) => {
  wsBroadcaster.broadcast('job:completed', data);
});

jobQueueService.on('jobFailed', (data) => {
  wsBroadcaster.broadcast('job:failed', data);
});

// Start server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

**Steps**:
1. Modify `src/index.ts` to integrate new services
2. Test compilation: `npm run build`
3. **ASK USER** to restart backend server: `npm run dev`
4. Test WebSocket connection (use browser console or WebSocket client)
5. Commit: `git commit -m "[Phase 1.5] Integrate new services into main server"`
6. Push: `git push origin feature/phase-1-backend-core`

**Validation**:
- ✅ Backend compiles
- ✅ Backend starts without errors
- ✅ WebSocket endpoint available at `ws://localhost:3000/ws`
- ✅ Can connect via browser console: `new WebSocket('ws://localhost:3000/ws')`

---

#### Phase 1 Completion Checklist ⬜
- [ ] All 5 tasks completed
- [ ] Code compiles without errors
- [ ] Backend starts successfully
- [ ] WebSocket connection works
- [ ] All commits pushed to branch
- [ ] MIGRATION_ROADMAP.md updated with progress
- [ ] Ready to merge to master

**Merge to Master**:
```bash
git checkout master
git merge feature/phase-1-backend-core
git push origin master
git branch -d feature/phase-1-backend-core
```

---

### ⬜ Phase 2: Backend Controllers & Routes (PLANNED)
**Branch**: `feature/phase-2-backend-routes` (create after Phase 1)
**Status**: ⬜ 0% Complete (0 of 4 tasks)
**Prerequisites**: Phase 1 complete

**Goal**: Remove old route handlers, update existing routes for new schema

#### Task 2.1: Remove Old Controllers ⬜
**Files to Delete**:
```
src/controllers/assetController.ts              (asset candidates)
src/controllers/automationConfigController.ts   (three automation modes)
src/controllers/autoSelectionController.ts      (overcomplicated selection)
src/controllers/dataSelectionController.ts      (overcomplicated)
```

**Why**: Old architecture controllers no longer needed

---

#### Task 2.2: Remove Old Routes ⬜
**File to Modify**: `src/routes/api.ts`

**Routes to Remove**:
```typescript
POST   /api/asset-selection/*
POST   /api/data-selection/*
GET    /api/automation-config/*
POST   /api/priority-config/*
POST   /api/movies/:id/publish
POST   /api/movies/:id/select-assets
```

**Why**: No longer needed with simplified architecture

---

#### Task 2.3: Update Movie Routes for New Schema ⬜
**File to Modify**: `src/controllers/movieController.ts`

**Changes Needed**:
- Update to use new simplified schema (no `state`, `has_unpublished_changes`)
- Use `identification_status` instead (unidentified, identified, enriched)
- Remove publish workflow logic
- Update field locking logic
- Use new CacheService for assets

---

#### Task 2.4: Add Job Queue Routes ⬜
**File to Modify**: `src/routes/api.ts`

**Routes to Add**:
```typescript
GET    /api/jobs              // List jobs with filtering
GET    /api/jobs/:id          // Get job details
POST   /api/jobs/:id/retry    // Retry failed job
DELETE /api/jobs/:id          // Cancel pending job
```

---

### ⬜ Phase 3: Frontend Infrastructure (PLANNED)
**Branch**: `feature/phase-3-frontend-infra`
**Status**: ⬜ 0% Complete (0 of 3 tasks)
**Prerequisites**: Phase 2 complete

**Goal**: Create WebSocket hook, connection state management, remove old components

#### Task 3.1: Create useWebSocket Hook ⬜
**File to Create**: `public/frontend/src/hooks/useWebSocket.ts`

**Purpose**: Manage WebSocket connection, handle reconnection, provide subscription API

**Features**:
- Auto-connect on mount
- Ping/pong heartbeat (30s interval)
- Exponential backoff reconnection
- Connection state tracking
- Event subscription system

---

#### Task 3.2: Create ConnectionIndicator Component ⬜
**File to Create**: `public/frontend/src/components/ui/ConnectionIndicator.tsx`

**Purpose**: Visual indicator of WebSocket connection state

**States**:
- 🟢 Connected
- 🔴 Disconnected - Data may be stale
- 🟡 Reconnecting...

---

#### Task 3.3: Remove Old Frontend Components ⬜
**Directories to Delete**:
```
public/frontend/src/components/asset/
public/frontend/src/pages/settings/DataSelection.tsx
public/frontend/src/components/provider/AssetTypePriorityConfig.tsx
public/frontend/src/components/provider/MetadataFieldPriorityConfig.tsx
public/frontend/src/components/provider/AutoSelectionStrategyToggle.tsx
public/frontend/src/components/provider/ProviderCoverageStatus.tsx
```

**Why**: Old asset selection UI not needed with simplified architecture

---

### ⬜ Phase 4: Frontend Pages & Components (PLANNED)
**Branch**: `feature/phase-4-frontend-pages`
**Status**: ⬜ 0% Complete (0 of 3 tasks)
**Prerequisites**: Phase 3 complete

**Goal**: Update pages for new schema, integrate WebSocket

#### Task 4.1: Update Movies Page ⬜
**File to Modify**: `public/frontend/src/pages/metadata/Movies.tsx`

**Changes**:
- Remove publish button (immediate writes)
- Update for new schema fields
- Add real-time updates via WebSocket
- Show field lock status
- Remove asset candidate selection UI

---

#### Task 4.2: Update Settings Pages ⬜
**Files to Modify**:
```
public/frontend/src/pages/settings/Providers.tsx
public/frontend/src/pages/settings/Libraries.tsx
```

**Changes**:
- Remove automation mode selection
- Simplify provider priority UI
- Remove asset type priority configuration
- Remove metadata field priority configuration

---

#### Task 4.3: Add Connection Indicator to Header ⬜
**File to Modify**: `public/frontend/src/components/layout/Header.tsx`

**Changes**:
- Import ConnectionIndicator
- Show connection state in header
- Use useWebSocket hook for state

---

### ⬜ Phase 5: Integration & Testing (PLANNED)
**Branch**: `feature/phase-5-integration`
**Status**: ⬜ 0% Complete (0 of 4 tasks)
**Prerequisites**: Phase 4 complete

**Goal**: End-to-end testing, bug fixes, polish

#### Task 5.1: End-to-End Workflow Testing ⬜
**Test Cases**:
- [ ] Create library, scan directory
- [ ] Identify movie (auto or manual)
- [ ] Fetch metadata from TMDB
- [ ] Download assets to cache
- [ ] Generate NFO file
- [ ] Lock field via manual edit
- [ ] Verify automation respects locks
- [ ] WebSocket updates work in UI

---

#### Task 5.2: WebSocket Connection Testing ⬜
**Test Cases**:
- [ ] Connect on page load
- [ ] Ping/pong heartbeat works
- [ ] Reconnects after disconnect
- [ ] Shows correct connection state
- [ ] Events received and processed

---

#### Task 5.3: Job Queue Testing ⬜
**Test Cases**:
- [ ] Jobs created with correct priority
- [ ] Jobs processed in priority order
- [ ] Failed jobs retry with backoff
- [ ] Job status updates via WebSocket

---

#### Task 5.4: Database Migration Testing ⬜
**Test Cases**:
- [ ] Delete database, recreate from scratch
- [ ] All tables created correctly
- [ ] Indexes created
- [ ] Foreign keys work
- [ ] Test on different development machine

---

## 🗂️ REFERENCE TABLES

### Service Mapping (Old → New)

| Old Service | Status | New Service | Notes |
|-------------|--------|-------------|-------|
| `assetCacheService.ts` | ❌ DELETE | `cacheService.ts` | Simplified content-addressed storage |
| `assetSaveService.ts` | ❌ DELETE | `cacheService.ts` | Merged into CacheService |
| `autoSelectionService.ts` | ❌ DELETE | None | Auto-selection simplified, logic in enrichment |
| `dataSelectionService.ts` | ❌ DELETE | None | Not needed |
| `enrichmentDecisionService.ts` | ❌ DELETE | None | Not needed |
| `scheduledEnrichmentService.ts` | ❌ DELETE | `jobQueueService.ts` | Job queue handles scheduling |
| `libraryScanService.ts` | ✅ KEEP | (same) | Update for new schema |
| `libraryService.ts` | ✅ KEEP | (same) | Update for new schema |
| `movieService.ts` | ✅ KEEP | (same) | Update for new schema |
| `providerConfigService.ts` | ✅ KEEP | (same) | Keep as-is |
| `websocketBroadcaster.ts` | 🆕 CREATE | - | New service for WebSocket |

---

### Route Mapping (Old → New)

| Old Route | Status | New Route | Notes |
|-----------|--------|-----------|-------|
| `POST /api/asset-selection/*` | ❌ DELETE | None | Not needed |
| `POST /api/data-selection/*` | ❌ DELETE | None | Not needed |
| `GET /api/automation-config/*` | ❌ DELETE | None | No automation modes |
| `POST /api/priority-config/*` | ❌ DELETE | None | Simplified |
| `POST /api/movies/:id/publish` | ❌ DELETE | None | Immediate writes |
| `POST /api/movies/:id/select-assets` | ❌ DELETE | None | Auto-selection simplified |
| `GET /api/movies` | ✅ KEEP | (same) | Update for new schema |
| `GET /api/movies/:id` | ✅ KEEP | (same) | Update for new schema |
| `PATCH /api/movies/:id/metadata` | ✅ KEEP | (same) | Already correct |
| `POST /api/movies/:id/lock` | ✅ KEEP | (same) | Already correct |
| `GET /api/jobs` | 🆕 CREATE | - | New job queue routes |
| `GET /api/jobs/:id` | 🆕 CREATE | - | New job queue routes |
| `POST /api/jobs/:id/retry` | 🆕 CREATE | - | New job queue routes |
| `WS /ws` | 🆕 CREATE | - | New WebSocket endpoint |

---

### Component Mapping (Old → New)

| Old Component | Status | New Component | Notes |
|---------------|--------|---------------|-------|
| `components/asset/*` | ❌ DELETE | None | Asset candidate UI not needed |
| `AssetTypePriorityConfig.tsx` | ❌ DELETE | None | Simplified priority |
| `MetadataFieldPriorityConfig.tsx` | ❌ DELETE | None | Simplified priority |
| `AutoSelectionStrategyToggle.tsx` | ❌ DELETE | None | No selection modes |
| `ProviderCoverageStatus.tsx` | ❌ DELETE | None | Simplified |
| `DataSelection.tsx` (page) | ❌ DELETE | None | Not needed |
| `MovieCard.tsx` | ✅ KEEP | (same) | Update for new schema |
| `MovieTableView.tsx` | ✅ KEEP | (same) | Update for new schema |
| `LibraryCard.tsx` | ✅ KEEP | (same) | Already correct |
| `ProviderCard.tsx` | ✅ KEEP | (same) | Simplify UI |
| `ConnectionIndicator.tsx` | 🆕 CREATE | - | New WebSocket indicator |
| `useWebSocket.ts` (hook) | 🆕 CREATE | - | New WebSocket hook |

---

### Database Schema Changes

| Table | Status | Notes |
|-------|--------|-------|
| `asset_candidates` | ❌ REMOVED | Old three-tier system |
| `cache_inventory` | ❌ REMOVED | Old reference counting |
| `backup_assets` | ❌ REMOVED | Not needed |
| `asset_selection_config` | ❌ REMOVED | Overcomplicated |
| `library_automation_config` | ❌ REMOVED | Three automation modes |
| `rejected_assets` | ❌ REMOVED | Not needed |
| `publish_log` | ❌ REMOVED | No publish workflow |
| `completeness_config` | ❌ REMOVED | Overcomplicated |
| `asset_type_priorities` | ❌ REMOVED | Over-engineered |
| `metadata_field_priorities` | ❌ REMOVED | Over-engineered |
| `cache_assets` | ✅ NEW | Content-addressed cache |
| `asset_references` | ✅ NEW | Track asset usage |
| `job_queue` | ✅ NEW | Background task queue |
| `job_dependencies` | ✅ NEW | Job dependencies |
| `playback_state` | ✅ NEW | Playback capture/restore |
| `webhook_events` | ✅ NEW | Webhook tracking |
| `media_player_groups` | ✅ NEW | Kodi groups |
| `path_mappings` | ✅ NEW | Path translation |
| `movies` | ✅ UPDATED | Simplified columns |
| `series` | ✅ UPDATED | Simplified columns |
| `episodes` | ✅ UPDATED | Simplified columns |

---

## 📝 DECISION LOG

### 2025-10-15: WebSocket over SSE
**Decision**: Use WebSocket instead of Server-Sent Events (SSE)

**Rationale**:
- User wants connection state awareness (know when data is stale)
- Ping/pong heartbeat for connection health
- Single WebSocket in network tab (easier debugging)
- Bidirectional ready (future-proof for client → server events)
- User preference based on previous project experience

**Impact**: All documentation updated, API_ARCHITECTURE.md rewritten

---

### 2025-10-15: Single Migration Strategy During Development
**Decision**: Use single migration file during development, recreate database from scratch

**Rationale**:
- Ensures consistent base architecture across development environments
- Simpler than incremental migrations during active design
- Multiple development computers with different states
- Switch to incremental migrations at beta phase

**Implementation**:
- All schema changes go into `20251015_001_clean_schema.ts`
- Delete `data/metarr.sqlite` and run `npm run migrate` to recreate
- Will switch to incremental migrations at beta

---

### 2025-10-15: Hybrid Approach (Sequential + Strangler Fig)
**Decision**: Use sequential bottom-up phases with strangler fig pattern within phases

**Rationale**:
- Sequential ensures clear dependencies (database → backend → frontend)
- Strangler fig reduces risk (old code stays until new validates)
- Fits multi-session work (clear checkpoints)
- Easier to track progress across sessions and computers

**Alternative Considered**: Pure strangler fig - Rejected (too messy during migration)

---

### 2025-10-15: No Subagents Until Phase 3+
**Decision**: Single-threaded work for Phases 0-2, consider subagents for Phase 3+

**Rationale**:
- Phases 0-2 are backend foundation with sequential dependencies
- Less complexity = less chance of getting lost between sessions
- Phase 3+ can split cleanly (backend final touches || frontend work)
- User working solo across multiple sessions

---

## 🆘 EMERGENCY PROCEDURES

### 😰 "I'm Lost - Where Am I?"

1. **Open this file** (`MIGRATION_ROADMAP.md`)
2. **Read "Quick Status Check"** at the top
3. **Find your current phase** in "Phase Tracking"
4. **Check git branch**: `git branch` (should match phase branch)
5. **Read "Next Action"** bullet point
6. **If still unclear**: Read current phase's task list

---

### 💥 "Backend Won't Start"

1. **Check console errors**
2. **Verify dependencies**: `npm install`
3. **Check TypeScript compilation**: `npm run build`
4. **Review last commit**: `git log -1 --stat`
5. **Check database exists**: `ls data/metarr.sqlite`
   - If missing: `npm run migrate`
6. **If still broken**:
   - Check MIGRATION_ROADMAP.md "Decision Log"
   - Roll back: `git reset --hard HEAD~1`
   - Ask for help (describe error)

---

### 🔧 "Database Schema Mismatch"

**During Development (Current)**:
```bash
# Delete and recreate database
rm data/metarr.sqlite
npm run migrate
```

**YOU restart backend**: `npm run dev` (in your terminal)

---

### 🌳 "Git Merge Conflict"

1. **Don't panic** - conflicts are normal
2. **Check which files**: `git status`
3. **For each conflict**:
   - Open file in editor
   - Look for `<<<<<<< HEAD` markers
   - Choose correct version or merge manually
   - Remove conflict markers
4. **Stage resolved files**: `git add <file>`
5. **Complete merge**: `git commit`

---

### 🔙 "Need to Roll Back"

**Undo last commit (keep changes)**:
```bash
git reset --soft HEAD~1
```

**Undo last commit (discard changes)**:
```bash
git reset --hard HEAD~1
```

**Undo multiple commits**:
```bash
git reset --hard HEAD~3  # Goes back 3 commits
```

**Recover if you pushed**:
```bash
git revert HEAD  # Creates new commit that undoes last one
```

---

### 🤔 "Unsure About Next Step"

1. **STOP** - Don't guess
2. **Read current phase's task** carefully
3. **Check "Validation" criteria** for last completed task
4. **If task validation failed**: Fix before continuing
5. **If truly stuck**:
   - Update MIGRATION_ROADMAP.md with your question
   - Commit work-in-progress: `git commit -m "[WIP] Stuck at Phase X.Y"`
   - Push: `git push origin <branch>`
   - Start new session to think through it

---

### 🔍 "Code Not Working as Expected"

1. **Check logs**:
   - Backend: Check terminal running `npm run dev`
   - Frontend: Check browser console (F12)
2. **Verify file saved**: Nodemon/Vite auto-reload on save
3. **Manual restart if needed**:
   - YOU restart backend: Ctrl+C, then `npm run dev`
   - YOU restart frontend: Ctrl+C, then `npm run dev:frontend`
4. **Check database state**: Use DB browser to inspect tables
5. **Review recent changes**: `git diff`

---

## 📚 REFERENCE: Key Documentation

### Quick Links
- [DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md) - Complete database schema
- [API_ARCHITECTURE.md](docs/API_ARCHITECTURE.md) - REST + WebSocket communication
- [ARCHITECTURE.md](docs/ARCHITECTURE.md) - System design overview
- [WORKFLOWS.md](docs/WORKFLOWS.md) - Operational workflows
- [CLAUDE.md](CLAUDE.md) - Project overview and commands

### Key Concepts

**Content-Addressed Cache**:
- Assets stored by SHA256 hash: `/cache/assets/{ab}/{cd}/{hash}.ext`
- First 2 chars → first directory level (256 options)
- Next 2 chars → second directory level (256 options)
- Total: 65,536 leaf directories for optimal filesystem performance

**Job Queue Priorities**:
- **1 = Critical**: Webhooks (new media, upgrades)
- **2 = High**: User-initiated actions (manual enrichment)
- **5 = Normal**: Default priority
- **10 = Low**: Background tasks (library scans, cleanup)

**Identification Status** (new 3-state system):
- `unidentified`: File discovered, not yet identified
- `identified`: Matched to TMDB/TVDB ID
- `enriched`: Full metadata and assets fetched

**Field Locking**:
- Each field has `{field}_locked` boolean column
- Manual user edits automatically set lock = true
- Locked fields excluded from automation
- User can manually unlock to re-enable automation

---

## ✅ SESSION END CHECKLIST

Before ending each work session:

- [ ] Commit current work: `git add . && git commit -m "[Phase X.Y] Checkpoint: <summary>"`
- [ ] Push to remote: `git push origin <current-branch>`
- [ ] Update "Quick Status Check" section in this document
- [ ] Update current phase progress percentages
- [ ] Mark completed tasks with ✅
- [ ] Note "Next Action" for next session
- [ ] Save and commit this document: `git add MIGRATION_ROADMAP.md && git commit -m "Update migration progress"`
- [ ] Push: `git push origin <current-branch>`
- [ ] Note which computer you're on (for multi-computer tracking)

---

## 🎉 FINAL NOTES

**You've got this!** This roadmap is your GPS through the migration. When in doubt:
1. Read the relevant section
2. Follow the steps exactly
3. Validate after each task
4. Commit and push frequently
5. Update progress in this document

**The most important rule**: If you're unsure, STOP and document your question. It's better to pause and think than to proceed and get lost.

**Remember**: Claude (AI) does NOT manage servers. YOU run `npm run dev` and `npm run dev:frontend` in your terminal.

Good luck! 🚀
