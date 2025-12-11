# Data Collection (Scraping Step 2)

The second step of scraping: gather all available data from all enabled providers and record it to the cache.

## Purpose

After [Identification](./IDENTIFICATION.md) confirms what movie this is, data collection answers: **"What do we know about it?"**

- Query all enabled providers with available IDs
- Collect metadata, images, videos, cast, crew, ratings
- Store everything in provider_cache tables
- Make data available for enrichment

---

## What Gets Collected

### From TMDB (Primary)

| Data Type | API Endpoint | Storage |
|-----------|--------------|---------|
| Metadata | `/movie/{id}` | provider_cache_movies |
| Images | `/movie/{id}/images` | provider_cache_images |
| Videos | `/movie/{id}/videos` | provider_cache_videos |
| Cast | `/movie/{id}/credits` | provider_cache_movie_cast |
| Crew | `/movie/{id}/credits` | provider_cache_movie_crew |
| External IDs | `/movie/{id}/external_ids` | Cross-ref table |
| Keywords | `/movie/{id}/keywords` | provider_cache_keywords |

### From OMDB (Ratings & Awards)

| Data Type | API Endpoint | Storage |
|-----------|--------------|---------|
| IMDb Rating | `/?i={imdb_id}` | provider_cache_movies |
| Rotten Tomatoes | `/?i={imdb_id}` | provider_cache_movies |
| Metacritic | `/?i={imdb_id}` | provider_cache_movies |
| Awards | `/?i={imdb_id}` | provider_cache_movies |
| Short Plot | `/?i={imdb_id}` | provider_cache_movies (outline) |

### From Fanart.tv (High-Quality Artwork)

| Image Type | API Field | Asset Type |
|------------|-----------|------------|
| HD Logo | `hdmovielogo` | clearlogo |
| HD Clearart | `hdmovieclearart` | clearart |
| Movie Poster | `movieposter` | poster |
| Movie Background | `moviebackground` | fanart |
| Movie Banner | `moviebanner` | banner |
| Movie Disc | `moviedisc` | discart |
| Movie Thumb | `moviethumb` | thumb |

### From TVDB (Supplemental)

| Data Type | API Endpoint | Storage |
|-----------|--------------|---------|
| Metadata | `/movies/{id}` | provider_cache_movies |
| Images | `/movies/{id}/artworks` | provider_cache_images |
| Remote IDs | `/movies/{id}` (remoteIds) | Cross-ref table |

---

## Collection Flow

```
Identity confirmed (have TMDB ID + cross-refs)
    │
    ├──► Query TMDB (REQUIRED)
    │         ├──► /movie/{id} → metadata
    │         ├──► /movie/{id}/images → posters, backdrops
    │         ├──► /movie/{id}/videos → trailers, clips
    │         ├──► /movie/{id}/credits → cast, crew
    │         └──► /movie/{id}/external_ids → social links
    │
    ├──► Query OMDB (if IMDb ID available)
    │         └──► /?i={imdb_id} → ratings, awards, outline
    │
    ├──► Query Fanart.tv (if enabled)
    │         └──► /movies/{tmdb_id} → high-quality artwork
    │
    └──► Query TVDB (if enabled, rare for movies)
              └──► /movies/{id} → supplemental data

All queries run in parallel when possible
```

---

## Provider Priority for Shared Fields

When multiple providers return the same field, use priority order:

| Field | Priority | Rationale |
|-------|----------|-----------|
| Title | OMDB > TMDB | OMDB curates carefully |
| Plot | OMDB > TMDB | OMDB provides both short and full |
| Runtime | OMDB > TMDB | Often more accurate |
| Release Date | OMDB > TMDB | Direct from source |
| Content Rating | OMDB > TMDB | US MPAA rating |
| Tagline | TMDB only | OMDB doesn't provide |

**Exclusive Fields:**
- IMDb/RT/Metacritic ratings → OMDB only
- Awards → OMDB only
- HD logos/clearart → Fanart.tv only
- Full credits (character names) → TMDB only

---

## Cache Storage

### provider_cache_movies

Core metadata for the movie:

```
provider_cache_movies
├── tmdb_id (primary identifier)
├── imdb_id, tvdb_id (cross-references)
├── title, original_title
├── tagline, overview, outline
├── release_date, year, runtime
├── content_rating, status
├── tmdb_rating, tmdb_votes
├── imdb_rating, imdb_votes
├── rotten_tomatoes_score, metacritic_score
├── awards
├── budget, revenue, popularity
├── fetched_at, expires_at
└── raw_response (full JSON for re-processing)
```

### provider_cache_images

All discovered image URLs:

```
provider_cache_images
├── movie_id (FK to provider_cache_movies)
├── provider_name (tmdb, fanart.tv, tvdb)
├── image_type (poster, backdrop, logo, etc.)
├── file_path (URL or path)
├── width, height (from provider, unverified)
├── vote_average, vote_count
├── language (iso_639_1)
├── is_hd (boolean)
└── fetched_at
```

### provider_cache_videos

Trailers and clips:

```
provider_cache_videos
├── movie_id (FK to provider_cache_movies)
├── provider_name
├── video_type (trailer, teaser, clip, featurette)
├── site (YouTube, Vimeo)
├── key (video ID)
├── name (video title)
├── language
├── is_official (boolean)
├── duration_seconds
└── fetched_at
```

### provider_cache_movie_cast / _crew

Credits:

```
provider_cache_movie_cast
├── movie_id
├── person_id (TMDB person ID)
├── name
├── character_name
├── cast_order
├── profile_path (headshot URL)
└── fetched_at

provider_cache_movie_crew
├── movie_id
├── person_id
├── name
├── job (Director, Writer, etc.)
├── department
├── profile_path
└── fetched_at
```

---

## Error Handling

### Provider Failures

| Failure | Behavior |
|---------|----------|
| TMDB fails | Critical - abort collection, retry later |
| OMDB fails | Continue - lose ratings/awards |
| Fanart.tv fails | Continue - lose HD artwork |
| TVDB fails | Continue - minimal impact for movies |

### Rate Limits

| Mode | On 429 |
|------|--------|
| Automated | Skip this provider, continue with others, retry on next scheduled run |
| User-initiated | Retry 2-3 times with backoff, then fail gracefully |

### Partial Data

If some providers fail but TMDB succeeds:
- Cache what we have
- Mark as incomplete for retry
- Continue to enrichment with available data

---

## Cache TTL

| Provider | Default TTL | Rationale |
|----------|-------------|-----------|
| TMDB | 7 days | Metadata rarely changes |
| OMDB | 7 days | Ratings update slowly |
| Fanart.tv | 24 hours | New images added frequently |
| TVDB | 7 days | Metadata rarely changes |

**Bypass TTL:**
- User clicks "Re-scrape" → Force refresh
- Re-identification → Full invalidation and re-scrape

---

## Output

After data collection completes:

```
provider_cache tables fully populated:
├── provider_cache_movies (metadata + ratings)
├── provider_cache_images (all image URLs)
├── provider_cache_videos (trailers, clips)
├── provider_cache_movie_cast (actors)
├── provider_cache_movie_crew (directors, writers)
└── Cross-reference table (all IDs linked)

Ready for ENRICHMENT to consume
```

---

## Next Step

After data collection, the enrichment process consumes cached data:
→ [Enrichment Pipeline](../../Enrichment/README.md) - Copy to movies table, select assets

## Related Documents

- [README.md](./README.md) - Scraping overview
- [IDENTIFICATION.md](./IDENTIFICATION.md) - Step 1: Identification
- [PROVIDERS.md](./PROVIDERS.md) - Provider capabilities
- [CACHING.md](./CACHING.md) - Cache architecture
