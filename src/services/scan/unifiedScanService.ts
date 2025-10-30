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
import { cacheTextFile } from '../files/videoTextAudioCacheFunctions.js';
import { extractAndStoreMediaInfo } from '../media/ffprobeService.js';
// import { IgnorePatternService } from '../ignorePatternService.js';
import { findOrCreateMovie, rehashMovieFile, MovieLookupContext } from './movieLookupService.js';
import { gatherAllFacts } from './factGatheringService.js';
import { classifyDirectory } from './classificationService.js';
import { canProcessDirectory } from './processingDecisionService.js';
import { getErrorMessage } from '../../utils/errorHandling.js';
import { SqlParam } from '../../types/database.js';

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
  } catch (error) {
    logger.error('Failed to find main video file', {
      dirPath,
      error: getErrorMessage(error),
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

  // Create ignore pattern service (for future use with asset filtering)
  // const ignorePatternService = new IgnorePatternService(dbManager);

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
      // Try to get TMDB ID from NFO files with priority-based merging
      const videoBasename = path.basename(videoFilePath, path.extname(videoFilePath));
      const nfoDiscovery = await findAndPrioritizeMovieNfos(movieDir, videoBasename);

      if (nfoDiscovery.prioritized.length > 0) {
        const nfoData = await parseFullMovieNfos(nfoDiscovery.prioritized, videoBasename);
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

      // Find and prioritize NFO files
      const videoBasename = path.basename(videoFilePath, path.extname(videoFilePath));
      const nfoDiscovery = await findAndPrioritizeMovieNfos(movieDir, videoBasename);

      logger.debug('NFO discovery complete', {
        movieId,
        found: nfoDiscovery.prioritized.length,
        highestPriority: nfoDiscovery.highestPriority ? path.basename(nfoDiscovery.highestPriority) : 'none'
      });

      let metadataToStore: any = null;

      if (nfoDiscovery.prioritized.length > 0) {
        // Parse all NFOs with priority-based merging
        // Highest priority NFO provides base data, lower priority NFOs fill gaps
        const nfoData = await parseFullMovieNfos(nfoDiscovery.prioritized, videoBasename);
        logger.debug(`Parsed NFO data - valid: ${nfoData.valid}, tmdbId: ${nfoData.tmdbId}`, { movieId });

        if (nfoData.valid && !nfoData.ambiguous) {
          // Phase 2: Store NFO data directly (no provider API calls)
          // Provider enrichment will happen in Phase 4 via separate enrichment jobs
          metadataToStore = nfoData;

          logger.info('NFO data ready for storage', {
            movieId,
            title: metadataToStore.title,
            year: metadataToStore.year,
            tmdbId: metadataToStore.tmdbId,
          });

          // Store metadata in database
          logger.info('Storing metadata in database', {
            movieId,
            title: metadataToStore.title,
            year: metadataToStore.year,
          });
          await storeMovieMetadata(db, movieId, metadataToStore);

          // Cache ONLY the highest priority NFO file using unified cache system
          if (nfoDiscovery.highestPriority) {
            try {
              const nfoCacheId = await cacheTextFile(
                db,
                null, // libraryFileId (null for discovered files)
                nfoDiscovery.highestPriority,
                'movie',
                movieId,
                'nfo',
                'local'
              );

              // Update movie record with NFO cache reference
              await db.execute(
                `UPDATE movies SET nfo_cache_id = ? WHERE id = ?`,
                [nfoCacheId, movieId]
              );

              logger.info('Cached highest priority NFO', {
                movieId,
                nfoCacheId,
                nfoFile: path.basename(nfoDiscovery.highestPriority)
              });
            } catch (error) {
              logger.error('Failed to cache NFO file', {
                movieId,
                nfoPath: nfoDiscovery.highestPriority,
                error: getErrorMessage(error)
              });
              result.errors.push(`Failed to cache NFO: ${getErrorMessage(error)}`);
            }
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
      } catch (error) {
        result.errors.push(`FFprobe failed: ${getErrorMessage(error)}`);
      }

      // NEW FILE SCANNER: Fact gathering → Classification → Decision
      try {
        logger.info('Starting new file scanner', { movieId, movieDir });

        // Phase 1: Gather all facts (metadata extraction with FFprobe caching)
        const scanFacts = await gatherAllFacts(movieDir, dbManager);

        // Phase 2: Classify files based on facts
        const classificationResult = await classifyDirectory(scanFacts);

        // Phase 3: Check if we can process
        const decision = canProcessDirectory(classificationResult);

        logger.info('File scanner complete', {
          movieId,
          status: classificationResult.status,
          totalFiles: classificationResult.totalFiles,
          totalClassified: classificationResult.totalClassified,
          totalUnknown: classificationResult.totalUnknown,
          canProcess: decision.canProcess,
          discStructure: classificationResult.isDiscStructure,
        });

        // Update result stats
        result.assetsFound = {
          images: classificationResult.images.totalClassified,
          trailers: classificationResult.videos.trailers.length,
          subtitles: classificationResult.text.subtitles.length,
        };
        result.unknownFilesFound = classificationResult.totalUnknown;

        // Store classification results in cache and database
        const { storeClassificationResults, updateMovieAssetLinks, markUnknownFilesForRecycling } =
          await import('./storageIntegrationService.js');

        const storedAssets = await storeClassificationResults(db, {
          classificationResult,
          movieId,
          entityType: 'movie',
        });

        // Update movie asset references (poster_id, fanart_id, etc.)
        await updateMovieAssetLinks(db, movieId, storedAssets);

        // Mark unknown files in recycle_bin for later recycling
        await markUnknownFilesForRecycling(db, {
          classificationResult,
          movieId,
          entityType: 'movie',
        });

        // If cannot process automatically, flag for manual classification
        if (!decision.canProcess) {
          logger.warn('Movie requires manual classification', {
            movieId,
            movieDir,
            reason: decision.reason,
          });
          // TODO: Set flag in movies table for UI to show "needs manual classification"
        }

      } catch (error) {
        result.errors.push(`File classification failed: ${getErrorMessage(error)}`);
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
      } catch (error) {
        logger.warn('Failed to rehash movie file', { movieId, error: getErrorMessage(error) });
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
        } catch (error) {
          result.errors.push(`FFprobe failed: ${getErrorMessage(error)}`);
        }

        // Note: NFO regeneration will happen during enrichment job, not scan job
      }

      // RESCAN: Re-scan directory to pick up any new/changed files
      try {
        logger.info('Re-scanning movie directory', { movieId, movieDir });

        // Phase 1: Gather all facts (metadata extraction with FFprobe caching)
        const scanFacts = await gatherAllFacts(movieDir, dbManager);

        // Phase 2: Classify files based on facts
        const classificationResult = await classifyDirectory(scanFacts);

        // Phase 3: Check if we can process
        const decision = canProcessDirectory(classificationResult);

        logger.info('Re-scan complete', {
          movieId,
          status: classificationResult.status,
          totalFiles: classificationResult.totalFiles,
          totalClassified: classificationResult.totalClassified,
          totalUnknown: classificationResult.totalUnknown,
          canProcess: decision.canProcess,
        });

        // Update result stats
        result.assetsFound = {
          images: classificationResult.images.totalClassified,
          trailers: classificationResult.videos.trailers.length,
          subtitles: classificationResult.text.subtitles.length,
        };
        result.unknownFilesFound = classificationResult.totalUnknown;

        // TODO: Compare with existing cached files and update database
        // TODO: Store classification result for publish service

      } catch (error) {
        result.errors.push(`Re-scan failed: ${getErrorMessage(error)}`);
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
  } catch (error) {
    logger.error('Failed to scan movie directory', {
      movieDir,
      error: getErrorMessage(error),
    });
    result.errors.push(`Scan failed: ${getErrorMessage(error)}`);
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
  const values: SqlParam[] = [];

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
 * Find and prioritize NFO files in a movie directory
 *
 * Priority order:
 * 1. <moviefilename>.nfo - Highest priority (most specific)
 * 2. movie.nfo - Second priority (standard Kodi)
 * 3. movie.xml - Lowest priority (legacy format)
 *
 * @param movieDir Directory containing movie files
 * @param videoFilename Name of the main video file (for matching <filename>.nfo)
 * @returns Object containing prioritized NFO paths
 */
async function findAndPrioritizeMovieNfos(
  movieDir: string,
  videoFilename: string
): Promise<{
  all: string[];
  prioritized: string[];
  highestPriority: string | null;
}> {
  const fs = await import('fs/promises');
  const path = await import('path');

  try {
    const files = await fs.readdir(movieDir);
    const videoBasename = path.basename(videoFilename, path.extname(videoFilename));

    // Find all NFO candidates
    let matchingNfo: string | null = null;
    let movieNfo: string | null = null;
    let movieXml: string | null = null;
    const allNfos: string[] = [];

    for (const file of files) {
      const lowerFile = file.toLowerCase();
      const filePath = path.join(movieDir, file);

      // Priority 1: <videofilename>.nfo
      if (lowerFile === `${videoBasename.toLowerCase()}.nfo`) {
        matchingNfo = filePath;
        allNfos.push(filePath);
      }
      // Priority 2: movie.nfo
      else if (lowerFile === 'movie.nfo') {
        movieNfo = filePath;
        allNfos.push(filePath);
      }
      // Priority 3: movie.xml
      else if (lowerFile === 'movie.xml') {
        movieXml = filePath;
        allNfos.push(filePath);
      }
      // Other .nfo files (lowest priority, for gap filling only)
      else if (lowerFile.endsWith('.nfo')) {
        allNfos.push(filePath);
      }
    }

    // Build prioritized list
    const prioritized: string[] = [];
    if (matchingNfo) prioritized.push(matchingNfo);
    if (movieNfo) prioritized.push(movieNfo);
    if (movieXml) prioritized.push(movieXml);
    // Add any other .nfo files found
    for (const nfo of allNfos) {
      if (!prioritized.includes(nfo)) {
        prioritized.push(nfo);
      }
    }

    const highestPriority = prioritized.length > 0 ? prioritized[0] : null;

    logger.debug('NFO file discovery complete', {
      movieDir,
      videoBasename,
      found: allNfos.length,
      highestPriority: highestPriority ? path.basename(highestPriority) : 'none'
    });

    return {
      all: allNfos,
      prioritized,
      highestPriority
    };
  } catch (error) {
    logger.error(`Failed to find movie NFOs in ${movieDir}`, { error: getErrorMessage(error) });
    return {
      all: [],
      prioritized: [],
      highestPriority: null
    };
  }
}

