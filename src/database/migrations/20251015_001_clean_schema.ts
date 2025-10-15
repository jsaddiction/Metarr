import { DatabaseConnection } from '../../types/database.js';

/**
 * Clean Schema Migration - Streamlined Architecture
 *
 * Based on DATABASE_SCHEMA.md - Simplified design with:
 * - 3 states instead of 6 (unidentified, identified, enriched)
 * - Content-addressed cache with hash sharding
 * - Job queue with priority levels
 * - Field locking for user overrides
 * - 30-day soft deletes
 * - Media player groups
 * - Path mappings
 * - Playback state management
 */

export class CleanSchemaMigration {
  static version = '20251015_001';
  static migrationName = 'clean_schema';

  static async up(db: DatabaseConnection): Promise<void> {
    console.log('🚀 Running clean schema migration...');

    // ============================================================
    // CORE TABLES
    // ============================================================

    // Libraries
    await db.execute(`
      CREATE TABLE libraries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        path TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('movie', 'tv', 'music')),
        enabled BOOLEAN DEFAULT 1,
        last_scan_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.execute('CREATE INDEX idx_libraries_type ON libraries(type)');
    await db.execute('CREATE INDEX idx_libraries_enabled ON libraries(enabled)');

    // Media Player Groups
    await db.execute(`
      CREATE TABLE media_player_groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('kodi', 'jellyfin', 'plex')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Media Players
    await db.execute(`
      CREATE TABLE media_players (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        host TEXT NOT NULL,
        port INTEGER NOT NULL,
        username TEXT,
        password TEXT,
        api_key TEXT,
        enabled BOOLEAN DEFAULT 1,
        last_ping_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (group_id) REFERENCES media_player_groups(id) ON DELETE CASCADE
      )
    `);

    await db.execute('CREATE INDEX idx_media_players_group ON media_players(group_id)');
    await db.execute('CREATE INDEX idx_media_players_enabled ON media_players(enabled)');

    // Path Mappings
    await db.execute(`
      CREATE TABLE path_mappings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        media_player_group_id INTEGER NOT NULL,
        metarr_path TEXT NOT NULL,
        player_path TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (media_player_group_id) REFERENCES media_player_groups(id) ON DELETE CASCADE
      )
    `);

    await db.execute('CREATE INDEX idx_path_mappings_group ON path_mappings(media_player_group_id)');

    // ============================================================
    // CACHE & ASSET TABLES
    // ============================================================

    // Cache Assets (Content-Addressed Storage)
    await db.execute(`
      CREATE TABLE cache_assets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content_hash TEXT UNIQUE NOT NULL,
        file_path TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        mime_type TEXT NOT NULL,
        width INTEGER,
        height INTEGER,
        perceptual_hash TEXT,
        source_type TEXT NOT NULL CHECK(source_type IN ('provider', 'local', 'user')),
        source_url TEXT,
        provider_name TEXT,
        reference_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.execute('CREATE UNIQUE INDEX idx_cache_assets_hash ON cache_assets(content_hash)');
    await db.execute('CREATE INDEX idx_cache_assets_phash ON cache_assets(perceptual_hash)');
    await db.execute('CREATE INDEX idx_cache_assets_type ON cache_assets(source_type)');
    await db.execute('CREATE INDEX idx_cache_assets_refs ON cache_assets(reference_count)');

    // Asset References (Track where assets are used)
    await db.execute(`
      CREATE TABLE asset_references (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cache_asset_id INTEGER NOT NULL,
        entity_type TEXT NOT NULL CHECK(entity_type IN ('movie', 'series', 'season', 'episode', 'artist', 'album')),
        entity_id INTEGER NOT NULL,
        asset_type TEXT NOT NULL CHECK(asset_type IN ('poster', 'fanart', 'banner', 'logo', 'clearart', 'thumb', 'discart')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (cache_asset_id) REFERENCES cache_assets(id) ON DELETE CASCADE,
        UNIQUE(entity_type, entity_id, asset_type)
      )
    `);

    await db.execute('CREATE INDEX idx_asset_refs_cache ON asset_references(cache_asset_id)');
    await db.execute('CREATE INDEX idx_asset_refs_entity ON asset_references(entity_type, entity_id)');

    // Trailers
    await db.execute(`
      CREATE TABLE trailers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cache_asset_id INTEGER NOT NULL,
        entity_type TEXT NOT NULL CHECK(entity_type IN ('movie', 'series')),
        entity_id INTEGER NOT NULL,
        title TEXT,
        duration INTEGER,
        quality TEXT,
        locked BOOLEAN DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (cache_asset_id) REFERENCES cache_assets(id) ON DELETE CASCADE
      )
    `);

    await db.execute('CREATE INDEX idx_trailers_cache ON trailers(cache_asset_id)');
    await db.execute('CREATE INDEX idx_trailers_entity ON trailers(entity_type, entity_id)');

    console.log('✅ Cache and asset tables created');

    // ============================================================
    // MOVIE TABLES
    // ============================================================

    // Movies
    await db.execute(`
      CREATE TABLE movies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        library_id INTEGER NOT NULL,
        file_path TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_size INTEGER,
        file_hash TEXT,
        tmdb_id INTEGER,
        imdb_id TEXT,
        title TEXT NOT NULL,
        original_title TEXT,
        sort_title TEXT,
        tagline TEXT,
        plot TEXT,
        outline TEXT,
        runtime INTEGER,
        year INTEGER,
        release_date DATE,
        content_rating TEXT,
        tmdb_rating REAL,
        tmdb_votes INTEGER,
        imdb_rating REAL,
        imdb_votes INTEGER,
        poster_id INTEGER,
        fanart_id INTEGER,
        logo_id INTEGER,
        clearart_id INTEGER,
        banner_id INTEGER,
        thumb_id INTEGER,
        discart_id INTEGER,
        title_locked BOOLEAN DEFAULT 0,
        plot_locked BOOLEAN DEFAULT 0,
        poster_locked BOOLEAN DEFAULT 0,
        fanart_locked BOOLEAN DEFAULT 0,
        logo_locked BOOLEAN DEFAULT 0,
        clearart_locked BOOLEAN DEFAULT 0,
        banner_locked BOOLEAN DEFAULT 0,
        thumb_locked BOOLEAN DEFAULT 0,
        discart_locked BOOLEAN DEFAULT 0,
        identification_status TEXT DEFAULT 'unidentified' CHECK(identification_status IN ('unidentified', 'identified', 'enriched')),
        enrichment_priority INTEGER DEFAULT 5,
        deleted_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE,
        FOREIGN KEY (poster_id) REFERENCES cache_assets(id),
        FOREIGN KEY (fanart_id) REFERENCES cache_assets(id),
        FOREIGN KEY (logo_id) REFERENCES cache_assets(id),
        FOREIGN KEY (clearart_id) REFERENCES cache_assets(id),
        FOREIGN KEY (banner_id) REFERENCES cache_assets(id),
        FOREIGN KEY (thumb_id) REFERENCES cache_assets(id),
        FOREIGN KEY (discart_id) REFERENCES cache_assets(id)
      )
    `);

    await db.execute('CREATE INDEX idx_movies_library ON movies(library_id)');
    await db.execute('CREATE INDEX idx_movies_tmdb ON movies(tmdb_id)');
    await db.execute('CREATE INDEX idx_movies_imdb ON movies(imdb_id)');
    await db.execute('CREATE INDEX idx_movies_identification ON movies(identification_status)');
    await db.execute('CREATE INDEX idx_movies_deleted ON movies(deleted_at)');
    await db.execute('CREATE INDEX idx_movies_file_path ON movies(file_path)');

    // Movie Collections
    await db.execute(`
      CREATE TABLE movie_collections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tmdb_collection_id INTEGER UNIQUE,
        name TEXT NOT NULL,
        plot TEXT,
        poster_id INTEGER,
        fanart_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (poster_id) REFERENCES cache_assets(id),
        FOREIGN KEY (fanart_id) REFERENCES cache_assets(id)
      )
    `);

    // Movie Collection Members
    await db.execute(`
      CREATE TABLE movie_collection_members (
        movie_id INTEGER NOT NULL,
        collection_id INTEGER NOT NULL,
        sort_order INTEGER,
        PRIMARY KEY (movie_id, collection_id),
        FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
        FOREIGN KEY (collection_id) REFERENCES movie_collections(id) ON DELETE CASCADE
      )
    `);

    await db.execute('CREATE INDEX idx_collection_members_movie ON movie_collection_members(movie_id)');
    await db.execute('CREATE INDEX idx_collection_members_collection ON movie_collection_members(collection_id)');

    console.log('✅ Movie tables created');

    // ============================================================
    // TV SHOW TABLES (simplified - full implementation later)
    // ============================================================

    // Series
    await db.execute(`
      CREATE TABLE series (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        library_id INTEGER NOT NULL,
        directory_path TEXT NOT NULL,
        tvdb_id INTEGER,
        tmdb_id INTEGER,
        imdb_id TEXT,
        title TEXT NOT NULL,
        original_title TEXT,
        sort_title TEXT,
        plot TEXT,
        outline TEXT,
        status TEXT,
        premiered DATE,
        studio TEXT,
        content_rating TEXT,
        tvdb_rating REAL,
        tvdb_votes INTEGER,
        tmdb_rating REAL,
        tmdb_votes INTEGER,
        poster_id INTEGER,
        fanart_id INTEGER,
        banner_id INTEGER,
        logo_id INTEGER,
        clearart_id INTEGER,
        thumb_id INTEGER,
        title_locked BOOLEAN DEFAULT 0,
        plot_locked BOOLEAN DEFAULT 0,
        poster_locked BOOLEAN DEFAULT 0,
        fanart_locked BOOLEAN DEFAULT 0,
        banner_locked BOOLEAN DEFAULT 0,
        logo_locked BOOLEAN DEFAULT 0,
        clearart_locked BOOLEAN DEFAULT 0,
        thumb_locked BOOLEAN DEFAULT 0,
        identification_status TEXT DEFAULT 'unidentified' CHECK(identification_status IN ('unidentified', 'identified', 'enriched')),
        enrichment_priority INTEGER DEFAULT 5,
        deleted_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE,
        FOREIGN KEY (poster_id) REFERENCES cache_assets(id),
        FOREIGN KEY (fanart_id) REFERENCES cache_assets(id),
        FOREIGN KEY (banner_id) REFERENCES cache_assets(id),
        FOREIGN KEY (logo_id) REFERENCES cache_assets(id),
        FOREIGN KEY (clearart_id) REFERENCES cache_assets(id),
        FOREIGN KEY (thumb_id) REFERENCES cache_assets(id)
      )
    `);

    await db.execute('CREATE INDEX idx_series_library ON series(library_id)');
    await db.execute('CREATE INDEX idx_series_tvdb ON series(tvdb_id)');
    await db.execute('CREATE INDEX idx_series_tmdb ON series(tmdb_id)');
    await db.execute('CREATE INDEX idx_series_imdb ON series(imdb_id)');
    await db.execute('CREATE INDEX idx_series_identification ON series(identification_status)');
    await db.execute('CREATE INDEX idx_series_deleted ON series(deleted_at)');

    // Seasons
    await db.execute(`
      CREATE TABLE seasons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        series_id INTEGER NOT NULL,
        season_number INTEGER NOT NULL,
        title TEXT,
        plot TEXT,
        premiered DATE,
        poster_id INTEGER,
        fanart_id INTEGER,
        banner_id INTEGER,
        thumb_id INTEGER,
        poster_locked BOOLEAN DEFAULT 0,
        fanart_locked BOOLEAN DEFAULT 0,
        banner_locked BOOLEAN DEFAULT 0,
        thumb_locked BOOLEAN DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE,
        FOREIGN KEY (poster_id) REFERENCES cache_assets(id),
        FOREIGN KEY (fanart_id) REFERENCES cache_assets(id),
        FOREIGN KEY (banner_id) REFERENCES cache_assets(id),
        FOREIGN KEY (thumb_id) REFERENCES cache_assets(id),
        UNIQUE(series_id, season_number)
      )
    `);

    await db.execute('CREATE INDEX idx_seasons_series ON seasons(series_id)');
    await db.execute('CREATE INDEX idx_seasons_number ON seasons(season_number)');

    // Episodes
    await db.execute(`
      CREATE TABLE episodes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        series_id INTEGER NOT NULL,
        season_id INTEGER NOT NULL,
        file_path TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_size INTEGER,
        file_hash TEXT,
        episode_number INTEGER NOT NULL,
        absolute_number INTEGER,
        tvdb_id INTEGER,
        tmdb_id INTEGER,
        imdb_id TEXT,
        title TEXT NOT NULL,
        plot TEXT,
        aired DATE,
        runtime INTEGER,
        tvdb_rating REAL,
        tvdb_votes INTEGER,
        thumb_id INTEGER,
        title_locked BOOLEAN DEFAULT 0,
        plot_locked BOOLEAN DEFAULT 0,
        thumb_locked BOOLEAN DEFAULT 0,
        deleted_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE,
        FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE,
        FOREIGN KEY (thumb_id) REFERENCES cache_assets(id),
        UNIQUE(season_id, episode_number)
      )
    `);

    await db.execute('CREATE INDEX idx_episodes_series ON episodes(series_id)');
    await db.execute('CREATE INDEX idx_episodes_season ON episodes(season_id)');
    await db.execute('CREATE INDEX idx_episodes_tvdb ON episodes(tvdb_id)');
    await db.execute('CREATE INDEX idx_episodes_tmdb ON episodes(tmdb_id)');
    await db.execute('CREATE INDEX idx_episodes_deleted ON episodes(deleted_at)');
    await db.execute('CREATE INDEX idx_episodes_file_path ON episodes(file_path)');

    console.log('✅ TV show tables created');

    // ============================================================
    // MUSIC TABLES (simplified - full implementation later)
    // ============================================================

    // Artists
    await db.execute(`
      CREATE TABLE artists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        library_id INTEGER NOT NULL,
        directory_path TEXT,
        musicbrainz_id TEXT,
        name TEXT NOT NULL,
        sort_name TEXT,
        biography TEXT,
        formed DATE,
        disbanded DATE,
        thumb_id INTEGER,
        fanart_id INTEGER,
        banner_id INTEGER,
        logo_id INTEGER,
        biography_locked BOOLEAN DEFAULT 0,
        thumb_locked BOOLEAN DEFAULT 0,
        fanart_locked BOOLEAN DEFAULT 0,
        banner_locked BOOLEAN DEFAULT 0,
        logo_locked BOOLEAN DEFAULT 0,
        identification_status TEXT DEFAULT 'unidentified' CHECK(identification_status IN ('unidentified', 'identified', 'enriched')),
        enrichment_priority INTEGER DEFAULT 5,
        deleted_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE,
        FOREIGN KEY (thumb_id) REFERENCES cache_assets(id),
        FOREIGN KEY (fanart_id) REFERENCES cache_assets(id),
        FOREIGN KEY (banner_id) REFERENCES cache_assets(id),
        FOREIGN KEY (logo_id) REFERENCES cache_assets(id)
      )
    `);

    await db.execute('CREATE INDEX idx_artists_library ON artists(library_id)');
    await db.execute('CREATE INDEX idx_artists_musicbrainz ON artists(musicbrainz_id)');
    await db.execute('CREATE INDEX idx_artists_identification ON artists(identification_status)');
    await db.execute('CREATE INDEX idx_artists_deleted ON artists(deleted_at)');

    // Albums
    await db.execute(`
      CREATE TABLE albums (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        artist_id INTEGER NOT NULL,
        directory_path TEXT NOT NULL,
        musicbrainz_id TEXT,
        title TEXT NOT NULL,
        sort_title TEXT,
        year INTEGER,
        release_date DATE,
        album_type TEXT,
        description TEXT,
        label TEXT,
        rating REAL,
        votes INTEGER,
        thumb_id INTEGER,
        title_locked BOOLEAN DEFAULT 0,
        description_locked BOOLEAN DEFAULT 0,
        thumb_locked BOOLEAN DEFAULT 0,
        deleted_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE,
        FOREIGN KEY (thumb_id) REFERENCES cache_assets(id)
      )
    `);

    await db.execute('CREATE INDEX idx_albums_artist ON albums(artist_id)');
    await db.execute('CREATE INDEX idx_albums_musicbrainz ON albums(musicbrainz_id)');
    await db.execute('CREATE INDEX idx_albums_deleted ON albums(deleted_at)');

    // Tracks
    await db.execute(`
      CREATE TABLE tracks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        album_id INTEGER NOT NULL,
        file_path TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_size INTEGER,
        file_hash TEXT,
        musicbrainz_id TEXT,
        title TEXT NOT NULL,
        track_number INTEGER,
        disc_number INTEGER DEFAULT 1,
        duration INTEGER,
        deleted_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE
      )
    `);

    await db.execute('CREATE INDEX idx_tracks_album ON tracks(album_id)');
    await db.execute('CREATE INDEX idx_tracks_musicbrainz ON tracks(musicbrainz_id)');
    await db.execute('CREATE INDEX idx_tracks_deleted ON tracks(deleted_at)');
    await db.execute('CREATE INDEX idx_tracks_file_path ON tracks(file_path)');

    console.log('✅ Music tables created');

    // ============================================================
    // STREAM DETAILS TABLES
    // ============================================================

    // Video Streams
    await db.execute(`
      CREATE TABLE video_streams (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL CHECK(entity_type IN ('movie', 'episode', 'track')),
        entity_id INTEGER NOT NULL,
        stream_index INTEGER NOT NULL,
        codec TEXT,
        width INTEGER,
        height INTEGER,
        aspect_ratio TEXT,
        framerate REAL,
        bitrate INTEGER,
        hdr_type TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.execute('CREATE INDEX idx_video_streams_entity ON video_streams(entity_type, entity_id)');

    // Audio Streams
    await db.execute(`
      CREATE TABLE audio_streams (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL CHECK(entity_type IN ('movie', 'episode', 'track')),
        entity_id INTEGER NOT NULL,
        stream_index INTEGER NOT NULL,
        codec TEXT,
        language TEXT,
        channels INTEGER,
        bitrate INTEGER,
        title TEXT,
        default_stream BOOLEAN DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.execute('CREATE INDEX idx_audio_streams_entity ON audio_streams(entity_type, entity_id)');

    // Subtitle Streams
    await db.execute(`
      CREATE TABLE subtitle_streams (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL CHECK(entity_type IN ('movie', 'episode')),
        entity_id INTEGER NOT NULL,
        stream_index INTEGER,
        cache_asset_id INTEGER,
        language TEXT NOT NULL,
        title TEXT,
        format TEXT,
        forced BOOLEAN DEFAULT 0,
        default_stream BOOLEAN DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (cache_asset_id) REFERENCES cache_assets(id)
      )
    `);

    await db.execute('CREATE INDEX idx_subtitle_streams_entity ON subtitle_streams(entity_type, entity_id)');
    await db.execute('CREATE INDEX idx_subtitle_streams_cache ON subtitle_streams(cache_asset_id)');

    console.log('✅ Stream detail tables created');

    // ============================================================
    // NORMALIZED METADATA TABLES
    // ============================================================

    // Actors
    await db.execute(`
      CREATE TABLE actors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        tmdb_id INTEGER UNIQUE,
        imdb_id TEXT,
        thumb_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (thumb_id) REFERENCES cache_assets(id),
        UNIQUE(name)
      )
    `);

    await db.execute('CREATE INDEX idx_actors_tmdb ON actors(tmdb_id)');

    // Movie Actors
    await db.execute(`
      CREATE TABLE movie_actors (
        movie_id INTEGER NOT NULL,
        actor_id INTEGER NOT NULL,
        role TEXT,
        sort_order INTEGER,
        PRIMARY KEY (movie_id, actor_id),
        FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
        FOREIGN KEY (actor_id) REFERENCES actors(id) ON DELETE CASCADE
      )
    `);

    await db.execute('CREATE INDEX idx_movie_actors_movie ON movie_actors(movie_id)');
    await db.execute('CREATE INDEX idx_movie_actors_actor ON movie_actors(actor_id)');

    // Episode Actors
    await db.execute(`
      CREATE TABLE episode_actors (
        episode_id INTEGER NOT NULL,
        actor_id INTEGER NOT NULL,
        role TEXT,
        sort_order INTEGER,
        PRIMARY KEY (episode_id, actor_id),
        FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE,
        FOREIGN KEY (actor_id) REFERENCES actors(id) ON DELETE CASCADE
      )
    `);

    await db.execute('CREATE INDEX idx_episode_actors_episode ON episode_actors(episode_id)');
    await db.execute('CREATE INDEX idx_episode_actors_actor ON episode_actors(actor_id)');

    // Crew
    await db.execute(`
      CREATE TABLE crew (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        tmdb_id INTEGER UNIQUE,
        imdb_id TEXT,
        thumb_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (thumb_id) REFERENCES cache_assets(id),
        UNIQUE(name)
      )
    `);

    await db.execute('CREATE INDEX idx_crew_tmdb ON crew(tmdb_id)');

    // Movie Crew
    await db.execute(`
      CREATE TABLE movie_crew (
        movie_id INTEGER NOT NULL,
        crew_id INTEGER NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('director', 'writer', 'producer', 'composer')),
        sort_order INTEGER,
        PRIMARY KEY (movie_id, crew_id, role),
        FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
        FOREIGN KEY (crew_id) REFERENCES crew(id) ON DELETE CASCADE
      )
    `);

    await db.execute('CREATE INDEX idx_movie_crew_movie ON movie_crew(movie_id)');
    await db.execute('CREATE INDEX idx_movie_crew_crew ON movie_crew(crew_id)');
    await db.execute('CREATE INDEX idx_movie_crew_role ON movie_crew(role)');

    // Episode Crew
    await db.execute(`
      CREATE TABLE episode_crew (
        episode_id INTEGER NOT NULL,
        crew_id INTEGER NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('director', 'writer', 'producer')),
        sort_order INTEGER,
        PRIMARY KEY (episode_id, crew_id, role),
        FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE,
        FOREIGN KEY (crew_id) REFERENCES crew(id) ON DELETE CASCADE
      )
    `);

    await db.execute('CREATE INDEX idx_episode_crew_episode ON episode_crew(episode_id)');
    await db.execute('CREATE INDEX idx_episode_crew_crew ON episode_crew(crew_id)');
    await db.execute('CREATE INDEX idx_episode_crew_role ON episode_crew(role)');

    // Genres
    await db.execute(`
      CREATE TABLE genres (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        media_type TEXT NOT NULL CHECK(media_type IN ('movie', 'tv', 'music')),
        UNIQUE(name, media_type)
      )
    `);

    // Movie Genres
    await db.execute(`
      CREATE TABLE movie_genres (
        movie_id INTEGER NOT NULL,
        genre_id INTEGER NOT NULL,
        PRIMARY KEY (movie_id, genre_id),
        FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
        FOREIGN KEY (genre_id) REFERENCES genres(id) ON DELETE CASCADE
      )
    `);

    await db.execute('CREATE INDEX idx_movie_genres_movie ON movie_genres(movie_id)');
    await db.execute('CREATE INDEX idx_movie_genres_genre ON movie_genres(genre_id)');

    // Series Genres
    await db.execute(`
      CREATE TABLE series_genres (
        series_id INTEGER NOT NULL,
        genre_id INTEGER NOT NULL,
        PRIMARY KEY (series_id, genre_id),
        FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE,
        FOREIGN KEY (genre_id) REFERENCES genres(id) ON DELETE CASCADE
      )
    `);

    await db.execute('CREATE INDEX idx_series_genres_series ON series_genres(series_id)');
    await db.execute('CREATE INDEX idx_series_genres_genre ON series_genres(genre_id)');

    // Music Genres
    await db.execute(`
      CREATE TABLE music_genres (
        artist_id INTEGER NOT NULL,
        genre_id INTEGER NOT NULL,
        PRIMARY KEY (artist_id, genre_id),
        FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE,
        FOREIGN KEY (genre_id) REFERENCES genres(id) ON DELETE CASCADE
      )
    `);

    await db.execute('CREATE INDEX idx_music_genres_artist ON music_genres(artist_id)');
    await db.execute('CREATE INDEX idx_music_genres_genre ON music_genres(genre_id)');

    // Studios
    await db.execute(`
      CREATE TABLE studios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL
      )
    `);

    // Movie Studios
    await db.execute(`
      CREATE TABLE movie_studios (
        movie_id INTEGER NOT NULL,
        studio_id INTEGER NOT NULL,
        PRIMARY KEY (movie_id, studio_id),
        FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
        FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE
      )
    `);

    await db.execute('CREATE INDEX idx_movie_studios_movie ON movie_studios(movie_id)');
    await db.execute('CREATE INDEX idx_movie_studios_studio ON movie_studios(studio_id)');

    // Series Studios
    await db.execute(`
      CREATE TABLE series_studios (
        series_id INTEGER NOT NULL,
        studio_id INTEGER NOT NULL,
        PRIMARY KEY (series_id, studio_id),
        FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE,
        FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE
      )
    `);

    await db.execute('CREATE INDEX idx_series_studios_series ON series_studios(series_id)');
    await db.execute('CREATE INDEX idx_series_studios_studio ON series_studios(studio_id)');

    console.log('✅ Normalized metadata tables created');

    // ============================================================
    // JOB QUEUE TABLES
    // ============================================================

    // Job Queue
    await db.execute(`
      CREATE TABLE job_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 5,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'failed', 'retrying')),
        payload TEXT NOT NULL,
        result TEXT,
        error TEXT,
        retry_count INTEGER DEFAULT 0,
        max_retries INTEGER DEFAULT 3,
        next_retry_at TIMESTAMP,
        started_at TIMESTAMP,
        completed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.execute('CREATE INDEX idx_jobs_status_priority ON job_queue(status, priority)');
    await db.execute('CREATE INDEX idx_jobs_type ON job_queue(type)');
    await db.execute('CREATE INDEX idx_jobs_retry ON job_queue(status, next_retry_at)');
    await db.execute('CREATE INDEX idx_jobs_created ON job_queue(created_at)');

    // Job Dependencies
    await db.execute(`
      CREATE TABLE job_dependencies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id INTEGER NOT NULL,
        depends_on_job_id INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (job_id) REFERENCES job_queue(id) ON DELETE CASCADE,
        FOREIGN KEY (depends_on_job_id) REFERENCES job_queue(id) ON DELETE CASCADE
      )
    `);

    await db.execute('CREATE INDEX idx_job_deps_job ON job_dependencies(job_id)');
    await db.execute('CREATE INDEX idx_job_deps_depends ON job_dependencies(depends_on_job_id)');

    console.log('✅ Job queue tables created');

    // ============================================================
    // PLAYBACK STATE TABLES
    // ============================================================

    // Playback State
    await db.execute(`
      CREATE TABLE playback_state (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        media_player_id INTEGER NOT NULL,
        entity_type TEXT NOT NULL CHECK(entity_type IN ('movie', 'episode', 'track')),
        entity_id INTEGER NOT NULL,
        file_path TEXT NOT NULL,
        position_seconds INTEGER NOT NULL,
        total_seconds INTEGER NOT NULL,
        position_percentage REAL,
        paused BOOLEAN DEFAULT 0,
        speed REAL DEFAULT 1.0,
        captured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        restored_at TIMESTAMP,
        FOREIGN KEY (media_player_id) REFERENCES media_players(id) ON DELETE CASCADE
      )
    `);

    await db.execute('CREATE INDEX idx_playback_state_player ON playback_state(media_player_id)');
    await db.execute('CREATE INDEX idx_playback_state_entity ON playback_state(entity_type, entity_id)');
    await db.execute('CREATE INDEX idx_playback_state_captured ON playback_state(captured_at)');

    // ============================================================
    // WEBHOOK TABLES
    // ============================================================

    // Webhook Events
    await db.execute(`
      CREATE TABLE webhook_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT NOT NULL CHECK(source IN ('radarr', 'sonarr', 'lidarr')),
        event_type TEXT NOT NULL,
        payload TEXT NOT NULL,
        processed BOOLEAN DEFAULT 0,
        job_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        processed_at TIMESTAMP,
        FOREIGN KEY (job_id) REFERENCES job_queue(id)
      )
    `);

    await db.execute('CREATE INDEX idx_webhook_events_source ON webhook_events(source)');
    await db.execute('CREATE INDEX idx_webhook_events_processed ON webhook_events(processed)');
    await db.execute('CREATE INDEX idx_webhook_events_created ON webhook_events(created_at)');

    // ============================================================
    // CONFIGURATION TABLES
    // ============================================================

    // Provider Configuration
    await db.execute(`
      CREATE TABLE provider_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider_name TEXT UNIQUE NOT NULL,
        enabled BOOLEAN DEFAULT 1,
        api_key TEXT,
        rate_limit_per_second REAL,
        priority INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.execute('CREATE INDEX idx_provider_config_enabled ON provider_config(enabled)');
    await db.execute('CREATE INDEX idx_provider_config_priority ON provider_config(priority)');

    // Application Settings
    await db.execute(`
      CREATE TABLE app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Ignore Patterns (for unknown file detection)
    await db.execute(`
      CREATE TABLE ignore_patterns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pattern TEXT NOT NULL,
        pattern_type TEXT NOT NULL CHECK(pattern_type IN ('glob', 'exact')),
        enabled BOOLEAN DEFAULT 1,
        is_system BOOLEAN DEFAULT 0,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.execute('CREATE INDEX idx_ignore_patterns_enabled ON ignore_patterns(enabled)');
    await db.execute('CREATE INDEX idx_ignore_patterns_system ON ignore_patterns(is_system)');

    // Insert default system patterns
    const defaultPatterns = [
      { pattern: '.DS_Store', type: 'exact', description: 'macOS metadata file' },
      { pattern: 'Thumbs.db', type: 'exact', description: 'Windows thumbnail cache' },
      { pattern: 'desktop.ini', type: 'exact', description: 'Windows folder config' },
      { pattern: '*.sample.*', type: 'glob', description: 'Sample video files' },
      { pattern: '*-sample.*', type: 'glob', description: 'Sample video files' },
      { pattern: '*.proof.*', type: 'glob', description: 'Proof video files' },
      { pattern: '*-proof.*', type: 'glob', description: 'Proof video files' },
      { pattern: 'RARBG*', type: 'glob', description: 'RARBG release info files' },
      { pattern: '*ETRG*', type: 'glob', description: 'ETRG release info files' },
      { pattern: '*.nfo', type: 'glob', description: 'NFO metadata files (handled separately)' },
      { pattern: '*.torrent', type: 'glob', description: 'Torrent files' },
      { pattern: '*.nzb', type: 'glob', description: 'NZB files' },
    ];

    for (const { pattern, type, description } of defaultPatterns) {
      await db.execute(
        `INSERT INTO ignore_patterns (pattern, pattern_type, enabled, is_system, description)
         VALUES (?, ?, 1, 1, ?)`,
        [pattern, type, description]
      );
    }

    // Unknown Files (detected during scan)
    await db.execute(`
      CREATE TABLE unknown_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL CHECK(entity_type IN ('movie', 'episode')),
        entity_id INTEGER NOT NULL,
        file_path TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        file_hash TEXT,
        extension TEXT NOT NULL,
        category TEXT NOT NULL CHECK(category IN ('video', 'image', 'archive', 'text', 'other')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.execute('CREATE INDEX idx_unknown_files_entity ON unknown_files(entity_type, entity_id)');
    await db.execute('CREATE INDEX idx_unknown_files_category ON unknown_files(category)');

    console.log('✅ Configuration tables created');

    // ============================================================
    // SCAN JOBS TABLE (for library scanning)
    // ============================================================

    await db.execute(`
      CREATE TABLE scan_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        library_id INTEGER NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
        progress_current INTEGER DEFAULT 0,
        progress_total INTEGER DEFAULT 0,
        current_file TEXT,
        errors_count INTEGER DEFAULT 0,
        started_at TIMESTAMP,
        completed_at TIMESTAMP,
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE
      )
    `);

    await db.execute('CREATE INDEX idx_scan_jobs_library ON scan_jobs(library_id)');
    await db.execute('CREATE INDEX idx_scan_jobs_status ON scan_jobs(status)');

    console.log('✅ Clean schema migration completed successfully!');
  }

  static async down(_db: DatabaseConnection): Promise<void> {
    console.log('⚠️  Clean schema rollback not implemented - this is the base schema');
  }
}
