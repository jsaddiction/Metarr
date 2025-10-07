import path from 'path';
import fs from 'fs/promises';
import { logger } from '../../middleware/logging.js';
import { DatabaseConnection } from '../../types/database.js';
import { DatabaseManager } from '../../database/DatabaseManager.js';
import {
  hashDirectoryFingerprint,
  hasDirectoryChanged,
  hasNfoChanged,
  hasVideoChanged,
  hashFile,
} from '../hash/hashService.js';
import { parseFullMovieNfos } from '../nfo/nfoParser.js';
import { generateMovieNFOFromDatabase } from '../nfo/nfoGenerator.js';
import { extractAndStoreMediaInfo } from '../media/ffprobeService.js';
import { discoverAndStoreAssets } from '../media/assetDiscovery.js';
import { detectAndStoreUnknownFiles } from '../media/unknownFilesDetection.js';
import { IgnorePatternService } from '../ignorePatternService.js';
import { findOrCreateMovie, MovieLookupContext } from './movieLookupService.js';
import { tmdbService } from '../providers/TMDBService.js';

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
          // If we have a TMDB ID, enrich metadata from TMDB
          if (nfoData.tmdbId && tmdbService.isEnabled()) {
            try {
              logger.info(`Fetching metadata from TMDB for movie ${nfoData.tmdbId}`, { movieId });
              const tmdbClient = tmdbService.getClient();
              const tmdbMovie = await tmdbClient.getMovie(nfoData.tmdbId, {
                appendToResponse: ['credits', 'release_dates', 'keywords'],
              });

              // Merge TMDB data with NFO data (NFO takes precedence for existing fields)
              metadataToStore = mergeTmdbWithNfo(tmdbMovie, nfoData);
              logger.info(`Enriched metadata from TMDB`, {
                movieId,
                title: metadataToStore.title,
                year: metadataToStore.year,
              });
            } catch (error: any) {
              logger.warn(`Failed to fetch TMDB metadata, using NFO data only`, {
                movieId,
                tmdbId: nfoData.tmdbId,
                error: error.message,
              });
              metadataToStore = nfoData;
            }
          } else {
            // No TMDB ID or TMDB disabled, use NFO data as-is
            metadataToStore = nfoData;
          }

          // Store metadata in database
          logger.info(`Storing metadata in database`, {
            movieId,
            title: metadataToStore.title,
            year: metadataToStore.year,
          });
          await storeMovieMetadata(db, movieId, metadataToStore);

          // Generate clean NFO from database (database is source of truth)
          await generateMovieNFOFromDatabase(db, movieId, movieDir);

          // Hash the generated NFO
          const nfoPath = path.join(movieDir, 'movie.nfo');
          try {
            const { hash } = await hashFile(nfoPath);
            await db.execute(`UPDATE movies SET nfo_hash = ? WHERE id = ?`, [hash, movieId]);
          } catch (error: any) {
            logger.warn('Failed to hash generated NFO', { error: error.message });
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

      // Hash directory fingerprint
      const dirHashResult = await hashDirectoryFingerprint(movieDir);
      await db.execute(`UPDATE movies SET directory_hash = ? WHERE id = ?`, [
        dirHashResult.directoryHash,
        movieId,
      ]);

      // Hash video file
      const videoHashResult = await hashFile(videoFilePath);
      await db.execute(`UPDATE movies SET video_hash = ? WHERE id = ?`, [
        videoHashResult.hash,
        movieId,
      ]);

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
          images: assets.images.length,
          trailers: assets.trailers.length,
          subtitles: assets.subtitles.length,
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

      // Check directory fingerprint (quick check)
      const existingMovie = lookupResult.movie;
      const dirChanged = await hasDirectoryChanged(movieDir, existingMovie.directory_hash);
      result.directoryChanged = dirChanged;

      if (!dirChanged && !result.pathChanged) {
        logger.debug('Directory unchanged, skipping detailed scan', { movieId });
        return result;
      }

      // Directory changed - check what changed
      logger.debug('Directory changed, checking components', { movieId });

      // Update directory hash
      const dirHashResult = await hashDirectoryFingerprint(movieDir);
      await db.execute(`UPDATE movies SET directory_hash = ? WHERE id = ?`, [
        dirHashResult.directoryHash,
        movieId,
      ]);

      // Check NFO file
      const nfoPath = path.join(movieDir, 'movie.nfo');
      try {
        const nfoChanged = await hasNfoChanged(nfoPath, existingMovie.nfo_hash);
        result.nfoChanged = nfoChanged;

        if (nfoChanged) {
          logger.info('NFO file modified externally, regenerating from database', { movieId });

          // Regenerate NFO from database (database is source of truth)
          await generateMovieNFOFromDatabase(db, movieId, movieDir);

          // Update NFO hash
          const { hash } = await hashFile(nfoPath);
          await db.execute(`UPDATE movies SET nfo_hash = ? WHERE id = ?`, [hash, movieId]);

          result.nfoRegenerated = true;
        }
      } catch (error: any) {
        logger.warn('NFO check failed', { movieId, error: error.message });
      }

      // Check video file
      try {
        const videoChanged = await hasVideoChanged(videoFilePath, existingMovie.video_hash);
        result.videoChanged = videoChanged;

        if (videoChanged) {
          logger.info('Video file changed, re-extracting streams', { movieId });

          // Update video hash
          const videoHashResult = await hashFile(videoFilePath);
          await db.execute(`UPDATE movies SET video_hash = ? WHERE id = ?`, [
            videoHashResult.hash,
            movieId,
          ]);

          // Re-extract stream details
          try {
            await extractAndStoreMediaInfo(db, 'movie', movieId, videoFilePath);
            result.streamsExtracted = true;
          } catch (error: any) {
            result.errors.push(`FFprobe failed: ${error.message}`);
          }
        }
      } catch (error: any) {
        logger.warn('Video check failed', { movieId, error: error.message });
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
          images: assets.images.length,
          trailers: assets.trailers.length,
          subtitles: assets.subtitles.length,
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
      mpaa = ?,
      premiered = ?,
      tmdb_id = ?,
      imdb_id = ?,
      status = ?,
      nfo_parsed_at = CURRENT_TIMESTAMP
    WHERE id = ?`,
    [
      nfoData.title,
      nfoData.originalTitle,
      nfoData.sortTitle,
      nfoData.year,
      nfoData.plot,
      nfoData.tagline,
      nfoData.mpaa,
      nfoData.premiered,
      nfoData.tmdbId,
      nfoData.imdbId,
      'identified',
      movieId,
    ]
  );

  // Store genres
  if (nfoData.genres && nfoData.genres.length > 0) {
    for (const genreName of nfoData.genres) {
      // Get or create genre
      const genreResults = await db.query(`SELECT id FROM genres WHERE name = ?`, [genreName]);
      let genre = genreResults.length > 0 ? genreResults[0] : null;
      if (!genre) {
        const result = await db.execute(`INSERT INTO genres (name) VALUES (?)`, [genreName]);
        genre = { id: result.insertId };
      }

      // Link to movie
      await db.execute(`INSERT OR IGNORE INTO movies_genres (movie_id, genre_id) VALUES (?, ?)`, [
        movieId,
        genre.id,
      ]);
    }
  }

  // Store directors
  if (nfoData.directors && nfoData.directors.length > 0) {
    for (const directorName of nfoData.directors) {
      const directorResults = await db.query(`SELECT id FROM directors WHERE name = ?`, [
        directorName,
      ]);
      let director = directorResults.length > 0 ? directorResults[0] : null;
      if (!director) {
        const result = await db.execute(`INSERT INTO directors (name) VALUES (?)`, [directorName]);
        director = { id: result.insertId };
      }

      await db.execute(
        `INSERT OR IGNORE INTO movies_directors (movie_id, director_id) VALUES (?, ?)`,
        [movieId, director.id]
      );
    }
  }

  // Store writers
  if (nfoData.credits && nfoData.credits.length > 0) {
    for (const writerName of nfoData.credits) {
      const writerResults = await db.query(`SELECT id FROM writers WHERE name = ?`, [writerName]);
      let writer = writerResults.length > 0 ? writerResults[0] : null;
      if (!writer) {
        const result = await db.execute(`INSERT INTO writers (name) VALUES (?)`, [writerName]);
        writer = { id: result.insertId };
      }

      await db.execute(`INSERT OR IGNORE INTO movies_writers (movie_id, writer_id) VALUES (?, ?)`, [
        movieId,
        writer.id,
      ]);
    }
  }

  // Store actors
  if (nfoData.actors && nfoData.actors.length > 0) {
    for (const actorData of nfoData.actors) {
      const actorResults = await db.query(`SELECT id FROM actors WHERE name = ?`, [actorData.name]);
      let actor = actorResults.length > 0 ? actorResults[0] : null;
      if (!actor) {
        const result = await db.execute(`INSERT INTO actors (name, thumb_url) VALUES (?, ?)`, [
          actorData.name,
          actorData.thumb,
        ]);
        actor = { id: result.insertId };
      }

      await db.execute(
        `INSERT OR IGNORE INTO movies_actors (movie_id, actor_id, role, \`order\`) VALUES (?, ?, ?, ?)`,
        [movieId, actor.id, actorData.role, actorData.order]
      );
    }
  }

  // Store ratings
  if (nfoData.ratings && nfoData.ratings.length > 0) {
    for (const rating of nfoData.ratings) {
      await db.execute(
        `INSERT INTO ratings (entity_type, entity_id, source, value, votes, is_default)
         VALUES (?, ?, ?, ?, ?, ?)`,
        ['movie', movieId, rating.source, rating.value, rating.votes || 0, rating.default ? 1 : 0]
      );
    }
  }

  // Store studios
  if (nfoData.studios && nfoData.studios.length > 0) {
    for (const studioName of nfoData.studios) {
      const studioResults = await db.query(`SELECT id FROM studios WHERE name = ?`, [studioName]);
      let studio = studioResults.length > 0 ? studioResults[0] : null;
      if (!studio) {
        const result = await db.execute(`INSERT INTO studios (name) VALUES (?)`, [studioName]);
        studio = { id: result.insertId };
      }

      await db.execute(`INSERT OR IGNORE INTO movies_studios (movie_id, studio_id) VALUES (?, ?)`, [
        movieId,
        studio.id,
      ]);
    }
  }

  // Store countries
  if (nfoData.countries && nfoData.countries.length > 0) {
    for (const countryName of nfoData.countries) {
      const countryResults = await db.query(`SELECT id FROM countries WHERE name = ?`, [
        countryName,
      ]);
      let country = countryResults.length > 0 ? countryResults[0] : null;
      if (!country) {
        const result = await db.execute(`INSERT INTO countries (name) VALUES (?)`, [countryName]);
        country = { id: result.insertId };
      }

      await db.execute(
        `INSERT OR IGNORE INTO movies_countries (movie_id, country_id) VALUES (?, ?)`,
        [movieId, country.id]
      );
    }
  }

  // Store tags
  if (nfoData.tags && nfoData.tags.length > 0) {
    for (const tagName of nfoData.tags) {
      const tagResults = await db.query(`SELECT id FROM tags WHERE name = ?`, [tagName]);
      let tag = tagResults.length > 0 ? tagResults[0] : null;
      if (!tag) {
        const result = await db.execute(`INSERT INTO tags (name) VALUES (?)`, [tagName]);
        tag = { id: result.insertId };
      }

      await db.execute(`INSERT OR IGNORE INTO movies_tags (movie_id, tag_id) VALUES (?, ?)`, [
        movieId,
        tag.id,
      ]);
    }
  }

  // Store set/collection
  if (nfoData.set && nfoData.set.name) {
    const setResults = await db.query(`SELECT id FROM sets WHERE name = ?`, [nfoData.set.name]);
    let set = setResults.length > 0 ? setResults[0] : null;
    if (!set) {
      const result = await db.execute(`INSERT INTO sets (name, overview) VALUES (?, ?)`, [
        nfoData.set.name,
        nfoData.set.overview,
      ]);
      set = { id: result.insertId };
    }

    await db.execute(`UPDATE movies SET set_id = ? WHERE id = ?`, [set.id, movieId]);
  }
}

/**
 * Merge TMDB movie data with NFO data
 * NFO data takes precedence for fields that are present
 */
function mergeTmdbWithNfo(tmdbMovie: any, nfoData: any): any {
  const merged: any = {
    ...nfoData, // Start with NFO data
  };

  // TMDB provides these if not in NFO
  if (!merged.title && tmdbMovie.title) merged.title = tmdbMovie.title;
  if (!merged.originalTitle && tmdbMovie.original_title) merged.originalTitle = tmdbMovie.original_title;
  if (!merged.year && tmdbMovie.release_date) {
    merged.year = parseInt(tmdbMovie.release_date.split('-')[0]);
  }
  if (!merged.plot && tmdbMovie.overview) merged.plot = tmdbMovie.overview;
  if (!merged.tagline && tmdbMovie.tagline) merged.tagline = tmdbMovie.tagline;
  if (!merged.premiered && tmdbMovie.release_date) merged.premiered = tmdbMovie.release_date;
  if (!merged.runtime && tmdbMovie.runtime) merged.runtime = tmdbMovie.runtime;

  // Genres from TMDB
  if ((!merged.genres || merged.genres.length === 0) && tmdbMovie.genres) {
    merged.genres = tmdbMovie.genres.map((g: any) => g.name);
  }

  // Production companies (studios)
  if ((!merged.studios || merged.studios.length === 0) && tmdbMovie.production_companies) {
    merged.studios = tmdbMovie.production_companies.map((c: any) => c.name);
  }

  // Production countries
  if ((!merged.countries || merged.countries.length === 0) && tmdbMovie.production_countries) {
    merged.countries = tmdbMovie.production_countries.map((c: any) => c.name);
  }

  // Credits (cast and crew)
  if (tmdbMovie.credits) {
    // Actors
    if ((!merged.actors || merged.actors.length === 0) && tmdbMovie.credits.cast) {
      merged.actors = tmdbMovie.credits.cast.slice(0, 20).map((actor: any, index: number) => ({
        name: actor.name,
        role: actor.character,
        order: index,
        thumb: actor.profile_path ? `https://image.tmdb.org/t/p/original${actor.profile_path}` : undefined,
      }));
    }

    // Directors
    if ((!merged.directors || merged.directors.length === 0) && tmdbMovie.credits.crew) {
      const directors = tmdbMovie.credits.crew.filter((c: any) => c.job === 'Director');
      if (directors.length > 0) {
        merged.directors = directors.map((d: any) => d.name);
      }
    }

    // Writers
    if ((!merged.credits || merged.credits.length === 0) && tmdbMovie.credits.crew) {
      const writers = tmdbMovie.credits.crew.filter(
        (c: any) => c.department === 'Writing'
      );
      if (writers.length > 0) {
        merged.credits = writers.map((w: any) => w.name);
      }
    }
  }

  // Ratings
  if ((!merged.ratings || merged.ratings.length === 0) && tmdbMovie.vote_average) {
    merged.ratings = [
      {
        source: 'tmdb',
        value: tmdbMovie.vote_average,
        votes: tmdbMovie.vote_count,
        default: true,
      },
    ];
  }

  // Collection/Set
  if (!merged.set && tmdbMovie.belongs_to_collection) {
    merged.set = {
      name: tmdbMovie.belongs_to_collection.name,
      overview: tmdbMovie.belongs_to_collection.overview,
    };
  }

  // MPAA rating from release_dates
  if (!merged.mpaa && tmdbMovie.release_dates?.results) {
    const usRelease = tmdbMovie.release_dates.results.find((r: any) => r.iso_3166_1 === 'US');
    if (usRelease && usRelease.release_dates && usRelease.release_dates.length > 0) {
      const certification = usRelease.release_dates[0].certification;
      if (certification) {
        merged.mpaa = certification;
      }
    }
  }

  return merged;
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
