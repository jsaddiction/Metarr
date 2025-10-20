/**
 * Provider Display Name Utilities
 *
 * Maps internal provider names to their proper display names
 * as they appear on provider websites.
 */

const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  tmdb: 'TMDB',
  tvdb: 'TVDB',
  fanart_tv: 'FanArt.tv',
  local: 'Local Files',
  imdb: 'IMDb',
  musicbrainz: 'MusicBrainz',
  theaudiodb: 'TheAudioDB',
  custom: 'Custom Upload',
  manual: 'Manual',
};

/**
 * Get the proper display name for a provider
 * Falls back to title-casing the provider name if not found
 */
export function getProviderDisplayName(providerName: string | null | undefined): string {
  if (!providerName) return 'Unknown';

  // Check if we have a predefined display name
  const displayName = PROVIDER_DISPLAY_NAMES[providerName.toLowerCase()];
  if (displayName) return displayName;

  // Fallback: Title case the provider name
  return providerName
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Get all provider display names
 */
export function getAllProviderDisplayNames(): Record<string, string> {
  return { ...PROVIDER_DISPLAY_NAMES };
}
