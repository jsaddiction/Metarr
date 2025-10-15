# Stage 5: Kodi Integration - Implementation Guide

**Started**: 2025-10-15
**Branch**: `feature/stage-5-kodi`
**Goal**: Build solid framework for Kodi player management with scan coordination

---

## 🎯 Core Philosophy

**"Solid Framework First, Features Later"**

This stage focuses on:
1. ✅ Proper media player group architecture (shared database coordination)
2. ✅ Basic library scan triggering (one scan per group, not per instance)
3. ✅ Clean player management API
4. ⏳ Advanced features deferred to post-v1.0

---

## 🏗️ Architecture: Media Player Groups

### The Problem: Kodi Shared Database

**Scenario**: User has 3 Kodi instances (Living Room, Bedroom, Office)
- All 3 instances share the **same MySQL backend database**
- When one instance scans the library, **all instances see the changes**
- If Metarr triggers scan on all 3 instances → **3 concurrent scans = problems**

**Solution**: **Media Player Groups**

```
Group: "Home Kodi Instances" (type: kodi, shared_database: true)
  ├── Player 1: Living Room Kodi (192.168.1.100:8080)
  ├── Player 2: Bedroom Kodi (192.168.1.101:8080)
  └── Player 3: Office Kodi (192.168.1.102:8080)

Scan Behavior:
  - Metarr triggers scan on ONE instance in the group (e.g., Player 1)
  - All 3 instances get updated via shared MySQL database
  - No concurrent scan conflicts
```

### Database Schema (Already Exists!)

```sql
-- Groups define shared database sets
CREATE TABLE media_player_groups (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,                    -- "Home Kodi Instances"
  type TEXT CHECK(type IN ('kodi', 'jellyfin', 'plex')),
  created_at TIMESTAMP
);

-- Each instance belongs to a group
CREATE TABLE media_players (
  id INTEGER PRIMARY KEY,
  group_id INTEGER NOT NULL,              -- FK to media_player_groups
  name TEXT NOT NULL,                     -- "Living Room Kodi"
  host TEXT NOT NULL,                     -- "192.168.1.100"
  port INTEGER NOT NULL,                  -- 8080
  username TEXT,
  password TEXT,
  enabled BOOLEAN DEFAULT 1,
  last_ping_at TIMESTAMP,
  FOREIGN KEY (group_id) REFERENCES media_player_groups(id)
);

-- Links groups to libraries
CREATE TABLE media_player_libraries (
  id INTEGER PRIMARY KEY,
  group_id INTEGER NOT NULL,              -- FK to media_player_groups
  library_id INTEGER NOT NULL,            -- FK to libraries
  FOREIGN KEY (group_id) REFERENCES media_player_groups(id),
  FOREIGN KEY (library_id) REFERENCES libraries(id)
);
```

**Key Insight**: `media_player_libraries` links **groups** (not individual players) to libraries!

---

## 🎯 Stage 5 Scope (Minimal Viable)

### ✅ What We WILL Build

1. **Scan Coordination Logic**:
   - When library update occurs → find all groups linked to that library
   - For each group → trigger scan on ONE healthy instance (primary or fallback)
   - Log which instance was used for scan

2. **Group-Aware Notification**:
   - `notifyMediaPlayers(libraryId)` already exists in webhookProcessingService
   - Update it to be group-aware (one scan per group, not per player)

3. **Basic Health Checking**:
   - Track `last_ping_at` for each player
   - Choose scan target: Prefer first enabled player, fallback to next if unreachable

4. **Configuration Framework**:
   - UI indicators: "This group shares a database (only one instance will be scanned)"
   - Ability to add multiple players to same group
   - Ability to enable/disable individual players

### ⏳ What We WILL NOT Build (Deferred to Post-v1.0)

1. **Advanced Health Monitoring**:
   - Automatic failover on scan failure
   - Player availability probes
   - Connection retry logic

2. **Playback State Tracking**:
   - Detect what's currently playing
   - Pause scans if media is being watched
   - Resume tracking

3. **Path Mapping UI**:
   - Visual path mapping configuration
   - Test path mapping button
   - Validation of mapped paths

4. **Multiple Group Types**:
   - Jellyfin support
   - Plex support
   - Mixed groups

5. **WebSocket Real-Time Events**:
   - Player connection status broadcasting
   - Live playback state updates
   - Scan progress tracking

---

## 📝 Implementation Plan

### Phase 1: Update Scan Coordination (Current Priority)

**Goal**: Make `notifyMediaPlayers()` group-aware

**Current Implementation** (in `webhookProcessingService.ts`):
```typescript
private async notifyMediaPlayers(libraryId: number): Promise<void> {
  // Get all enabled media players for this library
  const players = await db.query(`
    SELECT mp.id, mp.name, mp.type
    FROM media_players mp
    INNER JOIN media_player_libraries mpl ON mp.id = mpl.player_id
    WHERE mpl.library_id = ? AND mp.enabled = 1
  `, [libraryId]);

  // Trigger scan for each player ❌ WRONG - triggers scan on ALL instances
  for (const player of players) {
    await httpClient.scanVideoLibrary();
  }
}
```

**New Implementation** (group-aware):
```typescript
private async notifyMediaPlayers(libraryId: number): Promise<void> {
  // Get all groups linked to this library
  const groups = await db.query(`
    SELECT DISTINCT mpg.id, mpg.name, mpg.type
    FROM media_player_groups mpg
    INNER JOIN media_player_libraries mpl ON mpg.id = mpl.group_id
    WHERE mpl.library_id = ?
  `, [libraryId]);

  // For each group, trigger scan on ONE instance
  for (const group of groups) {
    await this.triggerGroupScan(group.id, libraryId);
  }
}

private async triggerGroupScan(groupId: number, libraryId: number): Promise<void> {
  // Get all enabled players in this group, ordered by preference
  const players = await db.query(`
    SELECT id, name, host, port, username, password
    FROM media_players
    WHERE group_id = ? AND enabled = 1
    ORDER BY id ASC  -- First player = primary
  `, [groupId]);

  if (players.length === 0) {
    logger.warn('No enabled players in group', { groupId });
    return;
  }

  // Try to scan on first available player
  for (const player of players) {
    try {
      const httpClient = this.mediaPlayerManager.getHttpClient(player.id);
      if (httpClient) {
        await httpClient.scanVideoLibrary();
        logger.info('Triggered library scan on group primary', {
          groupId,
          playerId: player.id,
          playerName: player.name,
          libraryId
        });
        return; // Success - exit after first successful scan
      }
    } catch (error: any) {
      logger.warn('Failed to scan on player, trying next', {
        playerId: player.id,
        error: error.message
      });
      // Continue to next player (fallback)
    }
  }

  // All players failed
  logger.error('Failed to trigger scan on any player in group', { groupId });
}
```

**Key Changes**:
1. Query by `media_player_groups` instead of `media_players`
2. One scan per group (not per player)
3. Fallback logic: Try next player if first fails
4. Clear logging: Which instance was used for scan

---

### Phase 2: Fix Database Schema Issue

**Problem**: Current schema links players to libraries individually:
```sql
-- Current (WRONG for groups)
CREATE TABLE media_player_libraries (
  player_id INTEGER,  -- ❌ Links individual players
  library_id INTEGER
);
```

**Solution**: Schema already correct! (links groups to libraries)
```sql
-- Correct (already in clean_schema migration)
CREATE TABLE media_player_libraries (
  group_id INTEGER,   -- ✅ Links groups
  library_id INTEGER
);
```

**Action**: Verify the migration is correct (it is!)

---

### Phase 3: Update MediaPlayerConnectionManager

**Current Behavior**: Manages individual player connections

**Keep As-Is For Now**: This is fine! The connection manager tracks individual instances. The scan coordination logic (above) handles the group-aware scanning.

**No Changes Needed** for v1.0.

---

### Phase 4: Basic Configuration UI (Post-Backend)

**Settings → Media Players**

```
Groups:
  ┌─────────────────────────────────────────────────────┐
  │ Home Kodi Instances (3 players)            [Edit]   │
  │ ⚠️ Shared database: Only one instance will scan     │
  │                                                      │
  │ Players:                                             │
  │   ✅ Living Room Kodi (192.168.1.100:8080)         │
  │   ✅ Bedroom Kodi (192.168.1.101:8080)             │
  │   ❌ Office Kodi (192.168.1.102:8080) [Disabled]   │
  │                                                      │
  │ Libraries: Movies, TV Shows                          │
  └─────────────────────────────────────────────────────┘

  [+ Add Group]
```

**Features**:
- List all groups
- Show player count per group
- Warning indicator: "Shared database" groups
- Enable/disable individual players
- Link groups to libraries

**Deferred to Post-v1.0**: Full player/group CRUD UI

---

## 🧪 Testing Strategy

### Manual Testing

**Scenario 1: Single Kodi Instance**
1. Create group: "Living Room Kodi"
2. Add one player to group
3. Link group to library
4. Trigger webhook download
5. Verify: Scan triggered on that instance

**Scenario 2: Shared Database (3 Instances)**
1. Create group: "Home Kodi Instances"
2. Add 3 players to group (all sharing MySQL backend)
3. Link group to library
4. Trigger webhook download
5. Verify: Scan triggered on ONLY ONE instance
6. Check Kodi: All 3 instances see new movie (via shared DB)

**Scenario 3: Failover**
1. Group with 2 players
2. Disable first player
3. Trigger webhook download
4. Verify: Scan triggered on second player (fallback)

### Automated Testing (Future)

- Unit tests for `triggerGroupScan()` logic
- Integration tests for webhook → scan flow
- Mock Kodi responses for reliability

---

## 📊 Success Criteria

**Stage 5 Complete When**:
- ✅ Scan coordination is group-aware (one scan per group)
- ✅ Fallback logic works (tries next player if first fails)
- ✅ Clear logging: Which instance performed scan
- ✅ Works with webhook download flow (Radarr → Metarr → Kodi)
- ✅ Database schema validated
- ✅ Code is clean and documented

**NOT Required for Stage 5**:
- ❌ Full player/group CRUD UI (can configure via database for now)
- ❌ Advanced health monitoring
- ❌ Playback state tracking
- ❌ WebSocket real-time updates
- ❌ Path mapping UI

---

## 🔗 Related Documentation

- [KODI_API.md](KODI_API.md) - Kodi JSON-RPC reference
- [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) - Complete schema
- [WEBHOOKS.md](WEBHOOKS.md) - Webhook integration
- [DESIGN_DECISIONS.md](DESIGN_DECISIONS.md) - Architectural choices

---

## 💡 Design Decisions

### Why Groups Instead of Per-Player Scanning?

**Problem**: Kodi supports shared MySQL databases (one DB, multiple frontends)
- Common setup: Living room + bedroom + office all share one DB
- If Metarr scans all 3 instances → 3 concurrent scans on same DB → conflicts

**Solution**: Media Player Groups
- User explicitly groups instances that share a database
- Metarr scans ONE instance per group
- All instances in group see changes via shared DB
- No concurrent scan conflicts

**Alternative Considered**: Auto-detect shared databases
- Rejected: Requires querying Kodi's MySQL connection (complex, intrusive)
- Simpler: User tells us which instances share databases

### Why Fallback Logic?

**Scenario**: Primary instance is offline/unreachable

**Without Fallback**: Scan fails, library not updated
**With Fallback**: Try next instance in group, scan succeeds

**Implementation**: Simple loop - try first player, if fails, try next

### Why Defer Advanced Features?

**Goal**: v1.0 = Complete automation flow (webhook → enrich → publish → notify)

**Minimum Viable**: Trigger scan on Kodi after webhook download
**Advanced Features**: Health monitoring, playback tracking, failover logic

**v1.0 Focus**: Get basic scan working reliably, polish later

---

## 🚀 Next Steps

1. Update `notifyMediaPlayers()` to be group-aware
2. Implement `triggerGroupScan()` with fallback logic
3. Test with single Kodi instance
4. Test with shared database (3 instances)
5. Verify webhook → Kodi flow works end-to-end
6. Document configuration in README
7. Mark Stage 5 complete

---

**Remember**: We're building a **solid framework**, not a complete feature set. Advanced features come after v1.0!
