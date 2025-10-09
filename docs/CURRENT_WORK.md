# Current Work - Provider Implementation

**Last Updated:** 2025-01-09
**Status:** In Progress - Local Provider Planning Phase
**Next Session:** Implement Local Provider

## Provider Implementation Progress

**Completed: 3/7 Providers (43%)**

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

### 📋 Next: Local Provider

**Status:** Architecture designed, ready to implement

**Purpose:** NFO parsing, local asset discovery, filesystem scanning

**Key Decisions Made:**

1. **Local Provider as Real Provider**
   - Extends BaseProvider like remote providers
   - No rate limits (filesystem access is instant)
   - "Search" = Parse NFO files for IDs
   - "GetAssets" = Discover local files using Kodi naming conventions

2. **Backup Cache System** (CRITICAL FEATURE)
   - Before enrichment, backup all local assets to `data/backup/`
   - Store in `backup_assets` table with metadata (dimensions, pHash, etc.)
   - User can restore backed-up assets later via UI
   - Auto-cleanup after retention period (default: 90 days)

3. **Asset Deduplication via pHash**
   - Compute perceptual hash for all images
   - If local asset pHash matches remote asset pHash = same image
   - Use local copy, inherit remote metadata (votes, ratings)
   - Skip download, save bandwidth

4. **Default Behavior: Replace Local Assets**
   - Like MediaElch: Replace local assets with web sources
   - Provides clean, trackable, known-provenance assets
   - User settings allow different policies (supplement, compete, preserve)

## Implementation Tasks (Next Session)

### 1. Database Migration for Backup Cache

Create migration file: `src/database/migrations/YYYYMMDD_HHmmss_add_backup_assets.ts`

```sql
CREATE TABLE backup_assets (
  id INTEGER PRIMARY KEY,
  movie_id INTEGER NOT NULL,
  type TEXT NOT NULL,

  -- Original location
  original_path TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  original_hash TEXT,

  -- Backup location
  backup_path TEXT NOT NULL,
  backed_up_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- File properties
  file_size INTEGER,
  width INTEGER,
  height INTEGER,
  phash TEXT,

  -- Restoration tracking
  restored BOOLEAN DEFAULT FALSE,
  restored_at TIMESTAMP,

  FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE
);

CREATE INDEX idx_backup_assets_movie_type ON backup_assets(movie_id, type);
CREATE INDEX idx_backup_assets_phash ON backup_assets(phash);
```

### 2. Implement Perceptual Hash (pHash)

**Library:** Use `sharp` with image fingerprinting or `phash` npm package

**Location:** `src/utils/imageHash.ts`

```typescript
export async function computePerceptualHash(imagePath: string): Promise<string> {
  // Resize to 8x8, convert to grayscale, compute DCT, generate hash
  // Returns 64-bit hash as hex string
}
```

### 3. Create LocalProvider

**Files to create:**
- `src/services/providers/local/LocalProvider.ts`
- `src/services/providers/local/LocalScanner.ts` (reuse existing scan services)
- `src/services/providers/local/BackupService.ts` (new)
- `src/services/providers/local/register.ts`

**Key methods:**

```typescript
export class LocalProvider extends BaseProvider {
  defineCapabilities(): ProviderCapabilities {
    return {
      id: 'local',
      name: 'Local Files',
      category: 'both',
      supportedEntityTypes: ['movie', 'series', 'season', 'episode'],

      // Special: No API, no rate limits
      rateLimit: {
        requestsPerSecond: 999999,
        enforcementType: 'client'
      },

      search: {
        supported: true,
        fuzzyMatching: false,
        externalIdLookup: ['tmdb', 'imdb', 'tvdb']
      }
    };
  }

  async search(request: SearchRequest): Promise<SearchResult[]> {
    // Parse NFO files in directory
    // Extract IDs (TMDB, IMDB, TVDB)
    // Return search results with extracted IDs
  }

  async getAssets(request: AssetRequest): Promise<AssetCandidate[]> {
    // Discover local assets using Kodi naming conventions
    // Measure dimensions with Sharp
    // Compute pHash for deduplication
    // Return candidates with localPath flag
  }
}
```

### 4. Implement Backup Service

**Location:** `src/services/providers/local/BackupService.ts`

```typescript
export class BackupService {
  async backupAssets(movieId: number, libraryPath: string): Promise<void> {
    // Discover all local assets
    // Copy each to data/backup/{type}/{movieId}/
    // Measure dimensions, compute pHash
    // Store in backup_assets table
  }

  async restoreAsset(backupId: number): Promise<void> {
    // Copy from backup to main cache
    // Create asset_candidate entry
    // Mark as selected
    // Publish to library
    // Rebalance selection
  }

  async cleanupOldBackups(retentionDays: number): Promise<void> {
    // Delete backups older than retention period
  }
}
```

### 5. Integration Points

**Existing code to leverage:**
- `src/services/nfo/nfoParser.ts` - Already parses NFO files
- `src/services/media/assetDiscovery.ts` - Already discovers local assets
- `src/services/scan/unifiedScanService.ts` - Orchestrates scanning

**Update unifiedScanService.ts to:**
1. Call BackupService before enrichment
2. Use LocalProvider for NFO parsing
3. Use LocalProvider for asset discovery

### 6. Add User Settings

**Location:** `src/config/settings.ts` or settings table

```typescript
interface BackupSettings {
  enabled: boolean;              // Default: true
  retentionDays: number;         // Default: 90
  autoCleanup: boolean;          // Default: true
  backupSubtitles: boolean;      // Default: false
  backupTrailers: boolean;       // Default: false
}
```

### 7. Testing

Create tests:
- `tests/services/providers/local/LocalProvider.test.ts`
- `tests/services/providers/local/BackupService.test.ts`

Test scenarios:
- NFO parsing (XML and URL formats)
- Local asset discovery (all Kodi naming variants)
- Backup creation and restoration
- pHash deduplication
- Cleanup of old backups

## Remaining Providers (After Local)

4. **IMDb (Web Scraping)** - Not started
   - Category: Metadata only
   - Entities: movie, series, episode
   - Purpose: Ratings, reviews via direct web scraping
   - Note: OMDb API implementation was removed (not direct scraping)

5. **MusicBrainz** - Not started
   - Category: Both (metadata + images)
   - Entities: artist, album, track
   - Purpose: Music metadata

6. **TheAudioDB** - Not started
   - Category: Images only
   - Entities: artist, album
   - Purpose: Music artwork

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
- Commits ahead of origin: 12
- Last commit: "Add FanArt.tv provider implementation"
- Ready to push after committing documentation updates

## Questions/Decisions for Next Session

1. **pHash Library Choice:**
   - Use `sharp` with custom DCT implementation?
   - Use `phash` npm package?
   - Use `blockhash` for simpler perceptual hashing?

2. **Backup Directory Structure:**
   - Flat: `data/backup/images/{movieId}_{type}_{timestamp}.jpg`
   - Nested: `data/backup/images/{movieId}/{type}_{timestamp}.jpg` (preferred)

3. **NFO Writing:**
   - Should LocalProvider also handle NFO writing/generation?
   - Or keep that separate in existing nfoGenerator service?

4. **UI for Asset Review:**
   - New route: `/metadata/movies/{id}/assets` or `/metadata/movies/{id}/asset-review`?
   - Show thumbnails or just metadata?
   - Inline restoration or modal dialog?

## Commands for Next Session

```bash
# Continue implementation
npm run dev:all

# Run type checking frequently
npm run typecheck

# Build to verify compilation
npm run build

# Run tests
npm test

# Commit when ready
git add -A
git commit -m "feat(providers): implement Local provider with backup cache system"
git push origin master
```

## Notes

- All provider implementations follow the same pattern (Client → Provider → register.ts)
- Rate limiting is abstracted in BaseProvider, LocalProvider can skip it
- Backup cache is user-controlled feature, can be disabled entirely
- pHash deduplication prevents unnecessary re-downloads
- Focus on making LocalProvider fit the existing provider framework consistently
