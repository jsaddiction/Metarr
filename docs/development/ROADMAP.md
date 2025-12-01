# Development Roadmap

Last updated: 2025-12-01

## In Progress
- [ ] Cast/Actors tab redesign (WIP)
  - [x] Database: Added `actors_order_locked`, `role_locked`, `removed` fields to movie_actors
  - [x] Backend: MovieCastController, getCast/updateCast service methods, API routes
  - [x] Frontend: useCast hook, SortableActorRow, RemovedActorsList components
  - [x] Native HTML5 drag-drop for actor reordering (replaced @dnd-kit and @hello-pangea/dnd)
  - [x] Per-actor role locking with TextInput lock integration
  - [x] Movie-level order lock with smart state machine (auto-locks on reorder, reverts to server state when restored)
  - [x] Soft-delete actors with restore capability
  - [x] Actor images via direct cache serving (image_hash in API response)
  - [x] Stacked layout with larger actor photos (w-18 h-18)
  - [x] Flush handle/trash buttons as integrated row controls
  - [x] Smart hasChanges detection (Save/Revert hide when state matches server)
  - [ ] Final testing and polish

## Next Up (Priority Order)

### Core UI/UX Improvements
- [ ] Dashboard rework with meaningful data
  - Library statistics (total items, completeness %, recent additions)
  - Provider statistics (API usage, rate limits, success rates)
  - Media player statistics (sync status, last connected, errors)
- [ ] Notification system implementation
  - Build notification engine with filtering
  - Create configuration UI for notification rules
  - Support multiple notification channels (webhook, email, etc.)

### Media Handling Enhancements
- [ ] Improve trailer (videos), subtitle, and theme tunes handling
  - Enhanced UI for video/subtitle management
  - Better provider integration for trailers
  - Theme tune selection and publication
- [ ] Movie set handling
  - Collection/set detection and grouping
  - Set-specific artwork selection
  - Set metadata and publication workflow

### Technical Improvements
- [ ] Database evaluation and optimization
  - Review table structure and relationships
  - Identify redundant or overly complex tables
  - Optimize schema for performance and maintainability
- [ ] Logging system refactor
  - Ensure appropriate log levels on all messages
  - Reduce verbosity at INFO level
  - Consider presenting logs in UI (system monitoring page)

### Future Enhancements
- [ ] Actor page linking
  - Actor name in cast list should link to actor edit page
  - Actor edit page shows all movies actor appears in
  - Actor profile management (biography, image, etc.)
- [ ] Download manager API client integration
  - Investigate Radarr/Sonarr/Lidarr API clients
  - Auto-configure directory scanning from download manager
  - Auto-configure webhook communication
  - Evaluate ROI and benefits
- [ ] TV Show support (full implementation)
  - Season/episode metadata enrichment
  - TV-specific providers (TVDB primary)
  - Episode artwork and subtitles
- [ ] Music support (full implementation)
  - Album/artist/track metadata
  - MusicBrainz and TheAudioDB integration
  - Music-specific artwork types
- [ ] Expand provider ecosystem
  - Add robust sources for all media types
  - Additional metadata providers
  - Additional artwork providers
- [ ] Smart media player processing
  - Ensure correct processing for each player type
  - Optimize sync strategies
  - Handle player-specific edge cases

## Completed Recently
- [x] Configuration consolidation (2025-11-25)
  - Removed redundant per-library automation configuration
  - Consolidated to global workflow settings via PhaseConfigService
  - Clarified global vs per-library configuration philosophy
  - Global settings control BEHAVIOR (auto-select, auto-publish, language)
  - Per-library settings control SCOPE (paths, types, schedules)
  - Removed 485 lines of unused code (AutomationConfigService, controller)
  - Updated documentation to reflect simplified configuration model
- [x] Provider page redesign (2025-11-22)
  - Ultra-compact single-row card layout (Name + ? | API Key | Stats | Test | Switch)
  - Grey background (bg-neutral-800/50) matching metadata tab styling
  - All providers in unified list (no enabled/disabled split)
  - Compact vertical sizing (p-3, h-7 inputs, text-xs fonts, space-y-3)
  - Fixed "impossible to enable" bug - API key fields always visible
  - All provider details hidden behind ? tooltip (capabilities, rate limits, assets)
  - Inline configuration with auto-save (500ms debounce)
  - API key indicators: "Shared" (embedded) or "Personal" (user key)
  - Real-time statistics (24-hour calls, last fetch) with 10-second auto-refresh
  - Test connection button on each card
  - Password fields with show/hide toggle
  - Removed 14 files (4,313 lines) of orphaned priority code
- [x] Provider aggregation enhancements (2025-11-22)
  - Field-level priority system (OMDB > TMDB)
  - "Fill gaps, don't erase" metadata merge logic
  - Three merge strategies: preferred_first, field_mapping, aggregate_all
- [x] Smart API call strategy (2025-11-22)
  - Parallel provider calls with Promise.allSettled()
  - 7-day smart caching (fresh cache instant return, stale triggers refetch)
  - Rate limit detection with bulk vs webhook handling
  - Priority-based timeouts and retry logic
- [x] Metadata completeness calculation (2025-11-22)
  - 11-field completeness percentage for movies
  - Stored in movies.completeness_pct column
  - Updated after every enrichment
- [x] OMDB provider integration and outline field support (2025-11-21)
  - OMDB API key configuration via Settings UI
  - OMDB test connection handler
  - OMDBCacheAdapter for provider orchestration
  - Outline field (short plot) throughout entire pipeline
  - Lazy loading of OMDB config from database
  - Crew deduplication fix for unique constraint errors
- [x] Metadata completeness feature - production info, stats, external links (2025-11-19)
- [x] Planning workflow documentation complete (2025-11-19)

## Backlog (Archive)
- [x] Planning workflow documentation
- [x] Documentation migration

## Notes

### Usage Guidelines
- Keep this updated after every work session
- Move completed tasks to "Completed Recently" with date
- Archive old completed tasks monthly
- Use simple checkbox format for clarity

### Session Continuity
This file answers "what next?" when starting a new session or switching machines:
1. Read this file first
2. Check "In Progress" section
3. Review "Next Up" for priorities
4. Update after completing work

### Maintenance
- Review weekly to ensure priorities are current
- Archive completed tasks older than 30 days
- Keep "Next Up" focused (max 5-7 items)
- Be specific in task descriptions
