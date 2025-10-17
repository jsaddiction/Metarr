# Junction Table Redesign for Proper CASCADE Behavior

## Problem

Current schema uses polymorphic associations (`entity_type`, `entity_id`) without FK constraints:
- `image_files.entity_id` has NO foreign key to `movies.id`
- When movies are deleted, `image_files` records become orphaned
- Manual cleanup required - no automatic CASCADE

## Solution: Junction Tables

Replace polymorphic fields with proper junction tables that have FK constraints with CASCADE.

### Architecture

```
┌─────────────┐
│ image_files │  ← Core file metadata (shared across all entities)
│  - id       │
│  - file_path│
│  - width    │
│  - height   │
│  - hash     │
└─────────────┘
      ↑
      │ FK CASCADE
      │
┌──────────────────────┐
│ movie_image_files    │  ← Junction table
│  - movie_id FK       │──→ movies (ON DELETE CASCADE)
│  - image_file_id FK  │──→ image_files (ON DELETE CASCADE)
│  - image_type        │  (poster, fanart, landscape, etc.)
│  - location          │  (library | cache)
│  - is_published      │
└──────────────────────┘
```

### Benefits

1. **Automatic CASCADE**: DELETE movie → Deletes junction rows → Can delete orphaned files
2. **Referential Integrity**: FK constraints enforce valid relationships
3. **Multiple Files**: Can have multiple posters, fanarts, etc. per movie
4. **Type Safety**: `image_type` in junction table, not in files table
5. **Industry Standard**: This is how many-to-many relationships should be modeled

### New Schema

#### Core File Tables (No entity_type/entity_id)

```sql
CREATE TABLE image_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_hash TEXT NOT NULL,
  perceptual_hash TEXT,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  format TEXT NOT NULL,
  source_type TEXT CHECK(source_type IN ('provider', 'local', 'user')),
  source_url TEXT,
  provider_name TEXT,
  classification_score INTEGER,
  library_file_id INTEGER,  -- Links to library copy
  cache_file_id INTEGER,     -- Links to cache copy
  reference_count INTEGER DEFAULT 0,
  discovered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (library_file_id) REFERENCES image_files(id) ON DELETE SET NULL,
  FOREIGN KEY (cache_file_id) REFERENCES image_files(id) ON DELETE SET NULL
);

CREATE TABLE video_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_hash TEXT,
  codec TEXT,
  width INTEGER,
  height INTEGER,
  duration_seconds INTEGER,
  bitrate INTEGER,
  source_type TEXT CHECK(source_type IN ('provider', 'local', 'user')),
  source_url TEXT,
  provider_name TEXT,
  library_file_id INTEGER,
  cache_file_id INTEGER,
  discovered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (library_file_id) REFERENCES video_files(id) ON DELETE SET NULL,
  FOREIGN KEY (cache_file_id) REFERENCES video_files(id) ON DELETE SET NULL
);

CREATE TABLE text_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_hash TEXT,
  format TEXT,  -- srt, sub, ass, vtt, etc.
  language TEXT,
  source_type TEXT CHECK(source_type IN ('provider', 'local', 'user')),
  source_url TEXT,
  provider_name TEXT,
  library_file_id INTEGER,
  cache_file_id INTEGER,
  discovered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (library_file_id) REFERENCES text_files(id) ON DELETE SET NULL,
  FOREIGN KEY (cache_file_id) REFERENCES text_files(id) ON DELETE SET NULL
);

CREATE TABLE audio_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_hash TEXT,
  codec TEXT,
  duration_seconds INTEGER,
  bitrate INTEGER,
  sample_rate INTEGER,
  channels INTEGER,
  language TEXT,
  source_type TEXT CHECK(source_type IN ('provider', 'local', 'user')),
  source_url TEXT,
  provider_name TEXT,
  library_file_id INTEGER,
  cache_file_id INTEGER,
  discovered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (library_file_id) REFERENCES audio_files(id) ON DELETE SET NULL,
  FOREIGN KEY (cache_file_id) REFERENCES audio_files(id) ON DELETE SET NULL
);
```

#### Junction Tables (Entity-to-File mappings)

```sql
-- Movie Images
CREATE TABLE movie_image_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  movie_id INTEGER NOT NULL,
  image_file_id INTEGER NOT NULL,
  image_type TEXT NOT NULL CHECK(image_type IN (
    'poster', 'fanart', 'banner', 'clearlogo', 'clearart', 'discart',
    'landscape', 'keyart', 'thumb', 'unknown'
  )),
  location TEXT NOT NULL CHECK(location IN ('library', 'cache')),
  is_published BOOLEAN DEFAULT 0,
  is_selected BOOLEAN DEFAULT 0,  -- Which one is actively used
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
  FOREIGN KEY (image_file_id) REFERENCES image_files(id) ON DELETE CASCADE,
  UNIQUE(movie_id, image_file_id, location)  -- Same file can be in library and cache
);
CREATE INDEX idx_movie_images_movie ON movie_image_files(movie_id);
CREATE INDEX idx_movie_images_file ON movie_image_files(image_file_id);
CREATE INDEX idx_movie_images_type ON movie_image_files(image_type);
CREATE INDEX idx_movie_images_selected ON movie_image_files(is_selected) WHERE is_selected = 1;

-- Movie Videos (trailers)
CREATE TABLE movie_video_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  movie_id INTEGER NOT NULL,
  video_file_id INTEGER NOT NULL,
  video_type TEXT NOT NULL CHECK(video_type IN ('trailer', 'sample', 'extra')),
  location TEXT NOT NULL CHECK(location IN ('library', 'cache')),
  is_published BOOLEAN DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
  FOREIGN KEY (video_file_id) REFERENCES video_files(id) ON DELETE CASCADE,
  UNIQUE(movie_id, video_file_id, location)
);
CREATE INDEX idx_movie_videos_movie ON movie_video_files(movie_id);
CREATE INDEX idx_movie_videos_file ON movie_video_files(video_file_id);

-- Movie Text Files (NFO, subtitles)
CREATE TABLE movie_text_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  movie_id INTEGER NOT NULL,
  text_file_id INTEGER NOT NULL,
  text_type TEXT NOT NULL CHECK(text_type IN ('nfo', 'subtitle')),
  location TEXT NOT NULL CHECK(location IN ('library', 'cache')),
  is_published BOOLEAN DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
  FOREIGN KEY (text_file_id) REFERENCES text_files(id) ON DELETE CASCADE,
  UNIQUE(movie_id, text_file_id, location)
);
CREATE INDEX idx_movie_texts_movie ON movie_text_files(movie_id);
CREATE INDEX idx_movie_texts_file ON movie_text_files(text_file_id);

-- Movie Audio Files (theme songs)
CREATE TABLE movie_audio_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  movie_id INTEGER NOT NULL,
  audio_file_id INTEGER NOT NULL,
  audio_type TEXT NOT NULL CHECK(audio_type IN ('theme', 'unknown')),
  location TEXT NOT NULL CHECK(location IN ('library', 'cache')),
  is_published BOOLEAN DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
  FOREIGN KEY (audio_file_id) REFERENCES audio_files(id) ON DELETE CASCADE,
  UNIQUE(movie_id, audio_file_id, location)
);
CREATE INDEX idx_movie_audios_movie ON movie_audio_files(movie_id);
CREATE INDEX idx_movie_audios_file ON movie_audio_files(audio_file_id);

-- Series Images
CREATE TABLE series_image_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  series_id INTEGER NOT NULL,
  image_file_id INTEGER NOT NULL,
  image_type TEXT NOT NULL CHECK(image_type IN (
    'poster', 'fanart', 'banner', 'clearlogo', 'clearart', 'thumb', 'unknown'
  )),
  location TEXT NOT NULL CHECK(location IN ('library', 'cache')),
  is_published BOOLEAN DEFAULT 0,
  is_selected BOOLEAN DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE,
  FOREIGN KEY (image_file_id) REFERENCES image_files(id) ON DELETE CASCADE,
  UNIQUE(series_id, image_file_id, location)
);
CREATE INDEX idx_series_images_series ON series_image_files(series_id);
CREATE INDEX idx_series_images_file ON series_image_files(image_file_id);

-- Episode Images
CREATE TABLE episode_image_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  episode_id INTEGER NOT NULL,
  image_file_id INTEGER NOT NULL,
  image_type TEXT NOT NULL CHECK(image_type IN ('thumb', 'unknown')),
  location TEXT NOT NULL CHECK(location IN ('library', 'cache')),
  is_published BOOLEAN DEFAULT 0,
  is_selected BOOLEAN DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE,
  FOREIGN KEY (image_file_id) REFERENCES image_files(id) ON DELETE CASCADE,
  UNIQUE(episode_id, image_file_id, location)
);
CREATE INDEX idx_episode_images_episode ON episode_image_files(episode_id);
CREATE INDEX idx_episode_images_file ON episode_image_files(image_file_id);

-- Episode Videos (trailers)
CREATE TABLE episode_video_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  episode_id INTEGER NOT NULL,
  video_file_id INTEGER NOT NULL,
  video_type TEXT NOT NULL CHECK(video_type IN ('trailer', 'extra')),
  location TEXT NOT NULL CHECK(location IN ('library', 'cache')),
  is_published BOOLEAN DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE,
  FOREIGN KEY (video_file_id) REFERENCES video_files(id) ON DELETE CASCADE,
  UNIQUE(episode_id, video_file_id, location)
);
CREATE INDEX idx_episode_videos_episode ON episode_video_files(episode_id);
CREATE INDEX idx_episode_videos_file ON episode_video_files(video_file_id);

-- Episode Text Files (subtitles)
CREATE TABLE episode_text_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  episode_id INTEGER NOT NULL,
  text_file_id INTEGER NOT NULL,
  text_type TEXT NOT NULL CHECK(text_type IN ('nfo', 'subtitle')),
  location TEXT NOT NULL CHECK(location IN ('library', 'cache')),
  is_published BOOLEAN DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE,
  FOREIGN KEY (text_file_id) REFERENCES text_files(id) ON DELETE CASCADE,
  UNIQUE(episode_id, text_file_id, location)
);
CREATE INDEX idx_episode_texts_episode ON episode_text_files(episode_id);
CREATE INDEX idx_episode_texts_file ON episode_text_files(text_file_id);

-- Actor Images (headshots)
CREATE TABLE actor_image_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER NOT NULL,
  image_file_id INTEGER NOT NULL,
  image_type TEXT NOT NULL CHECK(image_type IN ('thumb', 'unknown')),
  location TEXT NOT NULL CHECK(location IN ('library', 'cache')),
  is_selected BOOLEAN DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (actor_id) REFERENCES actors(id) ON DELETE CASCADE,
  FOREIGN KEY (image_file_id) REFERENCES image_files(id) ON DELETE CASCADE,
  UNIQUE(actor_id, image_file_id, location)
);
CREATE INDEX idx_actor_images_actor ON actor_image_files(actor_id);
CREATE INDEX idx_actor_images_file ON actor_image_files(image_file_id);
```

### Movie Table Changes

Remove all the `*_id` FK columns from movies table:

```sql
-- REMOVE these columns:
poster_id, fanart_id, logo_id, clearlogo_id, clearart_id,
banner_id, thumb_id, discart_id, keyart_id, landscape_id

-- Keep only locking fields:
poster_locked, fanart_locked, logo_locked, clearlogo_locked, clearart_locked,
banner_locked, thumb_locked, discart_locked, keyart_locked, landscape_locked
```

### Query Changes

**OLD** (Direct FK):
```sql
SELECT m.*, i.file_path as poster_path
FROM movies m
LEFT JOIN image_files i ON m.poster_id = i.id
```

**NEW** (Junction table):
```sql
SELECT m.*, i.file_path as poster_path
FROM movies m
LEFT JOIN movie_image_files mif ON m.id = mif.movie_id
  AND mif.image_type = 'poster'
  AND mif.is_selected = 1
LEFT JOIN image_files i ON mif.image_file_id = i.id
```

### CASCADE Behavior

```
DELETE FROM libraries WHERE id = 1
  ↓ CASCADE
DELETE FROM movies WHERE library_id = 1
  ↓ CASCADE
DELETE FROM movie_image_files WHERE movie_id IN (...)
  ↓ CASCADE (if orphaned)
DELETE FROM image_files WHERE id NOT IN (SELECT image_file_id FROM movie_image_files)
```

### Migration Strategy

Since you delete the database on server restart during development:
1. Update base migration (`20251015_001_clean_schema.ts`)
2. Update all queries in services
3. Test library deletion

No data migration needed - fresh start with correct schema.
