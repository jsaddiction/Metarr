# Metarr Documentation Index

Complete documentation map for Metarr - intelligent metadata management for media libraries.

---

## Quick Start

**New to Metarr?** Start here:
1. [Installation](getting-started/INSTALLATION.md) - Setup and deployment
2. [Configuration](getting-started/CONFIGURATION.md) - Configure libraries and providers
3. [First Run](getting-started/FIRST_RUN.md) - Initial scan and workflow

**For Developers**:
- [CLAUDE.md](/CLAUDE.md) - AI assistant workflow rules (CRITICAL)
- [WORKFLOW.md](development/WORKFLOW.md) - Development workflow (CRITICAL)
- [ROADMAP.md](development/ROADMAP.md) - Current priorities (CRITICAL)

---

## Getting Started

| Document | Description |
|----------|-------------|
| [INSTALLATION.md](getting-started/INSTALLATION.md) | Installation steps (bare metal, Docker, NAS) |
| [DOCKER.md](getting-started/DOCKER.md) | Docker Compose configuration |
| [CONFIGURATION.md](getting-started/CONFIGURATION.md) | Environment variables, libraries, providers |
| [FIRST_RUN.md](getting-started/FIRST_RUN.md) | Initial scan workflow and verification |
| [MIGRATION.md](getting-started/MIGRATION.md) | Migrating from other systems |

---

## Architecture

### Core System
| Document | Description |
|----------|-------------|
| [OVERVIEW.md](architecture/OVERVIEW.md) | System architecture at a glance |
| [DATABASE.md](architecture/DATABASE.md) | Complete database schema reference |
| [JOB_QUEUE.md](architecture/JOB_QUEUE.md) | Job system and worker pool |
| [API.md](architecture/API.md) | REST API + WebSocket communication |

### Asset Management
| Document | Description |
|----------|-------------|
| [ASSET_MANAGEMENT/README.md](architecture/ASSET_MANAGEMENT/README.md) | Asset system overview (two-copy architecture) |
| [ASSET_MANAGEMENT/ASSET_TYPES.md](architecture/ASSET_MANAGEMENT/ASSET_TYPES.md) | Media-specific asset types |
| [ASSET_MANAGEMENT/CONTENT_ADDRESSING.md](architecture/ASSET_MANAGEMENT/CONTENT_ADDRESSING.md) | SHA256 sharding system |
| [ASSET_MANAGEMENT/TWO_COPY_SYSTEM.md](architecture/ASSET_MANAGEMENT/TWO_COPY_SYSTEM.md) | Cache vs library architecture |
| [ASSET_MANAGEMENT/FIELD_LOCKING.md](architecture/ASSET_MANAGEMENT/FIELD_LOCKING.md) | Field locking behavior |

---

## Phases (Workflow System)

| Document | Description |
|----------|-------------|
| [OVERVIEW.md](phases/OVERVIEW.md) | Phase system introduction |
| [SCANNING.md](phases/SCANNING.md) | File discovery and classification (REQUIRED phase) |
| [ENRICHMENT.md](phases/ENRICHMENT.md) | Metadata fetching and asset selection |
| [PUBLISHING.md](phases/PUBLISHING.md) | Asset deployment to library |
| [PLAYER_SYNC.md](phases/PLAYER_SYNC.md) | Media player library updates |
| [VERIFICATION.md](phases/VERIFICATION.md) | Cache↔library consistency checks |
| [NOTIFICATION.md](phases/NOTIFICATION.md) | Filtered notification system |

---

## Providers

| Document | Description |
|----------|-------------|
| [OVERVIEW.md](providers/OVERVIEW.md) | Provider system architecture |
| [RATE_LIMITING.md](providers/RATE_LIMITING.md) | Rate limiting and backoff strategies |
| [TMDB.md](providers/TMDB.md) | TMDB API integration |
| [TVDB.md](providers/TVDB.md) | TVDB API integration |
| [FANART.md](providers/FANART.md) | Fanart.tv integration |
| [MUSICBRAINZ.md](providers/MUSICBRAINZ.md) | MusicBrainz integration (planned) |
| [LOCAL_BACKUP.md](providers/LOCAL_BACKUP.md) | Local provider fallback |
| [GETTING_API_KEYS.md](providers/GETTING_API_KEYS.md) | How to obtain API keys |

---

## Media Players

| Document | Description |
|----------|-------------|
| [OVERVIEW.md](players/OVERVIEW.md) | Player integration overview |
| [KODI.md](players/KODI.md) | Kodi JSON-RPC integration (WebSocket + HTTP) |
| [JELLYFIN.md](players/JELLYFIN.md) | Jellyfin API integration (planned) |
| [PLEX.md](players/PLEX.md) | Plex API integration (planned) |

---

## Frontend

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](frontend/ARCHITECTURE.md) | Frontend architecture and structure |
| [COMPONENTS.md](frontend/COMPONENTS.md) | Component organization and patterns |
| [STATE_MANAGEMENT.md](frontend/STATE_MANAGEMENT.md) | TanStack Query + hooks |
| [API_LAYER.md](frontend/API_LAYER.md) | API communication patterns |
| [ERROR_HANDLING.md](frontend/ERROR_HANDLING.md) | Error strategy and user feedback |
| [UI_STANDARDS.md](frontend/UI_STANDARDS.md) | Design system and styling |

---

## Reference (Technical Details)

| Document | Description |
|----------|-------------|
| [ASSET_SCORING.md](reference/ASSET_SCORING.md) | Asset scoring algorithm deep dive |
| [NFO_FORMAT.md](reference/NFO_FORMAT.md) | Complete Kodi NFO specification |
| [PATH_MAPPING.md](reference/PATH_MAPPING.md) | Docker/NAS path mapping scenarios |
| [WEBHOOKS.md](reference/WEBHOOKS.md) | Radarr/Sonarr/Lidarr webhook handling |
| [CLI_REFERENCE.md](reference/CLI_REFERENCE.md) | npm scripts and commands |

---

## Operations

| Document | Description |
|----------|-------------|
| [TROUBLESHOOTING.md](operations/TROUBLESHOOTING.md) | Common issues and solutions |
| [PERFORMANCE.md](operations/PERFORMANCE.md) | Performance tuning and optimization |
| [BACKUP_RECOVERY.md](operations/BACKUP_RECOVERY.md) | Backup strategies and disaster recovery |
| [SECURITY.md](operations/SECURITY.md) | Security best practices |
| [MONITORING.md](operations/MONITORING.md) | Logging, metrics, and monitoring |

---

## Development

| Document | Description |
|----------|-------------|
| [WORKFLOW.md](development/WORKFLOW.md) | **Complete development workflow (CRITICAL)** |
| [ROADMAP.md](development/ROADMAP.md) | **Current tasks and priorities (CRITICAL)** |
| [DOCUMENTATION_RULES.md](development/DOCUMENTATION_RULES.md) | Meta-documentation guidelines |
| [TESTING.md](development/TESTING.md) | Test infrastructure and strategy |
| [CODING_STANDARDS.md](development/CODING_STANDARDS.md) | TypeScript/React coding standards |

---

## Navigation Tips

**For AI Assistants**: Always read [CLAUDE.md](/CLAUDE.md), [WORKFLOW.md](development/WORKFLOW.md), and [ROADMAP.md](development/ROADMAP.md) at session start.

**For Developers**: Start with [WORKFLOW.md](development/WORKFLOW.md) for complete development process.

**For Users**: Start with [Getting Started](#getting-started) section above.

**Context Efficiency**: Use directory READMEs (e.g., [ASSET_MANAGEMENT/README.md](architecture/ASSET_MANAGEMENT/README.md)) as entry points, then load specific files as needed.
