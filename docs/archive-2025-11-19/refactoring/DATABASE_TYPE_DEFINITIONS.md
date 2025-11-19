# Database Type Definitions

## Overview

This document provides complete TypeScript type definitions for all database tables in Metarr. These types should replace `any` in database queries during Phase 2 of the TypeScript remediation.

---

## Core Types

### QueryParam

```typescript
/**
 * Valid parameter types for SQL queries
 * Prevents passing invalid data to database
 */
export type QueryParam = string | number | boolean | null | Buffer;

/**
 * Database connection with strict typing
 */
export interface StrictDatabaseConnection {
  query<T = never>(sql: string, params?: QueryParam[]): Promise<T[]>;
  get<T = never>(sql: string, params?: QueryParam[]): Promise<T | undefined>;
  execute(sql: string, params?: QueryParam[]): Promise<ExecuteResult>;
  close(): Promise<void>;
  beginTransaction(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export interface ExecuteResult {
  affectedRows: number;
  insertId?: number;
}
```

---

## Movie Types

### movies Table

```typescript
export interface MovieRow {
  id: number;
  library_id: number;
  file_path: string;
  directory_path: string;

  // Identification
  tmdb_id?: number;
  imdb_id?: string;
  identification_status: 'unidentified' | 'identified' | 'enriched';
  monitored: number; // SQLite boolean (0 or 1)

  // Basic Metadata
  title: string;
  original_title?: string;
  sort_title?: string;
  year?: number;
  plot?: string;
  outline?: string;
  tagline?: string;
  content_rating?: string; // mpaa in some contexts
  release_date?: string; // ISO date string
  runtime?: number; // minutes
  user_rating?: number;
  trailer_url?: string;

  // Technical Metadata
  file_size?: number;
  file_hash?: string;
  video_codec?: string;
  audio_codec?: string;
  resolution?: string;
  duration_seconds?: number;

  // Lock Fields (prevent automation from modifying)
  title_locked: number;
  original_title_locked: number;
  sort_title_locked: number;
  year_locked: number;
  plot_locked: number;
  outline_locked: number;
  tagline_locked: number;
  content_rating_locked: number;
  release_date_locked: number;
  runtime_locked: number;
  user_rating_locked: number;
  trailer_url_locked: number;

  // Ratings
  tmdb_rating?: number;
  tmdb_votes?: number;
  imdb_rating?: number;
  imdb_votes?: number;

  // Timestamps
  created_at: string; // ISO timestamp
  updated_at: string;
  deleted_at?: string; // Soft delete (30-day recycle bin)
  last_scanned_at?: string;
  last_enriched_at?: string;
  last_published_at?: string;
}

/**
 * Subset of MovieRow for inserts (no auto-generated fields)
 */
export interface MovieInsert extends Omit<MovieRow, 'id' | 'created_at' | 'updated_at'> {
  created_at?: string;
  updated_at?: string;
}

/**
 * Subset of MovieRow for updates (only changeable fields)
 */
export interface MovieUpdate extends Partial<Omit<MovieRow, 'id' | 'created_at'>> {
  updated_at?: string;
}
```

### movie_actors Table

```typescript
export interface MovieActorRow {
  id: number;
  movie_id: number;
  actor_id: number;
  role?: string; // Character name
  actor_order: number; // Sort order in cast list
  created_at: string;
}

export interface MovieActorInsert extends Omit<MovieActorRow, 'id' | 'created_at'> {
  created_at?: string;
}
```

### movie_crew Table

```typescript
export interface MovieCrewRow {
  id: number;
  movie_id: number;
  crew_id: number;
  role: 'director' | 'writer' | 'producer' | 'cinematographer' | 'editor' | 'composer';
  created_at: string;
}

export interface MovieCrewInsert extends Omit<MovieCrewRow, 'id' | 'created_at'> {
  created_at?: string;
}
```

### movie_genres Table

```typescript
export interface MovieGenreRow {
  id: number;
  movie_id: number;
  genre_id: number;
  created_at: string;
}

export interface MovieGenreInsert extends Omit<MovieGenreRow, 'id' | 'created_at'> {
  created_at?: string;
}
```

### movie_studios Table

```typescript
export interface MovieStudioRow {
  id: number;
  movie_id: number;
  studio_id: number;
  created_at: string;
}

export interface MovieStudioInsert extends Omit<MovieStudioRow, 'id' | 'created_at'> {
  created_at?: string;
}
```

### movie_countries Table

```typescript
export interface MovieCountryRow {
  id: number;
  movie_id: number;
  country_id: number;
  created_at: string;
}

export interface MovieCountryInsert extends Omit<MovieCountryRow, 'id' | 'created_at'> {
  created_at?: string;
}
```

### movie_tags Table

```typescript
export interface MovieTagRow {
  id: number;
  movie_id: number;
  tag_id: number;
  created_at: string;
}

export interface MovieTagInsert extends Omit<MovieTagRow, 'id' | 'created_at'> {
  created_at?: string;
}
```

### movie_collections Table

```typescript
export interface MovieCollectionRow {
  id: number;
  tmdb_id?: number;
  name: string;
  plot?: string;
  created_at: string;
  updated_at: string;
}

export interface MovieCollectionInsert extends Omit<MovieCollectionRow, 'id' | 'created_at' | 'updated_at'> {
  created_at?: string;
  updated_at?: string;
}
```

### movie_collection_members Table

```typescript
export interface MovieCollectionMemberRow {
  id: number;
  collection_id: number;
  movie_id: number;
  sort_order?: number;
  created_at: string;
}

export interface MovieCollectionMemberInsert extends Omit<MovieCollectionMemberRow, 'id' | 'created_at'> {
  created_at?: string;
}
```

---

## Person Types

### actors Table

```typescript
export interface ActorRow {
  id: number;
  name: string;
  tmdb_id?: number;
  imdb_id?: string;
  profile_image_url?: string;
  biography?: string;
  birthday?: string; // ISO date
  deathday?: string; // ISO date
  place_of_birth?: string;
  created_at: string;
  updated_at: string;
}

export interface ActorInsert extends Omit<ActorRow, 'id' | 'created_at' | 'updated_at'> {
  created_at?: string;
  updated_at?: string;
}
```

### crew Table

```typescript
export interface CrewRow {
  id: number;
  name: string;
  tmdb_id?: number;
  imdb_id?: string;
  profile_image_url?: string;
  created_at: string;
  updated_at: string;
}

export interface CrewInsert extends Omit<CrewRow, 'id' | 'created_at' | 'updated_at'> {
  created_at?: string;
  updated_at?: string;
}
```

---

## Metadata Types

### genres Table

```typescript
export interface GenreRow {
  id: number;
  name: string;
  tmdb_id?: number;
  created_at: string;
}

export interface GenreInsert extends Omit<GenreRow, 'id' | 'created_at'> {
  created_at?: string;
}
```

### studios Table

```typescript
export interface StudioRow {
  id: number;
  name: string;
  tmdb_id?: number;
  created_at: string;
}

export interface StudioInsert extends Omit<StudioRow, 'id' | 'created_at'> {
  created_at?: string;
}
```

### countries Table

```typescript
export interface CountryRow {
  id: number;
  name: string;
  iso_code: string; // ISO 3166-1 alpha-2 code (e.g., 'US', 'GB')
  created_at: string;
}

export interface CountryInsert extends Omit<CountryRow, 'id' | 'created_at'> {
  created_at?: string;
}
```

### tags Table

```typescript
export interface TagRow {
  id: number;
  name: string;
  created_at: string;
}

export interface TagInsert extends Omit<TagRow, 'id' | 'created_at'> {
  created_at?: string;
}
```

---

## Cache File Types

### cache_image_files Table

```typescript
export interface CacheImageFileRow {
  id: number;
  entity_type: 'movie' | 'series' | 'season' | 'episode' | 'actor';
  entity_id: number;
  file_path: string;
  file_name: string;
  file_size: number;
  image_type: 'poster' | 'fanart' | 'landscape' | 'keyart' | 'banner' | 'clearart' | 'clearlogo' | 'discart';
  width?: number;
  height?: number;
  format?: string; // 'jpg', 'png', 'webp'
  perceptual_hash?: string; // For duplicate detection
  source_type: 'provider' | 'local' | 'user_upload';
  source_url?: string;
  provider_name?: string;
  classification_score?: number; // 0-100, used for auto-selection
  is_locked: number; // Boolean: user manually selected
  discovered_at: string; // ISO timestamp
}

export interface CacheImageFileInsert extends Omit<CacheImageFileRow, 'id'> {}
```

### cache_video_files Table

```typescript
export interface CacheVideoFileRow {
  id: number;
  entity_type: 'movie' | 'series' | 'season' | 'episode';
  entity_id: number;
  file_path: string;
  file_name: string;
  file_size: number;
  video_type: 'trailer' | 'featurette' | 'behind_the_scenes';
  codec?: string;
  width?: number;
  height?: number;
  duration_seconds?: number;
  bitrate?: number;
  framerate?: number;
  hdr_type?: string; // 'HDR10', 'Dolby Vision', etc.
  audio_codec?: string;
  audio_channels?: number;
  audio_language?: string;
  source_type: 'provider' | 'local';
  source_url?: string;
  provider_name?: string;
  classification_score?: number;
  discovered_at: string;
}

export interface CacheVideoFileInsert extends Omit<CacheVideoFileRow, 'id'> {}
```

### cache_audio_files Table

```typescript
export interface CacheAudioFileRow {
  id: number;
  entity_type: 'movie' | 'series' | 'season' | 'episode';
  entity_id: number;
  file_path: string;
  file_name: string;
  file_size: number;
  audio_type: 'theme' | 'soundtrack';
  codec?: string;
  duration_seconds?: number;
  bitrate?: number;
  sample_rate?: number;
  channels?: number;
  language?: string;
  source_type: 'provider' | 'local';
  source_url?: string;
  provider_name?: string;
  classification_score?: number;
  discovered_at: string;
}

export interface CacheAudioFileInsert extends Omit<CacheAudioFileRow, 'id'> {}
```

### cache_text_files Table

```typescript
export interface CacheTextFileRow {
  id: number;
  entity_type: 'movie' | 'series' | 'season' | 'episode';
  entity_id: number;
  file_path: string;
  file_name: string;
  file_size: number;
  text_type: 'nfo' | 'subtitle';
  subtitle_language?: string;
  subtitle_format?: string; // 'srt', 'vtt', 'ass'
  nfo_is_valid?: number; // Boolean
  nfo_has_tmdb_id?: number; // Boolean
  nfo_needs_regen?: number; // Boolean
  source_type: 'local' | 'provider';
  source_url?: string;
  provider_name?: string;
  classification_score?: number;
  discovered_at: string;
}

export interface CacheTextFileInsert extends Omit<CacheTextFileRow, 'id'> {}
```

---

## Stream Metadata Types

### video_streams Table

```typescript
export interface VideoStreamRow {
  id: number;
  entity_type: 'movie' | 'episode';
  entity_id: number;
  stream_index: number;
  codec: string;
  codec_long_name?: string;
  profile?: string;
  width: number;
  height: number;
  aspect_ratio: string; // '16:9', '2.39:1'
  framerate?: number;
  bitrate?: number;
  hdr_type?: string;
  color_space?: string;
  bits_per_sample?: number;
  created_at: string;
}

export interface VideoStreamInsert extends Omit<VideoStreamRow, 'id' | 'created_at'> {
  created_at?: string;
}
```

### audio_streams Table

```typescript
export interface AudioStreamRow {
  id: number;
  entity_type: 'movie' | 'episode';
  entity_id: number;
  stream_index: number;
  codec: string;
  codec_long_name?: string;
  channels: number;
  channel_layout?: string; // '5.1', '7.1', 'stereo'
  sample_rate?: number;
  bitrate?: number;
  language: string;
  title?: string;
  is_default: number; // Boolean
  created_at: string;
}

export interface AudioStreamInsert extends Omit<AudioStreamRow, 'id' | 'created_at'> {
  created_at?: string;
}
```

### subtitle_streams Table

```typescript
export interface SubtitleStreamRow {
  id: number;
  entity_type: 'movie' | 'episode';
  entity_id: number;
  stream_index: number;
  language: string;
  title?: string;
  codec?: string;
  is_forced: number; // Boolean
  is_default: number; // Boolean
  created_at: string;
}

export interface SubtitleStreamInsert extends Omit<SubtitleStreamRow, 'id' | 'created_at'> {
  created_at?: string;
}
```

---

## Library Types

### libraries Table

```typescript
export interface LibraryRow {
  id: number;
  name: string;
  media_type: 'movie' | 'tvshow' | 'music';
  root_path: string;
  enabled: number; // Boolean
  scan_on_startup: number; // Boolean
  created_at: string;
  updated_at: string;
  last_scan_started_at?: string;
  last_scan_completed_at?: string;
}

export interface LibraryInsert extends Omit<LibraryRow, 'id' | 'created_at' | 'updated_at'> {
  created_at?: string;
  updated_at?: string;
}
```

### library_scans Table

```typescript
export interface LibraryScanRow {
  id: number;
  library_id: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  trigger: 'manual' | 'webhook' | 'scheduled' | 'startup';
  started_at?: string;
  completed_at?: string;
  error_message?: string;
  files_scanned: number;
  files_added: number;
  files_updated: number;
  files_removed: number;
  created_at: string;
}

export interface LibraryScanInsert extends Omit<LibraryScanRow, 'id' | 'created_at'> {
  created_at?: string;
}
```

---

## Job Queue Types

### jobs Table

```typescript
export interface JobRow {
  id: string; // UUID
  type: string; // 'scan_library', 'enrich_movie', etc.
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  priority: number; // Higher = more important
  data: string; // JSON-encoded job data
  result?: string; // JSON-encoded result
  error?: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  retry_count: number;
  max_retries: number;
  next_retry_at?: string;
}

export interface JobInsert extends Omit<JobRow, 'created_at'> {
  created_at?: string;
}
```

---

## Unknown Files Types

### unknown_files Table

```typescript
export interface UnknownFileRow {
  id: number;
  entity_type: 'movie' | 'series' | 'season' | 'episode';
  entity_id: number;
  file_path: string;
  file_name: string;
  file_size: number;
  extension: string;
  category: 'video' | 'image' | 'audio' | 'text' | 'other';
  ignored: number; // Boolean: user marked as "ignore"
  discovered_at: string;
}

export interface UnknownFileInsert extends Omit<UnknownFileRow, 'id'> {}
```

---

## Media Player Types

### media_players Table

```typescript
export interface MediaPlayerRow {
  id: number;
  name: string;
  player_type: 'kodi' | 'jellyfin' | 'plex';
  host: string;
  port: number;
  username?: string;
  password?: string; // Encrypted
  api_key?: string; // For Plex/Jellyfin
  use_https: number; // Boolean
  enabled: number; // Boolean
  last_connected_at?: string;
  last_connection_status?: 'success' | 'error';
  last_connection_error?: string;
  created_at: string;
  updated_at: string;
}

export interface MediaPlayerInsert extends Omit<MediaPlayerRow, 'id' | 'created_at' | 'updated_at'> {
  created_at?: string;
  updated_at?: string;
}
```

### media_player_groups Table

```typescript
export interface MediaPlayerGroupRow {
  id: number;
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface MediaPlayerGroupInsert extends Omit<MediaPlayerGroupRow, 'id' | 'created_at' | 'updated_at'> {
  created_at?: string;
  updated_at?: string;
}
```

### media_player_group_members Table

```typescript
export interface MediaPlayerGroupMemberRow {
  id: number;
  group_id: number;
  player_id: number;
  created_at: string;
}

export interface MediaPlayerGroupMemberInsert extends Omit<MediaPlayerGroupMemberRow, 'id' | 'created_at'> {
  created_at?: string;
}
```

---

## Activity Log Types

### activity_log Table

```typescript
export interface ActivityLogRow {
  id: number;
  event_type: string; // 'movie_scanned', 'movie_enriched', 'asset_downloaded', etc.
  source: 'system' | 'user' | 'webhook' | 'scheduler';
  description: string;
  metadata?: string; // JSON-encoded additional data
  created_at: string;
}

export interface ActivityLogInsert extends Omit<ActivityLogRow, 'id' | 'created_at'> {
  created_at?: string;
}
```

---

## Usage Examples

### Example 1: Type-Safe Movie Query

```typescript
import { MovieRow, QueryParam } from '../types/database-models';

async function getMovieById(db: StrictDatabaseConnection, id: number): Promise<MovieRow | null> {
  const params: QueryParam[] = [id];
  const movie = await db.get<MovieRow>('SELECT * FROM movies WHERE id = ?', params);
  return movie || null;
}

// TypeScript knows movie has all MovieRow properties
const movie = await getMovieById(db, 123);
if (movie) {
  console.log(movie.title); // ✅ Type-safe
  console.log(movie.foobar); // ❌ TypeScript error
}
```

### Example 2: Type-Safe Insert

```typescript
import { MovieInsert, ExecuteResult } from '../types/database-models';

async function insertMovie(db: StrictDatabaseConnection, data: MovieInsert): Promise<number> {
  const params: QueryParam[] = [
    data.library_id,
    data.file_path,
    data.directory_path,
    data.title,
    data.monitored,
    data.identification_status,
    // ... all required fields
  ];

  const result: ExecuteResult = await db.execute(
    `INSERT INTO movies (library_id, file_path, directory_path, title, monitored, identification_status, ...)
     VALUES (?, ?, ?, ?, ?, ?, ...)`,
    params
  );

  return result.insertId!;
}
```

### Example 3: Type-Safe Join Query

```typescript
interface MovieWithStudio {
  id: number;
  title: string;
  studio_name: string;
}

async function getMoviesWithStudios(db: StrictDatabaseConnection): Promise<MovieWithStudio[]> {
  return db.query<MovieWithStudio>(
    `SELECT m.id, m.title, s.name as studio_name
     FROM movies m
     INNER JOIN movie_studios ms ON m.id = ms.movie_id
     INNER JOIN studios s ON ms.studio_id = s.id`
  );
}

// TypeScript knows the exact shape
const movies = await getMoviesWithStudios(db);
movies.forEach(movie => {
  console.log(movie.title, movie.studio_name); // ✅ Type-safe
});
```

---

## Migration Checklist

### Step 1: Add Type Definitions
- [ ] Copy all types to `src/types/database-models.ts`
- [ ] Export all types from `src/types/index.ts`

### Step 2: Update Database Interface
- [ ] Replace `= any` with `= never` in generics
- [ ] Use `QueryParam[]` for params
- [ ] Use `ExecuteResult` for execute() return

### Step 3: Update Services
- [ ] Add explicit type parameters to all queries
- [ ] Replace `any[]` params with typed arrays
- [ ] Test each service after updating

### Step 4: Verify
- [ ] Run TypeScript compiler
- [ ] Run test suite
- [ ] Verify IntelliSense works in IDE

---

## Benefits

### Compile-Time Safety
```typescript
// Before
const movies = await db.query('SELECT * FROM movies');
movies[0].foobar; // No error, but crashes at runtime

// After
const movies = await db.query<MovieRow>('SELECT * FROM movies');
movies[0].foobar; // ❌ TypeScript error at compile time
```

### IntelliSense
```typescript
const movie = await db.get<MovieRow>('SELECT * FROM movies WHERE id = ?', [1]);
if (movie) {
  movie. // IDE shows all MovieRow properties
}
```

### Refactoring Safety
```typescript
// If you rename a column in the database, TypeScript will catch all usages
interface MovieRow {
  // content_rating?: string; // Renamed to mpaa
  mpaa?: string;
}

// All code referencing content_rating now shows errors
```

---

## Next Steps

1. Review this document for completeness
2. Copy types to `src/types/database-models.ts`
3. Update database connection interface
4. Begin migrating services (start with movieService.ts)
5. Add tests to verify type safety

See Phase 2 implementation in main remediation plan for detailed timeline.
