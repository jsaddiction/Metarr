# MusicBrainz Implementation

Open music database for artists, albums, and tracks.

## API Details

- **Base URL**: `https://musicbrainz.org/ws/2`
- **Auth**: None (User-Agent required)
- **Rate Limit**: 1 request per second (strict)
- **Documentation**: https://musicbrainz.org/doc/MusicBrainz_API

**Status**: Planned (Music support not yet implemented)

## Critical Requirements

### User-Agent Header (Required)

MusicBrainz bans clients without proper identification:

```typescript
const headers = {
  'User-Agent': 'Metarr/1.0.0 (https://github.com/metarr)'
};
```

**Format**: `AppName/Version (Contact)`

**Environment Variable**: `MUSICBRAINZ_USER_AGENT`

### Rate Limit (Strict)

```typescript
{
  requestsPerSecond: 1,
  burstCapacity: 1,     // No burst allowed
  windowSeconds: 1
}
```

- **NO burst capacity**
- **NO priority queuing**
- **Sequential requests only**
- Violation may result in IP ban

## Key Endpoints

### Search

```
GET /artist?query={name}&fmt=json
GET /release-group?query={album}+AND+artist:{artist}&fmt=json
GET /recording?query={track}+AND+artist:{artist}&fmt=json
```

### Metadata

```
GET /artist/{mbid}?inc=releases+release-groups+recordings&fmt=json
GET /release-group/{mbid}?inc=artists+releases+tags&fmt=json
GET /recording/{mbid}?inc=artists+releases+isrcs&fmt=json
```

## Data Mapping

### Artist

```typescript
{
  title: artist.name,
  sortTitle: artist['sort-name'],
  biography: artist.disambiguation,
  formed: artist['life-span']?.begin,
  disbanded: artist['life-span']?.end,
  country: artist.country,
  type: artist.type,  // Person, Group, Character
  externalIds: {
    musicbrainz: artist.id,
    discogs: artist.relations?.find(r => r.type === 'discogs')?.url,
    wikidata: artist.relations?.find(r => r.type === 'wikidata')?.url
  }
}
```

### Album (Release Group)

```typescript
{
  title: releaseGroup.title,
  releaseDate: releaseGroup['first-release-date'],
  type: releaseGroup['primary-type'],  // Album, Single, EP
  artist: releaseGroup['artist-credit']?.[0]?.name,
  mbid: releaseGroup.id
}
```

## Quirks and Workarounds

### Release vs Release Group

MusicBrainz distinguishes "Release Group" (abstract album) from "Release" (specific version):

```typescript
// Release Group = "Dark Side of the Moon" (album concept)
// Releases = US CD, UK Vinyl, Remaster, etc. (versions)

// Use Release Group for general album info
const album = await mbClient.getReleaseGroup(rgid);
```

### Multiple Artists

```typescript
const artistNames = recording.artist_credit.map(ac => ac.name).join(' & ');
```

### Disambiguation

Multiple artists with same name:

```typescript
const displayName = artist.disambiguation
  ? `${artist.name} (${artist.disambiguation})`
  : artist.name;
```

### Incomplete Genres

Tags are community-driven and inconsistent:

```typescript
const genres = artist.tags
  ?.filter(tag => tag.count > 10)
  .map(tag => tag.name)
  || [];
```

### Partial Dates

```typescript
// MusicBrainz returns: "1973", "1973-03", "1973-03-01"
const year = releaseDate.split('-')[0];
```

## Error Handling

| Status | Cause | Resolution |
|--------|-------|------------|
| 503 | Rate limit exceeded | Wait 1 second, retry |
| 400 | Missing User-Agent | Add User-Agent header |
| 404 | Invalid MBID | Try search instead |

## Performance Tips

1. **Cache Indefinitely**: Data rarely changes
2. **Use inc= Parameter**: Fetch related entities in one call
3. **Off-Peak Bulk**: Run large enrichments during off-peak hours
4. **Sequential Only**: Never parallel requests

## Complementary Providers

MusicBrainz provides metadata only. For images use:
- **TheAudioDB**: Artist/album artwork
- **Last.fm**: Artist images, album art

## Related Documentation

- [Provider Concepts](../../concepts/Enrichment/Providers/README.md)
- [Rate Limiting](../../concepts/Enrichment/Providers/RATE_LIMITING.md)
- [Official MusicBrainz API Docs](https://musicbrainz.org/doc/MusicBrainz_API)
