# Metarr Documentation Index

Complete documentation map for Metarr - intelligent metadata management for media libraries.

---

## Quick Start

**For Developers**:
- [CLAUDE.md](/CLAUDE.md) - AI assistant workflow rules (CRITICAL)
- [WORKFLOW.md](development/WORKFLOW.md) - Development workflow (CRITICAL)
- [ROADMAP.md](development/ROADMAP.md) - Current priorities (CRITICAL)

---

## Operational Concepts

Design principles and conceptual documentation for how Metarr processes media.

### Main Pipeline

| Job | Documentation | Purpose |
|-----|---------------|---------|
| Scanning | [concepts/Scanning/](concepts/Scanning/) | Discover, classify, identify media |
| Enrichment | [concepts/Enrichment/](concepts/Enrichment/) | Gather metadata and select assets |
| Publishing | [concepts/Publishing/](concepts/Publishing/) | Deploy to library for players |
| Player Sync | [concepts/PlayerSync/](concepts/PlayerSync/) | Notify media players of changes |

### Independent Jobs

| Job | Documentation | Purpose |
|-----|---------------|---------|
| Verification | [concepts/Verification/](concepts/Verification/) | Ensure cache↔library consistency |
| Notification | [concepts/Notification/](concepts/Notification/) | Send filtered alerts to users |

---

## Implementation Details

Media-specific implementation for each operational concept.

### Media Types

| Media Type | Documentation | Status |
|------------|---------------|--------|
| Movies | [implementation/Movies/](implementation/Movies/) | Complete |
| TV Shows | Planned | - |
| Music | Planned | - |

### Cross-Cutting Implementation

| Component | Documentation | Description |
|-----------|---------------|-------------|
| Providers | [implementation/Providers/](implementation/Providers/) | Provider API integration details |
| Player Sync | [implementation/PlayerSync/](implementation/PlayerSync/) | Media player integration (Kodi, Jellyfin, Plex) |

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

## Job System

Technical documentation for the job-driven automation system.

| Document | Description |
|----------|-------------|
| [architecture/JOB_QUEUE.md](architecture/JOB_QUEUE.md) | Job priorities, worker pools, pass-through behavior |

---

## Providers

### Concepts (concepts/Enrichment/Providers/)

| Document | Description |
|----------|-------------|
| [README.md](concepts/Enrichment/Providers/README.md) | Provider capabilities and selection strategies |
| [RATE_LIMITING.md](concepts/Enrichment/Providers/RATE_LIMITING.md) | Rate limiting, circuit breakers, backoff |

### Implementation (implementation/Providers/)

| Document | Description |
|----------|-------------|
| [TMDB.md](implementation/Providers/TMDB.md) | TMDB API integration |
| [TVDB.md](implementation/Providers/TVDB.md) | TVDB API integration |
| [OMDB.md](implementation/Providers/OMDB.md) | OMDb API (IMDb ratings, RT, Metacritic) |
| [FANART.md](implementation/Providers/FANART.md) | Fanart.tv artwork integration |
| [MUSICBRAINZ.md](implementation/Providers/MUSICBRAINZ.md) | MusicBrainz integration (planned) |
| [LOCAL.md](implementation/Providers/LOCAL.md) | Local NFO parsing and backup |

---

## Frontend

| Document | Description |
|----------|-------------|
| [README.md](frontend/README.md) | Frontend documentation overview |
| [ARCHITECTURE.md](frontend/ARCHITECTURE.md) | Frontend architecture and structure |
| [COMPONENT_GUIDELINES.md](frontend/COMPONENT_GUIDELINES.md) | Component creation rules and principles |
| [COMPONENT_REFERENCE.md](frontend/COMPONENT_REFERENCE.md) | Complete component inventory |
| [STYLING_GUIDE.md](frontend/STYLING_GUIDE.md) | Design tokens and styling patterns |
| [STATE_MANAGEMENT.md](frontend/STATE_MANAGEMENT.md) | TanStack Query + hooks |
| [API_LAYER.md](frontend/API_LAYER.md) | API communication patterns |
| [ERROR_HANDLING.md](frontend/ERROR_HANDLING.md) | Error strategy and user feedback |

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

## Development

| Document | Description |
|----------|-------------|
| [WORKFLOW.md](development/WORKFLOW.md) | **Complete development workflow (CRITICAL)** |
| [ROADMAP.md](development/ROADMAP.md) | **Current tasks and priorities (CRITICAL)** |
| [PLANNING_WORKFLOW.md](development/PLANNING_WORKFLOW.md) | **Planning mode with named agents (CRITICAL)** |
| [DOCUMENTATION_RULES.md](development/DOCUMENTATION_RULES.md) | Meta-documentation guidelines |
| [TESTING.md](development/TESTING.md) | Test infrastructure and strategy |
| [CODING_STANDARDS.md](development/CODING_STANDARDS.md) | TypeScript/React coding standards |

---

## Navigation Tips

**For AI Assistants**: Always read [CLAUDE.md](/CLAUDE.md), [WORKFLOW.md](development/WORKFLOW.md), [ROADMAP.md](development/ROADMAP.md) at session start. Use [concepts/](concepts/) for conceptual understanding, [implementation/](implementation/) for media-specific details.

**For Developers**: Start with [WORKFLOW.md](development/WORKFLOW.md) for complete development process.

**Context Efficiency**: Use directory READMEs as entry points, then load specific files as needed.
