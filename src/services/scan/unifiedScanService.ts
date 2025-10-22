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
import { trackNFOFile } from '../nfo/nfoFileTracking.js';
import { extractAndStoreMediaInfo } from '../media/ffprobeService.js';
import { IgnorePatternService } from '../ignorePatternService.js';
import { findOrCreateMovie, rehashMovieFile, MovieLookupContext } from './movieLookupService.js';
import { classifyFilesInDirectory, verifyCachedFiles } from './fileClassificationService.js';
import { processClassifiedFiles } from './fileProcessingService.js';

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
        // Extract video basename (without extension) for exact NFO match priority
        const videoBasename = path.basename(videoFilePath, path.extname(videoFilePath));
        const nfoData = await parseFullMovieNfos(nfoFiles, videoBasename);
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
        // Extract video basename (without extension) for exact NFO match priority
        const videoBasename = path.basename(videoFilePath, path.extname(videoFilePath));
        const nfoData = await parseFullMovieNfos(nfoFiles, videoBasename);
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

          // Track NFO file in text_files table (unified file system)
          if (nfoFiles.length > 0) {
            await trackNFOFile(db, nfoFiles[0], 'movie', movieId, nfoData);
          }

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

      // Note: File hash is already computed and stored during movie creation (see createMovie)

      // Extract stream details with FFprobe
      try {
        await extractAndStoreMediaInfo(db, 'movie', movieId, videoFilePath);
        result.streamsExtracted = true;
      } catch (error: any) {
        result.errors.push(`FFprobe failed: ${error.message}`);
      }

      // COIN-SORTER SCANNER: Two-pass file classification and processing
      try {
        // PASS 1: Classify all files (read-only, deterministic)
        const classification = await classifyFilesInDirectory(movieDir, ignorePatternService);

        // PASS 2: Process classified files (cache to database)
        const processingResult = await processClassifiedFiles(
          db,
          classification,
          'movie',
          movieId,
          path.basename(videoFilePath)
        );

        result.assetsFound = {
          images: processingResult.imagesProcessed,
          trailers: processingResult.trailersProcessed,
          subtitles: processingResult.subtitlesProcessed,
        };
        result.unknownFilesFound = processingResult.unknownLogged;

        if (processingResult.errors.length > 0) {
          result.errors.push(...processingResult.errors);
        }

        logger.info('Coin-sorter scanner complete', {
          movieId,
          nfoProcessed: processingResult.nfoProcessed,
          imagesProcessed: processingResult.imagesProcessed,
          trailersProcessed: processingResult.trailersProcessed,
          subtitlesProcessed: processingResult.subtitlesProcessed,
          unknownLogged: processingResult.unknownLogged,
        });
      } catch (error: any) {
        result.errors.push(`File classification/processing failed: ${error.message}`);
      }

      // ARCHITECTURAL CHANGE: Actors are NO LONGER discovered during initial scan
      // They will be discovered during enrichment phase via TMDB API
      // See: src/services/media/actorDiscovery.ts for detailed rationale
    } else {
      // === RESCAN WORKFLOW ===
      logger.info('Rescanning existing movie', {
        movieId,
        movieDir,
        pathChanged: result.pathChanged,
        restoredFromDeletion: result.restoredFromDeletion,
        trigger: context?.trigger || 'unknown',
      });

      // Re-hash file to detect upgrades/quality changes
      let fileHashChanged = false;
      try {
        fileHashChanged = await rehashMovieFile(db, movieId, videoFilePath);
        result.videoChanged = fileHashChanged;

        if (fileHashChanged) {
          logger.info('File hash changed - detected upgrade/modification', { movieId });
        } else {
          logger.debug('File hash unchanged - no video modification detected', { movieId });
        }
      } catch (error: any) {
        logger.warn('Failed to rehash movie file', { movieId, error: error.message });
        // Assume changed to be safe
        fileHashChanged = true;
        result.videoChanged = true;
      }

      // If file hash changed, re-extract stream details
      if (fileHashChanged) {
        // Re-extract streams (video was upgraded/modified)
        try {
          logger.info('File changed - re-extracting video streams', { movieId });
          await extractAndStoreMediaInfo(db, 'movie', movieId, videoFilePath);
          result.streamsExtracted = true;
        } catch (error: any) {
          result.errors.push(`FFprobe failed: ${error.message}`);
        }

        // Note: NFO regeneration will happen during enrichment job, not scan job
      }

      // RESCAN: Verify existing cached files still match specifications
      try {
        logger.info('Verifying cached files against specifications', { movieId });

        const verification = await verifyCachedFiles(db, 'movie', movieId);

        logger.info('Cached file verification complete', {
          movieId,
          valid: verification.valid.length,
          invalid: verification.invalid.length,
          missing: verification.missing.length,
        });

        // If files are invalid or missing, re-classify and process
        if (verification.invalid.length > 0 || verification.missing.length > 0) {
          logger.warn('Found invalid or missing cached files, re-processing directory', {
            movieId,
            invalid: verification.invalid,
            missing: verification.missing,
          });

          // PASS 1: Classify all files
          const classification = await classifyFilesInDirectory(movieDir, ignorePatternService);

          // PASS 2: Process classified files
          const processingResult = await processClassifiedFiles(
            db,
            classification,
            'movie',
            movieId,
            path.basename(videoFilePath)
          );

          result.assetsFound = {
            images: processingResult.imagesProcessed,
            trailers: processingResult.trailersProcessed,
            subtitles: processingResult.subtitlesProcessed,
          };
          result.unknownFilesFound = processingResult.unknownLogged;

          if (processingResult.errors.length > 0) {
            result.errors.push(...processingResult.errors);
          }
        } else {
          logger.info('All cached files valid, no reprocessing needed', { movieId });
        }
      } catch (error: any) {
        result.errors.push(`File verification/reprocessing failed: ${error.message}`);
      }

      // ARCHITECTURAL CHANGE: Actors are NO LONGER discovered during rescans
      // They will be discovered during enrichment phase via TMDB API
      // See: src/services/media/actorDiscovery.ts for detailed rationale
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
  // Build UPDATE statement dynamically - only update fields provided by NFO
  // This preserves existing values (like title from filename) when NFO doesn't provide them
  const updates: string[] = [];
  const values: any[] = [];

  // Only update fields that have values in the NFO
  if (nfoData.title !== undefined && nfoData.title !== null) {
    updates.push('title = ?');
    values.push(nfoData.title);
  }

  if (nfoData.originalTitle !== undefined) {
    updates.push('original_title = ?');
    values.push(nfoData.originalTitle);
  }

  if (nfoData.sortTitle !== undefined) {
    updates.push('sort_title = ?');
    values.push(nfoData.sortTitle);
  }

  if (nfoData.year !== undefined) {
    updates.push('year = ?');
    values.push(nfoData.year);
  }

  if (nfoData.plot !== undefined) {
    updates.push('plot = ?');
    values.push(nfoData.plot);
  }

  if (nfoData.tagline !== undefined) {
    updates.push('tagline = ?');
    values.push(nfoData.tagline);
  }

  if (nfoData.mpaa !== undefined) {
    updates.push('content_rating = ?');
    values.push(nfoData.mpaa);
  }

  if (nfoData.premiered !== undefined) {
    updates.push('release_date = ?');
    values.push(nfoData.premiered);
  }

  if (nfoData.tmdbId !== undefined) {
    updates.push('tmdb_id = ?');
    values.push(nfoData.tmdbId);
  }

  if (nfoData.imdbId !== undefined) {
    updates.push('imdb_id = ?');
    values.push(nfoData.imdbId);
  }

  // Always update identification status and timestamp
  updates.push('identification_status = ?');
  values.push(nfoData.tmdbId ? 'identified' : 'unidentified');

  updates.push('updated_at = CURRENT_TIMESTAMP');

  values.push(movieId);

  // Only execute UPDATE if we have fields to update
  if (updates.length > 2) { // More than just identification_status and updated_at
    await db.execute(
      `UPDATE movies SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
  }

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
      // Scan for .nfo, .txt (Radarr URL files), and legacy movie.xml
      if (lowerFile.endsWith('.nfo') || lowerFile.endsWith('.txt') || lowerFile === 'movie.xml') {
        nfoFiles.push(path.join(movieDir, file));
      }
    }

    return nfoFiles;
  } catch (error: any) {
    logger.error(`Failed to find movie NFOs in ${movieDir}`, { error: error.message });
    return [];
  }
}
