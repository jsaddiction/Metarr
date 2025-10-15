import fs from 'fs/promises';
import path from 'path';
import { Builder } from 'xml2js';
import { logger } from '../../middleware/logging.js';
import { DatabaseConnection } from '../../types/database.js';

/**
 * NFO Generation Service
 *
 * Generates clean, Kodi-compatible NFO files from database metadata
 * Database is source of truth - NFO files are generated for player compatibility
 *
 * Used in two scenarios:
 * 1. After first scan: Parse external NFO → Store in DB → Write clean NFO
 * 2. After detecting external changes: Hash mismatch → Regenerate NFO from DB
 */

interface MovieNFOData {
  title?: string;
  originalTitle?: string;
  sortTitle?: string;
  year?: number;
  plot?: string;
  tagline?: string;
  mpaa?: string;
  premiered?: string;
  runtime?: number;
  tmdbId?: number;
  imdbId?: string;
  userRating?: number;
  genres?: string[];
  directors?: string[];
  writers?: string[];
  studios?: string[];
  countries?: string[];
  tags?: string[];
  actors?: Array<{
    name: string;
    role?: string;
    order?: number;
    thumb?: string;
  }>;
  ratings?: Array<{
    source: string;
    value: number;
    votes?: number;
    isDefault?: boolean;
  }>;
  set?: {
    name: string;
    overview?: string;
  };
}

interface TVShowNFOData {
  title?: string;
  originalTitle?: string;
  sortTitle?: string;
  year?: number;
  plot?: string;
  mpaa?: string;
  status?: string;
  premiered?: string;
  tmdbId?: number;
  tvdbId?: number;
  imdbId?: string;
  userRating?: number;
  genres?: string[];
  directors?: string[];
  studios?: string[];
  tags?: string[];
  actors?: Array<{
    name: string;
    role?: string;
    order?: number;
    thumb?: string;
  }>;
  ratings?: Array<{
    source: string;
    value: number;
    votes?: number;
    isDefault?: boolean;
  }>;
}

interface EpisodeNFOData {
  seasonNumber: number;
  episodeNumber: number;
  displaySeason?: number;
  displayEpisode?: number;
  title?: string;
  plot?: string;
  aired?: string;
  runtime?: number;
  userRating?: number;
  directors?: string[];
  writers?: string[];
  actors?: Array<{
    name: string;
    role?: string;
    order?: number;
    thumb?: string;
  }>;
  ratings?: Array<{
    source: string;
    value: number;
    votes?: number;
    isDefault?: boolean;
  }>;
}

const xmlBuilder = new Builder({
  rootName: 'movie',
  xmldec: { version: '1.0', encoding: 'UTF-8', standalone: true },
  renderOpts: { pretty: true, indent: '  ' },
});

/**
 * Generate movie NFO file from database data
 * Follows Kodi NFO format specification
 */
export async function generateMovieNFO(movieDir: string, data: MovieNFOData): Promise<string> {
  try {
    const nfoObj: any = {};

    // Title (required for display)
    if (data.title) nfoObj.title = data.title;

    // Provider IDs (Kodi v18+ format with uniqueid)
    if (data.tmdbId || data.imdbId) {
      nfoObj.uniqueid = [];

      if (data.tmdbId) {
        nfoObj.uniqueid.push({
          $: { type: 'tmdb', default: 'true' },
          _: data.tmdbId,
        });
      }

      if (data.imdbId) {
        nfoObj.uniqueid.push({
          $: { type: 'imdb', default: data.tmdbId ? 'false' : 'true' },
          _: data.imdbId,
        });
      }
    }

    // Basic metadata
    if (data.originalTitle) nfoObj.originaltitle = data.originalTitle;
    if (data.sortTitle) nfoObj.sorttitle = data.sortTitle;
    if (data.year) nfoObj.year = data.year;
    if (data.plot) nfoObj.plot = data.plot;
    if (data.tagline) nfoObj.tagline = data.tagline;
    if (data.mpaa) nfoObj.mpaa = data.mpaa;
    if (data.premiered) nfoObj.premiered = data.premiered;
    if (data.runtime) nfoObj.runtime = data.runtime;
    if (data.userRating) nfoObj.userrating = data.userRating;

    // Arrays
    if (data.genres && data.genres.length > 0) {
      nfoObj.genre = data.genres;
    }

    if (data.directors && data.directors.length > 0) {
      nfoObj.director = data.directors;
    }

    if (data.writers && data.writers.length > 0) {
      nfoObj.credits = data.writers;
    }

    if (data.studios && data.studios.length > 0) {
      nfoObj.studio = data.studios;
    }

    if (data.countries && data.countries.length > 0) {
      nfoObj.country = data.countries;
    }

    if (data.tags && data.tags.length > 0) {
      nfoObj.tag = data.tags;
    }

    // Actors
    if (data.actors && data.actors.length > 0) {
      nfoObj.actor = data.actors.map(actor => {
        const actorObj: any = { name: actor.name };
        if (actor.role) actorObj.role = actor.role;
        if (actor.order !== undefined) actorObj.order = actor.order;
        if (actor.thumb) actorObj.thumb = actor.thumb;
        return actorObj;
      });
    }

    // Ratings
    if (data.ratings && data.ratings.length > 0) {
      nfoObj.ratings = {
        rating: data.ratings.map(rating => ({
          $: {
            name: rating.source,
            default: rating.isDefault ? 'true' : 'false',
          },
          value: rating.value,
          votes: rating.votes || 0,
        })),
      };
    }

    // Set/Collection
    if (data.set) {
      nfoObj.set = {
        name: data.set.name,
      };
      if (data.set.overview) {
        nfoObj.set.overview = data.set.overview;
      }
    }

    // Build XML
    const xml = xmlBuilder.buildObject(nfoObj);

    // Write to file
    const nfoPath = path.join(movieDir, 'movie.nfo');
    await fs.writeFile(nfoPath, xml, 'utf-8');

    logger.debug('Generated movie NFO', { nfoPath });
    return nfoPath;
  } catch (error: any) {
    logger.error('Failed to generate movie NFO', {
      movieDir,
      error: error.message,
    });
    throw new Error(`NFO generation failed: ${error.message}`);
  }
}

/**
 * Generate tvshow.nfo file from database data
 */
export async function generateTVShowNFO(seriesDir: string, data: TVShowNFOData): Promise<string> {
  try {
    const nfoObj: any = {};

    // Title
    if (data.title) nfoObj.title = data.title;

    // Provider IDs
    if (data.tmdbId || data.tvdbId || data.imdbId) {
      nfoObj.uniqueid = [];

      if (data.tvdbId) {
        nfoObj.uniqueid.push({
          $: { type: 'tvdb', default: 'true' },
          _: data.tvdbId,
        });
      }

      if (data.tmdbId) {
        nfoObj.uniqueid.push({
          $: { type: 'tmdb', default: data.tvdbId ? 'false' : 'true' },
          _: data.tmdbId,
        });
      }

      if (data.imdbId) {
        nfoObj.uniqueid.push({
          $: { type: 'imdb', default: 'false' },
          _: data.imdbId,
        });
      }
    }

    // Basic metadata
    if (data.originalTitle) nfoObj.originaltitle = data.originalTitle;
    if (data.sortTitle) nfoObj.sorttitle = data.sortTitle;
    if (data.year) nfoObj.year = data.year;
    if (data.plot) nfoObj.plot = data.plot;
    if (data.mpaa) nfoObj.mpaa = data.mpaa;
    if (data.status) nfoObj.status = data.status;
    if (data.premiered) nfoObj.premiered = data.premiered;
    if (data.userRating) nfoObj.userrating = data.userRating;

    // Arrays
    if (data.genres && data.genres.length > 0) {
      nfoObj.genre = data.genres;
    }

    if (data.directors && data.directors.length > 0) {
      nfoObj.director = data.directors;
    }

    if (data.studios && data.studios.length > 0) {
      nfoObj.studio = data.studios;
    }

    if (data.tags && data.tags.length > 0) {
      nfoObj.tag = data.tags;
    }

    // Actors
    if (data.actors && data.actors.length > 0) {
      nfoObj.actor = data.actors.map(actor => {
        const actorObj: any = { name: actor.name };
        if (actor.role) actorObj.role = actor.role;
        if (actor.order !== undefined) actorObj.order = actor.order;
        if (actor.thumb) actorObj.thumb = actor.thumb;
        return actorObj;
      });
    }

    // Ratings
    if (data.ratings && data.ratings.length > 0) {
      nfoObj.ratings = {
        rating: data.ratings.map(rating => ({
          $: {
            name: rating.source,
            default: rating.isDefault ? 'true' : 'false',
          },
          value: rating.value,
          votes: rating.votes || 0,
        })),
      };
    }

    // Build XML with tvshow root
    const tvshowBuilder = new Builder({
      rootName: 'tvshow',
      xmldec: { version: '1.0', encoding: 'UTF-8', standalone: true },
      renderOpts: { pretty: true, indent: '  ' },
    });

    const xml = tvshowBuilder.buildObject(nfoObj);

    // Write to file
    const nfoPath = path.join(seriesDir, 'tvshow.nfo');
    await fs.writeFile(nfoPath, xml, 'utf-8');

    logger.debug('Generated tvshow NFO', { nfoPath });
    return nfoPath;
  } catch (error: any) {
    logger.error('Failed to generate tvshow NFO', {
      seriesDir,
      error: error.message,
    });
    throw new Error(`NFO generation failed: ${error.message}`);
  }
}

/**
 * Generate episode NFO file from database data
 */
export async function generateEpisodeNFO(
  episodeFilePath: string,
  data: EpisodeNFOData
): Promise<string> {
  try {
    const nfoObj: any = {
      season: data.seasonNumber,
      episode: data.episodeNumber,
    };

    // Optional episode identification
    if (data.displaySeason !== undefined) nfoObj.displayseason = data.displaySeason;
    if (data.displayEpisode !== undefined) nfoObj.displayepisode = data.displayEpisode;

    // Metadata
    if (data.title) nfoObj.title = data.title;
    if (data.plot) nfoObj.plot = data.plot;
    if (data.aired) nfoObj.aired = data.aired;
    if (data.runtime) nfoObj.runtime = data.runtime;
    if (data.userRating) nfoObj.userrating = data.userRating;

    // Credits
    if (data.directors && data.directors.length > 0) {
      nfoObj.director = data.directors;
    }

    if (data.writers && data.writers.length > 0) {
      nfoObj.credits = data.writers;
    }

    // Actors
    if (data.actors && data.actors.length > 0) {
      nfoObj.actor = data.actors.map(actor => {
        const actorObj: any = { name: actor.name };
        if (actor.role) actorObj.role = actor.role;
        if (actor.order !== undefined) actorObj.order = actor.order;
        if (actor.thumb) actorObj.thumb = actor.thumb;
        return actorObj;
      });
    }

    // Ratings
    if (data.ratings && data.ratings.length > 0) {
      nfoObj.ratings = {
        rating: data.ratings.map(rating => ({
          $: {
            name: rating.source,
            default: rating.isDefault ? 'true' : 'false',
          },
          value: rating.value,
          votes: rating.votes || 0,
        })),
      };
    }

    // Build XML with episodedetails root
    const episodeBuilder = new Builder({
      rootName: 'episodedetails',
      xmldec: { version: '1.0', encoding: 'UTF-8', standalone: true },
      renderOpts: { pretty: true, indent: '  ' },
    });

    const xml = episodeBuilder.buildObject(nfoObj);

    // Determine NFO path (same name as video file, but .nfo extension)
    const parsedPath = path.parse(episodeFilePath);
    const nfoPath = path.join(parsedPath.dir, `${parsedPath.name}.nfo`);

    await fs.writeFile(nfoPath, xml, 'utf-8');

    logger.debug('Generated episode NFO', { nfoPath });
    return nfoPath;
  } catch (error: any) {
    logger.error('Failed to generate episode NFO', {
      episodeFilePath,
      error: error.message,
    });
    throw new Error(`NFO generation failed: ${error.message}`);
  }
}

/**
 * Fetch movie data from database and generate NFO
 */
export async function generateMovieNFOFromDatabase(
  db: DatabaseConnection,
  movieId: number,
  movieDir: string
): Promise<string> {
  try {
    // Fetch movie metadata
    const movieResults = await db.query(`SELECT * FROM movies WHERE id = ?`, [movieId]);

    if (movieResults.length === 0) {
      throw new Error(`Movie not found: ${movieId}`);
    }

    const movie = movieResults[0];

    // Fetch related data (clean schema)
    const genres = await db.query(
      `SELECT g.name FROM genres g
       JOIN movie_genres mg ON g.id = mg.genre_id
       WHERE mg.movie_id = ?`,
      [movieId]
    );

    const directors = await db.query(
      `SELECT c.name FROM crew c
       JOIN movie_crew mc ON c.id = mc.crew_id
       WHERE mc.movie_id = ? AND mc.role = 'director'`,
      [movieId]
    );

    const writers = await db.query(
      `SELECT c.name FROM crew c
       JOIN movie_crew mc ON c.id = mc.crew_id
       WHERE mc.movie_id = ? AND mc.role = 'writer'`,
      [movieId]
    );

    const studios = await db.query(
      `SELECT s.name FROM studios s
       JOIN movie_studios ms ON s.id = ms.studio_id
       WHERE ms.movie_id = ?`,
      [movieId]
    );

    const actors = await db.query(
      `SELECT a.name, ma.role, ma.sort_order as \`order\`
       FROM actors a
       JOIN movie_actors ma ON a.id = ma.actor_id
       WHERE ma.movie_id = ?
       ORDER BY ma.sort_order`,
      [movieId]
    );

    // Ratings are stored directly in movies table, not separate ratings table
    const ratings: any[] = [];
    if (movie.tmdb_rating) {
      ratings.push({
        source: 'tmdb',
        value: movie.tmdb_rating,
        votes: movie.tmdb_votes || 0,
        isDefault: true,
      });
    }
    if (movie.imdb_rating) {
      ratings.push({
        source: 'imdb',
        value: movie.imdb_rating,
        votes: movie.imdb_votes || 0,
        isDefault: !movie.tmdb_rating,
      });
    }

    // Fetch collection info (clean schema: movie_collections + movie_collection_members)
    let setData: { name: string; overview?: string } | undefined = undefined;
    const collectionResults = await db.query(
      `SELECT mc.name, mc.plot as overview
       FROM movie_collections mc
       JOIN movie_collection_members mcm ON mc.id = mcm.collection_id
       WHERE mcm.movie_id = ?`,
      [movieId]
    );
    if (collectionResults.length > 0) {
      const collectionInfo = collectionResults[0];
      setData = {
        name: collectionInfo.name,
        overview: collectionInfo.overview,
      };
    }

    // Build NFO data object
    const nfoData: MovieNFOData = {
      title: movie.title,
      originalTitle: movie.original_title,
      sortTitle: movie.sort_title,
      year: movie.year,
      plot: movie.plot,
      tagline: movie.tagline,
      mpaa: movie.content_rating, // Clean schema uses content_rating, not mpaa
      premiered: movie.release_date, // Clean schema uses release_date, not premiered
      runtime: movie.runtime,
      tmdbId: movie.tmdb_id,
      imdbId: movie.imdb_id,
      genres: genres.map((g: any) => g.name),
      directors: directors.map((d: any) => d.name),
      writers: writers.map((w: any) => w.name),
      studios: studios.map((s: any) => s.name),
      countries: [], // Not in clean schema
      tags: [], // Not in clean schema
      actors: actors,
      ratings: ratings,
      ...(setData && { set: setData }),
    };

    // Generate NFO file
    return await generateMovieNFO(movieDir, nfoData);
  } catch (error: any) {
    logger.error('Failed to generate movie NFO from database', {
      movieId,
      error: error.message,
    });
    throw new Error(`NFO generation from database failed: ${error.message}`);
  }
}

/**
 * Fetch TV show data from database and generate tvshow.nfo
 */
export async function generateTVShowNFOFromDatabase(
  db: DatabaseConnection,
  seriesId: number,
  seriesDir: string
): Promise<string> {
  try {
    // Fetch series metadata
    const seriesResults = await db.query(`SELECT * FROM series WHERE id = ?`, [seriesId]);

    if (seriesResults.length === 0) {
      throw new Error(`Series not found: ${seriesId}`);
    }

    const series = seriesResults[0];

    // Fetch related data
    const genres = await db.query(
      `SELECT g.name FROM genres g
       JOIN series_genres sg ON g.id = sg.genre_id
       WHERE sg.series_id = ?`,
      [seriesId]
    );

    const directors = await db.query(
      `SELECT d.name FROM directors d
       JOIN series_directors sd ON d.id = sd.director_id
       WHERE sd.series_id = ?`,
      [seriesId]
    );

    const studios = await db.query(
      `SELECT s.name FROM studios s
       JOIN series_studios ss ON s.id = ss.studio_id
       WHERE ss.series_id = ?`,
      [seriesId]
    );

    const tags = await db.query(
      `SELECT t.name FROM tags t
       JOIN series_tags st ON t.id = st.tag_id
       WHERE st.series_id = ?`,
      [seriesId]
    );

    const actors = await db.query(
      `SELECT a.name, sa.role, sa.\`order\`, a.thumb_url as thumb
       FROM actors a
       JOIN series_actors sa ON a.id = sa.actor_id
       WHERE sa.series_id = ?
       ORDER BY sa.\`order\``,
      [seriesId]
    );

    const ratings = await db.query(
      `SELECT source, value, votes, is_default as isDefault
       FROM ratings
       WHERE entity_type = 'series' AND entity_id = ?`,
      [seriesId]
    );

    // Build NFO data object
    const nfoData: TVShowNFOData = {
      title: series.title,
      originalTitle: series.original_title,
      sortTitle: series.sort_title,
      year: series.year,
      plot: series.plot,
      mpaa: series.mpaa,
      status: series.status,
      premiered: series.premiered,
      tmdbId: series.tmdb_id,
      tvdbId: series.tvdb_id,
      imdbId: series.imdb_id,
      genres: genres.map((g: any) => g.name),
      directors: directors.map((d: any) => d.name),
      studios: studios.map((s: any) => s.name),
      tags: tags.map((t: any) => t.name),
      actors: actors,
      ratings: ratings,
    };

    // Generate NFO file
    return await generateTVShowNFO(seriesDir, nfoData);
  } catch (error: any) {
    logger.error('Failed to generate tvshow NFO from database', {
      seriesId,
      error: error.message,
    });
    throw new Error(`NFO generation from database failed: ${error.message}`);
  }
}

/**
 * Fetch episode data from database and generate episode NFO
 */
export async function generateEpisodeNFOFromDatabase(
  db: DatabaseConnection,
  episodeId: number,
  episodeFilePath: string
): Promise<string> {
  try {
    // Fetch episode metadata
    const episodeResults = await db.query(`SELECT * FROM episodes WHERE id = ?`, [episodeId]);

    if (episodeResults.length === 0) {
      throw new Error(`Episode not found: ${episodeId}`);
    }

    const episode = episodeResults[0];

    // Fetch related data
    const directors = await db.query(
      `SELECT d.name FROM directors d
       JOIN episodes_directors ed ON d.id = ed.director_id
       WHERE ed.episode_id = ?`,
      [episodeId]
    );

    const writers = await db.query(
      `SELECT w.name FROM writers w
       JOIN episodes_writers ew ON w.id = ew.writer_id
       WHERE ew.episode_id = ?`,
      [episodeId]
    );

    const actors = await db.query(
      `SELECT a.name, ea.role, ea.\`order\`, a.thumb_url as thumb
       FROM actors a
       JOIN episodes_actors ea ON a.id = ea.actor_id
       WHERE ea.episode_id = ?
       ORDER BY ea.\`order\``,
      [episodeId]
    );

    const ratings = await db.query(
      `SELECT source, value, votes, is_default as isDefault
       FROM ratings
       WHERE entity_type = 'episode' AND entity_id = ?`,
      [episodeId]
    );

    // Build NFO data object
    const nfoData: EpisodeNFOData = {
      seasonNumber: episode.season_number,
      episodeNumber: episode.episode_number,
      displaySeason: episode.display_season,
      displayEpisode: episode.display_episode,
      title: episode.title,
      plot: episode.plot,
      aired: episode.aired,
      directors: directors.map((d: any) => d.name),
      writers: writers.map((w: any) => w.name),
      actors: actors,
      ratings: ratings,
    };

    // Generate NFO file
    return await generateEpisodeNFO(episodeFilePath, nfoData);
  } catch (error: any) {
    logger.error('Failed to generate episode NFO from database', {
      episodeId,
      error: error.message,
    });
    throw new Error(`NFO generation from database failed: ${error.message}`);
  }
}
