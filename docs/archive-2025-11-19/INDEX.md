# Metarr Documentation Index

## Quick Navigation

### 🚀 Getting Started
- **[Executive Summary](../CLAUDE.md)** - Start here! Complete overview
- **[Quick Start](../CLAUDE.md#quick-start)** - Get running in minutes
- **[Documentation Guide](README.md)** - How to navigate these docs

### 📊 Implementation Status

| Component | Status | Documentation |
|-----------|--------|---------------|
| **Core Infrastructure** | | |
| Database Schema | ✅ Implemented | [DATABASE.md](DATABASE.md) |
| REST API | ✅ Implemented | [API.md](API.md) |
| Job Queue | ✅ Implemented | [DATABASE.md#job-queue](DATABASE.md#job-queue) |
| WebSocket | 🚧 Partial | [API.md#websocket-events](API.md#websocket-events) |
| **Phases** | | |
| Scanning | 📋 Design Complete | [SCANNING.md](phases/SCANNING.md) |
| Enrichment | 🚧 TMDB Basic | [ENRICHMENT.md](phases/ENRICHMENT.md) |
| Publishing | 📋 Design Complete | [PUBLISHING.md](phases/PUBLISHING.md) |
| Player Sync | 📋 Design Complete | [PLAYER_SYNC.md](phases/PLAYER_SYNC.md) |
| Verification | 📋 Design Complete | [VERIFICATION.md](phases/VERIFICATION.md) |
| **Providers** | | |
| TMDB | ✅ Basic Client | [TMDB.md](providers/TMDB.md) |
| TVDB | 📋 Planned | [TVDB.md](providers/TVDB.md) |
| Fanart.tv | 📋 Planned | [FANART.md](providers/FANART.md) |
| **Players** | | |
| Kodi | 📋 Design Complete | [KODI.md](players/KODI.md) |
| Jellyfin | 📋 Design Complete | [JELLYFIN.md](players/JELLYFIN.md) |
| Plex | 📋 Design Complete | [PLEX.md](players/PLEX.md) |
| **Frontend** | | |
| React Setup | ✅ Implemented | [UI_STANDARDS.md](UI_STANDARDS.md) |
| Movie Table | ✅ Basic View | [UI_STANDARDS.md#tables](UI_STANDARDS.md#tables) |
| Asset Selection | 📋 Planned | [UI_STANDARDS.md#asset-selection-ui](UI_STANDARDS.md#asset-selection-ui) |

**Legend**: ✅ Implemented | 🚧 Partial | 📋 Planned/Designed

### 🔄 Processing Pipeline

```
1. SCANNING → 2. ENRICHMENT → 3. PUBLISHING → 4. PLAYER_SYNC
                                                        ↓
                                              5. VERIFICATION (Independent)
```

### 🏗️ System Architecture

#### Core Systems
- **[Database Schema](DATABASE.md)** - Complete data model
- **[API Architecture](API.md)** - REST + WebSocket
- **[UI Standards](UI_STANDARDS.md)** - Frontend design system
- **[Development](DEVELOPMENT.md)** - Coding standards

#### Technical References
- **[Git Workflow](technical/GIT_WORKFLOW.md)** - Commit conventions
- **[Webhooks](technical/WEBHOOKS.md)** - *arr integration
- **[NFO Parsing](technical/NFO_PARSING.md)** - Kodi NFO format
- **[Path Mapping](technical/PATH_MAPPING.md)** - Multi-system paths

### 📁 Directory Map

```
CLAUDE.md                    # Executive summary (START HERE)
docs/
├── INDEX.md                # This file - complete navigation
├── README.md               # Documentation guide
├── phases/                 # Core processing pipeline
│   ├── SCANNING.md         # File discovery
│   ├── ENRICHMENT.md       # Metadata fetching
│   ├── PUBLISHING.md       # Asset deployment
│   ├── PLAYER_SYNC.md      # Player updates
│   └── VERIFICATION.md     # Consistency checks
├── providers/              # External metadata sources
│   ├── OVERVIEW.md         # Provider system design
│   ├── TMDB.md            # The Movie Database
│   ├── TVDB.md            # TheTVDB
│   └── FANART.md          # Fanart.tv
├── players/               # Media player integrations
│   ├── KODI.md            # Kodi JSON-RPC
│   ├── JELLYFIN.md        # Jellyfin REST API
│   └── PLEX.md            # Plex Media Server
├── technical/             # Implementation details
│   ├── GIT_WORKFLOW.md    # Git conventions
│   ├── WEBHOOKS.md        # Webhook handling
│   ├── NFO_PARSING.md     # NFO format
│   └── PATH_MAPPING.md    # Path translation
├── DATABASE.md            # Schema & data model
├── API.md                 # REST & WebSocket
├── UI_STANDARDS.md        # Frontend standards
└── DEVELOPMENT.md         # Dev guidelines
```

### 🎯 Common Tasks

| Task | Documentation |
|------|---------------|
| **Add a new movie** | [SCANNING.md](phases/SCANNING.md) → [ENRICHMENT.md](phases/ENRICHMENT.md) |
| **Change a poster** | [UI_STANDARDS.md#asset-selection-ui](UI_STANDARDS.md#asset-selection-ui) |
| **Configure Kodi** | [KODI.md](players/KODI.md) |
| **Set up webhooks** | [WEBHOOKS.md](technical/WEBHOOKS.md) |
| **Write a test** | [DEVELOPMENT.md#testing](DEVELOPMENT.md#testing) |
| **Add API endpoint** | [API.md](API.md) + [DEVELOPMENT.md#backend-rules](DEVELOPMENT.md#backend-rules) |
| **Create UI component** | [UI_STANDARDS.md](UI_STANDARDS.md) |
| **Debug job queue** | [DATABASE.md#job-queue](DATABASE.md#job-queue) |

### 📚 Reading Paths

#### For Backend Developers
1. [CLAUDE.md](../CLAUDE.md) - Overview
2. [DATABASE.md](DATABASE.md) - Data model
3. [API.md](API.md) - Endpoints
4. [DEVELOPMENT.md](DEVELOPMENT.md) - Standards
5. Phase docs as needed

#### For Frontend Developers
1. [CLAUDE.md](../CLAUDE.md) - Overview
2. [UI_STANDARDS.md](UI_STANDARDS.md) - Design system
3. [API.md](API.md) - Backend integration
4. [DEVELOPMENT.md#frontend](DEVELOPMENT.md) - Frontend patterns

#### For DevOps/Deployment
1. [CLAUDE.md#configuration](../CLAUDE.md#configuration) - Config options
2. [DATABASE.md#migration-strategy](DATABASE.md#migration-strategy) - Migrations
3. [WEBHOOKS.md](technical/WEBHOOKS.md) - External integration

#### For Contributors
1. [README.md](README.md) - Documentation structure
2. [GIT_WORKFLOW.md](technical/GIT_WORKFLOW.md) - Git conventions
3. [DEVELOPMENT.md](DEVELOPMENT.md) - Coding standards
4. [INDEX.md](#implementation-status) - What needs work

### 🔍 Quick Reference

#### Key Concepts
- **Monitored**: Metarr manages metadata (vs unmonitored = locked)
- **Cache**: Protected storage in `/data/cache/` (source of truth)
- **Library**: Working copies for players (can be rebuilt)
- **Field Locking**: User edits preserved from automation
- **Job Queue**: Background processing with priorities

#### Important Paths
```
/data/cache/        # Protected assets (never deleted)
/data/recycle/      # Deleted items (30-day retention)
/media/movies/      # Library directory (player scans)
/logs/              # Application logs
```

#### Configuration Hierarchy
1. Environment variables (highest priority)
2. Configuration table in database
3. Default values in code

#### Job Priorities
1. Webhooks (critical)
2. User actions (high)
3. Auto-enrichment (medium)
4. Library scans (low)
5. Verification (background)

### 📈 Documentation Stats
- **Total Files**: 19 core + archived
- **Total Lines**: ~3,500 (down from ~15,000)
- **Coverage**: All major systems documented
- **Status**: Production-ready documentation

---
*Last updated: 2025-10-24*