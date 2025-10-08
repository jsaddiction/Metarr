# Implementation Roadmap

**Status**: Design Phase - Ready for Implementation
**Last Updated**: 2025-10-08

This document provides a phased implementation plan for Metarr's revised architecture. See [ARCHITECTURE.md](ARCHITECTURE.md) for the complete architectural vision.

---

## Development Context

**Current Status**: Deep development, no production users
**Migration Strategy**: Database deletion acceptable during development
**Testing Environment**: Small library subset (100-500 items)
**Production Scale**: 2k movies + 30k TV episodes (32k total items)

---

## Implementation Phases

### Phase 1: Database Schema Migration (Week 1-2)

**Goal**: Implement new database schema with content-addressed cache and three-tier asset system.

#### New Tables

```sql
-- Asset candidates (Tier 1)
CREATE TABLE asset_candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  asset_type TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_url TEXT,
  provider_metadata TEXT,
  width INTEGER,
  height INTEGER,
  is_downloaded BOOLEAN DEFAULT 0,
  cache_path TEXT,
  content_hash TEXT,
  perceptual_hash TEXT,
  is_selected BOOLEAN DEFAULT 0,
  is_rejected BOOLEAN DEFAULT 0,
  selected_by TEXT,
  selected_at TIMESTAMP,
  auto_score REAL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Cache inventory (Tier 2)
CREATE TABLE cache_inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_hash TEXT UNIQUE NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  asset_type TEXT NOT NULL,
  mime_type TEXT,
  reference_count INTEGER DEFAULT 0,
  first_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMP,
  orphaned_at TIMESTAMP,
  width INTEGER,
  height INTEGER,
  perceptual_hash TEXT
);

-- Publish log
CREATE TABLE publish_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  nfo_hash TEXT NOT NULL,
  assets_published TEXT,
  published_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  published_by TEXT DEFAULT 'system',
  success BOOLEAN DEFAULT 1,
  error_message TEXT,
  players_notified TEXT
);

-- Asset selection config
CREATE TABLE asset_selection_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  library_id INTEGER NOT NULL,
  asset_type TEXT NOT NULL,
  min_count INTEGER DEFAULT 1,
  max_count INTEGER DEFAULT 3,
  min_width INTEGER,
  min_height INTEGER,
  prefer_language TEXT DEFAULT 'en',
  weight_resolution REAL DEFAULT 0.3,
  weight_votes REAL DEFAULT 0.4,
  weight_language REAL DEFAULT 0.2,
  weight_provider REAL DEFAULT 0.1,
  phash_similarity_threshold REAL DEFAULT 0.90,
  provider_priority TEXT DEFAULT '["tmdb", "tvdb", "fanart.tv"]',
  FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE,
  UNIQUE(library_id, asset_type)
);

-- Library automation config
CREATE TABLE library_automation_config (
  library_id INTEGER PRIMARY KEY,
  automation_mode TEXT DEFAULT 'hybrid',
  auto_enrich BOOLEAN DEFAULT 1,
  auto_select_assets BOOLEAN DEFAULT 1,
  auto_publish BOOLEAN DEFAULT 0,
  webhook_enabled BOOLEAN DEFAULT 1,
  webhook_auto_publish BOOLEAN DEFAULT 1,
  FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE
);

-- Rejected assets (global blacklist)
CREATE TABLE rejected_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  provider_url TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  rejected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reason TEXT,
  UNIQUE(provider, provider_url)
);

-- Job queue
CREATE TABLE job_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_type TEXT NOT NULL,
  priority INTEGER NOT NULL,
  payload TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  progress_current INTEGER DEFAULT 0,
  progress_total INTEGER DEFAULT 0,
  progress_message TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  next_retry_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  error_message TEXT,
  error_stack TEXT,
  is_cancellable BOOLEAN DEFAULT 1,
  cancelled_at TIMESTAMP
);
```

#### Alter Existing Tables

```sql
-- Movies
ALTER TABLE movies ADD COLUMN state TEXT DEFAULT 'discovered';
ALTER TABLE movies ADD COLUMN has_unpublished_changes BOOLEAN DEFAULT 0;
ALTER TABLE movies ADD COLUMN last_published_at TIMESTAMP;
ALTER TABLE movies ADD COLUMN published_nfo_hash TEXT;
ALTER TABLE movies ADD COLUMN enriched_at TIMESTAMP;
ALTER TABLE movies ADD COLUMN enrichment_priority INTEGER DEFAULT 5;

-- Series
ALTER TABLE series ADD COLUMN state TEXT DEFAULT 'discovered';
ALTER TABLE series ADD COLUMN has_unpublished_changes BOOLEAN DEFAULT 0;
ALTER TABLE series ADD COLUMN last_published_at TIMESTAMP;
ALTER TABLE series ADD COLUMN published_nfo_hash TEXT;
ALTER TABLE series ADD COLUMN enriched_at TIMESTAMP;
ALTER TABLE series ADD COLUMN enrichment_priority INTEGER DEFAULT 5;

-- Episodes
ALTER TABLE episodes ADD COLUMN state TEXT DEFAULT 'discovered';
ALTER TABLE episodes ADD COLUMN has_unpublished_changes BOOLEAN DEFAULT 0;
ALTER TABLE episodes ADD COLUMN last_published_at TIMESTAMP;
ALTER TABLE episodes ADD COLUMN published_nfo_hash TEXT;
ALTER TABLE episodes ADD COLUMN enriched_at TIMESTAMP;
ALTER TABLE episodes ADD COLUMN enrichment_priority INTEGER DEFAULT 5;
```

#### Indexes

```sql
CREATE INDEX idx_movies_state ON movies(state);
CREATE INDEX idx_movies_unpublished ON movies(has_unpublished_changes) WHERE has_unpublished_changes = 1;
CREATE INDEX idx_movies_needs_enrichment ON movies(state, enriched_at, enrichment_priority) WHERE state IN ('identified', 'discovered') AND enriched_at IS NULL;

CREATE INDEX idx_asset_candidates_entity ON asset_candidates(entity_type, entity_id, asset_type);
CREATE INDEX idx_asset_candidates_selected ON asset_candidates(is_selected);
CREATE INDEX idx_asset_candidates_content_hash ON asset_candidates(content_hash);

CREATE INDEX idx_cache_content_hash ON cache_inventory(content_hash);
CREATE INDEX idx_cache_orphaned ON cache_inventory(orphaned_at);

CREATE INDEX idx_job_queue_processing ON job_queue(status, priority, created_at) WHERE status = 'pending';

CREATE INDEX idx_publish_log_entity ON publish_log(entity_type, entity_id);
CREATE INDEX idx_publish_log_timestamp ON publish_log(published_at);
```

#### Migration Script

```typescript
// src/database/migrations/20251008_000000_revised_architecture.ts

export async function up(db: Database): Promise<void> {
  // Create new tables
  await db.execute(NEW_TABLES_SQL);

  // Alter existing tables
  await db.execute(ALTER_TABLES_SQL);

  // Create indexes
  await db.execute(INDEXES_SQL);

  // Mark all existing movies as 'published' (migration)
  await db.execute(`
    UPDATE movies SET
      state = 'published',
      last_published_at = CURRENT_TIMESTAMP,
      has_unpublished_changes = 0
  `);

  // Migrate existing images to asset_candidates
  await db.execute(`
    INSERT INTO asset_candidates (
      entity_type, entity_id, asset_type,
      provider, is_downloaded, cache_path, content_hash,
      is_selected, selected_by
    )
    SELECT
      entity_type, entity_id, image_type,
      'local', 1, cache_path, 'legacy_' || id,
      1, 'migration'
    FROM images
  `);

  // Populate cache_inventory from existing cache files
  await db.execute(`
    INSERT INTO cache_inventory (
      content_hash, file_path, file_size, asset_type
    )
    SELECT DISTINCT
      content_hash, cache_path, file_size, 'image'
    FROM asset_candidates
    WHERE is_downloaded = 1
  `);

  console.log('Migration complete');
}

export async function down(db: Database): Promise<void> {
  // Drop new tables
  await db.execute('DROP TABLE IF EXISTS asset_candidates');
  await db.execute('DROP TABLE IF EXISTS cache_inventory');
  await db.execute('DROP TABLE IF EXISTS publish_log');
  // ... (drop all new tables)

  // Cannot easily revert ALTER TABLE (would need to recreate tables)
  console.warn('Down migration not fully implemented (ALTER TABLE cannot be reverted)');
}
```

**Deliverables**:
- [ ] Migration script written
- [ ] Tested on dev database
- [ ] Indexes created and tested
- [ ] Seed data for automation configs

---

### Phase 2: Core Services Refactor (Week 3-4)

**Goal**: Implement new service layer with two-phase scanning, asset selection, and publishing.

#### Services to Implement

**1. ScanService (Two-Phase)**

```typescript
// src/services/scanService.ts

class ScanService {
  // Phase 1: Fast local scan
  async scanLibrary(libraryId: number): Promise<ScanJob>
  async scanDirectory(dirPath: string, mediaType: string): Promise<ScanResult>

  // Directory discovery
  private async discoverDirectories(libraryPath: string): Promise<string[]>

  // NFO parsing
  private async parseNFOIfExists(dirPath: string): Promise<NFOData | null>

  // Stream details
  private async scanStreamDetails(videoPath: string): Promise<StreamDetails>

  // Local assets
  private async discoverLocalAssets(dirPath: string): Promise<LocalAsset[]>

  // Progress tracking
  private emitProgress(jobId: number, progress: ScanProgress): void
}
```

**2. EnrichmentService (Background, Rate-Limited)**

```typescript
// src/services/enrichmentService.ts

class EnrichmentService {
  // Enrich entity from providers
  async enrichEntity(entityType: string, entityId: number, priority: number): Promise<void>

  // Fetch metadata
  private async fetchMetadata(entity: Entity): Promise<ProviderMetadata>

  // Fetch asset candidates
  private async fetchAssetCandidates(entity: Entity): Promise<AssetCandidate[]>

  // Respect locks
  private async mergeMetadata(entity: Entity, metadata: ProviderMetadata): Promise<void>

  // Rate limiting
  private async executeWithRateLimit<T>(fn: () => Promise<T>, priority: number): Promise<T>
}
```

**3. AssetSelectionService (Algorithm + Manual)**

```typescript
// src/services/assetSelectionService.ts

class AssetSelectionService {
  // Auto-select assets
  async autoSelectAssets(entityId: number, entityType: string, assetType: string): Promise<void>

  // Score candidate
  private calculateScore(candidate: AssetCandidate, config: AssetSelectionConfig): number

  // Filter duplicates
  private filterDuplicates(candidates: AssetCandidate[], threshold: number): AssetCandidate[]

  // Manual selection
  async selectCandidate(candidateId: number): Promise<void>

  // Reject candidate
  async rejectCandidate(candidateId: number, reason: string): Promise<void>

  // Re-run algorithm
  async reselectAsset(entityId: number, currentCandidateId: number, assetType: string): Promise<number>
}
```

**4. PublishService (Transactional)**

```typescript
// src/services/publishService.ts

class PublishService {
  // Single entity publish
  async publishEntity(entityType: string, entityId: number, options?: PublishOptions): Promise<PublishResult>

  // Bulk publish
  async publishBulk(entityType: string, entityIds: number[]): Promise<BulkPublishResult>

  // NFO generation
  private async generateNFO(entity: Entity): Promise<string>

  // Asset deployment
  private async copyAssetsToLibrary(entity: Entity, assets: AssetCandidate[]): Promise<PublishedAsset[]>

  // Player notification
  async notifyPlayers(entityType: string, entityId: number, libraryPath: string): Promise<void>

  // Validation
  private async validateBeforePublish(entityType: string, entityId: number): Promise<ValidationResult>
}
```

**5. CacheService (Content-Addressed Storage)**

```typescript
// src/services/cacheService.ts

class CacheService {
  // Store asset
  async storeAsset(buffer: Buffer, assetType: string, metadata: AssetMetadata): Promise<string>

  // Retrieve asset
  async retrieveAsset(contentHash: string): Promise<Buffer>

  // Deduplicate check
  private async checkExists(contentHash: string): Promise<boolean>

  // Orphan asset
  async orphanAsset(contentHash: string): Promise<void>

  // Garbage collection
  async garbageCollect(): Promise<void>

  // Calculate content hash
  private calculateContentHash(buffer: Buffer): string
}
```

**6. DisasterRecoveryService**

```typescript
// src/services/disasterRecoveryService.ts

class DisasterRecoveryService {
  // Detect missing assets
  async detectMissingAssets(entityType: string, entityId: number): Promise<string[]>

  // Restore from cache
  async restoreFromCache(entityType: string, entityId: number, libraryPath: string): Promise<void>

  // Validate integrity
  async validateIntegrity(entityType: string, entityId: number): Promise<IntegrityReport>
}
```

**7. JobQueueService (Background Processor)**

```typescript
// src/services/jobQueueService.ts

class JobQueueService {
  // Add job
  async addJob(job: JobDefinition): Promise<number>

  // Start worker
  async startWorker(): Promise<void>

  // Stop worker
  async stopWorker(): Promise<void>

  // Execute job
  private async executeJob(job: Job): Promise<void>

  // Handle failure
  private async handleJobFailure(job: Job, error: Error): Promise<void>
}
```

**Deliverables**:
- [ ] All 7 services implemented
- [ ] Unit tests for each service
- [ ] Integration tests for workflows
- [ ] Rate limiting tested (TMDB, TVDB)

---

### Phase 3: API Redesign (Week 5-6)

**Goal**: Implement new REST API with pagination, filtering, bulk operations.

#### New Endpoints

**Asset Management**

```typescript
// Get candidates for entity
GET /api/movies/:id/assets/candidates?assetType=poster
GET /api/series/:id/assets/candidates?assetType=fanart

// Select specific candidate
POST /api/movies/:id/assets/select
Body: { candidateId: 789, assetType: 'poster' }

// Reject and re-run algorithm
POST /api/movies/:id/assets/reselect
Body: { currentCandidateId: 456, assetType: 'poster' }

// Search additional providers
POST /api/movies/:id/assets/search
Body: { assetType: 'poster', providers: ['tmdb', 'tvdb'] }

// Get cache asset (serve file)
GET /api/cache/:contentHash
GET /api/cache/:contentHash/thumbnail
```

**Publishing**

```typescript
// Single entity publish
POST /api/movies/:id/publish
POST /api/series/:id/publish
POST /api/episodes/:id/publish

// Bulk publish
POST /api/movies/publish-bulk
Body: { ids: [1, 2, 3, ...] }

// Discard unpublished changes
POST /api/movies/:id/discard-changes

// Get publish history
GET /api/movies/:id/publish-log
```

**Library Management**

```typescript
// Trigger library scan
POST /api/libraries/:id/scan

// Get unpublished items
GET /api/movies/unpublished?page=1&limit=50

// Get unpublished count
GET /api/movies/unpublished/count

// Enrich specific item (manual trigger)
POST /api/movies/:id/enrich
```

**Pagination & Filtering**

```typescript
// Paginated movie list
GET /api/movies?
  page=1&
  limit=50&
  sort=title&
  order=asc&
  filter[state]=enriched&
  filter[hasUnpublishedChanges]=true&
  fields=id,title,year,poster_url,state

// Search
GET /api/movies/search?q=matrix&page=1&limit=20
```

**SSE Events**

```typescript
// Real-time updates
GET /api/events

// Event types:
// - scan:started
// - scan:progress
// - scan:completed
// - enrich:progress
// - publish:progress
// - movie:added
// - movie:updated
```

**Deliverables**:
- [ ] All endpoints implemented
- [ ] OpenAPI spec generated
- [ ] Postman collection
- [ ] API tests (integration)

---

### Phase 4: Frontend Rebuild (Week 7-10)

**Goal**: Implement new UI with virtual scrolling, asset selection, and real-time updates.

#### Components to Build

**1. Virtual Scrolling Table**

```typescript
// components/MovieTable.tsx
import { FixedSizeList } from 'react-window';

function MovieTable() {
  const { data } = useInfiniteQuery(['movies'], fetchMovies);

  return (
    <FixedSizeList
      height={600}
      itemCount={data.total}
      itemSize={50}
      onItemsRendered={loadMoreIfNeeded}
    >
      {MovieRow}
    </FixedSizeList>
  );
}
```

**2. Asset Selection Modal**

```typescript
// components/AssetSelectionModal.tsx

function AssetSelectionModal({ movieId, assetType }) {
  const { data: candidates } = useQuery(
    ['candidates', movieId, assetType],
    () => fetchCandidates(movieId, assetType)
  );

  return (
    <Modal>
      <h3>Select {assetType}</h3>
      <div className="grid grid-cols-4 gap-4">
        {candidates.map(candidate => (
          <AssetThumbnail
            key={candidate.id}
            candidate={candidate}
            onSelect={() => selectCandidate(candidate.id)}
          />
        ))}
      </div>
      <button onClick={searchMoreProviders}>
        Search More Providers
      </button>
    </Modal>
  );
}
```

**3. Publish Workflow**

```typescript
// components/PublishButton.tsx

function PublishButton({ movieId }) {
  const { mutate: publish, isLoading } = useMutation(
    () => publishMovie(movieId),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['movies', movieId]);
        toast.success('Published successfully');
      }
    }
  );

  const movie = useQuery(['movies', movieId], () => fetchMovie(movieId));

  if (!movie.data.has_unpublished_changes) {
    return null;
  }

  return (
    <button
      onClick={() => publish()}
      disabled={isLoading}
      className="btn btn-primary"
    >
      {isLoading ? 'Publishing...' : '⚠️ Publish Changes'}
    </button>
  );
}
```

**4. Progress Tracking**

```typescript
// hooks/useSSEProgress.ts

function useSSEProgress(eventType: string) {
  const [progress, setProgress] = useState(null);

  useEffect(() => {
    const eventSource = new EventSource('/api/events');

    eventSource.addEventListener(eventType, (e) => {
      const data = JSON.parse(e.data);
      setProgress(data);
    });

    return () => eventSource.close();
  }, [eventType]);

  return progress;
}

// Usage
function ScanProgressModal() {
  const progress = useSSEProgress('scan:progress');

  return (
    <Modal>
      <h3>Scanning Library...</h3>
      <ProgressBar
        value={(progress?.current / progress?.total) * 100}
      />
      <p>{progress?.current} of {progress?.total} items</p>
    </Modal>
  );
}
```

**5. Bulk Operations**

```typescript
// components/BulkActions.tsx

function BulkActions({ selectedIds }) {
  const { mutate: publishBulk } = useMutation(
    () => publishMoviesBulk(selectedIds),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['movies']);
        toast.success(`Published ${selectedIds.length} movies`);
      }
    }
  );

  return (
    <div className="bulk-actions">
      <button onClick={() => publishBulk()}>
        Publish {selectedIds.length} Selected
      </button>
      <button onClick={() => enrichBulk(selectedIds)}>
        Enrich {selectedIds.length} Selected
      </button>
    </div>
  );
}
```

**Deliverables**:
- [ ] All components implemented
- [ ] Virtual scrolling tested (32k items)
- [ ] Asset selection modal
- [ ] SSE integration
- [ ] Bulk operations UI
- [ ] Responsive design (mobile-friendly)

---

### Phase 5: Background Jobs & Worker (Week 11-12)

**Goal**: Implement job queue worker, background enrichment, garbage collection.

#### Worker Implementation

```typescript
// src/workers/jobWorker.ts

class JobWorker {
  private isRunning = false;
  private currentJob: Job | null = null;

  async start() {
    this.isRunning = true;

    while (this.isRunning) {
      const job = await this.fetchNextJob();

      if (!job) {
        await sleep(100);
        continue;
      }

      this.currentJob = job;

      try {
        await this.executeJob(job);
        await this.markJobCompleted(job.id);
      } catch (error) {
        await this.handleJobFailure(job, error);
      }

      this.currentJob = null;
    }
  }

  async stop() {
    this.isRunning = false;
    // Wait for current job to finish
    while (this.currentJob !== null) {
      await sleep(100);
    }
  }
}

// Start worker on app boot
const worker = new JobWorker();
worker.start();
```

#### Scheduled Tasks

```typescript
// src/schedulers/index.ts

import * as cron from 'node-cron';

// Background enrichment (continuous)
const enrichmentWorker = new EnrichmentWorker();
enrichmentWorker.start();

// Garbage collection (daily at 3 AM)
cron.schedule('0 3 * * *', async () => {
  await cacheService.garbageCollect();
});

// Library scan (if scheduled)
cron.schedule('0 2 * * *', async () => {
  const libraries = await db.getLibrariesWithScheduledScan();
  for (const library of libraries) {
    await jobQueue.addJob({
      type: 'library_scan',
      priority: 7,
      payload: { libraryId: library.id }
    });
  }
});
```

**Deliverables**:
- [ ] Job worker implemented
- [ ] Background enrichment running
- [ ] Garbage collection scheduled
- [ ] Graceful shutdown (wait for current job)
- [ ] Job retry logic tested

---

### Phase 6: Testing & Polish (Week 13-16)

**Goal**: Load testing, disaster recovery testing, bug fixes, documentation.

#### Testing Plan

**1. Load Testing**

```typescript
// tests/load/scan-performance.test.ts

test('scan 1000 movies in under 10 minutes', async () => {
  const startTime = Date.now();

  await scanService.scanLibrary(libraryId);

  const duration = Date.now() - startTime;
  expect(duration).toBeLessThan(10 * 60 * 1000);  // 10 minutes
});

test('UI remains responsive during scan', async () => {
  const scanPromise = scanService.scanLibrary(libraryId);

  // UI should still respond
  const movies = await fetchMovies({ page: 1, limit: 50 });
  expect(movies).toBeDefined();

  await scanPromise;
});
```

**2. Disaster Recovery Testing**

```typescript
// tests/integration/disaster-recovery.test.ts

test('restore assets after Radarr upgrade', async () => {
  // Setup: Movie with assets in library
  const movie = await createTestMovie();
  await publishMovie(movie.id);

  // Simulate Radarr upgrade (delete directory)
  await fs.remove(movie.directory);

  // Trigger webhook
  await handleUpgradeWebhook({
    tmdb_id: movie.tmdb_id,
    path: movie.file_path,
    isUpgrade: true
  });

  // Verify: Assets restored from cache
  const posterExists = await fs.pathExists(
    path.join(movie.directory, 'poster.jpg')
  );
  expect(posterExists).toBe(true);
});
```

**3. Concurrency Testing**

```typescript
// tests/integration/concurrency.test.ts

test('handle multiple concurrent webhooks', async () => {
  const webhooks = Array.from({ length: 10 }, (_, i) => ({
    tmdb_id: 1000 + i,
    path: `/movies/Movie${i}/movie.mkv`
  }));

  // Send all webhooks simultaneously
  const results = await Promise.all(
    webhooks.map(wh => handleWebhook(wh))
  );

  // Verify: All processed successfully
  expect(results.every(r => r.success)).toBe(true);
});
```

**Deliverables**:
- [ ] Load tests (1k items, 10k items, 32k items)
- [ ] Disaster recovery tests
- [ ] Concurrency tests
- [ ] Bug fixes (based on test failures)
- [ ] Performance optimizations
- [ ] User documentation (how-to guides)
- [ ] API documentation (complete)

---

## Deployment Checklist

### Development

- [ ] PostgreSQL support tested
- [ ] Docker Compose for dev environment
- [ ] Hot reload working (backend + frontend)
- [ ] Database migrations tested
- [ ] Seed data for testing

### Production

- [ ] Docker image built
- [ ] Environment variables documented
- [ ] Database backup/restore tested
- [ ] Logging configured (rotation, retention)
- [ ] Monitoring (health checks, metrics)
- [ ] Reverse proxy setup (nginx/traefik)
- [ ] SSL/TLS certificates

---

## Future Enhancements (Post-v1)

**Not in scope for initial implementation**:

- [ ] Plex media player support
- [ ] Subtitle extraction from video files
- [ ] Subtitle sourcing (OpenSubtitles API)
- [ ] Music library support (Lidarr integration)
- [ ] Multi-user support (roles, permissions)
- [ ] Mobile companion app
- [ ] Advanced matching algorithms (fuzzy search, ML-based)
- [ ] Custom metadata provider plugins
- [ ] Backup/restore UI
- [ ] Theme customization

---

## Success Criteria

**Phase 1-2** (Database + Services):
- ✅ Database schema migration complete
- ✅ Two-phase scanning working
- ✅ Asset selection algorithm functional
- ✅ Publishing workflow tested

**Phase 3-4** (API + Frontend):
- ✅ Paginated API working
- ✅ Virtual scrolling handles 10k+ items
- ✅ Asset selection UI functional
- ✅ SSE real-time updates working

**Phase 5-6** (Jobs + Testing):
- ✅ Background enrichment running
- ✅ 1000 item library scan < 10 minutes
- ✅ Webhook processing < 5 seconds
- ✅ Disaster recovery tested and working

**Production Ready**:
- ✅ Docker image deployable
- ✅ PostgreSQL tested at scale
- ✅ Documentation complete
- ✅ No known critical bugs

---

## Development Best Practices

1. **Test-Driven Development**: Write tests before implementation
2. **Incremental Commits**: Small, focused commits with clear messages
3. **Code Reviews**: Self-review before committing
4. **Documentation**: Update docs alongside code changes
5. **Performance**: Profile before optimizing
6. **Logging**: Comprehensive logging for debugging
7. **Error Handling**: Graceful degradation, user-friendly errors

---

## Related Documentation

- **[ARCHITECTURE.md](ARCHITECTURE.md)** - Complete architectural vision
- **[DATABASE_SCHEMA.md](DATABASE_SCHEMA.md)** - Schema reference
- **[WORKFLOWS.md](WORKFLOWS.md)** - Operational workflows
- **[ASSET_MANAGEMENT.md](ASSET_MANAGEMENT.md)** - Three-tier asset system
- **[AUTOMATION_AND_WEBHOOKS.md](AUTOMATION_AND_WEBHOOKS.md)** - Automation behavior
- **[PUBLISHING_WORKFLOW.md](PUBLISHING_WORKFLOW.md)** - Publishing process
