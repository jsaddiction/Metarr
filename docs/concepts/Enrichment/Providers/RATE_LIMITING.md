# Provider Rate Limiting

Rate limiting protects provider APIs from overload and ensures Metarr respects terms of service.

## Rate Limiter Architecture

### Token Bucket Algorithm

Metarr uses a sliding window token bucket algorithm:

```
┌─────────────────────────────────────────┐
│         Token Bucket                    │
│                                         │
│  Capacity: burstCapacity                │
│  Refill Rate: requestsPerSecond         │
│  Window: windowSeconds                  │
│                                         │
│  Request → Consume Token → Execute      │
│  No Token → Wait for Refill             │
└─────────────────────────────────────────┘
```

**Key Behaviors**:
1. **Sliding Window**: Tracks requests by timestamp, removes expired
2. **Burst Support**: High-priority requests use burst capacity
3. **Priority Queuing**: Webhook/user requests bypass standard limits

### Configuration

```typescript
interface RateLimiterConfig {
  requestsPerSecond: number;  // Base rate limit
  burstCapacity?: number;     // Max burst for high-priority
  windowSeconds?: number;     // Sliding window size
}
```

## Per-Provider Limits

### TMDB

**Official Limit**: 40 requests per 10 seconds

```typescript
{
  requestsPerSecond: 40,
  windowSeconds: 10,
  burstCapacity: 40
}
```

**Notes**:
- Limit applies per API key
- Embedded key shared across Metarr users
- Use `append_to_response` to batch data in single calls

### TVDB

**Official Limit**: ~100 requests per 10 seconds (undocumented)

```typescript
{
  requestsPerSecond: 10,  // Conservative
  burstCapacity: 50,
  windowSeconds: 10
}
```

**Notes**:
- JWT token with 24-hour expiry
- Token refresh handled automatically
- Conservative limit prevents 429 errors

### FanArt.tv

**Official Limits**:
- Project Key: 10 requests per second
- Personal Key: 20 requests per second

```typescript
{
  requestsPerSecond: hasPersonalKey ? 2 : 1,
  burstCapacity: hasPersonalKey ? 10 : 5,
  windowSeconds: 1
}
```

**Notes**:
- Single call returns all asset types
- Personal key doubles rate limit
- Cache aggressively (content rarely changes)

### MusicBrainz

**Official Limit**: 1 request per second (strict)

```typescript
{
  requestsPerSecond: 1,
  burstCapacity: 1,  // No burst allowed
  windowSeconds: 1
}
```

**Critical Rules**:
- NO burst capacity
- NO priority queuing
- Sequential requests only
- Violation may result in IP ban

### OMDb

**Official Limits**:
- Free Tier: 1,000 requests per day
- Paid Tier: 100,000 requests per day ($1/month)

**Notes**:
- Daily limit, not per-second
- Cache aggressively (7-day TTL default)
- Consider paid tier for large libraries

### Local Provider

**Effective Limit**: Unlimited (filesystem access)

```typescript
{
  requestsPerSecond: 1000,
  burstCapacity: 10000
}
```

## Adaptive Backoff

### Exponential Backoff on 429 Errors

When a provider returns 429 (rate limit exceeded):

```
Attempt 1: Wait 1s   (BASE_BACKOFF_MS)
Attempt 2: Wait 2s   (BASE_BACKOFF_MS * 2^1)
Attempt 3: Wait 4s   (BASE_BACKOFF_MS * 2^2)
Attempt 4: Wait 8s   (BASE_BACKOFF_MS * 2^3)
Attempt 5: Wait 16s  (BASE_BACKOFF_MS * 2^4)
Max:       Wait 30s  (MAX_BACKOFF_MS)
```

**Configuration**:
```typescript
{
  BASE_BACKOFF_MS: 1000,      // 1 second
  MAX_BACKOFF_MS: 30000,      // 30 seconds
  USER_MAX_RETRIES: 2,        // User-initiated
  BACKGROUND_MAX_RETRIES: 5   // Background jobs
}
```

### Retry-After Header Support

If provider includes `Retry-After` header:
```typescript
const retryAfter = parseInt(response.headers['retry-after'], 10);
if (retryAfter > 0) {
  await delay(retryAfter * 1000);
} else {
  await delay(baseBackoff * Math.pow(2, attempt));
}
```

## Circuit Breaker Pattern

### Purpose

Prevents cascading failures by stopping requests to failing providers:
- Protects provider from additional load
- Prevents wasted requests during outages
- Allows automatic recovery testing

### States

```
CLOSED (Normal)
├─ All requests allowed
├─ Failures tracked
└─ 5 consecutive failures → OPEN

OPEN (Failing)
├─ All requests rejected
├─ Error: ProviderUnavailableError
└─ After 5 minutes → HALF_OPEN

HALF_OPEN (Testing)
├─ Test request allowed
├─ Success → CLOSED
└─ Failure → OPEN
```

### Configuration

```typescript
{
  FAILURE_THRESHOLD: 5,            // Open after 5 consecutive failures
  RESET_TIMEOUT_MS: 5 * 60 * 1000, // 5 minutes
  REQUIRED_SUCCESS_COUNT: 2        // 2 successes to close
}
```

### Error Response

When circuit is open:
```json
{
  "error": "ProviderUnavailableError",
  "message": "Circuit breaker is open for tmdb",
  "provider": "tmdb",
  "state": "open",
  "failureCount": 5,
  "resetIn": 240000
}
```

## Best Practices

### Minimize API Calls

1. **Batch with append_to_response** (TMDB): Fetch credits, images, videos in one call
2. **Use extended endpoints** (TVDB): Get all data in single request
3. **Single call strategy** (FanArt.tv): One endpoint returns all asset types

### Caching Strategy

- **TMDB/TVDB**: 24-48 hour cache for metadata
- **FanArt.tv**: Cache indefinitely (content rarely changes)
- **OMDb**: 7-day cache to extend daily quota
- **MusicBrainz**: Cache indefinitely

### Priority Management

Reserve burst capacity for:
- Webhook-triggered enrichment (immediate user action)
- Manual enrichment requests
- UI-initiated operations

Background jobs should:
- Respect standard rate limits
- Run during off-peak hours
- Use lower concurrency

## Related Documentation

- [Provider Overview](./README.md) - Provider capabilities and selection
- [Enrichment](../README.md) - How rate limiting affects enrichment
- [Implementation Details](../../../implementation/Providers/) - Provider-specific implementations
