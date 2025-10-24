# Metarr - Intelligent Media Metadata Manager

## What is Metarr?

Metarr is a Docker-first metadata management application that bridges your media downloaders (*arr stack) and media players (Kodi/Jellyfin/Plex). It provides intelligent automation with complete user control, maintaining a protected cache of all metadata and artwork to prevent data loss during media upgrades.

**Core Value Proposition:**
- **Automated enrichment** from multiple providers (TMDB, TVDB, Fanart.tv)
- **Protected asset cache** survives media manager deletions and provider removals
- **Granular field locking** preserves manual edits from automation
- **Disaster recovery** built-in via content-addressed storage

## Core Philosophy

**"Intelligent Defaults with Manual Override Capability"**

1. **User Control First**: Every automated decision can be overridden
2. **Field-Level Locking**: Manual edits are sacred and preserved
3. **Protected Cache**: Source of truth that survives all external changes
4. **Graceful Degradation**: Each phase optional except scanning

## Quick Start

```bash
# Clone and install
git clone https://github.com/yourusername/metarr.git
cd metarr
npm install

# Development (zero configuration required!)
npm run dev:all         # Starts backend (port 3000) and frontend (port 3001)

# Production
npm run build          # Build backend
npm run build:frontend # Build frontend
npm start             # Run production server
```

**Zero Configuration**: Metarr includes embedded API keys for all providers. Clone → Install → Run. No API signup required for development.

## Elemental Phases

Metarr operates through independent, idempotent phases that form an automated chain. Each phase adds value and can run multiple times safely.

### Phase Rules
1. **Independence**: Each phase operates standalone
2. **Idempotency**: Safe to run multiple times without corruption
3. **Recoverable**: Destructive operations use recycle bin
4. **Optional**: All phases except scanning can be disabled
5. **Observable**: All phases emit progress events
6. **Chainable**: Phases trigger subsequent phases via job queue

### Phase Overview

| Phase | Purpose | Triggers | Required |
|-------|---------|----------|----------|
| **[Scanning](docs/phases/SCANNING.md)** | Discover & classify files | Manual, webhook, schedule | Yes |
| **[Enrichment](docs/phases/ENRICHMENT.md)** | Fetch metadata & select assets | Post-scan, manual, refresh | No |
| **[Publishing](docs/phases/PUBLISHING.md)** | Deploy assets to library | Post-selection, manual | No |
| **[Player Sync](docs/phases/PLAYER_SYNC.md)** | Update media players | Post-publish, manual | No |
| **[Verification](docs/phases/VERIFICATION.md)** | Ensure cache↔library consistency | Manual, schedule | No |

### Job-Driven Automation

```
User Action / Webhook → Job Created → Worker Processes → Next Phase Job
                                    ↓
                            Phase Disabled?
                                   ↓
                            Skip to Next Phase
```

Each phase completion triggers the next phase via job creation. Workers check phase configuration and either process or skip to the next phase.

## Technology Stack

### Backend
- **Runtime**: Node.js 20+ with TypeScript
- **Framework**: Express.js
- **Database**: SQLite (dev) / PostgreSQL (production)
- **Job Queue**: SQLite-based with worker pool
- **Communication**: REST API + WebSocket

### Frontend
- **Framework**: React 18+ with TypeScript
- **Build**: Vite
- **Styling**: Tailwind CSS v4 (violet primary)
- **Components**: shadcn/ui + custom AnimatedTabs
- **State**: React hooks + WebSocket updates

### External Integrations
- **Providers**: TMDB, TVDB, Fanart.tv, MusicBrainz
- **Players**: Kodi, Jellyfin, Plex
- **Downloaders**: Radarr, Sonarr, Lidarr (webhooks)

## Asset Management Architecture

### Two-Copy System
```
CACHE (Protected)              LIBRARY (Working)
/data/cache/                   /media/movies/
  ├── images/                    ├── Movie (2024)/
  │   └── {uuid}/                │   ├── movie.mkv
  │       ├── poster.jpg         │   ├── movie-poster.jpg
  │       └── fanart.jpg         │   └── movie-fanart.jpg
  └── trailers/                  └── ...
      └── {uuid}/
```

**Cache**: Content-addressed storage with SHA256 deduplication
**Library**: Kodi naming convention for player compatibility

### Asset Tiers Explained

1. **CANDIDATES**: Provider URLs and metadata stored in database (not files)
2. **CACHE**: Downloaded files in protected storage (source of truth)
3. **LIBRARY**: Working copies for media player scanning

## Cross-Cutting Documentation

### System Design
- **[Database Schema](docs/DATABASE.md)** - Complete data model
- **[API Architecture](docs/API.md)** - REST + WebSocket patterns
- **[UI Standards](docs/UI_STANDARDS.md)** - Frontend components and theme

### Development
- **[Git Workflow](docs/technical/GIT_WORKFLOW.md)** - Commit conventions
- **[Testing](docs/DEVELOPMENT.md#testing)** - Test infrastructure
- **[Backend Rules](docs/DEVELOPMENT.md#backend-rules)** - Coding standards

### Technical Details
- **[Provider APIs](docs/providers/)** - TMDB, TVDB integration details
- **[Player APIs](docs/players/)** - Kodi, Jellyfin protocols
- **[NFO Format](docs/technical/NFO_PARSING.md)** - Kodi NFO structure
- **[Webhooks](docs/technical/WEBHOOKS.md)** - *arr webhook handling

## Configuration

### Environment Variables (Optional)
```env
# Database (defaults to SQLite)
DB_TYPE=sqlite|postgres
DATABASE_URL=postgresql://user:pass@localhost/metarr

# API Keys (embedded defaults provided)
TMDB_API_KEY=your_personal_key
TVDB_API_KEY=your_personal_key
FANART_TV_API_KEY=your_personal_key

# Paths
CACHE_PATH=/data/cache
LIBRARY_PATH=/media
```

### Monitored vs Unmonitored

- **Monitored**: Metarr manages all metadata and assets
- **Unmonitored**: Global lock on downloadable content
  - Still processes webhooks for renames/deletions
  - Still updates stream info from upgrades
  - Preserves all user customizations

## Development Commands

```bash
# Development
npm run dev:all        # Full stack development
npm run lint          # ESLint check
npm run format        # Prettier format
npm run typecheck     # TypeScript validation

# Building
npm run build         # Build backend
npm run build:frontend # Build frontend

# Testing
npm test              # Run test suite
npm run test:watch    # Watch mode
```

## Project Structure

```
src/
├── controllers/      # Request handlers
├── services/        # Business logic
├── models/          # Data models
├── routes/          # API endpoints
├── database/        # Migrations & schema
├── config/          # Configuration
└── utils/           # Helpers

public/frontend/
├── src/
│   ├── components/  # React components
│   ├── pages/       # Route pages
│   └── styles/      # CSS & theme
└── index.html

data/                # Runtime data (git-ignored)
├── cache/           # Protected assets
├── recycle/         # Deleted items
└── metarr.sqlite    # Database

docs/
├── phases/          # Elemental phase docs
├── providers/       # Provider specifics
├── players/         # Player protocols
└── technical/       # Implementation details
```

## Troubleshooting

### Common Issues

1. **Port conflicts**: Check ports 3000 (backend) and 3001 (frontend)
2. **Database locked**: Ensure single instance running
3. **API rate limits**: Check provider rate limiting in logs
4. **Player connection**: Verify network and credentials

### Log Monitoring

```bash
# Windows PowerShell
Get-Content logs/app.log -Tail 50 -Wait
Get-Content logs/error.log -Tail 50 -Wait

# Linux/Mac
tail -f logs/app.log
tail -f logs/error.log
```

## Critical Developer Rules

### For AI Assistants (Claude, etc.)

1. **NO Git Attribution**: Never add AI signatures to commits
2. **NO Server Control**: Never run/kill Node.js processes
3. **Read First**: Always read files before editing
4. **Use TodoWrite**: Track all multi-step tasks

### For Human Developers

1. **You control servers**: Only you run `npm run dev`
2. **Monitor logs**: Keep `logs/app.log` and `logs/error.log` visible
3. **Test changes**: Verify in browser before committing

See [Git Workflow](docs/technical/GIT_WORKFLOW.md) for complete guidelines.

## Getting Help

- **Documentation**: Start with phase docs in `docs/phases/`
- **Issues**: Report bugs at [GitHub Issues](https://github.com/yourusername/metarr/issues)
- **Discord**: Join community at [Discord Server](https://discord.gg/metarr)
