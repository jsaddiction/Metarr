/**
 * Default Provider API Keys
 *
 * These are project-level API keys that Metarr uses when users haven't configured their own credentials.
 * These keys are provided by the services for open-source/project use with rate limits.
 *
 * Users can override these by setting their own API keys in environment variables or settings.
 */

export const DEFAULT_PROVIDER_CREDENTIALS = {
  /**
   * TMDB (The Movie Database)
   * - This is a project API key with standard rate limits (40 req/10sec)
   * - Users can get their own free API key at https://www.themoviedb.org/settings/api
   * - Personal keys have the same rate limits but allow tracking usage per user
   */
  tmdb: {
    apiKey: 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI3YjI3NGU4NGMxYTcwMmI0MjgwNzE1NGYzMDY5YTM5YSIsIm5iZiI6MTc1OTcxMjU2My42MjgsInN1YiI6IjY4ZTMxNTMzM2EwMTA1Njk4ZTljYWUwMiIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.QlDaF3o1hiiaWCecMZMqPARjlPKE_qY5v7jtvIbWOss',
    benefit: 'Personal API keys allow usage tracking and support the TMDB community'
  },

  /**
   * FanArt.tv
   * - This is a project API key with 10 req/sec rate limit
   * - Users can get personal API key at https://fanart.tv/get-an-api-key/
   * - Personal keys get 20 req/sec and priority access to new images
   */
  fanart_tv: {
    apiKey: '3eb0a83d9ff87da93a7759ed855f8027',
    benefit: 'Personal API keys get higher rate limits (20 req/sec vs 10 req/sec) and priority access to new images'
  },

  /**
   * TVDB (The TV Database)
   * - This is a project API key with standard rate limits (30 req/10sec)
   * - Users can get their own free API key at https://thetvdb.com/api-information
   * - Personal keys have the same rate limits but allow tracking usage per user
   */
  tvdb: {
    apiKey: 'f979eee9-be20-4c93-8df3-e9e9572ef628',
    benefit: 'Personal API keys allow usage tracking and support the TVDB community'
  }
} as const;

/**
 * Get default API key for a provider
 */
export function getDefaultApiKey(providerName: string): string | undefined {
  const provider = DEFAULT_PROVIDER_CREDENTIALS[providerName as keyof typeof DEFAULT_PROVIDER_CREDENTIALS];
  return provider?.apiKey;
}

/**
 * Get benefit message for using a personal API key
 */
export function getPersonalKeyBenefit(providerName: string): string | undefined {
  const provider = DEFAULT_PROVIDER_CREDENTIALS[providerName as keyof typeof DEFAULT_PROVIDER_CREDENTIALS];
  return provider?.benefit;
}

/**
 * Check if a provider has a default API key
 */
export function hasDefaultApiKey(providerName: string): boolean {
  return providerName in DEFAULT_PROVIDER_CREDENTIALS;
}
