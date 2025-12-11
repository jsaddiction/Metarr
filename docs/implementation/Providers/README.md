# Provider Implementation

Provider-specific implementation details including API endpoints, data mapping, authentication, and quirks.

## Provider Documentation

| Provider | Document | Status |
|----------|----------|--------|
| TMDB | [TMDB.md](./TMDB.md) | Complete |
| TVDB | [TVDB.md](./TVDB.md) | Complete |
| OMDb | [OMDB.md](./OMDB.md) | Complete |
| FanArt.tv | [FANART.md](./FANART.md) | Complete |
| MusicBrainz | [MUSICBRAINZ.md](./MUSICBRAINZ.md) | Planned |
| Local | [LOCAL.md](./LOCAL.md) | Complete |

## Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `ProviderManager` | `src/services/providers/ProviderManager.ts` | Provider orchestration |
| `RateLimiter` | `src/services/providers/utils/RateLimiter.ts` | Rate limiting |
| `CircuitBreaker` | `src/services/providers/utils/CircuitBreaker.ts` | Fault tolerance |
| `TMDBClient` | `src/services/providers/TMDBClient.ts` | TMDB API client |
| `TVDBClient` | `src/services/providers/TVDBClient.ts` | TVDB API client |
| `OMDbClient` | `src/services/providers/OMDbClient.ts` | OMDb API client |
| `FanartClient` | `src/services/providers/FanartClient.ts` | FanArt.tv API client |
| `LocalProvider` | `src/services/providers/LocalProvider.ts` | Local NFO/asset parser |

## Conceptual Documentation

For provider concepts, capabilities, and rate limiting strategies, see:

- [Provider Concepts](../../concepts/Enrichment/Providers/README.md)
- [Rate Limiting Concepts](../../concepts/Enrichment/Providers/RATE_LIMITING.md)

## Related Documentation

- [Enrichment](../../concepts/Enrichment/README.md) - How providers integrate
- [Asset Management](../../architecture/ASSET_MANAGEMENT/) - Asset tier system
