# Metarr Documentation

Welcome to Metarr's comprehensive documentation. This index will guide you to the right document for your needs.

## Core Architecture Documents

Start here to understand Metarr's design and implementation plan:

### [ARCHITECTURE.md](ARCHITECTURE.md) ⭐
**The master design document.** Covers:
- Core principle: "Automate Everything, Override Anything"
- 6 core workflows
- Content-addressed cache system
- Job queue and priority levels
- Technology stack

**Read this first** if you're new to the project.

### [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md)
Complete database schema with all tables, indexes, and foreign keys:
- Movies, TV shows (series/seasons/episodes), music (artists/albums/tracks)
- Content-addressed cache assets
- Job queue with dependencies
- Playback state management
- Field locking columns
- All using CREATE TABLE statements (no ALTER)

### [WORKFLOWS.md](WORKFLOWS.md)
Detailed breakdown of the 6 core workflows with code examples:
1. **Webhook: New Media** - Full automation (10-30 seconds)
2. **Webhook: Upgrade** - Playback state restoration (5-10 seconds)
3. **Manual Library Scan** - Realignment (minutes to hours)
4. **Manual Asset Replacement** - User overrides (2-5 seconds)
5. **Delete Webhook** - 30-day soft delete
6. **Unidentified Media** - User intervention

Each workflow includes flow diagrams, TypeScript examples, and timing estimates.

### [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md)
Phased development plan (20-26 weeks):
- **Phase 0**: Foundation (Week 1)
- **Phase 1-3**: Core movie functionality (Weeks 2-7)
- **Phase 4-8**: Job queue, webhooks, Kodi, locking, soft deletes (Weeks 8-12)
- **Phase 9-10**: TV shows and music support (Weeks 13-18)
- **Phase 11-12**: Performance optimization and production readiness (Weeks 19-20)

## Integration Reference Documents

### [KODI_API.md](KODI_API.md) 📚
**Comprehensive Kodi JSON-RPC API reference** (1416 lines):
- All JSON-RPC methods from Kodi introspect
- Connection architecture (HTTP + WebSocket)
- Authentication
- Playback control
- Library management
- Notification system

**Critical for Phase 6 implementation** (Kodi Integration).

### [WEBHOOKS.md](WEBHOOKS.md)
Radarr and Sonarr webhook specifications:
- Webhook event types and payloads
- Authentication and validation
- Processing workflows
- Error handling

**Critical for Phase 5 implementation** (Webhook Integration).

### [NFO_PARSING.md](NFO_PARSING.md)
Kodi NFO file format specifications:
- XML schema for movies, TV shows, music
- Field mappings
- Asset naming conventions
- Parsing logic

**Critical for Phase 3 implementation** (Asset Management).

### [METADATA_PROVIDERS.md](METADATA_PROVIDERS.md)
Provider API details for:
- TMDB (The Movie Database) - movies and TV
- TVDB (The TV Database) - TV shows
- FanArt.tv - high-quality artwork
- MusicBrainz - music metadata (future)

Includes rate limiting, authentication, and API examples.

**Critical for Phase 2 implementation** (Provider Integration).

### [PATH_MAPPING.md](PATH_MAPPING.md)
Path translation between Metarr and media players:
- Auto-detection algorithm
- Manual configuration
- Platform-specific handling (Windows ↔ Linux)
- Validation and testing

**Critical for Phase 6 implementation** (Kodi Integration).

### [STREAM_DETAILS.md](STREAM_DETAILS.md)
FFprobe integration for extracting:
- Video stream details (codec, resolution, HDR)
- Audio stream details (codec, language, channels)
- Subtitle stream details (format, language, forced/default flags)

**Critical for Phase 1 implementation** (Core Movie Management).

## System Architecture Documents

### [API_ARCHITECTURE.md](API_ARCHITECTURE.md)
REST API design and SSE (Server-Sent Events):
- Endpoint structure and conventions
- Authentication and authorization
- Real-time updates via SSE
- Error handling and status codes

May need updates for simplified design.

### [NOTIFICATIONS_AND_LOGGING.md](NOTIFICATIONS_AND_LOGGING.md)
Complete guide to notifications, activity logging, and authentication:
- **Notifications**: Kodi, Discord, Pushover, Telegram, Slack
- **Activity Log**: Event types, database schema, UI design
- **Log Management**: Rotation, retention, live tail
- **Authentication**: JWT sessions, password management, setup wizard

### [TESTING.md](TESTING.md)
Test infrastructure and guidelines:
- Unit testing with Jest
- Integration testing
- Test data management
- Coverage requirements

## Frontend Documents

### [UI_DESIGN.md](UI_DESIGN.md)
Frontend design specifications:
- Layout (Header, Sidebar, Content)
- Color scheme (dark theme with purple accent)
- Component patterns
- Responsive design

### [FRONTEND_COMPONENTS.md](FRONTEND_COMPONENTS.md)
React component documentation:
- Component hierarchy
- Props and state
- Reusable UI components
- Integration patterns

## Archived Documentation

Old design documents preserved for reference in `_archive/`:
- `ASSET_MANAGEMENT.md` - Old three-tier asset system
- `AUTOMATION_AND_WEBHOOKS.md` - Old automation modes
- `FIELD_LOCKING.md` - Original field locking design
- `PUBLISHING_WORKFLOW.md` - Old publish workflow (replaced by immediate writes)
- `AUTO_SELECTION_ALGORITHM.md` - Overcomplicated auto-selection
- `ASSET_DISCOVERY.md` - Old lazy loading approach
- `IMPLEMENTATION_SUMMARY.md` - Replaced by IMPLEMENTATION_ROADMAP.md
- `MIGRATION_EXAMPLE.md` - Example code snippets

These are kept for historical context but should not be used for new development.

## Quick Start

### For New Developers
1. Read [ARCHITECTURE.md](ARCHITECTURE.md) to understand the big picture
2. Review [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) to understand data structures
3. Study [WORKFLOWS.md](WORKFLOWS.md) to see how everything works together
4. Follow [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md) for phased development

### For Specific Features
- **Kodi Integration**: [KODI_API.md](KODI_API.md) + [PATH_MAPPING.md](PATH_MAPPING.md)
- **Webhook Processing**: [WEBHOOKS.md](WEBHOOKS.md) + [WORKFLOWS.md](WORKFLOWS.md)
- **Metadata Enrichment**: [METADATA_PROVIDERS.md](METADATA_PROVIDERS.md)
- **Asset Management**: [NFO_PARSING.md](NFO_PARSING.md) + [STREAM_DETAILS.md](STREAM_DETAILS.md)
- **Frontend Development**: [UI_DESIGN.md](UI_DESIGN.md) + [FRONTEND_COMPONENTS.md](FRONTEND_COMPONENTS.md)
- **Notifications**: [NOTIFICATIONS_AND_LOGGING.md](NOTIFICATIONS_AND_LOGGING.md)

## Documentation Updates

When updating documentation:
1. Keep documents focused on implementation details, not philosophy
2. Include code examples where applicable
3. Update related documents if changes affect them
4. Add to this README if creating new top-level documents
5. Move outdated documents to `_archive/` rather than deleting

## Contributing

Documentation improvements are welcome! Please ensure:
- Technical accuracy
- Code examples are tested
- Cross-references are updated
- Markdown formatting is consistent

---

**Last Updated**: 2025-10-13
**Project Version**: Pre-release (Development)
