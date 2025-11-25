# Configuration

**Purpose**: Complete guide to configuring Metarr through environment variables and web interface settings.

**Related Docs**:
- Parent: [Getting Started](../INDEX.md#getting-started)
- See also: [Installation](INSTALLATION.md), [Docker Setup](DOCKER.md), [First Run](FIRST_RUN.md)

## Quick Reference

- **Zero config required** - Metarr works out of the box with embedded API keys
- **Environment variables** for infrastructure (database, paths, performance)
- **Web interface** for operational settings (providers, phases, libraries)
- **Configuration file**: `.env` in project root (copy from `.env.example`)
- **No restart required** for most web interface changes

---

## Configuration Overview

### Two Configuration Layers

**1. Environment Variables** (Infrastructure)
- Database connection
- File paths
- Performance tuning
- API keys (optional)
- Requires restart to apply

**2. Web Interface** (Operations)
- Library setup
- Provider configuration
- Phase enable/disable
- Player connections
- Takes effect immediately

---

## Environment Variables

### Database Configuration

**SQLite (Default)** - Zero configuration
```env
DB_TYPE=sqlite
```

Database created at: `./data/metarr.sqlite`

**PostgreSQL** - For large libraries or high concurrency
```env
DB_TYPE=postgres
DATABASE_URL=postgresql://user:password@localhost:5432/metarr
```

**Database Tuning**
```env
DB_POOL_SIZE=5              # Connection pool size (default: 5)
DB_QUERY_TIMEOUT=30000       # Query timeout in ms (default: 30000)
DB_ENABLE_WAL=true           # SQLite WAL mode (default: true)
```

**When to use PostgreSQL**:
- Library > 10,000 items
- Multiple concurrent users
- High webhook traffic
- Need advanced query capabilities

### Storage Paths

```env
CACHE_PATH=/data/cache      # Protected asset cache
LIBRARY_PATH=/media         # Media library root
```

**Cache Path** - Where Metarr stores downloaded assets
- Default: `./data/cache`
- Must be persistent and backed up
- Content-addressed storage (SHA256 sharding)
- Shared across all libraries

**Library Path** - Root path for media libraries
- Default: `./media`
- Must have read/write access
- Where Metarr publishes assets (posters, fanart, NFOs)
- Can be same as your Kodi/Jellyfin/Plex library

**Docker users**: These are container paths. Map to host paths via volumes.

### Provider API Keys (Optional)

**Embedded defaults included** - no signup required for testing.

**Personal keys recommended** for:
- Production deployments
- Higher rate limits
- Commercial use

```env
# TMDB (The Movie Database)
TMDB_API_KEY=your_api_key_here

# TVDB (The TV Database)
TVDB_API_KEY=your_api_key_here

# Fanart.tv
FANART_TV_API_KEY=your_api_key_here
```

**Getting API keys**: See [Provider API Keys Guide](../providers/GETTING_API_KEYS.md)

### Provider Rate Limiting

```env
TMDB_RATE_LIMIT=4         # Requests per second (default: 4)
TVDB_RATE_LIMIT=4         # Requests per second (default: 4)
FANART_RATE_LIMIT=2       # Requests per second (default: 2)
PROVIDER_REQUEST_TIMEOUT=10000   # Request timeout in ms (default: 10000)
PROVIDER_MAX_RETRIES=3    # Max retries per request (default: 3)
```

**Tuning guidance**:
- Lower limits if hitting rate limit errors
- Higher limits with personal API keys
- Keep FANART_RATE_LIMIT at 2 (strict limits)

### Job Queue Configuration

```env
JOB_QUEUE_WORKERS=5                    # Max concurrent workers (default: 5)
JOB_QUEUE_POLL_INTERVAL=1000           # Poll interval in ms (default: 1000)
JOB_QUEUE_MAX_FAILURES=5               # Circuit breaker threshold (default: 5)
JOB_QUEUE_CIRCUIT_RESET_DELAY=60000    # Circuit reset delay in ms (default: 60000)
```

**Workers** - Concurrent job processing
- Small server (2-4 cores): 3
- Medium server (4-8 cores): 5-8
- Large server (8+ cores): 10-15

See [Performance Guide](../operations/PERFORMANCE.md) for detailed tuning.

### Asset Processing

```env
ASSET_MAX_CONCURRENT_DOWNLOADS=5    # Max concurrent downloads (default: 5)
ASSET_MAX_SIZE=52428800             # Max file size in bytes - 50MB (default)
IMAGE_PROCESSING_TIMEOUT=30000      # Image analysis timeout ms (default: 30000)
```

**Concurrent downloads**:
- Match or slightly exceed worker count
- Lower if network bandwidth limited
- Higher for fast networks and powerful CPU

### WebSocket Configuration

```env
WS_STATS_THROTTLE=2000      # Stats broadcast throttle ms (default: 2000)
WS_HEARTBEAT_INTERVAL=30000 # Heartbeat interval ms (default: 30000)
```

**Stats throttle**: How often to broadcast system stats
- Lower = more real-time, higher CPU
- Higher = less real-time, lower CPU

### Logging

```env
LOG_LEVEL=info              # Log level: debug, info, warn, error
LOG_TO_FILE=true            # Enable file logging (default: true)
LOG_MAX_FILES=7             # Max log file rotation (default: 7)
LOG_MAX_SIZE=10m            # Max log file size (default: 10m)
```

**Log levels**:
- `debug` - Verbose logging (development)
- `info` - Normal operation (default)
- `warn` - Warnings only
- `error` - Errors only

**Log files location**: `./logs/`
- `app-YYYY-MM-DD.log` - Application logs
- `error-YYYY-MM-DD.log` - Error logs only
- Rotated daily, kept for 7 days by default

---

## Web Interface Configuration

Access at: `http://localhost:3000/settings` (or your server URL)

### Libraries

**Purpose**: Define media libraries for Metarr to manage

**Configuration**:
1. Navigate to **Settings → Libraries**
2. Click **Add Library**
3. Configure:
   - **Name**: Descriptive name (e.g., "Movies", "TV Shows")
   - **Type**: movie, tv, music
   - **Path**: Library root path
   - **Monitored**: Enable/disable Metarr management

**Path Mapping** (Docker/Remote Servers):
- **External Path**: Path as reported by downloaders (Radarr/Sonarr)
- **Internal Path**: Path as seen by Metarr
- Required when paths differ between systems

**Example**:
- External: `/mnt/storage/movies`
- Internal: `/media/movies` (Docker container path)

### Provider Configuration

**Purpose**: Configure metadata and asset providers

**Available providers**:
- **TMDB** - Movies, TV shows (metadata, posters, fanart)
- **TVDB** - TV shows (detailed episode info, assets)
- **Fanart.tv** - High-quality artwork (clearlogo, discart, etc.)
- **Local** - Existing NFO files and assets in library
- **MusicBrainz** - Music metadata (future)

**Configuration**:
1. Navigate to **Settings → Providers**
2. Enable/disable providers
3. Set provider priority order
4. Configure API keys (if not in environment)

**Provider Priority**:
- Determines which provider's data is preferred
- Higher priority = used first
- Affects metadata conflicts (title, plot, etc.)
- Does not affect asset selection (scoring system)

### Workflow Configuration

**Purpose**: Configure global workflow behavior

**Location**: Settings → General (Workflow)

**Configuration Scope**: GLOBAL (applies to all libraries)

**Available settings**:

**Enrichment Tab**:
- **Automatic Asset Selection** - Auto-select best assets vs manual review
- **Preferred Language** - Language preference for asset scoring (e.g., 'en')
- **Asset Download Limits** - Maximum number of each asset type to download (per media type)

**Publishing Tab**:
- **Automatic Publishing** - Auto-publish after enrichment vs manual trigger
- **Publish Assets** - Copy posters, fanart, logos to library
- **Publish Actors** - Copy actor headshots to .actors/ folder
- **Publish Trailers** - Download and save trailer files

**Configuration Philosophy**:
- **Global settings** control BEHAVIOR (how Metarr works)
- **Per-library settings** control SCOPE (what gets processed):
  - Library paths and types (Settings → Libraries)
  - Asset limits per media type (Settings → General → Enrichment)
  - Scheduler intervals (Settings → Libraries → individual library)

**Common workflows**:
- **Fully automated**: Auto-select ON, Auto-publish ON
- **Review gate** (recommended): Auto-select ON, Auto-publish OFF
- **Manual curation**: Auto-select OFF, Auto-publish OFF

See [Phase Documentation](../phases/OVERVIEW.md) for workflow details.

### Player Connections

**Purpose**: Configure media player integrations

**Supported players**:
- **Kodi** - JSON-RPC API
- **Jellyfin** - REST API
- **Plex** - REST API (future)

**Configuration**:
1. Navigate to **Settings → Players**
2. Click **Add Player**
3. Configure connection:
   - **Name**: Friendly name
   - **Type**: Kodi, Jellyfin, Plex
   - **URL**: Player API URL
   - **Credentials**: Username/password or API key

**Example - Kodi**:
- URL: `http://192.168.1.100:8080`
- Username: `kodi`
- Password: (your Kodi web interface password)

**Path Mapping** (if needed):
- Map Metarr library paths to player library paths
- Required if player sees different paths

---

## Performance Presets

### Small Home Server
*2-4 cores, 4GB RAM, ~1000 movies*

```env
DB_TYPE=sqlite
JOB_QUEUE_WORKERS=3
DB_POOL_SIZE=3
ASSET_MAX_CONCURRENT_DOWNLOADS=3
```

### Medium Deployment
*4-8 cores, 8GB RAM, ~5000 movies*

```env
DB_TYPE=sqlite
JOB_QUEUE_WORKERS=8
DB_POOL_SIZE=8
ASSET_MAX_CONCURRENT_DOWNLOADS=8
```

### Large Deployment
*8+ cores, 16GB RAM, 10k+ movies*

```env
DB_TYPE=postgres
DATABASE_URL=postgresql://metarr:password@localhost:5432/metarr
JOB_QUEUE_WORKERS=15
DB_POOL_SIZE=10
ASSET_MAX_CONCURRENT_DOWNLOADS=10
```

---

## Applying Configuration Changes

### Environment Variables

**Requires restart**:
```bash
# Development
npm run dev:all

# Production
npm start

# Docker
docker-compose restart
```

### Web Interface Settings

**Takes effect immediately** - no restart required.

**Exception**: Provider API keys require reconnection (automatic).

---

## Troubleshooting

### Configuration Not Applied

**Problem**: Environment variable changes not taking effect

**Solutions**:
1. Verify `.env` file exists and is readable
2. Restart Metarr application
3. Check for typos in variable names
4. Docker: Ensure environment section in `docker-compose.yml`

### Invalid Database URL

**Problem**: PostgreSQL connection fails

**Check**:
- Database server is running
- Credentials are correct
- Database exists
- Network connectivity
- Firewall rules

### Permission Errors

**Problem**: Cannot write to cache or library paths

**Solutions**:
1. Verify paths exist
2. Check filesystem permissions
3. Docker: Ensure volume mounts are correct
4. Try absolute paths instead of relative

### API Key Errors

**Problem**: Provider requests failing with authentication errors

**Solutions**:
1. Verify API key is correct (copy-paste carefully)
2. Check provider dashboard for key status
3. Ensure key has required permissions
4. Try removing and re-adding key

---

## See Also

- [First Run Guide](FIRST_RUN.md) - Initial setup walkthrough
- [Performance Tuning](../operations/PERFORMANCE.md) - Optimization guide
- [Provider Setup](../providers/GETTING_API_KEYS.md) - Get API keys
- [Troubleshooting](../operations/TROUBLESHOOTING.md) - Common issues
