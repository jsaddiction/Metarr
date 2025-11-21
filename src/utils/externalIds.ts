/**
 * External ID URL Building Utilities
 *
 * Builds full URLs from external site IDs (provider IDs, social media, data sources).
 * IDs are stored as stubs in the database (e.g., "inception" for Facebook, not full URL).
 * This allows URL patterns to be updated if sites change domains without database migrations.
 */

/**
 * URL patterns for external sites
 * Maps site name to function that builds the full URL from an ID
 */
const EXTERNAL_ID_PATTERNS: Record<string, (id: string) => string> = {
  // Provider IDs
  tmdb: (id) => `https://www.themoviedb.org/movie/${id}`,
  imdb: (id) => `https://www.imdb.com/title/${id}`,
  tvdb: (id) => `https://www.thetvdb.com/dereferrer/movie/${id}`,

  // Social media
  facebook: (id) => `https://www.facebook.com/${id}`,
  instagram: (id) => `https://www.instagram.com/${id}`,
  twitter: (id) => `https://twitter.com/${id}`,

  // Data sources
  wikidata: (id) => `https://www.wikidata.org/wiki/${id}`,
};

/**
 * Builds a full URL from a site name and ID
 *
 * @param site - Site name (tmdb, imdb, facebook, etc.)
 * @param id - ID on that site (can be number or string)
 * @returns Full URL, or the ID itself if pattern not found
 *
 * @example
 * buildExternalUrl('tmdb', 27205) // => "https://www.themoviedb.org/movie/27205"
 * buildExternalUrl('facebook', 'inception') // => "https://www.facebook.com/inception"
 * buildExternalUrl('unknown_site', '123') // => "123" (fallback)
 */
export function buildExternalUrl(site: string, id: string | number): string {
  const pattern = EXTERNAL_ID_PATTERNS[site.toLowerCase()];
  return pattern ? pattern(String(id)) : String(id);
}

/**
 * Builds multiple external URLs from an object of site IDs
 *
 * @param externalIds - Object with site names as keys and IDs as values
 * @returns Object with site names as keys and full URLs as values
 *
 * @example
 * buildExternalUrls({
 *   tmdb_id: 27205,
 *   imdb_id: 'tt1375666',
 *   facebook_id: 'inception'
 * })
 * // => {
 * //   tmdb_url: "https://www.themoviedb.org/movie/27205",
 * //   imdb_url: "https://www.imdb.com/title/tt1375666",
 * //   facebook_url: "https://www.facebook.com/inception"
 * // }
 */
export function buildExternalUrls(
  externalIds: Record<string, string | number | null>
): Record<string, string | null> {
  const urls: Record<string, string | null> = {};

  for (const [key, id] of Object.entries(externalIds)) {
    if (id === null || id === undefined) {
      urls[key.replace('_id', '_url')] = null;
      continue;
    }

    // Extract site name from key (e.g., "tmdb_id" => "tmdb")
    const site = key.replace('_id', '');
    const url = buildExternalUrl(site, id);
    urls[`${site}_url`] = url;
  }

  return urls;
}

/**
 * Gets the list of supported external sites
 *
 * @returns Array of supported site names
 */
export function getSupportedSites(): string[] {
  return Object.keys(EXTERNAL_ID_PATTERNS);
}
