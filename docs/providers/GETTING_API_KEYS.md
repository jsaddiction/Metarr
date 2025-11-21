# Getting Provider API Keys

**Purpose**: Step-by-step guide to obtain personal API keys for supported providers.

**Related Docs**:
- [Provider Overview](./OVERVIEW.md) - Provider capabilities and benefits
- [Configuration](../getting-started/CONFIGURATION.md) - How to configure API keys

## Do You Need Personal API Keys?

**Short Answer**: No, for most users.

Metarr includes embedded API keys for all providers except TheAudioDB and OMDb. Personal keys are optional and provide these benefits:

| Provider | Embedded Key | Personal Key Benefit |
|----------|--------------|---------------------|
| **TMDB** |  | Usage tracking, support community |
| **TVDB** |  | Usage tracking, support community |
| **OMDb** |  | 100x rate limit ($1/month: 100k/day vs 1k/day) |
| **FanArt.tv** |  | 2x rate limit (20 req/s vs 10 req/s) |
| **MusicBrainz** | N/A | No API keys (open database) |
| **TheAudioDB** |  | Required for music artwork |

**When to Get Personal Keys**:
1. **Large Library**: Enriching 1000+ items
2. **Frequent Updates**: Heavy automation workflows
3. **Support Providers**: Contribute to community projects
4. **Usage Tracking**: Monitor your API consumption
5. **TheAudioDB**: Required for music artwork

## TMDB API Key

### Benefits of Personal Key

- **Usage Dashboard**: Track your API calls
- **Support Community**: Help fund TMDB infrastructure
- **Same Rate Limit**: No speed increase (40 req/10s)
- **Better Attribution**: Requests tracked to your account

### Signup Steps

1. **Create Account**
   - Visit: https://www.themoviedb.org/signup
   - Fill in: username, email, password
   - Verify email address
   - Complete profile

2. **Request API Access**
   - Navigate to: https://www.themoviedb.org/settings/api
   - Click "Request an API Key"
   - Select type: "Developer"
   - Accept Terms of Use

3. **Fill Application Form**
   - **Application Name**: "Metarr" or your project name
   - **Application URL**: Your GitHub repo or website
   - **Application Summary**: "Personal media metadata management"
   - **Type**: Developer
   - Submit form

4. **Copy API Key (v3 auth)**
   - Keys appear immediately after approval
   - Copy "API Key (v3 auth)" (NOT the Read Access Token)
   - Format: 32-character hexadecimal string

5. **Configure in Metarr**
   ```bash
   # Add to .env file
   TMDB_API_KEY=your_32_character_api_key_here
   ```
   Or via Settings → Providers → TMDB → API Key

### Troubleshooting

**Application Denied**:
- Provide more detail in application summary
- Use real project URL (GitHub, personal site)
- Mention open-source/personal use

**Key Not Working**:
- Ensure using API Key (v3), not Read Access Token
- Check for extra spaces when copying
- Wait 5 minutes after key creation (cache propagation)

## TVDB API Key

### Benefits of Personal Key

- **Usage Tracking**: Monitor API consumption
- **Support Community**: Help fund TVDB
- **Same Rate Limit**: No speed increase
- **Subscriber Perks**: If TVDB subscriber, unlock premium features (PIN required)

### Signup Steps

1. **Create Account**
   - Visit: https://thetvdb.com/register
   - Fill in: email, username, password
   - Verify email address

2. **Navigate to API Dashboard**
   - Login to: https://thetvdb.com/dashboard
   - Click "API Keys" in sidebar

3. **Create New API Key**
   - Click "Create API Key"
   - **Key Name**: "Metarr" or your project name
   - **Description**: "Personal media management"
   - Click "Generate Key"

4. **Copy API Key**
   - Format: 32-character hexadecimal string
   - Store securely (cannot be viewed again after closing)

5. **Get Subscriber PIN** (Optional, if TVDB subscriber)
   - Navigate to Account Settings
   - Copy your subscriber PIN (4-digit number)

6. **Configure in Metarr**
   ```bash
   # Add to .env file
   TVDB_API_KEY=your_32_character_api_key_here
   TVDB_PIN=1234  # Optional, for subscribers only
   ```
   Or via Settings → Providers → TVDB

### Troubleshooting

**401 Unauthorized**:
- Check API key for typos
- Regenerate key if lost
- Ensure key is active (not deleted)

**PIN Not Working**:
- Only for TVDB subscribers
- Must be active subscription
- Check subscription status at https://thetvdb.com/subscribe

## OMDb API Key

### Benefits of Personal Key

- **100x Rate Limit**: 100,000 req/day vs 1,000 req/day (huge!)
- **Support Creator**: Help fund OMDb development
- **Affordable**: Just $1/month via Patreon

**Recommendation**: Get personal key if enriching 50+ movies or using heavy automation.

### Signup Steps (Free Tier)

1. **Visit OMDb Website**
   - Visit: https://www.omdbapi.com/apikey.aspx

2. **Select Free Plan**
   - Choose "FREE! (1,000 daily limit)"
   - Enter your email address

3. **Verify Email**
   - Check your email inbox
   - Click verification link in email from OMDb

4. **Copy API Key**
   - API key displays in email
   - Format: 8-character alphanumeric (e.g., `k1234567`)
   - Store securely

5. **Configure in Metarr**
   ```bash
   # Add to .env file
   OMDB_API_KEY=your_api_key_here
   ```
   Or via Settings → Providers → OMDb → API Key

### Upgrade to Paid Tier ($1/month)

1. **Visit Patreon**
   - Visit: https://www.patreon.com/omdb

2. **Select $1/month Tier**
   - Review benefits (100,000 req/day)
   - Complete Patreon signup with payment method

3. **Receive Upgraded Key**
   - OMDb notified by Patreon
   - Log in to https://www.omdbapi.com/apikey.aspx
   - Your key is automatically upgraded
   - Rate limit increases to 100,000/day

4. **Update in Metarr**
   - Your existing API key works immediately
   - No configuration change needed
   - Metarr auto-detects higher rate limit

### Troubleshooting

**Email Not Received**:
- Check spam/junk folder
- Verify email address spelling
- Wait 5-10 minutes for delivery
- Try requesting new key

**Invalid API Key Error**:
- Ensure format is 8 characters (e.g., `k1234567`)
- Check for spaces before/after key
- Copy carefully from original email
- Test at: https://www.omdbapi.com/?i=tt0111161&apikey=YOUR_KEY

**Still on Free Tier After Patreon Signup**:
- Wait 24 hours for upgrade to propagate
- Check Patreon subscription status
- Contact OMDb support with Patreon confirmation

**Rate Limit Still 1,000/day**:
- Restart Metarr to reload configuration
- Verify key in Settings shows upgraded status
- Wait 1 hour for cache to clear

## FanArt.tv Personal API Key

### Benefits of Personal Key

- **2x Rate Limit**: 20 req/s vs 10 req/s (significant!)
- **Priority Access**: New images available faster
- **Support Community**: Help fund FanArt.tv servers

**Recommendation**: Get personal key if enriching 100+ movies/shows.

### Signup Steps

1. **Request API Key**
   - Visit: https://fanart.tv/get-an-api-key/
   - No account creation needed
   - Fill out request form:
     - **Name**: Your name
     - **Email**: Your email
     - **Application**: "Metarr - Personal media management"
     - **Website**: GitHub or personal site (optional)

2. **Wait for Approval**
   - Typical wait: 1-3 business days
   - Email notification when approved
   - Manual approval process (be patient)

3. **Copy API Key from Email**
   - Format: 32-character hexadecimal string
   - Store securely

4. **Configure in Metarr**
   ```bash
   # Add to .env file
   FANART_PERSONAL_KEY=your_32_character_api_key_here
   ```
   Or via Settings → Providers → FanArt.tv → Personal API Key

### Troubleshooting

**Application Not Approved**:
- Provide legitimate use case
- Mention supporting the project
- Include website/GitHub repo
- Contact via FanArt.tv forum for status

**Key Not Working**:
- Check for typos when copying
- Ensure using as `client_key` parameter (Metarr handles this)
- Wait 24 hours after approval (cache propagation)

**Still Only 10 req/s**:
- Verify key is configured as Personal Key, not Project Key
- Restart Metarr after adding key
- Check logs for "hasPersonalKey: true"

## TheAudioDB API Key

### Requirements

**API Key**: Required for all TheAudioDB access (no embedded key)

### Signup Steps

1. **Visit API Documentation**
   - Visit: https://www.theaudiodb.com/api_guide.php
   - Read API guide

2. **Support via Patreon**
   - TheAudioDB is Patreon-funded
   - Free tier: Limited API key
   - Visit: https://www.patreon.com/thedatadb
   - Request free API key or support with donation

3. **Receive API Key**
   - Free tier key sent via email
   - Supporters get higher rate limits
   - Format: Usually "1" for free tier, longer string for supporters

4. **Configure in Metarr**
   ```bash
   # Add to .env file
   THEAUDIODB_API_KEY=your_api_key_here
   ```
   Or via Settings → Providers → TheAudioDB → API Key

### Troubleshooting

**No Free Key Available**:
- Consider Patreon support ($1/month)
- Alternative: Use Last.fm API for music images
- TheAudioDB reserves right to limit free keys

**Rate Limit Too Low**:
- Free tier: 30 req/60s (slow)
- Supporter tier: Higher limits
- Consider supporting project

## MusicBrainz

**No API Key Needed**: MusicBrainz is fully open database.

**User-Agent Required**: App name, version, and contact
```bash
MUSICBRAINZ_USER_AGENT=Metarr/1.0.0 (https://github.com/youruser/metarr)
```

**Rate Limit**: 1 req/s (strict, no exceptions)

See [MUSICBRAINZ.md](./MUSICBRAINZ.md) for details.

## Configuration

### Environment Variables

Create or edit `.env` file in Metarr root directory:

```bash
# TMDB (optional)
TMDB_API_KEY=your_tmdb_key_here

# TVDB (optional)
TVDB_API_KEY=your_tvdb_key_here
TVDB_PIN=1234  # Optional, subscribers only

# OMDb (optional, but recommended)
OMDB_API_KEY=your_omdb_key_here

# FanArt.tv (optional)
FANART_PERSONAL_KEY=your_fanart_key_here

# TheAudioDB (required for music)
THEAUDIODB_API_KEY=your_theaudiodb_key_here

# MusicBrainz (optional, customize User-Agent)
MUSICBRAINZ_USER_AGENT=YourApp/1.0.0 (contact@example.com)
```

### UI Configuration

Alternative to environment variables:

1. Navigate to Settings → Providers
2. Click provider name (TMDB, TVDB, OMDb, etc.)
3. Enter API Key in text field
4. Click "Save"
5. Verify status shows "Connected"

### Verify Configuration

Check provider status:

```bash
# Via API
curl http://localhost:3000/api/providers/status

# Via UI
Settings → Providers → View Status
```

**Expected Output**:
```json
{
  "tmdb": {
    "enabled": true,
    "authenticated": true,
    "hasPersonalKey": true,
    "rateLimitRemaining": 38
  },
  "omdb": {
    "enabled": true,
    "authenticated": true,
    "rateLimitRemaining": 999,
    "rateLimitResetTime": "2024-11-22T00:00:00Z"
  },
  "fanart_tv": {
    "enabled": true,
    "authenticated": true,
    "hasPersonalKey": true,
    "rateLimit": 20
  }
}
```

## Security Best Practices

**DO**:
-  Store keys in `.env` file (gitignored)
-  Use environment variables in production
-  Rotate keys if compromised
-  Keep keys private

**DON'T**:
-  Commit keys to Git
-  Share keys publicly
-  Hardcode keys in source code
-  Use production keys in development

## See Also

- [Provider Overview](./OVERVIEW.md) - Provider capabilities
- [OMDB Provider](./OMDB.md) - OMDb integration details
- [TMDB Provider](./TMDB.md) - TMDB integration details
- [TVDB Provider](./TVDB.md) - TVDB integration details
- [FanArt.tv Provider](./FANART.md) - FanArt.tv integration details
- [MusicBrainz Provider](./MUSICBRAINZ.md) - MusicBrainz integration details
- [Configuration Guide](../getting-started/CONFIGURATION.md) - System configuration
