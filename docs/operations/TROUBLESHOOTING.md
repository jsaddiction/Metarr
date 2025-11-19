# Troubleshooting Guide

**Purpose**: Decision tree troubleshooting by symptom with diagnosis steps and solutions.

**Related Docs**:
- Parent: [Operations](../INDEX.md#operations)
- See also: [Configuration](../getting-started/CONFIGURATION.md), [Performance](PERFORMANCE.md), [Monitoring](MONITORING.md)

## Quick Reference

- **Logs location**: `./logs/app-YYYY-MM-DD.log` and `./logs/error-YYYY-MM-DD.log`
- **Database location**: `./data/metarr.sqlite` (default)
- **Check Docker logs**: `docker-compose logs -f metarr`
- **Health check endpoint**: `GET /api/health`

---

## Application Won't Start

### Symptom: Process exits immediately

**Diagnosis**:
```bash
# Check logs
tail -f logs/error-*.log

# Check port availability
netstat -tuln | grep 3000  # Linux/Mac
netstat -an | findstr 3000  # Windows
```

**Common causes**:

#### Port Already in Use
**Solution**:
```env
# Change port in .env or environment
PORT=3001
```
Or stop conflicting process:
```bash
# Find process using port 3000
lsof -i :3000  # Linux/Mac
netstat -ano | findstr :3000  # Windows (note PID)
kill <PID>
```

#### Database Connection Failed
**Solution**:
- **SQLite**: Ensure `./data/` directory exists and is writable
- **PostgreSQL**: Verify `DATABASE_URL` and database server is running
```bash
# Test PostgreSQL connection
psql "postgresql://user:pass@localhost:5432/metarr" -c "SELECT 1"
```

#### Missing Dependencies
**Solution**:
```bash
rm -rf node_modules package-lock.json
npm install
```

### Symptom: Application starts but crashes during operation

**Diagnosis**:
```bash
# Check error logs
tail -100 logs/error-*.log

# Check memory usage
docker stats metarr  # Docker
top  # Linux/Mac
taskmgr  # Windows
```

**Common causes**:

#### Out of Memory
**Solution**:
- Reduce worker count: `JOB_QUEUE_WORKERS=3`
- Increase system memory
- Docker: Set memory limit `mem_limit: 2g`

#### Database Locked
**Solution**:
- Ensure only one Metarr instance running
- SQLite: Enable WAL mode: `DB_ENABLE_WAL=true`
- Consider PostgreSQL for high concurrency

---

## Scan Issues

### Symptom: Scan doesn't find any files

**Diagnosis**:
```bash
# Check library path exists
ls -la /path/to/library  # Linux/Mac
dir "C:\path\to\library"  # Windows

# Docker: Check path inside container
docker exec metarr ls -la /media
```

**Common causes**:

#### Path Doesn't Exist
**Solution**:
1. Verify library path in Settings → Libraries
2. Docker: Check volume mount in `docker-compose.yml`
3. Correct path and re-scan

#### Permission Denied
**Solution**:
```bash
# Check permissions
ls -la /path/to/library

# Fix permissions (Linux)
sudo chown -R $USER:$USER /path/to/library

# Docker: Match container user to host user
# In docker-compose.yml:
user: "1000:1000"  # Your UID:GID
```

#### Path Mapping Issue (Docker/Remote)
**Solution**:
1. Settings → Libraries → Edit library
2. Configure path mapping:
   - **External path**: Path from webhook/manager (e.g., `/mnt/storage/movies`)
   - **Internal path**: Path Metarr sees (e.g., `/media/movies`)
3. Save and re-scan

**Test path mapping**:
```bash
# Verify mapping in logs
grep "path mapping" logs/app-*.log
```

### Symptom: Scan finds files but doesn't identify them

**Diagnosis**:
- Check filename format in library browser
- Review scan logs for parsing errors

**Common causes**:

#### Poor Filename Format
**Solution**:
Use standard format: `Movie Title (Year).ext`

**Examples**:
- Good: `The Matrix (1999).mkv`
- Good: `Inception (2010).mp4`
- Bad: `matrix_movie.mkv` (missing year)
- Bad: `inception.avi` (missing year)

#### Files Are Extras/Samples
**Solution**: Metarr skips:
- Files < 100MB (configurable)
- Files in `-sample`, `-trailer` directories
- Files matching exclude patterns

### Symptom: Scan is very slow

**Diagnosis**:
```bash
# Check system resources
top  # Linux/Mac

# Check logs for bottlenecks
grep "Scanning" logs/app-*.log
```

**Solutions**:
1. Reduce concurrent operations:
   - `JOB_QUEUE_WORKERS=3`
2. Network storage: Check network speed
3. Large library: Enable WAL mode for SQLite or use PostgreSQL
4. See [Performance Guide](PERFORMANCE.md)

---

## Enrichment Issues

### Symptom: Enrichment fails with API errors

**Diagnosis**:
```bash
# Check error logs
grep -i "api\|provider" logs/error-*.log

# Check provider status
# Settings → Providers → Test connection
```

**Common causes**:

#### Invalid API Keys
**Solution**:
1. Verify API key in `.env` or Settings → Providers
2. Test key at provider dashboard:
   - TMDB: https://www.themoviedb.org/settings/api
   - TVDB: https://thetvdb.com/dashboard/account/apikeys
3. Regenerate key if invalid
4. Restart Metarr after changing `.env`

#### Rate Limit Exceeded
**Solution**:
```env
# Reduce rate limits
TMDB_RATE_LIMIT=2
TVDB_RATE_LIMIT=2
FANART_RATE_LIMIT=1
```
Wait 10-15 minutes and retry.

#### Network Connection Issues
**Solution**:
```bash
# Test connectivity
curl https://api.themoviedb.org/3/movie/550?api_key=YOUR_KEY

# Docker: Ensure container has internet access
docker exec metarr ping -c 3 api.themoviedb.org
```

### Symptom: No assets found during enrichment

**Diagnosis**:
- Check item detail → Assets tab
- Review enrichment job logs

**Common causes**:

#### Incorrect Metadata Match
**Solution**:
1. Item detail → Metadata tab
2. Click **Search** button
3. Enter correct title or TMDB/TVDB ID
4. Select correct match
5. Re-enrich

#### Provider Disabled
**Solution**:
1. Settings → Providers
2. Ensure TMDB, TVDB, Fanart.tv enabled
3. Check provider priority order

#### Asset Type Not Available
**Solution**: Some providers don't have all asset types
- TMDB: poster, backdrop (limited)
- TVDB: posters, fanart, season posters
- Fanart.tv: clearlogo, discart, clearart (comprehensive)

### Symptom: Enrichment stuck/never completes

**Diagnosis**:
```bash
# Check job queue status
# UI: Jobs page

# Check logs
tail -f logs/app-*.log | grep -i enrichment
```

**Solutions**:
1. Check job queue health (Jobs page)
2. Restart job queue (Settings → System → Restart Queue)
3. Check for circuit breaker trips:
   ```bash
   grep "circuit breaker" logs/error-*.log
   ```
4. Increase timeout: `PROVIDER_REQUEST_TIMEOUT=30000`

---

## Publishing Issues

### Symptom: Publishing doesn't create files

**Diagnosis**:
```bash
# Check media directory
ls -la /path/to/movie/

# Check logs
grep -i "publish" logs/error-*.log
```

**Common causes**:

#### Permission Denied
**Solution**:
```bash
# Check write permissions
touch /path/to/movie/test.txt
rm /path/to/movie/test.txt

# Docker: Fix permissions
sudo chown -R 1000:1000 /path/to/media
# Or match container user to host user
```

#### No Assets Selected
**Solution**:
1. Item detail → Assets tab
2. Verify assets are selected (checkmark icon)
3. If not, select assets manually
4. Re-publish

#### Field Locked
**Solution**:
1. Item detail → Metadata tab
2. Check for lock icons on fields
3. Unlock fields if changes desired
4. Re-publish

See [Field Locking](../architecture/ASSET_MANAGEMENT/FIELD_LOCKING.md)

### Symptom: Publishing creates files but player doesn't see them

**Diagnosis**:
```bash
# Verify files exist
ls -la /path/to/movie/*poster* *fanart*

# Check naming convention
# Should be: movie-poster.jpg, movie-fanart.jpg
```

**Common causes**:

#### Incorrect Naming
**Solution**: Metarr uses Kodi naming by default. Verify files:
- `movie-poster.jpg`
- `movie-fanart.jpg`
- `movie.nfo`

#### Player Not Configured for Local Metadata
**Solution**:

**Kodi**:
1. Settings → Media → Videos
2. Enable "Use local information only" OR
3. Set local information priority higher

**Jellyfin**:
1. Dashboard → Libraries → [Library] → Manage Library
2. **NFO settings** → Enable NFO metadata
3. **Image settings** → Enable local images
4. Scan library

**Plex**:
1. Library settings → Advanced
2. Enable "Prefer local metadata"
3. Refresh metadata (not scan)

#### Player Cache
**Solution**: Clear player metadata cache and re-scan
- Kodi: Delete `userdata/Thumbnails/`
- Jellyfin: Dashboard → Scheduled Tasks → Scan Library
- Plex: Plex Dance (remove and re-add library)

---

## Player Sync Issues

### Symptom: Player connection test fails

**Diagnosis**:
```bash
# Test connection manually
# Kodi:
curl -u username:password http://192.168.1.100:8080/jsonrpc \
  -d '{"jsonrpc":"2.0","method":"JSONRPC.Ping","id":1}'

# Jellyfin:
curl http://192.168.1.100:8096/System/Info/Public
```

**Common causes**:

#### Incorrect URL/Credentials
**Solution**:
1. Settings → Players → Edit player
2. Verify:
   - URL includes protocol: `http://` or `https://`
   - Port is correct (Kodi: 8080, Jellyfin: 8096)
   - Credentials are correct
3. Test connection

#### Network Issues
**Solution**:
- Verify Metarr can reach player (ping, telnet)
- Check firewall rules
- Docker: Ensure network mode allows host access

#### Player API Disabled
**Solution**:

**Kodi**:
1. Settings → Services → Control
2. Enable "Allow remote control via HTTP"
3. Set username/password

**Jellyfin**:
1. Dashboard → API Keys
2. Create API key for Metarr
3. Use API key in Metarr config

---

## WebSocket Issues

### Symptom: Real-time updates not working

**Diagnosis**:
```bash
# Check browser console (F12)
# Should see WebSocket connection

# Check server logs
grep -i websocket logs/app-*.log
```

**Common causes**:

#### Reverse Proxy Not Configured for WebSockets
**Solution**:

**Nginx**: Add to location block:
```nginx
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
```

**Traefik**: Supports WebSockets by default (no config needed)

#### Browser Extension Blocking
**Solution**:
- Disable ad blockers for Metarr domain
- Try incognito/private browsing mode

#### HTTPS/WSS Mismatch
**Solution**:
- HTTP → WS (unencrypted)
- HTTPS → WSS (encrypted)
- Ensure consistent protocol

---

## Database Issues

### Symptom: Database locked errors

**Diagnosis**:
```bash
# Check for multiple Metarr instances
ps aux | grep metarr  # Linux/Mac
tasklist | findstr node  # Windows

# Check SQLite file
lsof data/metarr.sqlite  # Linux/Mac
```

**Solutions**:

#### Multiple Instances Running
**Solution**:
```bash
# Stop all instances
pkill -f metarr

# Start single instance
npm run dev:all
```

#### SQLite Concurrency Limit
**Solution**:
1. Enable WAL mode: `DB_ENABLE_WAL=true`
2. Or migrate to PostgreSQL for high concurrency:
```env
DB_TYPE=postgres
DATABASE_URL=postgresql://user:pass@localhost:5432/metarr
```

### Symptom: Database corruption

**Diagnosis**:
```bash
# SQLite integrity check
sqlite3 data/metarr.sqlite "PRAGMA integrity_check;"
```

**Solutions**:

#### Restore from Backup
**Solution**: See [Backup & Recovery](BACKUP_RECOVERY.md)

#### Repair SQLite Database
**Solution**:
```bash
# Backup first
cp data/metarr.sqlite data/metarr.sqlite.backup

# Attempt repair
sqlite3 data/metarr.sqlite "VACUUM;"
sqlite3 data/metarr.sqlite "REINDEX;"
```

---

## Performance Issues

### Symptom: Slow response times

**Diagnosis**:
```bash
# Check resource usage
top  # Linux/Mac
docker stats metarr  # Docker

# Check database size
du -sh data/metarr.sqlite

# Check cache size
du -sh data/cache/
```

**Solutions**:
1. See [Performance Guide](PERFORMANCE.md) for comprehensive tuning
2. Quick wins:
   - Reduce worker count: `JOB_QUEUE_WORKERS=5`
   - Enable database WAL mode
   - PostgreSQL for large libraries
   - Increase system resources

### Symptom: High memory usage

**Diagnosis**:
```bash
# Check memory
free -h  # Linux
docker stats metarr  # Docker
```

**Solutions**:
```env
# Reduce concurrent operations
JOB_QUEUE_WORKERS=3
ASSET_MAX_CONCURRENT_DOWNLOADS=3

# Docker: Set memory limit
mem_limit: 1g
```

---

## Common Error Messages

### "EACCES: permission denied"

**Cause**: Metarr doesn't have required permissions

**Solution**:
1. Check file/directory ownership
2. Fix permissions:
   ```bash
   sudo chown -R $USER:$USER /path/to/directory
   ```
3. Docker: Match container user to host user

### "ENOENT: no such file or directory"

**Cause**: Path doesn't exist or path mapping incorrect

**Solution**:
1. Verify path exists
2. Check path mapping (Docker/remote setups)
3. Use absolute paths in configuration

### "ETIMEDOUT" / "ECONNREFUSED"

**Cause**: Network connectivity issue

**Solution**:
1. Check internet connection
2. Verify firewall rules
3. Docker: Check container network mode
4. Test provider endpoints manually

### "Database is locked"

**Cause**: SQLite concurrency limit or multiple instances

**Solution**:
1. Ensure single Metarr instance running
2. Enable WAL mode: `DB_ENABLE_WAL=true`
3. Consider PostgreSQL for high concurrency

---

## Getting Help

### Before Asking for Help

**Gather information**:
1. **Logs**: Last 50-100 lines from `error-*.log`
2. **Configuration**: Environment variables (redact API keys)
3. **System info**: OS, Node.js version, Docker version
4. **Steps to reproduce**: Exact steps that cause issue

### Support Channels

1. **GitHub Issues**: https://github.com/yourusername/metarr/issues
   - Bug reports
   - Feature requests
   - Technical issues

2. **Discord**: https://discord.gg/metarr
   - Community support
   - Real-time help
   - General questions

3. **Documentation**: Check related docs:
   - [Configuration Guide](../getting-started/CONFIGURATION.md)
   - [Performance Guide](PERFORMANCE.md)
   - [Phase Documentation](../phases/OVERVIEW.md)

### Log Sanitization

**Before sharing logs**, remove sensitive data:
```bash
# Replace API keys
sed 's/api_key=[^&]*/api_key=REDACTED/g' logs/error-*.log

# Replace paths with sensitive info
sed 's/\/home\/username/\/home\/USER/g' logs/error-*.log
```

---

## See Also

- [Performance Optimization](PERFORMANCE.md) - Tuning guide
- [Monitoring Setup](MONITORING.md) - Log monitoring and metrics
- [Backup & Recovery](BACKUP_RECOVERY.md) - Data protection
- [Configuration Guide](../getting-started/CONFIGURATION.md) - Settings reference
