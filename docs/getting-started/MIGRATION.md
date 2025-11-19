# Migration Guide

**Purpose**: Step-by-step guide for migrating to Metarr from Kodi, Jellyfin, or Plex native library management.

**Related Docs**:
- Parent: [Getting Started](../INDEX.md#getting-started)
- See also: [First Run](FIRST_RUN.md), [Backup & Recovery](../operations/BACKUP_RECOVERY.md)

## Quick Reference

- **Metarr preserves existing metadata and assets** during migration
- **No downtime required** - Metarr works alongside existing systems
- **Incremental migration supported** - Test on subset before full migration
- **Rollback safe** - Original files backed up to recycle bin
- **NFO files preserved** - Existing NFO data incorporated

---

## Migration Philosophy

### Non-Destructive Approach

**Metarr's migration guarantees**:
1. **Video files never modified** - Only metadata and artwork
2. **Existing assets backed up** - Before any replacement
3. **NFO files preserved** - Incorporated into Metarr metadata
4. **Player compatibility maintained** - Kodi naming conventions used
5. **Recycle bin protection** - 30-day retention for deleted items

### Coexistence Period

**Recommended approach**:
1. Install Metarr alongside existing system
2. Test on small subset of library
3. Verify results in media player
4. Gradually expand coverage
5. Fully transition when confident

**Both systems can operate simultaneously** - No conflicts.

---

## Pre-Migration Checklist

### Backup Current State

**Critical**: Backup before making changes

1. **Database backup** (player-specific)
   - Kodi: `userdata/Database/` directory
   - Jellyfin: `data/jellyfin.db` (SQLite) or PostgreSQL dump
   - Plex: `Plug-in Support/Databases/` directory

2. **Metadata files** (if using local metadata)
   - NFO files (`.nfo`)
   - Asset files (`.jpg`, `.png`)
   - Copy entire library or use version control

3. **Player configuration**
   - Export settings if available
   - Document custom configurations

See [Backup & Recovery](../operations/BACKUP_RECOVERY.md) for detailed procedures.

### Inventory Current Metadata

**Understand what you have**:
- **NFO files present?** - Metarr will incorporate
- **Custom artwork?** - Will be tracked and preserved
- **Manual metadata edits?** - NFO data takes priority
- **Watched status?** - Player sync can preserve (Kodi)

### Storage Requirements

**Estimate Metarr storage needs**:
- **Cache**: 2-5GB per 1000 movies (downloaded assets)
- **Database**: 100-500MB per 1000 movies (SQLite)
- **Recycle bin**: Temporary storage for replaced assets (30 days)

**Total**: Plan for 3-6GB per 1000 movies.

---

## Migration from Kodi

### Understanding Kodi Metadata

**Kodi native approach**:
- Scrapes online databases (TMDB, TVDB)
- Stores metadata in internal database
- Optionally exports NFO files
- Stores assets in media directories

**Metarr advantages**:
- Protected cache survives library deletions
- Field-level locking preserves manual edits
- Provider fallback (multiple sources)
- Better asset management (scoring, selection)

### Migration Steps

#### 1. Export Kodi NFO Files (Optional but Recommended)

**If not already using NFO files**:
1. Kodi Settings → Media → Videos
2. Enable "Export video library" on exit OR
3. Use addon: Library Data Provider / NFO Exporter

**Result**: NFO files in movie/show directories

**Benefits**:
- Preserves Kodi's metadata decisions
- Metarr reads existing NFO data
- Rollback easier (Kodi can re-import)

#### 2. Install Metarr

Follow [Installation Guide](INSTALLATION.md) or [Docker Setup](DOCKER.md).

**Storage configuration**:
- **LIBRARY_PATH**: Point to your Kodi media directory
- Metarr needs read/write access

#### 3. Add Library to Metarr

1. Navigate to **Settings → Libraries**
2. Click **Add Library**
3. Configure:
   - **Name**: "Kodi Movies" (or descriptive name)
   - **Type**: movie/tv
   - **Path**: Your Kodi media directory
   - **Monitored**: OFF (for testing)

**Monitored OFF** prevents Metarr from making changes during testing.

#### 4. Initial Scan

1. Library detail → **Scan Library**
2. Wait for completion
3. Review results:
   - Items discovered
   - NFO files parsed
   - Existing assets detected

**Verification**:
- Item count matches Kodi library
- Existing posters/fanart appear in Metarr
- NFO metadata visible in item details

#### 5. Test Enrichment (Single Item)

**Test on one movie**:
1. Find movie with minimal manual edits
2. Click **Enrich**
3. Review metadata changes
4. Check asset candidates
5. **Do NOT publish yet**

**Verify**:
- NFO data preserved (Local provider priority)
- Additional metadata from TMDB/TVDB
- Asset options available

#### 6. Test Publishing (Single Item)

**Enable monitored for test item**:
1. Item detail → Toggle monitored ON
2. Click **Publish**
3. Check media directory for changes
4. Verify Kodi still displays correctly

**Expected results**:
- Original assets in recycle bin
- New assets in media directory
- Kodi displays updated artwork
- Metadata unchanged (NFO takes priority)

#### 7. Gradual Rollout

**If test successful**:
1. Enable monitored for small subset (10-20 items)
2. Enrich and publish subset
3. Verify in Kodi
4. Expand to larger groups
5. Eventually enable for entire library

**If issues found**:
- Review logs
- Check field locking settings
- Adjust provider priority
- See [Troubleshooting](#troubleshooting)

#### 8. Kodi Library Sync (Optional)

**Enable player sync**:
1. **Settings → Players → Add Player**
2. Select Kodi, configure connection
3. Enable player sync phase

**Benefits**:
- Metarr updates Kodi automatically
- Watched status synchronization
- Play count preservation
- No manual Kodi library scans needed

See [Kodi Integration](../players/KODI.md) for details.

### Kodi-Specific Considerations

**NFO file handling**:
- Metarr reads existing NFO files (Local provider)
- Updates NFO files on publish (if enabled)
- Respects NFO uniqueid tags (TMDB/TVDB/IMDB IDs)

**Asset naming**:
- Metarr uses Kodi naming conventions
- Compatible with Kodi's local information settings
- No Kodi configuration changes needed

**Watched status**:
- Preserved via player sync
- Requires Kodi connection configured
- Bidirectional sync available

---

## Migration from Jellyfin

### Understanding Jellyfin Metadata

**Jellyfin native approach**:
- Scrapes online databases
- Stores metadata in internal database (SQLite/PostgreSQL)
- Optionally saves NFO files
- Stores assets in metadata directories (separate from media)

**Key difference**: Jellyfin stores assets separately (not in media folders).

### Migration Steps

#### 1. Export Jellyfin NFO Files (Recommended)

**Jellyfin Settings**:
1. Dashboard → Libraries → [Library]
2. **NFO settings** → Enable NFO saving
3. **Metadata savers** → Enable "Nfo"
4. Scan library to generate NFO files

**Result**: NFO files in media directories

#### 2. Consolidate Assets (Optional)

**Jellyfin stores assets separately**:
- Location: `metadata/library/[item-id]/`
- Not in media directories

**Options**:
1. **Let Metarr re-download** - Simplest approach
2. **Copy Jellyfin assets to media folders** - Preserves current images
   - Rename to Kodi conventions: `movie-poster.jpg`, `movie-fanart.jpg`
   - Metarr will detect and track

#### 3. Install and Configure Metarr

Follow standard installation, point **LIBRARY_PATH** to Jellyfin media directories.

**Important**: Use media directories, not metadata directories.

#### 4. Add Library and Scan

Similar to Kodi migration:
1. Add library (monitored OFF)
2. Scan to discover items
3. Verify NFO data imported

#### 5. Enrich and Publish

**Asset handling**:
- If you copied Jellyfin assets: Metarr detects and offers them
- If not: Metarr downloads fresh assets from providers

**NFO metadata**:
- Jellyfin NFO format compatible with Metarr
- Existing IDs and metadata preserved

#### 6. Jellyfin Library Sync (Future)

**Current status**: Jellyfin player sync in development

**Workaround**:
- Jellyfin can read NFO files and local assets
- Configure Jellyfin library to prefer local metadata
- Manual library scan after Metarr publishing

**Future**: Direct API sync like Kodi integration.

### Jellyfin-Specific Considerations

**Metadata location**:
- Metarr publishes to media directories
- Jellyfin can read both locations

**Library configuration**:
- Set Jellyfin to prefer local metadata
- Disable Jellyfin automatic metadata refresh (conflicts)

**Collection management**:
- Jellyfin collections separate from Metarr
- Manual recreation needed if important

---

## Migration from Plex

### Understanding Plex Metadata

**Plex native approach**:
- Scrapes online databases
- Stores metadata in proprietary database
- Stores assets in Plex metadata directory (separate from media)
- Limited NFO support

**Key challenge**: Plex doesn't use NFO files by default.

### Migration Steps

#### 1. Export Plex Database (Backup)

**Critical for rollback**:
1. Stop Plex Media Server
2. Copy `Plug-in Support/Databases/` directory
3. Copy `Metadata/` directory (large - optional)
4. Restart Plex

#### 2. Install Metarr

Standard installation, **LIBRARY_PATH** points to Plex media directories.

#### 3. Initial Scan

**Without NFO files**:
- Metarr uses filename parsing
- May require manual matching for unclear filenames

**Recommendations**:
- Use consistent naming (e.g., "Movie (2024)")
- Leverage TMDB/TVDB IDs if available

#### 4. Enrich Library

**Fresh metadata fetch**:
- No existing NFO data to preserve
- Metarr fetches from providers
- Manual verification recommended

**Asset handling**:
- Plex assets not in media directories
- Metarr downloads fresh assets
- Higher quality options often available

#### 5. Publishing

**Metarr creates**:
- NFO files (if enabled)
- Assets in media directories
- Kodi-compatible naming

**Plex compatibility**:
- Plex can read local assets
- Configure Plex to prefer local media
- NFO support limited but improving

#### 6. Plex Library Configuration

**After Metarr publishing**:
1. Plex Settings → Libraries → [Library]
2. **Advanced**:
   - Enable "Prefer local metadata"
   - Enable "Store track progress in media files" (if desired)
3. Refresh library metadata

### Plex-Specific Considerations

**Limited NFO support**:
- Plex reads some NFO data
- Not as comprehensive as Kodi/Jellyfin
- Asset usage more reliable

**Poster preference**:
- Plex may still prefer online posters
- Configure "Prefer local metadata" in library settings

**Collections**:
- Plex collections not exported
- Manual recreation needed

**Future**: Plex API integration planned for better sync.

---

## Incremental Migration Strategy

### Subset Testing

**Test on manageable subset**:
1. Create new library in Metarr (e.g., "Test - Action Movies")
2. Point to subfolder or use filters
3. Enrich and publish subset
4. Verify in player
5. Expand gradually

**Benefits**:
- Lower risk
- Identify issues early
- Refine process before full migration

### Priority-Based Migration

**Migrate in priority order**:
1. **High-value content** - Recently added, frequently watched
2. **Problem content** - Missing metadata, poor artwork
3. **Bulk content** - Well-managed libraries (less benefit)

**Timeline**: Spread migration over days/weeks, not hours.

---

## Post-Migration Optimization

### Field Locking

**Protect manual edits**:
1. Identify manually curated items
2. Enable field locks to prevent automated changes
3. See [Field Locking](../architecture/ASSET_MANAGEMENT/FIELD_LOCKING.md)

### Provider Tuning

**Adjust provider priority**:
1. Review enrichment results
2. Identify preferred provider for your needs
3. Adjust priority in Settings → Providers

### Automation Setup

**Enable full workflow**:
1. Configure webhooks (Radarr, Sonarr)
2. Enable automation phases
3. Set up scheduled scans

See [Webhooks Guide](../reference/WEBHOOKS.md).

---

## Troubleshooting

### Missing Items After Scan

**Check**:
- File naming conventions (consistent?)
- Supported file formats (.mkv, .mp4, .avi)
- Path mapping (Docker setups)
- Read permissions on directories

### Metadata Conflicts

**Problem**: Metarr metadata differs from player

**Solution**:
- Verify Local provider is enabled and prioritized
- Check NFO files are present and valid
- Re-scan to re-import NFO data

### Assets Not Appearing in Player

**Kodi**:
- Settings → Media → Videos → "Use local information only"
- Update library after Metarr publishing

**Jellyfin**:
- Library settings → Prefer local metadata
- Scan library after publishing

**Plex**:
- Library advanced settings → Prefer local metadata
- Refresh metadata (not scan)

### Performance Issues During Migration

**Large library migration**:
- Reduce worker count temporarily
- Migrate in smaller batches
- Schedule during low-usage periods
- Consider PostgreSQL for databases >10k items

See [Performance Guide](../operations/PERFORMANCE.md).

---

## Rollback Procedures

### Restore Original State

**If migration unsuccessful**:

1. **Stop Metarr**
2. **Restore recycle bin items**:
   - Location: `data/recycle/`
   - Copy back to media directories
3. **Delete Metarr-created files** (optional):
   - NFO files (if Metarr-generated)
   - New assets (if not desired)
4. **Restore player database** (if backed up)

**Recycle bin retention**: 30 days by default.

### Partial Rollback

**Rollback specific items**:
1. Item detail → View recycle bin
2. Restore individual files
3. Re-publish if needed

---

## See Also

- [First Run Guide](FIRST_RUN.md) - Initial setup walkthrough
- [Backup & Recovery](../operations/BACKUP_RECOVERY.md) - Backup strategies
- [Kodi Integration](../players/KODI.md) - Kodi-specific features
- [Field Locking](../architecture/ASSET_MANAGEMENT/FIELD_LOCKING.md) - Protect manual edits
- [Troubleshooting](../operations/TROUBLESHOOTING.md) - Common issues
