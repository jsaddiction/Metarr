# Trailer Services

Services for managing trailer downloads and configuration.

## VideoDownloaderConfigService

Manages YouTube cookie configuration for yt-dlp authentication.

### Purpose

- Store YouTube cookies securely for authenticated trailer downloads
- Validate cookies by testing with yt-dlp
- Manage temporary cookie files for yt-dlp processes
- Track configuration status (unconfigured/valid/expired/error)

### Key Methods

- `getCookies()` - Retrieve stored cookies (decrypted)
- `setCookies(cookieText)` - Store cookies in Netscape format
- `clearCookies()` - Remove stored cookies
- `getStatus()` - Get current configuration status
- `validateCookies(testUrl?)` - Test cookies with yt-dlp
- `writeCookiesToTempFile(cookieText?)` - Create temp file for yt-dlp
- `cleanupTempFile(path)` - Remove temporary file
- `cleanupAllTempFiles()` - Clean up all tracked temp files

### Database Table

```sql
video_downloader_config (
  id INTEGER PRIMARY KEY,
  config_type TEXT NOT NULL UNIQUE,
  config_data TEXT,
  status TEXT DEFAULT 'unconfigured',
  status_message TEXT,
  last_validated_at TIMESTAMP,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
```

### Status Values

- `unconfigured` - No cookies configured
- `valid` - Cookies validated successfully
- `expired` - Cookies expired or invalid
- `error` - Validation or system error

### Cookie Format

Expects Netscape HTTP Cookie File format:

```
# Netscape HTTP Cookie File
.youtube.com    TRUE    /    TRUE    0    cookie_name    cookie_value
```

### Security

- Cookies stored encrypted in database (currently base64, placeholder for proper encryption)
- Temporary files created with random names in system temp directory
- Automatic cleanup of temp files after use

### Usage Example

```typescript
const configService = new VideoDownloaderConfigService(dbManager);

// Store cookies
await configService.setCookies(netscapeCookieText);

// Validate cookies
const { valid, message } = await configService.validateCookies();

// Use cookies for download
const tempFile = await configService.writeCookiesToTempFile();
// ... use tempFile with yt-dlp --cookies flag
await configService.cleanupTempFile(tempFile);
```

### Testing

Unit tests verify:
- Service instantiation
- Temporary file creation and cleanup
- Basic validation logic

Integration tests (to be added) should verify:
- Database storage and retrieval
- Encryption/decryption
- yt-dlp validation

### Future Enhancements

- Proper encryption using app secret (replace base64 placeholder)
- Automatic cookie refresh detection
- Cookie expiration warnings
- Multiple cookie configurations for different services
