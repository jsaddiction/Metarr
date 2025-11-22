# Development Roadmap

Last updated: 2025-11-22

## In Progress
- [ ] TBD - awaiting user direction

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
- [x] Provider page redesign (2025-11-22)
  - Compact card layout (no tabs, no modals, no accordions)
  - All providers visible on one page (enabled + disabled)
  - Inline configuration with auto-save (500ms debounce)
  - Auto-disable logic for missing required API keys
  - Password fields with show/hide toggle
  - API key indicators (embedded/personal/missing)
  - Real-time statistics (24-hour calls, last fetch)
  - 10-second auto-refresh via TanStack Query
  - Test connection button on each card
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
