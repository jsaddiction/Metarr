# Provider Capabilities

Each external provider has unique strengths. The orchestrator combines them to build complete movie records.

## Provider Summary

| Provider | Metadata | Images | Ratings | Search | Cross-Ref |
|----------|----------|--------|---------|--------|-----------|
| TMDB | Full | Yes | TMDB only | Yes | **Hub** - all IDs |
| OMDB | Partial | Poster only | IMDb, RT, Metacritic | Yes | None |
| Fanart.tv | None | **Best quality** | None | No | Returns TMDB+IMDb |
| TVDB | Full | Yes | None | Yes | IMDb via remoteIds |

---

## TMDB (The Movie Database)

**Role:** Primary backbone - most comprehensive metadata and cross-reference hub.

### Capabilities

| Feature | Details |
|---------|---------|
| **Lookup by** | TMDB ID, IMDb ID, TVDB ID (via /find endpoint) |
| **Search by** | Title, title+year |
| **Returns IDs** | TMDB ID, IMDb ID, TVDB ID |
| **Metadata** | Title, original title, overview, tagline, release date, runtime, status, budget, revenue, homepage, original language, popularity |
| **Ratings** | TMDB rating + vote count |
| **Images** | Posters, backdrops (fanart), logos |
| **Cast/Crew** | Full credits with character names, jobs |
| **Other** | Genres, production companies, countries, keywords, collections |

### Cross-Reference Value

TMDB is the **cross-reference hub**. Its `/find` endpoint can lookup by:
- IMDb ID → Returns TMDB ID + full data
- TVDB ID → Returns TMDB ID + full data

This makes TMDB essential for translating between ID systems.

### Rate Limits

- 40 requests per 10 seconds
- Embedded API key available (no user config required)

---

## OMDB (Open Movie Database)

**Role:** Ratings aggregator - provides scores from multiple sources that TMDB doesn't have.

### Capabilities

| Feature | Details |
|---------|---------|
| **Lookup by** | IMDb ID |
| **Search by** | Title, title+year |
| **Returns IDs** | IMDb ID only |
| **Metadata** | Title, year, rated (content rating), released, runtime, genre, director, writer, actors, plot (short + full), language, country, awards |
| **Ratings** | IMDb rating/votes, Rotten Tomatoes score, Metacritic score |
| **Images** | Single poster URL |

### Unique Data (Not Available Elsewhere)

| Field | Description |
|-------|-------------|
| `Rotten Tomatoes` | Critic score percentage |
| `Metacritic` | Metascore (0-100) |
| `Awards` | Text like "Won 3 Oscars. 95 wins & 85 nominations" |
| `DVD Release` | DVD release date |
| `BoxOffice` | Box office earnings |
| `Short Plot` | Brief synopsis (vs TMDB's full overview only) |

### Cross-Reference Value

**None.** OMDB only returns IMDb ID. Cannot help discover other IDs.

### Rate Limits

- 1,000 requests/day (free tier)
- Requires user-provided API key

### Sources

- [OMDB API](https://www.omdbapi.com/)
- [Zuplo Comparison](https://zuplo.com/learning-center/best-movie-api-imdb-vs-omdb-vs-tmdb)

---

## Fanart.tv

**Role:** High-quality artwork - provides images that TMDB/TVDB don't have.

### Capabilities

| Feature | Details |
|---------|---------|
| **Lookup by** | TMDB ID, IMDb ID, TVDB ID |
| **Search by** | None (no search endpoint) |
| **Returns IDs** | TMDB ID, IMDb ID (in response alongside images) |
| **Metadata** | None |
| **Images** | HD logos, clearart, disc art, banners, backgrounds, posters |

### Image Types

| Type | Description |
|------|-------------|
| `hdmovielogo` | Transparent HD logo |
| `hdmovieclearart` | Character/scene artwork |
| `movieposter` | Alternative posters |
| `moviebackground` | Backgrounds/fanart |
| `moviebanner` | Wide banners |
| `moviedisc` | Disc artwork |
| `moviethumb` | Thumbnails |

### Cross-Reference Value

**Moderate.** Responses include both `tmdb_id` and `imdb_id`. If we query with one, we get the other.

### Rate Limits

- Free tier: 7-day delay on new images
- VIP: Immediate access
- Requires API key (can use project key)

### Sources

- [Fanart.tv API](https://fanarttv.docs.apiary.io/)

---

## TVDB (TheTVDB)

**Role:** TV-focused database that also has movies. Useful for cross-referencing.

### Capabilities

| Feature | Details |
|---------|---------|
| **Lookup by** | TVDB ID, IMDb ID (via /search/remoteid) |
| **Search by** | Title |
| **Returns IDs** | TVDB ID, IMDb ID (via remoteIds field) |
| **Metadata** | Title, overview, year, runtime, status, genres |
| **Images** | Posters, backgrounds, banners |
| **Cast/Crew** | Yes |

### Cross-Reference Value

**Good.** The `/search/remoteid/{imdbId}` endpoint can find movies by IMDb ID, returning TVDB data. The `remoteIds` field in responses provides IMDb ID.

### Rate Limits

- Requires subscription for API access (as of 2020)
- Bearer token authentication (JWT)

### Sources

- [TVDB API](https://thetvdb.com/api-information)
- [TVDB v4 API Docs](https://thetvdb.github.io/v4-api/)

---

## Provider Query Order

### For ID Cross-Referencing

```
1. TMDB (primary hub - can translate any ID)
2. TVDB (backup - can lookup by IMDb ID)
3. Fanart.tv (bonus - responses include both IDs)
```

### For Data Collection (After IDs Known)

```
Parallel queries to all enabled providers:
├── TMDB (metadata + images + cast)
├── OMDB (ratings + awards) - requires IMDb ID
├── Fanart.tv (high-quality images) - any ID works
└── TVDB (additional data) - requires TVDB ID or IMDb ID
```

---

## Data Aggregation Priority

When providers return conflicting data for the same field:

| Field Type | Priority | Rationale |
|------------|----------|-----------|
| Title | TMDB > TVDB > OMDB | TMDB has best i18n support |
| Plot | TMDB > TVDB > OMDB | TMDB overview is most complete |
| Short Plot | OMDB | Only source |
| IMDb Rating | OMDB | Direct from IMDb |
| RT Score | OMDB | Only source |
| Metacritic | OMDB | Only source |
| Awards | OMDB | Only source |
| Images | Fanart.tv > TMDB > TVDB | Fanart.tv has highest quality |
| Cast | TMDB > TVDB | TMDB has most complete credits |

**Note:** Priority order is a proposal. Actual implementation may differ.
