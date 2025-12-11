# Local Provider Implementation

Local filesystem provider for NFO parsing, asset discovery, and backup.

## Capabilities

- **NFO Parsing**: Extract metadata from Kodi/Jellyfin/Plex NFO files
- **Asset Discovery**: Find existing local artwork
- **Asset Backup**: Preserve original assets before enrichment
- **Stream Analysis**: Extract video/audio codec info via FFprobe

**No External API**: Pure filesystem operations, no network calls.

## NFO Parsing

### Movie NFO (`movie.nfo`)

```xml
<movie>
  <title>The Matrix</title>
  <originaltitle>The Matrix</originaltitle>
  <plot>Neo discovers reality is a simulation...</plot>
  <tagline>Welcome to the Real World</tagline>
  <year>1999</year>
  <runtime>136</runtime>
  <mpaa>R</mpaa>
  <genre>Action</genre>
  <genre>Sci-Fi</genre>
  <director>Lana Wachowski</director>
  <actor>
    <name>Keanu Reeves</name>
    <role>Neo</role>
  </actor>
  <ratings>
    <rating name="imdb">
      <value>8.7</value>
      <votes>1900000</votes>
    </rating>
  </ratings>
</movie>
```

### TV Show NFO (`tvshow.nfo`)

```xml
<tvshow>
  <title>Breaking Bad</title>
  <plot>High school chemistry teacher turns meth cook...</plot>
  <premiered>2008-01-20</premiered>
  <status>Ended</status>
  <genre>Crime</genre>
  <genre>Drama</genre>
  <actor>
    <name>Bryan Cranston</name>
    <role>Walter White</role>
  </actor>
</tvshow>
```

### Episode NFO (`S01E01.nfo`)

```xml
<episodedetails>
  <title>Pilot</title>
  <season>1</season>
  <episode>1</episode>
  <plot>Walter White is diagnosed with cancer...</plot>
  <aired>2008-01-20</aired>
  <runtime>58</runtime>
</episodedetails>
```

See [NFO_FORMAT.md](../../reference/NFO_FORMAT.md) for complete specification.

## Asset Discovery

### Kodi Naming Convention (Primary)

```
/media/movies/The Matrix (1999)/
     movie.mkv
     movie-poster.jpg      → poster
     movie-fanart.jpg      → fanart
     movie-banner.jpg      → banner
     movie-clearlogo.png   → clearlogo
     movie-clearart.png    → clearart
     movie-discart.png     → discart
     movie-landscape.jpg   → landscape
```

### Jellyfin/Plex Naming (Alternate)

```
/media/movies/The Matrix (1999)/
     movie.mkv
     poster.jpg            → poster
     backdrop.jpg          → fanart
     logo.png              → clearlogo
```

### Discovery Algorithm

```typescript
async function discoverAssets(mediaPath: string): Promise<LocalAsset[]> {
  const dir = path.dirname(mediaPath);
  const baseName = path.basename(mediaPath, path.extname(mediaPath));

  // 1. Check media-file-named assets
  const kodiAssets = await findKodiNamedAssets(dir, baseName);

  // 2. Check generic names
  const genericAssets = await findGenericAssets(dir);

  // 3. Scan directory for any images
  const allImages = await scanForImages(dir);

  // 4. Classify by dimensions/filename patterns
  return classifyAssets([...kodiAssets, ...genericAssets, ...allImages]);
}
```

## FFprobe Stream Analysis

Extract technical metadata from media files:

```typescript
const streams = await ffprobe(mediaFile.path);
const videoStream = streams.find(s => s.codec_type === 'video');

{
  resolution: `${videoStream.width}x${videoStream.height}`,
  video_codec: videoStream.codec_name,
  runtime: Math.round(streams.format.duration),
  aspect_ratio: videoStream.display_aspect_ratio
}
```

**Video Streams**: codec, resolution, bitrate, frame rate, aspect ratio
**Audio Streams**: codec, channels, language

## Asset Backup System

### Backup Process

```typescript
async function backupOriginalAssets(mediaId: number, mediaType: string) {
  // 1. Discover existing assets
  const originalAssets = await localProvider.discoverAssets(mediaPath);

  // 2. Copy to backup location
  for (const asset of originalAssets) {
    const backupPath = `/data/cache/backup/${mediaType}/${mediaId}/${asset.type}${ext}`;
    await fs.copyFile(asset.path, backupPath);
  }

  // 3. Store backup metadata
  const metadata = {
    backedUpAt: new Date(),
    originalPaths: originalAssets.map(a => a.path),
    mediaId,
    mediaType
  };
  await fs.writeFile(`${backupPath}/metadata.json`, JSON.stringify(metadata));

  // 4. Mark as backed up
  await db.query(
    'UPDATE library_items SET assets_backed_up = 1 WHERE id = ?',
    [mediaId]
  );
}
```

### Backup Location

```
/data/cache/backup/
     movies/
        {movie_id}/
            poster.jpg
            fanart.jpg
            metadata.json
     series/
         {series_id}/
             poster.jpg
             metadata.json
```

### Restore Process

```typescript
async function restoreOriginalAssets(mediaId: number, mediaType: string) {
  const backupPath = `/data/cache/backup/${mediaType}/${mediaId}`;
  const metadata = JSON.parse(await fs.readFile(`${backupPath}/metadata.json`));

  for (const originalPath of metadata.originalPaths) {
    const backupFile = path.join(backupPath, path.basename(originalPath));
    await fs.copyFile(backupFile, originalPath);
  }
}
```

### Backup Policies

**When to Backup**:
- ✅ Original library assets before first enrichment
- ✅ User manually requests backup
- ❌ Provider assets (already in protected cache)
- ❌ Every enrichment (only first time)

**Retention**: Indefinite until manually deleted

## Configuration

### Provider Settings

```json
{
  "enabled": true,
  "parseNFO": true,
  "discoverAssets": true,
  "backupBeforeEnrichment": true,
  "ffprobeEnabled": true
}
```

### NFO Parser Configuration

```json
{
  "nfoParser": {
    "preferOriginalTitle": false,
    "trustLocalRatings": true,
    "mergeCast": true,
    "maxActors": 20
  }
}
```

## Use Cases

### Preserve Existing Metadata

- Manually curated metadata
- Custom artwork from graphic designer
- Data not available in external providers

### Offline Operation

- No internet connection
- Air-gapped systems
- Privacy concerns

### Performance

- Instant access (no API calls)
- Bulk operations don't hit rate limits
- Large libraries enrich faster

### Disaster Recovery

- Restore after accidental deletion
- Rollback from bad enrichment
- Preserve customizations

## Priority Configuration

**Local as Primary**:
```json
{
  "assetTypePriorities": {
    "poster": ["local", "fanart_tv", "tmdb"],
    "fanart": ["local", "fanart_tv", "tmdb"]
  }
}
```

**Local as Fallback**:
```json
{
  "assetTypePriorities": {
    "poster": ["fanart_tv", "tmdb", "tvdb", "local"]
  }
}
```

## Related Documentation

- [Provider Concepts](../../concepts/Enrichment/Providers/README.md)
- [NFO Format](../../reference/NFO_FORMAT.md)
- [Asset Management](../../architecture/ASSET_MANAGEMENT/)
- [Scanning](../../concepts/Scanning/)
