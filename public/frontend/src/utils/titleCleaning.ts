/**
 * Utility functions for cleaning movie titles from filenames and folder names
 */

/**
 * Clean a movie title by removing quality tags, years, codecs, and other metadata
 * Works for both filenames and folder names
 *
 * Examples:
 * - "The Matrix (1999)" -> "The Matrix"
 * - "Inception.2010.1080p.BluRay.x264" -> "Inception"
 * - "Avengers_Endgame_2019" -> "Avengers Endgame"
 * - "The.Matrix.mkv" -> "The Matrix"
 *
 * @param name - The filename or folder name to clean
 * @returns Cleaned title suitable for searching
 */
export const cleanMovieTitle = (name: string): string => {
  if (!name) return '';

  // Remove file extension
  let cleaned = name.replace(/\.(mkv|mp4|avi|mov|wmv|flv|webm|m4v)$/i, '');

  // Remove year in parentheses, brackets, or at end: "(2020)", "[2020]", "2020"
  cleaned = cleaned.replace(/\s*[\(\[]?\d{4}[\)\]]?$/, '');

  // Remove common quality/source tags and everything after
  cleaned = cleaned.replace(/[\.\s](1080p|720p|2160p|4K|BluRay|WEB-?DL|HDRip|DVDRip|BRRip|HDTV|WEBRip).*$/i, '');

  // Remove release group tags [RARBG], {YTS}, etc.
  cleaned = cleaned.replace(/[\[\{][^\]\}]+[\]\}]$/g, '');

  // Replace dots and underscores with spaces
  cleaned = cleaned.replace(/[._]/g, ' ');

  // Remove extra whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleaned;
};

/**
 * Extract folder name from a file path
 *
 * @param filePath - Full file path (e.g., "/movies/The Matrix (1999)/movie.mkv")
 * @returns The folder name (e.g., "The Matrix (1999)")
 */
export const getFolderNameFromPath = (filePath: string): string => {
  if (!filePath) return '';

  // Split by both forward and back slashes, remove empty parts
  const parts = filePath.split(/[\/\\]/).filter(Boolean);

  // Get the last directory (second to last part, as last part is the file)
  if (parts.length >= 2) {
    return parts[parts.length - 2];
  }

  return '';
};
