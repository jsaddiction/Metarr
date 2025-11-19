# Verification Phase

**Purpose**: Ensure consistency between cache and library, detecting and repairing discrepancies to maintain data integrity.

**Status**: Design phase, implementation pending

## Overview

The verification phase is a maintenance operation that ensures Metarr's desired state (cache + database) matches the actual state (library filesystem). It detects unauthorized changes, missing files, and corruption, then repairs issues to maintain consistency.

## Phase Rules

1. **Idempotent**: Multiple verifications cause no harm
2. **Self-healing**: Automatically repairs detected issues
3. **Non-destructive**: Preserves user files unless configured otherwise
4. **Comprehensive**: Checks both existence and integrity
5. **Observable**: Reports detailed verification results

## Triggers

- **Manual**: User clicks "Verify Library" or "Verify Movie"
- **Scheduled**: Daily/weekly maintenance (configurable)
- **Post-incident**: After crash or unexpected shutdown
- **Selective**: Verify specific items or directories

## Process Flow

```
1. STATE COMPARISON
   ├── Load expected state from database
   ├── Scan actual filesystem state
   ├── Calculate differences
   └── Build repair plan

2. INTEGRITY CHECKS
   ├── Verify file sizes match
   ├── Check SHA256 hashes (optional)
   ├── Validate NFO structure

3. DISCREPANCY DETECTION
   ├── Missing from library (in cache, not library)
   ├── Unauthorized changes (modified without Metarr)
   ├── Orphaned files (in library, not in database)
   └── Corrupted files (hash mismatch)

4. REPAIR ACTIONS
   ├── Restore missing files from cache
   ├── Update changed metadata
   ├── Remove/recycle orphaned files
   └── Re-download corrupted assets

5. REPORTING
   ├── Log all actions taken
   ├── Notify user of issues
   └── Update verification timestamp
```

## Verification Process

- Verify expected files present
- SHA256 hash validation
- NFO structure parsing
- Image dimension validation

## Discrepancy Types & Actions

```typescript
enum DiscrepancyType {
  MISSING_IN_LIBRARY, // File in cache but not library
  MISSING_IN_CACHE, // File in library but not cache
  HASH_MISMATCH, // Different content (deep check)
  UNAUTHORIZED_CHANGE, // Modified outside Metarr
  ORPHANED_FILE, // Unknown file in library
  CORRUPTED_FILE, // Cannot read/parse file
  WRONG_NAMING, // Incorrect Kodi naming
}

interface RepairAction {
  type: DiscrepancyType;
  action: 'restore' | 'update' | 'remove' | 'recycle' | 'ignore';
  source?: string; // Where to restore from
  target?: string; // Where to restore to
  reason: string; // Human-readable explanation
}

async function planRepair(discrepancy: Discrepancy): Promise<RepairAction> {
  switch (discrepancy.type) {
    case DiscrepancyType.MISSING_IN_LIBRARY:
      return {
        type: discrepancy.type,
        action: 'restore',
        source: discrepancy.cache_path,
        target: discrepancy.expected_library_path,
        reason: 'Restoring missing file from cache',
      };

    case DiscrepancyType.ORPHANED_FILE:
      if (config.preserveUserFiles && !isMetarrFile(discrepancy.path)) {
        return { action: 'ignore', reason: 'Preserving user file' };
      }
      return {
        action: 'recycle',
        target: discrepancy.path,
        reason: 'Moving orphaned file to recycle bin',
      };

    case DiscrepancyType.HASH_MISMATCH:
      return {
        action: 'restore',
        source: discrepancy.cache_path,
        target: discrepancy.library_path,
        reason: 'File corrupted, restoring from cache',
      };
  }
}
```

## File Integrity Verification

```typescript
async function verifyFileIntegrity(file: LibraryFile): Promise<IntegrityResult> {
  const result: IntegrityResult = {
    path: file.path,
    valid: true,
    issues: [],
  };

  // Check existence
  if (!(await fs.exists(file.path))) {
    result.valid = false;
    result.issues.push('File not found');
    return result;
  }

  // Check size
  const stats = await fs.stat(file.path);
  if (stats.size !== file.expected_size) {
    result.valid = false;
    result.issues.push(`Size mismatch: ${stats.size} != ${file.expected_size}`);
  }

  // Check hash
  if (file.content_hash) {
    const hash = await calculateSHA256(file.path);
    if (hash !== file.content_hash) {
      result.valid = false;
      result.issues.push('Content hash mismatch');
    }
  }

  // Type-specific checks
  if (file.type === 'image') {
    try {
      const metadata = await sharp(file.path).metadata();
      if (!metadata.width || !metadata.height) {
        result.valid = false;
        result.issues.push('Invalid image file');
      }
    } catch {
      result.valid = false;
      result.issues.push('Cannot read image');
    }
  }

  if (file.type === 'nfo') {
    try {
      const content = await fs.readFile(file.path, 'utf8');
      const parsed = parseXML(content);
      if (!parsed.movie && !parsed.tvshow && !parsed.episodedetails) {
        result.valid = false;
        result.issues.push('Invalid NFO structure');
      }
    } catch {
      result.valid = false;
      result.issues.push('Cannot parse NFO');
    }
  }

  return result;
}
```

## Batch Verification

```typescript
async function verifyLibrary(options: VerifyOptions): Promise<VerifyReport> {
  const report: VerifyReport = {
    started_at: new Date(),
    items_checked: 0,
    issues_found: 0,
    repairs_completed: 0,
    repairs_failed: 0,
    details: [],
  };

  // Get all items to verify
  const items = await db.movies.findAll({
    where: options.filter || {},
    limit: options.limit,
  });

  // Process in batches for performance
  const batches = chunk(items, options.batchSize || 100);

  for (const batch of batches) {
    const results = await Promise.allSettled(batch.map(item => verifyItem(item)));

    for (const result of results) {
      report.items_checked++;

      if (result.status === 'fulfilled' && result.value.issues.length > 0) {
        report.issues_found += result.value.issues.length;

        // Attempt repairs if configured
        if (options.autoRepair) {
          for (const issue of result.value.issues) {
            try {
              await repairIssue(issue);
              report.repairs_completed++;
            } catch (error) {
              report.repairs_failed++;
              report.details.push({
                item: issue.item_id,
                error: error.message,
              });
            }
          }
        }
      }
    }

    // Progress callback
    if (options.onProgress) {
      options.onProgress({
        current: report.items_checked,
        total: items.length,
        percent: (report.items_checked / items.length) * 100,
      });
    }
  }

  report.completed_at = new Date();
  await saveReport(report);

  return report;
}
```

## Configuration

```typescript
interface VerificationConfig {
  // Schedule
  enabled: boolean; // Enable verification
  schedule: string; // Cron expression ('0 3 * * *')

  // Repair
  autoRepair: boolean; // Fix issues automatically
}
```

## Performance Optimizations

- **Parallel processing**: Verify multiple files simultaneously
- **Batch database queries**: Reduce round trips
- **Progress streaming**: Real-time updates via WebSocket

## Monitoring

```typescript
// Real-time progress via WebSocket
socket.emit('verification:progress', {
  phase: 'checking',
  current: 150,
  total: 1000,
  currentItem: 'The Matrix (1999)',
  issuesFound: 5,
  repairsCompleted: 3,
});

// Summary notification
socket.emit('verification:complete', {
  duration: '15 minutes',
  itemsChecked: 1000,
  issuesFound: 23,
  issuesRepaired: 20,
  issuesFailed: 3,
  reportId: 'verify_20250124_140523',
});
```

## Database Schema

```sql
-- Verification history
CREATE TABLE verification_runs (
  id INTEGER PRIMARY KEY,
  started_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP,
  items_checked INTEGER DEFAULT 0,
  issues_found INTEGER DEFAULT 0,
  repairs_completed INTEGER DEFAULT 0,
  report_json TEXT,          -- Full report as JSON
  status TEXT                -- 'running', 'completed', 'failed'
);

-- Track last verification per item
CREATE TABLE verification_status (
  item_id INTEGER NOT NULL,
  item_type TEXT NOT NULL,   -- 'movie', 'show', 'episode'
  last_verified TIMESTAMP,
  last_hash TEXT,            -- SHA256 at last check
  verification_count INTEGER DEFAULT 0,
  issues_found INTEGER DEFAULT 0,
  PRIMARY KEY (item_id, item_type)
);
```

## Related Documentation

- [Database Schema](../DATABASE.md) - Data integrity constraints
- [API Architecture](../API.md) - Verification endpoints
- [Development](../DEVELOPMENT.md#logging) - Logging and reporting

## Independence Note

Verification runs independently from the main automation chain. It can trigger publishing or enrichment jobs if issues are found, but typically operates as a background maintenance task.
