# Metarr Documentation

## Documentation Structure

This documentation follows a hierarchical, compartmentalized structure designed for efficient context usage and clear understanding.

### 🚀 Quick Start Resources

1. **[INDEX.md](INDEX.md)** - Complete navigation with implementation status
2. **[QUICK_REFERENCE.md](QUICK_REFERENCE.md)** - Commands, API, and troubleshooting cheat sheet
3. **[CLAUDE.md](../CLAUDE.md)** - Executive summary and overview
4. **Read relevant [Phase Documentation](phases/)** - Understand the workflow element you're working on
5. **Reference [Cross-Cutting Concerns](#cross-cutting-concerns)** - As needed for implementation details

## Core Documentation

### Executive Summary
- **[CLAUDE.md](../CLAUDE.md)** - Start here! Application overview, philosophy, and navigation

### Elemental Phases
Independent, idempotent phases that form the processing pipeline:

- **[SCANNING.md](phases/SCANNING.md)** - File discovery and classification
- **[ENRICHMENT.md](phases/ENRICHMENT.md)** - Metadata fetching and asset selection
- **[PUBLISHING.md](phases/PUBLISHING.md)** - Asset deployment to library
- **[PLAYER_SYNC.md](phases/PLAYER_SYNC.md)** - Media player synchronization
- **[VERIFICATION.md](phases/VERIFICATION.md)** - Consistency checking and repair

### Cross-Cutting Concerns
System-wide patterns and standards:

- **[DATABASE.md](DATABASE.md)** - Complete data model and schema
- **[API.md](API.md)** - REST endpoints and WebSocket events
- **[UI_STANDARDS.md](UI_STANDARDS.md)** - Frontend design system and components
- **[DEVELOPMENT.md](DEVELOPMENT.md)** - Git workflow, coding standards, testing

## Implementation Details

### Provider Integrations
- **[OVERVIEW.md](providers/OVERVIEW.md)** - Provider system overview
- **[TMDB.md](providers/TMDB.md)** - The Movie Database integration
- **[TVDB.md](providers/TVDB.md)** - TheTVDB integration
- **[FANART.md](providers/FANART.md)** - Fanart.tv integration

### Player Integrations
- **[KODI.md](players/KODI.md)** - Kodi JSON-RPC API
- **[JELLYFIN.md](players/JELLYFIN.md)** - Jellyfin REST API
- **[PLEX.md](players/PLEX.md)** - Plex Media Server API

### Technical References
- **[GIT_WORKFLOW.md](technical/GIT_WORKFLOW.md)** - Detailed Git conventions
- **[NFO_PARSING.md](technical/NFO_PARSING.md)** - Kodi NFO format
- **[WEBHOOKS.md](technical/WEBHOOKS.md)** - Webhook handling

## Documentation Philosophy

### Principles
1. **Compartmentalized** - Load only what you need
2. **Single Source of Truth** - No duplicate information
3. **Hierarchical** - Executive → Phase → Implementation
4. **Efficient** - ~200 lines per document target

### Context Usage Pattern

For any task, load:
1. **CLAUDE.md** (250 lines) - Always start here
2. **Relevant Phase** (150-200 lines) - The workflow element
3. **Specific Cross-Cutting** (200-250 lines) - As needed
4. **Implementation Detail** (150-200 lines) - If required

**Total context: ~600-900 lines** (vs 2000+ lines before)

## Migration from Old Structure

### What Changed
- **39 files → 19 files** - Massive consolidation
- **~15,000 lines → ~3,500 lines** - Removed redundancy
- **Clear hierarchy** - Know exactly where to look
- **Archived old docs** - Available in `docs/archive/` if needed

### Key Improvements
1. **Eliminated conflicts** - Single definition for each concept
2. **Clear mental model** - 5 phases + 4 cross-cutting concerns
3. **Efficient navigation** - Hierarchical structure
4. **Maintainable** - Know where to update

## For AI Assistants

When working with this codebase:
1. Always start by reading CLAUDE.md
2. Load phase documentation for the area you're working on
3. Reference cross-cutting concerns as needed
4. Check implementation details only when required
5. Never load the entire documentation at once

## For Human Developers

This structure is designed to help you:
1. Understand the system quickly (CLAUDE.md)
2. Find information easily (clear hierarchy)
3. Work efficiently (load only what you need)
4. Maintain consistency (single source of truth)

---

*Last restructured: 2025-10-24*