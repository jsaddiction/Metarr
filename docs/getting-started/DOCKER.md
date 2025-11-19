# Docker Setup

**Purpose**: Complete guide for deploying Metarr using Docker and Docker Compose.

**Related Docs**:
- Parent: [Getting Started](../INDEX.md#getting-started)
- Alternative: [Bare Metal Installation](INSTALLATION.md)
- See also: [Configuration](CONFIGURATION.md), [Performance](../operations/PERFORMANCE.md)

## Quick Reference

- **Docker 20.10+** and **Docker Compose 2.0+** required
- Requires three volume mounts: cache, media library, database/config
- Default ports: 3000 (web interface)
- Path mapping critical for proper media scanning
- Use `docker-compose.yml` for persistent configuration

---

## Prerequisites

### Required Software

**Docker Engine 20.10 or higher**
```bash
docker --version
# Docker version 20.10.0 or higher
```

**Docker Compose 2.0 or higher**
```bash
docker-compose --version
# Docker Compose version 2.0.0 or higher
```

**Installation**:
- [Docker Desktop](https://www.docker.com/products/docker-desktop) (Windows/Mac) - includes Compose
- [Docker Engine](https://docs.docker.com/engine/install/) (Linux) + [Docker Compose](https://docs.docker.com/compose/install/)

### Storage Requirements

- **Cache volume**: ~2-5GB per 1000 movies (for downloaded assets)
- **Database volume**: ~100-500MB per 1000 movies
- **Media library**: Your existing media (read/write access required)

---

## Docker Compose Configuration

### Basic Setup

Create `docker-compose.yml` in your preferred directory:

```yaml
version: '3.8'

services:
  metarr:
    image: metarr/metarr:latest
    container_name: metarr
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      # Database (SQLite default)
      - DB_TYPE=sqlite

      # Optional: Use PostgreSQL instead
      # - DB_TYPE=postgres
      # - DATABASE_URL=postgresql://metarr:password@postgres:5432/metarr

      # Storage paths (inside container)
      - CACHE_PATH=/data/cache
      - LIBRARY_PATH=/media

      # Optional: Provider API keys (embedded defaults provided)
      # - TMDB_API_KEY=your_tmdb_api_key
      # - TVDB_API_KEY=your_tvdb_api_key
      # - FANART_TV_API_KEY=your_fanart_api_key

      # Performance tuning (adjust for your hardware)
      - JOB_QUEUE_WORKERS=5
      - ASSET_MAX_CONCURRENT_DOWNLOADS=5

      # Logging
      - LOG_LEVEL=info
    volumes:
      # Persistent data (database, config)
      - ./data:/data

      # Media library (adjust to your media location)
      - /mnt/media:/media:rw

      # Optional: Logs directory
      - ./logs:/app/logs

    # Optional: depends on PostgreSQL
    # depends_on:
    #   - postgres

  # Optional: PostgreSQL for large libraries
  # postgres:
  #   image: postgres:16-alpine
  #   container_name: metarr-postgres
  #   restart: unless-stopped
  #   environment:
  #     - POSTGRES_DB=metarr
  #     - POSTGRES_USER=metarr
  #     - POSTGRES_PASSWORD=change_this_password
  #   volumes:
  #     - ./postgres-data:/var/lib/postgresql/data
```

### Volume Configuration Explained

**1. Data Volume** (`./data:/data`)
- **Contains**: SQLite database, cache, recycle bin, configuration
- **Purpose**: Persistent storage for all Metarr data
- **Backup**: Critical - backup this entire directory
- **Permissions**: Container needs read/write access

**2. Media Library Volume** (`/mnt/media:/media:rw`)
- **Contains**: Your media files (movies, TV shows, music)
- **Purpose**: Metarr scans and publishes assets here
- **Permissions**: Must have read/write access
- **Path Mapping**: This is crucial - see Path Mapping section below

**3. Logs Volume** (`./logs:/app/logs`) - Optional
- **Contains**: Application logs, error logs
- **Purpose**: Easy access to logs from host
- **Permissions**: Container needs write access

---

## Starting Metarr

### First Time Setup

```bash
# Create docker-compose.yml with configuration above
# Edit volume paths to match your system

# Create directories
mkdir -p data logs

# Start container
docker-compose up -d

# View logs
docker-compose logs -f
```

**Expected output**:
```
metarr | Server running on http://localhost:3000
metarr | Database initialized successfully
metarr | WebSocket server ready
```

### Access Web Interface

Open browser to: `http://localhost:3000`

If running on remote server: `http://SERVER_IP:3000`

### Stop/Restart Container

```bash
# Stop
docker-compose down

# Restart
docker-compose restart

# Update to latest version
docker-compose pull
docker-compose up -d
```

---

## Path Mapping

**Critical for proper operation**: Metarr must understand how paths differ between Docker container and external systems (Radarr, Sonarr, media players).

### Understanding Path Mapping

**Scenario**: Your media is at `/mnt/storage/movies` on host, but `/media/movies` in container.

**Without path mapping**:
- Radarr webhook says: `/mnt/storage/movies/Movie (2024)/movie.mkv`
- Metarr looks for: `/mnt/storage/movies/...` (doesn't exist in container)
- **Result**: Scan fails

**With path mapping**:
- Radarr webhook says: `/mnt/storage/movies/Movie (2024)/movie.mkv`
- Metarr translates to: `/media/movies/Movie (2024)/movie.mkv`
- **Result**: Scan succeeds

### Configuration

Path mappings are configured in Metarr web interface under **Settings → Libraries**.

**Example mapping**:
- **External Path**: `/mnt/storage/movies` (what Radarr reports)
- **Internal Path**: `/media/movies` (path in Docker container)

### Common Scenarios

**Scenario 1: All media in one directory**
```yaml
volumes:
  - /mnt/storage:/media
```
Mapping: `/mnt/storage` → `/media`

**Scenario 2: Movies and TV shows separate**
```yaml
volumes:
  - /mnt/movies:/media/movies
  - /mnt/tv:/media/tv
```
Mappings:
- `/mnt/movies` → `/media/movies`
- `/mnt/tv` → `/media/tv`

**Scenario 3: Multiple drives**
```yaml
volumes:
  - /mnt/drive1/movies:/media/drive1/movies
  - /mnt/drive2/movies:/media/drive2/movies
```
Mappings:
- `/mnt/drive1/movies` → `/media/drive1/movies`
- `/mnt/drive2/movies` → `/media/drive2/movies`

---

## Networking

### Default Configuration

Metarr runs on port 3000 by default.

### Reverse Proxy Setup

**Nginx example**:
```nginx
server {
    listen 80;
    server_name metarr.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**Traefik example**:
```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.metarr.rule=Host(`metarr.yourdomain.com`)"
  - "traefik.http.services.metarr.loadbalancer.server.port=3000"
```

### WebSocket Support

Metarr uses WebSockets for real-time updates. Ensure your reverse proxy supports WebSocket upgrades (shown in examples above).

---

## Environment Variables

### Essential Variables

```yaml
environment:
  # Database
  - DB_TYPE=sqlite                    # or postgres
  - DATABASE_URL=postgresql://...     # if postgres

  # Paths (inside container)
  - CACHE_PATH=/data/cache
  - LIBRARY_PATH=/media

  # Logging
  - LOG_LEVEL=info                    # debug, info, warn, error
```

### Performance Tuning

```yaml
environment:
  # Worker pool
  - JOB_QUEUE_WORKERS=5              # Concurrent jobs (default: 5)

  # Asset downloads
  - ASSET_MAX_CONCURRENT_DOWNLOADS=5 # Parallel downloads (default: 5)

  # Database
  - DB_POOL_SIZE=5                   # Connection pool (default: 5)
```

**Tuning guidance**:
- Small server (2 cores, 4GB RAM): Workers=3, Downloads=3
- Medium server (4 cores, 8GB RAM): Workers=8, Downloads=8
- Large server (8+ cores, 16GB RAM): Workers=15, Downloads=10

See [Performance Guide](../operations/PERFORMANCE.md) for details.

### Provider API Keys (Optional)

```yaml
environment:
  - TMDB_API_KEY=your_key_here
  - TVDB_API_KEY=your_key_here
  - FANART_TV_API_KEY=your_key_here
```

Embedded defaults are included for development. Personal keys recommended for production.

See [Getting API Keys](../providers/GETTING_API_KEYS.md).

---

## Common Issues

### Container Won't Start

**Check logs**:
```bash
docker-compose logs metarr
```

**Common causes**:
- Port 3000 already in use: Change port in `docker-compose.yml`
- Volume permission errors: Ensure Docker can access mounted paths
- Invalid environment variables: Check syntax

### Permission Denied Errors

**Problem**: Metarr can't write to media library or cache

**Solution 1**: Set container user to match host user
```yaml
services:
  metarr:
    user: "1000:1000"  # Replace with your UID:GID
```

Find your UID/GID: `id -u && id -g`

**Solution 2**: Adjust directory permissions on host
```bash
sudo chown -R 1000:1000 ./data ./logs
```

### Path Mapping Not Working

**Symptoms**:
- Webhooks fail to find files
- Scans don't discover media
- Publishing doesn't create assets

**Solution**:
1. Verify volume mounts in `docker-compose.yml`
2. Configure path mappings in Metarr UI (Settings → Libraries)
3. Test with manual scan

See [Troubleshooting Guide](../operations/TROUBLESHOOTING.md#path-mapping-issues).

### Database Locked

**Problem**: SQLite database locked errors

**Solution**:
- Ensure only one Metarr container running
- Don't access database from multiple processes
- Consider PostgreSQL for high concurrency

### Out of Memory

**Problem**: Container killed by OOM

**Solution**: Increase Docker memory limit
```yaml
services:
  metarr:
    mem_limit: 2g
    memswap_limit: 2g
```

---

## Updating Metarr

### Update Process

```bash
# Pull latest image
docker-compose pull

# Recreate container with new image
docker-compose up -d

# Verify
docker-compose logs -f
```

**Automatic updates**: Use [Watchtower](https://github.com/containrrr/watchtower) or similar.

### Rollback

```bash
# Stop current version
docker-compose down

# Edit docker-compose.yml to specify older version
# image: metarr/metarr:v1.2.3

# Start with old version
docker-compose up -d
```

---

## Next Steps

1. **[Configure Metarr](CONFIGURATION.md)** - Set up providers and libraries
2. **[First Run Guide](FIRST_RUN.md)** - Initial setup walkthrough
3. **[Backup Strategy](../operations/BACKUP_RECOVERY.md)** - Protect your data

## See Also

- [Performance Optimization](../operations/PERFORMANCE.md)
- [Security Best Practices](../operations/SECURITY.md)
- [Monitoring Setup](../operations/MONITORING.md)
