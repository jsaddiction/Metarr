#!/usr/bin/env tsx
/**
 * Test Media Library Generator
 *
 * Creates a comprehensive test media library for thorough scanner testing.
 * Includes movies, TV shows, and music with various edge cases.
 *
 * Usage: npm run test-media:create
 */

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const TEST_MEDIA_DIR = path.join(PROJECT_ROOT, 'test-media');

// Cache ffmpeg availability
let FFMPEG_AVAILABLE: boolean | null = null;

// ANSI color codes for pretty output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

function log(message: string, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logSection(title: string) {
  console.log();
  log(`${'='.repeat(60)}`, colors.cyan);
  log(`  ${title}`, colors.bright + colors.cyan);
  log(`${'='.repeat(60)}`, colors.cyan);
}

function logStep(step: string) {
  log(`✓ ${step}`, colors.green);
}

/**
 * Create a placeholder image with proper dimensions for Metarr validation
 * Uses ffmpeg to generate solid color images that meet minimum size requirements
 */
async function createPlaceholderImage(filePath: string, isPng = false, assetType?: string): Promise<void> {
  if (!FFMPEG_AVAILABLE) {
    // Fallback: create a very small image that will likely fail validation
    // but at least creates the file structure
    const tinyPixel = isPng ?
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==' :
      '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlbaWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/aAAwDAQACEQMRAD8A3UAFFFFABRRRQAUUUUAFFFFAH//Z';
    const buffer = Buffer.from(tinyPixel, 'base64');
    await fs.writeFile(filePath, buffer);
    return;
  }

  // Use EXACT recommended dimensions from assetTypeSpecs.ts
  // These match Kodi's official artwork specifications
  let size = '1000x1500'; // Default: poster dimensions
  if (assetType) {
    switch (assetType) {
      case 'poster':
        size = '1000x1500'; // 2:3 ratio (recommended from spec)
        break;
      case 'fanart':
      case 'backdrop':
        size = '1920x1080'; // 16:9 ratio (recommended from spec, also supports 3840x2160)
        break;
      case 'banner':
        size = '758x140'; // 5.4:1 ratio (recommended from spec)
        break;
      case 'clearlogo':
      case 'logo':
        size = '800x310'; // 2.58:1 ratio (recommended from spec)
        break;
      case 'clearart':
        size = '1000x562'; // 1.78:1 ratio (recommended from spec)
        break;
      case 'discart':
      case 'disc':
        size = '1000x1000'; // 1:1 square (recommended from spec)
        break;
      case 'landscape':
        size = '1920x1080'; // 16:9 ratio (recommended from spec)
        break;
      case 'keyart':
        size = '1000x1500'; // 2:3 ratio, same as poster (recommended from spec)
        break;
      case 'thumb':
        size = '1920x1080'; // 16:9 ratio (recommended from spec)
        break;
    }
  }

  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execPromise = promisify(exec);

  try {
    // Create solid color image with ffmpeg
    // Use gray color so it's obviously a placeholder
    const format = isPng ? 'png' : 'mjpeg';
    const command = `ffmpeg -f lavfi -i "color=c=gray:size=${size}:duration=0.1" -frames:v 1 -f image2 -pix_fmt ${isPng ? 'rgb24' : 'yuvj420p'} -loglevel error -y "${filePath}"`;
    await execPromise(command);
  } catch (error: any) {
    // Fallback to tiny image if ffmpeg command fails
    const tinyPixel = isPng ?
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==' :
      '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlbaWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/aAAwDAQACEQMRAD8A3UAFFFFABRRRQAUUUUAFFFFAH//Z';
    const buffer = Buffer.from(tinyPixel, 'base64');
    await fs.writeFile(filePath, buffer);
  }
}

/**
 * Create a minimal valid video file using ffmpeg
 * Creates a 1-second, 1x1 pixel black video
 * This is necessary because the scanner uses ffprobe to extract stream info
 * and empty files will cause ffprobe to fail.
 */
async function createDummyVideo(filePath: string): Promise<void> {
  if (!FFMPEG_AVAILABLE) {
    // Fallback to empty file
    await fs.writeFile(filePath, '');
    return;
  }

  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execPromise = promisify(exec);

  try {
    // Create a 1-second, 2x2 pixel black video
    // -f lavfi: Use Libavfilter input virtual device
    // color=c=black:size=2x2:duration=1: Create 2x2 black video for 1 second
    // -c:v libx264: H.264 codec
    // -preset ultrafast: Fast encoding
    // -pix_fmt yuv420p: Pixel format for compatibility
    // -loglevel error: Only show errors
    const command = `ffmpeg -f lavfi -i "color=c=black:size=2x2:duration=1" -c:v libx264 -preset ultrafast -pix_fmt yuv420p -loglevel error -y "${filePath}"`;
    await execPromise(command);
  } catch (error: any) {
    // Fallback to empty file if ffmpeg command fails
    await fs.writeFile(filePath, '');
  }
}

/**
 * Create a minimal valid audio file using ffmpeg
 * Creates a 1-second silent audio file
 */
async function createDummyAudio(filePath: string): Promise<void> {
  if (!FFMPEG_AVAILABLE) {
    // Fallback to empty file
    await fs.writeFile(filePath, '');
    return;
  }

  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execPromise = promisify(exec);

  try {
    // Create a 1-second silent audio file
    const command = `ffmpeg -f lavfi -i anullsrc=r=44100:cl=mono -t 1 -q:a 9 -acodec libmp3lame -loglevel error -y "${filePath}"`;
    await execPromise(command);
  } catch (error: any) {
    // Fallback to empty file if ffmpeg command fails
    await fs.writeFile(filePath, '');
  }
}

/**
 * NFO Templates
 */
const nfoTemplates = {
  /**
   * Complete movie NFO with all metadata fields
   */
  movieComplete: (title: string, year: number, tmdbId: number, imdbId: string) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<movie>
  <!-- Modern Provider IDs (Kodi v18+) -->
  <uniqueid type="tmdb" default="true">${tmdbId}</uniqueid>
  <uniqueid type="imdb">${imdbId}</uniqueid>

  <!-- Basic Information -->
  <title>${title}</title>
  <originaltitle>${title}</originaltitle>
  <sorttitle>${title.replace(/^(The|A|An) /, '')}, ${title.match(/^(The|A|An) /)?.[0].trim() || ''}</sorttitle>
  <year>${year}</year>

  <!-- Plot & Description -->
  <plot>This is a comprehensive test movie with complete metadata. It includes all supported fields to test the scanner's ability to parse and store complex NFO data correctly.</plot>
  <outline>Complete test movie for scanner validation.</outline>
  <tagline>Testing Complete Metadata Parsing</tagline>

  <!-- Classification -->
  <mpaa>PG-13</mpaa>
  <country>United States</country>

  <!-- Runtime & Dates -->
  <runtime>120</runtime>
  <premiered>${year}-06-15</premiered>

  <!-- Ratings -->
  <ratings>
    <rating name="tmdb" max="10" default="true">
      <value>8.5</value>
      <votes>12345</votes>
    </rating>
    <rating name="imdb" max="10">
      <value>8.7</value>
      <votes>654321</votes>
    </rating>
  </ratings>

  <!-- People -->
  <actor>
    <name>John Doe</name>
    <role>Lead Character</role>
    <order>0</order>
  </actor>
  <actor>
    <name>Jane Smith</name>
    <role>Supporting Character</role>
    <order>1</order>
  </actor>

  <director>Test Director</director>
  <credits>Test Writer</credits>

  <!-- Studios & Production -->
  <studio>Test Studios</studio>

  <!-- Genres -->
  <genre>Action</genre>
  <genre>Drama</genre>

  <!-- Collections -->
  <set>
    <name>Test Collection</name>
  </set>

  <!-- Tags -->
  <tag>Test</tag>
  <tag>Scanner</tag>
</movie>`,

  /**
   * Minimal movie NFO (only required fields)
   */
  movieMinimal: (title: string, year: number, tmdbId: number, imdbId: string) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<movie>
  <title>${title}</title>
  <uniqueid type="tmdb" default="true">${tmdbId}</uniqueid>
  <uniqueid type="imdb">${imdbId}</uniqueid>
  <year>${year}</year>
</movie>`,

  /**
   * Legacy movie NFO format (old Kodi versions)
   */
  movieLegacy: (title: string, year: number, tmdbId: number, imdbId: string) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<movie>
  <title>${title}</title>
  <year>${year}</year>
  <tmdbid>${tmdbId}</tmdbid>
  <imdbid>${imdbId}</imdbid>
  <genre>Drama</genre>
  <director>Test Director</director>
  <studio>Test Studios</studio>
</movie>`,

  /**
   * Movie NFO with only IMDB ID (no TMDB)
   */
  movieImdbOnly: (title: string, year: number, imdbId: string) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<movie>
  <title>${title}</title>
  <year>${year}</year>
  <uniqueid type="imdb" default="true">${imdbId}</uniqueid>
</movie>`,

  /**
   * Corrupted movie NFO (malformed XML)
   */
  movieCorrupted: (title: string) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<movie>
  <title>${title}</title>
  <year>1999
  <!-- Missing closing tag for year -->
  <plot>This NFO has malformed XML to test error handling</plot>
</movie>`,

  /**
   * TV Show NFO
   */
  tvShow: (title: string, tvdbId: number, imdbId: string) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<tvshow>
  <title>${title}</title>
  <uniqueid type="tvdb" default="true">${tvdbId}</uniqueid>
  <uniqueid type="imdb">${imdbId}</uniqueid>
  <plot>This is a test TV show for scanner validation.</plot>
  <genre>Drama</genre>
  <studio>Test Network</studio>
  <premiered>2008-01-20</premiered>
</tvshow>`,

  /**
   * TV Episode NFO
   */
  tvEpisode: (title: string, season: number, episode: number, tvdbId?: number) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<episodedetails>
  <title>${title}</title>
  <season>${season}</season>
  <episode>${episode}</episode>
  ${tvdbId ? `<uniqueid type="tvdb" default="true">${tvdbId}</uniqueid>` : ''}
  <plot>Test episode ${season}x${episode} for scanner validation.</plot>
  <aired>2008-${String(season).padStart(2, '0')}-${String(episode * 7).padStart(2, '0')}</aired>
</episodedetails>`,

  /**
   * Music Album NFO
   */
  musicAlbum: (artist: string, album: string, year: number, musicBrainzId?: string) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<album>
  <title>${album}</title>
  <artist>${artist}</artist>
  <year>${year}</year>
  ${musicBrainzId ? `<musicbrainzalbumid>${musicBrainzId}</musicbrainzalbumid>` : ''}
  <genre>Rock</genre>
  <review>Test album for scanner validation.</review>
</album>`,
};

/**
 * Create movie test cases
 */
async function createMovies(): Promise<void> {
  logSection('Creating Movie Test Cases');

  const moviesDir = path.join(TEST_MEDIA_DIR, 'movies');
  await fs.ensureDir(moviesDir);

  // 01 - Complete metadata with all assets
  const movie01Dir = path.join(moviesDir, 'The Matrix (1999)');
  await fs.ensureDir(movie01Dir);
  await fs.writeFile(
    path.join(movie01Dir, 'movie.nfo'),
    nfoTemplates.movieComplete('The Matrix', 1999, 603, 'tt0133093')
  );
  await createDummyVideo(path.join(movie01Dir, 'The Matrix (1999).mkv'));

  // Images - all supported types
  await createPlaceholderImage(path.join(movie01Dir, 'poster.jpg'), false, 'poster');
  await createPlaceholderImage(path.join(movie01Dir, 'fanart.jpg'), false, 'fanart');
  await createPlaceholderImage(path.join(movie01Dir, 'clearlogo.png'), true, 'clearlogo');
  await createPlaceholderImage(path.join(movie01Dir, 'clearart.png'), true, 'clearart');
  await createPlaceholderImage(path.join(movie01Dir, 'discart.png'), true, 'discart');
  await createPlaceholderImage(path.join(movie01Dir, 'banner.jpg'), false, 'banner');
  await createPlaceholderImage(path.join(movie01Dir, 'landscape.jpg'), false, 'landscape');
  await createPlaceholderImage(path.join(movie01Dir, 'keyart.jpg'), false, 'keyart');
  await createPlaceholderImage(path.join(movie01Dir, 'thumb.jpg'), false, 'thumb');

  // Trailer video
  await createDummyVideo(path.join(movie01Dir, 'The Matrix (1999)-trailer.mkv'));

  // Subtitle files (multiple languages)
  await fs.writeFile(path.join(movie01Dir, 'The Matrix (1999).en.srt'),
    '1\n00:00:01,000 --> 00:00:05,000\nTest subtitle line 1\n\n2\n00:00:05,000 --> 00:00:10,000\nTest subtitle line 2\n');
  await fs.writeFile(path.join(movie01Dir, 'The Matrix (1999).es.srt'),
    '1\n00:00:01,000 --> 00:00:05,000\nLínea de subtítulo de prueba 1\n\n2\n00:00:05,000 --> 00:00:10,000\nLínea de subtítulo de prueba 2\n');

  // Theme song (audio file)
  await createDummyAudio(path.join(movie01Dir, 'theme.mp3'));

  logStep('01-complete-metadata: The Matrix (1999) - All metadata + ALL asset types (10 images, trailer, 2 subtitles, theme)');

  // 02 - Minimal metadata
  const movie02Dir = path.join(moviesDir, 'Inception (2010)');
  await fs.ensureDir(movie02Dir);
  await fs.writeFile(
    path.join(movie02Dir, 'Inception (2010).nfo'),
    nfoTemplates.movieMinimal('Inception', 2010, 27205, 'tt1375666')
  );
  await createDummyVideo(path.join(movie02Dir, 'Inception (2010).mkv'));
  logStep('02-minimal-metadata: Inception (2010) - Title.nfo naming');

  // 03 - Unidentified (no NFO)
  const movie03Dir = path.join(moviesDir, 'Interstellar (2014)');
  await fs.ensureDir(movie03Dir);
  await createDummyVideo(path.join(movie03Dir, 'Interstellar (2014).mkv'));
  logStep('03-unidentified: Interstellar (2014) - No NFO file');

  // 04 - Alternate asset naming
  const movie04Dir = path.join(moviesDir, 'The Dark Knight (2008)');
  await fs.ensureDir(movie04Dir);
  await fs.writeFile(
    path.join(movie04Dir, 'The Dark Knight (2008).nfo'),
    nfoTemplates.movieMinimal('The Dark Knight', 2008, 155, 'tt0468569')
  );
  await createDummyVideo(path.join(movie04Dir, 'The Dark Knight (2008).mkv'));
  await createPlaceholderImage(path.join(movie04Dir, 'The Dark Knight (2008)-poster.jpg'));
  await createPlaceholderImage(path.join(movie04Dir, 'The Dark Knight (2008)-fanart.jpg'));
  logStep('04-alternate-asset-naming: The Dark Knight (2008) - Title-type.ext naming');

  // 05 - Root-level assets (assets outside movie folder)
  const movie05Dir = path.join(moviesDir, 'Blade Runner 2049 (2017)');
  await fs.ensureDir(movie05Dir);
  await fs.writeFile(
    path.join(movie05Dir, 'Blade Runner 2049 (2017).nfo'),
    nfoTemplates.movieMinimal('Blade Runner 2049', 2017, 335984, 'tt1856101')
  );
  await createDummyVideo(path.join(movie05Dir, 'Blade Runner 2049 (2017).mkv'));
  // Assets at parent level
  await createPlaceholderImage(path.join(moviesDir, 'Blade Runner 2049 (2017)-poster.jpg'));
  await createPlaceholderImage(path.join(moviesDir, 'Blade Runner 2049 (2017)-fanart.jpg'));
  logStep('05-root-level-assets: Blade Runner 2049 (2017) - Assets outside folder');

  // 06 - Ambiguous title (remake)
  const movie06Dir = path.join(moviesDir, 'The Thing (2011)');
  await fs.ensureDir(movie06Dir);
  await fs.writeFile(
    path.join(movie06Dir, 'The Thing (2011).nfo'),
    nfoTemplates.movieMinimal('The Thing', 2011, 64689, 'tt0905372')
  );
  await createDummyVideo(path.join(movie06Dir, 'The Thing (2011).mkv'));
  logStep('06-ambiguous-title: The Thing (2011) - Remake vs original');

  // 07 - No year in folder
  const movie07Dir = path.join(moviesDir, 'Dunkirk');
  await fs.ensureDir(movie07Dir);
  await fs.writeFile(
    path.join(movie07Dir, 'Dunkirk.nfo'),
    nfoTemplates.movieMinimal('Dunkirk', 2017, 374720, 'tt5013056')
  );
  await createDummyVideo(path.join(movie07Dir, 'Dunkirk.mkv'));
  logStep('07-no-year-in-folder: Dunkirk - Year extraction from NFO');

  // 08 - Special characters
  const movie08Dir = path.join(moviesDir, 'Scott Pilgrim vs. the World (2010)');
  await fs.ensureDir(movie08Dir);
  await fs.writeFile(
    path.join(movie08Dir, 'movie.nfo'),
    nfoTemplates.movieMinimal('Scott Pilgrim vs. the World', 2010, 37724, 'tt0446029')
  );
  await createDummyVideo(path.join(movie08Dir, 'Scott Pilgrim vs. the World (2010).mkv'));
  logStep('08-special-characters: Scott Pilgrim vs. the World (2010)');

  // 09 - Multiple NFO formats (priority testing)
  const movie09Dir = path.join(moviesDir, 'Arrival (2016)');
  await fs.ensureDir(movie09Dir);
  await fs.writeFile(
    path.join(movie09Dir, 'movie.nfo'),
    nfoTemplates.movieMinimal('Arrival', 2016, 329865, 'tt2543164')
  );
  await fs.writeFile(
    path.join(movie09Dir, 'Arrival (2016).nfo'),
    nfoTemplates.movieLegacy('Arrival', 2016, 329865, 'tt2543164')
  );
  await createDummyVideo(path.join(movie09Dir, 'Arrival (2016).mkv'));
  logStep('09-multiple-nfo-formats: Arrival (2016) - Priority: movie.nfo > title.nfo');

  // 10 - Year mismatch
  const movie10Dir = path.join(moviesDir, 'Edge of Tomorrow (2015)');
  await fs.ensureDir(movie10Dir);
  await fs.writeFile(
    path.join(movie10Dir, 'movie.nfo'),
    nfoTemplates.movieMinimal('Edge of Tomorrow', 2014, 137113, 'tt1631867')
  );
  await createDummyVideo(path.join(movie10Dir, 'Edge of Tomorrow (2015).mkv'));
  logStep('10-year-mismatch: Edge of Tomorrow - Folder: 2015, NFO: 2014 (actual)');

  // 11 - Only IMDB ID
  const movie11Dir = path.join(moviesDir, 'Tenet (2020)');
  await fs.ensureDir(movie11Dir);
  await fs.writeFile(
    path.join(movie11Dir, 'movie.nfo'),
    nfoTemplates.movieImdbOnly('Tenet', 2020, 'tt6723592')
  );
  await createDummyVideo(path.join(movie11Dir, 'Tenet (2020).mkv'));
  logStep('11-only-imdb-id: Tenet (2020) - Only IMDB ID, no TMDB');

  // 12 - Legacy NFO format
  const movie12Dir = path.join(moviesDir, 'Gladiator (2000)');
  await fs.ensureDir(movie12Dir);
  await fs.writeFile(
    path.join(movie12Dir, 'Gladiator (2000).nfo'),
    nfoTemplates.movieLegacy('Gladiator', 2000, 98, 'tt0172495')
  );
  await createDummyVideo(path.join(movie12Dir, 'Gladiator (2000).mkv'));
  logStep('12-legacy-nfo-format: Gladiator (2000) - Old <tmdbid> format');

  // 13 - Mixed asset locations
  const movie13Dir = path.join(moviesDir, 'Avatar (2009)');
  await fs.ensureDir(movie13Dir);
  await fs.writeFile(
    path.join(movie13Dir, 'movie.nfo'),
    nfoTemplates.movieMinimal('Avatar', 2009, 19995, 'tt0499549')
  );
  await createDummyVideo(path.join(movie13Dir, 'Avatar (2009).mkv'));
  await createPlaceholderImage(path.join(movie13Dir, 'poster.jpg'));
  await createPlaceholderImage(path.join(movie13Dir, 'clearlogo.png'), true);
  await createPlaceholderImage(path.join(moviesDir, 'Avatar (2009)-fanart.jpg'));
  logStep('13-mixed-asset-locations: Avatar (2009) - Assets inside and outside folder');

  // 14 - Corrupted NFO
  const movie14Dir = path.join(moviesDir, 'Fight Club (1999)');
  await fs.ensureDir(movie14Dir);
  await fs.writeFile(
    path.join(movie14Dir, 'movie.nfo'),
    nfoTemplates.movieCorrupted('Fight Club')
  );
  await createDummyVideo(path.join(movie14Dir, 'Fight Club (1999).mkv'));
  logStep('14-corrupted-nfo: Fight Club (1999) - Malformed XML for error handling');

  log(`\nCreated ${14} movie test cases`, colors.bright);
}

/**
 * Create TV show test cases
 */
async function createTVShows(): Promise<void> {
  logSection('Creating TV Show Test Cases');

  const tvDir = path.join(TEST_MEDIA_DIR, 'tvshows');
  await fs.ensureDir(tvDir);

  // 01 - Complete series
  const show01Dir = path.join(tvDir, 'Breaking Bad');
  await fs.ensureDir(show01Dir);
  await fs.writeFile(
    path.join(show01Dir, 'tvshow.nfo'),
    nfoTemplates.tvShow('Breaking Bad', 81189, 'tt0903747')
  );
  await createPlaceholderImage(path.join(show01Dir, 'poster.jpg'));
  await createPlaceholderImage(path.join(show01Dir, 'fanart.jpg'));
  await createPlaceholderImage(path.join(show01Dir, 'banner.jpg'));
  await createPlaceholderImage(path.join(show01Dir, 'clearlogo.png'), true);

  // Season 01
  const s01Dir = path.join(show01Dir, 'Season 01');
  await fs.ensureDir(s01Dir);
  await createPlaceholderImage(path.join(s01Dir, 'season-poster.jpg'));

  for (let ep = 1; ep <= 2; ep++) {
    const epNum = String(ep).padStart(2, '0');
    await createDummyVideo(path.join(s01Dir, `S01E${epNum}.mkv`));
    await fs.writeFile(
      path.join(s01Dir, `S01E${epNum}.nfo`),
      nfoTemplates.tvEpisode(`Episode ${ep}`, 1, ep, 349200 + ep)
    );
  }

  // Season 02
  const s02Dir = path.join(show01Dir, 'Season 02');
  await fs.ensureDir(s02Dir);
  await createPlaceholderImage(path.join(s02Dir, 'season-poster.jpg'));
  await createDummyVideo(path.join(s02Dir, 'S02E01.mkv'));
  await fs.writeFile(
    path.join(s02Dir, 'S02E01.nfo'),
    nfoTemplates.tvEpisode('Episode 1', 2, 1, 349210)
  );

  logStep('01-complete-series: Breaking Bad - 2 seasons, show + episode NFOs, all assets');

  // 02 - Minimal series
  const show02Dir = path.join(tvDir, 'Stranger Things');
  const show02S01 = path.join(show02Dir, 'Season 01');
  await fs.ensureDir(show02S01);
  await fs.writeFile(
    path.join(show02Dir, 'tvshow.nfo'),
    nfoTemplates.tvShow('Stranger Things', 305288, 'tt4574334')
  );
  await createDummyVideo(path.join(show02S01, 'S01E01.mkv'));
  await fs.writeFile(
    path.join(show02S01, 'S01E01.nfo'),
    nfoTemplates.tvEpisode('Chapter One', 1, 1)
  );
  logStep('02-minimal-series: Stranger Things - Minimal metadata');

  // 03 - Unidentified series
  const show03Dir = path.join(tvDir, 'The Expanse');
  const show03S01 = path.join(show03Dir, 'Season 01');
  await fs.ensureDir(show03S01);
  await createDummyVideo(path.join(show03S01, 'S01E01.mkv'));
  logStep('03-unidentified-series: The Expanse - No NFO files');

  // 04 - Date-based naming
  const show04Dir = path.join(tvDir, 'The Daily Show');
  const show04S2024 = path.join(show04Dir, 'Season 2024');
  await fs.ensureDir(show04S2024);
  await fs.writeFile(
    path.join(show04Dir, 'tvshow.nfo'),
    nfoTemplates.tvShow('The Daily Show', 71256, 'tt0115147')
  );
  await createDummyVideo(path.join(show04S2024, '2024-01-15.mkv'));
  await fs.writeFile(
    path.join(show04S2024, '2024-01-15.nfo'),
    nfoTemplates.tvEpisode('Episode 2024-01-15', 2024, 15)
  );
  logStep('04-date-based-naming: The Daily Show - Date-based episodes');

  log(`\nCreated ${4} TV show test cases`, colors.bright);
}

/**
 * Create music test cases
 */
async function createMusic(): Promise<void> {
  logSection('Creating Music Test Cases');

  const musicDir = path.join(TEST_MEDIA_DIR, 'music');
  await fs.ensureDir(musicDir);

  // 01 - Complete album
  const album01Dir = path.join(musicDir, 'Pink Floyd', 'The Dark Side of the Moon (1973)');
  await fs.ensureDir(album01Dir);
  await fs.writeFile(
    path.join(album01Dir, 'album.nfo'),
    nfoTemplates.musicAlbum('Pink Floyd', 'The Dark Side of the Moon', 1973, 'a1e2b9b6-6b6e-4f6e-9c9d-8f7e6d5c4b3a')
  );
  await createPlaceholderImage(path.join(album01Dir, 'cover.jpg'));
  await createPlaceholderImage(path.join(album01Dir, 'fanart.jpg'));

  const tracks = [
    '01 - Speak to Me.mp3',
    '02 - Breathe.mp3',
    '03 - On the Run.mp3',
  ];
  for (const track of tracks) {
    await createDummyAudio(path.join(album01Dir, track));
  }
  logStep('01-complete-album: Pink Floyd - The Dark Side of the Moon (1973)');

  // 02 - Minimal album
  const album02Dir = path.join(musicDir, 'Various Artists', 'Compilation (2020)');
  await fs.ensureDir(album02Dir);
  await fs.writeFile(
    path.join(album02Dir, 'album.nfo'),
    nfoTemplates.musicAlbum('Various Artists', 'Compilation', 2020)
  );
  await createDummyAudio(path.join(album02Dir, '01 - Track.mp3'));
  logStep('02-minimal-album: Various Artists - Compilation (2020)');

  // 03 - Unidentified album
  const album03Dir = path.join(musicDir, 'Unknown Artist', 'Unknown Album');
  await fs.ensureDir(album03Dir);
  await createDummyAudio(path.join(album03Dir, '01 - Song.mp3'));
  logStep('03-unidentified-album: Unknown Artist - No metadata');

  log(`\nCreated ${3} music test cases`, colors.bright);
}

/**
 * Create README documentation
 */
async function createReadme(): Promise<void> {
  const readme = `# Test Media Library

This directory contains a comprehensive test media library for Metarr scanner testing.

## Structure

\`\`\`
test-media/
├── movies/        (14 test cases)
├── tvshows/       (4 test cases)
└── music/         (3 test cases)
\`\`\`

## Movies (14 Test Cases)

1. **01-complete-metadata** - The Matrix (1999)
   - Complete NFO with all metadata fields
   - All asset types: poster, fanart, clearlogo, clearart, discart, banner, landscape
   - Tests: Full metadata parsing, all asset discovery

2. **02-minimal-metadata** - Inception (2010)
   - Minimal NFO (title, year, IDs only)
   - Uses Title.nfo naming convention
   - Tests: Minimal NFO parsing, alternate NFO naming

3. **03-unidentified** - Interstellar (2014)
   - No NFO file
   - Tests: Unidentified movie detection, year extraction from folder

4. **04-alternate-asset-naming** - The Dark Knight (2008)
   - Assets use Title-type.ext naming
   - Tests: Alternate asset naming patterns

5. **05-root-level-assets** - Blade Runner 2049 (2017)
   - Assets outside movie folder (at parent level)
   - Tests: Asset discovery outside movie directory

6. **06-ambiguous-title** - The Thing (2011)
   - Remake with same name as 1982 original
   - Tests: Year-based disambiguation, exact TMDB ID matching

7. **07-no-year-in-folder** - Dunkirk
   - Folder has no year, year only in NFO
   - Tests: Year extraction from NFO when missing from folder

8. **08-special-characters** - Scott Pilgrim vs. the World (2010)
   - Special characters in title (vs., periods)
   - Tests: Special character handling, filename parsing

9. **09-multiple-nfo-formats** - Arrival (2016)
   - Both movie.nfo and Title.nfo present
   - Tests: NFO priority (movie.nfo should win)

10. **10-year-mismatch** - Edge of Tomorrow (2015/2014)
    - Folder says 2015, NFO says 2014
    - Tests: NFO year should override folder year

11. **11-only-imdb-id** - Tenet (2020)
    - Only IMDB ID, no TMDB ID
    - Tests: IMDB-only identification

12. **12-legacy-nfo-format** - Gladiator (2000)
    - Old Kodi format (\`<tmdbid>\` instead of \`<uniqueid>\`)
    - Tests: Legacy NFO format parsing

13. **13-mixed-asset-locations** - Avatar (2009)
    - Some assets inside folder, some outside
    - Tests: Mixed asset location discovery

14. **14-corrupted-nfo** - Fight Club (1999)
    - Malformed XML
    - Tests: Error handling, graceful degradation

## TV Shows (4 Test Cases)

1. **01-complete-series** - Breaking Bad
   - Show-level NFO with all metadata
   - 2 seasons with multiple episodes
   - All asset types (poster, fanart, banner, clearlogo, season posters)
   - Tests: Complete TV show parsing, multi-season handling

2. **02-minimal-series** - Stranger Things
   - Minimal show and episode NFOs
   - Tests: Minimal TV metadata parsing

3. **03-unidentified-series** - The Expanse
   - No NFO files
   - Tests: Unidentified series detection

4. **04-date-based-naming** - The Daily Show
   - Date-based episode naming (YYYY-MM-DD.mkv)
   - Tests: Date-based episode parsing

## Music (3 Test Cases)

1. **01-complete-album** - Pink Floyd - The Dark Side of the Moon (1973)
   - Complete album NFO with MusicBrainz ID
   - Cover art and fanart
   - Multiple tracks
   - Tests: Full music metadata parsing

2. **02-minimal-album** - Various Artists - Compilation (2020)
   - Minimal album NFO
   - Tests: Minimal music metadata

3. **03-unidentified-album** - Unknown Artist
   - No metadata files
   - Tests: Unidentified music detection

## Usage

### Generate Test Library

\`\`\`bash
npm run test-media:create
\`\`\`

This will:
1. Delete existing test-media/ directory
2. Create fresh test media structure
3. Generate all NFO files
4. Create placeholder media files and images

### Add to Metarr

1. Start Metarr: \`npm run dev:all\`
2. Navigate to Settings → Libraries
3. Add libraries:
   - **Movies**: \`/path/to/Metarr/test-media/movies\`
   - **TV Shows**: \`/path/to/Metarr/test-media/tvshows\`
   - **Music**: \`/path/to/Metarr/test-media/music\`
4. Click "Scan" for each library

### Expected Results

After scanning:

**Movies:**
- Total: 14 movies
- Enriched: 1 (The Matrix)
- Identified: 11 (all except Interstellar, Fight Club, Tenet)
- Unidentified: 1 (Interstellar)
- Failed: 1 (Fight Club - corrupted NFO)

**TV Shows:**
- Total: 4 shows
- Enriched: 2 (Breaking Bad, Stranger Things)
- Unidentified: 2 (The Expanse, The Daily Show)

**Music:**
- Total: 3 albums
- Enriched: 2 (Pink Floyd, Various Artists)
- Unidentified: 1 (Unknown Artist)

## Notes

- All media files are empty (0 bytes) for fast generation
- All images are 1x1 pixel placeholders
- This library is regenerated on each \`npm run test-media:create\`
- Not tracked in git (see .gitignore)

## Regeneration

To regenerate the test library:

\`\`\`bash
# Clean and regenerate
npm run test-media:create
\`\`\`

The script will automatically delete the old directory before creating a new one.
`;

  await fs.writeFile(path.join(TEST_MEDIA_DIR, 'README.md'), readme);
  logStep('Created README.md documentation');
}

/**
 * Main execution
 */
async function main() {
  console.clear();

  log('╔═══════════════════════════════════════════════════════════╗', colors.bright + colors.cyan);
  log('║                                                           ║', colors.bright + colors.cyan);
  log('║         METARR TEST MEDIA LIBRARY GENERATOR              ║', colors.bright + colors.cyan);
  log('║                                                           ║', colors.bright + colors.cyan);
  log('╚═══════════════════════════════════════════════════════════╝', colors.bright + colors.cyan);
  console.log();

  try {
    // Check for ffmpeg and cache the result
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execPromise = promisify(exec);

    try {
      await execPromise('ffmpeg -version 2>/dev/null');
      FFMPEG_AVAILABLE = true;
      log('✓ ffmpeg detected - will create valid video files', colors.green);
    } catch {
      FFMPEG_AVAILABLE = false;
      log('⚠ ffmpeg not found - will create empty video files', colors.yellow);
      log('  Scanner may have issues. Install: sudo apt install ffmpeg', colors.yellow);
    }
    console.log();

    // Remove existing test-media directory
    if (await fs.pathExists(TEST_MEDIA_DIR)) {
      log('⚠ Removing existing test-media directory...', colors.yellow);
      await fs.remove(TEST_MEDIA_DIR);
      logStep('Removed old test-media/');
    }

    // Create base directory
    await fs.ensureDir(TEST_MEDIA_DIR);
    logStep('Created test-media/ directory');

    // Create all test cases
    await createMovies();
    await createTVShows();
    await createMusic();
    await createReadme();

    // Summary
    logSection('Summary');
    log(`Location: ${TEST_MEDIA_DIR}`, colors.bright);
    log(`Movies:   14 test cases`, colors.green);
    log(`TV Shows: 4 test cases`, colors.green);
    log(`Music:    3 test cases`, colors.green);
    log(`Total:    21 test cases`, colors.bright + colors.green);
    console.log();

    log('✓ Test media library created successfully!', colors.bright + colors.green);
    console.log();
    log('Next steps:', colors.bright);
    log('1. Start Metarr: npm run dev:all', colors.cyan);
    log('2. Add libraries in Settings → Libraries', colors.cyan);
    log('3. Run library scans', colors.cyan);
    log('4. Check scanner behavior for edge cases', colors.cyan);
    console.log();

  } catch (error) {
    console.error();
    log('✗ Error creating test media library:', colors.red);
    console.error(error);
    process.exit(1);
  }
}

// Run the script
main();
