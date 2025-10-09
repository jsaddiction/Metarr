import { DatabaseConnection } from '../../types/database.js';

export class InitialSchemaMigration {
  static version = '20251003_001';
  static migrationName = 'initial_schema';

  static async up(db: DatabaseConnection): Promise<void> {
    // ========================================
    // NORMALIZED ENTITY TABLES
    // ========================================

    // Actors table (shared across movies, series, episodes)
    await db.execute(`
      CREATE TABLE actors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name VARCHAR(255) NOT NULL UNIQUE,
        thumb_url VARCHAR(1000),
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Genres table
    await db.execute(`
      CREATE TABLE genres (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name VARCHAR(100) NOT NULL UNIQUE,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Directors table
    await db.execute(`
      CREATE TABLE directors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name VARCHAR(255) NOT NULL UNIQUE,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Writers table
    await db.execute(`
      CREATE TABLE writers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name VARCHAR(255) NOT NULL UNIQUE,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Studios table
    await db.execute(`
      CREATE TABLE studios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name VARCHAR(255) NOT NULL UNIQUE,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tags table
    await db.execute(`
      CREATE TABLE tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name VARCHAR(100) NOT NULL UNIQUE,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Countries table
    await db.execute(`
      CREATE TABLE countries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name VARCHAR(100) NOT NULL UNIQUE,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Sets/Collections table
    await db.execute(`
      CREATE TABLE sets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name VARCHAR(255) NOT NULL UNIQUE,
        overview TEXT,
        tmdb_collection_id INTEGER,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Ratings table (multi-source: TMDB, IMDB, Rotten Tomatoes, etc.)
    await db.execute(`
      CREATE TABLE ratings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type VARCHAR(50) NOT NULL,
        entity_id INTEGER NOT NULL,
        source VARCHAR(100) NOT NULL,
        value DECIMAL(3,1) NOT NULL,
        votes INTEGER,
        is_default BOOLEAN NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // File details table (from FFmpeg scans)
    await db.execute(`
      CREATE TABLE file_details (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type VARCHAR(50) NOT NULL,
        entity_id INTEGER NOT NULL,
        file_path VARCHAR(1000) NOT NULL,
        file_size BIGINT,
        duration INTEGER,
        video_codec VARCHAR(50),
        video_width INTEGER,
        video_height INTEGER,
        video_framerate DECIMAL(10,3),
        audio_codec VARCHAR(50),
        audio_channels INTEGER,
        audio_language VARCHAR(10),
        subtitle_languages TEXT,
        scanned_at DATETIME,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ========================================
    // CORE MEDIA TABLES
    // ========================================

    // Movies table - includes all fields from all migrations
    await db.execute(`
      CREATE TABLE movies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,

        -- Library relationship (CASCADE delete when library is deleted)
        library_id INTEGER NOT NULL,

        -- File path (ONLY required field)
        file_path VARCHAR(1000) NOT NULL UNIQUE,

        -- Basic metadata from NFO (all nullable)
        title VARCHAR(500),
        original_title VARCHAR(500),
        sort_title VARCHAR(500),
        year INTEGER,

        -- Provider IDs
        tmdb_id INTEGER,
        imdb_id VARCHAR(20),

        -- Plot & description
        plot TEXT,
        outline TEXT,
        tagline VARCHAR(500),

        -- Classification
        mpaa VARCHAR(20),
        premiered DATE,
        user_rating REAL,
        trailer_url VARCHAR(500),

        -- Movie set/collection
        set_id INTEGER,

        -- Hash columns for change detection
        directory_hash VARCHAR(64),
        nfo_hash VARCHAR(64),
        video_hash VARCHAR(64),

        -- Field locking
        title_locked BOOLEAN NOT NULL DEFAULT 0,
        original_title_locked BOOLEAN NOT NULL DEFAULT 0,
        sort_title_locked BOOLEAN NOT NULL DEFAULT 0,
        year_locked BOOLEAN NOT NULL DEFAULT 0,
        plot_locked BOOLEAN NOT NULL DEFAULT 0,
        outline_locked BOOLEAN NOT NULL DEFAULT 0,
        tagline_locked BOOLEAN NOT NULL DEFAULT 0,
        mpaa_locked BOOLEAN NOT NULL DEFAULT 0,
        premiered_locked BOOLEAN NOT NULL DEFAULT 0,
        user_rating_locked BOOLEAN NOT NULL DEFAULT 0,
        trailer_url_locked BOOLEAN NOT NULL DEFAULT 0,

        -- Processing state
        status VARCHAR(50) NOT NULL DEFAULT 'needs_identification',
        nfo_parsed_at DATETIME,

        -- Soft delete
        deleted_on DATETIME,

        -- Timestamps
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE,
        FOREIGN KEY (set_id) REFERENCES sets(id) ON DELETE SET NULL
      )
    `);

    // Series table - includes hash columns
    await db.execute(`
      CREATE TABLE series (
        id INTEGER PRIMARY KEY AUTOINCREMENT,

        -- Library relationship (CASCADE delete when library is deleted)
        library_id INTEGER NOT NULL,

        -- Directory path (ONLY required field)
        directory_path VARCHAR(1000) NOT NULL UNIQUE,

        -- Basic metadata from NFO (all nullable)
        title VARCHAR(500),
        original_title VARCHAR(500),
        sort_title VARCHAR(500),
        year INTEGER,

        -- Provider IDs
        tmdb_id INTEGER,
        tvdb_id INTEGER,
        imdb_id VARCHAR(20),

        -- Plot & description
        plot TEXT,
        tagline VARCHAR(500),

        -- Classification
        mpaa VARCHAR(20),
        premiered DATE,
        status VARCHAR(50),

        -- Hash columns for change detection
        directory_hash VARCHAR(64),
        nfo_hash VARCHAR(64),

        -- Processing state
        scan_status VARCHAR(50) NOT NULL DEFAULT 'needs_identification',
        nfo_parsed_at DATETIME,

        -- Timestamps
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE
      )
    `);

    // Episodes table - includes hash columns
    await db.execute(`
      CREATE TABLE episodes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        series_id INTEGER NOT NULL,

        -- File path (ONLY required field)
        file_path VARCHAR(1000) NOT NULL UNIQUE,

        -- Episode numbering
        season_number INTEGER,
        episode_number INTEGER,
        display_season INTEGER,
        display_episode INTEGER,

        -- Basic metadata from NFO (all nullable)
        title VARCHAR(500),
        plot TEXT,

        -- Dates
        aired DATE,

        -- Hash columns for change detection
        directory_hash VARCHAR(64),
        nfo_hash VARCHAR(64),
        video_hash VARCHAR(64),

        -- Processing state
        nfo_parsed_at DATETIME,

        -- Timestamps
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE
      )
    `);

    // ========================================
    // MUSIC ENTITIES TABLES
    // ========================================

    // Artists table
    await db.execute(`
      CREATE TABLE artists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,

        -- Library relationship
        library_id INTEGER NOT NULL,

        -- File path (root directory for artist)
        path VARCHAR(1000) NOT NULL,

        -- Basic metadata
        name VARCHAR(500) NOT NULL,
        sort_name VARCHAR(500),
        disambiguation VARCHAR(255),

        -- Provider IDs
        musicbrainz_id VARCHAR(36),
        theaudiodb_id INTEGER,

        -- Description
        biography TEXT,
        formed VARCHAR(10),
        disbanded VARCHAR(10),

        -- Classification
        type VARCHAR(50),
        country VARCHAR(100),

        -- Hash columns
        directory_hash VARCHAR(64),

        -- Field locking
        name_locked BOOLEAN NOT NULL DEFAULT 0,
        sort_name_locked BOOLEAN NOT NULL DEFAULT 0,
        biography_locked BOOLEAN NOT NULL DEFAULT 0,

        -- State tracking
        scan_state VARCHAR(50) NOT NULL DEFAULT 'discovered',
        enrichment_state VARCHAR(50) NOT NULL DEFAULT 'pending',
        has_unpublished_changes BOOLEAN NOT NULL DEFAULT 0,

        -- Timestamps
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        scanned_at DATETIME,
        enriched_at DATETIME,
        published_at DATETIME,

        FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE
      )
    `);

    await db.execute(`CREATE INDEX idx_artists_library ON artists(library_id)`);
    await db.execute(`CREATE INDEX idx_artists_musicbrainz ON artists(musicbrainz_id)`);
    await db.execute(`CREATE INDEX idx_artists_scan_state ON artists(scan_state)`);
    await db.execute(`CREATE INDEX idx_artists_enrichment_state ON artists(enrichment_state)`);

    // Albums table
    await db.execute(`
      CREATE TABLE albums (
        id INTEGER PRIMARY KEY AUTOINCREMENT,

        -- Library and artist relationship
        library_id INTEGER NOT NULL,
        artist_id INTEGER NOT NULL,

        -- File path (root directory for album)
        path VARCHAR(1000) NOT NULL,

        -- Basic metadata
        title VARCHAR(500) NOT NULL,
        sort_title VARCHAR(500),
        disambiguation VARCHAR(255),

        -- Provider IDs
        musicbrainz_id VARCHAR(36),
        theaudiodb_id INTEGER,

        -- Release info
        release_date DATE,
        year INTEGER,
        label VARCHAR(255),
        type VARCHAR(50),

        -- Description
        description TEXT,
        review TEXT,

        -- Album art
        thumb_url VARCHAR(1000),

        -- Hash columns
        directory_hash VARCHAR(64),

        -- Field locking
        title_locked BOOLEAN NOT NULL DEFAULT 0,
        sort_title_locked BOOLEAN NOT NULL DEFAULT 0,
        description_locked BOOLEAN NOT NULL DEFAULT 0,

        -- State tracking
        scan_state VARCHAR(50) NOT NULL DEFAULT 'discovered',
        enrichment_state VARCHAR(50) NOT NULL DEFAULT 'pending',
        has_unpublished_changes BOOLEAN NOT NULL DEFAULT 0,

        -- Timestamps
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        scanned_at DATETIME,
        enriched_at DATETIME,
        published_at DATETIME,

        FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE,
        FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
      )
    `);

    await db.execute(`CREATE INDEX idx_albums_library ON albums(library_id)`);
    await db.execute(`CREATE INDEX idx_albums_artist ON albums(artist_id)`);
    await db.execute(`CREATE INDEX idx_albums_musicbrainz ON albums(musicbrainz_id)`);
    await db.execute(`CREATE INDEX idx_albums_scan_state ON albums(scan_state)`);
    await db.execute(`CREATE INDEX idx_albums_enrichment_state ON albums(enrichment_state)`);

    // Tracks table
    await db.execute(`
      CREATE TABLE tracks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,

        -- Library, album, and artist relationship
        library_id INTEGER NOT NULL,
        album_id INTEGER NOT NULL,
        artist_id INTEGER NOT NULL,

        -- File path
        file_path VARCHAR(1000) NOT NULL UNIQUE,

        -- Basic metadata
        title VARCHAR(500) NOT NULL,
        track_number INTEGER,
        disc_number INTEGER,

        -- Provider IDs
        musicbrainz_id VARCHAR(36),

        -- Audio info
        duration INTEGER,
        comment TEXT,

        -- Hash columns
        file_hash VARCHAR(64),
        audio_hash VARCHAR(64),

        -- Field locking
        title_locked BOOLEAN NOT NULL DEFAULT 0,

        -- State tracking
        scan_state VARCHAR(50) NOT NULL DEFAULT 'discovered',
        enrichment_state VARCHAR(50) NOT NULL DEFAULT 'pending',
        has_unpublished_changes BOOLEAN NOT NULL DEFAULT 0,

        -- Timestamps
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        scanned_at DATETIME,
        enriched_at DATETIME,
        published_at DATETIME,

        FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE,
        FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
        FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
      )
    `);

    await db.execute(`CREATE INDEX idx_tracks_library ON tracks(library_id)`);
    await db.execute(`CREATE INDEX idx_tracks_album ON tracks(album_id)`);
    await db.execute(`CREATE INDEX idx_tracks_artist ON tracks(artist_id)`);
    await db.execute(`CREATE INDEX idx_tracks_musicbrainz ON tracks(musicbrainz_id)`);
    await db.execute(`CREATE INDEX idx_tracks_scan_state ON tracks(scan_state)`);
    await db.execute(`CREATE INDEX idx_tracks_enrichment_state ON tracks(enrichment_state)`);

    // ========================================
    // MEDIA STREAMS TABLES
    // ========================================

    // Video streams table
    await db.execute(`
      CREATE TABLE video_streams (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type VARCHAR(50) NOT NULL,
        entity_id INTEGER NOT NULL,

        -- Stream identification
        stream_index INTEGER NOT NULL,
        codec_name VARCHAR(50),
        codec_long_name VARCHAR(255),
        profile VARCHAR(100),

        -- Video properties
        width INTEGER,
        height INTEGER,
        aspect_ratio VARCHAR(20),

        -- Frame and bit rate
        fps DECIMAL(10,3),
        bit_rate BIGINT,

        -- Color and HDR
        pix_fmt VARCHAR(50),
        color_range VARCHAR(50),
        color_space VARCHAR(50),
        color_transfer VARCHAR(50),
        color_primaries VARCHAR(50),

        -- Language and metadata
        language VARCHAR(10),
        title VARCHAR(255),
        is_default BOOLEAN NOT NULL DEFAULT 0,
        is_forced BOOLEAN NOT NULL DEFAULT 0,

        -- Timestamps
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Audio streams table
    await db.execute(`
      CREATE TABLE audio_streams (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type VARCHAR(50) NOT NULL,
        entity_id INTEGER NOT NULL,

        -- Stream identification
        stream_index INTEGER NOT NULL,
        codec_name VARCHAR(50),
        codec_long_name VARCHAR(255),
        profile VARCHAR(100),

        -- Audio properties
        channels INTEGER,
        channel_layout VARCHAR(50),
        sample_rate INTEGER,
        bit_rate BIGINT,

        -- Language and metadata
        language VARCHAR(10),
        title VARCHAR(255),
        is_default BOOLEAN NOT NULL DEFAULT 0,
        is_forced BOOLEAN NOT NULL DEFAULT 0,

        -- Timestamps
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Subtitle streams table
    await db.execute(`
      CREATE TABLE subtitle_streams (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type VARCHAR(50) NOT NULL,
        entity_id INTEGER NOT NULL,

        -- Stream identification
        stream_index INTEGER,
        codec_name VARCHAR(50),

        -- Subtitle type
        source_type VARCHAR(50) NOT NULL,
        file_path VARCHAR(1000),

        -- Language and metadata
        language VARCHAR(10),
        title VARCHAR(255),
        is_default BOOLEAN NOT NULL DEFAULT 0,
        is_forced BOOLEAN NOT NULL DEFAULT 0,
        is_sdh BOOLEAN NOT NULL DEFAULT 0,

        -- Timestamps
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ========================================
    // IMAGES TABLE - Consolidated with all required fields
    // ========================================

    await db.execute(`
      CREATE TABLE images (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type VARCHAR(50) NOT NULL,
        entity_id INTEGER NOT NULL,

        -- Image type
        type VARCHAR(50) NOT NULL,
        image_type VARCHAR(50),

        -- Three-tier storage paths
        provider_url VARCHAR(1000),
        url VARCHAR(1000),
        cache_path VARCHAR(1000),
        library_path VARCHAR(1000),
        file_path VARCHAR(1000),

        -- Image properties
        width INTEGER,
        height INTEGER,
        file_size BIGINT,
        file_hash VARCHAR(64),
        perceptual_hash VARCHAR(64),

        -- Metadata
        language VARCHAR(10),
        vote_average DECIMAL(3,1),
        is_default BOOLEAN NOT NULL DEFAULT 0,
        locked BOOLEAN NOT NULL DEFAULT 0,

        -- Soft delete
        deleted_on DATETIME,

        -- Timestamps
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ========================================
    // TRAILERS TABLE
    // ========================================

    await db.execute(`
      CREATE TABLE trailers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type VARCHAR(50) NOT NULL,
        entity_id INTEGER NOT NULL,

        -- Trailer source
        source_type VARCHAR(50) NOT NULL,
        provider_url VARCHAR(1000),

        -- Two-copy architecture: cache (source of truth) + library (for media players)
        cache_path VARCHAR(1000),
        local_path VARCHAR(1000),

        -- Trailer properties
        title VARCHAR(255),
        resolution VARCHAR(50),
        file_size BIGINT,
        duration INTEGER,
        file_hash VARCHAR(64),

        -- Language and metadata
        language VARCHAR(10),
        is_default BOOLEAN NOT NULL DEFAULT 0,
        locked BOOLEAN NOT NULL DEFAULT 0,

        -- Soft delete
        deleted_on DATETIME,

        -- Timestamps
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ========================================
    // SUBTITLES TABLE (External subtitle files)
    // ========================================

    await db.execute(`
      CREATE TABLE subtitles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type VARCHAR(50) NOT NULL,
        entity_id INTEGER NOT NULL,

        -- Subtitle source
        source_type VARCHAR(50) NOT NULL,
        provider_url VARCHAR(1000),

        -- Two-copy architecture: cache (source of truth) + library (for media players)
        cache_path VARCHAR(1000),
        file_path VARCHAR(1000),

        -- Subtitle properties
        language VARCHAR(10),
        format VARCHAR(50),
        file_size BIGINT,
        file_hash VARCHAR(64),

        -- Metadata
        is_default BOOLEAN NOT NULL DEFAULT 0,
        forced BOOLEAN NOT NULL DEFAULT 0,
        locked BOOLEAN NOT NULL DEFAULT 0,

        -- Soft delete
        deleted_on DATETIME,

        -- Timestamps
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ========================================
    // UNKNOWN FILES TABLE
    // ========================================

    await db.execute(`
      CREATE TABLE unknown_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type VARCHAR(50) NOT NULL,
        entity_id INTEGER NOT NULL,

        -- File information
        file_path VARCHAR(1000) NOT NULL,
        file_name VARCHAR(500) NOT NULL,
        file_size BIGINT,
        file_hash VARCHAR(64),
        extension VARCHAR(50),

        -- Classification
        category VARCHAR(50),

        -- Timestamps
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ========================================
    // IGNORE PATTERNS TABLE
    // ========================================

    await db.execute(`
      CREATE TABLE ignore_patterns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pattern VARCHAR(255) NOT NULL,
        pattern_type VARCHAR(20) NOT NULL DEFAULT 'glob',
        enabled BOOLEAN NOT NULL DEFAULT 1,
        is_system BOOLEAN NOT NULL DEFAULT 0,
        description VARCHAR(255),
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ========================================
    // MANY-TO-MANY LINK TABLES
    // ========================================

    // Movies relationships
    // Note: Movies CASCADE delete their relationships, but entities use RESTRICT
    // This prevents accidental entity deletion while allowing proper cleanup
    await db.execute(`
      CREATE TABLE movies_actors (
        movie_id INTEGER NOT NULL,
        actor_id INTEGER NOT NULL,
        role VARCHAR(255),
        \`order\` INTEGER,
        PRIMARY KEY (movie_id, actor_id, role),
        FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
        FOREIGN KEY (actor_id) REFERENCES actors(id) ON DELETE RESTRICT
      )
    `);

    await db.execute(`
      CREATE TABLE movies_genres (
        movie_id INTEGER NOT NULL,
        genre_id INTEGER NOT NULL,
        PRIMARY KEY (movie_id, genre_id),
        FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
        FOREIGN KEY (genre_id) REFERENCES genres(id) ON DELETE RESTRICT
      )
    `);

    await db.execute(`
      CREATE TABLE movies_directors (
        movie_id INTEGER NOT NULL,
        director_id INTEGER NOT NULL,
        PRIMARY KEY (movie_id, director_id),
        FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
        FOREIGN KEY (director_id) REFERENCES directors(id) ON DELETE RESTRICT
      )
    `);

    await db.execute(`
      CREATE TABLE movies_writers (
        movie_id INTEGER NOT NULL,
        writer_id INTEGER NOT NULL,
        PRIMARY KEY (movie_id, writer_id),
        FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
        FOREIGN KEY (writer_id) REFERENCES writers(id) ON DELETE RESTRICT
      )
    `);

    await db.execute(`
      CREATE TABLE movies_studios (
        movie_id INTEGER NOT NULL,
        studio_id INTEGER NOT NULL,
        PRIMARY KEY (movie_id, studio_id),
        FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
        FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE RESTRICT
      )
    `);

    await db.execute(`
      CREATE TABLE movies_countries (
        movie_id INTEGER NOT NULL,
        country_id INTEGER NOT NULL,
        PRIMARY KEY (movie_id, country_id),
        FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
        FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE RESTRICT
      )
    `);

    await db.execute(`
      CREATE TABLE movies_tags (
        movie_id INTEGER NOT NULL,
        tag_id INTEGER NOT NULL,
        PRIMARY KEY (movie_id, tag_id),
        FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE RESTRICT
      )
    `);

    // Series relationships
    await db.execute(`
      CREATE TABLE series_actors (
        series_id INTEGER NOT NULL,
        actor_id INTEGER NOT NULL,
        role VARCHAR(255),
        \`order\` INTEGER,
        PRIMARY KEY (series_id, actor_id, role),
        FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE,
        FOREIGN KEY (actor_id) REFERENCES actors(id) ON DELETE RESTRICT
      )
    `);

    await db.execute(`
      CREATE TABLE series_genres (
        series_id INTEGER NOT NULL,
        genre_id INTEGER NOT NULL,
        PRIMARY KEY (series_id, genre_id),
        FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE,
        FOREIGN KEY (genre_id) REFERENCES genres(id) ON DELETE RESTRICT
      )
    `);

    await db.execute(`
      CREATE TABLE series_directors (
        series_id INTEGER NOT NULL,
        director_id INTEGER NOT NULL,
        PRIMARY KEY (series_id, director_id),
        FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE,
        FOREIGN KEY (director_id) REFERENCES directors(id) ON DELETE RESTRICT
      )
    `);

    await db.execute(`
      CREATE TABLE series_writers (
        series_id INTEGER NOT NULL,
        writer_id INTEGER NOT NULL,
        PRIMARY KEY (series_id, writer_id),
        FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE,
        FOREIGN KEY (writer_id) REFERENCES writers(id) ON DELETE RESTRICT
      )
    `);

    await db.execute(`
      CREATE TABLE series_studios (
        series_id INTEGER NOT NULL,
        studio_id INTEGER NOT NULL,
        PRIMARY KEY (series_id, studio_id),
        FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE,
        FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE RESTRICT
      )
    `);

    await db.execute(`
      CREATE TABLE series_tags (
        series_id INTEGER NOT NULL,
        tag_id INTEGER NOT NULL,
        PRIMARY KEY (series_id, tag_id),
        FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE RESTRICT
      )
    `);

    // Episode relationships
    await db.execute(`
      CREATE TABLE episodes_actors (
        episode_id INTEGER NOT NULL,
        actor_id INTEGER NOT NULL,
        role VARCHAR(255),
        \`order\` INTEGER,
        PRIMARY KEY (episode_id, actor_id, role),
        FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE,
        FOREIGN KEY (actor_id) REFERENCES actors(id) ON DELETE RESTRICT
      )
    `);

    await db.execute(`
      CREATE TABLE episodes_directors (
        episode_id INTEGER NOT NULL,
        director_id INTEGER NOT NULL,
        PRIMARY KEY (episode_id, director_id),
        FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE,
        FOREIGN KEY (director_id) REFERENCES directors(id) ON DELETE RESTRICT
      )
    `);

    await db.execute(`
      CREATE TABLE episodes_writers (
        episode_id INTEGER NOT NULL,
        writer_id INTEGER NOT NULL,
        PRIMARY KEY (episode_id, writer_id),
        FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE,
        FOREIGN KEY (writer_id) REFERENCES writers(id) ON DELETE RESTRICT
      )
    `);

    // ========================================
    // SYSTEM TABLES
    // ========================================

    // Libraries
    await db.execute(`
      CREATE TABLE libraries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL,
        path VARCHAR(1000) NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT 1,
        scan_on_startup BOOLEAN NOT NULL DEFAULT 0,
        auto_scan_interval INTEGER,
        last_scanned_at DATETIME,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Scan jobs
    await db.execute(`
      CREATE TABLE scan_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        library_id INTEGER NOT NULL,
        status VARCHAR(50) NOT NULL,
        progress_current INTEGER NOT NULL DEFAULT 0,
        progress_total INTEGER NOT NULL DEFAULT 0,
        current_file VARCHAR(1000),
        errors_count INTEGER NOT NULL DEFAULT 0,
        started_at DATETIME NOT NULL,
        completed_at DATETIME,
        error_message TEXT,
        FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE
      )
    `);

    // Media players
    await db.execute(`
      CREATE TABLE media_players (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL,
        host VARCHAR(255) NOT NULL,
        port INTEGER NOT NULL,
        username VARCHAR(255),
        password VARCHAR(255),
        api_key TEXT,
        enabled BOOLEAN NOT NULL DEFAULT 1,
        group_id INTEGER,
        config TEXT DEFAULT '{}',
        last_sync DATETIME,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Media player groups
    await db.execute(`
      CREATE TABLE media_player_groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Metadata providers
    await db.execute(`
      CREATE TABLE providers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name VARCHAR(255) NOT NULL UNIQUE,
        type VARCHAR(50) NOT NULL,
        api_key TEXT,
        base_url VARCHAR(500) NOT NULL,
        rate_limit INTEGER NOT NULL DEFAULT 60,
        rate_limit_window INTEGER NOT NULL DEFAULT 60,
        enabled BOOLEAN NOT NULL DEFAULT 1,
        priority INTEGER NOT NULL DEFAULT 100,
        config TEXT DEFAULT '{}',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Jobs queue
    await db.execute(`
      CREATE TABLE jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type VARCHAR(100) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        priority INTEGER NOT NULL DEFAULT 100,
        payload TEXT NOT NULL DEFAULT '{}',
        result TEXT,
        error TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 3,
        next_attempt DATETIME,
        processing_started DATETIME,
        processing_completed DATETIME,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Assets (images, subtitles, etc.)
    await db.execute(`
      CREATE TABLE assets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type VARCHAR(50) NOT NULL,
        entity_id INTEGER NOT NULL,
        type VARCHAR(50) NOT NULL,
        url VARCHAR(1000),
        local_path VARCHAR(1000),
        file_size BIGINT,
        width INTEGER,
        height INTEGER,
        language VARCHAR(10),
        is_default BOOLEAN NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ========================================
    // INDEXES
    // ========================================

    // Entity indexes
    await db.execute('CREATE INDEX idx_actors_name ON actors(name)');
    await db.execute('CREATE INDEX idx_genres_name ON genres(name)');
    await db.execute('CREATE INDEX idx_directors_name ON directors(name)');
    await db.execute('CREATE INDEX idx_writers_name ON writers(name)');
    await db.execute('CREATE INDEX idx_studios_name ON studios(name)');
    await db.execute('CREATE INDEX idx_tags_name ON tags(name)');
    await db.execute('CREATE INDEX idx_countries_name ON countries(name)');
    await db.execute('CREATE INDEX idx_sets_name ON sets(name)');
    await db.execute('CREATE INDEX idx_sets_tmdb_collection_id ON sets(tmdb_collection_id)');

    // Ratings indexes
    await db.execute('CREATE INDEX idx_ratings_entity ON ratings(entity_type, entity_id)');
    await db.execute('CREATE INDEX idx_ratings_source ON ratings(source)');

    // File details indexes
    await db.execute(
      'CREATE INDEX idx_file_details_entity ON file_details(entity_type, entity_id)'
    );

    // Movies indexes
    await db.execute('CREATE INDEX idx_movies_library_id ON movies(library_id)');
    await db.execute('CREATE INDEX idx_movies_tmdb_id ON movies(tmdb_id)');
    await db.execute('CREATE INDEX idx_movies_imdb_id ON movies(imdb_id)');
    await db.execute('CREATE INDEX idx_movies_status ON movies(status)');
    await db.execute('CREATE INDEX idx_movies_set_id ON movies(set_id)');
    await db.execute('CREATE INDEX idx_movies_directory_hash ON movies(directory_hash)');
    await db.execute('CREATE INDEX idx_movies_nfo_hash ON movies(nfo_hash)');
    await db.execute('CREATE INDEX idx_movies_video_hash ON movies(video_hash)');
    await db.execute('CREATE INDEX idx_movies_deleted_on ON movies(deleted_on)');

    // Series indexes
    await db.execute('CREATE INDEX idx_series_library_id ON series(library_id)');
    await db.execute('CREATE INDEX idx_series_tmdb_id ON series(tmdb_id)');
    await db.execute('CREATE INDEX idx_series_tvdb_id ON series(tvdb_id)');
    await db.execute('CREATE INDEX idx_series_imdb_id ON series(imdb_id)');
    await db.execute('CREATE INDEX idx_series_scan_status ON series(scan_status)');
    await db.execute('CREATE INDEX idx_series_directory_hash ON series(directory_hash)');
    await db.execute('CREATE INDEX idx_series_nfo_hash ON series(nfo_hash)');

    // Episodes indexes
    await db.execute('CREATE INDEX idx_episodes_series_id ON episodes(series_id)');
    await db.execute(
      'CREATE INDEX idx_episodes_season_episode ON episodes(season_number, episode_number)'
    );
    await db.execute('CREATE INDEX idx_episodes_directory_hash ON episodes(directory_hash)');
    await db.execute('CREATE INDEX idx_episodes_nfo_hash ON episodes(nfo_hash)');
    await db.execute('CREATE INDEX idx_episodes_video_hash ON episodes(video_hash)');

    // Stream indexes
    await db.execute(
      'CREATE INDEX idx_video_streams_entity ON video_streams(entity_type, entity_id)'
    );
    await db.execute('CREATE INDEX idx_video_streams_codec ON video_streams(codec_name)');
    await db.execute(
      'CREATE INDEX idx_video_streams_resolution ON video_streams(width, height)'
    );

    await db.execute(
      'CREATE INDEX idx_audio_streams_entity ON audio_streams(entity_type, entity_id)'
    );
    await db.execute('CREATE INDEX idx_audio_streams_language ON audio_streams(language)');
    await db.execute('CREATE INDEX idx_audio_streams_codec ON audio_streams(codec_name)');

    await db.execute(
      'CREATE INDEX idx_subtitle_streams_entity ON subtitle_streams(entity_type, entity_id)'
    );
    await db.execute('CREATE INDEX idx_subtitle_streams_language ON subtitle_streams(language)');
    await db.execute(
      'CREATE INDEX idx_subtitle_streams_source_type ON subtitle_streams(source_type)'
    );

    // Images indexes
    await db.execute('CREATE INDEX idx_images_entity ON images(entity_type, entity_id)');
    await db.execute('CREATE INDEX idx_images_type ON images(type)');
    await db.execute('CREATE INDEX idx_images_image_type ON images(image_type)');
    await db.execute('CREATE INDEX idx_images_hash ON images(file_hash)');
    await db.execute('CREATE INDEX idx_images_perceptual_hash ON images(perceptual_hash)');
    await db.execute('CREATE INDEX idx_images_library_path ON images(library_path)');
    await db.execute('CREATE INDEX idx_images_locked ON images(locked)');
    await db.execute('CREATE INDEX idx_images_deleted_on ON images(deleted_on)');

    // Trailers indexes
    await db.execute('CREATE INDEX idx_trailers_entity ON trailers(entity_type, entity_id)');
    await db.execute('CREATE INDEX idx_trailers_source_type ON trailers(source_type)');
    await db.execute('CREATE INDEX idx_trailers_hash ON trailers(file_hash)');
    await db.execute('CREATE INDEX idx_trailers_cache_path ON trailers(cache_path)');
    await db.execute('CREATE INDEX idx_trailers_local_path ON trailers(local_path)');
    await db.execute('CREATE INDEX idx_trailers_locked ON trailers(locked)');
    await db.execute('CREATE INDEX idx_trailers_deleted_on ON trailers(deleted_on)');

    // Subtitles indexes
    await db.execute('CREATE INDEX idx_subtitles_entity ON subtitles(entity_type, entity_id)');
    await db.execute('CREATE INDEX idx_subtitles_source_type ON subtitles(source_type)');
    await db.execute('CREATE INDEX idx_subtitles_language ON subtitles(language)');
    await db.execute('CREATE INDEX idx_subtitles_hash ON subtitles(file_hash)');
    await db.execute('CREATE INDEX idx_subtitles_cache_path ON subtitles(cache_path)');
    await db.execute('CREATE INDEX idx_subtitles_file_path ON subtitles(file_path)');
    await db.execute('CREATE INDEX idx_subtitles_locked ON subtitles(locked)');
    await db.execute('CREATE INDEX idx_subtitles_deleted_on ON subtitles(deleted_on)');

    // Unknown files indexes
    await db.execute(
      'CREATE INDEX idx_unknown_files_entity ON unknown_files(entity_type, entity_id)'
    );
    await db.execute('CREATE INDEX idx_unknown_files_hash ON unknown_files(file_hash)');
    await db.execute('CREATE INDEX idx_unknown_files_category ON unknown_files(category)');

    // Ignore patterns indexes
    await db.execute('CREATE INDEX idx_ignore_patterns_enabled ON ignore_patterns(enabled)');
    await db.execute('CREATE INDEX idx_ignore_patterns_system ON ignore_patterns(is_system)');

    // Link table indexes
    await db.execute('CREATE INDEX idx_movies_actors_actor_id ON movies_actors(actor_id)');
    await db.execute('CREATE INDEX idx_movies_genres_genre_id ON movies_genres(genre_id)');
    await db.execute(
      'CREATE INDEX idx_movies_directors_director_id ON movies_directors(director_id)'
    );
    await db.execute('CREATE INDEX idx_movies_writers_writer_id ON movies_writers(writer_id)');
    await db.execute('CREATE INDEX idx_movies_studios_studio_id ON movies_studios(studio_id)');
    await db.execute(
      'CREATE INDEX idx_movies_countries_country_id ON movies_countries(country_id)'
    );
    await db.execute('CREATE INDEX idx_movies_tags_tag_id ON movies_tags(tag_id)');

    await db.execute('CREATE INDEX idx_series_actors_actor_id ON series_actors(actor_id)');
    await db.execute('CREATE INDEX idx_series_genres_genre_id ON series_genres(genre_id)');
    await db.execute(
      'CREATE INDEX idx_series_directors_director_id ON series_directors(director_id)'
    );
    await db.execute('CREATE INDEX idx_series_writers_writer_id ON series_writers(writer_id)');
    await db.execute('CREATE INDEX idx_series_studios_studio_id ON series_studios(studio_id)');
    await db.execute('CREATE INDEX idx_series_tags_tag_id ON series_tags(tag_id)');

    await db.execute('CREATE INDEX idx_episodes_actors_actor_id ON episodes_actors(actor_id)');
    await db.execute(
      'CREATE INDEX idx_episodes_directors_director_id ON episodes_directors(director_id)'
    );
    await db.execute('CREATE INDEX idx_episodes_writers_writer_id ON episodes_writers(writer_id)');

    // System table indexes
    await db.execute('CREATE INDEX idx_libraries_type ON libraries(type)');
    await db.execute('CREATE INDEX idx_libraries_enabled ON libraries(enabled)');
    await db.execute('CREATE INDEX idx_scan_jobs_library_id ON scan_jobs(library_id)');
    await db.execute('CREATE INDEX idx_scan_jobs_status ON scan_jobs(status)');
    await db.execute('CREATE INDEX idx_media_players_type ON media_players(type)');
    await db.execute('CREATE INDEX idx_media_players_enabled ON media_players(enabled)');
    await db.execute('CREATE INDEX idx_media_players_group_id ON media_players(group_id)');
    await db.execute('CREATE INDEX idx_jobs_status ON jobs(status)');
    await db.execute('CREATE INDEX idx_jobs_type ON jobs(type)');
    await db.execute('CREATE INDEX idx_jobs_priority ON jobs(priority)');
    await db.execute('CREATE INDEX idx_assets_entity ON assets(entity_type, entity_id)');

    // ========================================
    // SEED DEFAULT IGNORE PATTERNS
    // ========================================

    // System patterns (cannot be deleted)
    const systemPatterns = [
      { pattern: '.DS_Store', type: 'exact', description: 'macOS system file' },
      { pattern: 'Thumbs.db', type: 'exact', description: 'Windows thumbnail cache' },
      { pattern: 'desktop.ini', type: 'exact', description: 'Windows folder settings' },
      { pattern: '.nomedia', type: 'exact', description: 'Android no-media marker' },
      { pattern: '@eaDir', type: 'exact', description: 'Synology system folder' },
      { pattern: '*.tmp', type: 'glob', description: 'Temporary files' },
      { pattern: '*.bak', type: 'glob', description: 'Backup files' },
      { pattern: '*.log', type: 'glob', description: 'Log files' },
    ];

    for (const pattern of systemPatterns) {
      await db.execute(
        `INSERT INTO ignore_patterns (pattern, pattern_type, enabled, is_system, description)
         VALUES (?, ?, 1, 1, ?)`,
        [pattern.pattern, pattern.type, pattern.description]
      );
    }

    // Common user patterns (can be toggled or deleted)
    const commonPatterns = [
      { pattern: '*.sample.*', description: 'Sample video files' },
      { pattern: '*-proof.*', description: 'Proof files' },
      { pattern: 'RARBG*', description: 'RARBG text files' },
      { pattern: 'RARBG_DO_NOT_MIRROR.exe', description: 'RARBG executable' },
      { pattern: '*ETRG*', description: 'ETRG release files' },
      { pattern: '*.nfo.bak', description: 'NFO backup files' },
    ];

    for (const pattern of commonPatterns) {
      await db.execute(
        `INSERT INTO ignore_patterns (pattern, pattern_type, enabled, is_system, description)
         VALUES (?, 'glob', 1, 0, ?)`,
        [pattern.pattern, pattern.description]
      );
    }

    // ========================================
    // PHASE 1: REVISED ARCHITECTURE TABLES
    // ========================================
    // Integrated from docs/DATABASE_SCHEMA.md
    // Part of comprehensive architecture redesign

    // Asset Candidates (Tier 1: Provider URLs + Cache)
    await db.execute(`
      CREATE TABLE asset_candidates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL,      -- 'movie', 'series', 'episode', 'actor'
        entity_id INTEGER NOT NULL,
        asset_type TEXT NOT NULL,       -- 'poster', 'fanart', 'banner', 'trailer', etc.

        -- Provider information
        provider TEXT NOT NULL,         -- 'tmdb', 'tvdb', 'fanart.tv', 'local'
        provider_url TEXT,              -- NULL if local file
        provider_metadata TEXT,         -- JSON: { language, vote_avg, vote_count }

        -- Asset properties (from provider API, before download)
        width INTEGER,                  -- For images
        height INTEGER,                 -- For images
        duration_seconds INTEGER,       -- For trailers
        file_size INTEGER,

        -- Download state
        is_downloaded BOOLEAN DEFAULT 0,
        cache_path TEXT,                -- NULL until downloaded
        content_hash TEXT,              -- SHA256 of file content
        perceptual_hash TEXT,           -- pHash for duplicate detection (images only)

        -- Selection state
        is_selected BOOLEAN DEFAULT 0,
        is_rejected BOOLEAN DEFAULT 0,  -- User or algorithm rejected
        selected_by TEXT,               -- 'auto', 'manual', 'local'
        selected_at TIMESTAMP,

        -- Scoring (for auto-selection algorithm)
        auto_score REAL,                -- 0-100

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.execute(`CREATE INDEX idx_candidates_entity ON asset_candidates(entity_type, entity_id, asset_type)`);
    await db.execute(`CREATE INDEX idx_candidates_selected ON asset_candidates(entity_type, entity_id, is_selected)`);
    await db.execute(`CREATE INDEX idx_candidates_downloaded ON asset_candidates(is_downloaded)`);
    await db.execute(`CREATE INDEX idx_candidates_content_hash ON asset_candidates(content_hash)`);
    await db.execute(`CREATE INDEX idx_candidates_provider_url ON asset_candidates(provider, provider_url)`);
    await db.execute(`CREATE INDEX idx_candidates_needs_download ON asset_candidates(is_selected, is_downloaded) WHERE is_selected = 1 AND is_downloaded = 0`);

    // Cache Inventory (Tier 2: Content-addressed storage)
    await db.execute(`
      CREATE TABLE cache_inventory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content_hash TEXT UNIQUE NOT NULL,
        file_path TEXT NOT NULL,
        file_size BIGINT NOT NULL,
        asset_type TEXT NOT NULL,       -- 'image', 'trailer', 'subtitle'
        mime_type TEXT,

        -- Reference counting
        reference_count INTEGER DEFAULT 0,

        -- Lifecycle
        first_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_used_at TIMESTAMP,
        orphaned_at TIMESTAMP,          -- Set when ref_count = 0

        -- Image metadata
        width INTEGER,
        height INTEGER,
        perceptual_hash TEXT,

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.execute(`CREATE INDEX idx_cache_content_hash ON cache_inventory(content_hash)`);
    await db.execute(`CREATE INDEX idx_cache_orphaned ON cache_inventory(orphaned_at)`);
    await db.execute(`CREATE INDEX idx_cache_perceptual_hash ON cache_inventory(perceptual_hash)`);
    await db.execute(`CREATE INDEX idx_cache_gc ON cache_inventory(orphaned_at) WHERE orphaned_at IS NOT NULL`);

    // Backup Assets (Local Provider - preserves original local assets before enrichment)
    await db.execute(`
      CREATE TABLE backup_assets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,

        -- Entity reference (one of these must be set)
        movie_id INTEGER,
        series_id INTEGER,
        season_id INTEGER,
        episode_id INTEGER,

        -- Asset type (poster, fanart, banner, etc.)
        type TEXT NOT NULL,

        -- Original location
        original_path TEXT NOT NULL,
        original_filename TEXT NOT NULL,
        original_hash TEXT,                -- SHA256 content hash

        -- Backup location
        backup_path TEXT NOT NULL,
        backed_up_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

        -- File properties
        file_size INTEGER,
        width INTEGER,
        height INTEGER,
        phash TEXT,                        -- Perceptual hash for deduplication

        -- Restoration tracking
        restored BOOLEAN DEFAULT 0,
        restored_at TIMESTAMP,

        FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
        FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE,
        FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE,

        -- At least one entity reference is required
        CHECK (
          (movie_id IS NOT NULL) OR
          (series_id IS NOT NULL) OR
          (season_id IS NOT NULL) OR
          (episode_id IS NOT NULL)
        )
      )
    `);

    await db.execute(`CREATE INDEX idx_backup_assets_movie ON backup_assets(movie_id, type)`);
    await db.execute(`CREATE INDEX idx_backup_assets_series ON backup_assets(series_id, type)`);
    await db.execute(`CREATE INDEX idx_backup_assets_season ON backup_assets(season_id, type)`);
    await db.execute(`CREATE INDEX idx_backup_assets_episode ON backup_assets(episode_id, type)`);
    await db.execute(`CREATE INDEX idx_backup_assets_phash ON backup_assets(phash) WHERE phash IS NOT NULL`);
    await db.execute(`CREATE INDEX idx_backup_assets_backed_up_at ON backup_assets(backed_up_at)`);

    // Asset Selection Configuration
    await db.execute(`
      CREATE TABLE asset_selection_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        library_id INTEGER NOT NULL,
        asset_type TEXT NOT NULL,

        -- Quantity
        min_count INTEGER DEFAULT 1,
        max_count INTEGER DEFAULT 3,

        -- Quality filters
        min_width INTEGER,
        min_height INTEGER,
        prefer_language TEXT DEFAULT 'en',

        -- Scoring weights (must sum to 1.0)
        weight_resolution REAL DEFAULT 0.3,
        weight_votes REAL DEFAULT 0.4,
        weight_language REAL DEFAULT 0.2,
        weight_provider REAL DEFAULT 0.1,

        -- Duplicate detection
        phash_similarity_threshold REAL DEFAULT 0.90,

        -- Provider priority (JSON array)
        provider_priority TEXT DEFAULT '["tmdb", "tvdb", "fanart.tv"]',

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE,
        UNIQUE(library_id, asset_type)
      )
    `);

    await db.execute(`CREATE INDEX idx_asset_config_library ON asset_selection_config(library_id)`);

    // Library Automation Configuration
    await db.execute(`
      CREATE TABLE library_automation_config (
        library_id INTEGER PRIMARY KEY,

        -- Automation level
        automation_mode TEXT DEFAULT 'hybrid',  -- 'manual', 'yolo', 'hybrid'

        -- Phase 2 behavior
        auto_enrich BOOLEAN DEFAULT 1,
        auto_select_assets BOOLEAN DEFAULT 1,
        auto_publish BOOLEAN DEFAULT 0,         -- Only true for 'yolo' mode

        -- Webhook behavior
        webhook_enabled BOOLEAN DEFAULT 1,
        webhook_auto_publish BOOLEAN DEFAULT 1,  -- Always publish on webhook

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE
      )
    `);

    // Rejected Assets (Global blacklist)
    await db.execute(`
      CREATE TABLE rejected_assets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL,
        entity_id INTEGER NOT NULL,
        asset_type TEXT NOT NULL,
        file_path TEXT NOT NULL,
        rejected_by TEXT,
        rejected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        reason TEXT,

        UNIQUE(entity_type, entity_id, asset_type, file_path)
      )
    `);

    await db.execute(`CREATE INDEX idx_rejected_entity ON rejected_assets(entity_type, entity_id)`);

    // Publish Log (Audit trail)
    await db.execute(`
      CREATE TABLE publish_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL,
        entity_id INTEGER NOT NULL,

        -- Publish details
        published_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        published_by TEXT,
        success BOOLEAN DEFAULT 1,
        error_message TEXT,

        -- Published content
        nfo_content TEXT,
        nfo_hash TEXT,
        assets_published TEXT,

        -- Metadata
        duration_ms INTEGER,

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.execute(`CREATE INDEX idx_publish_log_entity ON publish_log(entity_type, entity_id)`);
    await db.execute(`CREATE INDEX idx_publish_log_published_at ON publish_log(published_at)`);
    await db.execute(`CREATE INDEX idx_publish_log_success ON publish_log(success)`);

    // Job Queue (Background processing)
    await db.execute(`
      CREATE TABLE job_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        priority INTEGER NOT NULL,
        state TEXT DEFAULT 'pending',

        -- Payload
        payload TEXT NOT NULL,

        -- Progress tracking
        progress_current INTEGER DEFAULT 0,
        progress_total INTEGER DEFAULT 0,
        progress_message TEXT,

        -- Retry logic
        retry_count INTEGER DEFAULT 0,
        max_retries INTEGER DEFAULT 3,
        next_retry_at TIMESTAMP,
        error TEXT,
        error_stack TEXT,

        -- Cancellation
        is_cancellable BOOLEAN DEFAULT 1,
        cancelled_at TIMESTAMP,

        -- Timing
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        started_at TIMESTAMP,
        completed_at TIMESTAMP
      )
    `);

    await db.execute(`CREATE INDEX idx_job_queue_state ON job_queue(state)`);
    await db.execute(`CREATE INDEX idx_job_queue_priority ON job_queue(state, priority, created_at)`);
    await db.execute(`CREATE INDEX idx_job_queue_worker ON job_queue(state, priority, created_at) WHERE state = 'pending'`);

    // Completeness Configuration
    await db.execute(`
      CREATE TABLE completeness_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        media_type TEXT NOT NULL UNIQUE,

        -- Required Scalar Fields (JSON array)
        required_fields TEXT NOT NULL,

        -- Required Images (exact quantities)
        required_posters INTEGER DEFAULT 1,
        required_fanart INTEGER DEFAULT 1,
        required_landscape INTEGER DEFAULT 0,
        required_keyart INTEGER DEFAULT 0,
        required_banners INTEGER DEFAULT 0,
        required_clearart INTEGER DEFAULT 0,
        required_clearlogo INTEGER DEFAULT 0,
        required_discart INTEGER DEFAULT 0,

        -- Required Media Assets
        required_trailers INTEGER DEFAULT 0,
        required_subtitles INTEGER DEFAULT 0,
        required_themes INTEGER DEFAULT 0,

        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Seed completeness config
    await db.execute(`INSERT INTO completeness_config (media_type, required_fields, required_posters, required_fanart) VALUES ('movies', '["plot", "mpaa", "premiered"]', 1, 1)`);
    await db.execute(`INSERT INTO completeness_config (media_type, required_fields, required_posters, required_fanart, required_banners) VALUES ('series', '["plot", "mpaa"]', 1, 2, 1)`);
    await db.execute(`INSERT INTO completeness_config (media_type, required_fields, required_posters) VALUES ('episodes', '["plot"]', 1)`);


    // ========================================
    // PHASE 1: ALTER EXISTING TABLES
    // ========================================

    // Movies - Add state machine and publishing columns
    await db.execute(`ALTER TABLE movies ADD COLUMN state TEXT DEFAULT 'discovered'`);
    await db.execute(`ALTER TABLE movies ADD COLUMN enriched_at TIMESTAMP`);
    await db.execute(`ALTER TABLE movies ADD COLUMN enrichment_priority INTEGER DEFAULT 5`);
    await db.execute(`ALTER TABLE movies ADD COLUMN has_unpublished_changes BOOLEAN DEFAULT 0`);
    await db.execute(`ALTER TABLE movies ADD COLUMN last_published_at TIMESTAMP`);
    await db.execute(`ALTER TABLE movies ADD COLUMN published_nfo_hash TEXT`);

    // Movies - Add asset locking columns
    await db.execute(`ALTER TABLE movies ADD COLUMN poster_locked BOOLEAN DEFAULT 0`);
    await db.execute(`ALTER TABLE movies ADD COLUMN fanart_locked BOOLEAN DEFAULT 0`);
    await db.execute(`ALTER TABLE movies ADD COLUMN banner_locked BOOLEAN DEFAULT 0`);
    await db.execute(`ALTER TABLE movies ADD COLUMN clearlogo_locked BOOLEAN DEFAULT 0`);
    await db.execute(`ALTER TABLE movies ADD COLUMN clearart_locked BOOLEAN DEFAULT 0`);
    await db.execute(`ALTER TABLE movies ADD COLUMN discart_locked BOOLEAN DEFAULT 0`);
    await db.execute(`ALTER TABLE movies ADD COLUMN landscape_locked BOOLEAN DEFAULT 0`);
    await db.execute(`ALTER TABLE movies ADD COLUMN keyart_locked BOOLEAN DEFAULT 0`);
    await db.execute(`ALTER TABLE movies ADD COLUMN trailer_locked BOOLEAN DEFAULT 0`);

    // Movies - Add indexes for Phase 1
    await db.execute(`CREATE INDEX idx_movies_state ON movies(state)`);
    await db.execute(`CREATE INDEX idx_movies_unpublished ON movies(has_unpublished_changes) WHERE has_unpublished_changes = 1`);
    await db.execute(`CREATE INDEX idx_movies_needs_enrichment ON movies(state, enriched_at, enrichment_priority) WHERE state IN ('identified', 'discovered') AND enriched_at IS NULL`);

    // Series - Add state machine and publishing columns
    await db.execute(`ALTER TABLE series ADD COLUMN state TEXT DEFAULT 'discovered'`);
    await db.execute(`ALTER TABLE series ADD COLUMN enriched_at TIMESTAMP`);
    await db.execute(`ALTER TABLE series ADD COLUMN enrichment_priority INTEGER DEFAULT 5`);
    await db.execute(`ALTER TABLE series ADD COLUMN has_unpublished_changes BOOLEAN DEFAULT 0`);
    await db.execute(`ALTER TABLE series ADD COLUMN last_published_at TIMESTAMP`);
    await db.execute(`ALTER TABLE series ADD COLUMN published_nfo_hash TEXT`);

    // Series - Add asset locking columns
    await db.execute(`ALTER TABLE series ADD COLUMN poster_locked BOOLEAN DEFAULT 0`);
    await db.execute(`ALTER TABLE series ADD COLUMN fanart_locked BOOLEAN DEFAULT 0`);
    await db.execute(`ALTER TABLE series ADD COLUMN banner_locked BOOLEAN DEFAULT 0`);
    await db.execute(`ALTER TABLE series ADD COLUMN clearlogo_locked BOOLEAN DEFAULT 0`);

    // Series - Add indexes for Phase 1
    await db.execute(`CREATE INDEX idx_series_state ON series(state)`);
    await db.execute(`CREATE INDEX idx_series_unpublished ON series(has_unpublished_changes) WHERE has_unpublished_changes = 1`);

    // Episodes - Add state machine and publishing columns
    await db.execute(`ALTER TABLE episodes ADD COLUMN state TEXT DEFAULT 'discovered'`);
    await db.execute(`ALTER TABLE episodes ADD COLUMN enriched_at TIMESTAMP`);
    await db.execute(`ALTER TABLE episodes ADD COLUMN enrichment_priority INTEGER DEFAULT 5`);
    await db.execute(`ALTER TABLE episodes ADD COLUMN has_unpublished_changes BOOLEAN DEFAULT 0`);
    await db.execute(`ALTER TABLE episodes ADD COLUMN last_published_at TIMESTAMP`);
    await db.execute(`ALTER TABLE episodes ADD COLUMN published_nfo_hash TEXT`);

    // Episodes - Add asset locking columns
    await db.execute(`ALTER TABLE episodes ADD COLUMN thumb_locked BOOLEAN DEFAULT 0`);

    // Episodes - Add indexes for Phase 1
    await db.execute(`CREATE INDEX idx_episodes_state ON episodes(state)`);
    await db.execute(`CREATE INDEX idx_episodes_unpublished ON episodes(has_unpublished_changes) WHERE has_unpublished_changes = 1`);

    // ========================================
    // PROVIDER CONFIGURATIONS
    // ========================================

    // Provider configs table - stores API keys and settings for metadata providers
    await db.execute(`
      CREATE TABLE provider_configs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider_name VARCHAR(50) NOT NULL UNIQUE,
        enabled BOOLEAN NOT NULL DEFAULT 0,
        api_key TEXT,
        enabled_asset_types TEXT NOT NULL DEFAULT '[]',
        last_test_at DATETIME,
        last_test_status VARCHAR(20),
        last_test_error TEXT,

        -- Provider Framework Authentication
        personal_api_key TEXT,
        token TEXT,
        token_expires_at DATETIME,

        -- Provider Framework Configuration
        language VARCHAR(10) DEFAULT 'en',
        region VARCHAR(10) DEFAULT 'US',
        options TEXT DEFAULT '{}',
        priority INTEGER DEFAULT 50,

        -- Provider Framework Usage Flags
        use_for_metadata BOOLEAN DEFAULT 1,
        use_for_images BOOLEAN DEFAULT 1,
        use_for_search BOOLEAN DEFAULT 1,

        -- Provider Framework Health Tracking
        consecutive_failures INTEGER DEFAULT 0,
        circuit_breaker_until DATETIME,

        -- Provider Framework Statistics
        total_requests INTEGER DEFAULT 0,
        failed_requests INTEGER DEFAULT 0,
        avg_response_time_ms INTEGER,
        last_request_at DATETIME,

        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.execute(`CREATE INDEX idx_provider_configs_enabled ON provider_configs(enabled)`);
    await db.execute(`CREATE INDEX idx_provider_priority ON provider_configs(priority DESC)`);
    await db.execute(`CREATE INDEX idx_provider_usage ON provider_configs(enabled, use_for_metadata, use_for_images)`);

    // Asset Selection Presets - defines how many of each asset type to collect
    await db.execute(`
      CREATE TABLE asset_selection_presets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name VARCHAR(50) NOT NULL UNIQUE,
        description TEXT,
        is_default BOOLEAN DEFAULT 0,

        -- Asset counts (JSON: { "poster": 1, "fanart": 3, "clearlogo": 1 })
        asset_counts TEXT NOT NULL DEFAULT '{}',

        -- Provider priority (JSON array: ["fanart_tv", "tmdb", "tvdb"])
        provider_priority TEXT,

        -- Quality filters
        min_poster_width INTEGER DEFAULT 1000,
        min_poster_height INTEGER DEFAULT 1500,
        min_fanart_width INTEGER DEFAULT 1920,
        min_fanart_height INTEGER DEFAULT 1080,

        -- Deduplication
        phash_threshold REAL DEFAULT 0.92,

        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Library Provider Configuration - links libraries to asset presets
    await db.execute(`
      CREATE TABLE library_provider_config (
        library_id INTEGER PRIMARY KEY,
        preset_id INTEGER NOT NULL,

        -- Orchestration strategy
        strategy VARCHAR(50) DEFAULT 'preferred_first',
        preferred_metadata_provider VARCHAR(50),
        fill_metadata_gaps BOOLEAN DEFAULT 1,

        -- Custom field mapping (JSON, only if strategy = 'field_mapping')
        field_mapping TEXT,

        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE,
        FOREIGN KEY (preset_id) REFERENCES asset_selection_presets(id)
      )
    `);

    // Insert default asset selection presets
    // Minimal preset
    await db.execute(`
      INSERT INTO asset_selection_presets (
        name,
        description,
        is_default,
        asset_counts,
        provider_priority,
        min_poster_width,
        min_poster_height,
        min_fanart_width,
        min_fanart_height,
        phash_threshold
      ) VALUES (
        'minimal',
        'Essential assets only. Fastest setup, smallest library size.',
        0,
        '{"poster": 1, "fanart": 2}',
        '["tmdb"]',
        1000,
        1500,
        1920,
        1080,
        0.92
      )
    `);

    // Recommended preset (default)
    await db.execute(`
      INSERT INTO asset_selection_presets (
        name,
        description,
        is_default,
        asset_counts,
        provider_priority,
        min_poster_width,
        min_poster_height,
        min_fanart_width,
        min_fanart_height,
        phash_threshold
      ) VALUES (
        'recommended',
        'Balanced visual experience. Recommended for most users.',
        1,
        '{"poster": 1, "fanart": 3, "clearlogo": 1}',
        '["fanart_tv", "tmdb"]',
        1500,
        2250,
        1920,
        1080,
        0.92
      )
    `);

    // Maximum preset
    await db.execute(`
      INSERT INTO asset_selection_presets (
        name,
        description,
        is_default,
        asset_counts,
        provider_priority,
        min_poster_width,
        min_poster_height,
        min_fanart_width,
        min_fanart_height,
        phash_threshold
      ) VALUES (
        'maximum',
        'All available artwork. Best for large screens and advanced skins.',
        0,
        '{"poster": 3, "fanart": 10, "clearlogo": 1, "clearart": 1, "banner": 1, "discart": 1, "landscape": 1}',
        '["fanart_tv", "tmdb", "tvdb"]',
        2000,
        3000,
        1920,
        1080,
        0.90
      )
    `);

    // ========================================
    // SETTINGS TABLE
    // ========================================

    await db.execute(`
      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert backup settings
    await db.execute(`
      INSERT INTO settings (key, value, description) VALUES
      ('backup_enabled', 'true', 'Enable automatic backup of local assets before enrichment'),
      ('backup_retention_days', '90', 'Number of days to retain backed-up assets'),
      ('backup_auto_cleanup', 'true', 'Automatically cleanup old backups'),
      ('backup_subtitles', 'false', 'Include subtitles in backup (can be large)'),
      ('backup_trailers', 'false', 'Include trailers in backup (can be huge)')
    `);

    // ========================================
    // PHASE 1: TRIGGERS
    // ========================================

    // Trigger: Orphan cache assets when asset_candidate deleted
    await db.execute(`
      CREATE TRIGGER orphan_cache_assets
      AFTER DELETE ON asset_candidates
      FOR EACH ROW
      WHEN OLD.content_hash IS NOT NULL
      BEGIN
        -- Decrement reference count
        UPDATE cache_inventory
        SET reference_count = reference_count - 1
        WHERE content_hash = OLD.content_hash;

        -- Mark as orphaned if ref_count = 0
        UPDATE cache_inventory
        SET orphaned_at = CURRENT_TIMESTAMP
        WHERE content_hash = OLD.content_hash
          AND reference_count = 0
          AND orphaned_at IS NULL;
      END
    `);
  }

  static async down(_db: DatabaseConnection): Promise<void> {
    // Drop all tables in reverse dependency order
    // Not implemented - this is the initial schema
  }
}

// Migration updated: 2025-10-08 - Integrated Phase 1 revised architecture (asset_candidates, cache_inventory, state machine, publishing workflow)
