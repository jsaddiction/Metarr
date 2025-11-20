/**
 * Sort Title Generation Utilities
 *
 * Generates sort titles for movies by stripping leading English articles
 * and moving them to the end with a comma separator.
 *
 * This follows library science best practices and Kodi NFO conventions,
 * ensuring consistent alphabetical sorting regardless of user's Kodi
 * "ignore articles" setting.
 *
 * Examples:
 * - "The Matrix" → "Matrix, The"
 * - "A Clockwork Orange" → "Clockwork Orange, A"
 * - "An American Tail" → "American Tail, An"
 * - "Avatar" → "Avatar" (no change)
 *
 * Note: Kodi applies article-stripping to <sorttitle> values when
 * "ignore articles" is enabled. By pre-stripping and moving articles
 * to the end, we ensure the title sorts correctly whether or not the
 * user has article-ignoring enabled.
 *
 * Limitation: English-only. Does not handle international articles
 * like "Le", "La", "Der", "Das", "Los", etc.
 */

/**
 * Generate a sort title by stripping leading English articles
 * and moving them to the end with comma separator
 *
 * @param title - Original movie title
 * @returns Sort title with articles moved to end, or original title if no article found
 *
 * @example
 * generateSortTitle("The Matrix") // Returns "Matrix, The"
 * generateSortTitle("A Clockwork Orange") // Returns "Clockwork Orange, A"
 * generateSortTitle("Avatar") // Returns "Avatar"
 */
export function generateSortTitle(title: string): string {
  if (!title || typeof title !== 'string') {
    return title;
  }

  // Trim whitespace
  const trimmed = title.trim();
  if (!trimmed) {
    return title;
  }

  // Match leading article followed by space and remaining title
  // Case-insensitive, captures article and remainder
  const match = trimmed.match(/^(The|A|An)\s+(.+)$/i);

  if (match) {
    const article = match[1]; // Preserve original capitalization
    const remainder = match[2];

    // Move article to end with comma separator
    return `${remainder}, ${article}`;
  }

  // No article found, return as-is
  return trimmed;
}

/**
 * Check if a title starts with an English article
 *
 * @param title - Title to check
 * @returns True if title starts with "The", "A", or "An" (case-insensitive)
 */
export function startsWithArticle(title: string): boolean {
  if (!title || typeof title !== 'string') {
    return false;
  }

  const trimmed = title.trim();
  return /^(The|A|An)\s+/i.test(trimmed);
}

/**
 * Validate that a sort title is properly formatted
 * (article at end with comma, or no article present)
 *
 * @param sortTitle - Sort title to validate
 * @returns True if sort title is valid format
 */
export function isValidSortTitle(sortTitle: string): boolean {
  if (!sortTitle || typeof sortTitle !== 'string') {
    return false;
  }

  const trimmed = sortTitle.trim();
  if (!trimmed) {
    return false;
  }

  // Check if it starts with an article (invalid for sort title)
  if (startsWithArticle(trimmed)) {
    return false;
  }

  // Valid if it doesn't start with article (either has article at end, or no article at all)
  return true;
}
