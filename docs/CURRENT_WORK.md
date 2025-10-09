# Current Work - Provider Implementation

**Last Updated:** 2025-10-09
**Status:** Local Provider Complete - Ready for Next Provider
**Next Session:** IMDb Provider (or as directed)

## Provider Implementation Progress

**Completed: 4/7 Providers (57%)**

### ✅ Implemented Providers

1. **TMDB (The Movie Database)** - Merged to master
   - Category: Both (metadata + images)
   - Entities: movie, collection
   - Rate Limit: 4 req/sec (40 burst)
   - Assets: poster, fanart, logo
   - Files: `src/services/providers/tmdb/`

2. **TVDB (TheTVDB)** - Merged to master
   - Category: Both (metadata + images)
   - Entities: series, season, episode
   - Rate Limit: 10 req/sec (50 burst)
   - Authentication: JWT with 24-hour token lifecycle
   - Assets: poster, fanart, banner, clearlogo, clearart, thumb
   - Files: `src/services/providers/tvdb/`

3. **FanArt.tv** - Merged to master
   - Category: Images only
   - Entities: movie, series, season
   - Rate Limit: 1-2 req/sec (personal key doubles rate)
   - Assets: clearlogo, clearart, poster, fanart, banner, thumb, discart, characterart
   - Special: High-quality curated artwork, multi-language, community voting
   - Files: `src/services/providers/fanart/`

4. **Local Provider** - Merged to master
   - Category: Both (metadata + images)
   - Entities: movie, series, season, episode
   - Rate Limit: 1000 req/sec (effectively unlimited for filesystem)
   - Authentication: None required
   - Search: NFO parsing for external IDs (TMDB, IMDB, TVDB)
   - Assets: All Kodi-compatible types (poster, fanart, banner, clearlogo, etc.)
   - Special Features:
     - Backup cache system (stores originals before enrichment)
     - Perceptual hash (pHash) for image deduplication
     - Content hash (SHA256) for file integrity
     - Automatic backup cleanup (90-day retention)
     - Kodi naming convention support for asset discovery
   - Files: `src/services/providers/local/`, `src/utils/imageHash.ts`

## Remaining Providers

### 📋 Next Up (Priority Order)

1. **IMDb (Web Scraping)** - Priority: MEDIUM
   - Category: Metadata only
   - Entities: movie, series, episode
   - Purpose: Ratings, reviews via direct web scraping
   - Note: OMDb API implementation was removed (not direct scraping)
   - Complexity: High (web scraping requires careful maintenance)

2. **MusicBrainz** - Priority: LOW
   - Category: Both (metadata + images)
   - Entities: artist, album, track
   - Purpose: Music metadata
   - Status: Phase 2 (music support)

3. **TheAudioDB** - Priority: LOW
   - Category: Images only
   - Entities: artist, album
   - Purpose: Music artwork
   - Status: Phase 2 (music support)

## Key Architecture Documents

**Updated:**
- `docs/METADATA_PROVIDERS.md` - Added Local Provider & Backup Cache section
- `docs/CURRENT_WORK.md` - This file (handoff document)

**To Reference:**
- `docs/ARCHITECTURE.md` - Overall system design
- `docs/WORKFLOWS.md` - Two-phase scanning workflow
- `docs/ASSET_MANAGEMENT.md` - Three-tier asset system
- `docs/DATABASE_SCHEMA.md` - Database structure

## Git Status

- Current branch: `master`
- Last commit: "feat(providers): implement Local provider with backup cache system"
- Local Provider merged and feature branch deleted
- Ready for next provider implementation

## Implementation Decisions Made

1. **pHash Library:** Using `sharp` with average hash algorithm (8x8 resize + grayscale)
2. **Backup Directory Structure:** Nested structure: `data/backup/{entityType}/{entityId}/{type}_{timestamp}.ext`
3. **Database Schema:** Added `backup_assets` table to initial migration (development phase)
4. **Settings Storage:** Backup configuration stored in `settings` table with `backup_*` keys

## Commands for Next Session

```bash
# Start development
npm run dev:all

# Type checking (run frequently)
npm run typecheck

# Build verification
npm run build

# Run tests
npm test

# Git workflow for next provider (example: IMDb)
git checkout -b feature/provider-imdb
# ... implement provider ...
git add -A
git commit -m "feat(providers): implement IMDb provider"
git checkout master
git merge --no-ff feature/provider-imdb
git branch -d feature/provider-imdb
```

## Implementation Notes

### Local Provider Lessons Learned

1. **Type Safety:** TypeScript's `exactOptionalPropertyTypes` requires careful handling of optional fields
2. **Metadata Storage:** Use `metadata` object in SearchResult/AssetCandidate for provider-specific fields
3. **Database Changes:** During development, add schema changes directly to initial migration
4. **Git Workflow:** User prefers to review commit messages before execution
5. **Commit Attribution:** Do not include Co-Authored-By or email addresses
6. **Backup Architecture:** Successfully implemented nested directory structure with comprehensive metadata tracking

### Provider Implementation Pattern

All providers follow this structure:
- `{Provider}Client.ts` - API/filesystem access layer (if needed)
- `{Provider}Provider.ts` - Extends BaseProvider, implements capabilities
- `register.ts` - Self-registration with ProviderRegistry
- Export and import in `src/services/providers/index.ts`

### Next Provider: IMDb Considerations

- **Web Scraping:** Requires HTML parsing (cheerio or similar)
- **Rate Limiting:** Must be conservative to avoid IP blocking
- **Maintenance:** Web scraping is fragile, requires monitoring for page structure changes
- **Data Quality:** Focus on ratings and vote counts, core IMDb strengths
- **Fallback:** Consider OMDb API as backup if direct scraping becomes problematic
