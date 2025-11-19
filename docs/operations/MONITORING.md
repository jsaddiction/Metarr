# Monitoring and Logging

**Purpose**: Guide for monitoring Metarr health, analyzing logs, and setting up alerts.

**Related Docs**:
- Parent: [Operations](../INDEX.md#operations)
- See also: [Troubleshooting](TROUBLESHOOTING.md), [Performance](PERFORMANCE.md), [Configuration](../getting-started/CONFIGURATION.md)

## Quick Reference

- **Log location**: `./logs/app-YYYY-MM-DD.log` and `./logs/error-YYYY-MM-DD.log`
- **Log format**: JSON-structured with timestamps
- **Health endpoint**: `GET /api/health`
- **WebSocket stats**: Real-time system metrics via WebSocket connection
- **Log levels**: debug, info, warn, error

---

## Logging System

### Log Files

**Application logs** (`app-YYYY-MM-DD.log`):
- All operations (info level and above)
- Request/response logs
- Phase execution progress
- Job queue activity
- Daily rotation

**Error logs** (`error-YYYY-MM-DD.log`):
- Errors and warnings only
- Stack traces
- Failed operations
- Daily rotation

**Location**: `./logs/` directory (configurable)

### Log Configuration

**Environment variables**:
```env
LOG_LEVEL=info              # debug, info, warn, error
LOG_TO_FILE=true            # Enable file logging
LOG_MAX_FILES=7             # Days to retain logs
LOG_MAX_SIZE=10m            # Max file size before rotation
```

**Log levels explained**:
- **debug**: Verbose logging (development only)
- **info**: Normal operations (default, recommended)
- **warn**: Warnings that don't stop operations
- **error**: Errors requiring attention

### Log Format

**Structured JSON** (easy to parse):
```json
{
  "level": "info",
  "message": "Scanning library",
  "timestamp": "2024-11-19T14:30:00.000Z",
  "service": "libraryService",
  "libraryId": 1,
  "libraryPath": "/media/movies"
}
```

**Benefits**:
- Machine-readable
- Easy filtering
- Log aggregation friendly
- Includes context (IDs, paths)

---

## Viewing Logs

### Command Line

**Linux/Mac**:
```bash
# Tail application logs
tail -f logs/app-$(date +%Y-%m-%d).log

# Tail error logs
tail -f logs/error-$(date +%Y-%m-%d).log

# Follow both
tail -f logs/app-*.log logs/error-*.log
```

**Windows PowerShell**:
```powershell
# Tail application logs
Get-Content logs\app-$(Get-Date -Format yyyy-MM-dd).log -Tail 50 -Wait

# Tail error logs
Get-Content logs\error-$(Get-Date -Format yyyy-MM-dd).log -Tail 50 -Wait
```

**Docker**:
```bash
# Container logs (stdout/stderr)
docker-compose logs -f metarr

# Application log files
docker exec metarr tail -f /app/logs/app-*.log
```

### Filtering Logs

**Grep for specific events**:
```bash
# Scan operations
grep "Scanning" logs/app-*.log

# Enrichment operations
grep "Enrichment" logs/app-*.log

# Errors only
grep '"level":"error"' logs/error-*.log

# Specific library
grep '"libraryId":1' logs/app-*.log

# Provider API calls
grep "TMDB\|TVDB\|Fanart" logs/app-*.log
```

**jq for structured querying** (JSON parsing):
```bash
# Install jq first: apt install jq / brew install jq

# Extract error messages
cat logs/error-*.log | jq -r '.message'

# Filter by level
cat logs/app-*.log | jq 'select(.level=="error")'

# Filter by service
cat logs/app-*.log | jq 'select(.service=="enrichmentService")'

# Count events
cat logs/app-*.log | jq -r '.message' | sort | uniq -c | sort -rn
```

---

## Health Monitoring

### Health Check Endpoint

**Endpoint**: `GET /api/health`

**Response** (healthy):
```json
{
  "status": "healthy",
  "timestamp": "2024-11-19T14:30:00.000Z",
  "uptime": 86400,
  "database": "connected",
  "jobQueue": "running"
}
```

**Response** (unhealthy):
```json
{
  "status": "unhealthy",
  "timestamp": "2024-11-19T14:30:00.000Z",
  "uptime": 86400,
  "database": "disconnected",
  "jobQueue": "stopped",
  "errors": ["Database connection failed"]
}
```

**Usage**:
```bash
# Check health
curl http://localhost:3000/api/health

# Monitor health (every 10 seconds)
watch -n 10 curl -s http://localhost:3000/api/health | jq
```

### System Stats (WebSocket)

**Real-time metrics** via WebSocket:
- CPU usage (future)
- Memory usage (future)
- Job queue status
- Active workers
- Database connections

**Connection**: Automatic in web interface

**Manual subscription**:
```javascript
const ws = new WebSocket('ws://localhost:3000');
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'stats') {
    console.log('System stats:', data.payload);
  }
};
```

---

## Metrics to Monitor

### Application Metrics

**Job queue**:
- Active jobs count
- Pending jobs count
- Failed jobs count
- Average job duration

**Where**: Jobs page in UI, or query database:
```sql
SELECT status, COUNT(*) FROM jobs GROUP BY status;
```

**Database**:
- Connection pool utilization
- Query performance (slow queries)
- Database size growth

**Where**: Logs (debug level) or database admin tools

**Provider API**:
- Request counts per provider
- Rate limit errors
- Average response times

**Where**: Grep logs for provider names

### System Metrics

**Disk usage**:
```bash
# Cache size
du -sh data/cache/

# Database size
du -sh data/metarr.sqlite

# Total data directory
du -sh data/
```

**Memory usage**:
```bash
# Docker
docker stats metarr --no-stream

# Linux
ps aux | grep metarr

# Memory breakdown
node -e "console.log(process.memoryUsage())"
```

**CPU usage**:
```bash
# Docker
docker stats metarr --no-stream

# Linux
top -p $(pgrep -f metarr)
```

**Network**:
```bash
# Network traffic (Docker)
docker stats metarr --no-stream --format "table {{.Container}}\t{{.NetIO}}"

# Bandwidth usage (iftop, nethogs)
sudo iftop -i eth0
sudo nethogs eth0
```

---

## Log Analysis Patterns

### Common Searches

**Find errors**:
```bash
# All errors today
grep '"level":"error"' logs/error-$(date +%Y-%m-%d).log

# Errors by service
grep '"level":"error"' logs/error-*.log | jq -r .service | sort | uniq -c

# Recent errors (last 10)
tail -10 logs/error-*.log | jq .
```

**Track operations**:
```bash
# Scan operations
grep "Scanning library" logs/app-*.log

# Enrichment operations
grep "Enriching movie" logs/app-*.log

# Publishing operations
grep "Publishing assets" logs/app-*.log
```

**Performance analysis**:
```bash
# Slow operations (duration > 10s)
grep '"duration"' logs/app-*.log | jq 'select(.duration > 10000)'

# Average enrichment time
grep "Enrichment completed" logs/app-*.log | jq .duration | awk '{sum+=$1; count++} END {print sum/count}'
```

**Provider monitoring**:
```bash
# TMDB requests
grep "TMDB API" logs/app-*.log | wc -l

# Rate limit errors
grep "rate limit" logs/error-*.log

# Provider errors by type
grep "provider" logs/error-*.log | jq -r .provider | sort | uniq -c
```

### Alerting Patterns

**Conditions to alert on**:

1. **Error rate spike**:
   ```bash
   # Alert if >10 errors in last hour
   ERROR_COUNT=$(grep '"level":"error"' logs/error-*.log | \
     jq -r .timestamp | \
     awk -v t=$(date -u -d '1 hour ago' +%s) '{gsub(/[TZ]/," ",$0); if (mktime($0) > t) count++} END {print count}')

   if [ "$ERROR_COUNT" -gt 10 ]; then
     echo "ALERT: High error rate ($ERROR_COUNT errors in last hour)"
   fi
   ```

2. **Database connection failures**:
   ```bash
   # Alert on database connection errors
   grep "database.*connection.*failed" logs/error-*.log | tail -1
   ```

3. **Job queue stuck**:
   ```bash
   # Alert if pending jobs not decreasing
   # (Check job count, compare to 5 minutes ago)
   ```

4. **Disk space low**:
   ```bash
   # Alert if cache directory >90% full
   USAGE=$(df /path/to/data | tail -1 | awk '{print $5}' | sed 's/%//')
   if [ "$USAGE" -gt 90 ]; then
     echo "ALERT: Disk usage high ($USAGE%)"
   fi
   ```

---

## Log Rotation and Retention

### Automatic Rotation

**Winston daily rotate**:
- Rotates daily at midnight
- Compresses old logs (future)
- Deletes logs older than `LOG_MAX_FILES` days

**Configuration**:
```env
LOG_MAX_FILES=7    # Keep 7 days (default)
LOG_MAX_SIZE=10m   # Max 10MB per file
```

### Manual Log Management

**Archive old logs**:
```bash
# Compress logs older than 7 days
find logs -name "*.log" -mtime +7 -exec gzip {} \;

# Delete compressed logs older than 30 days
find logs -name "*.log.gz" -mtime +30 -delete
```

**Backup logs**:
```bash
# Backup logs to archive location
tar czf /backup/metarr-logs-$(date +%Y%m%d).tar.gz logs/
```

---

## Integration with Monitoring Tools

### Prometheus + Grafana (Future)

**Planned metrics endpoint**: `GET /api/metrics`

**Example metrics**:
```
# Job queue
metarr_jobs_active 5
metarr_jobs_pending 23
metarr_jobs_failed_total 2

# Database
metarr_db_connections 3
metarr_db_query_duration_ms{quantile="0.5"} 45

# Provider API
metarr_provider_requests_total{provider="tmdb"} 1234
```

### ELK Stack (Elasticsearch, Logstash, Kibana)

**Logstash configuration**:
```ruby
input {
  file {
    path => "/path/to/metarr/logs/*.log"
    codec => "json"
    type => "metarr"
  }
}

filter {
  if [type] == "metarr" {
    json {
      source => "message"
    }
  }
}

output {
  elasticsearch {
    hosts => ["localhost:9200"]
    index => "metarr-%{+YYYY.MM.dd}"
  }
}
```

**Benefits**:
- Centralized log aggregation
- Full-text search
- Visualization dashboards
- Alerting

### Syslog Integration (Future)

**Planned syslog support**:
```env
SYSLOG_ENABLED=true
SYSLOG_HOST=localhost
SYSLOG_PORT=514
SYSLOG_PROTOCOL=udp
```

**Benefits**:
- Centralized logging
- Integration with existing infrastructure
- Remote log storage

---

## Alerting Strategies

### Email Alerts

**Example script** (cron-based):
```bash
#!/bin/bash
# check-metarr-health.sh

# Check health endpoint
HEALTH=$(curl -s http://localhost:3000/api/health)
STATUS=$(echo $HEALTH | jq -r .status)

if [ "$STATUS" != "healthy" ]; then
  echo "Metarr is unhealthy: $HEALTH" | \
    mail -s "ALERT: Metarr Health Check Failed" admin@example.com
fi

# Check error log for recent errors
ERROR_COUNT=$(grep '"level":"error"' logs/error-$(date +%Y-%m-%d).log | wc -l)
if [ "$ERROR_COUNT" -gt 50 ]; then
  echo "High error rate: $ERROR_COUNT errors today" | \
    mail -s "ALERT: Metarr High Error Rate" admin@example.com
fi
```

**Cron job** (every 15 minutes):
```cron
*/15 * * * * /path/to/check-metarr-health.sh
```

### Webhook Alerts (Discord, Slack)

**Discord webhook**:
```bash
#!/bin/bash
# alert-discord.sh

WEBHOOK_URL="https://discord.com/api/webhooks/..."
MESSAGE="$1"

curl -H "Content-Type: application/json" \
  -d "{\"content\": \"$MESSAGE\"}" \
  $WEBHOOK_URL
```

**Usage**:
```bash
# Send alert
./alert-discord.sh "ALERT: Metarr health check failed"
```

### Monitoring Service Integration

**Uptime monitoring**:
- UptimeRobot (free tier)
- Pingdom
- StatusCake

**Configure**:
- Monitor: `http://your-server:3000/api/health`
- Check interval: 5 minutes
- Alert on: Status != "healthy"

---

## Troubleshooting with Logs

### Debugging Issues

**Enable debug logging**:
```env
LOG_LEVEL=debug
```

**Restart Metarr** to apply

**Warning**: Debug logging is very verbose. Use only for troubleshooting.

### Common Log Patterns

**Scan issues**:
```bash
# Find scan errors
grep "Scanning\|scan" logs/error-*.log

# Check specific library
grep '"libraryId":1' logs/app-*.log | grep -i scan
```

**Enrichment issues**:
```bash
# Provider errors
grep "provider.*error" logs/error-*.log

# Rate limiting
grep "rate limit" logs/error-*.log

# Timeout errors
grep "timeout\|ETIMEDOUT" logs/error-*.log
```

**Publishing issues**:
```bash
# Permission errors
grep "EACCES\|permission" logs/error-*.log

# File not found
grep "ENOENT\|not found" logs/error-*.log
```

See [Troubleshooting Guide](TROUBLESHOOTING.md) for detailed solutions.

---

## Performance Monitoring

### Identifying Bottlenecks

**Slow operations in logs**:
```bash
# Find operations >30 seconds
grep '"duration"' logs/app-*.log | jq 'select(.duration > 30000)'

# Average operation time by type
grep '"operation":"scan"' logs/app-*.log | jq .duration | \
  awk '{sum+=$1; count++} END {print sum/count}'
```

**Database query performance**:
```bash
# Enable slow query logging (PostgreSQL)
# postgresql.conf: log_min_duration_statement = 1000

# Check slow queries
grep "duration:" /var/log/postgresql/postgresql.log
```

**Resource usage trends**:
```bash
# Track memory usage over time
while true; do
  docker stats metarr --no-stream --format "{{.MemUsage}}" >> mem-usage.log
  sleep 60
done

# Plot with gnuplot or graph tool
```

See [Performance Guide](PERFORMANCE.md) for optimization.

---

## Best Practices

### Monitoring Checklist

**Daily**:
- [ ] Check error logs for new issues
- [ ] Verify backups completed
- [ ] Monitor disk space

**Weekly**:
- [ ] Review job queue status
- [ ] Check for failed jobs
- [ ] Analyze error trends
- [ ] Review provider API usage

**Monthly**:
- [ ] Archive old logs
- [ ] Review performance metrics
- [ ] Update alert thresholds
- [ ] Test monitoring alerts

### Log Management

**Do**:
- Keep logs for at least 7 days
- Compress old logs
- Monitor disk space
- Backup logs periodically

**Don't**:
- Run debug logging in production (permanently)
- Ignore repeated errors
- Let logs grow unbounded
- Share logs publicly (may contain sensitive paths)

---

## See Also

- [Troubleshooting Guide](TROUBLESHOOTING.md) - Common issues and solutions
- [Performance Guide](PERFORMANCE.md) - Optimization techniques
- [Backup & Recovery](BACKUP_RECOVERY.md) - Backup strategies
- [Configuration](../getting-started/CONFIGURATION.md) - Log configuration
