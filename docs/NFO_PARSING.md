# NFO File Parsing Reference

This document provides comprehensive reference for parsing Kodi-format NFO files, including XML structure, tag mappings, and edge case handling.

## NFO File Overview

NFO files are XML or plain text files that store metadata for media files. They are the industry standard used by Kodi, Jellyfin, Plex, and other media players.

### File Location Patterns

**Movies:**
```
/Movies/The Matrix (1999)/
├── The Matrix.mkv
├── movie.nfo              ← Primary NFO file
└── The Matrix.nfo         ← Alternative naming
```

**TV Shows:**
```
/TV Shows/Breaking Bad/
├── tvshow.nfo             ← Show-level metadata
├── Season 01/
│   ├── S01E01.mkv
│   ├── S01E01.nfo         ← Episode-level metadata
│   └── S01E02.nfo
```

### NFO File Types

1. **XML Format** - Full metadata in Kodi XML schema
2. **URL Format** - Simple text file with provider URLs

## XML Format

### Movie NFO Structure

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<movie>
  <!-- Provider IDs -->
  <uniqueid type="tmdb" default="true">603</uniqueid>
  <uniqueid type="imdb">tt0133093</uniqueid>

  <!-- Alternative ID formats -->
  <tmdbid>603</tmdbid>
  <imdbid>tt0133093</imdbid>
  <id>603</id>

  <!-- Basic Information -->
  <title>The Matrix</title>
  <originaltitle>The Matrix</originaltitle>
  <sorttitle>Matrix, The</sorttitle>
  <year>1999</year>

  <!-- Plot & Description -->
  <plot>Set in the 22nd century, The Matrix tells the story of a computer hacker who joins a group of underground insurgents fighting the vast and powerful computers who now rule the earth.</plot>
  <outline>A computer hacker learns from mysterious rebels about the true nature of his reality and his role in the war against its controllers.</outline>
  <tagline>Welcome to the Real World.</tagline>

  <!-- Classification -->
  <mpaa>R</mpaa>
  <certification>R</certification>
  <country>United States of America</country>

  <!-- Runtime & Dates -->
  <runtime>136</runtime>
  <premiered>1999-03-31</premiered>
  <releasedate>1999-03-31</releasedate>

  <!-- User Data -->
  <userrating>9.5</userrating>
  <watched>true</watched>
  <playcount>3</playcount>
  <lastplayed>2025-09-15</lastplayed>

  <!-- Ratings -->
  <ratings>
    <rating name="tmdb" max="10" default="true">
      <value>8.2</value>
      <votes>23456</votes>
    </rating>
    <rating name="imdb" max="10">
      <value>8.7</value>
      <votes>1876543</votes>
    </rating>
    <rating name="rottenTomatoes" max="100">
      <value>88</value>
      <votes>256</votes>
    </rating>
  </ratings>

  <!-- People -->
  <actor>
    <name>Keanu Reeves</name>
    <role>Neo</role>
    <order>0</order>
    <thumb>https://image.tmdb.org/t/p/original/abc123.jpg</thumb>
  </actor>
  <actor>
    <name>Laurence Fishburne</name>
    <role>Morpheus</role>
    <order>1</order>
    <thumb>https://image.tmdb.org/t/p/original/def456.jpg</thumb>
  </actor>
  <actor>
    <name>Carrie-Anne Moss</name>
    <role>Trinity</role>
    <order>2</order>
  </actor>

  <director>Lana Wachowski</director>
  <director>Lilly Wachowski</director>

  <credits>Lana Wachowski</credits>
  <credits>Lilly Wachowski</credits>

  <!-- Studios & Production -->
  <studio>Warner Bros.</studio>
  <studio>Village Roadshow Pictures</studio>

  <!-- Genres -->
  <genre>Action</genre>
  <genre>Science Fiction</genre>

  <!-- Collections/Sets -->
  <set>
    <name>The Matrix Collection</name>
    <overview>The complete Matrix trilogy following Neo's journey to free humanity from the machines.</overview>
  </set>

  <!-- Tags -->
  <tag>Cyberpunk</tag>
  <tag>Dystopia</tag>
  <tag>Artificial Intelligence</tag>

  <!-- Trailers -->
  <trailer>plugin://plugin.video.youtube/?action=play_video&amp;videoid=vKQi3bBA1y8</trailer>

  <!-- Images -->
  <thumb aspect="poster">https://image.tmdb.org/t/p/original/poster.jpg</thumb>
  <thumb aspect="banner">https://image.tmdb.org/t/p/original/banner.jpg</thumb>
  <fanart>
    <thumb>https://image.tmdb.org/t/p/original/fanart.jpg</thumb>
  </fanart>

  <!-- File Information (WRITE-ONLY - Not parsed by Metarr) -->
  <fileinfo>
    <streamdetails>
      <video>
        <codec>h264</codec>
        <aspect>2.35</aspect>
        <width>1920</width>
        <height>1080</height>
        <durationinseconds>8160</durationinseconds>
      </video>
      <audio>
        <codec>dts</codec>
        <language>eng</language>
        <channels>6</channels>
      </audio>
      <subtitle>
        <language>eng</language>
      </subtitle>
    </streamdetails>
  </fileinfo>
</movie>
```

**Note:** The `<fileinfo><streamdetails>` section is **skipped during NFO parsing**. Stream details are extracted exclusively via FFprobe and stored in dedicated database tables (`video_streams`, `audio_streams`, `subtitle_streams`). When Metarr writes NFO files, it generates this section from database data. See `@docs/STREAM_DETAILS.md` for complete documentation.

### TV Show NFO Structure

**Show-level (tvshow.nfo):**
```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<tvshow>
  <!-- Provider IDs -->
  <uniqueid type="tmdb" default="true">1396</uniqueid>
  <uniqueid type="tvdb">81189</uniqueid>
  <uniqueid type="imdb">tt0903747</uniqueid>

  <!-- Alternative ID formats -->
  <tmdbid>1396</tmdbid>
  <tvdbid>81189</tvdbid>
  <imdbid>tt0903747</imdbid>

  <!-- Basic Information -->
  <title>Breaking Bad</title>
  <originaltitle>Breaking Bad</originaltitle>
  <sorttitle>Breaking Bad</sorttitle>
  <year>2008</year>

  <!-- Plot & Description -->
  <plot>A high school chemistry teacher diagnosed with inoperable lung cancer turns to manufacturing and selling methamphetamine in order to secure his family's future.</plot>
  <outline>A high school teacher turned meth kingpin.</outline>

  <!-- Classification -->
  <mpaa>TV-MA</mpaa>
  <status>Ended</status>

  <!-- Dates -->
  <premiered>2008-01-20</premiered>
  <releasedate>2008-01-20</releasedate>

  <!-- User Data -->
  <userrating>10.0</userrating>

  <!-- Ratings -->
  <ratings>
    <rating name="tmdb" max="10" default="true">
      <value>8.9</value>
      <votes>12345</votes>
    </rating>
  </ratings>

  <!-- People -->
  <actor>
    <name>Bryan Cranston</name>
    <role>Walter White</role>
    <order>0</order>
  </actor>
  <actor>
    <name>Aaron Paul</name>
    <role>Jesse Pinkman</role>
    <order>1</order>
  </actor>

  <!-- Studios & Production -->
  <studio>AMC</studio>

  <!-- Genres -->
  <genre>Crime</genre>
  <genre>Drama</genre>
  <genre>Thriller</genre>
</tvshow>
```

**Episode-level (S01E01.nfo):**
```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<episodedetails>
  <!-- Episode Numbering -->
  <season>1</season>
  <episode>1</episode>
  <displayseason>1</displayseason>
  <displayepisode>1</displayepisode>

  <!-- Basic Information -->
  <title>Pilot</title>
  <showtitle>Breaking Bad</showtitle>

  <!-- Plot & Description -->
  <plot>High school chemistry teacher Walter White's life is suddenly transformed by a dire medical diagnosis.</plot>
  <outline>Walter White begins his descent into the criminal underworld.</outline>

  <!-- Dates & Runtime -->
  <aired>2008-01-20</aired>
  <runtime>58</runtime>

  <!-- User Data -->
  <userrating>8.5</userrating>
  <watched>true</watched>
  <playcount>2</playcount>

  <!-- Ratings -->
  <ratings>
    <rating name="tmdb" max="10" default="true">
      <value>8.2</value>
      <votes>5678</votes>
    </rating>
  </ratings>

  <!-- People -->
  <actor>
    <name>Bryan Cranston</name>
    <role>Walter White</role>
  </actor>
  <director>Vince Gilligan</director>
  <credits>Vince Gilligan</credits>
</episodedetails>
```

## URL Format

Simple text files containing provider URLs for automated metadata fetching.

### Movie URL NFO

**File: movie.nfo**
```
https://www.themoviedb.org/movie/603
```

**Or with multiple IDs:**
```
https://www.themoviedb.org/movie/603
https://www.imdb.com/title/tt0133093
```

### TV Show URL NFO

**File: tvshow.nfo**
```
https://www.themoviedb.org/tv/1396
```

**Or:**
```
https://www.thetvdb.com/series/81189
```

### URL Extraction Patterns

| Provider | URL Pattern | Extracted ID |
|----------|-------------|--------------|
| TMDB Movie | `https://www.themoviedb.org/movie/{id}` | `tmdb_id` |
| TMDB TV | `https://www.themoviedb.org/tv/{id}` | `tmdb_id` |
| IMDB | `https://www.imdb.com/title/{id}` | `imdb_id` |
| TVDB | `https://www.thetvdb.com/series/{id}` | `tvdb_id` |

## Tag Mapping Reference

### Provider ID Tags

| XML Tag | Alternative Tags | Value Type | Example |
|---------|-----------------|------------|---------|
| `<uniqueid type="tmdb">` | `<tmdbid>`, `<id>` | Integer | `603` |
| `<uniqueid type="imdb">` | `<imdbid>` | String | `tt0133093` |
| `<uniqueid type="tvdb">` | `<tvdbid>` | Integer | `81189` |

**Parsing Priority:**
1. `<uniqueid>` tags (Kodi v18+)
2. Specific ID tags (`<tmdbid>`, `<imdbid>`, `<tvdbid>`)
3. Generic `<id>` tag (ambiguous, lowest priority)

### Basic Information Tags

| XML Tag | Database Column | Value Type | Notes |
|---------|----------------|------------|-------|
| `<title>` | `title` | String | Required |
| `<originaltitle>` | `original_title` | String | Original language title |
| `<sorttitle>` | `sort_title` | String | Alphabetical sorting (e.g., "Matrix, The") |
| `<year>` | `year` | Integer | Release year |

### Plot & Description Tags

| XML Tag | Database Column | Value Type | Notes |
|---------|----------------|------------|-------|
| `<plot>` | `plot` | Text | Full synopsis |
| `<outline>` | `outline` | Text | Short summary |
| `<tagline>` | `tagline` | String | Movie tagline |

### Classification Tags

| XML Tag | Database Column | Value Type | Example |
|---------|----------------|------------|---------|
| `<mpaa>` | `mpaa` | String | `R`, `PG-13`, `TV-MA` |
| `<certification>` | `mpaa` | String | Alternative to `<mpaa>` |
| `<status>` | `status` | String | `Continuing`, `Ended` (TV shows) |

### Runtime & Dates Tags

| XML Tag | Database Column | Value Type | Notes |
|---------|----------------|------------|-------|
| `<runtime>` | **IGNORED** | Integer (minutes) | Use FFprobe `duration_seconds` instead |
| `<premiered>` | `premiered` | String (`YYYY-MM-DD`) | Release date |
| `<releasedate>` | `premiered` | String (`YYYY-MM-DD`) | Alternative to `<premiered>` |
| `<aired>` | `aired` | String (`YYYY-MM-DD`) | Episode air date |

**Note:** NFO `<runtime>` is **not stored** in the database. Authoritative runtime comes from `video_streams.duration_seconds` (extracted via FFprobe).

### User Data Tags

| XML Tag | Database Column | Value Type | Notes |
|---------|----------------|------------|-------|
| `<userrating>` | `user_rating` | Real | 0-10 scale |
| `<watched>` | - | Boolean | Playback state (not stored) |
| `<playcount>` | - | Integer | Watch count (not stored) |

### Ratings Tags

Supports multiple rating sources in a single NFO:

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

**Mapping:**
- `name` → `ratings.source`
- `value` → `ratings.value`
- `votes` → `ratings.votes`
- `default="true"` → `ratings.is_default`

### People Tags

#### Actors

```xml
<actor>
  <name>Keanu Reeves</name>      <!-- actors.name -->
  <role>Neo</role>               <!-- movies_actors.role -->
  <order>0</order>               <!-- movies_actors.order_index -->
  <thumb>https://...</thumb>     <!-- actors.thumb_url -->
</actor>
```

**Mapping:**
- Create/find actor in `actors` table by `name`
- Insert link in `movies_actors` with `role` and `order_index`

#### Directors

```xml
<director>Christopher Nolan</director>
```

**Mapping:**
- Create/find director in `directors` table
- Insert link in `movies_directors`

#### Writers

```xml
<credits>Christopher Nolan</credits>
```

**Mapping:**
- Create/find writer in `writers` table
- Insert link in `movies_writers`

### Studios & Production Tags

```xml
<studio>Warner Bros.</studio>
```

**Mapping:**
- Create/find studio in `studios` table
- Insert link in `movies_studios`

### Genre Tags

```xml
<genre>Action</genre>
<genre>Science Fiction</genre>
```

**Mapping:**
- Create/find genre in `genres` table
- Insert link in `movies_genres`

### Country Tags

```xml
<country>United States of America</country>
<country>United Kingdom</country>
```

**Mapping:**
- Create/find country in `countries` table
- Insert link in `movies_countries`

### Tag Tags

```xml
<tag>Cyberpunk</tag>
<tag>Dystopia</tag>
```

**Mapping:**
- Create/find tag in `tags` table
- Insert link in `movies_tags`

### Collection/Set Tags

```xml
<set>
  <name>The Matrix Collection</name>
  <overview>The complete Matrix trilogy...</overview>
</set>
```

**Mapping:**
- Create/find set in `sets` table by `name`
- Set `movies.set_id` to set ID

### Trailer Tags

```xml
<trailer>plugin://plugin.video.youtube/?action=play_video&amp;videoid=vKQi3bBA1y8</trailer>
```

**Mapping:**
- **NEVER PARSED OR WRITTEN** - URL-based trailers are completely ignored
- See "URL Elements Policy" section below for details
- Local trailer files discovered via filesystem scanning only
- Stored in `trailers` table (one-to-one with media)

### Image Tags

```xml
<thumb aspect="poster">https://image.tmdb.org/t/p/original/poster.jpg</thumb>
<thumb aspect="banner">https://image.tmdb.org/t/p/original/banner.jpg</thumb>
<fanart>
  <thumb>https://image.tmdb.org/t/p/original/fanart.jpg</thumb>
</fanart>
```

**Mapping:**
- **NEVER PARSED** - Image URLs in NFO are ignored during scanning
- Assets discovered exclusively via filesystem scanning
- See "URL Elements Policy" section below for details
- Stored in `images` table with three-tier architecture (provider → cache → library)

### Episode-Specific Tags

| XML Tag | Database Column | Value Type |
|---------|----------------|------------|
| `<season>` | `season_number` | Integer |
| `<episode>` | `episode_number` | Integer |
| `<displayseason>` | `display_season` | Integer |
| `<displayepisode>` | `display_episode` | Integer |
| `<showtitle>` | - | String (reference only) |

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

### Step 2: Parse XML NFO

```typescript
async function parseXMLNFO(filePath: string): Promise<MovieMetadata> {
  const content = await fs.readFile(filePath, 'utf-8');
  const parser = new XMLParser();
  const doc = parser.parse(content);

  const movie = doc.movie;

  return {
    // Provider IDs
    tmdb_id: extractTMDBId(movie),
    imdb_id: extractIMDBId(movie),

    // Basic info
    title: movie.title,
    original_title: movie.originaltitle,
    sort_title: movie.sorttitle,
    year: parseInt(movie.year),

    // Plot
    plot: movie.plot,
    outline: movie.outline,
    tagline: movie.tagline,

    // Classification
    mpaa: movie.mpaa || movie.certification,

    // Runtime & Dates
    runtime: parseInt(movie.runtime),
    premiered: movie.premiered || movie.releasedate,

    // User data
    user_rating: parseFloat(movie.userrating),

    // Trailer
    trailer_url: movie.trailer,

    // Arrays
    actors: parseActors(movie.actor),
    directors: parseDirectors(movie.director),
    writers: parseWriters(movie.credits),
    genres: parseGenres(movie.genre),
    studios: parseStudios(movie.studio),
    countries: parseCountries(movie.country),
    tags: parseTags(movie.tag),
    ratings: parseRatings(movie.ratings),
    set: parseSet(movie.set)
  };
}
```

### Step 3: Extract Provider IDs

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

  // Priority 3: <id> (ambiguous, use cautiously)
  if (movie.id && !movie.imdbid && !movie.tvdbid) {
    return parseInt(movie.id);
  }

  return null;
}
```

### Step 4: Parse Arrays

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

### Step 5: Parse URL NFO

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

## URL Elements Policy

**CRITICAL:** Certain NFO elements containing URLs are **NEVER parsed or written** by Metarr to prevent media player behavioral issues and data staleness.

### Never Parsed Elements

| Element | Reason | Alternative |
|---------|--------|-------------|
| `<trailer>` (URLs) | URLs may be outdated; causes player to navigate to URL instead of local file | Filesystem discovery of local trailer files |
| `<thumb>` (image URLs) | Provider URLs may be outdated or broken | Filesystem discovery + cache-first architecture |
| `<fanart><thumb>` (URLs) | Provider URLs may be outdated or broken | Filesystem discovery + cache-first architecture |

### Never Written Elements

When Metarr generates NFO files:
- `<trailer>` element is **NEVER included** (even if local trailers exist)
- `<thumb>` and `<fanart>` elements are **NEVER included** (to prevent URL staleness)
- Local trailer files are discovered independently by media players via filename patterns
- Images are discovered via filesystem scanning (standard Kodi patterns)

**Rationale:**
1. **Trailer URLs**: If NFO contains YouTube plugin URLs, Kodi navigates to that URL on trailer playback. This overrides local trailer files and may link to removed/geoblocked videos.
2. **Image URLs**: Provider URLs in NFO may become invalid after upgrades or API changes. Filesystem scanning is authoritative.

### What IS Written

NFO generation includes:
- All metadata fields (title, plot, ratings, etc.)
- `<fileinfo><streamdetails>` section (generated from `video_streams`/`audio_streams`/`subtitle_streams` tables)
- Actor/director/writer credits
- Provider IDs for metadata linking

## Edge Cases & Error Handling

### Multiple NFO Files

**Scenario:** Directory contains both `movie.nfo` and `The Matrix.nfo`

**Strategy:**
1. Prefer `movie.nfo` for movies, `tvshow.nfo` for TV shows
2. If both exist, parse both and merge (conflict resolution needed)
3. Log warning if conflicting IDs found

### Conflicting Provider IDs

**Scenario:** NFO contains both `<tmdbid>603</tmdbid>` and `<uniqueid type="tmdb">12345</uniqueid>`

**Strategy:**
1. Use `<uniqueid>` (newer Kodi format) as authoritative
2. Log warning about conflict
3. Mark movie status as `failed` if unable to resolve

### Missing Required Fields

**Scenario:** NFO missing `<title>` or provider IDs

**Strategy:**
1. Use directory name as fallback for title
2. Set status to `needs_identification` if no provider IDs
3. Still parse other metadata fields

### Malformed XML

**Scenario:** NFO contains invalid XML syntax

**Strategy:**
1. Attempt lenient parsing with error recovery
2. If parsing fails completely, log error and skip file
3. Mark directory status as `failed` with error message

### Empty Tags

**Scenario:** `<plot></plot>` or `<year/>`

**Strategy:**
1. Treat as `null` rather than empty string
2. Don't overwrite existing database values with nulls on rescan

### HTML Entity Encoding

**Scenario:** `<plot>Tom &amp; Jerry go to space</plot>`

**Strategy:**
1. Decode HTML entities (`&amp;` → `&`, `&lt;` → `<`)
2. Use XML parser's built-in entity decoding

### Multiple Values in Single Tag

**Scenario:** `<genre>Action / Adventure</genre>`

**Strategy:**
1. Split on common delimiters (` / `, `, `, ` & `)
2. Trim whitespace from each value
3. Insert as separate genre entries

### Date Format Variations

**Scenario:** Different date formats (`2010-04-16`, `16/04/2010`, `April 16, 2010`)

**Strategy:**
1. Parse using multiple format patterns
2. Normalize to `YYYY-MM-DD` for database storage
3. Log warning if format is ambiguous

## Testing Strategy

### Unit Tests

```typescript
describe('NFO Parser', () => {
  it('should extract TMDB ID from uniqueid tag', () => {
    const xml = '<movie><uniqueid type="tmdb" default="true">603</uniqueid></movie>';
    const result = parseXMLNFO(xml);
    expect(result.tmdb_id).toBe(603);
  });

  it('should parse actors with roles and order', () => {
    const xml = `
      <movie>
        <actor><name>Keanu Reeves</name><role>Neo</role><order>0</order></actor>
        <actor><name>Laurence Fishburne</name><role>Morpheus</role><order>1</order></actor>
      </movie>
    `;
    const result = parseXMLNFO(xml);
    expect(result.actors).toHaveLength(2);
    expect(result.actors[0].name).toBe('Keanu Reeves');
    expect(result.actors[0].role).toBe('Neo');
    expect(result.actors[0].order_index).toBe(0);
  });

  it('should handle URL-based NFO files', () => {
    const content = 'https://www.themoviedb.org/movie/603\nhttps://www.imdb.com/title/tt0133093';
    const result = parseURLNFO(content);
    expect(result.tmdb_id).toBe(603);
    expect(result.imdb_id).toBe('tt0133093');
  });

  it('should gracefully handle missing tags', () => {
    const xml = '<movie><title>Test Movie</title></movie>';
    const result = parseXMLNFO(xml);
    expect(result.title).toBe('Test Movie');
    expect(result.plot).toBeUndefined();
    expect(result.actors).toEqual([]);
  });
});
```

### Integration Tests

```typescript
describe('NFO Scanner Integration', () => {
  it('should scan directory and parse NFO', async () => {
    const result = await scanLibrary('/movies/The Matrix (1999)/');
    expect(result.movies).toHaveLength(1);
    expect(result.movies[0].title).toBe('The Matrix');
    expect(result.movies[0].tmdb_id).toBe(603);
  });

  it('should handle incremental rescans', async () => {
    // Initial scan
    await scanLibrary('/movies/');
    const movie1 = await db.getMovieByPath('/movies/The Matrix (1999)/');

    // Modify NFO and rescan
    await updateNFO('/movies/The Matrix (1999)/movie.nfo', { year: 2000 });
    await scanLibrary('/movies/');

    const movie2 = await db.getMovieByPath('/movies/The Matrix (1999)/');
    expect(movie2.id).toBe(movie1.id); // Same database entry
    expect(movie2.year).toBe(2000);    // Updated metadata
  });
});
```

## Best Practices

### 1. Validate Provider IDs
Check that extracted IDs are reasonable (TMDB IDs > 0, IMDB IDs match `tt\d+` pattern).

### 2. Use Transactions
Wrap NFO parsing and database insertion in transactions for consistency.

### 3. Handle Encoding Issues
Read files with UTF-8 encoding and handle BOM markers.

### 4. Log Parsing Errors
Log all parsing errors with context (file path, line number) for debugging.

### 5. Preserve Unknown Tags
Store unrecognized XML tags in JSON field for future reference.

### 6. Implement Conflict Resolution
Define clear precedence rules for conflicting data sources.

### 7. Support Batch Processing
Parse multiple NFO files concurrently for performance.

### 8. Cache Parsed Results
Cache parsed NFO data to avoid re-parsing unchanged files.

## Resources

- **Kodi NFO Format**: https://kodi.wiki/view/NFO_files
- **Kodi XML Format**: https://kodi.wiki/view/NFO_files/Movies
- **TVDB NFO Format**: https://support.plex.tv/articles/200220677-local-media-assets-tv-shows/
