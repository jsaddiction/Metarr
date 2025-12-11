# Publishing (Movie Implementation)

Deploys selected assets from cache to the media library and generates NFO metadata files.

## Purpose

Publishing answers: **"How do we make this available to media players?"**

- Copy selected assets from cache to library location
- Apply Kodi/Jellyfin naming conventions
- Generate NFO metadata files
- Create actor headshot directory

## Triggers

| Trigger | Condition |
|---------|-----------|
| Auto-publish | `general.autoPublish = true` after enrichment |
| Manual | User clicks "Publish" in UI |
| Batch | Bulk publish from library view |

---

## Process Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                   ASSET COLLECTION                               │
│  Load all selected assets for movie                             │
│  Include: images, trailer (if downloaded), actor headshots      │
│  Verify cache files exist                                       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                 PATH RESOLUTION                                  │
│  Determine target directory from library settings               │
│  Match movie folder structure                                   │
│  Create directories if needed                                   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                  FILE DEPLOYMENT                                 │
│  Copy cache files to library                                    │
│  Apply naming conventions                                       │
│  Preserve file metadata                                         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                  NFO GENERATION                                  │
│  Build XML structure from metadata                              │
│  Include actor data with local paths                            │
│  Write to movie folder                                          │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                 DATABASE UPDATE                                  │
│  Create library_image_files records                             │
│  Update movie publish status                                    │
│  Record publish timestamp                                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Kodi Naming Conventions

Assets named per Kodi expectations:

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

### Actor Headshots

```
/media/movies/Movie Name (2024)/
├── .actors/
│   ├── Actor Name.jpg
│   ├── Another Actor.jpg
│   └── ...
├── poster.jpg
├── fanart.jpg
├── movie.nfo
└── Movie.Name.2024.mkv
```

---

## NFO Structure

Generated NFO follows Kodi/Emby format:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<movie>
  <title>Movie Title</title>
  <originaltitle>Original Title</originaltitle>
  <year>2024</year>
  <plot>Movie plot description...</plot>
  <outline>Short plot...</outline>
  <tagline>Movie tagline</tagline>
  <runtime>120</runtime>
  <rating>7.5</rating>
  <votes>1234</votes>
  <mpaa>PG-13</mpaa>

  <genre>Action</genre>
  <genre>Adventure</genre>

  <director>Director Name</director>
  <credits>Writer Name</credits>

  <studio>Studio Name</studio>

  <uniqueid type="tmdb" default="true">12345</uniqueid>
  <uniqueid type="imdb">tt1234567</uniqueid>

  <actor>
    <name>Actor Name</name>
    <role>Character Name</role>
    <thumb>Actor Name.jpg</thumb>
    <tmdbid>67890</tmdbid>
  </actor>

  <thumb aspect="poster">poster.jpg</thumb>
  <fanart>
    <thumb>fanart.jpg</thumb>
  </fanart>
</movie>
```

---

## Two-Copy System

Cache and library maintain separate files:

| Location | Purpose |
|----------|---------|
| Cache (`/data/cache/`) | Protected source of truth |
| Library (`/media/movies/`) | Working copies for players |

### Benefits

- **Recovery:** Library deletions don't affect cache
- **Restoration:** Re-publish restores from cache
- **Protection:** Provider removals don't lose assets
- **Flexibility:** Different libraries can use different assets

---

## What Gets Published

| Asset Type | Condition |
|------------|-----------|
| Poster | If selected |
| Fanart | If selected |
| Logo | If selected |
| Banner | If selected |
| Clearart | If selected |
| Disc | If selected |
| Trailer | If downloaded and enabled |
| Actor headshots | Always (actors always enriched) |
| NFO | Always generated |

---

## Database Schema

### `library_image_files` Table

| Column | Purpose |
|--------|---------|
| `media_id` | Link to movie |
| `asset_type` | poster, fanart, etc. |
| `file_path` | Full path in library |
| `cache_file_id` | Source cache file |
| `published_at` | Deployment timestamp |

---

## Configuration

| Setting | Effect |
|---------|--------|
| `general.autoPublish` | Automatic vs manual publishing |
| Library paths | Target directories |

---

## Republishing

User can republish to:

- Update after changing asset selections
- Restore after library file deletion
- Apply updated metadata
- Use new naming conventions

**Republish behavior:** Overwrites existing library files.

---

## Error Handling

| Error | Behavior |
|-------|----------|
| Cache file missing | Log error, skip asset |
| Write permission denied | Fail publish, alert user |
| Disk full | Fail publish, alert user |
| Partial failure | Report which assets failed |

---

## Output

After publishing completes:

- Movie status = `published`
- All selected assets in library folder
- NFO file generated
- Actor headshots in `.actors/` directory
- Media players can scan/import
- Optional: Trigger player sync

---

## Related Services

| Service | File | Purpose |
|---------|------|---------|
| `PublishingService` | `src/services/publishingService.ts` | Main publishing logic |
| `NFOGenerator` | `src/services/NFOGenerator.ts` | NFO file creation |
| `LibraryFileManager` | `src/services/LibraryFileManager.ts` | Library file operations |

---

## Previous Phase

← [Trailer Enrichment](./05-TRAILER-ENRICHMENT.md) or [Actor Enrichment](./04-ACTOR-ENRICHMENT.md)

## Pipeline Complete

Publishing concludes the movie enrichment pipeline:

- Movie fully enriched with metadata from multiple providers
- All selected assets deployed to library
- NFO generated for media player compatibility
- Actor headshots available for cast browsing
- Trailer (if enabled) downloaded and deployed
