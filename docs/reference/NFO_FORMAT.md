# NFO File Format Reference

**Purpose**: Complete reference for parsing and writing Kodi-format NFO files.

**Related Docs**:
- Parent: [Reference Documentation](../INDEX.md#reference-technical-details)
- Related: [Scanning Phase](../concepts/Scanning/README.md), [Publishing Phase](../concepts/Publishing/README.md)

---

## Quick Reference

**NFO Files**: XML or plain text files storing metadata for media files. Industry standard used by Kodi, Jellyfin, Plex.

**File Types**:
1. **XML Format** - Full metadata in Kodi XML schema
2. **URL Format** - Simple text file with provider URLs

**Location Patterns**:
- Movies: `movie.nfo` or `{MovieName}.nfo` in movie directory
- TV Shows: `tvshow.nfo` in show directory
- Episodes: `{S00E00}.nfo` alongside episode file

---

## Movie NFO Structure

**XML Example**:
```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<movie>
  <!-- Provider IDs -->
  <uniqueid type="tmdb" default="true">603</uniqueid>
  <uniqueid type="imdb">tt0133093</uniqueid>

  <!-- Basic Information -->
  <title>The Matrix</title>
  <originaltitle>The Matrix</originaltitle>
  <sorttitle>Matrix, The</sorttitle>
  <year>1999</year>

  <!-- Plot -->
  <plot>Set in the 22nd century...</plot>
  <outline>A computer hacker learns...</outline>
  <tagline>Welcome to the Real World.</tagline>

  <!-- Classification -->
  <mpaa>R</mpaa>
  <country>United States of America</country>

  <!-- Runtime & Dates -->
  <runtime>136</runtime>
  <premiered>1999-03-31</premiered>

  <!-- User Data -->
  <userrating>9.5</userrating>

  <!-- Ratings -->
  <ratings>
    <rating name="tmdb" max="10" default="true">
      <value>8.2</value>
      <votes>23456</votes>
    </rating>
  </ratings>

  <!-- People -->
  <actor>
    <name>Keanu Reeves</name>
    <role>Neo</role>
    <order>0</order>
    <thumb>https://image.tmdb.org/t/p/original/abc123.jpg</thumb>
  </actor>

  <director>Lana Wachowski</director>
  <credits>Lana Wachowski</credits>

  <!-- Studios & Production -->
  <studio>Warner Bros.</studio>

  <!-- Genres -->
  <genre>Action</genre>
  <genre>Science Fiction</genre>

  <!-- Collections/Sets -->
  <set>
    <name>The Matrix Collection</name>
    <overview>The complete Matrix trilogy...</overview>
  </set>

  <!-- Tags -->
  <tag>Cyberpunk</tag>
</movie>
```

---

## TV Show NFO Structure

**Show-level (tvshow.nfo)**:
```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<tvshow>
  <!-- Provider IDs -->
  <uniqueid type="tmdb" default="true">1396</uniqueid>
  <uniqueid type="tvdb">81189</uniqueid>

  <!-- Basic Information -->
  <title>Breaking Bad</title>
  <year>2008</year>

  <!-- Plot -->
  <plot>A high school chemistry teacher...</plot>

  <!-- Classification -->
  <mpaa>TV-MA</mpaa>
  <status>Ended</status>

  <!-- Dates -->
  <premiered>2008-01-20</premiered>

  <!-- People, Ratings, Genres... -->
</tvshow>
```

**Episode-level (S01E01.nfo)**:
```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<episodedetails>
  <!-- Episode Numbering -->
  <season>1</season>
  <episode>1</episode>

  <!-- Basic Information -->
  <title>Pilot</title>
  <showtitle>Breaking Bad</showtitle>

  <!-- Plot -->
  <plot>High school chemistry teacher...</plot>

  <!-- Dates & Runtime -->
  <aired>2008-01-20</aired>
  <runtime>58</runtime>

  <!-- User Data & Ratings -->
  <userrating>8.5</userrating>
  <watched>true</watched>
</episodedetails>
```

---

## URL Format

Simple text files containing provider URLs for automated metadata fetching.

**Movie URL NFO** (`movie.nfo`):
```
https://www.themoviedb.org/movie/603
```

**Or with multiple IDs**:
```
https://www.themoviedb.org/movie/603
https://www.imdb.com/title/tt0133093
```

**TV Show URL NFO** (`tvshow.nfo`):
```
https://www.themoviedb.org/tv/1396
```

### URL Extraction Patterns

| Provider | URL Pattern | Extracted ID |
|----------|-------------|--------------|
| TMDB Movie | `https://www.themoviedb.org/movie/{id}` | `tmdb_id` |
| TMDB TV | `https://www.themoviedb.org/tv/{id}` | `tmdb_id` |
| IMDB | `https://www.imdb.com/title/{id}` | `imdb_id` |
| TVDB | `https://www.thetvdb.com/series/{id}` | `tvdb_id` |

---

## Tag Mapping Reference

### Provider ID Tags

| XML Tag | Alternative Tags | Database Column | Example |
|---------|-----------------|-----------------|---------|
| `<uniqueid type="tmdb">` | `<tmdbid>`, `<id>` | `tmdb_id` | `603` |
| `<uniqueid type="imdb">` | `<imdbid>` | `imdb_id` | `tt0133093` |
| `<uniqueid type="tvdb">` | `<tvdbid>` | `tvdb_id` | `81189` |

**Parsing Priority**:
1. `<uniqueid>` tags (Kodi v18+)
2. Specific ID tags (`<tmdbid>`, `<imdbid>`, `<tvdbid>`)
3. Generic `<id>` tag (ambiguous, lowest priority)

---

### Basic Information Tags

| XML Tag | Database Column | Value Type |
|---------|----------------|------------|
| `<title>` | `title` | String (required) |
| `<originaltitle>` | `original_title` | String |
| `<sorttitle>` | `sort_title` | String |
| `<year>` | `year` | Integer |

---

### Plot & Description Tags

| XML Tag | Database Column | Value Type |
|---------|----------------|------------|
| `<plot>` | `plot` | Text (full synopsis) |
| `<outline>` | `outline` | Text (short summary) |
| `<tagline>` | `tagline` | String |

---

### Classification Tags

| XML Tag | Database Column | Example |
|---------|----------------|---------|
| `<mpaa>` | `mpaa` | `R`, `PG-13`, `TV-MA` |
| `<certification>` | `mpaa` | Alternative to `<mpaa>` |
| `<status>` | `status` | `Continuing`, `Ended` (TV shows) |

---

### Runtime & Dates Tags

| XML Tag | Database Column | Value Type | Notes |
|---------|----------------|------------|-------|
| `<runtime>` | `runtime` | Integer (minutes) | See Runtime Policy below |
| `<premiered>` | `premiered` | String (`YYYY-MM-DD`) | Release date |
| `<releasedate>` | `premiered` | String (`YYYY-MM-DD`) | Alternative |
| `<aired>` | `aired` | String (`YYYY-MM-DD`) | Episode air date |

**Runtime Field Policy**:
- **NFO Runtime IS Parsed**: Stored in `movies.runtime` (minutes)
- **FFprobe Runtime is Authoritative**: Stored in `video_streams.duration_seconds` (seconds)
- **Source Priority**: Display uses NFO runtime, playback uses FFprobe runtime

**Why Both?**:
- NFO/provider runtime = theatrical/advertised runtime
- FFprobe runtime = actual file duration (includes credits, post-credit scenes)
- Example: Movie advertised as "120 minutes" may have file duration of 125 minutes

---

### User Data Tags

| XML Tag | Database Column | Value Type | Notes |
|---------|----------------|------------|-------|
| `<userrating>` | `user_rating` | Real (0-10) | CHECK constraint enforces range |
| `<watched>` | - | Boolean | Playback state (not stored by Metarr) |
| `<playcount>` | - | Integer | Watch count (not stored by Metarr) |

**Supported Media**:
- Movies: `movies.user_rating`
- TV Shows: `series.user_rating`
- Episodes: `episodes.user_rating`

---

### Ratings Tags

**Multiple rating sources in single NFO**:
```xml
<ratings>
  <rating name="tmdb" max="10" default="true">
    <value>8.2</value>
    <votes>23456</votes>
  </rating>
  <rating name="imdb" max="10">
    <value>8.7</value>
    <votes>1876543</votes>
  </rating>
</ratings>
```

**Mapping**:
- `name` → `ratings.source`
- `value` → `ratings.value`
- `votes` → `ratings.votes`
- `default="true"` → `ratings.is_default`

---

### People Tags

**Actors**:
```xml
<actor>
  <name>Keanu Reeves</name>      <!-- actors.name -->
  <role>Neo</role>               <!-- movies_actors.role -->
  <order>0</order>               <!-- movies_actors.order_index -->
  <thumb>https://...</thumb>     <!-- actors.thumb_url -->
</actor>
```

**Directors**:
```xml
<director>Christopher Nolan</director>
```

**Writers** (Credits):
```xml
<credits>Christopher Nolan</credits>
```

---

### Studios & Production Tags

```xml
<studio>Warner Bros.</studio>
```

**Mapping**: Create/find studio in `studios` table, link in `movies_studios`.

---

### Genre Tags

```xml
<genre>Action</genre>
<genre>Science Fiction</genre>
```

**Mapping**: Create/find genre in `genres` table, link in `movies_genres`.

---

### Country Tags

```xml
<country>United States of America</country>
```

**Mapping**: Create/find country in `countries` table, link in `movie_countries` or `series_countries`.

---

### Tag Tags

```xml
<tag>Cyberpunk</tag>
<tag>Dystopia</tag>
```

**Mapping**: Create/find tag in `tags` table, link in `movie_tags` or `series_tags`.

---

### Collection/Set Tags

```xml
<set>
  <name>The Matrix Collection</name>
  <overview>The complete Matrix trilogy...</overview>
</set>
```

**Mapping**: Create/find set in `sets` table by `name`, set `movies.set_id`.

---

## URL Elements Policy

**CRITICAL**: Certain NFO elements containing URLs are **NEVER parsed or written** by Metarr.

### Never Parsed Elements

| Element | Reason | Alternative |
|---------|--------|-------------|
| `<trailer>` (URLs) | URLs outdated; causes player to navigate to URL | Filesystem discovery of local trailer files |
| `<thumb>` (image URLs) | Provider URLs may be broken | Filesystem discovery + cache-first architecture |
| `<fanart><thumb>` (URLs) | Provider URLs may be broken | Filesystem discovery + cache-first architecture |

### Never Written Elements

When Metarr generates NFO files:
- `<trailer>` element **NEVER included** (even if local trailers exist)
- `<thumb>` and `<fanart>` elements **NEVER included**
- Local trailer files discovered independently by media players via filename patterns
- Images discovered via filesystem scanning (standard Kodi patterns)

**Rationale**:
1. **Trailer URLs**: Kodi navigates to URL on playback, overriding local files. May link to removed/geoblocked videos.
2. **Image URLs**: Provider URLs may become invalid after upgrades or API changes. Filesystem scanning is authoritative.

---

## Parsing Algorithm

### Step 1: Detect NFO Format

```typescript
function detectNFOFormat(content: string): 'xml' | 'url' {
  const trimmed = content.trim();
  if (trimmed.startsWith('<?xml') || trimmed.startsWith('<')) {
    return 'xml';
  }
  if (trimmed.match(/^https?:\/\//)) {
    return 'url';
  }
  throw new Error('Invalid NFO format');
}
```

---

### Step 2: Parse XML NFO

**Extract Provider IDs**:
```typescript
function extractTMDBId(movie: any): number | null {
  // Priority 1: <uniqueid type="tmdb">
  if (Array.isArray(movie.uniqueid)) {
    const tmdbUnique = movie.uniqueid.find((u: any) => u['@_type'] === 'tmdb');
    if (tmdbUnique) return parseInt(tmdbUnique['#text']);
  } else if (movie.uniqueid && movie.uniqueid['@_type'] === 'tmdb') {
    return parseInt(movie.uniqueid['#text']);
  }

  // Priority 2: <tmdbid>
  if (movie.tmdbid) {
    return parseInt(movie.tmdbid);
  }

  // Priority 3: <id> (ambiguous)
  if (movie.id && !movie.imdbid && !movie.tvdbid) {
    return parseInt(movie.id);
  }

  return null;
}
```

**Parse Arrays**:
```typescript
function parseActors(actorData: any): Actor[] {
  if (!actorData) return [];

  const actors = Array.isArray(actorData) ? actorData : [actorData];

  return actors.map((actor, index) => ({
    name: actor.name,
    role: actor.role,
    order_index: actor.order !== undefined ? parseInt(actor.order) : index,
    thumb_url: actor.thumb
  }));
}

function parseGenres(genreData: any): string[] {
  if (!genreData) return [];
  return Array.isArray(genreData) ? genreData : [genreData];
}
```

---

### Step 3: Parse URL NFO

```typescript
function parseURLNFO(content: string): Partial<MovieMetadata> {
  const lines = content.trim().split('\n');
  const metadata: Partial<MovieMetadata> = {};

  for (const line of lines) {
    const url = line.trim();

    // TMDB Movie
    const tmdbMatch = url.match(/themoviedb\.org\/movie\/(\d+)/);
    if (tmdbMatch) {
      metadata.tmdb_id = parseInt(tmdbMatch[1]);
    }

    // IMDB
    const imdbMatch = url.match(/imdb\.com\/title\/(tt\d+)/);
    if (imdbMatch) {
      metadata.imdb_id = imdbMatch[1];
    }

    // TVDB
    const tvdbMatch = url.match(/thetvdb\.com\/series\/(\d+)/);
    if (tvdbMatch) {
      metadata.tvdb_id = parseInt(tvdbMatch[1]);
    }
  }

  return metadata;
}
```

---

## Edge Cases & Error Handling

### Multiple NFO Files
**Scenario**: Directory contains both `movie.nfo` and `The Matrix.nfo`

**Strategy**:
1. Prefer `movie.nfo` for movies, `tvshow.nfo` for TV shows
2. If both exist, parse both and merge (conflict resolution needed)
3. Log warning if conflicting IDs found

---

### Conflicting Provider IDs
**Scenario**: NFO contains both `<tmdbid>603</tmdbid>` and `<uniqueid type="tmdb">12345</uniqueid>`

**Strategy**:
1. Use `<uniqueid>` (newer Kodi format) as authoritative
2. Log warning about conflict
3. Mark movie status as `failed` if unable to resolve

---

### Missing Required Fields
**Scenario**: NFO missing `<title>` or provider IDs

**Strategy**:
1. Use directory name as fallback for title
2. Set status to `needs_identification` if no provider IDs
3. Still parse other metadata fields

---

### Malformed XML
**Scenario**: NFO contains invalid XML syntax

**Strategy**:
1. Attempt lenient parsing with error recovery
2. If parsing fails completely, log error and skip file
3. Mark directory status as `failed` with error message

---

### Empty Tags
**Scenario**: `<plot></plot>` or `<year/>`

**Strategy**:
1. Treat as `null` rather than empty string
2. Don't overwrite existing database values with nulls on rescan

---

### HTML Entity Encoding
**Scenario**: `<plot>Tom &amp; Jerry go to space</plot>`

**Strategy**:
1. Decode HTML entities (`&amp;` → `&`, `&lt;` → `<`)
2. Use XML parser's built-in entity decoding

---

### Date Format Variations
**Scenario**: Different date formats (`2010-04-16`, `16/04/2010`, `April 16, 2010`)

**Strategy**:
1. Parse using multiple format patterns
2. Normalize to `YYYY-MM-DD` for database storage
3. Log warning if format is ambiguous

---

## Best Practices

1. **Validate Provider IDs**: Check extracted IDs are reasonable (TMDB IDs > 0, IMDB IDs match `tt\d+`)
2. **Use Transactions**: Wrap NFO parsing and database insertion in transactions
3. **Handle Encoding**: Read files with UTF-8 encoding, handle BOM markers
4. **Log Parsing Errors**: Log with context (file path, line number)
5. **Support Batch Processing**: Parse multiple NFO files concurrently
6. **Cache Parsed Results**: Avoid re-parsing unchanged files

---

## Resources

- **Kodi NFO Format**: https://kodi.wiki/view/NFO_files
- **Kodi XML Movies**: https://kodi.wiki/view/NFO_files/Movies
- **Plex Local Assets**: https://support.plex.tv/articles/200220677-local-media-assets-tv-shows/
