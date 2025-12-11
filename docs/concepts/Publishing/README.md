# Publishing

Publishing deploys selected assets from the protected cache to the media library and generates NFO metadata files for media players.

## What is Publishing?

Given enriched media with selected assets in cache, publishing:

1. **Copies** assets from cache to library location
2. **Applies** player-specific naming conventions
3. **Generates** NFO metadata files
4. **Records** library file references in database

```
INPUT: Enriched media item with selected assets in cache
    │
    └──► PUBLISHING
              │
              ├──► Step 1: COLLECT
              │         └──► Gather all selected assets from cache
              │         └──► Verify cache files exist
              │
              ├──► Step 2: DEPLOY
              │         └──► Copy to library location
              │         └──► Apply naming conventions (Kodi format)
              │
              ├──► Step 3: GENERATE
              │         └──► Build NFO from metadata
              │         └──► Include actor data with local paths
              │
              └──► Step 4: RECORD
                        └──► Create library_image_files records
                        └──► Update publish status and timestamp

OUTPUT: Library folder with assets and NFO ready for media players
```

## Why Publishing?

Publishing bridges the gap between Metarr's protected cache and media player expectations.

**Without publishing:**
- Assets sit in content-addressed cache (hash-based names)
- Media players can't find or use them
- No NFO file for metadata import

**After publishing:**
- Assets in library with proper naming (`poster.jpg`, `fanart.jpg`)
- NFO file with all metadata for Kodi/Jellyfin/Plex
- Actor headshots in `.actors/` directory

## Two-Copy System

Publishing creates **working copies**, not moves:

| Location | Purpose |
|----------|---------|
| Cache (`/data/cache/`) | Protected source of truth |
| Library (`/media/movies/`) | Working copies for players |

**Benefits:**
- Library deletions don't affect cache
- Re-publish restores from cache
- Provider removals don't lose assets
- Different libraries can use different selections

## Triggers

| Trigger | Condition |
|---------|-----------|
| Auto-publish | `autoPublish = true` after enrichment completes |
| Manual | User clicks "Publish" in UI |
| Batch | Bulk publish from library view |
| Republish | User requests update after changes |

## Core Concepts

### Naming Conventions

Assets named per Kodi/Jellyfin expectations:

| Asset Type | Filename |
|------------|----------|
| Poster | `poster.jpg` |
| Fanart | `fanart.jpg` |
| Logo | `logo.png` |
| Clearart | `clearart.png` |
| Banner | `banner.jpg` |
| Disc | `disc.png` |
| Trailer | `movie-trailer.mp4` |
| NFO | `movie.nfo` |

### NFO Generation

NFO files contain all metadata in Kodi-compatible XML format:
- Title, year, plot, runtime, ratings
- Genres, studios, directors, writers
- Cast with character names and headshot paths
- Provider IDs (TMDB, IMDb)
- Artwork references

### Republishing

Republish to:
- Update after changing asset selections
- Restore after library file deletion
- Apply updated metadata
- Sync new naming conventions

## Implementation

For movie-specific implementation details:
→ [Movies: 06-PUBLISHING.md](../../implementation/Movies/06-PUBLISHING.md)

## Related Documentation

- [Enrichment](../Enrichment/README.md) - Previous job (provides selected assets)
- [Caching](../Enrichment/CACHING.md) - Where assets come from
