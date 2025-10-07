# Free Metadata Provider APIs - Comprehensive Reference

This document catalogs all free (or freemium) metadata provider APIs that can be used for movies, TV shows, music, and other media types. Updated as of 2025.

---

## Movies & TV Shows

### TMDB (The Movie Database)
**Status:** ✅ Free (with attribution)
**Best For:** Primary metadata source for movies and TV
**API Type:** REST API, JSON responses
**Authentication:** API Key (Bearer token)

**Base URLs:**
```
API: https://api.themoviedb.org/3
Images: https://image.tmdb.org/t/p/{size}/{path}
```

**Rate Limits:**
- 40 requests per 10 seconds
- No daily limit (for non-commercial use)

**Data Coverage:**
- ✅ Movie metadata (title, plot, runtime, release date, budget, revenue)
- ✅ TV show metadata (seasons, episodes, air dates)
- ✅ Cast & Crew (actors, directors, writers with profile images)
- ✅ Images (posters, backdrops, logos, actor profiles)
- ✅ Videos (trailers, teasers - YouTube links)
- ✅ Collections (movie franchises)
- ✅ External IDs (IMDB, TVDB cross-reference)
- ✅ Ratings (TMDB vote average, vote count, popularity)
- ✅ Genres, keywords, production companies, countries

**Image Sizes:**
- Posters: w92, w154, w185, w342, w500, w780, **original**
- Backdrops: w300, w780, w1280, **original**
- Profiles: w45, w185, h632, **original**
- Logos: w45, w92, w154, w185, w300, w500, **original**

**Key Endpoints:**
```
GET /search/movie?query={title}&year={year}
GET /movie/{id}?append_to_response=credits,videos,images,keywords
GET /find/{external_id}?external_source=imdb_id
GET /tv/{id}?append_to_response=credits,videos,images
GET /collection/{id}
```

**Pros:**
- Most comprehensive free API
- High-quality images (original resolution)
- Excellent documentation
- Active community
- No daily request limit

**Cons:**
- Requires API key registration
- Commercial use requires negotiation
- Some metadata gaps for older/obscure titles

**Attribution Required:** Yes - display TMDB logo and attribution

**Documentation:** https://developer.themoviedb.org/docs/getting-started

---

### Fanart.tv
**Status:** ✅ Free (API key required)
**Best For:** High-quality artwork, HD logos, clearart
**API Type:** REST API, JSON responses
**Authentication:** API Key (query parameter)

**Base URL:**
```
https://webservice.fanart.tv/v3
```

**Rate Limits:**
- Unknown (be conservative)
- Approved images have 7-day wait time

**Data Coverage:**
- ✅ HD Movie Logos (textless, transparent background)
- ✅ Movie Clearart (high-quality transparent posters)
- ✅ Movie Disc Art (Blu-ray/DVD disc images)
- ✅ Movie Backgrounds (HD backdrops)
- ✅ TV Show Logos & Clearart
- ✅ TV Show Character Art
- ✅ Music Album Art, Artist Thumbs
- ❌ No metadata (requires TMDB/IMDB ID)

**Artwork Types (Movies):**
- `hdmovielogo` - HD logo (transparent PNG)
- `moviebackground` - HD backdrop
- `movieposter` - Alternative posters
- `moviedisc` - Disc art
- `hdmovieclearart` - Clearart (transparent)
- `moviebanner` - Wide banner format
- `moviethumb` - Thumbnail/landscape

**Key Endpoints:**
```
GET /movies/{tmdb_id}?api_key={key}
GET /tv/{tvdb_id}?api_key={key}
GET /movies/latest?api_key={key}
GET /music/{musicbrainz_id}?api_key={key}
```

**Response Example:**
```json
{
  "name": "The Matrix",
  "tmdb_id": "603",
  "imdb_id": "tt0133093",
  "hdmovielogo": [
    {
      "id": "12345",
      "url": "https://assets.fanart.tv/fanart/movies/603/hdmovielogo/...",
      "lang": "en",
      "likes": "15"
    }
  ],
  "moviedisc": [...],
  "hdmovieclearart": [...]
}
```

**Pros:**
- User-contributed artwork (often better than official)
- HD transparent logos (great for UI)
- Disc art and clearart unique to Fanart.tv
- Supports movies, TV, music

**Cons:**
- Requires external ID (TMDB/IMDB/TVDB)
- Coverage depends on community contributions
- 7-day approval delay for new artwork
- No metadata (artwork only)

**Usage Rules:**
- Inform users where images come from
- No commercial use without written consent
- Don't download entire database
- Encourage users to contribute artwork

**API Key:** https://fanart.tv/get-an-api-key/
**Documentation:** https://fanarttv.docs.apiary.io/

---

### Trakt
**Status:** ✅ Free (OAuth required)
**Best For:** User ratings, watch history, trending lists
**API Type:** REST API, JSON responses
**Authentication:** OAuth 2.0 (Client ID + Client Secret)

**Base URL:**
```
https://api.trakt.tv
```

**Rate Limits:**
- 1000 requests per 5 minutes
- User-specific rate limiting

**Data Coverage:**
- ✅ Movie & TV metadata (basic - title, year, overview)
- ✅ User ratings (Trakt community votes)
- ✅ Trending/Popular lists
- ✅ Watch history sync (per-user)
- ✅ User lists & collections
- ✅ Recommendations
- ✅ External IDs (IMDB, TMDB, TVDB)
- ⚠️ Low-res images (posters only, not recommended)
- ❌ No cast/crew details

**Key Endpoints:**
```
GET /movies/{id}?extended=full
GET /movies/trending
GET /movies/popular
GET /search/movie?query={title}
GET /sync/history (requires user OAuth)
```

**Response Example:**
```json
{
  "title": "The Matrix",
  "year": 1999,
  "ids": {
    "trakt": 481,
    "slug": "the-matrix-1999",
    "imdb": "tt0133093",
    "tmdb": 603
  },
  "rating": 8.5,
  "votes": 45231,
  "runtime": 136
}
```

**Pros:**
- Community-driven ratings (alternative to TMDB/IMDB)
- Trending/popular lists (great for discovery)
- User watch history sync (valuable feature)
- Fast API responses

**Cons:**
- Requires OAuth setup for user features
- Limited metadata (use TMDB instead)
- Low-resolution images
- Requires user account for best features

**Use Cases:**
- Supplement TMDB ratings with Trakt community votes
- Sync user watch history across devices
- Trending/popular content lists
- User collections & lists

**API Key:** Create app at https://trakt.tv/oauth/applications
**Documentation:** https://trakt.docs.apiary.io/

---

### OMDb (Open Movie Database)
**Status:** ⚠️ Freemium (1000 requests/day free)
**Best For:** IMDB ratings, Rotten Tomatoes scores
**API Type:** REST API, JSON/XML responses
**Authentication:** API Key (query parameter)

**Base URL:**
```
http://www.omdbapi.com
```

**Rate Limits:**
- **Free tier:** 1000 requests/day
- **Paid tier ($1/month):** No daily limit

**Data Coverage:**
- ✅ IMDB rating (e.g., 8.7/10)
- ✅ Rotten Tomatoes score (when available)
- ✅ Metascore
- ✅ Basic metadata (title, year, plot, runtime)
- ✅ Awards info
- ⚠️ Low-res poster images (not useful)
- ❌ No HD images
- ❌ No cast/crew details
- ❌ Limited TV show support

**Key Endpoints:**
```
GET /?i={imdb_id}&apikey={key}
GET /?t={title}&y={year}&apikey={key}
GET /?s={search_term}&apikey={key}
```

**Response Example:**
```json
{
  "Title": "The Matrix",
  "Year": "1999",
  "imdbRating": "8.7",
  "imdbVotes": "1,234,567",
  "Metascore": "73",
  "Ratings": [
    {"Source": "Internet Movie Database", "Value": "8.7/10"},
    {"Source": "Rotten Tomatoes", "Value": "88%"},
    {"Source": "Metacritic", "Value": "73/100"}
  ]
}
```

**Pros:**
- IMDB ratings (trusted source)
- Rotten Tomatoes scores
- Simple API (easy integration)
- Cheap paid tier ($1/month)

**Cons:**
- 1000/day limit (restrictive for large libraries)
- Low-res images (300x450px posters)
- Limited metadata vs TMDB
- No cast/crew/images

**Use Cases:**
- Add IMDB rating to movie cards
- Show Rotten Tomatoes score
- Cross-reference IMDB IDs

**API Key:** https://www.omdbapi.com/apikey.aspx
**Documentation:** https://www.omdbapi.com/

---

### TVDB (TheTVDB)
**Status:** ✅ Free (API v4)
**Best For:** TV show metadata (seasons, episodes)
**API Type:** REST API, JSON responses
**Authentication:** JWT token (requires login)

**Base URL:**
```
https://api4.thetvdb.com/v4
```

**Rate Limits:**
- Unknown (likely generous)
- Token expires after 24 hours

**Authentication Flow:**
```
1. POST /login with API key
2. Receive JWT token
3. Include in headers: Authorization: Bearer {token}
4. Refresh token every 24 hours
```

**Data Coverage:**
- ✅ TV show metadata (title, overview, air dates)
- ✅ Season & episode details
- ✅ Episode runtime, air dates
- ✅ Images (posters, banners, backgrounds)
- ✅ Actors & crew
- ✅ External IDs (IMDB, TMDB)
- ✅ Genre, network info
- ❌ Limited movie support

**Key Endpoints:**
```
POST /login
GET /series/{id}/extended
GET /seasons/{season_id}/extended
GET /search?query={title}&type=series
```

**Response Example:**
```json
{
  "data": {
    "id": 81189,
    "name": "Breaking Bad",
    "overview": "...",
    "firstAired": "2008-01-20",
    "averageRuntime": 47,
    "seasons": [
      {"id": 30272, "number": 1, "name": "Season 1"}
    ],
    "remoteIds": [
      {"id": "tt0903747", "type": 2, "sourceName": "IMDB"}
    ]
  }
}
```

**Pros:**
- Best free TV show database
- Detailed episode information
- Active community
- Good image coverage

**Cons:**
- JWT token management (expires 24h)
- Primarily TV shows (limited movies)
- API v4 relatively new (documentation improving)

**Use Cases:**
- TV show episode tracking
- Season/episode metadata
- TV show images
- Cross-reference with TMDB for TV

**API Key:** https://thetvdb.com/api-information
**Documentation:** https://thetvdb.github.io/v4-api/

---

## Music

### MusicBrainz
**Status:** ✅ Free (open source)
**Best For:** Music metadata (albums, artists, releases)
**API Type:** REST API, XML/JSON responses
**Authentication:** None (User-Agent header required)

**Base URL:**
```
https://musicbrainz.org/ws/2
```

**Rate Limits:**
- **1 request per second** (strict)
- Honor `X-RateLimit-*` headers
- Consider running local mirror for heavy use

**Required Headers:**
```
User-Agent: Metarr/1.0.0 ( contact@yourapp.com )
```

**Data Coverage:**
- ✅ Artist metadata (name, bio, aliases)
- ✅ Album/release metadata (title, date, label)
- ✅ Track listings
- ✅ Genres & tags
- ✅ Relationships (artist → album → track)
- ✅ ISRCs, barcodes, catalog numbers
- ❌ No images (use Cover Art Archive)

**Key Endpoints:**
```
GET /release?query=artist:{artist}%20AND%20release:{album}&fmt=json
GET /artist/{mbid}?inc=releases&fmt=json
GET /recording/{mbid}?inc=artist-credits&fmt=json
```

**Pros:**
- Open source (can self-host)
- Comprehensive music database
- No API key required
- Accurate metadata (community-curated)

**Cons:**
- 1 req/sec limit (very strict)
- No images (requires Cover Art Archive)
- Complex query syntax (Lucene)
- User-Agent header required

**Documentation:** https://musicbrainz.org/doc/MusicBrainz_API

---

### Cover Art Archive
**Status:** ✅ Free (companion to MusicBrainz)
**Best For:** Album cover art
**API Type:** REST API, image downloads
**Authentication:** None

**Base URL:**
```
https://coverartarchive.org
```

**Rate Limits:**
- Be reasonable (no scraping)
- Use MusicBrainz IDs

**Data Coverage:**
- ✅ Album cover art (front, back)
- ✅ Booklet images
- ✅ Multiple releases per album
- ❌ Artist images (use Fanart.tv)

**Key Endpoints:**
```
GET /release/{mbid}
GET /release/{mbid}/front (redirect to image)
GET /release-group/{mbid}
```

**Pros:**
- High-quality images
- Multiple releases per album
- Free and open

**Cons:**
- Requires MusicBrainz ID
- Coverage depends on community uploads
- No artist images

**Documentation:** https://coverartarchive.org/

---

### Last.fm
**Status:** ✅ Free (API key required)
**Best For:** Music scrobbling, artist info, similar artists
**API Type:** REST API, XML/JSON
**Authentication:** API Key + Secret (for user auth)

**Base URL:**
```
https://ws.audioscrobbler.com/2.0
```

**Rate Limits:**
- Not strictly documented (be reasonable)
- ~5 requests/second recommended

**Data Coverage:**
- ✅ Artist info (bio, tags, similar artists)
- ✅ Album info (tracks, tags)
- ✅ User scrobbles (play history)
- ✅ Artist images (various sizes)
- ✅ Tags & genres
- ⚠️ Metadata less accurate than MusicBrainz

**Key Endpoints:**
```
GET /?method=artist.getInfo&artist={name}&api_key={key}&format=json
GET /?method=album.getInfo&artist={name}&album={name}&api_key={key}
GET /?method=track.getInfo&artist={name}&track={name}&api_key={key}
```

**Pros:**
- Artist images (MusicBrainz doesn't have)
- User scrobbling (play history)
- Similar artist recommendations
- Tags & genre discovery

**Cons:**
- Metadata less reliable than MusicBrainz
- API somewhat dated
- Requires API key

**API Key:** https://www.last.fm/api/account/create
**Documentation:** https://www.last.fm/api

---

## Audio Theme Music / Soundtracks

### ThemeSongs (Research Needed)
**Status:** 🔍 Research required
**Notes:** No known free API for TV theme songs. Potential sources:
- YouTube (manual extraction)
- SoundCloud (limited API)
- User-uploaded libraries

**Alternative Approach:**
- Store YouTube links for theme songs
- Use YouTube metadata API (free)
- Community-contributed theme song database?

---

## Multi-Media / General

### Wikipedia API
**Status:** ✅ Free
**Best For:** Actor bios, movie trivia, historical context
**API Type:** REST API, JSON
**Authentication:** None

**Base URL:**
```
https://en.wikipedia.org/w/api.php
```

**Data Coverage:**
- ✅ Article text (biographies, plot summaries)
- ✅ Images (often public domain)
- ✅ Infobox data
- ⚠️ Unstructured (requires parsing)

**Use Cases:**
- Actor biographies (supplement TMDB)
- Movie trivia sections
- Historical context for older films

**Documentation:** https://www.mediawiki.org/wiki/API:Main_page

---

### Wikidata
**Status:** ✅ Free (open data)
**Best For:** Structured data (IDs, relationships, metadata)
**API Type:** SPARQL queries, JSON
**Authentication:** None

**Base URL:**
```
https://query.wikidata.org/sparql
```

**Data Coverage:**
- ✅ External IDs (IMDB, TMDB, TVDB cross-reference)
- ✅ Relationships (director → film → actor)
- ✅ Awards, nominations
- ✅ Release dates, runtimes
- ⚠️ Complex query language (SPARQL)

**Use Cases:**
- Find missing external IDs
- Cross-reference databases
- Build relationship graphs

**Documentation:** https://www.wikidata.org/wiki/Wikidata:SPARQL_query_service

---

## Provider Summary Table

| Provider | Media Type | Auth | Rate Limit | Images | Metadata | Cost |
|----------|-----------|------|------------|--------|----------|------|
| **TMDB** | Movies, TV | API Key | 40/10s | ✅ HD | ✅ Full | Free |
| **Fanart.tv** | Movies, TV, Music | API Key | Unknown | ✅ HD Art | ❌ None | Free |
| **Trakt** | Movies, TV | OAuth | 1000/5min | ⚠️ Low-res | ⚠️ Basic | Free |
| **OMDb** | Movies | API Key | 1000/day | ❌ Low-res | ⚠️ Basic | $1/mo |
| **TVDB** | TV Shows | JWT | Unknown | ✅ Medium | ✅ Full | Free |
| **MusicBrainz** | Music | None | 1/sec | ❌ None | ✅ Full | Free |
| **Cover Art** | Music | None | Unknown | ✅ HD | ❌ None | Free |
| **Last.fm** | Music | API Key | ~5/sec | ✅ Medium | ⚠️ Basic | Free |
| **Wikipedia** | All | None | None | ⚠️ Mixed | ⚠️ Text | Free |
| **Wikidata** | All | None | None | ❌ None | ✅ IDs | Free |

---

## Recommended Provider Stack by Media Type

### Movies
1. **TMDB** - Primary (metadata, images, cast, ratings)
2. **Fanart.tv** - Supplemental (HD logos, clearart, disc art)
3. **OMDb** - Ratings only (IMDB, Rotten Tomatoes)
4. **Trakt** - Optional (community ratings, trending lists)

### TV Shows
1. **TMDB** - Primary (metadata, images, cast)
2. **TVDB** - Supplemental (episode details, air dates)
3. **Fanart.tv** - Artwork (logos, clearart)
4. **Trakt** - Optional (watch history, ratings)

### Music
1. **MusicBrainz** - Primary (metadata, artist/album/track info)
2. **Cover Art Archive** - Album covers
3. **Last.fm** - Artist images, user scrobbles
4. **Fanart.tv** - Artist logos, album art

### Actor/Person Info
1. **TMDB** - Primary (filmography, profile images)
2. **Wikipedia** - Biographies
3. **Wikidata** - Cross-reference IDs

---

## Implementation Notes

### Cache Strategy (All Providers)
- **Metadata:** Database storage (no Redis)
- **Images:** Filesystem cache `cache/images/{media_type}/[A-Z0-9]/{uuid}.{ext}`
- **API Responses:** Database table `provider_cache` (7-30 day TTL)

### Rate Limiting
- Implement per-provider rate limiter
- Queue requests when approaching limits
- Exponential backoff on 429 errors

### Error Handling
- Graceful degradation (continue on provider failure)
- Log all errors for debugging
- Circuit breaker pattern (stop calling failed providers)

### Field Locking
- **NEVER** overwrite locked fields
- Provider updates only touch unlocked fields
- User edits auto-lock fields

---

## Future Provider Research

### Audio Theme Songs
- YouTube API (links only, not downloads)
- TelevisionTunes.com (manual database?)
- User-contributed theme song library

### Anime-Specific
- AniDB (anime metadata)
- AniList (user ratings, watch lists)
- MyAnimeList (community ratings)

### Game Metadata (Future)
- IGDB (games, covers, screenshots)
- Giant Bomb (game metadata)

---

**Document Version:** 1.0
**Last Updated:** 2025-01-05
**Maintained By:** Metarr Development Team
