import fs from 'fs/promises';
import { parseStringPromise } from 'xml2js';
import { logger } from '../../middleware/logging.js';
import {
  ParsedMovieNFO,
  ParsedTVShowNFO,
  ParsedEpisodeNFO,
  NFOIds,
  FullMovieNFO,
  FullTVShowNFO,
  FullEpisodeNFO,
  ActorData,
  RatingData,
  SetData,
} from '../../types/models.js';

/**
 * Parse movie NFO files and extract IDs
 * Validates that all NFO files have consistent IDs (rejects if ambiguous)
 */
export async function parseMovieNfos(nfoPaths: string[]): Promise<ParsedMovieNFO> {
  if (nfoPaths.length === 0) {
    return {
      valid: false,
      ambiguous: false,
      error: 'No NFO files found',
    };
  }

  const allIds: NFOIds[] = [];

  // Parse all NFO files
  for (const nfoPath of nfoPaths) {
    try {
      const content = await fs.readFile(nfoPath, 'utf-8');
      const trimmedContent = content.trim();

      let ids: NFOIds = {};

      // Check if it's XML or URL-based
      if (trimmedContent.startsWith('<')) {
        // Parse XML NFO
        const parsed = await parseStringPromise(content);
        ids = extractMovieIds(parsed);
      } else {
        // Try to extract IDs from URLs
        ids = extractIdsFromUrls(trimmedContent);
        if (ids.tmdbId || ids.imdbId) {
          logger.debug(`Extracted IDs from URL-based NFO ${nfoPath}`, ids);
        }
      }

      if (ids.tmdbId || ids.imdbId) {
        allIds.push(ids);
      }
    } catch (error: any) {
      logger.debug(`Failed to parse NFO file ${nfoPath}`, { error: error.message });
    }
  }

  // No valid IDs found
  if (allIds.length === 0) {
    return {
      valid: false,
      ambiguous: false,
      error: 'No valid TMDB or IMDB IDs found in NFO files',
    };
  }

  // Check for conflicts
  const tmdbIds = allIds.filter(id => id.tmdbId).map(id => id.tmdbId);
  const imdbIds = allIds.filter(id => id.imdbId).map(id => id.imdbId);

  const uniqueTmdbIds = [...new Set(tmdbIds)];
  const uniqueImdbIds = [...new Set(imdbIds)];

  // Check for ambiguity
  if (uniqueTmdbIds.length > 1 || uniqueImdbIds.length > 1) {
    const result: ParsedMovieNFO = {
      valid: false,
      ambiguous: true,
      error: 'Multiple conflicting IDs found across NFO files',
    };
    if (uniqueTmdbIds.length === 1 && uniqueTmdbIds[0] !== undefined) {
      result.tmdbId = uniqueTmdbIds[0];
    }
    if (uniqueImdbIds.length === 1 && uniqueImdbIds[0] !== undefined) {
      result.imdbId = uniqueImdbIds[0];
    }
    return result;
  }

  // Valid and consistent IDs
  const result: ParsedMovieNFO = {
    valid: true,
    ambiguous: false,
  };
  if (uniqueTmdbIds[0] !== undefined) result.tmdbId = uniqueTmdbIds[0];
  if (uniqueImdbIds[0] !== undefined) result.imdbId = uniqueImdbIds[0];
  return result;
}

/**
 * Extract TMDB, TVDB, and IMDB IDs from URL-based NFO files
 * Parses URLs like:
 * - https://www.themoviedb.org/movie/177677
 * - https://www.themoviedb.org/tv/1234
 * - https://www.imdb.com/title/tt2381249
 * - https://www.thetvdb.com/series/12345
 */
function extractIdsFromUrls(content: string): NFOIds {
  const ids: NFOIds = {};
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    try {
      // Try to parse as URL
      const url = new URL(trimmedLine);

      // TMDB URL: https://www.themoviedb.org/movie/177677 or /tv/1234
      if (url.hostname.includes('themoviedb.org')) {
        const movieMatch = url.pathname.match(/\/movie\/(\d+)/);
        const tvMatch = url.pathname.match(/\/tv\/(\d+)/);

        if (movieMatch && movieMatch[1]) {
          const tmdbId = parseInt(movieMatch[1], 10);
          if (!isNaN(tmdbId)) {
            ids.tmdbId = tmdbId;
          }
        } else if (tvMatch && tvMatch[1]) {
          const tmdbId = parseInt(tvMatch[1], 10);
          if (!isNaN(tmdbId)) {
            ids.tmdbId = tmdbId;
          }
        }
      }

      // IMDB URL: https://www.imdb.com/title/tt2381249
      if (url.hostname.includes('imdb.com')) {
        const match = url.pathname.match(/\/title\/(tt\d+)/);
        if (match && match[1]) {
          ids.imdbId = match[1];
        }
      }

      // TVDB URL: https://www.thetvdb.com/series/12345 or https://thetvdb.com/?tab=series&id=12345
      if (url.hostname.includes('thetvdb.com')) {
        const seriesMatch = url.pathname.match(/\/series\/(\d+)/);
        const idParam = url.searchParams.get('id');

        if (seriesMatch && seriesMatch[1]) {
          const tvdbId = parseInt(seriesMatch[1], 10);
          if (!isNaN(tvdbId)) {
            ids.tvdbId = tvdbId;
          }
        } else if (idParam) {
          const tvdbId = parseInt(idParam, 10);
          if (!isNaN(tvdbId)) {
            ids.tvdbId = tvdbId;
          }
        }
      }
    } catch {
      // Not a valid URL, skip this line
      continue;
    }
  }

  return ids;
}

/**
 * Extract TMDB and IMDB IDs from parsed movie NFO XML
 */
function extractMovieIds(parsed: any): NFOIds {
  const ids: NFOIds = {};

  try {
    // Handle movie root element
    const movie = parsed.movie || parsed;

    // Extract TMDB ID
    if (movie.tmdbid && movie.tmdbid[0]) {
      const tmdbId = parseInt(movie.tmdbid[0], 10);
      if (!isNaN(tmdbId)) {
        ids.tmdbId = tmdbId;
      }
    }

    // Extract IMDB ID
    if (movie.imdbid && movie.imdbid[0]) {
      ids.imdbId = String(movie.imdbid[0]).trim();
    }

    // Also check <id> tags with source attribute
    if (movie.id && Array.isArray(movie.id)) {
      for (const idTag of movie.id) {
        if (typeof idTag === 'object' && idTag.$) {
          const source = idTag.$.source?.toLowerCase();
          const value = idTag._ || idTag;

          if (source === 'tmdb') {
            const tmdbId = parseInt(value, 10);
            if (!isNaN(tmdbId)) {
              ids.tmdbId = tmdbId;
            }
          } else if (source === 'imdb') {
            ids.imdbId = String(value).trim();
          }
        }
      }
    }

    // Check uniqueid tags (Kodi v18+)
    if (movie.uniqueid && Array.isArray(movie.uniqueid)) {
      for (const uniqueId of movie.uniqueid) {
        if (typeof uniqueId === 'object' && uniqueId.$) {
          const type = uniqueId.$.type?.toLowerCase();
          const value = uniqueId._ || uniqueId;

          if (type === 'tmdb') {
            const tmdbId = parseInt(value, 10);
            if (!isNaN(tmdbId)) {
              ids.tmdbId = tmdbId;
            }
          } else if (type === 'imdb') {
            ids.imdbId = String(value).trim();
          }
        }
      }
    }
  } catch (error: any) {
    logger.warn('Failed to extract IDs from parsed NFO', { error: error.message });
  }

  return ids;
}

/**
 * Parse tvshow.nfo and extract IDs
 */
export async function parseTVShowNfo(nfoPath: string): Promise<ParsedTVShowNFO> {
  try {
    const content = await fs.readFile(nfoPath, 'utf-8');
    const trimmedContent = content.trim();

    let ids: NFOIds = {};

    // Check if it's XML or URL-based
    if (trimmedContent.startsWith('<')) {
      // Parse XML NFO
      const parsed = await parseStringPromise(content);
      ids = extractTVShowIds(parsed);
    } else {
      // Try to extract IDs from URLs
      ids = extractIdsFromUrls(trimmedContent);
      if (ids.tmdbId || ids.imdbId || ids.tvdbId) {
        logger.debug(`Extracted IDs from URL-based tvshow.nfo ${nfoPath}`, ids);
      }
    }

    if (!ids.tmdbId && !ids.tvdbId && !ids.imdbId) {
      return {
        valid: false,
        ambiguous: false,
        error: 'No valid TMDB, TVDB, or IMDB IDs found',
      };
    }

    return {
      valid: true,
      ambiguous: false,
      ...ids,
    };
  } catch (error: any) {
    logger.debug(`Failed to parse tvshow.nfo: ${nfoPath}`, { error: error.message });
    return {
      valid: false,
      ambiguous: false,
      error: `Parse error: ${error.message}`,
    };
  }
}

/**
 * Extract TMDB, TVDB, and IMDB IDs from parsed TV show NFO XML
 */
function extractTVShowIds(parsed: any): NFOIds {
  const ids: NFOIds = {};

  try {
    const tvshow = parsed.tvshow || parsed;

    // Extract TMDB ID
    if (tvshow.tmdbid && tvshow.tmdbid[0]) {
      const tmdbId = parseInt(tvshow.tmdbid[0], 10);
      if (!isNaN(tmdbId)) {
        ids.tmdbId = tmdbId;
      }
    }

    // Extract TVDB ID
    if (tvshow.tvdbid && tvshow.tvdbid[0]) {
      const tvdbId = parseInt(tvshow.tvdbid[0], 10);
      if (!isNaN(tvdbId)) {
        ids.tvdbId = tvdbId;
      }
    }

    // Extract IMDB ID
    if (tvshow.imdbid && tvshow.imdbid[0]) {
      ids.imdbId = String(tvshow.imdbid[0]).trim();
    }

    // Check <id> tags with source attribute
    if (tvshow.id && Array.isArray(tvshow.id)) {
      for (const idTag of tvshow.id) {
        if (typeof idTag === 'object' && idTag.$) {
          const source = idTag.$.source?.toLowerCase();
          const value = idTag._ || idTag;

          if (source === 'tmdb') {
            const tmdbId = parseInt(value, 10);
            if (!isNaN(tmdbId)) {
              ids.tmdbId = tmdbId;
            }
          } else if (source === 'tvdb' || source === 'thetvdb') {
            const tvdbId = parseInt(value, 10);
            if (!isNaN(tvdbId)) {
              ids.tvdbId = tvdbId;
            }
          } else if (source === 'imdb') {
            ids.imdbId = String(value).trim();
          }
        }
      }
    }

    // Check uniqueid tags (Kodi v18+)
    if (tvshow.uniqueid && Array.isArray(tvshow.uniqueid)) {
      for (const uniqueId of tvshow.uniqueid) {
        if (typeof uniqueId === 'object' && uniqueId.$) {
          const type = uniqueId.$.type?.toLowerCase();
          const value = uniqueId._ || uniqueId;

          if (type === 'tmdb') {
            const tmdbId = parseInt(value, 10);
            if (!isNaN(tmdbId)) {
              ids.tmdbId = tmdbId;
            }
          } else if (type === 'tvdb' || type === 'thetvdb') {
            const tvdbId = parseInt(value, 10);
            if (!isNaN(tvdbId)) {
              ids.tvdbId = tvdbId;
            }
          } else if (type === 'imdb') {
            ids.imdbId = String(value).trim();
          }
        }
      }
    }
  } catch (error: any) {
    logger.warn('Failed to extract IDs from parsed TV show NFO', { error: error.message });
  }

  return ids;
}

/**
 * Parse episode NFO and extract season/episode numbers and IDs
 */
export async function parseEpisodeNfo(nfoPath: string): Promise<ParsedEpisodeNFO> {
  try {
    const content = await fs.readFile(nfoPath, 'utf-8');
    const parsed = await parseStringPromise(content);

    const episode = parsed.episodedetails || parsed;

    const result: ParsedEpisodeNFO = {
      valid: false,
    };

    // Extract season number
    if (episode.season && episode.season[0]) {
      const seasonNumber = parseInt(episode.season[0], 10);
      if (!isNaN(seasonNumber)) {
        result.seasonNumber = seasonNumber;
      }
    }

    // Extract episode number
    if (episode.episode && episode.episode[0]) {
      const episodeNumber = parseInt(episode.episode[0], 10);
      if (!isNaN(episodeNumber)) {
        result.episodeNumber = episodeNumber;
      }
    }

    // Must have both season and episode numbers
    if (result.seasonNumber === undefined || result.episodeNumber === undefined) {
      return {
        valid: false,
        error: 'Missing season or episode number',
      };
    }

    // Extract TMDB ID (optional)
    if (episode.tmdbid && episode.tmdbid[0]) {
      const tmdbId = parseInt(episode.tmdbid[0], 10);
      if (!isNaN(tmdbId)) {
        result.tmdbId = tmdbId;
      }
    }

    // Extract TVDB ID (optional)
    if (episode.tvdbid && episode.tvdbid[0]) {
      const tvdbId = parseInt(episode.tvdbid[0], 10);
      if (!isNaN(tvdbId)) {
        result.tvdbId = tvdbId;
      }
    }

    // Check uniqueid tags
    if (episode.uniqueid && Array.isArray(episode.uniqueid)) {
      for (const uniqueId of episode.uniqueid) {
        if (typeof uniqueId === 'object' && uniqueId.$) {
          const type = uniqueId.$.type?.toLowerCase();
          const value = uniqueId._ || uniqueId;

          if (type === 'tmdb') {
            const tmdbId = parseInt(value, 10);
            if (!isNaN(tmdbId)) {
              result.tmdbId = tmdbId;
            }
          } else if (type === 'tvdb' || type === 'thetvdb') {
            const tvdbId = parseInt(value, 10);
            if (!isNaN(tvdbId)) {
              result.tvdbId = tvdbId;
            }
          }
        }
      }
    }

    result.valid = true;
    return result;
  } catch (error: any) {
    logger.error(`Failed to parse episode NFO: ${nfoPath}`, { error: error.message });
    return {
      valid: false,
      error: `Parse error: ${error.message}`,
    };
  }
}

// ========================================
// Full Metadata Extraction Functions
// ========================================

/**
 * Parse movie NFO files and extract FULL metadata
 * This is the comprehensive version that extracts all metadata fields
 */
export async function parseFullMovieNfos(nfoPaths: string[]): Promise<FullMovieNFO> {
  if (nfoPaths.length === 0) {
    return {
      valid: false,
      ambiguous: false,
      error: 'No NFO files found',
    };
  }

  // For movies, typically there's one primary NFO
  // If multiple exist, we'll merge them (last one wins for scalars, combine for arrays)
  let mergedData: Partial<FullMovieNFO> = {
    valid: false,
    ambiguous: false,
  };

  const allIds: NFOIds[] = [];

  for (const nfoPath of nfoPaths) {
    try {
      const content = await fs.readFile(nfoPath, 'utf-8');
      const trimmedContent = content.trim();

      if (trimmedContent.startsWith('<')) {
        // Parse XML NFO
        const parsed = await parseStringPromise(content);
        const movieData = extractFullMovieMetadata(parsed);

        // Merge data
        mergedData = { ...mergedData, ...movieData };

        // Track IDs for ambiguity check
        if (movieData.tmdbId || movieData.imdbId) {
          const idObject: NFOIds = {};
          if (movieData.tmdbId !== undefined) idObject.tmdbId = movieData.tmdbId;
          if (movieData.imdbId !== undefined) idObject.imdbId = movieData.imdbId;
          allIds.push(idObject);
        }
      } else {
        // URL-based NFO (only has IDs)
        const ids = extractIdsFromUrls(trimmedContent);
        if (ids.tmdbId || ids.imdbId) {
          if (ids.tmdbId) mergedData.tmdbId = ids.tmdbId;
          if (ids.imdbId) mergedData.imdbId = ids.imdbId;
          allIds.push(ids);
        }
      }
    } catch (error: any) {
      logger.debug(`Failed to parse NFO file ${nfoPath}`, { error: error.message });
    }
  }

  // Check for ID conflicts
  if (allIds.length > 0) {
    const tmdbIds = allIds.filter(id => id.tmdbId).map(id => id.tmdbId);
    const imdbIds = allIds.filter(id => id.imdbId).map(id => id.imdbId);

    const uniqueTmdbIds = [...new Set(tmdbIds)];
    const uniqueImdbIds = [...new Set(imdbIds)];

    // Check for ambiguity
    if (uniqueTmdbIds.length > 1 || uniqueImdbIds.length > 1) {
      return {
        ...mergedData,
        valid: false,
        ambiguous: true,
        error: 'Multiple conflicting IDs found across NFO files',
        tmdbId: uniqueTmdbIds.length === 1 ? uniqueTmdbIds[0] : undefined,
        imdbId: uniqueImdbIds.length === 1 ? uniqueImdbIds[0] : undefined,
      } as FullMovieNFO;
    }

    // Valid IDs
    if (uniqueTmdbIds[0] !== undefined) mergedData.tmdbId = uniqueTmdbIds[0];
    if (uniqueImdbIds[0] !== undefined) mergedData.imdbId = uniqueImdbIds[0];
    mergedData.valid = true;
  }

  return mergedData as FullMovieNFO;
}

/**
 * Extract full movie metadata from parsed XML
 */
function extractFullMovieMetadata(parsed: any): Partial<FullMovieNFO> {
  const movie = parsed.movie || parsed;
  const metadata: Partial<FullMovieNFO> = {};

  try {
    // Extract IDs
    const ids = extractMovieIds(parsed);
    if (ids.tmdbId !== undefined) metadata.tmdbId = ids.tmdbId;
    if (ids.imdbId !== undefined) metadata.imdbId = ids.imdbId;

    // Scalars
    const title = extractText(movie.title);
    const originalTitle = extractText(movie.originaltitle);
    const sortTitle = extractText(movie.sorttitle);
    const plot = extractText(movie.plot);
    const outline = extractText(movie.outline);
    const tagline = extractText(movie.tagline);
    const mpaa = extractText(movie.mpaa);
    const trailerUrl = extractText(movie.trailer);
    const premiered = extractText(movie.premiered);

    if (title !== undefined) metadata.title = title;
    if (originalTitle !== undefined) metadata.originalTitle = originalTitle;
    if (sortTitle !== undefined) metadata.sortTitle = sortTitle;
    if (plot !== undefined) metadata.plot = plot;
    if (outline !== undefined) metadata.outline = outline;
    if (tagline !== undefined) metadata.tagline = tagline;
    if (mpaa !== undefined) metadata.mpaa = mpaa;
    if (trailerUrl !== undefined) metadata.trailerUrl = trailerUrl;
    if (premiered !== undefined) metadata.premiered = premiered;

    // Numbers
    const year = extractNumber(movie.year);
    const runtime = extractNumber(movie.runtime);
    const userRating = extractNumber(movie.userrating);

    if (year !== undefined) metadata.year = year;
    if (runtime !== undefined) metadata.runtime = runtime;
    if (userRating !== undefined) metadata.userRating = userRating;

    // Set info
    const setInfo = extractSetInfo(movie);
    if (setInfo !== undefined) metadata.set = setInfo;

    // Arrays
    const genres = extractArray(movie.genre);
    const directors = extractArray(movie.director);
    const credits = extractArray(movie.credits);
    const studios = extractArray(movie.studio);
    const countries = extractArray(movie.country);
    const tags = extractArray(movie.tag);

    if (genres !== undefined) metadata.genres = genres;
    if (directors !== undefined) metadata.directors = directors;
    if (credits !== undefined) metadata.credits = credits;
    if (studios !== undefined) metadata.studios = studios;
    if (countries !== undefined) metadata.countries = countries;
    if (tags !== undefined) metadata.tags = tags;

    // Complex structures
    const actors = extractActors(movie.actor);
    const ratings = extractRatings(movie.ratings);

    if (actors !== undefined) metadata.actors = actors;
    if (ratings !== undefined) metadata.ratings = ratings;
  } catch (error: any) {
    logger.warn('Error extracting full movie metadata', { error: error.message });
  }

  return metadata;
}

/**
 * Parse full TV show NFO
 */
export async function parseFullTVShowNfo(nfoPath: string): Promise<FullTVShowNFO> {
  try {
    const content = await fs.readFile(nfoPath, 'utf-8');
    const trimmedContent = content.trim();

    let metadata: Partial<FullTVShowNFO> = {
      valid: false,
      ambiguous: false,
    };

    if (trimmedContent.startsWith('<')) {
      // Parse XML NFO
      const parsed = await parseStringPromise(content);
      metadata = extractFullTVShowMetadata(parsed);
    } else {
      // URL-based NFO
      const ids = extractIdsFromUrls(trimmedContent);
      if (ids.tmdbId !== undefined) metadata.tmdbId = ids.tmdbId;
      if (ids.tvdbId !== undefined) metadata.tvdbId = ids.tvdbId;
      if (ids.imdbId !== undefined) metadata.imdbId = ids.imdbId;
    }

    if (metadata.tmdbId || metadata.tvdbId || metadata.imdbId) {
      metadata.valid = true;
    }

    return metadata as FullTVShowNFO;
  } catch (error: any) {
    logger.error(`Failed to parse tvshow.nfo: ${nfoPath}`, { error: error.message });
    return {
      valid: false,
      ambiguous: false,
      error: `Parse error: ${error.message}`,
    };
  }
}

/**
 * Extract full TV show metadata from parsed XML
 */
function extractFullTVShowMetadata(parsed: any): Partial<FullTVShowNFO> {
  const tvshow = parsed.tvshow || parsed;
  const metadata: Partial<FullTVShowNFO> = {};

  try {
    // Extract IDs
    const ids = extractTVShowIds(parsed);
    if (ids.tmdbId !== undefined) metadata.tmdbId = ids.tmdbId;
    if (ids.tvdbId !== undefined) metadata.tvdbId = ids.tvdbId;
    if (ids.imdbId !== undefined) metadata.imdbId = ids.imdbId;

    // Scalars
    const title = extractText(tvshow.title);
    const originalTitle = extractText(tvshow.originaltitle);
    const sortTitle = extractText(tvshow.sorttitle);
    const plot = extractText(tvshow.plot);
    const outline = extractText(tvshow.outline);
    const mpaa = extractText(tvshow.mpaa);
    const status = extractText(tvshow.status);
    const premiered = extractText(tvshow.premiered);

    if (title !== undefined) metadata.title = title;
    if (originalTitle !== undefined) metadata.originalTitle = originalTitle;
    if (sortTitle !== undefined) metadata.sortTitle = sortTitle;
    if (plot !== undefined) metadata.plot = plot;
    if (outline !== undefined) metadata.outline = outline;
    if (mpaa !== undefined) metadata.mpaa = mpaa;
    if (status !== undefined) metadata.status = status;
    if (premiered !== undefined) metadata.premiered = premiered;

    // Numbers
    const year = extractNumber(tvshow.year);
    const userRating = extractNumber(tvshow.userrating);

    if (year !== undefined) metadata.year = year;
    if (userRating !== undefined) metadata.userRating = userRating;

    // Arrays
    const genres = extractArray(tvshow.genre);
    const directors = extractArray(tvshow.director);
    const studios = extractArray(tvshow.studio);
    const tags = extractArray(tvshow.tag);

    if (genres !== undefined) metadata.genres = genres;
    if (directors !== undefined) metadata.directors = directors;
    if (studios !== undefined) metadata.studios = studios;
    if (tags !== undefined) metadata.tags = tags;

    // Complex structures
    const actors = extractActors(tvshow.actor);
    const ratings = extractRatings(tvshow.ratings);

    if (actors !== undefined) metadata.actors = actors;
    if (ratings !== undefined) metadata.ratings = ratings;
  } catch (error: any) {
    logger.warn('Error extracting full TV show metadata', { error: error.message });
  }

  return metadata;
}

/**
 * Parse full episode NFO
 */
export async function parseFullEpisodeNfo(nfoPath: string): Promise<FullEpisodeNFO> {
  try {
    const content = await fs.readFile(nfoPath, 'utf-8');
    const parsed = await parseStringPromise(content);

    const episode = parsed.episodedetails || parsed;
    const metadata: Partial<FullEpisodeNFO> = {
      valid: false,
    };

    // Extract season/episode numbers (required)
    const seasonNumber = extractNumber(episode.season);
    const episodeNumber = extractNumber(episode.episode);

    if (seasonNumber === undefined || episodeNumber === undefined) {
      return {
        valid: false,
        error: 'Missing season or episode number',
      } as FullEpisodeNFO;
    }

    // Assign required fields
    metadata.seasonNumber = seasonNumber;
    metadata.episodeNumber = episodeNumber;

    // Scalars
    const title = extractText(episode.title);
    const plot = extractText(episode.plot);
    const outline = extractText(episode.outline);
    const aired = extractText(episode.aired);
    const runtime = extractNumber(episode.runtime);
    const userRating = extractNumber(episode.userrating);
    const displaySeason = extractNumber(episode.displayseason);
    const displayEpisode = extractNumber(episode.displayepisode);

    if (title !== undefined) metadata.title = title;
    if (plot !== undefined) metadata.plot = plot;
    if (outline !== undefined) metadata.outline = outline;
    if (aired !== undefined) metadata.aired = aired;
    if (runtime !== undefined) metadata.runtime = runtime;
    if (userRating !== undefined) metadata.userRating = userRating;
    if (displaySeason !== undefined) metadata.displaySeason = displaySeason;
    if (displayEpisode !== undefined) metadata.displayEpisode = displayEpisode;

    // Arrays
    const directors = extractArray(episode.director);
    const credits = extractArray(episode.credits);

    if (directors !== undefined) metadata.directors = directors;
    if (credits !== undefined) metadata.credits = credits;

    // Complex structures
    const actors = extractActors(episode.actor);
    const ratings = extractRatings(episode.ratings);

    if (actors !== undefined) metadata.actors = actors;
    if (ratings !== undefined) metadata.ratings = ratings;

    metadata.valid = true;
    return metadata as FullEpisodeNFO;
  } catch (error: any) {
    logger.error(`Failed to parse episode NFO: ${nfoPath}`, { error: error.message });
    return {
      valid: false,
      error: `Parse error: ${error.message}`,
    };
  }
}

// ========================================
// Helper Extraction Functions
// ========================================

/**
 * Extract text from XML element
 */
function extractText(element: any): string | undefined {
  if (!element || !element[0]) return undefined;
  const text = String(element[0]).trim();
  return text.length > 0 ? text : undefined;
}

/**
 * Extract number from XML element
 */
function extractNumber(element: any): number | undefined {
  if (!element || !element[0]) return undefined;
  const num = parseInt(String(element[0]), 10);
  return isNaN(num) ? undefined : num;
}

/**
 * Extract array of strings from XML element
 */
function extractArray(element: any): string[] | undefined {
  if (!element || !Array.isArray(element)) return undefined;
  const arr = element
    .map((item: any) => String(item).trim())
    .filter((item: string) => item.length > 0);
  return arr.length > 0 ? arr : undefined;
}

/**
 * Extract set info from movie NFO
 */
function extractSetInfo(movie: any): SetData | undefined {
  if (!movie.set || !movie.set[0]) return undefined;

  const setElement = movie.set[0];
  const name = extractText(setElement.name);
  const overview = extractText(setElement.overview);

  if (!name) return undefined;

  const setData: SetData = { name };
  if (overview !== undefined) setData.overview = overview;
  return setData;
}

/**
 * Extract actors from NFO
 */
function extractActors(actorElements: any): ActorData[] | undefined {
  if (!actorElements || !Array.isArray(actorElements)) return undefined;

  const actors: ActorData[] = [];

  for (const actorEl of actorElements) {
    const name = extractText(actorEl.name);
    if (!name) continue;

    const actor: ActorData = { name };

    const role = extractText(actorEl.role);
    if (role) actor.role = role;

    const order = extractNumber(actorEl.order);
    if (order !== undefined) actor.order = order;

    const thumb = extractText(actorEl.thumb);
    if (thumb) actor.thumb = thumb;

    actors.push(actor);
  }

  return actors.length > 0 ? actors : undefined;
}

/**
 * Extract ratings from NFO
 */
function extractRatings(ratingsElement: any): RatingData[] | undefined {
  if (!ratingsElement || !ratingsElement[0]) return undefined;

  const ratingsContainer = ratingsElement[0];
  const ratings: RatingData[] = [];

  // Ratings can be structured as <ratings><rating name="..."><value>...</value></rating></ratings>
  if (ratingsContainer.rating && Array.isArray(ratingsContainer.rating)) {
    for (const ratingEl of ratingsContainer.rating) {
      const source = ratingEl.$?.name || 'default';
      const value = extractNumber(ratingEl.value);
      if (value === undefined) continue;

      const rating: RatingData = { source, value };

      const votes = extractNumber(ratingEl.votes);
      if (votes !== undefined) rating.votes = votes;

      const isDefault = ratingEl.$?.default === 'true';
      if (isDefault) rating.default = true;

      ratings.push(rating);
    }
  }

  return ratings.length > 0 ? ratings : undefined;
}
