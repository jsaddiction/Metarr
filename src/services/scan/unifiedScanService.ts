import path from 'path';
import fs from 'fs/promises';
import { logger } from '../../middleware/logging.js';
import { DatabaseConnection } from '../../types/database.js';
import { DatabaseManager } from '../../database/DatabaseManager.js';
// TODO: Re-enable hash tracking when schema supports it
// import {
//   hashDirectoryFingerprint,
//   hasDirectoryChanged,
//   hasNfoChanged,
//   hasVideoChanged,
//   hashFile,
// } from '../hash/hashService.js';
import { parseFullMovieNfos } from '../nfo/nfoParser.js';
import { generateMovieNFOFromDatabase } from '../nfo/nfoGenerator.js';
import { extractAndStoreMediaInfo } from '../media/ffprobeService.js';
import { discoverAndStoreAssets } from '../media/assetDiscovery_flexible.js';
import { detectAndStoreUnknownFiles } from '../media/unknownFilesDetection.js';
import { IgnorePatternService } from '../ignorePatternService.js';
import { findOrCreateMovie, MovieLookupContext } from './movieLookupService.js';

/**
 * Unified Scan Service
 *
 * Orchestrates the complete scanning workflow for movies:
 * 1. Directory fingerprint check (quick "did anything change?" test)
 * 2. NFO parsing (first scan) or change detection (rescan)
 * 3. NFO regeneration if external app modified it
 * 4. Video hash check and stream extraction (only if changed)
 * 5. Asset discovery (images, trailers, subtitles)
 * 6. Unknown files detection
 *
 * Database is source of truth - NFO files are for player compatibility
 */

const VIDEO_EXTENSIONS = [
  '.mp4',
  '.mkv',
  '.avi',
  '.mov',
  '.wmv',
  '.flv',
  '.webm',
  '.m4v',
  '.mpg',
  '.mpeg',
  '.m2ts',
  '.ts',
  '.vob',
  '.ogv',
  '.3gp',
];

export interface ScanContext {
  tmdbId?: number;
  imdbId?: string;
  title?: string;
  year?: number;
  trigger?: 'webhook' | 'user_refresh' | 'scheduled_scan';
}

export interface ScanResult {
  movieId?: number;
  isNewMovie: boolean;
  pathChanged: boolean;
  restoredFromDeletion: boolean;
  directoryChanged: boolean;
  nfoChanged: boolean;
  videoChanged: boolean;
  nfoRegenerated: boolean;
  streamsExtracted: boolean;
  assetsFound: {
    images: number;
    trailers: number;
    subtitles: number;
  };
  unknownFilesFound: number;
  errors: string[];
}

/**
 * Find the main video file in a movie directory
 * Returns the largest video file
 */
async function findMainVideoFile(dirPath: string): Promise<string | null> {
  try {
    const files = await fs.readdir(dirPath, { withFileTypes: true });
    let largestVideo: { path: string; size: number } | null = null;

    for (const file of files) {
      if (!file.isFile()) continue;

      const ext = path.extname(file.name).toLowerCase();
      if (!VIDEO_EXTENSIONS.includes(ext)) continue;

      // Skip sample/trailer files
      const lowerName = file.name.toLowerCase();
      if (lowerName.includes('sample') || lowerName.includes('trailer')) {
        continue;
      }

      const filePath = path.join(dirPath, file.name);
      const stats = await fs.stat(filePath);

      if (!largestVideo || stats.size > largestVideo.size) {
        largestVideo = { path: filePath, size: stats.size };
      }
    }

    return largestVideo?.path || null;
  } catch (error: any) {
    logger.error('Failed to find main video file', {
      dirPath,
      error: error.message,
    });
    return null;
  }
}

/**
 * Scan a single movie directory
 * Implements complete scanning workflow with hash-based change detection
 *
 * @param dbManager Database manager instance
 * @param movieDir Directory containing the movie
 * @param context Optional context from webhook, user refresh, or NFO parsing
 */
export async function scanMovieDirectory(
  dbManager: DatabaseManager,
  libraryId: number,
  movieDir: string,
  context?: ScanContext
): Promise<ScanResult> {
  const db = dbManager.getConnection();
  const result: ScanResult = {
    isNewMovie: false,
    pathChanged: false,
    restoredFromDeletion: false,
    directoryChanged: false,
    nfoChanged: false,
    videoChanged: false,
    nfoRegenerated: false,
    streamsExtracted: false,
    assetsFound: {
      images: 0,
      trailers: 0,
      subtitles: 0,
    },
    unknownFilesFound: 0,
    errors: [],
  };

  // Create ignore pattern service
  const ignorePatternService = new IgnorePatternService(dbManager);

  try {
    // Find main video file
    const videoFilePath = await findMainVideoFile(movieDir);
    if (!videoFilePath) {
      result.errors.push('No video file found in directory');
      logger.warn('No video file found in movie directory', { movieDir });
      return result;
    }

    // Extract TMDB ID from NFO if not in context (for scheduled scans)
    let tmdbIdToUse = context?.tmdbId;
    let imdbIdToUse = context?.imdbId;
    let titleToUse = context?.title;
    let yearToUse = context?.year;

    if (!tmdbIdToUse) {
      // Try to get TMDB ID from NFO files
      const nfoFiles = await findMovieNfos(movieDir);
      if (nfoFiles.length > 0) {
        const nfoData = await parseFullMovieNfos(nfoFiles);
        if (nfoData.valid && !nfoData.ambiguous) {
          tmdbIdToUse = nfoData.tmdbId;
          imdbIdToUse = imdbIdToUse || nfoData.imdbId;
          titleToUse = titleToUse || nfoData.title;
          yearToUse = yearToUse || nfoData.year;
        }
      }
    }

    // Find or create movie using TMDB ID-first lookup
    const lookupContext: MovieLookupContext = {
      libraryId,
      filePath: videoFilePath,
    };

    if (tmdbIdToUse) lookupContext.tmdbId = tmdbIdToUse;
    if (imdbIdToUse) lookupContext.imdbId = imdbIdToUse;
    if (titleToUse) lookupContext.title = titleToUse;
    if (yearToUse) lookupContext.year = yearToUse;

    const lookupResult = await findOrCreateMovie(db, lookupContext);

    const movieId = lookupResult.movie.id;
    result.movieId = movieId;
    result.isNewMovie = lookupResult.created;
    result.pathChanged = lookupResult.pathChanged;
    result.restoredFromDeletion = lookupResult.restoredFromDeletion;

    const isFirstScan = lookupResult.created;

    if (isFirstScan) {
      // === FIRST SCAN WORKFLOW ===
      logger.info('First scan for movie', {
        movieDir,
        movieId,
        tmdbId: tmdbIdToUse,
        trigger: context?.trigger || 'unknown',
      });

      // Find and parse NFO files
      const nfoFiles = await findMovieNfos(movieDir);
      logger.debug(`Found ${nfoFiles.length} NFO files`, { movieId, nfoFiles });

      let metadataToStore: any = null;

      if (nfoFiles.length > 0) {
        const nfoData = await parseFullMovieNfos(nfoFiles);
        logger.debug(`Parsed NFO data - valid: ${nfoData.valid}, tmdbId: ${nfoData.tmdbId}`, { movieId });

        if (nfoData.valid && !nfoData.ambiguous) {
          // Phase 2: Store NFO data directly (no provider API calls)
          // Provider enrichment will happen in Phase 4 via separate enrichment jobs
          metadataToStore = nfoData;

          logger.info(`NFO data ready for storage`, {
            movieId,
            title: metadataToStore.title,
            year: metadataToStore.year,
            tmdbId: metadataToStore.tmdbId,
          });

          // Store metadata in database
          logger.info(`Storing metadata in database`, {
            movieId,
            title: metadataToStore.title,
            year: metadataToStore.year,
          });
          await storeMovieMetadata(db, movieId, metadataToStore);

          // Generate clean NFO from database (database is source of truth)
          await generateMovieNFOFromDatabase(db, movieId, movieDir);

          // TODO: Hash tracking not in clean schema - implement if needed
          // const nfoPath = path.join(movieDir, 'movie.nfo');

          logger.info('Parsed and stored NFO metadata', {
            movieId,
            title: nfoData.title,
          });
        } else if (nfoData.ambiguous) {
          result.errors.push('Ambiguous NFO with conflicting IDs');
          await db.execute(`UPDATE movies SET status = ? WHERE id = ?`, ['ambiguous_nfo', movieId]);
        }
      } else {
        logger.debug('No NFO files found, movie needs identification', { movieDir });
      }

      // TODO: Hash tracking not in clean schema - implement if needed
      // const dirHashResult = await hashDirectoryFingerprint(movieDir);
      // const videoHashResult = await hashFile(videoFilePath);

      // Extract stream details with FFprobe
      try {
        await extractAndStoreMediaInfo(db, 'movie', movieId, videoFilePath);
        result.streamsExtracted = true;
      } catch (error: any) {
        result.errors.push(`FFprobe failed: ${error.message}`);
      }

      // Discover assets
      try {
        const assets = await discoverAndStoreAssets(
          db,
          'movie',
          movieId,
          movieDir,
          path.basename(videoFilePath)
        );
        result.assetsFound = {
          images: assets.images,
          trailers: assets.trailers,
          subtitles: assets.subtitles,
        };
      } catch (error: any) {
        result.errors.push(`Asset discovery failed: ${error.message}`);
      }

      // Detect unknown files
      try {
        const unknownResult = await detectAndStoreUnknownFiles(
          db,
          'movie',
          movieId,
          movieDir,
          videoFilePath,
          ignorePatternService
        );
        result.unknownFilesFound = unknownResult.unknownFiles.length;
      } catch (error: any) {
        result.errors.push(`Unknown files detection failed: ${error.message}`);
      }
    } else {
      // === RESCAN WORKFLOW ===
      logger.info('Rescanning existing movie', {
        movieId,
        movieDir,
        pathChanged: result.pathChanged,
        restoredFromDeletion: result.restoredFromDeletion,
        trigger: context?.trigger || 'unknown',
      });

      // TODO: Change detection temporarily disabled - hash columns not in clean schema
      // For now, always rescan everything
      logger.debug('Rescanning all components (change detection disabled)', { movieId });
      result.directoryChanged = true;

      // Always regenerate NFO on rescan (for now)
      try {
        logger.info('Regenerating NFO from database', { movieId });
        await generateMovieNFOFromDatabase(db, movieId, movieDir);
        result.nfoRegenerated = true;
      } catch (error: any) {
        logger.warn('NFO regeneration failed', { movieId, error: error.message });
      }

      // Always re-extract streams on rescan (for now)
      try {
        logger.info('Re-extracting video streams', { movieId });
        await extractAndStoreMediaInfo(db, 'movie', movieId, videoFilePath);
        result.streamsExtracted = true;
        result.videoChanged = true;
      } catch (error: any) {
        result.errors.push(`FFprobe failed: ${error.message}`);
      }

      // Re-discover assets (always, since directory changed)
      try {
        const assets = await discoverAndStoreAssets(
          db,
          'movie',
          movieId,
          movieDir,
          path.basename(videoFilePath)
        );
        result.assetsFound = {
          images: assets.images,
          trailers: assets.trailers,
          subtitles: assets.subtitles,
        };
      } catch (error: any) {
        result.errors.push(`Asset discovery failed: ${error.message}`);
      }

      // Re-detect unknown files
      try {
        const unknownResult = await detectAndStoreUnknownFiles(
          db,
          'movie',
          movieId,
          movieDir,
          videoFilePath,
          ignorePatternService
        );
        result.unknownFilesFound = unknownResult.unknownFiles.length;
      } catch (error: any) {
        result.errors.push(`Unknown files detection failed: ${error.message}`);
      }
    }

    // Update last scanned timestamp
    await db.execute(`UPDATE movies SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [movieId]);

    logger.info('Completed movie scan', {
      movieId,
      isFirstScan,
      directoryChanged: result.directoryChanged,
      nfoRegenerated: result.nfoRegenerated,
      streamsExtracted: result.streamsExtracted,
    });

    return result;
  } catch (error: any) {
    logger.error('Failed to scan movie directory', {
      movieDir,
      error: error.message,
    });
    result.errors.push(`Scan failed: ${error.message}`);
    return result;
  }
}

/**
 * Helper: Store movie metadata from NFO in database
 */
async function storeMovieMetadata(
  db: DatabaseConnection,
  movieId: number,
  nfoData: any
): Promise<void> {
  // Update movie record with metadata
  await db.execute(
    `UPDATE movies SET
      title = ?,
      original_title = ?,
      sort_title = ?,
      year = ?,
      plot = ?,
      tagline = ?,
      content_rating = ?,
      release_date = ?,
      tmdb_id = ?,
      imdb_id = ?,
      identification_status = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?`,
    [
      nfoData.title,
      nfoData.originalTitle,
      nfoData.sortTitle,
      nfoData.year,
      nfoData.plot,
      nfoData.tagline,
      nfoData.mpaa, // mpaa maps to content_rating
      nfoData.premiered,
      nfoData.tmdbId,
      nfoData.imdbId,
      'enriched', // Changed from 'identified' to 'enriched' since we have full metadata
      movieId,
    ]
  );

  // Store genres (clean schema: genres table with media_type, movie_genres junction)
  if (nfoData.genres && nfoData.genres.length > 0) {
    for (const genreName of nfoData.genres) {
      // Get or create genre
      const genreResults = await db.query(`SELECT id FROM genres WHERE name = ? AND media_type = 'movie'`, [genreName]);
      let genre = genreResults.length > 0 ? genreResults[0] : null;
      if (!genre) {
        const result = await db.execute(`INSERT INTO genres (name, media_type) VALUES (?, 'movie')`, [genreName]);
        genre = { id: result.insertId };
      }

      // Link to movie
      await db.execute(`INSERT OR IGNORE INTO movie_genres (movie_id, genre_id) VALUES (?, ?)`, [
        movieId,
        genre.id,
      ]);
    }
  }

  // Store directors (clean schema: crew table with movie_crew junction using role='director')
  if (nfoData.directors && nfoData.directors.length > 0) {
    for (const directorName of nfoData.directors) {
      const crewResults = await db.query(`SELECT id FROM crew WHERE name = ?`, [directorName]);
      let crew = crewResults.length > 0 ? crewResults[0] : null;
      if (!crew) {
        const result = await db.execute(`INSERT INTO crew (name) VALUES (?)`, [directorName]);
        crew = { id: result.insertId };
      }

      await db.execute(
        `INSERT OR IGNORE INTO movie_crew (movie_id, crew_id, role) VALUES (?, ?, 'director')`,
        [movieId, crew.id]
      );
    }
  }

  // Store writers (clean schema: crew table with movie_crew junction using role='writer')
  if (nfoData.credits && nfoData.credits.length > 0) {
    for (const writerName of nfoData.credits) {
      const crewResults = await db.query(`SELECT id FROM crew WHERE name = ?`, [writerName]);
      let crew = crewResults.length > 0 ? crewResults[0] : null;
      if (!crew) {
        const result = await db.execute(`INSERT INTO crew (name) VALUES (?)`, [writerName]);
        crew = { id: result.insertId };
      }

      await db.execute(`INSERT OR IGNORE INTO movie_crew (movie_id, crew_id, role) VALUES (?, ?, 'writer')`, [
        movieId,
        crew.id,
      ]);
    }
  }

  // Store actors (clean schema: actors table with movie_actors junction)
  if (nfoData.actors && nfoData.actors.length > 0) {
    for (const actorData of nfoData.actors) {
      const actorResults = await db.query(`SELECT id FROM actors WHERE name = ?`, [actorData.name]);
      let actor = actorResults.length > 0 ? actorResults[0] : null;
      if (!actor) {
        // Clean schema: actors.thumb_id references cache_assets, not thumb_url
        // For now, just create actor without thumb - full implementation would download and cache
        const result = await db.execute(`INSERT INTO actors (name) VALUES (?)`, [actorData.name]);
        actor = { id: result.insertId };
      }

      await db.execute(
        `INSERT OR IGNORE INTO movie_actors (movie_id, actor_id, role, sort_order) VALUES (?, ?, ?, ?)`,
        [movieId, actor.id, actorData.role, actorData.order]
      );
    }
  }

  // Store ratings - Clean schema doesn't have a ratings table
  // TMDB/IMDB ratings go directly in movies table columns
  if (nfoData.ratings && nfoData.ratings.length > 0) {
    for (const rating of nfoData.ratings) {
      if (rating.source === 'tmdb') {
        await db.execute(
          `UPDATE movies SET tmdb_rating = ?, tmdb_votes = ? WHERE id = ?`,
          [rating.value, rating.votes || 0, movieId]
        );
      } else if (rating.source === 'imdb') {
        await db.execute(
          `UPDATE movies SET imdb_rating = ?, imdb_votes = ? WHERE id = ?`,
          [rating.value, rating.votes || 0, movieId]
        );
      }
    }
  }

  // Store studios (clean schema: studios table with movie_studios junction)
  if (nfoData.studios && nfoData.studios.length > 0) {
    for (const studioName of nfoData.studios) {
      const studioResults = await db.query(`SELECT id FROM studios WHERE name = ?`, [studioName]);
      let studio = studioResults.length > 0 ? studioResults[0] : null;
      if (!studio) {
        const result = await db.execute(`INSERT INTO studios (name) VALUES (?)`, [studioName]);
        studio = { id: result.insertId };
      }

      await db.execute(`INSERT OR IGNORE INTO movie_studios (movie_id, studio_id) VALUES (?, ?)`, [
        movieId,
        studio.id,
      ]);
    }
  }

  // Clean schema doesn't have countries or tags tables - skipping for now

  // Store set/collection (clean schema: movie_collections table with movie_collection_members junction)
  if (nfoData.set && nfoData.set.name) {
    const collectionResults = await db.query(`SELECT id FROM movie_collections WHERE name = ?`, [nfoData.set.name]);
    let collection = collectionResults.length > 0 ? collectionResults[0] : null;
    if (!collection) {
      const result = await db.execute(`INSERT INTO movie_collections (name, plot) VALUES (?, ?)`, [
        nfoData.set.name,
        nfoData.set.overview,
      ]);
      collection = { id: result.insertId };
    }

    // Add movie to collection
    await db.execute(
      `INSERT OR IGNORE INTO movie_collection_members (movie_id, collection_id) VALUES (?, ?)`,
      [movieId, collection.id]
    );
  }
}

/**
 * Import missing function from nfoDiscovery
 */
async function findMovieNfos(movieDir: string): Promise<string[]> {
  const fs = await import('fs/promises');
  const path = await import('path');

  try {
    const files = await fs.readdir(movieDir);
    const nfoFiles: string[] = [];

    for (const file of files) {
      const lowerFile = file.toLowerCase();
      if (lowerFile.endsWith('.nfo') || lowerFile === 'movie.xml') {
        nfoFiles.push(path.join(movieDir, file));
      }
    }

    return nfoFiles;
  } catch (error: any) {
    logger.error(`Failed to find movie NFOs in ${movieDir}`, { error: error.message });
    return [];
  }
}
