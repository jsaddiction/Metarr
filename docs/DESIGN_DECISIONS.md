# Design Decisions

**Purpose**: Document WHY we made specific architectural and implementation choices

**Audience**: Future you (on different machine), contributors, Claude (for context)

---

## 🎯 Core Philosophy

### "Intelligent Defaults with Manual Override Capability"

**Decision**: User control first, automation second

**Why**:
- Users need confidence that manual edits won't be overwritten
- Automation should be opt-in per movie (monitored system)
- Field-level locking preserves user intent
- "YOLO mode" is a setting, not the default

**Alternatives Considered**:
- Full automation with no locks (rejected: users lose control)
- Full manual like MediaElch (rejected: defeats purpose of Metarr)
- History tracking instead of locks (rejected: too complex, storage overhead)

**Implemented**:
- Stage 1: Monitored/unmonitored system (movie-level control)
- Stage 2: Field & asset locking (field-level protection)

---

## 🗄️ Database Architecture

### Content-Addressed Asset Storage

**Decision**: Use SHA256 hashing for asset storage with automatic deduplication

**Why**:
- Deduplication: Same poster used by multiple movies → stored once
- Integrity: Content hash verifies file hasn't been corrupted
- Immutability: Changing file creates new hash (preserves history)
- Reference counting: Know when asset can be safely deleted

**Implementation**:
```
cache_assets table:
  - content_hash (SHA256, unique)
  - file_path (absolute path)
  - reference_count (how many entities use this)

movies table:
  - poster_id → FK to cache_assets
  - fanart_id → FK to cache_assets
```

**Alternatives Considered**:
- Direct file path in movies table (rejected: no deduplication, broken links)
- Copy files per movie (rejected: massive storage waste)

**Related**: Stage 3 (Asset Candidate Caching)

---

### Asset Candidates Table

**Decision**: Cache provider asset URLs with metadata for future browsing

**Why**:
- User experience: Asset browser loads instantly (no API calls)
- Smart selection: Score assets by dimensions, votes, aspect ratio
- Bandwidth: Fetch metadata once, browse forever
- Provider optimization: TMDB Changes API reduces redundant fetches

**Implementation**:
```
asset_candidates table:
  - entity_type, entity_id (what movie/series)
  - asset_type (poster, fanart, etc.)
  - provider, url (where to download)
  - width, height, vote_average, vote_count (scoring data)
  - score (calculated ranking)
  - is_selected, is_blocked (user actions)
  - last_refreshed (when to re-fetch)
```

**Alternatives Considered**:
- Download all assets upfront (rejected: bandwidth waste, storage bloat)
- API call on every browse (rejected: slow UX, rate limit issues)
- Cache only URLs (rejected: need metadata for scoring)

**Related**: Stage 3 (Asset Candidate Caching)

---

### Monitored vs Enabled

**Decision**: Use "monitored" terminology instead of "enabled/disabled"

**Why**:
- Consistency: Matches Radarr/Sonarr terminology (familiar to users)
- Semantics: "Monitored" implies "automation watches this", clear meaning
- Icon: Bookmark (monitored) vs bookmark-off (unmonitored) - intuitive

**Alternatives Considered**:
- "enabled/disabled" (rejected: too generic, unclear what's disabled)
- "automation_enabled" (rejected: verbose, less elegant)
- "active" (rejected: could mean "currently processing")

**Related**: Stage 1 (Monitored System)

---

## 🔧 Backend Architecture

### WebSocket Broadcasting for Real-Time Updates

**Decision**: Use WebSocket for server → client updates instead of SSE (Server-Sent Events)

**Why**:
- Bi-directional: Can send commands from client (future: cancel jobs)
- Modern: Better browser support, cleaner API
- Integration: Works well with React hooks (TanStack Query)
- Efficiency: Single persistent connection vs multiple SSE streams

**Implementation**:
- `WebSocketBroadcaster` service
- Broadcasts: Job progress, webhook events, database changes
- Reconnection: Client auto-reconnects on disconnect
- Health checks: Ping/pong heartbeat

**Alternatives Considered**:
- SSE (rejected: one-way only, multiple connections needed)
- Polling (rejected: inefficient, delayed updates)
- Long polling (rejected: complex, outdated)

**Related**: Backend Phase 1

---

### Job Queue with Circuit Breaker

**Decision**: Database-backed job queue with circuit breaker pattern

**Why**:
- Persistence: Jobs survive server restart (SQLite/PostgreSQL storage)
- Priority: Webhooks > user actions > scheduled jobs > scans
- Resilience: Circuit breaker prevents cascading failures (5 failures → 1 min cooldown)
- Observability: All jobs visible in database for debugging

**Implementation**:
- `JobQueueService` with priority-based selection
- Circuit breaker: Opens on 5 consecutive failures, resets after 1 min
- Retry logic: Exponential backoff (1min → 5min → 15min)
- Job types: enrichment, asset_download, webhook, scan

**Alternatives Considered**:
- Bull (Redis queue) (rejected: adds Redis dependency, overkill)
- In-memory queue (rejected: jobs lost on restart)
- No retry logic (rejected: transient failures unrecoverable)

**Related**: Backend Phase 4

---

### Scheduled Services with Configurable Intervals

**Decision**: Per-library scheduler configuration stored in database

**Why**:
- Flexibility: Different libraries can have different scan intervals
- Persistence: Settings survive restarts
- User control: Enable/disable per library
- Reasonable defaults: Daily scans, weekly metadata refresh

**Implementation**:
```
library_scheduler_config table:
  - library_id
  - file_scan_enabled, file_scan_interval_hours
  - provider_update_enabled, provider_update_interval_hours
```

**Alternatives Considered**:
- Global settings only (rejected: large libraries need less frequent scans)
- Cron expressions (rejected: too complex for users)
- Fixed intervals (rejected: no flexibility)

**Related**: Backend Phase 6

---

## 🎨 Frontend Architecture

### Stage-Based Development

**Decision**: Break frontend work into stages with git branches and tags

**Why**:
- Clarity: Know exactly what's done and what's next
- Multi-machine: Resume work seamlessly on different machines
- Atomic: Each stage is mergeable, testable, completable
- Motivation: Checking off stages feels productive

**Implementation**:
- Git branches: `feature/stage-X-name`
- Git tags: `stage-X-complete`
- Commit convention: `stage-X: type: description`
- Documentation: PROJECT_ROADMAP.md tracks current stage

**Alternatives Considered**:
- Feature branches only (rejected: no clear progression tracking)
- Monolithic development (rejected: overwhelming, hard to resume)
- Sprint-based (rejected: this is solo development, sprints unnecessary)

**Related**: Stage 0 (Planning)

---

### React Hooks for State Management

**Decision**: Use React hooks + TanStack Query instead of Redux/MobX

**Why**:
- Simplicity: Hooks are built-in, no external state library
- Modern: React 18+ best practices
- Server state: TanStack Query handles caching, invalidation automatically
- Performance: Fine-grained re-renders, less boilerplate

**Implementation**:
- Custom hooks: `useToggleMonitored`, `useLockField`, `useAssetCandidates`
- TanStack Query: Server state caching and mutations
- Optimistic updates: Immediate UI response, sync in background

**Alternatives Considered**:
- Redux (rejected: overkill, too much boilerplate)
- Context API only (rejected: no caching, causes re-render issues)
- MobX (rejected: learning curve, less common)

**Related**: Stages 1-3 (Frontend hooks)

---

### Lucide Icons

**Decision**: Use Lucide React icons instead of FontAwesome or Material Icons

**Why**:
- Tree-shaking: Import only icons used (small bundle size)
- Consistency: All icons same style (stroke-based)
- Customization: Easy to change size, color, stroke width
- React-first: Designed for React components

**Implementation**:
- BookmarkToggle: `Bookmark` / `BookmarkX` icons
- LockIcon: `Lock` / `LockOpen` icons
- Purple theme: `text-purple-500` for active state

**Alternatives Considered**:
- FontAwesome (rejected: heavier bundle, icon inconsistency)
- Material Icons (rejected: filled style doesn't match Metarr theme)
- Custom SVG (rejected: reinventing wheel, maintenance overhead)

**Related**: Stages 1-2 (UI components)

---

## 🔄 Automation Flow

### Webhook-First Automation

**Decision**: Webhooks trigger enrichment, not scheduled scans

**Why**:
- Real-time: Movie enriched immediately after download (no wait)
- Efficient: Only process new downloads (no redundant scans)
- Reliable: Radarr/Sonarr guarantee webhook delivery
- User expectation: *arr stack users expect instant processing

**Implementation**:
- Webhook receiver: Parse Radarr/Sonarr payloads
- Job trigger: Create priority-1 enrichment job
- Publish: Assets written to library directory
- Notify: Kodi notified to refresh library

**Alternatives Considered**:
- Scheduled scans only (rejected: delayed processing, inefficient)
- File watcher (rejected: complex, platform-specific, unreliable)
- Hybrid (scheduled + webhook) (accepted: scheduled is fallback/backup)

**Related**: Stage 4 (Webhooks)

---

### Asset Publishing on Lock

**Decision**: When user selects asset candidate → download, publish, and lock immediately

**Why**:
- Immediate feedback: Asset appears in library right away
- Intent: User selected it, they want it active
- Safety: Locking prevents automation from overwriting

**Implementation**:
1. User clicks asset in browser
2. Backend downloads to cache (if not already cached)
3. Publishes to library directory (Kodi naming)
4. Locks asset field (`poster_locked = 1`)
5. WebSocket broadcasts update

**Alternatives Considered**:
- Select without publishing (rejected: user expects to see selection)
- Publish without locking (rejected: automation could overwrite)
- Staging area (rejected: extra step, complexity)

**Related**: Stage 3 (Asset Candidates)

---

## 🚫 What We Decided NOT To Do

### Edit History / Undo System

**Decision**: NO edit history tracking

**Why**:
- Complexity: Database schema bloat (history tables for all fields)
- Storage: Unbounded growth (when to purge history?)
- Unclear UX: How far back to undo? Show diff?
- Locking is simpler: "User edited it → locked → done"

**If Reconsidered**: Post-v2.0 feature, needs careful design

---

### Multi-User Support

**Decision**: NO multi-user authentication for v1.0

**Why**:
- Use case: Single user managing their media library (personal use)
- Complexity: JWT, sessions, permissions, user management
- Deployment: Typically behind reverse proxy (Authelia, Authentik)

**If Reconsidered**: v2.0+ feature after community feedback

---

### Automatic Provider Selection

**Decision**: NO automatic switching between TMDB/TVDB/FanArt.tv based on quality

**Why**:
- Consistency: Single source of truth per media type
- Simplicity: TMDB for movies, TVDB for TV, FanArt.tv for logos/clearart
- User control: Manual provider override if needed (future feature)

**If Reconsidered**: Could score assets across providers (complex scoring algorithm)

---

### Asset Versioning

**Decision**: NO asset version history (one selected asset per type)

**Why**:
- Storage: Would need to cache multiple selections
- Use case: Rare that user wants to revert asset selection
- Workaround: Can re-browse candidates and select different one

**If Reconsidered**: Could track `previous_selection_id` (simple rollback)

---

## 📝 Naming Conventions

### Database Columns: snake_case

**Decision**: Use `snake_case` for database columns (e.g., `content_hash`, `last_refreshed`)

**Why**:
- SQL convention: Most SQL databases use snake_case
- PostgreSQL: Case-insensitive but lowercased by default
- Readability: Clear word separation in queries

**Related**: All migrations, DATABASE_SCHEMA.md

---

### TypeScript: camelCase

**Decision**: Use `camelCase` for TypeScript variables/functions (e.g., `contentHash`, `lastRefreshed`)

**Why**:
- JavaScript convention: Standard in JS/TS codebases
- Type safety: Explicit mapping layer (DB → TS via service layer)

**Related**: All services, controllers, types

---

### API Routes: kebab-case

**Decision**: Use `kebab-case` for API routes (e.g., `/api/asset-candidates`, `/toggle-monitored`)

**Why**:
- URL convention: Lowercase, hyphen-separated is standard
- Readability: Clear word separation in URLs
- Consistency: Matches REST best practices

**Related**: API_ARCHITECTURE.md

---

## 🔗 How to Use This Document

### When Starting a Stage

Read relevant design decisions to understand WHY things are built a certain way.

**Example**: Starting Stage 4 (Webhooks)?
- Read "Webhook-First Automation"
- Understand priority over scheduled scans
- Know that webhooks trigger priority-1 jobs

### When Making New Design Decisions

**Add entry here with**:
1. Decision made
2. Why we chose this
3. What alternatives were considered
4. Related stage/feature

**Format**:
```markdown
### Feature Name

**Decision**: What we decided to do

**Why**: Reasoning (user benefit, technical advantage)

**Alternatives Considered**: What we didn't choose and why

**Related**: Stage X (Feature Y)
```

### When Questioning Existing Code

Search this document for keywords to find original reasoning.

**Example**: "Why do we have `monitored` instead of `enabled`?"
- Search for "monitored"
- Find "Monitored vs Enabled" section
- Understand: Consistency with *arr stack terminology

---

## 🎬 Media Player Architecture (Stage 5)

### Media Player Groups

**Decision**: Link media player GROUPS to libraries (not individual players)

**Why**: Kodi supports shared MySQL databases
- Common setup: 3 Kodi instances (living room, bedroom, office) share one MySQL DB
- Problem: Scanning all 3 instances → 3 concurrent scans on same DB → conflicts
- Solution: Group instances that share a database, scan ONE instance per group

**Implementation**:
- `media_player_groups` table: Defines sets of instances sharing a database
- `media_players.group_id`: Each instance belongs to a group
- `media_player_libraries`: Links GROUPS (not players) to libraries
- Scan logic: One scan per group (fallback if primary fails)

**Alternatives Considered**:
- Link individual players to libraries → Rejected: Causes concurrent scans on shared DB
- Auto-detect shared databases → Rejected: Requires intrusive DB queries
- Scan all instances always → Rejected: Wasteful, causes conflicts

**Related**: Stage 5 (Kodi Integration)

---

### Group-Specific Library Targeting

**Decision**: Different groups can manage different libraries

**Why**: Flexibility for user setups

**Example**: Living Room group manages /movies, Kids Room group manages /tvshows
- Movie downloads → Scan only Living Room group
- TV downloads → Scan only Kids Room group
- No wasted scans on irrelevant groups

**Alternative Considered**: All groups see all libraries → Rejected: Wasteful, confusing

**Related**: `media_player_libraries` table

---

### Scan Fallback Logic

**Decision**: If primary instance fails, try next instance in group

**Why**: Resilience - primary instance might be offline

**Implementation**: Loop through enabled instances until scan succeeds

**Alternative Considered**: Fail immediately → Rejected: Not resilient

**Related**: Stage 5 `triggerGroupScan()` method

---

## 🎯 Quick Reference

**Want to understand**:
- Asset storage? → "Content-Addressed Asset Storage"
- Real-time updates? → "WebSocket Broadcasting"
- Stage workflow? → "Stage-Based Development"
- Why webhooks? → "Webhook-First Automation"
- Why locks? → Core Philosophy + "What We Decided NOT To Do" (Edit History)
- Media player groups? → "Media Player Groups" (above)

**Making a new choice?**:
1. Document it here
2. Explain reasoning
3. List alternatives
4. Link to related stage

---

**Remember**: Design decisions persist in documentation. Code changes, but reasoning should be preserved!
