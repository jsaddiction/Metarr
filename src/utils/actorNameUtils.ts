/**
 * Actor Name Utility
 *
 * Provides consistent name normalization for actor matching across:
 * - NFO parsing
 * - .actors directory scanning
 * - Provider (TMDB/TVDB) enrichment
 * - Database lookups
 *
 * Normalization Strategy:
 * 1. Unicode NFD decomposition (é → e + combining accent)
 * 2. Remove diacritical marks (combining accents)
 * 3. Lowercase
 * 4. Remove all non-alphanumeric characters (spaces, punctuation, etc.)
 *
 * Examples:
 * - "Tom Hanks" → "tomhanks"
 * - "Penélope Cruz" → "penelopecruz"
 * - "Robert Downey Jr." → "robertdowneyjr"
 * - "Lupita Nyong'o" → "lupitanyongo"
 * - "Xuē Zhīqiān" → "xuezhiqian"
 *
 * Known Limitations:
 * - "Michael B. Jordan" and "Michael Jordan" both → "michaeljordan"
 * - "Chris Evans" (actor) and "Chris Evans" (radio host) → "chrisevans"
 * - These collisions require manual user intervention or TMDB ID matching
 */

/**
 * Normalize an actor name for database matching
 *
 * IMPORTANT: Use this function consistently for:
 * - Inserting into actors.name_normalized
 * - Looking up existing actors
 * - Comparing names from different sources
 *
 * @param name - Actor's full name (e.g., "Tom Hanks")
 * @returns Normalized name for matching (e.g., "tomhanks")
 */
export function normalizeActorName(name: string): string {
  if (!name || typeof name !== 'string') {
    return '';
  }

  return name
    .normalize('NFD') // Decompose accented characters (é → e + ´)
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritical marks
    .toLowerCase() // Lowercase everything
    .replace(/[^a-z0-9]/g, '') // Remove all non-alphanumeric (spaces, punctuation)
    .trim();
}

/**
 * Sanitize actor display name
 *
 * Cleans up filenames and other sources to create a proper display name:
 * - Replaces underscores with spaces
 * - Removes multiple consecutive spaces
 * - Trims whitespace
 * - Preserves capitalization
 *
 * Examples:
 * - "Tom_Hanks" → "Tom Hanks"
 * - "Adriane_Lenox" → "Adriane Lenox"
 * - "Robert__Downey" → "Robert Downey"
 *
 * @param name - Raw name (possibly from filename)
 * @returns Sanitized display name
 */
export function sanitizeActorDisplayName(name: string): string {
  if (!name || typeof name !== 'string') {
    return '';
  }

  return name
    .replace(/_+/g, ' ') // Replace underscores with spaces
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .trim();
}

/**
 * Extract actor name from filename and sanitize for display
 *
 * Common patterns:
 * - "Tom Hanks.jpg" → "Tom Hanks"
 * - "Tom_Hanks.jpg" → "Tom Hanks"
 * - "tom_hanks.jpg" → "tom hanks" (preserves original case)
 *
 * @param filename - Filename without path (e.g., "Tom Hanks.jpg")
 * @returns Sanitized actor name for display
 */
export function extractActorNameFromFilename(filename: string): string {
  // Remove file extension
  const nameWithoutExt = filename.replace(/\.[^.]+$/, '');

  // Sanitize and return
  return sanitizeActorDisplayName(nameWithoutExt);
}

/**
 * Check if two actor names are likely the same person
 *
 * Uses normalized comparison, which may have false positives
 * (e.g., "Michael Jordan" vs "Michael B. Jordan")
 *
 * @param nameA - First actor name
 * @param nameB - Second actor name
 * @returns true if normalized names match
 */
export function actorNamesMatch(nameA: string, nameB: string): boolean {
  return normalizeActorName(nameA) === normalizeActorName(nameB);
}
