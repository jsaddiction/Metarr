# Provider Configuration Schema

## Database Table

```sql
CREATE TABLE provider_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_name VARCHAR(50) NOT NULL UNIQUE, -- 'tmdb', 'tvdb', 'fanart_tv', etc.
  enabled BOOLEAN NOT NULL DEFAULT 0,

  -- API credentials
  api_key TEXT, -- Encrypted in production

  -- Enabled asset types (JSON array)
  enabled_asset_types TEXT NOT NULL DEFAULT '[]', -- ["poster", "fanart", "trailer"]

  -- Connection status
  last_test_at DATETIME,
  last_test_status VARCHAR(20), -- 'success', 'error', 'never_tested'
  last_test_error TEXT,

  -- Metadata
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(provider_name)
);

CREATE INDEX idx_provider_configs_enabled ON provider_configs(enabled);
```

## Provider Asset Types

### TMDB
```json
{
  "name": "tmdb",
  "displayName": "TMDB (The Movie Database)",
  "requiresApiKey": true,
  "baseUrl": "https://api.themoviedb.org/3",
  "rateLimit": { "requests": 40, "windowSeconds": 10 },
  "supportedAssetTypes": [
    { "type": "poster", "displayName": "Posters", "available": true },
    { "type": "fanart", "displayName": "Fanart (Backdrops)", "available": true },
    { "type": "trailer", "displayName": "Trailers (YouTube)", "available": true },
    { "type": "banner", "displayName": "Banners", "available": false },
    { "type": "clearlogo", "displayName": "ClearLogo", "available": false }
  ]
}
```

### TVDB
```json
{
  "name": "tvdb",
  "displayName": "TVDB (TheTVDB)",
  "requiresApiKey": true,
  "baseUrl": "https://api4.thetvdb.com/v4",
  "authType": "jwt",
  "rateLimit": { "requests": 30, "windowSeconds": 10 },
  "supportedAssetTypes": [
    { "type": "poster", "displayName": "Series Posters", "available": true },
    { "type": "fanart", "displayName": "Fanart", "available": true },
    { "type": "banner", "displayName": "Series Banners", "available": true },
    { "type": "season_poster", "displayName": "Season Posters", "available": true }
  ]
}
```

### FanArt.tv
```json
{
  "name": "fanart_tv",
  "displayName": "FanArt.tv",
  "requiresApiKey": false,
  "apiKeyOptional": true,
  "apiKeyBenefit": "Personal keys get higher rate limits and priority access",
  "baseUrl": "https://webservice.fanart.tv/v3",
  "rateLimit": { "requests": 10, "windowSeconds": 1 },
  "supportedAssetTypes": [
    { "type": "hdclearlogo", "displayName": "HD ClearLogo", "available": true },
    { "type": "clearart", "displayName": "ClearArt", "available": true },
    { "type": "hdclearart", "displayName": "HD ClearArt", "available": true },
    { "type": "cdart", "displayName": "CD Art", "available": true },
    { "type": "characterart", "displayName": "Character Art", "available": true }
  ]
}
```

## TypeScript Interfaces

```typescript
export interface ProviderConfig {
  id: number;
  providerName: string;
  displayName: string;
  enabled: boolean;
  apiKey?: string;
  enabledAssetTypes: string[]; // ['poster', 'fanart', 'trailer']
  lastTestAt?: string;
  lastTestStatus?: 'success' | 'error' | 'never_tested';
  lastTestError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderMetadata {
  name: string;
  displayName: string;
  requiresApiKey: boolean;
  apiKeyOptional?: boolean;
  apiKeyBenefit?: string;
  baseUrl: string;
  authType?: 'bearer' | 'jwt' | 'query_param';
  rateLimit: {
    requests: number;
    windowSeconds: number;
  };
  supportedAssetTypes: Array<{
    type: string;
    displayName: string;
    available: boolean;
  }>;
}

export interface TestConnectionRequest {
  apiKey?: string;
  enabledAssetTypes: string[];
}

export interface TestConnectionResponse {
  success: boolean;
  message?: string;
  error?: string;
}
```

## API Endpoints

### GET /api/providers
Returns all provider configurations with metadata

**Response:**
```json
{
  "providers": [
    {
      "config": {
        "id": 1,
        "providerName": "tmdb",
        "enabled": true,
        "apiKey": "***masked***",
        "enabledAssetTypes": ["poster", "fanart", "trailer"],
        "lastTestStatus": "success",
        "lastTestAt": "2025-10-08T20:30:00Z"
      },
      "metadata": {
        "name": "tmdb",
        "displayName": "TMDB (The Movie Database)",
        "requiresApiKey": true,
        "supportedAssetTypes": [...]
      }
    }
  ]
}
```

### GET /api/providers/:name
Returns single provider configuration

### POST /api/providers/:name
Update or create provider configuration

**Request:**
```json
{
  "enabled": true,
  "apiKey": "eyJhbGciOiJIUzI1NiJ9...",
  "enabledAssetTypes": ["poster", "fanart", "trailer"]
}
```

**Response:**
```json
{
  "success": true,
  "provider": {
    "id": 1,
    "providerName": "tmdb",
    "enabled": true,
    "enabledAssetTypes": ["poster", "fanart", "trailer"]
  }
}
```

### POST /api/providers/:name/test
Test connection without saving

**Request:**
```json
{
  "apiKey": "test_key_here",
  "enabledAssetTypes": ["poster", "fanart"]
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Successfully connected to TMDB API. Account: John Doe"
}
```

**Response (Error):**
```json
{
  "success": false,
  "error": "Invalid API key. Please check your credentials."
}
```

### DELETE /api/providers/:name
Disable provider and clear API key

**Response:**
```json
{
  "success": true,
  "message": "Provider disabled successfully"
}
```

## Hard-coded Rate Limits

Rate limits are stored in provider metadata (not user-configurable):

| Provider | Requests | Window | Notes |
|----------|----------|--------|-------|
| TMDB | 40 | 10s | Official documented limit |
| TVDB | 30 | 10s | Conservative estimate |
| FanArt.tv | 10 | 1s | Project API key limit |
| FanArt.tv (Personal) | 20 | 1s | Personal API key limit |

## Migration from .env to Database

On first application start:
1. Check if `provider_configs` table has any rows
2. If empty, migrate from `.env` file:
   - Read `TMDB_API_KEY` → Create TMDB config
   - Read `FANART_TV_API_KEY` → Create FanArt.tv config
3. Set `enabled = true` for any migrated providers
4. Log migration: "Migrated X providers from .env to database"

After migration, `.env` values serve as fallback only if database entry doesn't exist.
