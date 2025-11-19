# Path Mapping Reference

**Purpose**: Complete reference for Docker/NAS path mapping between media managers, Metarr, and media players.

**Related Docs**:
- Parent: [Reference Documentation](../INDEX.md#reference-technical-details)
- Related: [Webhooks](WEBHOOKS.md), [Configuration](../getting-started/CONFIGURATION.md)

---

## The Problem

Different systems see the same files through different path mappings:

```
┌──────────────┬────────────────────────────┬─────────────────────────┐
│   System     │  What it sees              │  Actual Storage         │
├──────────────┼────────────────────────────┼─────────────────────────┤
│ Radarr       │ /downloads/movies/         │                         │
│ (Docker)     │ The Matrix (1999)/         │                         │
│              │                            │  NAS: /mnt/media/movies/│
│ Metarr       │ /data/movies/              │                         │
│ (Docker)     │ The Matrix (1999)/         │                         │
│              │                            │                         │
│ Kodi         │ /mnt/media/movies/         │                         │
│ (Linux)      │ The Matrix (1999)/         │                         │
└──────────────┴────────────────────────────┴─────────────────────────┘
```

**Same file, three different paths.** Metarr needs path mapping to process webhooks and trigger player scans.

---

## Path Mapping Types

### 1. Media Manager Mappings
Translate webhook paths from Radarr/Sonarr/Lidarr to Metarr's library paths.

**Database**: `media_manager_path_mappings` table

```sql
CREATE TABLE media_manager_path_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  manager_type TEXT NOT NULL,       -- 'radarr', 'sonarr', 'lidarr'
  manager_path TEXT NOT NULL,       -- What the manager sees
  metarr_path TEXT NOT NULL         -- What Metarr sees
);
```

**Example Configuration**:
```sql
INSERT INTO media_manager_path_mappings (manager_type, manager_path, metarr_path)
VALUES ('radarr', '/downloads/movies/', '/data/movies/');
```

**Translation**:
```typescript
function translateManagerPath(managerPath: string): string {
  // Radarr path: /downloads/movies/The Matrix (1999)/
  // Metarr path:  /data/movies/The Matrix (1999)/
  return managerPath.replace('/downloads/movies/', '/data/movies/');
}
```

---

### 2. Media Player Mappings
Translate Metarr's library paths to what each media player sees.

**Database**: `player_path_mappings` table

```sql
CREATE TABLE player_path_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER NOT NULL,        -- FK to media_players.id
  metarr_path TEXT NOT NULL,         -- What Metarr sees
  player_path TEXT NOT NULL,         -- What the player sees
  FOREIGN KEY (player_id) REFERENCES media_players(id) ON DELETE CASCADE
);
```

**Example Configuration** (Kodi):
```sql
INSERT INTO player_path_mappings (player_id, metarr_path, player_path)
VALUES (1, '/data/movies/', '/mnt/media/movies/');
```

**Translation**:
```typescript
function translatePlayerPath(playerId: number, metarrPath: string): string {
  // Metarr path: /data/movies/The Matrix (1999)/
  // Kodi path:   /mnt/media/movies/The Matrix (1999)/
  return metarrPath.replace('/data/movies/', '/mnt/media/movies/');
}
```

---

## Common Scenarios

### Docker Containers with NAS Storage

**Setup**:
```yaml
# docker-compose.yml
services:
  radarr:
    volumes:
      - /mnt/nas/media:/downloads

  metarr:
    volumes:
      - /mnt/nas/media:/data

  kodi:
    # Bare metal, direct NAS mount
    # /mnt/nas/media mounted at /mnt/media
```

**Path Mappings**:
```sql
-- Manager mapping (Radarr → Metarr)
INSERT INTO media_manager_path_mappings (manager_type, manager_path, metarr_path)
VALUES ('radarr', '/downloads/', '/data/');

-- Player mapping (Metarr → Kodi)
INSERT INTO player_path_mappings (player_id, metarr_path, player_path)
VALUES (1, '/data/', '/mnt/media/');
```

**Result**:
- Radarr sees: `/downloads/movies/The Matrix (1999)/`
- Metarr sees: `/data/movies/The Matrix (1999)/`
- Kodi sees: `/mnt/media/movies/The Matrix (1999)/`

---

### Windows to Linux Path Mapping

**Scenario**: Metarr on Windows, Kodi on Linux

**Metarr (Windows)**: `M:\Movies\`
**Kodi (Linux)**: `/mnt/media/movies/`

**Mapping**:
```sql
-- After normalization (Windows paths use forward slashes internally)
INSERT INTO player_path_mappings (player_id, metarr_path, player_path)
VALUES (1, '/M:/Movies/', '/mnt/media/movies/');
```

**Path Normalization**:
```typescript
function normalizePath(path: string): string {
  // 1. Replace backslashes with forward slashes
  path = path.replace(/\\/g, '/');

  // 2. Remove trailing slash
  if (path.endsWith('/') && path.length > 1) {
    path = path.slice(0, -1);
  }

  // 3. Ensure leading slash
  if (!path.startsWith('/')) {
    path = '/' + path;
  }

  return path;
}
```

**Examples**:
```
Input: "C:\Users\Media\Movies\"
Output: "/C:/Users/Media/Movies"

Input: "/data/movies/"
Output: "/data/movies"
```

---

### Multiple Libraries

**Scenario**: Separate 4K and 1080p libraries

```sql
-- Metarr sees two directories
/data/movies-4k/
/data/movies-1080p/

-- Kodi sees combined structure
/mnt/media/4k/
/mnt/media/hd/

-- Mappings
INSERT INTO player_path_mappings (player_id, metarr_path, player_path) VALUES
  (1, '/data/movies-4k/', '/mnt/media/4k/'),
  (1, '/data/movies-1080p/', '/mnt/media/hd/');
```

---

### Nested Mappings (Longest Match Wins)

**Configuration**:
```sql
-- More specific mapping takes precedence
INSERT INTO player_path_mappings (player_id, metarr_path, player_path) VALUES
  (1, '/data/', '/media/'),
  (1, '/data/movies-4k/', '/media/4k/');  -- More specific, matches first
```

**Translation**:
```
/data/tvshows/The Office/       → /media/tvshows/The Office/       (first mapping)
/data/movies-4k/Dune (2021)/    → /media/4k/Dune (2021)/           (second mapping, longer match)
```

---

## UI Configuration

### Media Manager Mapping UI

**Settings → Media Managers → Radarr → Path Mappings**

```
┌────────────────────────────────────────────────────────┐
│ Path Mappings                                          │
├────────────────────────────────────────────────────────┤
│                                                        │
│ Radarr Path         Metarr Path                        │
│ /downloads/movies/  /data/movies/         [Edit] [×]  │
│ /downloads/tv/      /data/tvshows/        [Edit] [×]  │
│                                                        │
│ [+ Add Mapping]                                        │
└────────────────────────────────────────────────────────┘
```

### Media Player Mapping UI

**Settings → Media Players → Living Room Kodi → Path Mappings**

```
┌────────────────────────────────────────────────────────┐
│ Path Mappings                                          │
├────────────────────────────────────────────────────────┤
│                                                        │
│ Metarr Library Path    Kodi Path                      │
│ /data/movies/          /mnt/media/movies/ [Edit] [×]  │
│ /data/tvshows/         /mnt/media/tv/     [Edit] [×]  │
│                                                        │
│ [+ Add Mapping]                                        │
└────────────────────────────────────────────────────────┘
```

---

## Testing Path Mappings

**Test Connection Button**:

When user clicks "Test Connection" on media player config:

1. Test API connectivity
2. Test each path mapping by listing directory on player

**UI Display**:
```
┌────────────────────────────────────────────────────────┐
│ Connection Test Results                                │
├────────────────────────────────────────────────────────┤
│                                                        │
│ API Connection: ✓ Connected                            │
│                                                        │
│ Path Mappings:                                         │
│ ✓ Movies Library                                       │
│   Metarr: /data/movies/                                │
│   Kodi:   /mnt/media/movies/                           │
│                                                        │
│ ✗ TV Shows Library                                     │
│   Metarr: /data/tvshows/                               │
│   Kodi:   /mnt/media/tv/                               │
│   Error: Directory not found                           │
│                                                        │
│ Please check your path mappings.                       │
└────────────────────────────────────────────────────────┘
```

---

## Optional Path Mapping

Path mappings are **optional**. If paths are identical across all systems, no mappings needed.

**Example**: All containers share same mount
```yaml
# All services see /media/movies/
radarr:
  volumes:
    - /mnt/nas/media:/media

metarr:
  volumes:
    - /mnt/nas/media:/media

# Kodi bare metal with NFS mount at /media
```

**Configuration**: Leave path mappings empty.

---

## Best Practices

1. **Use absolute paths** - Never relative paths
2. **Normalize paths** - Consistent format (forward slashes, no trailing slash)
3. **Test mappings** - Use connection test to verify path accessibility
4. **Longest match first** - Sort mappings by path length (descending) when translating
5. **Optional by default** - Only require mappings if paths actually differ
6. **Validate on save** - Check if directory exists before saving mapping
7. **Handle errors gracefully** - If translation fails, try original path as fallback

---

## Troubleshooting

### Problem: Kodi scan does nothing

**Cause**: Path mapping incorrect, Kodi can't find directory

**Solution**:
1. Click "Test Connection" on media player
2. Review path test results
3. Check Kodi's actual filesystem view
4. Update player path mapping
5. Retest

---

### Problem: Webhook processing fails

**Cause**: Media manager path mapping missing

**Solution**:
1. Check Radarr's configured root folder
2. Add mapping: Radarr path → Metarr library path
3. Process webhook again (retry button)
