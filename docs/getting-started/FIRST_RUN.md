# First Run Guide

**Purpose**: Step-by-step walkthrough for first-time Metarr setup and initial library scan.

**Related Docs**:
- Parent: [Getting Started](../INDEX.md#getting-started)
- Prerequisites: [Installation](INSTALLATION.md) or [Docker Setup](DOCKER.md)
- See also: [Configuration](CONFIGURATION.md)

## Quick Reference

- Access web interface at `http://localhost:3000`
- No mandatory setup wizard - all defaults work
- Recommended: Configure at least one library before scanning
- First scan takes 5-30 minutes depending on library size
- WebSocket connection provides real-time progress updates

---

## Initial Access

### Open Web Interface

**Local installation**:
```
http://localhost:3000
```

**Docker or remote server**:
```
http://SERVER_IP:3000
```

**Expected**: Metarr dashboard loads with navigation sidebar.

---

## Quick Start Path

**Fastest way to see Metarr in action**:

1. **Add Library** (2 minutes)
2. **Run First Scan** (5-30 minutes)
3. **Review Results** (5 minutes)
4. **Configure Providers** (optional - 5 minutes)
5. **Enrich Library** (10-60 minutes)

---

## Step 1: Add Your First Library

### Navigate to Libraries

1. Click **Settings** in sidebar
2. Click **Libraries** tab
3. Click **Add Library** button

### Configure Library

**Required fields**:
- **Name**: Descriptive name (e.g., "Main Movies", "TV Shows")
- **Type**: Select media type (movie, tv, music)
- **Path**: Full path to your media directory

**Path examples**:
- Linux: `/mnt/media/movies`
- Windows: `C:\Media\Movies` or `\\NAS\Media\Movies`
- Docker: `/media/movies` (container path)

**Monitored toggle**:
- **ON** (green) - Metarr manages metadata and assets (recommended)
- **OFF** (gray) - Metarr scans but won't modify (read-only mode)

### Docker Users: Path Mapping

**Why needed**: Webhooks from Radarr/Sonarr use host paths, but Metarr sees container paths.

**Example scenario**:
- Radarr reports: `/mnt/storage/movies/Movie (2024)/movie.mkv`
- Docker sees: `/media/movies/Movie (2024)/movie.mkv`

**Configuration**:
1. In library edit screen, scroll to **Path Mappings**
2. Click **Add Mapping**
3. **External Path**: `/mnt/storage/movies` (Radarr's path)
4. **Internal Path**: `/media/movies` (Docker container path)
5. Save mapping

**Verification**: Test mapping with manual scan (next step).

### Save Library

Click **Save** button. Library appears in list.

---

## Step 2: Run First Scan

### Initiate Scan

**From dashboard**:
1. Navigate to **Dashboard**
2. Find your library in list
3. Click **Scan** button

**From library detail**:
1. Navigate to **Libraries** → [Your Library]
2. Click **Scan Library** button

### Monitor Progress

**Real-time updates** appear automatically via WebSocket.

**What happens during scan**:
1. **File discovery** - Finds video files
2. **Classification** - Identifies movies/episodes
3. **NFO parsing** - Reads existing metadata (if present)
4. **Database creation** - Creates/updates database records
5. **Asset discovery** - Finds existing posters/fanart

**Progress indicators**:
- Overall progress bar
- Current file being processed
- Files found count
- Errors/warnings

**Typical scan times**:
- 100 movies: 2-5 minutes
- 1,000 movies: 5-15 minutes
- 5,000 movies: 15-30 minutes

### Review Scan Results

**After completion**:
- Dashboard shows library item count
- Navigate to **Movies** or **TV Shows** to browse
- Click any item to see details

**Common observations**:
- **Matched items**: Have titles, years, existing metadata
- **Unmatched items**: Filename only, need enrichment
- **Existing assets**: Posters/fanart already in library detected

---

## Step 3: Understanding Your Library State

### Item Status Indicators

**Monitored vs Unmonitored**:
- **Monitored**: Metarr will enrich and manage
- **Unmonitored**: Read-only, respects existing data

**Enrichment status**:
- **Not enriched**: No provider metadata fetched
- **Enriched**: Metadata and candidate assets available
- **Published**: Assets deployed to library

### Existing Assets

**Important**: Metarr preserves your existing assets.

**How it works**:
1. Scan discovers existing posters/fanart
2. Files tracked in database as "library assets"
3. At enrichment, provider options fetched
4. You choose: keep existing or select new
5. Only at publishing are old assets replaced

**Protection**: Original assets backed up before replacement.

---

## Step 4: Provider Configuration (Optional)

**Zero config required** - Embedded API keys included.

**Recommended for production**:
1. Navigate to **Settings → Providers**
2. Review enabled providers:
   - **TMDB** - Movies, TV metadata
   - **TVDB** - TV shows, detailed episode info
   - **Fanart.tv** - High-quality artwork
   - **Local** - Existing NFO files
3. Optionally add personal API keys (higher rate limits)

**Default provider priority**:
1. Local (existing NFO data)
2. TMDB
3. TVDB
4. Fanart.tv

**Changing priority**:
- Drag and drop providers to reorder
- Higher = preferred for metadata conflicts
- Does not affect asset scoring (automatic)

See [Getting API Keys](../providers/GETTING_API_KEYS.md) for personal keys.

---

## Step 5: First Enrichment

**Purpose**: Fetch metadata and artwork from providers.

### Enrich Single Item (Recommended First)

**Test enrichment on one movie**:
1. Navigate to **Movies**
2. Click any movie
3. Click **Enrich** button
4. Wait for completion (30-60 seconds)

**What happens**:
1. Providers queried for metadata
2. Metadata fields updated (title, plot, ratings, etc.)
3. Asset candidates fetched (posters, fanart, etc.)
4. Assets scored automatically
5. Top candidates auto-selected (configurable)

**Review results**:
- **Metadata tab**: See fetched data
- **Assets tab**: Browse poster/fanart options
- **Select different assets**: Click to choose alternatives

### Enrich Entire Library

**After testing single item**:
1. Navigate to **Libraries → [Your Library]**
2. Click **Enrich All** button
3. Confirm dialog
4. Monitor progress (can take 10-60 minutes)

**Background processing**:
- Job queue handles requests
- Rate limiting prevents API throttling
- Can continue using Metarr during enrichment
- Progress visible in **Jobs** page

### Understanding Asset Selection

**Automatic selection** (default):
- Scoring algorithm evaluates all options
- Factors: resolution, aspect ratio, language, popularity
- Top-scored asset auto-selected
- Manual override always available

**Manual selection**:
1. Item detail → **Assets** tab
2. Click asset type (poster, fanart, etc.)
3. Browse all candidates
4. Click to select
5. Selection saved immediately

See [Asset Scoring](../reference/ASSET_SCORING.md) for algorithm details.

---

## Step 6: First Publishing

**Purpose**: Deploy selected assets to your media library.

### Publish Single Item

**Test publishing on one movie**:
1. Navigate to enriched movie
2. **Assets** tab shows selected assets
3. Click **Publish** button
4. Check your media folder

**Results**:
- Poster file: `movie-poster.jpg`
- Fanart file: `movie-fanart.jpg`
- NFO file: `movie.nfo` (if enabled)
- Other assets based on selection

**Kodi naming convention** used for compatibility.

### Publish Entire Library

1. Navigate to **Libraries → [Your Library]**
2. Click **Publish All** button
3. Confirm dialog
4. Monitor progress

**Safety features**:
- Existing assets backed up to recycle bin
- 30-day retention before permanent deletion
- Field locking prevents unwanted changes

---

## Step 7: Verify Results

### Check Media Directory

**Navigate to a movie folder**:
```
Movie (2024)/
├── movie.mkv
├── movie.nfo          # New: Kodi NFO file
├── movie-poster.jpg   # New or replaced
└── movie-fanart.jpg   # New or replaced
```

### Scan in Media Player

**Kodi**:
1. Update library
2. Navigate to movie
3. Verify poster/fanart appear
4. Check movie details (metadata)

**Jellyfin/Plex**:
1. Scan library
2. Verify artwork and metadata updated

---

## Common First-Run Questions

### Do I need API keys?

**No** - Embedded keys included for testing and personal use.

**Yes** - Recommended for production or commercial use. See [Getting API Keys](../providers/GETTING_API_KEYS.md).

### Will Metarr modify my existing files?

**Video files**: Never modified
**Metadata**: Only if monitored and you enrich
**Assets**: Only replaced at publishing (with backup)
**NFO files**: Created/updated if enabled

### What if I don't like the selected assets?

**Change anytime**:
1. Item detail → **Assets** tab
2. Click asset type to browse all options
3. Select different asset
4. Re-publish (optional - for immediate update)

### Can I undo changes?

**Yes**:
- **Recycle bin**: Deleted assets kept 30 days
- **Field locking**: Prevents future automated changes
- **Unmonitor**: Stops Metarr from modifying item

### How do I handle misidentified items?

**Manual matching**:
1. Item detail → **Metadata** tab
2. Click **Search** button
3. Enter correct title or TMDB/TVDB ID
4. Select correct match
5. Re-enrich with correct metadata

---

## Next Steps

**After successful first run**:

1. **Configure Webhooks** - Auto-scan on new downloads
   - See [Webhook Setup](../reference/WEBHOOKS.md)

2. **Connect Media Players** - Auto-update libraries
   - See [Player Setup](../players/OVERVIEW.md)

3. **Enable Automation** - Full workflow automation
   - Settings → Phases → Enable desired phases

4. **Setup Backup** - Protect your metadata cache
   - See [Backup & Recovery](../operations/BACKUP_RECOVERY.md)

---

## Troubleshooting

### Scan finds no files

**Check**:
- Library path is correct
- Metarr has read access to path
- Path mapping configured (Docker)
- Files are video formats (.mkv, .mp4, .avi)

### Enrichment fails

**Check**:
- Internet connection working
- Provider API keys valid (if using personal keys)
- Rate limits not exceeded (wait and retry)
- Check logs: `./logs/error-YYYY-MM-DD.log`

### Publishing doesn't create files

**Check**:
- Metarr has write access to library path
- Assets were selected (check Assets tab)
- No field locks preventing publish
- Check logs for permission errors

### Assets not appearing in player

**Kodi**:
- Ensure Kodi is scanning the same directory
- Kodi settings → Media → Videos → Use local information only

**Jellyfin/Plex**:
- Ensure library configured to use local metadata
- Trigger library scan after publishing

---

## See Also

- [Configuration Guide](CONFIGURATION.md) - Detailed settings
- [Migration Guide](MIGRATION.md) - Moving from other systems
- [Troubleshooting](../operations/TROUBLESHOOTING.md) - Common issues
- [Phase Documentation](../phases/OVERVIEW.md) - Understanding automation
