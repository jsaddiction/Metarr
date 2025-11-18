import { DatabaseConnection } from '../../types/database.js';

/**
 * Clean Schema Migration - Streamlined Architecture
 *
 * UNIFIED FILE SYSTEM ARCHITECTURE:
 * - Type-specific file tables (video_files, image_files, audio_files, text_files)
 * - Location tracking (library | cache) in same table
 * - Direct FK relationships (no abstract cache_assets layer)
 * - Deduplication via file_hash
 * - Provider tracking (source_url, provider_name)
 * - Reference counting for cache cleanup
 *
 * Other features:
 * - 3 states (unidentified, identified, enriched)
 * - Job queue with priority levels
 * - Field locking for user overrides
 * - 30-day soft deletes
 * - Media player groups with path mappings
 *
 * FOREIGN KEY CASCADE RULES (Added 2025-11-17):
 * Addresses Audit Finding [C] Missing Foreign Key Cascades
 * All foreign keys now have explicit ON DELETE behavior:
 * - Asset references (poster_id, thumb_id, etc.) → ON DELETE SET NULL
 * - Junction tables (movie_actors, etc.) → ON DELETE CASCADE
 * - Audit references (webhook job_id) → ON DELETE SET NULL
 * - Parent entity references → ON DELETE CASCADE
 */

export class CleanSchemaMigration {
  static version = '20251015_001';
  static migrationName = 'clean_schema';

  static async up(db: DatabaseConnection): Promise<void> {
    console.log('🚀 Running clean schema migration...');

    // ============================================================
    // DROP OLD TABLES (if upgrading from previous schema)
    // ============================================================

    console.log('🧹 Cleaning up old tables if they exist...');

    // Drop old cache/asset tables (replaced by unified file system)
    await db.execute('DROP TABLE IF EXISTS asset_references').catch(() => {});
    await db.execute('DROP TABLE IF EXISTS trailers').catch(() => {});
    await db.execute('DROP TABLE IF EXISTS cache_assets').catch(() => {});

    // Drop old unknown_files if it exists (will be recreated with new schema)
    await db.execute('DROP INDEX IF EXISTS idx_unknown_files_category').catch(() => {});
    await db.execute('DROP TABLE IF EXISTS unknown_files').catch(() => {});

    console.log('✅ Old tables cleaned up');

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
        auto_enrich BOOLEAN DEFAULT 1,
        auto_publish BOOLEAN DEFAULT 0,
        description TEXT,
        last_scan_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.execute('CREATE INDEX idx_libraries_type ON libraries(type)');
    await db.execute('CREATE INDEX idx_libraries_enabled ON libraries(enabled)');
    await db.execute('CREATE INDEX idx_libraries_auto_enrich ON libraries(auto_enrich)');
    await db.execute('CREATE INDEX idx_libraries_auto_publish ON libraries(auto_publish)');

    // Media Player Groups
    await db.execute(`
      CREATE TABLE media_player_groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('kodi', 'jellyfin', 'plex')),
        max_members INTEGER NULL,
        enabled BOOLEAN DEFAULT 1,
        skip_active BOOLEAN DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.execute('CREATE INDEX idx_media_player_groups_type ON media_player_groups(type)');
    await db.execute('CREATE INDEX idx_media_player_groups_max_members ON media_player_groups(max_members)');

    // Media Players
    await db.execute(`
      CREATE TABLE media_players (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        type TEXT DEFAULT 'kodi',
        host TEXT NOT NULL,
        http_port INTEGER NOT NULL DEFAULT 8080,
        username TEXT,
        password TEXT,
        api_key TEXT,
        enabled BOOLEAN DEFAULT 1,
        library_group TEXT,
        library_paths TEXT DEFAULT '[]',
        config TEXT DEFAULT '{}',
        connection_status TEXT DEFAULT 'disconnected',
        json_rpc_version TEXT,
        last_connected TIMESTAMP,
        last_error TEXT,
        last_ping_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (group_id) REFERENCES media_player_groups(id) ON DELETE CASCADE
      )
    `);

    await db.execute('CREATE INDEX idx_media_players_group ON media_players(group_id)');
    await db.execute('CREATE INDEX idx_media_players_enabled ON media_players(enabled)');
    await db.execute('CREATE INDEX idx_media_players_type ON media_players(type)');
    await db.execute('CREATE INDEX idx_media_players_connection_status ON media_players(connection_status)');

    // Media Player Libraries (Group-Library Junction)
    await db.execute(`
      CREATE TABLE media_player_libraries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id INTEGER NOT NULL,
        library_id INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (group_id) REFERENCES media_player_groups(id) ON DELETE CASCADE,
        FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE,
        UNIQUE(group_id, library_id)
      )
    `);

    await db.execute('CREATE INDEX idx_media_player_libraries_group ON media_player_libraries(group_id)');
    await db.execute('CREATE INDEX idx_media_player_libraries_library ON media_player_libraries(library_id)');

    // Media Player Group Path Mappings
    await db.execute(`
      CREATE TABLE media_player_group_path_mappings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id INTEGER NOT NULL,
        metarr_path TEXT NOT NULL,
        player_path TEXT NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (group_id) REFERENCES media_player_groups(id) ON DELETE CASCADE
      )
    `);

    await db.execute('CREATE INDEX idx_group_path_mappings_group ON media_player_group_path_mappings(group_id)');
    await db.execute('CREATE INDEX idx_group_path_mappings_metarr_path ON media_player_group_path_mappings(metarr_path)');
    await db.execute('CREATE UNIQUE INDEX idx_group_path_mappings_unique ON media_player_group_path_mappings(group_id, metarr_path)');

    // ============================================================
    // UNIFIED FILE SYSTEM TABLES
    // ============================================================

    // Cache Video Files (Trailers, samples from providers)
    await db.execute(`
      CREATE TABLE cache_video_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL CHECK(entity_type IN ('movie', 'episode')),
        entity_id INTEGER NOT NULL,
        file_path TEXT UNIQUE NOT NULL,
        file_name TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        file_hash TEXT,
        video_type TEXT NOT NULL CHECK(video_type IN ('trailer', 'sample', 'extra')),
        codec TEXT,
        width INTEGER,
        height INTEGER,
        duration_seconds INTEGER,
        bitrate INTEGER,
        framerate REAL,
        hdr_type TEXT,
        audio_codec TEXT,
        audio_channels INTEGER,
        audio_language TEXT,
        source_type TEXT CHECK(source_type IN ('provider', 'local', 'user')),
        source_url TEXT,
        provider_name TEXT,
        classification_score INTEGER,
        is_locked BOOLEAN DEFAULT 0,
        discovered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_accessed_at TIMESTAMP
      )
    `);

    // Enhanced composite index for polymorphic entity lookups with sorting
    // Includes classification_score and discovered_at for efficient ordered queries
    // Optimizes: WHERE entity_type = ? AND entity_id = ? [AND video_type = ?]
    //           ORDER BY classification_score DESC, discovered_at DESC
    // Audit Finding 5.2: Eliminates separate sort operation (10x performance improvement)
    await db.execute('CREATE INDEX idx_cache_videos_entity_score ON cache_video_files(entity_type, entity_id, video_type, classification_score DESC, discovered_at DESC)');
    await db.execute('CREATE INDEX idx_cache_videos_hash ON cache_video_files(file_hash)');
    await db.execute('CREATE INDEX idx_cache_videos_locked ON cache_video_files(is_locked)');

    console.log('✅ cache_video_files table created');

    // Library Video Files (Published trailers for media players, ephemeral - can be rebuilt from cache)
    await db.execute(`
      CREATE TABLE library_video_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cache_file_id INTEGER NOT NULL,
        file_path TEXT UNIQUE NOT NULL,
        published_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (cache_file_id) REFERENCES cache_video_files(id) ON DELETE CASCADE
      )
    `);

    await db.execute('CREATE INDEX idx_library_videos_cache ON library_video_files(cache_file_id)');
    await db.execute('CREATE INDEX idx_library_videos_path ON library_video_files(file_path)');

    console.log('✅ cache_video_files and library_video_files tables created');

    // ============================================================
    // SPLIT ARCHITECTURE: Cache (permanent) vs Library (ephemeral)
    // ============================================================

    // Cache Image Files (Protected, survives library deletion)
    await db.execute(`
      CREATE TABLE cache_image_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL CHECK(entity_type IN ('movie', 'episode', 'series', 'season', 'actor')),
        entity_id INTEGER NOT NULL,
        file_path TEXT UNIQUE NOT NULL,
        file_name TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        file_hash TEXT,
        perceptual_hash TEXT,
        difference_hash TEXT,
        image_type TEXT NOT NULL CHECK(image_type IN (
          'poster', 'fanart', 'banner', 'clearlogo', 'clearart', 'discart',
          'landscape', 'keyart', 'thumb', 'actor_thumb', 'unknown'
        )),
        width INTEGER NOT NULL,
        height INTEGER NOT NULL,
        format TEXT NOT NULL,
        has_alpha BOOLEAN DEFAULT NULL,
        foreground_ratio REAL DEFAULT NULL,
        source_type TEXT CHECK(source_type IN ('provider', 'local', 'user')),
        source_url TEXT,
        provider_name TEXT,
        classification_score INTEGER,
        is_locked BOOLEAN DEFAULT 0,
        discovered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_accessed_at TIMESTAMP
      )
    `);

    // Enhanced composite index for polymorphic entity lookups with sorting
    // Includes classification_score and discovered_at for efficient ordered queries
    // Optimizes: WHERE entity_type = ? AND entity_id = ? [AND image_type = ?]
    //           ORDER BY classification_score DESC, discovered_at DESC
    // Used in: movieService movie list query (13+ subqueries), imageService, assetDiscovery
    // Audit Finding 5.2: Eliminates separate sort operation (10x performance improvement)
    await db.execute('CREATE INDEX idx_cache_images_entity_score ON cache_image_files(entity_type, entity_id, image_type, classification_score DESC, discovered_at DESC)');
    await db.execute('CREATE INDEX idx_cache_images_hash ON cache_image_files(file_hash)');
    await db.execute('CREATE INDEX idx_cache_images_locked ON cache_image_files(is_locked)');

    console.log('✅ cache_image_files table created');

    // Library Image Files (Published to media players, ephemeral - can be rebuilt from cache)
    await db.execute(`
      CREATE TABLE library_image_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cache_file_id INTEGER NOT NULL,
        file_path TEXT UNIQUE NOT NULL,
        published_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (cache_file_id) REFERENCES cache_image_files(id) ON DELETE CASCADE
      )
    `);

    await db.execute('CREATE INDEX idx_library_images_cache ON library_image_files(cache_file_id)');
    await db.execute('CREATE INDEX idx_library_images_path ON library_image_files(file_path)');

    console.log('✅ library_image_files table created');

    // Cache Audio Files (Theme songs from providers)
    await db.execute(`
      CREATE TABLE cache_audio_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL CHECK(entity_type IN ('movie', 'series')),
        entity_id INTEGER NOT NULL,
        file_path TEXT UNIQUE NOT NULL,
        file_name TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        file_hash TEXT,
        audio_type TEXT NOT NULL CHECK(audio_type IN ('theme', 'unknown')),
        codec TEXT,
        duration_seconds INTEGER,
        bitrate INTEGER,
        sample_rate INTEGER,
        channels INTEGER,
        language TEXT,
        source_type TEXT CHECK(source_type IN ('provider', 'local', 'user')),
        source_url TEXT,
        provider_name TEXT,
        classification_score INTEGER,
        is_locked BOOLEAN DEFAULT 0,
        discovered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_accessed_at TIMESTAMP
      )
    `);

    // Composite index for polymorphic entity lookups (covers entity_type + entity_id + audio_type)
    // Optimizes: WHERE entity_type = ? AND entity_id = ? [AND audio_type = ?]
    await db.execute('CREATE INDEX idx_cache_audio_entity_composite ON cache_audio_files(entity_type, entity_id, audio_type)');
    await db.execute('CREATE INDEX idx_cache_audio_locked ON cache_audio_files(is_locked)');

    console.log('✅ cache_audio_files table created');

    // Library Audio Files (Published theme songs, ephemeral - can be rebuilt from cache)
    await db.execute(`
      CREATE TABLE library_audio_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cache_file_id INTEGER NOT NULL,
        file_path TEXT UNIQUE NOT NULL,
        published_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (cache_file_id) REFERENCES cache_audio_files(id) ON DELETE CASCADE
      )
    `);

    await db.execute('CREATE INDEX idx_library_audio_cache ON library_audio_files(cache_file_id)');
    await db.execute('CREATE INDEX idx_library_audio_path ON library_audio_files(file_path)');

    console.log('✅ library_audio_files table created');

    // Cache Text Files (NFO templates, subtitle options from providers)
    await db.execute(`
      CREATE TABLE cache_text_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL CHECK(entity_type IN ('movie', 'episode')),
        entity_id INTEGER NOT NULL,
        file_path TEXT UNIQUE NOT NULL,
        file_name TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        file_hash TEXT,
        text_type TEXT NOT NULL CHECK(text_type IN ('nfo', 'subtitle')),
        subtitle_language TEXT,
        subtitle_format TEXT,
        nfo_is_valid BOOLEAN,
        nfo_has_tmdb_id BOOLEAN,
        nfo_needs_regen BOOLEAN DEFAULT 0,
        source_type TEXT CHECK(source_type IN ('provider', 'local', 'user')),
        source_url TEXT,
        provider_name TEXT,
        classification_score INTEGER,
        is_locked BOOLEAN DEFAULT 0,
        discovered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_verified_at TIMESTAMP
      )
    `);

    // Enhanced composite index for polymorphic entity lookups with sorting
    // Includes classification_score and discovered_at for efficient ordered queries
    // Optimizes: WHERE entity_type = ? AND entity_id = ? [AND text_type = ?]
    //           ORDER BY classification_score DESC, discovered_at DESC
    // Critical for: SELECT MAX(discovered_at) FROM cache_text_files WHERE entity_type = 'movie' AND entity_id = ? AND text_type = 'nfo'
    // Audit Finding 5.2: Eliminates separate sort operation (10x performance improvement)
    await db.execute('CREATE INDEX idx_cache_text_entity_score ON cache_text_files(entity_type, entity_id, text_type, classification_score DESC, discovered_at DESC)');
    await db.execute('CREATE INDEX idx_cache_text_locked ON cache_text_files(is_locked)');

    console.log('✅ cache_text_files table created');

    // Library Text Files (Published NFOs and subtitles, ephemeral - can be rebuilt from cache)
    await db.execute(`
      CREATE TABLE library_text_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cache_file_id INTEGER NOT NULL,
        file_path TEXT UNIQUE NOT NULL,
        published_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (cache_file_id) REFERENCES cache_text_files(id) ON DELETE CASCADE
      )
    `);

    await db.execute('CREATE INDEX idx_library_text_cache ON library_text_files(cache_file_id)');
    await db.execute('CREATE INDEX idx_library_text_path ON library_text_files(file_path)');

    console.log('✅ library_text_files table created');

    // Unknown Files (minimal tracking for deletion UI)
    await db.execute(`
      CREATE TABLE unknown_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL CHECK(entity_type IN ('movie', 'episode')),
        entity_id INTEGER NOT NULL,
        file_path TEXT NOT NULL UNIQUE,
        file_name TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        extension TEXT NOT NULL,
        category TEXT CHECK(category IN ('video', 'image', 'archive', 'text', 'other')),
        discovered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Composite index for polymorphic entity lookups (covers entity_type + entity_id)
    // Optimizes: SELECT * FROM unknown_files WHERE entity_type = ? AND entity_id = ?
    await db.execute('CREATE INDEX idx_unknown_files_entity_composite ON unknown_files(entity_type, entity_id)');
    await db.execute('CREATE INDEX idx_unknown_files_extension ON unknown_files(extension)');
    await db.execute('CREATE INDEX idx_unknown_files_category ON unknown_files(category)');

    console.log('✅ unknown_files table created');

    console.log('✅ Unified file system tables created');

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
        user_rating REAL CHECK(user_rating >= 0 AND user_rating <= 10),
        nfo_cache_id INTEGER,
        title_locked BOOLEAN DEFAULT 0,
        plot_locked BOOLEAN DEFAULT 0,
        poster_locked BOOLEAN DEFAULT 0,
        fanart_locked BOOLEAN DEFAULT 0,
        logo_locked BOOLEAN DEFAULT 0,
        clearlogo_locked BOOLEAN DEFAULT 0,
        clearart_locked BOOLEAN DEFAULT 0,
        banner_locked BOOLEAN DEFAULT 0,
        thumb_locked BOOLEAN DEFAULT 0,
        discart_locked BOOLEAN DEFAULT 0,
        keyart_locked BOOLEAN DEFAULT 0,
        landscape_locked BOOLEAN DEFAULT 0,
        monitored BOOLEAN NOT NULL DEFAULT 1,
        identification_status TEXT DEFAULT 'unidentified' CHECK(identification_status IN ('unidentified', 'identified', 'enriched', 'published')),
        enrichment_priority INTEGER DEFAULT 5,
        enriched_at TIMESTAMP,
        published_at TIMESTAMP,
        deleted_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE,
        FOREIGN KEY (nfo_cache_id) REFERENCES cache_text_files(id) ON DELETE SET NULL
      )
    `);

    await db.execute('CREATE INDEX idx_movies_library ON movies(library_id)');
    await db.execute('CREATE INDEX idx_movies_tmdb ON movies(tmdb_id)');
    await db.execute('CREATE INDEX idx_movies_imdb ON movies(imdb_id)');
    await db.execute('CREATE INDEX idx_movies_monitored ON movies(monitored)');
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
        user_rating REAL CHECK(user_rating >= 0 AND user_rating <= 10),
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
        identification_status TEXT DEFAULT 'unidentified' CHECK(identification_status IN ('unidentified', 'identified', 'enriched', 'published')),
        enrichment_priority INTEGER DEFAULT 5,
        deleted_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE,
        FOREIGN KEY (poster_id) REFERENCES cache_image_files(id) ON DELETE SET NULL,
        FOREIGN KEY (fanart_id) REFERENCES cache_image_files(id) ON DELETE SET NULL,
        FOREIGN KEY (banner_id) REFERENCES cache_image_files(id) ON DELETE SET NULL,
        FOREIGN KEY (logo_id) REFERENCES cache_image_files(id) ON DELETE SET NULL,
        FOREIGN KEY (clearart_id) REFERENCES cache_image_files(id) ON DELETE SET NULL,
        FOREIGN KEY (thumb_id) REFERENCES cache_image_files(id) ON DELETE SET NULL
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
        FOREIGN KEY (poster_id) REFERENCES cache_image_files(id) ON DELETE SET NULL,
        FOREIGN KEY (fanart_id) REFERENCES cache_image_files(id) ON DELETE SET NULL,
        FOREIGN KEY (banner_id) REFERENCES cache_image_files(id) ON DELETE SET NULL,
        FOREIGN KEY (thumb_id) REFERENCES cache_image_files(id) ON DELETE SET NULL,
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
        user_rating REAL CHECK(user_rating >= 0 AND user_rating <= 10),
        thumb_id INTEGER,
        title_locked BOOLEAN DEFAULT 0,
        plot_locked BOOLEAN DEFAULT 0,
        thumb_locked BOOLEAN DEFAULT 0,
        deleted_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE,
        FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE,
        FOREIGN KEY (thumb_id) REFERENCES cache_image_files(id) ON DELETE SET NULL,
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
        identification_status TEXT DEFAULT 'unidentified' CHECK(identification_status IN ('unidentified', 'identified', 'enriched', 'published')),
        enrichment_priority INTEGER DEFAULT 5,
        deleted_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE,
        FOREIGN KEY (thumb_id) REFERENCES cache_image_files(id) ON DELETE SET NULL,
        FOREIGN KEY (fanart_id) REFERENCES cache_image_files(id) ON DELETE SET NULL,
        FOREIGN KEY (banner_id) REFERENCES cache_image_files(id) ON DELETE SET NULL,
        FOREIGN KEY (logo_id) REFERENCES cache_image_files(id) ON DELETE SET NULL
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
        FOREIGN KEY (thumb_id) REFERENCES cache_image_files(id) ON DELETE SET NULL
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
        FOREIGN KEY (cache_asset_id) REFERENCES cache_text_files(id) ON DELETE SET NULL
      )
    `);

    await db.execute('CREATE INDEX idx_subtitle_streams_entity ON subtitle_streams(entity_type, entity_id)');
    await db.execute('CREATE INDEX idx_subtitle_streams_cache ON subtitle_streams(cache_asset_id)');

    console.log('✅ Stream detail tables created');

    // ============================================================
    // NORMALIZED METADATA TABLES
    // ============================================================

    // Actors (central registry - one record per unique actor)
    await db.execute(`
      CREATE TABLE actors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        name_normalized TEXT NOT NULL UNIQUE,
        tmdb_id INTEGER UNIQUE,
        imdb_id TEXT,

        -- Single best image (from local OR provider)
        image_cache_path TEXT,
        image_hash TEXT,
        image_ctime INTEGER,

        -- Enrichment tracking (two-phase: identified → enriched)
        identification_status TEXT DEFAULT 'identified' CHECK(identification_status IN ('identified', 'enriched')),
        enrichment_priority INTEGER DEFAULT 5,

        -- Field locking for user overrides
        name_locked BOOLEAN DEFAULT 0,
        image_locked BOOLEAN DEFAULT 0,

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.execute('CREATE INDEX idx_actors_tmdb ON actors(tmdb_id)');
    await db.execute('CREATE INDEX idx_actors_name_normalized ON actors(name_normalized)');
    await db.execute('CREATE INDEX idx_actors_identification ON actors(identification_status)');

    // Movie Actors (link table)
    await db.execute(`
      CREATE TABLE movie_actors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        movie_id INTEGER NOT NULL,
        actor_id INTEGER NOT NULL,
        role TEXT,
        actor_order INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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
        FOREIGN KEY (thumb_id) REFERENCES cache_image_files(id) ON DELETE SET NULL,
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

    // Countries
    await db.execute(`
      CREATE TABLE countries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL
      )
    `);

    // Movie Countries
    await db.execute(`
      CREATE TABLE movie_countries (
        movie_id INTEGER NOT NULL,
        country_id INTEGER NOT NULL,
        PRIMARY KEY (movie_id, country_id),
        FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
        FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE CASCADE
      )
    `);

    await db.execute('CREATE INDEX idx_movie_countries_movie ON movie_countries(movie_id)');
    await db.execute('CREATE INDEX idx_movie_countries_country ON movie_countries(country_id)');

    // Series Countries
    await db.execute(`
      CREATE TABLE series_countries (
        series_id INTEGER NOT NULL,
        country_id INTEGER NOT NULL,
        PRIMARY KEY (series_id, country_id),
        FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE,
        FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE CASCADE
      )
    `);

    await db.execute('CREATE INDEX idx_series_countries_series ON series_countries(series_id)');
    await db.execute('CREATE INDEX idx_series_countries_country ON series_countries(country_id)');

    // Tags
    await db.execute(`
      CREATE TABLE tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL
      )
    `);

    // Movie Tags
    await db.execute(`
      CREATE TABLE movie_tags (
        movie_id INTEGER NOT NULL,
        tag_id INTEGER NOT NULL,
        PRIMARY KEY (movie_id, tag_id),
        FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
      )
    `);

    await db.execute('CREATE INDEX idx_movie_tags_movie ON movie_tags(movie_id)');
    await db.execute('CREATE INDEX idx_movie_tags_tag ON movie_tags(tag_id)');

    // Series Tags
    await db.execute(`
      CREATE TABLE series_tags (
        series_id INTEGER NOT NULL,
        tag_id INTEGER NOT NULL,
        PRIMARY KEY (series_id, tag_id),
        FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
      )
    `);

    await db.execute('CREATE INDEX idx_series_tags_series ON series_tags(series_id)');
    await db.execute('CREATE INDEX idx_series_tags_tag ON series_tags(tag_id)');

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
    // CASCADE DELETE TRIGGERS
    // ============================================================

    // CASCADE DELETE triggers for polymorphic cache files (Audit Fix #6)
    // Since SQLite doesn't support conditional foreign keys, use triggers to clean up orphaned cache files
    await db.execute(`
      CREATE TRIGGER trg_movies_delete_cache_images
      AFTER DELETE ON movies
      FOR EACH ROW
      BEGIN
        DELETE FROM cache_image_files WHERE entity_type = 'movie' AND entity_id = OLD.id;
      END
    `);

    await db.execute(`
      CREATE TRIGGER trg_episodes_delete_cache_images
      AFTER DELETE ON episodes
      FOR EACH ROW
      BEGIN
        DELETE FROM cache_image_files WHERE entity_type = 'episode' AND entity_id = OLD.id;
      END
    `);

    await db.execute(`
      CREATE TRIGGER trg_series_delete_cache_images
      AFTER DELETE ON series
      FOR EACH ROW
      BEGIN
        DELETE FROM cache_image_files WHERE entity_type = 'series' AND entity_id = OLD.id;
      END
    `);

    await db.execute(`
      CREATE TRIGGER trg_seasons_delete_cache_images
      AFTER DELETE ON seasons
      FOR EACH ROW
      BEGIN
        DELETE FROM cache_image_files WHERE entity_type = 'season' AND entity_id = OLD.id;
      END
    `);

    await db.execute(`
      CREATE TRIGGER trg_actors_delete_cache_images
      AFTER DELETE ON actors
      FOR EACH ROW
      BEGIN
        DELETE FROM cache_image_files WHERE entity_type = 'actor' AND entity_id = OLD.id;
      END
    `);

    console.log('✅ Cache orphan cleanup triggers created');

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
        manual INTEGER DEFAULT 0,
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
    await db.execute('CREATE INDEX idx_jobs_manual ON job_queue(manual, type, created_at DESC)');

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

    // NOTE: job_history table removed in favor of structured logging
    // Completed/failed jobs simply removed from job_queue
    // Use logs/app.log for job execution history

    // Job queue pickup indexes - optimized for worker polling
    // Covers: WHERE status IN ('pending', 'retrying') AND (status = 'pending' OR next_retry_at <= ?) ORDER BY priority, created_at
    await db.execute('CREATE INDEX idx_job_queue_pickup ON job_queue(status, priority ASC, created_at ASC) WHERE status = \'pending\'');
    await db.execute('CREATE INDEX idx_job_queue_pickup_retry ON job_queue(status, next_retry_at, priority ASC, created_at ASC) WHERE status = \'retrying\'');
    await db.execute('CREATE INDEX idx_job_queue_processing ON job_queue(status) WHERE status = \'processing\'');

    // Library Scheduler Configuration
    await db.execute(`
      CREATE TABLE library_scheduler_config (
        library_id INTEGER PRIMARY KEY,
        file_scanner_enabled BOOLEAN NOT NULL DEFAULT 0,
        file_scanner_interval_hours INTEGER NOT NULL DEFAULT 4,
        file_scanner_last_run TIMESTAMP NULL,
        provider_updater_enabled BOOLEAN NOT NULL DEFAULT 0,
        provider_updater_interval_hours INTEGER NOT NULL DEFAULT 168,
        provider_updater_last_run TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE
      )
    `);

    // Notification Configuration
    await db.execute(`
      CREATE TABLE notification_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        service TEXT NOT NULL UNIQUE CHECK (service IN ('kodi', 'jellyfin', 'plex', 'discord', 'pushover', 'email')),
        enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
        config TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.execute('CREATE INDEX idx_notification_config_service ON notification_config(service)');
    await db.execute('CREATE INDEX idx_notification_config_enabled ON notification_config(enabled) WHERE enabled = 1');

    // Insert default notification configurations
    await db.execute(`
      INSERT INTO notification_config (service, enabled, config) VALUES
        ('kodi', 0, '{}'),
        ('jellyfin', 0, '{}'),
        ('plex', 0, '{}'),
        ('discord', 0, '{}'),
        ('pushover', 0, '{}'),
        ('email', 0, '{}')
    `);

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
        FOREIGN KEY (job_id) REFERENCES job_queue(id) ON DELETE SET NULL
      )
    `);

    await db.execute('CREATE INDEX idx_webhook_events_source ON webhook_events(source)');
    await db.execute('CREATE INDEX idx_webhook_events_processed ON webhook_events(processed)');
    await db.execute('CREATE INDEX idx_webhook_events_created ON webhook_events(created_at)');

    // Activity Log (for tracking user actions and system events)
    await db.execute(`
      CREATE TABLE activity_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        source TEXT NOT NULL CHECK(source IN ('user', 'webhook', 'automation', 'system')),
        description TEXT NOT NULL,
        metadata TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.execute('CREATE INDEX idx_activity_log_type ON activity_log(event_type)');
    await db.execute('CREATE INDEX idx_activity_log_source ON activity_log(source)');
    await db.execute('CREATE INDEX idx_activity_log_created ON activity_log(created_at DESC)');

    console.log('✅ Activity log table created');

    // ============================================================
    // PROVIDER CACHE TABLES
    // ============================================================

    // Provider Cache - Movies (independent aggregate, no entity_id linking)
    await db.execute(`
      CREATE TABLE provider_cache_movies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,

        -- Provider IDs (indexed for fast lookup)
        tmdb_id INTEGER UNIQUE,
        imdb_id TEXT UNIQUE,
        tvdb_id INTEGER UNIQUE,

        -- Core Metadata
        title TEXT NOT NULL,
        original_title TEXT,
        overview TEXT,
        tagline TEXT,

        -- Release Info
        release_date TEXT,
        year INTEGER,
        runtime INTEGER,
        status TEXT,
        content_rating TEXT,

        -- Ratings
        tmdb_rating REAL,
        tmdb_votes INTEGER,
        imdb_rating REAL,
        imdb_votes INTEGER,
        popularity REAL,

        -- Business
        budget INTEGER,
        revenue INTEGER,
        homepage TEXT,

        -- Flags
        adult BOOLEAN DEFAULT 0,

        -- Cache management
        fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.execute('CREATE UNIQUE INDEX idx_provider_cache_movies_tmdb ON provider_cache_movies(tmdb_id)');
    await db.execute('CREATE UNIQUE INDEX idx_provider_cache_movies_imdb ON provider_cache_movies(imdb_id)');
    await db.execute('CREATE UNIQUE INDEX idx_provider_cache_movies_tvdb ON provider_cache_movies(tvdb_id)');
    await db.execute('CREATE INDEX idx_provider_cache_movies_fetched ON provider_cache_movies(fetched_at)');

    console.log('✅ Provider cache movies table created');

    // Provider Cache - Collections
    await db.execute(`
      CREATE TABLE provider_cache_movie_collections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tmdb_collection_id INTEGER UNIQUE NOT NULL,
        name TEXT NOT NULL,
        overview TEXT,
        fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.execute('CREATE UNIQUE INDEX idx_provider_cache_collections_tmdb ON provider_cache_movie_collections(tmdb_collection_id)');

    await db.execute(`
      CREATE TABLE provider_cache_collection_movies (
        collection_id INTEGER NOT NULL,
        movie_cache_id INTEGER NOT NULL,
        part_number INTEGER,
        PRIMARY KEY (collection_id, movie_cache_id),
        FOREIGN KEY (collection_id) REFERENCES provider_cache_movie_collections(id) ON DELETE CASCADE,
        FOREIGN KEY (movie_cache_id) REFERENCES provider_cache_movies(id) ON DELETE CASCADE
      )
    `);

    await db.execute('CREATE INDEX idx_provider_cache_collection_movies_collection ON provider_cache_collection_movies(collection_id)');
    await db.execute('CREATE INDEX idx_provider_cache_collection_movies_movie ON provider_cache_collection_movies(movie_cache_id)');

    console.log('✅ Provider cache collections tables created');

    // Provider Cache - Images (ALL types, ALL entities)
    await db.execute(`
      CREATE TABLE provider_cache_images (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL CHECK(entity_type IN ('movie', 'collection', 'person', 'series', 'season', 'episode', 'artist', 'album')),
        entity_cache_id INTEGER NOT NULL,
        image_type TEXT NOT NULL CHECK(image_type IN (
          'poster', 'backdrop', 'logo',
          'clearlogo', 'clearart', 'discart', 'banner', 'keyart', 'landscape',
          'clearlogo_hd', 'clearart_hd', 'characterart', 'seasonposter', 'seasonthumb', 'seasonbanner',
          'artistbackground', 'artistthumb', 'musiclogo', 'musicbanner', 'cdart', 'albumcover',
          'profile', 'headshot'
        )),
        provider_name TEXT NOT NULL CHECK(provider_name IN ('tmdb', 'fanart.tv', 'tvdb', 'musicbrainz', 'local')),
        provider_image_id TEXT,
        file_path TEXT NOT NULL,
        width INTEGER,
        height INTEGER,
        aspect_ratio REAL,
        vote_average REAL,
        vote_count INTEGER,
        likes INTEGER,
        iso_639_1 TEXT,
        disc_number INTEGER,
        disc_type TEXT,
        season_number INTEGER,
        is_hd BOOLEAN DEFAULT 0,
        fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.execute('CREATE INDEX idx_provider_cache_images_entity ON provider_cache_images(entity_type, entity_cache_id)');
    await db.execute('CREATE INDEX idx_provider_cache_images_type ON provider_cache_images(entity_type, entity_cache_id, image_type)');
    await db.execute('CREATE INDEX idx_provider_cache_images_provider ON provider_cache_images(provider_name)');

    console.log('✅ Provider cache images table created');

    // Provider Cache - Videos (trailers, teasers, clips)
    await db.execute(`
      CREATE TABLE provider_cache_videos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL CHECK(entity_type IN ('movie', 'series', 'episode', 'person')),
        entity_cache_id INTEGER NOT NULL,
        video_type TEXT NOT NULL CHECK(video_type IN (
          'trailer', 'teaser', 'clip', 'featurette', 'behind_the_scenes', 'bloopers', 'opening_credits'
        )),
        provider_name TEXT NOT NULL CHECK(provider_name IN ('tmdb', 'youtube', 'vimeo')),
        provider_video_id TEXT NOT NULL,
        name TEXT NOT NULL,
        site TEXT NOT NULL,
        key TEXT NOT NULL,
        size INTEGER,
        duration_seconds INTEGER,
        published_at TEXT,
        official BOOLEAN DEFAULT 0,
        iso_639_1 TEXT,
        iso_3166_1 TEXT,
        fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.execute('CREATE INDEX idx_provider_cache_videos_entity ON provider_cache_videos(entity_type, entity_cache_id)');
    await db.execute('CREATE INDEX idx_provider_cache_videos_type ON provider_cache_videos(entity_type, entity_cache_id, video_type)');
    await db.execute('CREATE INDEX idx_provider_cache_videos_provider ON provider_cache_videos(provider_name)');

    console.log('✅ Provider cache videos table created');

    // Provider Cache - People
    await db.execute(`
      CREATE TABLE provider_cache_people (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tmdb_person_id INTEGER UNIQUE,
        imdb_person_id TEXT UNIQUE,
        name TEXT NOT NULL,
        profile_path TEXT,
        popularity REAL,
        gender INTEGER,
        known_for_department TEXT,
        fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.execute('CREATE UNIQUE INDEX idx_provider_cache_people_tmdb ON provider_cache_people(tmdb_person_id)');
    await db.execute('CREATE UNIQUE INDEX idx_provider_cache_people_imdb ON provider_cache_people(imdb_person_id)');

    await db.execute(`
      CREATE TABLE provider_cache_movie_cast (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        movie_cache_id INTEGER NOT NULL,
        person_cache_id INTEGER NOT NULL,
        character_name TEXT,
        cast_order INTEGER,
        FOREIGN KEY (movie_cache_id) REFERENCES provider_cache_movies(id) ON DELETE CASCADE,
        FOREIGN KEY (person_cache_id) REFERENCES provider_cache_people(id) ON DELETE CASCADE
      )
    `);

    await db.execute('CREATE INDEX idx_provider_cache_cast_movie ON provider_cache_movie_cast(movie_cache_id)');
    await db.execute('CREATE INDEX idx_provider_cache_cast_person ON provider_cache_movie_cast(person_cache_id)');

    await db.execute(`
      CREATE TABLE provider_cache_movie_crew (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        movie_cache_id INTEGER NOT NULL,
        person_cache_id INTEGER NOT NULL,
        job TEXT NOT NULL,
        department TEXT,
        FOREIGN KEY (movie_cache_id) REFERENCES provider_cache_movies(id) ON DELETE CASCADE,
        FOREIGN KEY (person_cache_id) REFERENCES provider_cache_people(id) ON DELETE CASCADE
      )
    `);

    await db.execute('CREATE INDEX idx_provider_cache_crew_movie ON provider_cache_movie_crew(movie_cache_id)');
    await db.execute('CREATE INDEX idx_provider_cache_crew_person ON provider_cache_movie_crew(person_cache_id)');

    console.log('✅ Provider cache people/cast/crew tables created');

    // Provider Cache - Genres
    await db.execute(`
      CREATE TABLE provider_cache_genres (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tmdb_genre_id INTEGER UNIQUE,
        tvdb_genre_id INTEGER UNIQUE,
        name TEXT NOT NULL UNIQUE
      )
    `);

    await db.execute(`
      CREATE TABLE provider_cache_movie_genres (
        movie_cache_id INTEGER NOT NULL,
        genre_id INTEGER NOT NULL,
        PRIMARY KEY (movie_cache_id, genre_id),
        FOREIGN KEY (movie_cache_id) REFERENCES provider_cache_movies(id) ON DELETE CASCADE,
        FOREIGN KEY (genre_id) REFERENCES provider_cache_genres(id) ON DELETE CASCADE
      )
    `);

    // Provider Cache - Companies
    await db.execute(`
      CREATE TABLE provider_cache_companies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tmdb_company_id INTEGER UNIQUE,
        name TEXT NOT NULL,
        logo_path TEXT,
        origin_country TEXT
      )
    `);

    await db.execute(`
      CREATE TABLE provider_cache_movie_companies (
        movie_cache_id INTEGER NOT NULL,
        company_id INTEGER NOT NULL,
        PRIMARY KEY (movie_cache_id, company_id),
        FOREIGN KEY (movie_cache_id) REFERENCES provider_cache_movies(id) ON DELETE CASCADE,
        FOREIGN KEY (company_id) REFERENCES provider_cache_companies(id) ON DELETE CASCADE
      )
    `);

    // Provider Cache - Countries
    await db.execute(`
      CREATE TABLE provider_cache_countries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        iso_3166_1 TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL
      )
    `);

    await db.execute(`
      CREATE TABLE provider_cache_movie_countries (
        movie_cache_id INTEGER NOT NULL,
        country_id INTEGER NOT NULL,
        PRIMARY KEY (movie_cache_id, country_id),
        FOREIGN KEY (movie_cache_id) REFERENCES provider_cache_movies(id) ON DELETE CASCADE,
        FOREIGN KEY (country_id) REFERENCES provider_cache_countries(id) ON DELETE CASCADE
      )
    `);

    // Provider Cache - Keywords
    await db.execute(`
      CREATE TABLE provider_cache_keywords (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tmdb_keyword_id INTEGER UNIQUE,
        name TEXT NOT NULL UNIQUE
      )
    `);

    await db.execute(`
      CREATE TABLE provider_cache_movie_keywords (
        movie_cache_id INTEGER NOT NULL,
        keyword_id INTEGER NOT NULL,
        PRIMARY KEY (movie_cache_id, keyword_id),
        FOREIGN KEY (movie_cache_id) REFERENCES provider_cache_movies(id) ON DELETE CASCADE,
        FOREIGN KEY (keyword_id) REFERENCES provider_cache_keywords(id) ON DELETE CASCADE
      )
    `);

    console.log('✅ Provider cache relational tables created (genres, companies, countries, keywords)');

    // Provider Assets (Master Catalog for Enrichment & Selection)
    await db.execute(`
      CREATE TABLE provider_assets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL CHECK(entity_type IN ('movie', 'episode', 'series', 'season', 'actor')),
        entity_id INTEGER NOT NULL,
        asset_type TEXT NOT NULL CHECK(asset_type IN (
          'poster', 'fanart', 'banner', 'clearlogo', 'clearart', 'discart',
          'landscape', 'keyart', 'thumb', 'trailer', 'sample'
        )),

        -- Provider information
        provider_name TEXT NOT NULL,
        provider_url TEXT NOT NULL,
        provider_metadata TEXT,  -- JSON: votes, likes, language, etc.

        -- Analysis results (from enrichment Phase 3 download)
        analyzed BOOLEAN DEFAULT 0,
        width INTEGER,
        height INTEGER,
        duration_seconds INTEGER,
        content_hash TEXT,
        perceptual_hash TEXT,
        difference_hash TEXT,
        mime_type TEXT,
        file_size INTEGER,

        -- Selection state
        score INTEGER,
        is_selected BOOLEAN DEFAULT 0,
        is_rejected BOOLEAN DEFAULT 0,
        is_downloaded BOOLEAN DEFAULT 0,

        -- Timestamps
        fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        analyzed_at TIMESTAMP,
        selected_at TIMESTAMP,
        selected_by TEXT,  -- 'auto' or 'user'

        UNIQUE(entity_type, entity_id, asset_type, provider_url)
      )
    `);

    await db.execute('CREATE INDEX idx_provider_assets_entity ON provider_assets(entity_type, entity_id, asset_type)');
    await db.execute('CREATE INDEX idx_provider_assets_selection ON provider_assets(entity_type, entity_id, asset_type, is_selected, score DESC)');
    await db.execute('CREATE INDEX idx_provider_assets_hash ON provider_assets(content_hash)');
    await db.execute('CREATE INDEX idx_provider_assets_phash ON provider_assets(perceptual_hash)');
    await db.execute('CREATE INDEX idx_provider_assets_unanalyzed ON provider_assets(analyzed) WHERE analyzed = 0');

    console.log('✅ provider_assets table created');

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

    // Webhook Configuration
    await db.execute(`
      CREATE TABLE webhook_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        service TEXT NOT NULL UNIQUE CHECK(service IN ('radarr', 'sonarr', 'lidarr')),
        enabled BOOLEAN NOT NULL DEFAULT 1,
        auth_enabled BOOLEAN NOT NULL DEFAULT 0,
        auth_username TEXT,
        auth_password TEXT,
        auto_publish BOOLEAN NOT NULL DEFAULT 1,
        priority INTEGER DEFAULT 8 CHECK(priority BETWEEN 1 AND 10),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.execute('CREATE INDEX idx_webhook_config_enabled ON webhook_config(enabled)');

    // Insert default webhook configurations
    await db.execute(`
      INSERT INTO webhook_config (service, enabled, auth_enabled, auto_publish, priority) VALUES
        ('radarr', 1, 0, 1, 8),
        ('sonarr', 1, 0, 1, 8),
        ('lidarr', 0, 0, 1, 8)
    `);

    console.log('✅ Webhook configuration table created');

    // Application Settings
    await db.execute(`
      CREATE TABLE app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert default phase configuration settings
    // All phases ALWAYS run - configuration controls BEHAVIOR not ENABLEMENT
    // NOTE: Only settings actually consumed by backend are included here
    await db.execute(`
      INSERT INTO app_settings (key, value) VALUES
        -- Enrichment Phase (only settings actually used by EnrichmentService)
        ('phase.enrichment.fetchProviderAssets', 'true'),
        ('phase.enrichment.autoSelectAssets', 'true'),
        ('phase.enrichment.language', 'en'),

        -- Publishing Phase (all three settings used by PublishingService)
        ('phase.publish.assets', 'true'),
        ('phase.publish.actors', 'true'),
        ('phase.publish.trailers', 'false'),

        -- General Configuration (applies across all phases)
        ('phase.general.autoPublish', 'false'),

        -- Other Settings
        ('recycle_bin.retention_days', '30'),
        ('recycle_bin.unknown_files_auto_recycle', 'false')
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
      { pattern: '@eaDir', type: 'exact', description: 'Synology metadata folder' },
      { pattern: '*.tmp', type: 'glob', description: 'Temporary files' },
      { pattern: '*.!ut', type: 'glob', description: 'uTorrent partial downloads' },
      { pattern: '*.crdownload', type: 'glob', description: 'Chrome partial downloads' },
      { pattern: '*.part', type: 'glob', description: 'Partial downloads' },
      { pattern: '*.sample.*', type: 'glob', description: 'Sample video files' },
      { pattern: '*-sample.*', type: 'glob', description: 'Sample video files' },
      { pattern: '*.proof.*', type: 'glob', description: 'Proof video files' },
      { pattern: '*-proof.*', type: 'glob', description: 'Proof video files' },
      { pattern: 'RARBG*', type: 'glob', description: 'RARBG release info files' },
      { pattern: '*ETRG*', type: 'glob', description: 'ETRG release info files' },
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

    // Unknown Files - Already created in Unified File System section above
    // (No duplicate creation needed)

    console.log('✅ Configuration tables created');

    // ============================================================
    // SCAN JOBS TABLE (for library scanning - Multi-Phase Architecture)
    // ============================================================

    await db.execute(`
      CREATE TABLE scan_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        library_id INTEGER NOT NULL,

        -- Phase tracking
        status TEXT NOT NULL DEFAULT 'discovering' CHECK(status IN ('discovering', 'scanning', 'caching', 'enriching', 'completed', 'failed', 'cancelled')),

        -- Phase 1: Directory Discovery
        directories_total INTEGER DEFAULT 0,
        directories_queued INTEGER DEFAULT 0,

        -- Phase 2: Directory Scanning
        directories_scanned INTEGER DEFAULT 0,
        movies_found INTEGER DEFAULT 0,
        movies_new INTEGER DEFAULT 0,
        movies_updated INTEGER DEFAULT 0,

        -- Phase 3: Asset Caching
        assets_queued INTEGER DEFAULT 0,
        assets_cached INTEGER DEFAULT 0,

        -- Phase 4: Enrichment
        enrichment_queued INTEGER DEFAULT 0,
        enrichment_completed INTEGER DEFAULT 0,

        -- Timing
        started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        discovery_completed_at TIMESTAMP,
        scanning_completed_at TIMESTAMP,
        caching_completed_at TIMESTAMP,
        completed_at TIMESTAMP,

        -- Errors
        errors_count INTEGER DEFAULT 0,
        last_error TEXT,

        -- Current operation (for debugging)
        current_operation TEXT,

        -- Scan options (JSON)
        options TEXT,

        FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE
      )
    `);

    await db.execute('CREATE INDEX idx_scan_jobs_library ON scan_jobs(library_id)');
    await db.execute('CREATE INDEX idx_scan_jobs_status ON scan_jobs(status)');

    // ============================================================
    // CASCADE DELETE TRIGGERS FOR FILE TABLES
    // ============================================================
    // Since file tables use polymorphic associations (entity_type + entity_id),
    // we need triggers to implement CASCADE behavior when parent entities are deleted.
    // This ensures: Library deleted → Movies deleted → File records deleted

    console.log('🔗 Creating CASCADE delete triggers for file tables...');

    // Trigger: Delete LIBRARY files when movie is deleted (CACHE files survive for disaster recovery)
    await db.execute(`
      CREATE TRIGGER delete_movie_library_files
      AFTER DELETE ON movies
      FOR EACH ROW
      BEGIN
        DELETE FROM library_image_files
        WHERE cache_file_id IN (
          SELECT id FROM cache_image_files WHERE entity_type = 'movie' AND entity_id = OLD.id
        );

        DELETE FROM library_video_files
        WHERE cache_file_id IN (
          SELECT id FROM cache_video_files WHERE entity_type = 'movie' AND entity_id = OLD.id
        );

        DELETE FROM library_audio_files
        WHERE cache_file_id IN (
          SELECT id FROM cache_audio_files WHERE entity_type = 'movie' AND entity_id = OLD.id
        );

        DELETE FROM library_text_files
        WHERE cache_file_id IN (
          SELECT id FROM cache_text_files WHERE entity_type = 'movie' AND entity_id = OLD.id
        );

        DELETE FROM unknown_files WHERE entity_type = 'movie' AND entity_id = OLD.id;
      END;
    `);

    // Trigger: Delete LIBRARY files when episode is deleted
    await db.execute(`
      CREATE TRIGGER delete_episode_library_files
      AFTER DELETE ON episodes
      FOR EACH ROW
      BEGIN
        DELETE FROM library_image_files
        WHERE cache_file_id IN (
          SELECT id FROM cache_image_files WHERE entity_type = 'episode' AND entity_id = OLD.id
        );

        DELETE FROM library_video_files
        WHERE cache_file_id IN (
          SELECT id FROM cache_video_files WHERE entity_type = 'episode' AND entity_id = OLD.id
        );

        DELETE FROM library_text_files
        WHERE cache_file_id IN (
          SELECT id FROM cache_text_files WHERE entity_type = 'episode' AND entity_id = OLD.id
        );

        DELETE FROM unknown_files WHERE entity_type = 'episode' AND entity_id = OLD.id;
      END;
    `);

    // Trigger: Delete LIBRARY files when series is deleted
    await db.execute(`
      CREATE TRIGGER delete_series_library_files
      AFTER DELETE ON series
      FOR EACH ROW
      BEGIN
        DELETE FROM library_image_files
        WHERE cache_file_id IN (
          SELECT id FROM cache_image_files WHERE entity_type = 'series' AND entity_id = OLD.id
        );

        DELETE FROM library_audio_files
        WHERE cache_file_id IN (
          SELECT id FROM cache_audio_files WHERE entity_type = 'series' AND entity_id = OLD.id
        );
      END;
    `);

    // Trigger: Delete LIBRARY files when season is deleted
    await db.execute(`
      CREATE TRIGGER delete_season_library_files
      AFTER DELETE ON seasons
      FOR EACH ROW
      BEGIN
        DELETE FROM library_image_files
        WHERE cache_file_id IN (
          SELECT id FROM cache_image_files WHERE entity_type = 'season' AND entity_id = OLD.id
        );
      END;
    `);

    // Trigger: Delete LIBRARY files when actor is deleted
    await db.execute(`
      CREATE TRIGGER delete_actor_library_files
      AFTER DELETE ON actors
      FOR EACH ROW
      BEGIN
        DELETE FROM library_image_files
        WHERE cache_file_id IN (
          SELECT id FROM cache_image_files WHERE entity_type = 'actor' AND entity_id = OLD.id
        );
      END;
    `);

    // Trigger: Delete LIBRARY files when artist is deleted
    await db.execute(`
      CREATE TRIGGER delete_artist_library_files
      AFTER DELETE ON artists
      FOR EACH ROW
      BEGIN
        DELETE FROM library_image_files
        WHERE cache_file_id IN (
          SELECT id FROM cache_image_files WHERE entity_type = 'artist' AND entity_id = OLD.id
        );

        DELETE FROM library_audio_files
        WHERE cache_file_id IN (
          SELECT id FROM cache_audio_files WHERE entity_type = 'artist' AND entity_id = OLD.id
        );
      END;
    `);

    console.log('✅ CASCADE delete triggers created');
    console.log('✅ Clean schema migration completed successfully!');
  }

  static async down(_db: DatabaseConnection): Promise<void> {
    console.log('⚠️  Clean schema rollback not implemented - this is the base schema');
  }
}
