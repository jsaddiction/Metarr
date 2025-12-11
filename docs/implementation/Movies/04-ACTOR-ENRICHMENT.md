# Actor Enrichment (Movie Implementation)

Fetches cast information from TMDB and downloads actor headshots for media player compatibility.

## Purpose

Actor enrichment answers: **"Who is in this movie?"**

- Retrieve full cast list from TMDB
- Download actor profile images (headshots)
- Store actor metadata for NFO generation
- Enable actor-based browsing in media players

## Why Always Enabled

Actor data is **always processed** because:

- Required for accurate NFO generation
- Media players (Kodi, Jellyfin, Plex) expect actor data
- Enables cast browsing and filtering
- Minimal storage/bandwidth impact
- Actor images are shared across movies

---

## Process Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    CAST DATA FETCH                               │
│  Query TMDB /movie/{id}/credits endpoint                        │
│  Retrieve cast with character names and billing order           │
│  Retrieve key crew (director, writer) for NFO                   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                  ACTOR RECORD CREATION                           │
│  Create/update actors table records                             │
│  Store name, TMDB person ID, biography                          │
│  Link actors to media via movie_actors junction                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                   HEADSHOT DOWNLOAD                              │
│  Download profile images for top N cast members                 │
│  Store in content-addressed cache                               │
│  Create actor_images records                                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Cast Limits

Default behavior:

| Limit | Value | Purpose |
|-------|-------|---------|
| Cast processed | Top 20 | Detailed records with images |
| Images downloaded | All with profiles | Headshots for processed cast |
| Full cast stored | Unlimited | Complete cast list (no images) |

---

## Database Schema

### `actors` Table

Global actor records (shared across movies):

| Field | Purpose |
|-------|---------|
| `id` | Internal actor ID |
| `tmdb_id` | TMDB person ID |
| `name` | Actor name |
| `biography` | Optional bio text |
| `birthday` | Birth date |
| `profile_path` | TMDB image path |

### `movie_actors` Junction

Links actors to specific movies with role info:

| Field | Purpose |
|-------|---------|
| `movie_id` | Link to movie |
| `actor_id` | Link to actor |
| `character` | Character name in this movie |
| `order` | Cast billing order |

### `actor_images` Table

| Field | Purpose |
|-------|---------|
| `actor_id` | Link to actor |
| `cache_file_id` | Link to cached headshot |
| `is_primary` | Primary headshot flag |

---

## Headshot Storage

Actor images cached like other assets:

```
/data/cache/actors/{hash[0:2]}/{hash}.jpg
```

**Key efficiency:** Same actor appearing in multiple movies shares one cached headshot.

---

## NFO Integration

Actor data used in NFO generation:

```xml
<actor>
  <name>Actor Name</name>
  <role>Character Name</role>
  <thumb>Actor Name.jpg</thumb>
  <tmdbid>12345</tmdbid>
</actor>
```

When published, headshots copied to:
```
/media/movies/Movie Name (2024)/.actors/
├── Actor Name.jpg
├── Another Actor.jpg
└── ...
```

---

## Deduplication

Actor records are global, not per-movie:

```
First movie with Actor X:
  1. Create actor record (tmdb_id = 12345)
  2. Download headshot
  3. Link to movie via movie_actors

Second movie with Actor X:
  1. Find existing actor record (tmdb_id = 12345)
  2. Headshot already cached - skip download
  3. Link to new movie via movie_actors
```

---

## Error Handling

| Error | Behavior |
|-------|----------|
| No cast data from TMDB | Log warning, continue enrichment |
| Headshot 404 | Skip image, keep actor record |
| TMDB rate limit | Backoff and retry |
| Invalid image | Skip, log error |

---

## Configuration

Actor enrichment has no user-configurable options. It always runs when enrichment is enabled.

---

## Output

After actor enrichment completes:

- `actors` table populated with cast information
- `movie_actors` links actors to this movie
- Headshots cached for primary cast
- Ready for [Trailer Enrichment](./05-TRAILER-ENRICHMENT.md) or [Publishing](./06-PUBLISHING.md)

---

## Related Services

| Service | File | Purpose |
|---------|------|---------|
| `ActorEnrichmentPhase` | `src/services/enrichment/phases/ActorPhase.ts` | Main actor logic |
| `TMDBService` | `src/services/providers/TMDBService.ts` | TMDB API client |
| `ActorService` | `src/services/ActorService.ts` | Actor record management |

---

## Previous Phase

← [Asset Selection](./03-ASSET-SELECTION.md)

## Next Phase

→ [Trailer Enrichment](./05-TRAILER-ENRICHMENT.md) (if `asset_limit_trailer > 0`)
→ [Publishing](./06-PUBLISHING.md) (if trailers disabled)
