# MusicBrainz Provider

**Purpose**: Open music database providing comprehensive metadata for artists, albums, and tracks.

**Related Docs**:
- [Provider Overview](./OVERVIEW.md) - Provider comparison
- [Rate Limiting](./RATE_LIMITING.md) - MusicBrainz rate limits (strict 1 req/s)
- [TheAudioDB Provider](./OVERVIEW.md#music) - Music artwork complement

## Quick Reference

**Capabilities**:
- **Metadata Only**: No artwork/images
- **Music-Specific**: Artists, albums, recordings, releases
- **Open Database**: No API key required
- **Comprehensive**: Discography, release dates, track listings, relationships

**API Details**:
- Base URL: `https://musicbrainz.org/ws/2`
- Auth: None (User-Agent required)
- Rate Limit: 1 request per second (strict)
- Documentation: https://musicbrainz.org/doc/MusicBrainz_API

**Critical**: User-Agent header required with app name, version, and contact info.

## Supported Features

### Entity Types

| Type | Search | Metadata | Notes |
|------|--------|----------|-------|
| Artist |  |  | Full support |
| Album (Release Group) |  |  | Full support |
| Track (Recording) |  |  | Full support |
| Release |  |  | Specific album versions |

### Metadata Fields

**Artists**:
- **Core**: name, sortName, disambiguation, type (person, group, character)
- **Biographical**: country, formed, disbanded, lifeSpan
- **Relationships**: band members, collaborations
- **IDs**: musicbrainz_id (MBID), external IDs

**Albums (Release Groups)**:
- **Core**: title, primaryType (album, single, EP), secondaryTypes
- **Dates**: firstReleaseDate, releases (all versions)
- **Artists**: artist credits
- **IDs**: MBID, release group ID

**Tracks (Recordings)**:
- **Core**: title, duration, isrc
- **Relationships**: artists, writers, producers
- **Releases**: Which albums include this track
- **IDs**: MBID, recording ID

**Not Provided**:
- Images (use TheAudioDB or Last.fm)
- Lyrics
- Genres (use tags, but inconsistent)

## Key Endpoints Used

### Search

**Artist Search**:
```
GET /artist?query={name}&fmt=json
```

**Release Group Search** (Albums):
```
GET /release-group?query={album}+AND+artist:{artist}&fmt=json
```

**Recording Search** (Tracks):
```
GET /recording?query={track}+AND+artist:{artist}&fmt=json
```

### Metadata

**Artist Details**:
```
GET /artist/{mbid}?inc=releases+release-groups+recordings&fmt=json
```

**Release Group Details**:
```
GET /release-group/{mbid}?inc=artists+releases+tags&fmt=json
```

**Recording Details**:
```
GET /recording/{mbid}?inc=artists+releases+isrcs&fmt=json
```

## Authentication

**None Required**: MusicBrainz is open database, no API key needed.

**User-Agent Required** (Critical):
```typescript
const headers = {
  'User-Agent': 'Metarr/1.0.0 (https://github.com/youruser/metarr)'
};
```

**Format**: `AppName/Version (Contact)`

**Why Required**: MusicBrainz tracks usage by User-Agent and bans clients without proper identification.

**Configuration**:
```bash
# Optional: Custom User-Agent
MUSICBRAINZ_USER_AGENT=YourApp/1.0.0 (contact@example.com)
```

**Default**:
```typescript
const USER_AGENT = process.env.MUSICBRAINZ_USER_AGENT
  || 'Metarr/1.0.0 (https://github.com/metarr)';
```

## Rate Limiting

**Official Limit**: 1 request per second (strict)

**Critical Rules**:
1. **No Burst**: Exactly 1 req/s, no burst capacity
2. **No Exceptions**: High-priority requests don't bypass limit
3. **IP-Based**: Violation may result in IP ban
4. **Minimum Delay**: 1000ms between requests

**Metarr Configuration**:
```typescript
{
  requestsPerSecond: 1,
  burstCapacity: 1,     // No burst allowed
  windowSeconds: 1
}
```

**Best Practices**:
1. **Sequential Only**: Never parallel requests
2. **Cache Everything**: MusicBrainz data stable, cache indefinitely
3. **Batch Lookups**: Use inc= parameter to get related data
4. **Off-Peak**: Run bulk enrichment during off-peak hours

**Example Sequential**:
```typescript
// Good: Sequential with delays
const artist = await mbClient.getArtist(mbid);
await delay(1000);
const releases = await mbClient.getReleases(mbid);
await delay(1000);

// Bad: Parallel (will trigger rate limit)
const [artist, releases] = await Promise.all([
  mbClient.getArtist(mbid),
  mbClient.getReleases(mbid)
]); // DON'T DO THIS
```

See [RATE_LIMITING.md](./RATE_LIMITING.md) for complete documentation.

## Quirks and Workarounds

### Release vs Release Group

**Issue**: MusicBrainz distinguishes "Release Group" (abstract album) from "Release" (specific version)

**Solution**: Use Release Group for album metadata
```typescript
// Release Group = "Dark Side of the Moon" (album)
// Releases = US CD, UK Vinyl, Remaster, etc. (versions)

// Prefer Release Group for general album info
const album = await mbClient.getReleaseGroup(rgid);
```

### Multiple Artists

**Issue**: Tracks can have multiple artist credits (features, collaborations)

**Solution**: Join artist names for display
```typescript
const artistNames = recording.artist_credit.map(ac => ac.name).join(' & ');
// "Artist 1 & Artist 2"
```

### Disambiguation

**Issue**: Multiple artists with same name (Michael Jackson: King of Pop vs Michael Jackson: jazz musician)

**Solution**: Use disambiguation field
```typescript
const displayName = artist.disambiguation
  ? `${artist.name} (${artist.disambiguation})`
  : artist.name;
// "Michael Jackson (American singer and entertainer)"
```

### Incomplete Genres

**Issue**: Genre tagging inconsistent, community-driven

**Solution**: Use tags as hints, not canonical data
```typescript
const genres = artist.tags
  ?.filter(tag => tag.count > 10) // Minimum vote threshold
  .map(tag => tag.name)
  || [];
```

### Date Precision

**Issue**: Dates may be partial (year-only, month-only)

**Solution**: Handle partial dates
```typescript
// MusicBrainz returns: "1973", "1973-03", "1973-03-01"
const year = releaseDate.split('-')[0];
```

## Data Mapping

### Artist Metadata Mapping

```typescript
{
  title: artist.name,
  sortTitle: artist['sort-name'],
  biography: artist.disambiguation, // Short description
  formed: artist['life-span']?.begin,
  disbanded: artist['life-span']?.end,
  country: artist.country,
  type: artist.type, // Person, Group, Character

  // External IDs
  externalIds: {
    musicbrainz: artist.id,
    discogs: artist.relations?.find(r => r.type === 'discogs')?.url,
    wikidata: artist.relations?.find(r => r.type === 'wikidata')?.url
  },

  // Relationships
  members: artist.relations?.filter(r => r.type === 'member of band'),
  genres: artist.tags?.map(t => t.name)
}
```

### Album Metadata Mapping

```typescript
{
  title: releaseGroup.title,
  releaseDate: releaseGroup['first-release-date'],
  type: releaseGroup['primary-type'], // Album, Single, EP
  artist: releaseGroup['artist-credit']?.[0]?.name,

  // MusicBrainz-specific
  mbid: releaseGroup.id,
  releases: releaseGroup.releases?.length, // Number of versions

  genres: releaseGroup.tags?.map(t => t.name)
}
```

### Track Metadata Mapping

```typescript
{
  title: recording.title,
  duration: recording.length, // milliseconds
  artist: recording['artist-credit']?.[0]?.name,
  isrc: recording.isrcs?.[0], // International Standard Recording Code

  // MusicBrainz-specific
  mbid: recording.id,
  appearsOn: recording.releases?.map(r => r.title) // Which albums
}
```

## Error Handling

### Common Errors

**503 Service Unavailable**:
- Rate limit exceeded (most common)
- Wait 1 second, retry
- Check User-Agent header

**400 Bad Request**:
- Invalid query syntax
- Missing User-Agent header
- Check request format

**404 Not Found**:
- Invalid MBID
- Entity deleted
- Try search instead

**No Errors, Empty Results**:
- Artist/album not in MusicBrainz (rare)
- Try alternate spellings
- Check artist disambiguation

### Retry Strategy

```typescript
try {
  const artist = await mbClient.getArtist(mbid);
  return artist;
} catch (error) {
  if (error.statusCode === 503) {
    // Rate limit exceeded, wait and retry
    await delay(1000);
    return await mbClient.getArtist(mbid);
  } else if (error.statusCode === 400) {
    // Check User-Agent
    logger.error('MusicBrainz 400 error - check User-Agent header');
    throw error;
  }
  throw error;
}
```

## Configuration

### Provider Settings

Configure in Settings ’ Providers ’ MusicBrainz:

```json
{
  "enabled": true,
  "userAgent": "Metarr/1.0.0 (https://github.com/metarr)",
  "cacheEnabled": true,
  "cacheDuration": 2592000000
}
```

### Environment Variables

```bash
# Required: User-Agent (or use default)
MUSICBRAINZ_USER_AGENT=YourApp/1.0.0 (contact@example.com)

# Override base URL (for testing)
MUSICBRAINZ_BASE_URL=https://musicbrainz.org/ws/2
```

## Complementary Providers

MusicBrainz provides metadata only. Use these for images:

**TheAudioDB**:
- Artist thumbnails, logos, fanart, banners
- Album covers, CD art, spine art
- Requires API key

**Last.fm**:
- Artist images
- Album art
- Free API (rate limited)

**Spotify** (Future):
- High-quality album art
- Artist images
- OAuth required

## Provider Priority

MusicBrainz is typically the only metadata provider for music:
1. **Metadata**: MusicBrainz (only option)
2. **Images**: TheAudioDB ’ Last.fm ’ Local

See [Provider Overview](./OVERVIEW.md) for complete provider list.

## Performance Tips

1. **Cache Indefinitely**: MusicBrainz data rarely changes
2. **Use inc= Parameter**: Fetch related entities in one call
3. **Search First**: Store MBIDs for direct lookups
4. **Off-Peak Bulk**: Run large enrichments during off-peak hours
5. **Sequential Only**: Never parallel requests

## Contributing to MusicBrainz

MusicBrainz is community-driven. Consider:

1. **Create Account**: https://musicbrainz.org/register
2. **Add Missing Data**: Artists, albums, relationships
3. **Fix Errors**: Typos, incorrect dates, wrong associations
4. **Donate**: Support server costs
5. **Follow Guidelines**: https://musicbrainz.org/doc/Style

**Metarr Philosophy**: If MusicBrainz data is incomplete, improve MusicBrainz rather than working around it.

## See Also

- [Provider Overview](./OVERVIEW.md) - All provider capabilities
- [Rate Limiting](./RATE_LIMITING.md) - Rate limiting details (1 req/s strict)
- [Enrichment Phase](../phases/ENRICHMENT.md) - How MusicBrainz fits in enrichment
- [Official MusicBrainz API Docs](https://musicbrainz.org/doc/MusicBrainz_API) - Complete API reference
- [MusicBrainz Style Guide](https://musicbrainz.org/doc/Style) - Data contribution guidelines
