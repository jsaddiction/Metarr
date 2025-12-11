# Player Sync Implementation

Implementation details for player synchronization. See [Operational Concepts](../../concepts/PlayerSync/) for design principles.

## Player-Specific Implementation

| Player | Documentation | Status |
|--------|---------------|--------|
| [Kodi](./KODI.md) | JSON-RPC API integration | ✅ Full |
| Jellyfin | REST API integration | ⚠️ Partial |
| Plex | Media Server API | ⚠️ Partial |

## Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `MediaPlayerConnectionManager` | `src/services/MediaPlayerConnectionManager.ts` | Connection pooling and health |
| `KodiClient` | `src/services/players/KodiClient.ts` | Kodi JSON-RPC client |
| `PathMappingService` | `src/services/PathMappingService.ts` | Path translation |

## Related Documentation

- [Player Sync Concepts](../../concepts/PlayerSync/) - Design principles
- [NFO Format](../../reference/NFO_FORMAT.md) - Kodi NFO specification
