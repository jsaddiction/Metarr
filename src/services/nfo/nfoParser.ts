import fs from 'fs/promises';
import path from 'path';
import { Parser } from 'xml2js';
import { logger } from '../../middleware/logging.js';
import { getErrorMessage } from '../../utils/errorHandling.js';
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
 * Secure XML parser with XXE protection
 * Prevents XML External Entity (XXE) attacks by disabling external entity resolution
 */
const secureXMLParser = new Parser({
  // XXE Protection: Disable external entity resolution
  strict: true,
  // Disable DTD processing to prevent entity expansion attacks
  // Note: xml2js doesn't expose SAX parser options directly, so we rely on strict mode
  // and input validation. For additional security, consider using a different parser
  // that provides more granular control over DTD/entity processing.
});

/**
 * Secure XML parsing with XXE protection
 * @param xml XML string to parse
 * @returns Parsed XML object
 */
async function parseXMLSecurely(xml: string): Promise<any> {
  // Additional XXE protection: Reject XML with suspicious patterns
  if (xml.includes('<!ENTITY') || xml.includes('<!DOCTYPE')) {
    throw new Error('XML contains potentially dangerous entity or DOCTYPE declarations');
  }
  return secureXMLParser.parseStringPromise(xml);
}

/**
 * NFO File metadata for intelligent merging
 */
interface NFOFileMetadata {
  path: string;
  fileName: string;
  priority: number;
  data: Partial<FullMovieNFO>;
  mtime?: Date;
}

/**
 * NFO File naming priority
 * Higher number = higher priority
 */
enum NFOPriority {
  UNKNOWN = 0,
  MOVIE_DOT_NFO = 10,      // movie.nfo (Jellyfin/Kodi fallback)
  ANY_FILENAME_NFO = 20,   // <anyname>.nfo
  EXACT_MATCH_NFO = 30,    // Exact video filename match (highest)
}

/**
 * Extract provider IDs from raw text using regex (fallback for malformed XML)
 */
function extractIdsFromRawText(rawText: string): NFOIds {
  const ids: NFOIds = {};

  // TMDB ID: <tmdbid>603</tmdbid> or <uniqueid type="tmdb">603</uniqueid>
  const tmdbMatch = rawText.match(/<(?:tmdbid|uniqueid[^>]*type="tmdb"[^>]*)>(\d+)/i);
  if (tmdbMatch) {
    const tmdbId = parseInt(tmdbMatch[1], 10);
    if (tmdbId > 0) {
      ids.tmdbId = tmdbId;
    }
  }

  // IMDB ID: <imdbid>tt0133093</imdbid> or <uniqueid type="imdb">tt0133093</uniqueid>
  const imdbMatch = rawText.match(/<(?:imdbid|uniqueid[^>]*type="imdb"[^>]*)>(tt\d{6,})/i);
  if (imdbMatch) {
    ids.imdbId = imdbMatch[1];
  }

  return ids;
}

/**
 * Determine NFO file priority based on naming convention
 * Requires video file basename for exact match detection
 */
function determineNFOPriority(nfoPath: string, videoBasename?: string): number {
  const fileName = path.basename(nfoPath);
  const fileNameLower = fileName.toLowerCase();

  // Exact video filename match (highest priority)
  if (videoBasename && fileName === `${videoBasename}.nfo`) {
    return NFOPriority.EXACT_MATCH_NFO;
  }

  // movie.nfo (Kodi/Jellyfin fallback)
  if (fileNameLower === 'movie.nfo' || fileNameLower === 'movie.txt') {
    return NFOPriority.MOVIE_DOT_NFO;
  }

  // Any other .nfo/.txt file
  if (fileNameLower.endsWith('.nfo') || fileNameLower.endsWith('.txt')) {
    return NFOPriority.ANY_FILENAME_NFO;
  }

  return NFOPriority.UNKNOWN;
}

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
        const parsed = await parseXMLSecurely(content);
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
    } catch (error) {
      logger.debug(`Failed to parse NFO file ${nfoPath}`, { error: getErrorMessage(error) });
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
      continue;
    }
  }

  return ids;
}

/**
 * Extract TMDB and IMDB IDs from parsed movie NFO XML
 */
function extractMovieIds(parsed: unknown): NFOIds {
  const ids: NFOIds = {};

  try {
    // Handle movie root element
    const parsedObj = parsed as { movie?: unknown; [key: string]: unknown };
    const movie = (parsedObj.movie || parsedObj) as { [key: string]: unknown };

    // Extract TMDB ID
    const tmdbid = movie.tmdbid as unknown[] | undefined;
    if (tmdbid && tmdbid[0]) {
      const tmdbId = parseInt(String(tmdbid[0]), 10);
      if (!isNaN(tmdbId)) {
        ids.tmdbId = tmdbId;
      }
    }

    // Extract IMDB ID
    const imdbid = movie.imdbid as unknown[] | undefined;
    if (imdbid && imdbid[0]) {
      ids.imdbId = String(imdbid[0]).trim();
    }

    // Also check <id> tags with source attribute
    const idArray = movie.id;
    if (idArray && Array.isArray(idArray)) {
      for (const idTag of idArray) {
        if (typeof idTag === 'object' && idTag !== null) {
          const tag = idTag as { $?: { source?: string }; _?: unknown; [key: string]: unknown };
          const source = tag.$?.source?.toLowerCase();
          const value = tag._ || idTag;

          if (source === 'tmdb') {
            const tmdbId = parseInt(String(value), 10);
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
  } catch (error) {
    logger.warn('Failed to extract IDs from parsed NFO', { error: getErrorMessage(error) });
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
      const parsed = await parseXMLSecurely(content);
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
  } catch (error) {
    logger.debug(`Failed to parse tvshow.nfo: ${nfoPath}`, { error: getErrorMessage(error) });
    return {
      valid: false,
      ambiguous: false,
      error: `Parse error: ${getErrorMessage(error)}`,
    };
  }
}

/**
 * Extract TMDB, TVDB, and IMDB IDs from parsed TV show NFO XML
 */
function extractTVShowIds(parsed: unknown): NFOIds {
  const ids: NFOIds = {};

  try {
    const parsedObj = parsed as { tvshow?: unknown; [key: string]: unknown };
    const tvshow = (parsedObj.tvshow || parsedObj) as { [key: string]: unknown };

    // Extract TMDB ID
    if (tvshow.tmdbid && Array.isArray(tvshow.tmdbid) && tvshow.tmdbid[0]) {
      const tmdbId = parseInt(tvshow.tmdbid[0], 10);
      if (!isNaN(tmdbId)) {
        ids.tmdbId = tmdbId;
      }
    }

    // Extract TVDB ID
    if (tvshow.tvdbid && Array.isArray(tvshow.tvdbid) && tvshow.tvdbid[0]) {
      const tvdbId = parseInt(tvshow.tvdbid[0], 10);
      if (!isNaN(tvdbId)) {
        ids.tvdbId = tvdbId;
      }
    }

    // Extract IMDB ID
    if (tvshow.imdbid && Array.isArray(tvshow.imdbid) && tvshow.imdbid[0]) {
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
  } catch (error) {
    logger.warn('Failed to extract IDs from parsed TV show NFO', { error: getErrorMessage(error) });
  }

  return ids;
}

/**
 * Parse episode NFO and extract season/episode numbers and IDs
 */
export async function parseEpisodeNfo(nfoPath: string): Promise<ParsedEpisodeNFO> {
  try {
    const content = await fs.readFile(nfoPath, 'utf-8');
    const parsed = await parseXMLSecurely(content);

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
  } catch (error) {
    logger.error(`Failed to parse episode NFO: ${nfoPath}`, { error: getErrorMessage(error) });
    return {
      valid: false,
      error: `Parse error: ${getErrorMessage(error)}`,
    };
  }
}

// ========================================
// Full Metadata Extraction Functions
// ========================================

/**
 * Parse movie NFO files and extract FULL metadata with intelligent merging
 *
 * This is the comprehensive version that:
 * 1. Extracts provider IDs with conflict resolution (Kodi-named files win)
 * 2. Falls back to regex extraction for malformed XML
 * 3. Intelligently merges metadata from multiple files
 * 4. Uses file modification time as last resort for conflicts
 *
 * @param nfoPaths - Array of NFO file paths to parse
 * @param videoBasename - Optional video filename (without extension) for exact match priority
 */
export async function parseFullMovieNfos(nfoPaths: string[], videoBasename?: string): Promise<FullMovieNFO> {
  if (nfoPaths.length === 0) {
    return {
      valid: false,
      ambiguous: false,
      error: 'No NFO files found',
    };
  }

  // Parse all NFO files with priority detection
  const parsedFiles: NFOFileMetadata[] = [];

  for (const nfoPath of nfoPaths) {
    try {
      const content = await fs.readFile(nfoPath, 'utf-8');
      const trimmedContent = content.trim();
      const stats = await fs.stat(nfoPath);
      let movieData: Partial<FullMovieNFO> = {};

      // Try XML parsing first
      if (trimmedContent.startsWith('<')) {
        try {
          const parsed = await parseXMLSecurely(content);
          movieData = extractFullMovieMetadata(parsed);
        } catch (xmlError: unknown) {
          // XML parse failed - fallback to regex extraction
          logger.debug(`XML parse failed for ${nfoPath}, attempting regex fallback`, {
            error: (xmlError as { message?: string }).message
          });
          const regexIds = extractIdsFromRawText(trimmedContent);
          if (regexIds.tmdbId || regexIds.imdbId) {
            movieData = regexIds;
          }
        }
      } else {
        // URL-based NFO (Radarr .txt format)
        const ids = extractIdsFromUrls(trimmedContent);
        if (ids.tmdbId || ids.imdbId) {
          movieData = ids;
        }
      }

      // Only include files that have at least some data
      if (Object.keys(movieData).length > 0) {
        parsedFiles.push({
          path: nfoPath,
          fileName: path.basename(nfoPath),
          priority: determineNFOPriority(nfoPath, videoBasename),
          data: movieData,
          mtime: stats.mtime,
        });
      }
    } catch (error) {
      logger.debug(`Failed to parse NFO file ${nfoPath}`, { error: getErrorMessage(error) });
    }
  }

  if (parsedFiles.length === 0) {
    logger.warn('No provider ID found in NFO files');
    return {
      valid: false,
      ambiguous: false,
      error: 'No valid data extracted from NFO files',
    };
  }

  // Sort by priority (highest first)
  parsedFiles.sort((a, b) => {
    if (b.priority !== a.priority) {
      return b.priority - a.priority;
    }
    // If priorities equal, use newest modification time
    if (a.mtime && b.mtime) {
      return b.mtime.getTime() - a.mtime.getTime();
    }
    return 0;
  });

  // Check for provider ID conflicts
  const filesWithIds = parsedFiles.filter(f => f.data.tmdbId || f.data.imdbId);

  if (filesWithIds.length > 1) {
    const tmdbIds = filesWithIds.map(f => f.data.tmdbId).filter(Boolean);
    const imdbIds = filesWithIds.map(f => f.data.imdbId).filter(Boolean);

    const uniqueTmdbIds = [...new Set(tmdbIds)];
    const uniqueImdbIds = [...new Set(imdbIds)];

    // Conflict detected - use highest priority file (Kodi-named wins)
    if (uniqueTmdbIds.length > 1 || uniqueImdbIds.length > 1) {
      const winner = filesWithIds[0]; // Highest priority file
      logger.warn('Provider ID conflict detected - using Kodi-named file', {
        winner: { file: winner.fileName, tmdbId: winner.data.tmdbId, priority: winner.priority },
        conflictingFiles: filesWithIds.slice(1).map(f => ({
          file: f.fileName,
          tmdbId: f.data.tmdbId
        }))
      });

      // Discard all files except the winner
      parsedFiles.length = 0;
      parsedFiles.push(winner);
    }
  }

  // Extract provider IDs from highest priority file
  const primaryFile = parsedFiles[0];
  const tmdbId = primaryFile.data.tmdbId;
  const imdbId = primaryFile.data.imdbId;

  if (!tmdbId && !imdbId) {
    logger.warn('No provider ID found in NFO files');
    // Still return metadata for UI display (title/year from directory name)
    return {
      valid: false,
      ambiguous: false,
      error: 'No provider ID found',
      ...mergeMetadata(parsedFiles),
    };
  }

  // Merge metadata from all files with matching provider IDs
  const mergedData = mergeMetadata(parsedFiles);

  return {
    ...mergedData,
    tmdbId,
    imdbId,
    valid: true,
    ambiguous: false,
  } as FullMovieNFO;
}

/**
 * Merge metadata from multiple NFO files with intelligent field-level rules
 * Kodi-named files take priority for scalars, arrays are merged with deduplication
 */
function mergeMetadata(files: NFOFileMetadata[]): Partial<FullMovieNFO> {
  if (files.length === 0) return {};
  if (files.length === 1) return files[0].data;

  const merged: Partial<FullMovieNFO> = {};
  const kodiFile = files[0]; // Highest priority file (sorted earlier)

  // SCALARS: Use Kodi-named file value, fill gaps from other files
  const scalarFields: (keyof FullMovieNFO)[] = [
    'title', 'originalTitle', 'sortTitle', 'year', 'plot', 'outline',
    'tagline', 'mpaa', 'premiered', 'runtime', 'userRating', 'trailerUrl'
  ];

  for (const field of scalarFields) {
    // Use Kodi value if present
    if (kodiFile.data[field] !== undefined) {
      // For plot/outline, prefer longest version
      if ((field === 'plot' || field === 'outline') && typeof kodiFile.data[field] === 'string') {
        (merged as any)[field] = kodiFile.data[field];

        // Check other files for longer versions
        for (const file of files.slice(1)) {
          if (typeof file.data[field] === 'string' &&
              (file.data[field] as string).length > ((merged as any)[field] as string).length) {
            (merged as any)[field] = file.data[field];
          }
        }
      } else {
        (merged as any)[field] = kodiFile.data[field];
      }
    } else {
      // Fill gap from other files
      for (const file of files) {
        if (file.data[field] !== undefined) {
          (merged as any)[field] = file.data[field];
          break;
        }
      }
    }
  }

  // ARRAYS: Intelligent union merge
  const actors = mergeActorsArray(files, kodiFile);
  if (actors !== undefined) merged.actors = actors;

  const directors = mergeStringArray(files.map(f => f.data.directors || []));
  if (directors !== undefined) merged.directors = directors;

  const credits = mergeStringArray(files.map(f => f.data.credits || []));
  if (credits !== undefined) merged.credits = credits;

  const genres = mergeStringArray(files.map(f => f.data.genres || []));
  if (genres !== undefined) merged.genres = genres;

  const studios = mergeStringArray(files.map(f => f.data.studios || []));
  if (studios !== undefined) merged.studios = studios;

  const countries = mergeStringArray(files.map(f => f.data.countries || []));
  if (countries !== undefined) merged.countries = countries;

  const tags = mergeStringArray(files.map(f => f.data.tags || []));
  if (tags !== undefined) merged.tags = tags;

  const ratings = mergeRatingsArray(files.map(f => f.data.ratings || []));
  if (ratings !== undefined) merged.ratings = ratings;

  // SET INFO: Prefer complete data (with overview)
  const setInfos = files.map(f => f.data.set).filter(Boolean) as SetData[];
  if (setInfos.length > 0) {
    merged.set = setInfos.find(s => s.overview) || setInfos[0];
  }

  return merged;
}

/**
 * Merge actor arrays with deduplication by name
 * Kodi file roles/orders take priority
 */
function mergeActorsArray(files: NFOFileMetadata[], kodiFile: NFOFileMetadata): ActorData[] | undefined {
  const actorMap = new Map<string, ActorData>();
  const kodiActors = kodiFile.data.actors || [];

  // First, add all Kodi actors (highest priority)
  for (const actor of kodiActors) {
    actorMap.set(actor.name, actor);
  }

  // Then merge actors from other files (don't overwrite Kodi data)
  for (const file of files) {
    if (file === kodiFile) continue;

    for (const actor of file.data.actors || []) {
      if (!actorMap.has(actor.name)) {
        actorMap.set(actor.name, actor);
      }
    }
  }

  const actors = Array.from(actorMap.values());
  return actors.length > 0 ? actors.sort((a, b) => (a.order ?? 999) - (b.order ?? 999)) : undefined;
}

/**
 * Merge string arrays with deduplication
 */
function mergeStringArray(arrays: string[][]): string[] | undefined {
  const uniqueSet = new Set<string>();

  for (const arr of arrays) {
    for (const item of arr) {
      uniqueSet.add(item);
    }
  }

  const result = Array.from(uniqueSet);
  return result.length > 0 ? result : undefined;
}

/**
 * Merge ratings arrays, keeping highest votes per source
 */
function mergeRatingsArray(arrays: RatingData[][]): RatingData[] | undefined {
  const ratingMap = new Map<string, RatingData>();

  for (const arr of arrays) {
    for (const rating of arr) {
      const existing = ratingMap.get(rating.source);

      if (!existing || (rating.votes && (!existing.votes || rating.votes > existing.votes))) {
        ratingMap.set(rating.source, rating);
      }
    }
  }

  const result = Array.from(ratingMap.values());
  return result.length > 0 ? result : undefined;
}

/**
 * Extract full movie metadata from parsed XML
 */
function extractFullMovieMetadata(parsed: unknown): Partial<FullMovieNFO> {
  const parsedObj = parsed as { movie?: unknown; [key: string]: unknown };
  const movie = (parsedObj.movie || parsedObj) as { [key: string]: unknown };
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
  } catch (error) {
    logger.warn('Error extracting full movie metadata', { error: getErrorMessage(error) });
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
      const parsed = await parseXMLSecurely(content);
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
  } catch (error) {
    logger.error(`Failed to parse tvshow.nfo: ${nfoPath}`, { error: getErrorMessage(error) });
    return {
      valid: false,
      ambiguous: false,
      error: `Parse error: ${getErrorMessage(error)}`,
    };
  }
}

/**
 * Extract full TV show metadata from parsed XML
 */
function extractFullTVShowMetadata(parsed: unknown): Partial<FullTVShowNFO> {
  const parsedObj = parsed as { tvshow?: unknown; [key: string]: unknown };
  const tvshow = (parsedObj.tvshow || parsedObj) as { [key: string]: unknown };
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
  } catch (error) {
    logger.warn('Error extracting full TV show metadata', { error: getErrorMessage(error) });
  }

  return metadata;
}

/**
 * Parse full episode NFO
 */
export async function parseFullEpisodeNfo(nfoPath: string): Promise<FullEpisodeNFO> {
  try {
    const content = await fs.readFile(nfoPath, 'utf-8');
    const parsed = await parseXMLSecurely(content);

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
  } catch (error) {
    logger.error(`Failed to parse episode NFO: ${nfoPath}`, { error: getErrorMessage(error) });
    return {
      valid: false,
      error: `Parse error: ${getErrorMessage(error)}`,
    };
  }
}

// ========================================
// Helper Extraction Functions
// ========================================

/**
 * Extract text from XML element
 */
function extractText(element: unknown): string | undefined {
  if (!element || !Array.isArray(element) || !element[0]) return undefined;
  const text = String(element[0]).trim();
  return text.length > 0 ? text : undefined;
}

/**
 * Extract number from XML element
 */
function extractNumber(element: unknown): number | undefined {
  if (!element || !Array.isArray(element) || !element[0]) return undefined;
  const num = parseInt(String(element[0]), 10);
  return isNaN(num) ? undefined : num;
}

/**
 * Extract array of strings from XML element
 */
function extractArray(element: unknown): string[] | undefined {
  if (!element || !Array.isArray(element)) return undefined;
  const arr = element
    .map((item: unknown) => String(item).trim())
    .filter((item: string) => item.length > 0);
  return arr.length > 0 ? arr : undefined;
}

/**
 * Extract set info from movie NFO
 */
function extractSetInfo(movie: unknown): SetData | undefined {
  const m = movie as { [key: string]: unknown }; if (!m.set || !Array.isArray(m.set) || !m.set[0]) return undefined;

  const setElement = m.set[0];
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
function extractActors(actorElements: unknown): ActorData[] | undefined {
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
function extractRatings(ratingsElement: unknown): RatingData[] | undefined {
  if (!ratingsElement || !Array.isArray(ratingsElement) || !ratingsElement[0]) return undefined;

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
