# Backup and Recovery

**Purpose**: Comprehensive backup strategies and disaster recovery procedures for Metarr.

**Related Docs**:
- Parent: [Operations](../INDEX.md#operations)
- See also: [Migration Guide](../getting-started/MIGRATION.md), [Configuration](../getting-started/CONFIGURATION.md)

## Quick Reference

- **Critical data**: Database + cache directory (everything in `./data/`)
- **Backup frequency**: Daily incremental, weekly full (minimum)
- **Test restores regularly** - Untested backups are not backups
- **3-2-1 rule**: 3 copies, 2 different media, 1 offsite
- **Recycle bin**: 30-day automatic backup of deleted assets

---

## What to Backup

### Critical (Must Backup)

**1. Database**
- **SQLite**: `./data/metarr.sqlite`
- **PostgreSQL**: Full database dump
- **Contains**: All metadata, asset records, configuration, job history
- **Size**: 100-500MB per 1000 movies

**2. Cache Directory**
- **Location**: `./data/cache/`
- **Contains**: All downloaded assets (content-addressed storage)
- **Size**: 2-5GB per 1000 movies
- **Purpose**: Source of truth for assets, survives library deletions

### Important (Should Backup)

**3. Configuration Files**
- `.env` - Environment variables (redact API keys in backups)
- `docker-compose.yml` - Docker configuration
- Custom config files

**4. Recycle Bin** (Optional)
- **Location**: `./data/recycle/`
- **Contains**: Deleted assets (30-day retention)
- **Purpose**: Recovery from accidental deletions
- **Note**: Auto-purged after 30 days

### Optional (Nice to Have)

**5. Logs**
- **Location**: `./logs/`
- **Contains**: Application and error logs
- **Purpose**: Troubleshooting, audit trail
- **Note**: Rotated automatically, not critical

**6. Media Library Assets** (Published Files)
- **Location**: Your media directories
- **Contains**: Posters, fanart, NFO files deployed by Metarr
- **Note**: Recoverable from cache, not critical if cache backed up

---

## Backup Strategies

### Strategy 1: Simple Daily Backup

**Best for**: Small to medium libraries, home users

**Frequency**: Daily, retain 7 days

**Method**:
```bash
#!/bin/bash
# backup-metarr.sh

BACKUP_DIR="/backup/metarr"
DATE=$(date +%Y%m%d)

# Create backup directory
mkdir -p "$BACKUP_DIR/$DATE"

# Backup data directory (includes database and cache)
rsync -av --delete /path/to/metarr/data/ "$BACKUP_DIR/$DATE/data/"

# Backup configuration
cp /path/to/metarr/.env "$BACKUP_DIR/$DATE/.env"
cp /path/to/metarr/docker-compose.yml "$BACKUP_DIR/$DATE/docker-compose.yml" 2>/dev/null || true

# Remove backups older than 7 days
find "$BACKUP_DIR" -type d -mtime +7 -exec rm -rf {} +

echo "Backup completed: $BACKUP_DIR/$DATE"
```

**Cron job** (daily at 2 AM):
```cron
0 2 * * * /path/to/backup-metarr.sh
```

### Strategy 2: Incremental Backups

**Best for**: Large libraries, limited backup storage

**Frequency**: Daily incremental, weekly full

**Method**:
```bash
#!/bin/bash
# backup-metarr-incremental.sh

BACKUP_DIR="/backup/metarr"
DATE=$(date +%Y%m%d)
DAY_OF_WEEK=$(date +%u)  # 1-7 (Monday-Sunday)

# Full backup on Sunday, incremental otherwise
if [ "$DAY_OF_WEEK" -eq 7 ]; then
    # Full backup
    rsync -av --delete /path/to/metarr/data/ "$BACKUP_DIR/full/$DATE/"
else
    # Incremental backup
    rsync -av --link-dest="$BACKUP_DIR/full/latest" \
        /path/to/metarr/data/ "$BACKUP_DIR/incremental/$DATE/"
fi

# Update latest symlink
ln -sfn "$BACKUP_DIR/full/$DATE" "$BACKUP_DIR/full/latest"

# Retention: 4 weeks full, 14 days incremental
find "$BACKUP_DIR/full" -type d -mtime +28 -exec rm -rf {} +
find "$BACKUP_DIR/incremental" -type d -mtime +14 -exec rm -rf {} +
```

### Strategy 3: Cloud Backup

**Best for**: Offsite protection, critical data

**Frequency**: Daily to cloud storage

**Method** (using rclone):
```bash
#!/bin/bash
# backup-metarr-cloud.sh

REMOTE="backblaze:metarr-backup"  # Configure rclone remote
DATE=$(date +%Y%m%d)

# Backup database (small, fast)
rclone copy /path/to/metarr/data/metarr.sqlite "$REMOTE/database/$DATE/"

# Backup cache (large, can be slow)
rclone sync /path/to/metarr/data/cache/ "$REMOTE/cache/" \
    --exclude "*.tmp" \
    --transfers 8 \
    --checkers 16

# Keep last 30 database backups
rclone delete "$REMOTE/database" --min-age 30d

echo "Cloud backup completed"
```

**Supported cloud providers** (via rclone):
- Backblaze B2
- Amazon S3
- Google Drive
- Dropbox
- OneDrive

---

## Database-Specific Backups

### SQLite Backup

**Method 1: File copy (requires app stop)**
```bash
# Stop Metarr
docker-compose stop metarr  # or: systemctl stop metarr

# Copy database
cp /path/to/metarr/data/metarr.sqlite /backup/metarr-$(date +%Y%m%d).sqlite

# Start Metarr
docker-compose start metarr
```

**Method 2: Online backup (no downtime)**
```bash
sqlite3 /path/to/metarr/data/metarr.sqlite ".backup /backup/metarr-$(date +%Y%m%d).sqlite"
```

**Method 3: SQL dump**
```bash
sqlite3 /path/to/metarr/data/metarr.sqlite .dump > /backup/metarr-$(date +%Y%m%d).sql
```

### PostgreSQL Backup

**Full database dump**:
```bash
pg_dump -U metarr -d metarr -F c -f /backup/metarr-$(date +%Y%m%d).dump
```

**Compressed dump**:
```bash
pg_dump -U metarr -d metarr | gzip > /backup/metarr-$(date +%Y%m%d).sql.gz
```

**Automated with cron**:
```bash
#!/bin/bash
# backup-postgres.sh

PGPASSWORD="your_password" pg_dump -U metarr -d metarr -F c \
    -f /backup/metarr-$(date +%Y%m%d).dump

# Keep last 7 backups
find /backup -name "metarr-*.dump" -mtime +7 -delete
```

---

## Restoration Procedures

### Full System Recovery

**Scenario**: Complete system failure, restore from backup

**Prerequisites**:
- Fresh Metarr installation
- Access to backup files

**Steps**:

1. **Stop Metarr** (if running)
```bash
docker-compose down  # or: systemctl stop metarr
```

2. **Restore data directory**
```bash
# Remove current data (if exists)
rm -rf /path/to/metarr/data

# Restore from backup
rsync -av /backup/metarr/20241119/data/ /path/to/metarr/data/
```

3. **Restore configuration**
```bash
cp /backup/metarr/20241119/.env /path/to/metarr/.env
```

4. **Start Metarr**
```bash
docker-compose up -d  # or: systemctl start metarr
```

5. **Verify restoration**
- Check item counts in dashboard
- Verify recent additions present
- Test enrichment and publishing

### Database-Only Recovery

**Scenario**: Database corruption, cache intact

**SQLite restoration**:
```bash
# Stop Metarr
docker-compose stop metarr

# Replace database
cp /backup/metarr-20241119.sqlite /path/to/metarr/data/metarr.sqlite

# Start Metarr
docker-compose start metarr
```

**PostgreSQL restoration**:
```bash
# Stop Metarr
docker-compose stop metarr

# Drop and recreate database
psql -U postgres -c "DROP DATABASE metarr;"
psql -U postgres -c "CREATE DATABASE metarr OWNER metarr;"

# Restore from dump
pg_restore -U metarr -d metarr /backup/metarr-20241119.dump

# Start Metarr
docker-compose start metarr
```

### Cache-Only Recovery

**Scenario**: Cache directory lost, database intact

**Options**:

**Option 1: Re-enrich library** (Recommended)
```bash
# Database still has records, just re-download assets
# In Metarr UI:
1. Navigate to Libraries → [Your Library]
2. Click "Enrich All"
3. Wait for completion
4. Click "Publish All"
```

**Option 2: Restore cache from backup**
```bash
rsync -av /backup/metarr/20241119/data/cache/ /path/to/metarr/data/cache/
```

### Partial Recovery (Single Item)

**Scenario**: Accidentally deleted item, need to recover

**Using recycle bin** (within 30 days):
```bash
# Recycle bin location
ls -la /path/to/metarr/data/recycle/

# Find deleted item by date/name
find /path/to/metarr/data/recycle -name "*movie-poster*"

# Restore file
cp /path/to/metarr/data/recycle/[date]/[hash]/file.jpg /media/Movie/movie-poster.jpg
```

**From backup** (beyond 30 days):
```bash
# Find in backup
find /backup -name "*MovieName*"

# Restore specific files
cp /backup/metarr/20241101/data/cache/assets/ab/cd/abcd123...jpg \
   /path/to/metarr/data/cache/assets/ab/cd/
```

---

## Disaster Recovery Scenarios

### Scenario 1: Complete Data Loss

**Recovery**:
1. Fresh Metarr installation
2. Restore from most recent full backup
3. Verify library scans correctly
4. Check for missing recent additions (restore incremental if available)

**Expected outcome**: Restored to backup date, recent changes may be lost

### Scenario 2: Database Corruption

**Recovery**:
1. Attempt SQLite repair:
   ```bash
   sqlite3 data/metarr.sqlite "VACUUM;"
   sqlite3 data/metarr.sqlite "REINDEX;"
   ```
2. If fails, restore database from backup
3. Cache remains intact (no re-downloads needed)

**Expected outcome**: Full recovery with minimal downtime

### Scenario 3: Cache Deleted/Corrupted

**Recovery**:
1. Database intact, cache lost
2. Option A: Restore cache from backup (fast)
3. Option B: Re-enrich entire library (slow but fresh)

**Expected outcome**: Full recovery, time depends on method

### Scenario 4: Accidental Mass Deletion

**Recovery** (within 30 days):
1. Check recycle bin: `/path/to/metarr/data/recycle/`
2. Identify deletion date
3. Restore files from recycle bin
4. Update database records (or re-scan)

**Recovery** (beyond 30 days):
1. Restore from backup
2. Selectively restore deleted items

---

## Backup Verification

### Testing Backups

**Critical**: Test restores regularly - Quarterly minimum

**Test procedure**:
1. **Create test environment** (separate from production)
2. **Restore backup** to test environment
3. **Verify data integrity**:
   - Item counts match
   - Recent additions present
   - Assets accessible
4. **Test operations**:
   - Scan library
   - Enrich single item
   - Publish single item
5. **Document results**

**Checklist**:
- [ ] Database restores without errors
- [ ] Cache files accessible
- [ ] Configuration restored
- [ ] Application starts successfully
- [ ] Item counts match production
- [ ] Recent additions present

### Automated Verification

**Backup verification script**:
```bash
#!/bin/bash
# verify-backup.sh

BACKUP_FILE="/backup/metarr-$(date +%Y%m%d).sqlite"

# Check file exists
if [ ! -f "$BACKUP_FILE" ]; then
    echo "ERROR: Backup file not found"
    exit 1
fi

# Check file size (should be > 1MB)
SIZE=$(stat -f%z "$BACKUP_FILE")
if [ "$SIZE" -lt 1048576 ]; then
    echo "ERROR: Backup file too small"
    exit 1
fi

# Verify SQLite integrity
sqlite3 "$BACKUP_FILE" "PRAGMA integrity_check;" | grep -q "ok"
if [ $? -ne 0 ]; then
    echo "ERROR: Database integrity check failed"
    exit 1
fi

echo "Backup verification successful"
```

---

## Backup Best Practices

### 3-2-1 Rule

**3 copies of data**:
1. Production (running system)
2. Local backup (external drive)
3. Offsite backup (cloud or remote location)

**2 different storage media**:
- Disk (local storage)
- Cloud/tape/different disk technology

**1 offsite copy**:
- Cloud storage
- Remote location
- Protection from local disasters (fire, flood, theft)

### Retention Policy

**Recommended retention**:
- **Daily backups**: 7 days
- **Weekly backups**: 4 weeks
- **Monthly backups**: 12 months
- **Yearly backups**: Indefinite (optional)

**Storage calculation** (1000 movies example):
- Database: ~300MB × 7 days = 2.1GB
- Cache (weekly full): ~3GB × 4 weeks = 12GB
- **Total**: ~15GB for 1000 movie library

### Security

**Encrypt sensitive backups**:
```bash
# Encrypt database backup
gpg --symmetric --cipher-algo AES256 /backup/metarr.sqlite

# Encrypt and compress
tar czf - /path/to/metarr/data | gpg --symmetric --cipher-algo AES256 > /backup/metarr-encrypted.tar.gz.gpg
```

**Protect API keys in backups**:
- Don't backup `.env` to public locations
- Redact API keys if sharing backups
- Use secrets management in production

---

## Monitoring Backups

### Backup Health Checks

**Check backup age**:
```bash
# Alert if backup older than 2 days
LATEST_BACKUP=$(find /backup -name "metarr-*.sqlite" -mtime -2 | head -1)
if [ -z "$LATEST_BACKUP" ]; then
    echo "WARNING: No recent backup found"
fi
```

**Check backup size**:
```bash
# Alert if backup size differs significantly from previous
# (Indicates potential backup failure)
```

**Integration with monitoring**:
- Log backup completion
- Alert on backup failures
- Track backup sizes over time

See [Monitoring Guide](MONITORING.md) for details.

---

## Recovery Time Objectives

### Expected Recovery Times

**Database only** (SQLite):
- Restore time: 1-5 minutes
- Downtime: 5-10 minutes

**Full system** (data directory):
- Small library (<1000 items): 10-30 minutes
- Medium library (1000-5000 items): 30-60 minutes
- Large library (>10000 items): 1-3 hours

**Re-enrichment** (if cache lost):
- Per item: 10-30 seconds
- 1000 items: 3-8 hours
- 10000 items: 30-80 hours

**Plan accordingly**: Cache backups critical for fast recovery

---

## See Also

- [Migration Guide](../getting-started/MIGRATION.md) - Moving between systems
- [Troubleshooting](TROUBLESHOOTING.md) - Common issues
- [Monitoring](MONITORING.md) - Backup monitoring
- [Configuration](../getting-started/CONFIGURATION.md) - System settings
