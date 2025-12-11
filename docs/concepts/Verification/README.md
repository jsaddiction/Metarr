# Verification

Verification ensures consistency between cache and library, detecting and automatically repairing discrepancies to maintain data integrity.

## What is Verification?

Given the expected state (cache + database) and actual state (library filesystem), verification:

1. **Compares** expected vs actual file state
2. **Detects** missing, corrupted, or orphaned files
3. **Repairs** issues automatically when possible
4. **Reports** verification results and actions taken

```
INPUT: Expected state from database, actual filesystem state
    │
    └──► VERIFICATION
              │
              ├──► Step 1: STATE COMPARISON
              │         └──► Load expected state from database
              │         └──► Scan actual filesystem state
              │         └──► Calculate differences
              │
              ├──► Step 2: INTEGRITY CHECKS
              │         └──► Verify file sizes match
              │         └──► Check SHA256 hashes (optional)
              │         └──► Validate image readability
              │         └──► Validate NFO structure
              │
              ├──► Step 3: REPAIR PLANNING
              │         └──► Missing from library → restore from cache
              │         └──► Corrupted files → restore from cache
              │         └──► Orphaned files → recycle or preserve
              │
              └──► Step 4: EXECUTE & REPORT
                        └──► Execute repair actions
                        └──► Log all actions taken
                        └──► Update verification timestamp

OUTPUT: Consistent cache↔library state, detailed verification report
```

## Why Verification?

Verification protects against data loss and corruption from external changes.

**Without verification:**
- Media manager upgrades can delete assets
- Disk errors go unnoticed
- Orphaned files accumulate
- Cache and library drift apart

**With verification:**
- Automatic restoration from protected cache
- Corruption detection and repair
- Orphan cleanup (configurable)
- Consistent source of truth

## Discrepancy Types

| Type | Detection | Default Action |
|------|-----------|----------------|
| `MISSING_IN_LIBRARY` | File in cache but not library | Restore from cache |
| `MISSING_IN_CACHE` | File in library but not cache | Remove from library |
| `HASH_MISMATCH` | Different content (deep check) | Restore from cache |
| `CORRUPTED_FILE` | Cannot read/parse file | Restore from cache |
| `ORPHANED_FILE` | Unknown file in library | Recycle or preserve |
| `WRONG_NAMING` | Incorrect Kodi naming | Rename to correct |

## Repair Philosophy

**Cache is the source of truth**. When discrepancies are found:

1. If file exists in cache → restore to library
2. If file only in library with no cache record → remove (or preserve if `preserveUserFiles=true`)
3. User edits are sacred → locked fields never modified

## Configuration

| Setting | Default | Effect |
|---------|---------|--------|
| `enabled` | true | Enable verification |
| `schedule` | `0 3 * * *` | Run at 3 AM daily |
| `autoRepair` | true | Fix issues automatically |
| `preserveUserFiles` | true | Don't delete unknown files |
| `hashCheck` | false | Verify SHA256 hashes (expensive) |

## Triggers

| Trigger | Priority | Use Case |
|---------|----------|----------|
| Scheduled | LOW | Daily maintenance |
| Manual | HIGH | User clicks "Verify Library" |
| Post-incident | NORMAL | After crash or unexpected shutdown |
| Selective | HIGH | Verify specific items or directories |

## Chain Position

Verification runs **independently** from the main automation chain:

```
SCANNING → ENRICHMENT → PUBLISHING → PLAYER SYNC

VERIFICATION (independent, scheduled or manual)
```

It can trigger enrichment or publishing jobs if issues require deeper repair.

## Use Cases

### Radarr/Sonarr Upgrade Detection

When a media manager upgrades a file and deletes assets:
1. Verification detects missing library files
2. Compares with cache records
3. Restores missing assets from cache
4. Logs restoration event

### Corruption Detection

When a file becomes corrupted (disk error, network issue):
1. Verification detects hash mismatch
2. Identifies corresponding cache file
3. Replaces corrupted file from cache
4. Alerts user of potential disk issues

### Orphan Cleanup

When unknown files appear in library:
1. Verification detects orphaned file
2. Checks against ignore patterns
3. Moves to recycle bin (if configured)
4. Logs cleanup event

## Performance

- **Parallel processing**: Verify multiple files simultaneously
- **Hash check optional**: SHA256 verification disabled by default (expensive)
- **Incremental**: Skip recently verified items (7-day cache)
- **Batched queries**: Reduce database round trips

## Related Documentation

- [Operational Concepts](../README.md) - Pipeline overview
- [Two-Copy System](../../architecture/ASSET_MANAGEMENT/TWO_COPY_SYSTEM.md) - Cache vs Library architecture
- [Publishing](../Publishing/) - How assets reach the library
- [Notification](../Notification/) - Alert on verification findings
