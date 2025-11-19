# Performance Optimization

**Purpose**: Comprehensive guide for tuning Metarr performance across different deployment scales.

**Related Docs**:
- Parent: [Operations](../INDEX.md#operations)
- See also: [Configuration](../getting-started/CONFIGURATION.md), [Troubleshooting](TROUBLESHOOTING.md)

## Quick Reference

- **Database choice matters**: SQLite for <10k items, PostgreSQL for larger
- **Worker tuning**: Match to CPU cores (but don't exceed)
- **Rate limiting**: Balance between speed and provider limits
- **Memory**: Plan 1-2GB base + 500MB per 5 concurrent jobs
- **Network storage**: Critical bottleneck for large libraries

---

## Performance Factors

### Primary Bottlenecks

1. **Database I/O** - Queries, writes, concurrent access
2. **Network bandwidth** - Provider API calls, asset downloads
3. **Disk I/O** - Cache writes, asset copying, scanning
4. **CPU** - Image processing, job queue workers
5. **Memory** - Worker processes, database cache

### Optimization Priority

**High impact, low effort**:
1. Enable SQLite WAL mode
2. Tune worker count to CPU cores
3. Adjust rate limits for API keys

**High impact, medium effort**:
1. Migrate to PostgreSQL (large libraries)
2. Optimize database pool size
3. Network storage tuning

**Medium impact, high effort**:
1. SSD for cache storage
2. Dedicated database server
3. Load balancing (future)

---

## Database Optimization

### SQLite Tuning

**When to use**: Libraries < 10,000 items, low concurrency

**Essential settings**:
```env
DB_ENABLE_WAL=true           # Write-Ahead Logging (critical!)
DB_QUERY_TIMEOUT=30000       # 30 seconds (default)
DB_POOL_SIZE=5               # Connection pool (SQLite uses 1)
```

**WAL Mode Benefits**:
- Concurrent reads while writing
- Better crash recovery
- Faster writes
- Essential for multi-worker operation

**SQLite Limits**:
- Single writer at a time
- Performance degrades >10k items
- High concurrent webhook traffic problematic

**Manual optimization**:
```bash
# Vacuum database (reclaim space)
sqlite3 data/metarr.sqlite "VACUUM;"

# Analyze for query optimization
sqlite3 data/metarr.sqlite "ANALYZE;"

# Check integrity
sqlite3 data/metarr.sqlite "PRAGMA integrity_check;"
```

### PostgreSQL Migration

**When to migrate**:
- Library > 10,000 items
- High webhook traffic (many concurrent downloads)
- Multiple users accessing simultaneously
- Experiencing SQLite lock errors

**Setup**:
```env
DB_TYPE=postgres
DATABASE_URL=postgresql://metarr:password@localhost:5432/metarr
DB_POOL_SIZE=10              # Increase for concurrency
DB_QUERY_TIMEOUT=30000
```

**PostgreSQL advantages**:
- Multiple concurrent writers
- Better query optimization
- Scales to millions of items
- Advanced indexing options

**PostgreSQL tuning** (postgresql.conf):
```ini
# Memory
shared_buffers = 256MB           # 25% of RAM
effective_cache_size = 1GB       # 50-75% of RAM
work_mem = 16MB                  # Per operation

# Connections
max_connections = 50

# Performance
random_page_cost = 1.1           # SSD (4.0 for HDD)
effective_io_concurrency = 200   # SSD (2 for HDD)

# Autovacuum
autovacuum = on
```

**Migration procedure**:
```bash
# 1. Backup SQLite database
cp data/metarr.sqlite data/metarr.sqlite.backup

# 2. Export data (future: migration script)
# Currently requires manual migration

# 3. Update .env
DB_TYPE=postgres
DATABASE_URL=postgresql://metarr:password@localhost:5432/metarr

# 4. Restart Metarr (migrations run automatically)
```

---

## Job Queue Tuning

### Worker Count Optimization

**Formula**: Workers = CPU cores - 1 (leave one for system)

**Presets**:

**Small server** (2-4 cores, 4GB RAM):
```env
JOB_QUEUE_WORKERS=3
ASSET_MAX_CONCURRENT_DOWNLOADS=3
DB_POOL_SIZE=3
```

**Medium server** (4-8 cores, 8GB RAM):
```env
JOB_QUEUE_WORKERS=8
ASSET_MAX_CONCURRENT_DOWNLOADS=8
DB_POOL_SIZE=8
```

**Large server** (8+ cores, 16GB RAM):
```env
JOB_QUEUE_WORKERS=15
ASSET_MAX_CONCURRENT_DOWNLOADS=10
DB_POOL_SIZE=10
```

**Considerations**:
- More workers = more memory usage
- Network-bound tasks: Can exceed CPU count
- Database-bound tasks: Match database pool size

### Queue Configuration

```env
JOB_QUEUE_POLL_INTERVAL=1000           # Poll frequency (ms)
JOB_QUEUE_MAX_FAILURES=5               # Circuit breaker threshold
JOB_QUEUE_CIRCUIT_RESET_DELAY=60000    # Circuit reset delay (ms)
```

**Poll interval**:
- Lower (500ms) = more responsive, higher CPU
- Higher (2000ms) = lower CPU, less responsive
- 1000ms balanced for most cases

**Circuit breaker**:
- Prevents runaway failures
- Pauses queue after repeated failures
- Auto-resets after delay

---

## Provider Rate Limiting

### Rate Limit Configuration

```env
TMDB_RATE_LIMIT=4         # Requests per second
TVDB_RATE_LIMIT=4         # Requests per second
FANART_RATE_LIMIT=2       # Requests per second (strict!)
PROVIDER_REQUEST_TIMEOUT=10000
PROVIDER_MAX_RETRIES=3
```

### Tuning Strategy

**With embedded API keys** (shared):
- Use conservative defaults
- Expect occasional rate limit errors
- Automatic retry with backoff

**With personal API keys**:
- TMDB: Up to 40 requests/second (official limit: 50)
- TVDB: Up to 20 requests/second
- Fanart.tv: Keep at 2 (very strict)

**Balance**:
- Too low: Slow enrichment
- Too high: Rate limit errors, API bans

**Monitoring**:
```bash
# Check for rate limit errors
grep "rate limit" logs/error-*.log

# Count provider requests
grep "provider request" logs/app-*.log | wc -l
```

### Request Timeout

```env
PROVIDER_REQUEST_TIMEOUT=10000  # 10 seconds
```

**Tuning**:
- Slow network: Increase to 15000-30000ms
- Fast network: Can reduce to 5000ms
- Affects enrichment job duration

---

## Asset Processing Optimization

### Concurrent Downloads

```env
ASSET_MAX_CONCURRENT_DOWNLOADS=5    # Parallel downloads per job
ASSET_MAX_SIZE=52428800             # 50MB max file size
IMAGE_PROCESSING_TIMEOUT=30000      # Image analysis timeout
```

**Tuning downloads**:
- Match or exceed worker count
- Network bandwidth limit: Reduce if saturating connection
- Fast network: Increase to 10-15

**Image processing**:
- CPU-intensive (Sharp library)
- Timeout prevents hanging jobs
- Increase for slow CPUs: 60000ms

### Cache Storage

**Storage type matters**:
- **SSD**: 10x faster than HDD for random I/O
- **HDD**: Acceptable for large sequential operations
- **Network storage**: Major bottleneck (see below)

**Cache sizing**:
- ~2-5GB per 1000 movies
- Plan accordingly for library size
- SSD recommended for cache directory

---

## Network Storage Optimization

### Critical for NAS/SMB/NFS

**Problem**: Network latency + overhead = slow operations

**Symptoms**:
- Slow scans (file enumeration)
- Slow publishing (file writes)
- Timeout errors

**Solutions**:

#### 1. Use Local Cache

**Store cache locally, library on network**:
```env
CACHE_PATH=/var/local/metarr/cache     # Local SSD
LIBRARY_PATH=/mnt/nas/media            # Network storage
```

**Benefits**:
- Fast asset downloads (writes to local SSD)
- Publishing still network-bound but optimized

#### 2. NFS Tuning (Linux)

**Mount options** (fstab or mount command):
```
nas:/export/media /mnt/media nfs rsize=32768,wsize=32768,hard,intr,noatime 0 0
```

**Tuning**:
- `rsize/wsize=32768`: Larger read/write buffers
- `hard`: Retry on failure (vs soft)
- `noatime`: Don't update access times (faster)

#### 3. SMB/CIFS Tuning (Windows/Mixed)

**Mount options**:
```
//nas/media /mnt/media cifs credentials=/etc/smb-cred,vers=3.0,cache=loose,rsize=130048,wsize=130048 0 0
```

**Tuning**:
- `vers=3.0`: Use SMB3 for performance
- `cache=loose`: Aggressive caching
- Large rsize/wsize buffers

#### 4. Reduce Scan Frequency

**For network libraries**:
- Don't scan on every webhook
- Use scheduled scans (daily/weekly)
- Enable path mapping for targeted scans

---

## Memory Management

### Memory Requirements

**Base**: 500MB - 1GB (Node.js + Express)

**Per worker**: ~100-200MB during active job

**Database cache**:
- SQLite: Minimal (~50MB)
- PostgreSQL: Depends on `shared_buffers` setting

**Example calculation** (8 workers):
- Base: 1GB
- Workers: 8 × 150MB = 1.2GB
- Database: 200MB
- **Total**: ~2.5GB

### Memory Limits

**Docker**:
```yaml
services:
  metarr:
    mem_limit: 2g
    memswap_limit: 2g
```

**Node.js**:
```env
NODE_OPTIONS=--max-old-space-size=2048  # 2GB heap
```

**Monitoring**:
```bash
# Docker
docker stats metarr

# Linux
top
ps aux | grep metarr

# Inside container
node -e "console.log(process.memoryUsage())"
```

---

## Large Library Strategies

### Libraries > 10,000 Items

**Required optimizations**:
1. **PostgreSQL database** (essential)
2. **Increase worker count** (10-15)
3. **SSD for cache** (highly recommended)
4. **Dedicated database server** (optional)

**Configuration**:
```env
# Database
DB_TYPE=postgres
DATABASE_URL=postgresql://metarr:password@localhost:5432/metarr
DB_POOL_SIZE=15

# Workers
JOB_QUEUE_WORKERS=15
ASSET_MAX_CONCURRENT_DOWNLOADS=10

# Timeouts
DB_QUERY_TIMEOUT=60000
PROVIDER_REQUEST_TIMEOUT=15000
```

### Incremental Processing

**Batch operations**:
- Enrich library in chunks (1000 items at a time)
- Schedule intensive operations during low-usage periods
- Use job priority system (future feature)

**Monitoring progress**:
- Jobs page shows queue status
- WebSocket updates for real-time feedback
- Logs track completion

---

## Monitoring Performance

### Key Metrics

**Database**:
```bash
# SQLite database size
du -sh data/metarr.sqlite

# PostgreSQL stats
psql -d metarr -c "SELECT * FROM pg_stat_database WHERE datname='metarr';"
```

**Cache**:
```bash
# Cache size
du -sh data/cache/

# File count
find data/cache -type f | wc -l
```

**Job queue**:
- Jobs page in UI
- Shows active, pending, failed jobs
- Queue health indicator

**System resources**:
```bash
# CPU and memory
top
htop

# Disk I/O
iostat -x 1

# Network
iftop
nethogs
```

### Performance Benchmarks

**Expected scan times** (SSD, 8 workers):
- 1,000 movies: 2-5 minutes
- 5,000 movies: 10-20 minutes
- 10,000 movies: 20-40 minutes

**Expected enrichment times** (per item):
- Metadata fetch: 2-5 seconds
- Asset fetch: 5-15 seconds
- Total per movie: 10-30 seconds

**Factors affecting speed**:
- Network latency to providers
- Database type and tuning
- Disk speed (cache writes)
- Worker count

---

## Troubleshooting Performance Issues

### Slow Database Queries

**Diagnosis**:
```bash
# Enable query logging (PostgreSQL)
# postgresql.conf:
log_min_duration_statement = 1000  # Log queries > 1 second

# Check slow queries
grep "duration:" /var/log/postgresql/postgresql.log
```

**Solutions**:
1. Run `ANALYZE` (PostgreSQL) or `ANALYZE` (SQLite)
2. Check for missing indexes (contact support)
3. Increase database resources

### High CPU Usage

**Diagnosis**:
```bash
top
# Check which processes consuming CPU
```

**Solutions**:
1. Reduce worker count
2. Reduce concurrent downloads
3. Check for runaway jobs (Jobs page)

### High Memory Usage

**Solutions**:
1. Reduce worker count
2. Set Node.js memory limit
3. Check for memory leaks (restart if persistent)

### Disk I/O Bottleneck

**Diagnosis**:
```bash
iostat -x 1
# Check %util column (>80% = bottleneck)
```

**Solutions**:
1. Move cache to SSD
2. Reduce concurrent operations
3. Use local storage for cache (not network)

---

## See Also

- [Configuration Guide](../getting-started/CONFIGURATION.md) - Settings reference
- [Troubleshooting](TROUBLESHOOTING.md) - Common issues
- [Monitoring](MONITORING.md) - Metrics and logging
- [Database Schema](../architecture/DATABASE.md) - Database structure
