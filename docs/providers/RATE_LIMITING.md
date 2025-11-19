# Provider Rate Limiting

**Purpose**: THE canonical documentation for rate limiting across all providers, including adaptive backoff, circuit breakers, and error handling.

**Related Docs**:
- [Provider Overview](./OVERVIEW.md) - Provider capabilities and comparison
- [Circuit Breaker Source](../../src/services/providers/utils/CircuitBreaker.ts) - Implementation
- [Rate Limiter Source](../../src/services/providers/utils/RateLimiter.ts) - Implementation

## Quick Reference

**Rate Limit Summary**:
```
Provider      │ Limit          │ Window  │ Burst Capacity │ Priority Support
──────────────┼────────────────┼─────────┼────────────────┼──────────────────
TMDB          │ 40 req         │ 10s     │ 40             │ Yes
TVDB          │ 30 req         │ 10s     │ 50             │ Yes
FanArt.tv     │ 10 req (20*)   │ 1s      │ 50 (100*)      │ Yes
MusicBrainz   │ 1 req          │ 1s      │ 1              │ No (strict)
TheAudioDB    │ 30 req         │ 60s     │ N/A            │ No
IMDb          │ 1 req          │ 1s      │ 1              │ No (cautious)
Local         │ 1000 req       │ 1s      │ 10000          │ N/A

* With personal API key
```

**Request Priorities**:
- **webhook**: Highest priority, uses burst capacity
- **user**: High priority, uses burst capacity
- **background**: Normal priority, respects standard limits

## Rate Limiter Architecture

### Token Bucket Algorithm

Metarr uses a sliding window token bucket algorithm for rate limiting:

```
┌─────────────────────────────────────────┐
│         Token Bucket                    │
│                                         │
│  Capacity: burstCapacity                │
│  Refill Rate: requestsPerSecond         │
│  Window: windowSeconds                  │
│                                         │
│  ┌──────────────────┐                  │
│  │ Available Tokens │                  │
│  │      [####]      │                  │
│  └──────────────────┘                  │
│                                         │
│  Request → Consume Token → Execute     │
│  No Token → Wait for Refill            │
└─────────────────────────────────────────┘
```

**Key Behaviors**:
1. **Sliding Window**: Tracks requests by timestamp, removes expired requests
2. **Burst Support**: High-priority requests can use burst capacity
3. **Automatic Cleanup**: Periodic cleanup prevents memory accumulation
4. **Priority Queuing**: Webhook/user requests bypass standard limits

### Implementation Details

**RateLimiter Configuration**:
```typescript
interface RateLimiterConfig {
  requestsPerSecond: number;  // Base rate limit
  burstCapacity?: number;     // Max burst for high-priority
  windowSeconds?: number;     // Sliding window size
}
```

**Request Priority Handling**:
```typescript
// Webhook and user requests use burst capacity
const limit = priority === 'webhook' || priority === 'user'
  ? this.burstCapacity
  : this.maxRequests;
```

## Per-Provider Rate Limits

### TMDB

**Official Limit**: 40 requests per 10 seconds

**Configuration**:
```typescript
{
  requestsPerSecond: 40,
  windowSeconds: 10,
  burstCapacity: 40
}
```

**Notes**:
- Limit applies per API key
- Embedded key shared across all Metarr users
- Personal key recommended for heavy usage
- 429 errors trigger exponential backoff

**Recommended Usage**:
- Webhook priority: Use burst for immediate response
- User actions: Standard rate
- Background enrichment: Batched with delays

### TVDB

**Official Limit**: ~100 requests per 10 seconds (undocumented)

**Conservative Configuration**:
```typescript
{
  requestsPerSecond: 10,
  burstCapacity: 50,
  windowSeconds: 10
}
```

**Notes**:
- JWT token required (24-hour expiry)
- Token refresh handled automatically
- Rate limit is per token, not per IP
- Conservative limit prevents 429 errors

**Token Management**:
- Tokens cached in memory
- Refresh 2 hours before expiry
- Automatic re-authentication on 401

### FanArt.tv

**Official Limits**:
- **Project Key**: 10 requests per second
- **Personal Key**: 20 requests per second

**Configuration**:
```typescript
{
  requestsPerSecond: hasPersonalKey ? 2 : 1,
  burstCapacity: hasPersonalKey ? 10 : 5,
  windowSeconds: 1
}
```

**Notes**:
- Strictest rate limit of major providers
- Personal key doubles rate limit
- No daily limit
- Curated content, limited API calls needed

**Best Practices**:
- Fetch all asset types in single call (movies endpoint returns all types)
- Cache aggressively
- Use Local provider fallback for rapid access

### MusicBrainz

**Official Limit**: 1 request per second (strict)

**Configuration**:
```typescript
{
  requestsPerSecond: 1,
  burstCapacity: 1,
  windowSeconds: 1
}
```

**Notes**:
- Strictest rate limit
- Open database, no API key required
- User-Agent required (app name + version + contact)
- Violating rate limit may result in IP ban

**Critical**:
- NO burst capacity
- NO priority queuing
- Sequential requests only
- Minimum 1000ms between requests

### TheAudioDB

**Official Limit**: 30 requests per 60 seconds (free tier)

**Configuration**:
```typescript
{
  requestsPerSecond: 0.5,  // 30 per 60s
  windowSeconds: 60
}
```

**Notes**:
- API key required (no embedded key)
- Free tier only
- Patreon supporters get higher limits
- Metadata + images provider

### Local Provider

**Effective Limit**: Unlimited (filesystem access)

**Configuration**:
```typescript
{
  requestsPerSecond: 1000,
  burstCapacity: 10000
}
```

**Notes**:
- No external API calls
- Limited only by disk I/O
- No rate limiting needed
- Used for NFO parsing and asset discovery

## Adaptive Backoff Algorithm

### Exponential Backoff on 429 Errors

When a provider returns 429 (rate limit exceeded), Metarr implements exponential backoff:

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
  BACKOFF_BASE: 2,            // 2^attempt
  USER_MAX_RETRIES: 2,        // User-initiated
  BACKGROUND_MAX_RETRIES: 5   // Background jobs
}
```

**Retry Logic**:
1. Provider returns 429
2. Extract `Retry-After` header if present
3. Calculate backoff: `min(Retry-After || baseBackoff * 2^attempt, MAX_BACKOFF_MS)`
4. Wait calculated duration
5. Retry request
6. If max retries exceeded, fail request

### Retry-After Header Support

If provider includes `Retry-After` header:
```typescript
const retryAfter = parseInt(response.headers['retry-after'], 10);
if (retryAfter > 0) {
  await delay(retryAfter * 1000);
} else {
  // Fall back to exponential backoff
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
┌─────────────────────────────────────────────────┐
│                                                 │
│  CLOSED (Normal)                                │
│  ├─ All requests allowed                        │
│  ├─ Failures tracked                            │
│  └─ Threshold reached → OPEN                    │
│                                                 │
│  OPEN (Failing)                                 │
│  ├─ All requests rejected                       │
│  ├─ Error: ProviderUnavailableError             │
│  └─ After resetTimeout → HALF_OPEN              │
│                                                 │
│  HALF_OPEN (Testing)                            │
│  ├─ Test request allowed                        │
│  ├─ Success → CLOSED                            │
│  └─ Failure → OPEN                              │
│                                                 │
└─────────────────────────────────────────────────┘
```

### Configuration

```typescript
{
  FAILURE_THRESHOLD: 5,            // Open after 5 consecutive failures
  RESET_TIMEOUT_MS: 5 * 60 * 1000, // 5 minutes
  REQUIRED_SUCCESS_COUNT: 2        // 2 successes to close
}
```

### State Transitions

**CLOSED → OPEN**:
- Trigger: 5 consecutive failures
- Action: Reject all requests
- Schedule: Reset after 5 minutes

**OPEN → HALF_OPEN**:
- Trigger: Reset timeout elapsed
- Action: Allow test request
- Reset: Failure counter to 0

**HALF_OPEN → CLOSED**:
- Trigger: 2 consecutive successes
- Action: Resume normal operation
- Reset: All counters to 0

**HALF_OPEN → OPEN**:
- Trigger: Any failure during testing
- Action: Re-open circuit
- Schedule: New reset timeout

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

## See Also

- [Provider Overview](./OVERVIEW.md) - Provider capabilities and comparison
- [Enrichment Phase](../phases/ENRICHMENT.md) - How rate limiting affects enrichment
- [Provider Source Code](../../src/services/providers/) - Implementation details
- [Circuit Breaker Pattern](https://martinfowler.com/bliki/CircuitBreaker.html) - Pattern explanation
