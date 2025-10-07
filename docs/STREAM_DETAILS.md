# Stream Details Management

This document describes Metarr's stream details management system, including FFprobe integration, database storage, and NFO file generation.

## Overview

**Stream details** are technical properties of media files extracted using FFprobe (part of FFmpeg). This includes:
- **Video stream**: codec, resolution, aspect ratio, bitrate, HDR, framerate
- **Audio streams**: codec, language, channels, bitrate (multiple per file)
- **Subtitle streams**: language, codec, type (embedded/external)

### Data Flow

```
┌──────────────┐
│  Media File  │
│  (.mkv, .mp4)│
└──────┬───────┘
       │
       │ FFprobe Scan
       ├─────────────────────────┐
       │                         │
       ▼                         ▼
┌──────────────┐        ┌─────────────────┐
│ video_streams│        │ audio_streams   │
│    table     │        │ subtitle_streams│
└──────┬───────┘        └────────┬────────┘
       │                         │
       │ Read from Database      │
       └────────────┬────────────┘
                    │
                    ▼
           ┌────────────────┐
           │   NFO File     │
           │ <streamdetails>│
           └────────────────┘
```

**Key Principle:** NFO `<fileinfo><streamdetails>` is **write-only**
- ✅ **Write**: Generate from database → Write to NFO file
- ❌ **Read**: Never parse/import from NFO file (always use FFprobe as source of truth)

---

## FFprobe Integration

### Installation

FFprobe is part of FFmpeg. Ensure it's installed and accessible in system PATH.

**Windows:**
```powershell
choco install ffmpeg
# Or download from https://ffmpeg.org/download.html
```

**Linux:**
```bash
sudo apt install ffmpeg  # Debian/Ubuntu
sudo yum install ffmpeg  # RHEL/CentOS
```

**Verify Installation:**
```bash
ffprobe -version
```

### FFprobe Command

Extract stream details using JSON output:

```bash
ffprobe -v quiet \
  -print_format json \
  -show_format \
  -show_streams \
  "/path/to/movie.mkv"
```

**Example Output:**
```json
{
  "streams": [
    {
      "index": 0,
      "codec_name": "hevc",
      "codec_type": "video",
      "width": 3840,
      "height": 2160,
      "display_aspect_ratio": "16:9",
      "r_frame_rate": "24000/1001",
      "bit_rate": "45000000",
      "color_space": "bt2020nc",
      "color_transfer": "smpte2084",
      "color_primaries": "bt2020"
    },
    {
      "index": 1,
      "codec_name": "truehd",
      "codec_type": "audio",
      "channels": 8,
      "channel_layout": "7.1",
      "sample_rate": "48000",
      "bit_rate": "4608000",
      "tags": {
        "language": "eng",
        "title": "English Dolby TrueHD 7.1"
      },
      "disposition": {
        "default": 1,
        "forced": 0
      }
    },
    {
      "index": 2,
      "codec_name": "subrip",
      "codec_type": "subtitle",
      "tags": {
        "language": "eng",
        "title": "English"
      },
      "disposition": {
        "default": 1,
        "forced": 0
      }
    }
  ],
  "format": {
    "filename": "/movies/The Matrix (1999)/The Matrix.mkv",
    "size": "46179488972",
    "duration": "8160.512"
  }
}
```

---

## Database Schema

### video_streams Table

Stores video stream information (1:1 with movies/episodes).

```sql
CREATE TABLE video_streams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,      -- 'movie', 'episode'
  entity_id INTEGER NOT NULL,

  -- Video Properties
  codec TEXT,                      -- h264, hevc, vp9, av1
  aspect_ratio REAL,               -- 2.35, 1.78, etc.
  width INTEGER,                   -- 1920, 3840, etc.
  height INTEGER,                  -- 1080, 2160, etc.
  duration_seconds INTEGER,        -- Total runtime in seconds

  -- Advanced Properties
  bitrate INTEGER,                 -- Video bitrate in kbps
  framerate REAL,                  -- 23.976, 24, 29.97, 60, etc.
  hdr_type TEXT,                   -- NULL, HDR10, HDR10+, Dolby Vision, HLG
  color_space TEXT,                -- bt709, bt2020, etc.
  file_size BIGINT,                -- File size in bytes

  -- Scan Tracking
  scanned_at TEXT DEFAULT CURRENT_TIMESTAMP,

  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(entity_type, entity_id)
);
```

### audio_streams Table

Stores audio track information (1:many with movies/episodes).

```sql
CREATE TABLE audio_streams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  stream_index INTEGER NOT NULL,  -- 0-based index in file

  -- Audio Properties
  codec TEXT,                      -- aac, ac3, eac3, dts, truehd, flac
  language TEXT,                   -- ISO 639-2 (eng, spa, fra, etc.)
  channels INTEGER,                -- 2, 6, 8, etc.
  channel_layout TEXT,             -- stereo, 5.1, 7.1, etc.

  -- Advanced Properties
  bitrate INTEGER,                 -- Audio bitrate in kbps
  sample_rate INTEGER,             -- 48000, 96000, etc.
  title TEXT,                      -- Stream title/description

  -- Stream Flags
  is_default BOOLEAN DEFAULT 0,
  is_forced BOOLEAN DEFAULT 0,

  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(entity_type, entity_id, stream_index)
);
```

### subtitle_streams Table

Stores subtitle track information (1:many with movies/episodes).

```sql
CREATE TABLE subtitle_streams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  stream_index INTEGER,            -- NULL for external subtitles

  -- Subtitle Properties
  language TEXT,                   -- ISO 639-2 (eng, spa, fra, etc.)
  codec TEXT,                      -- subrip, ass, pgs, vobsub, etc.
  title TEXT,                      -- Stream title/description

  -- External Subtitle Support
  is_external BOOLEAN DEFAULT 0,  -- TRUE for .srt files
  file_path TEXT,                  -- Path to external subtitle file

  -- Stream Flags
  is_default BOOLEAN DEFAULT 0,
  is_forced BOOLEAN DEFAULT 0,

  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(entity_type, entity_id, stream_index, file_path)
);
```

---

## Scanning Workflow

### Trigger Points

Stream details scanning is triggered by:

1. **Webhook from download manager** (Sonarr/Radarr)
   - Movie/episode download complete → Scan NFO → Scan streams → Update database

2. **Full library scan**
   - User initiates full library scan → For each media file → Scan streams → Update database

3. **Manual single-item rescan**
   - User clicks "Rescan Streams" on movie/episode → Scan streams → Update database

### Scan Process

```typescript
async function scanStreamDetails(entityType: 'movie' | 'episode', entityId: number): Promise<void> {
  // Get file path from database
  const entity = await db.getEntity(entityType, entityId);
  const filePath = entity.file_path;

  // Run FFprobe
  const streamData = await runFFprobe(filePath);

  // Begin transaction
  await db.transaction(async (trx) => {
    // 1. Update or insert video stream
    await upsertVideoStream(trx, entityType, entityId, streamData.video);

    // 2. Clear existing audio streams and insert new ones
    await trx.deleteAudioStreams(entityType, entityId);
    for (const audio of streamData.audio) {
      await trx.insertAudioStream(entityType, entityId, audio);
    }

    // 3. Clear existing subtitle streams and insert new ones
    await trx.deleteSubtitleStreams(entityType, entityId);
    for (const subtitle of streamData.subtitles) {
      await trx.insertSubtitleStream(entityType, entityId, subtitle);
    }

    // 4. Scan for external subtitle files (.srt, .ass, etc.)
    const externalSubs = await scanExternalSubtitles(filePath);
    for (const sub of externalSubs) {
      await trx.insertSubtitleStream(entityType, entityId, sub);
    }
  });

  // Log activity
  await logActivity({
    event_type: 'stream_scan',
    entity_type: entityType,
    entity_id: entityId,
    description: `Stream details scanned with FFprobe`
  });
}
```

### FFprobe Wrapper

```typescript
async function runFFprobe(filePath: string): Promise<StreamData> {
  const { stdout } = await exec(`ffprobe -v quiet -print_format json -show_format -show_streams "${filePath}"`);
  const data = JSON.parse(stdout);

  return {
    video: parseVideoStream(data.streams.find(s => s.codec_type === 'video')),
    audio: data.streams.filter(s => s.codec_type === 'audio').map(parseAudioStream),
    subtitles: data.streams.filter(s => s.codec_type === 'subtitle').map(parseSubtitleStream),
    format: {
      duration: parseFloat(data.format.duration),
      size: parseInt(data.format.size)
    }
  };
}

function parseVideoStream(stream: any): VideoStreamData {
  return {
    codec: stream.codec_name,
    width: stream.width,
    height: stream.height,
    aspect_ratio: parseAspectRatio(stream.display_aspect_ratio),
    framerate: parseFramerate(stream.r_frame_rate),
    bitrate: stream.bit_rate ? Math.round(parseInt(stream.bit_rate) / 1000) : null,
    hdr_type: detectHDR(stream),
    color_space: stream.color_space
  };
}

function parseAudioStream(stream: any, index: number): AudioStreamData {
  return {
    stream_index: index,
    codec: stream.codec_name,
    language: stream.tags?.language || 'und',
    channels: stream.channels,
    channel_layout: stream.channel_layout,
    bitrate: stream.bit_rate ? Math.round(parseInt(stream.bit_rate) / 1000) : null,
    sample_rate: parseInt(stream.sample_rate),
    title: stream.tags?.title || null,
    is_default: stream.disposition?.default === 1,
    is_forced: stream.disposition?.forced === 1
  };
}

function parseSubtitleStream(stream: any, index: number): SubtitleStreamData {
  return {
    stream_index: index,
    language: stream.tags?.language || 'und',
    codec: stream.codec_name,
    title: stream.tags?.title || null,
    is_external: false,
    file_path: null,
    is_default: stream.disposition?.default === 1,
    is_forced: stream.disposition?.forced === 1
  };
}
```

### External Subtitle Detection

```typescript
async function scanExternalSubtitles(videoPath: string): Promise<ExternalSubtitleData[]> {
  const dir = path.dirname(videoPath);
  const baseName = path.basename(videoPath, path.extname(videoPath));

  const subtitleFiles = await glob(`${dir}/${baseName}*.{srt,ass,sub,ssa,vtt}`, {
    caseInsensitive: true
  });

  return subtitleFiles.map(file => {
    const language = extractLanguageFromFilename(file) || 'und';
    const codec = path.extname(file).slice(1); // Remove leading dot

    return {
      stream_index: null,
      language,
      codec,
      title: path.basename(file),
      is_external: true,
      file_path: file,
      is_default: false,
      is_forced: false
    };
  });
}

function extractLanguageFromFilename(filePath: string): string | null {
  // Match patterns like: movie.eng.srt, movie.en.srt, movie.english.srt
  const match = filePath.match(/\.([a-z]{2,3}|[a-z]+)\.(srt|ass|sub|ssa|vtt)$/i);
  if (match) {
    return normalizeLanguageCode(match[1]); // Convert to ISO 639-2
  }
  return null;
}
```

### HDR Detection

```typescript
function detectHDR(stream: any): string | null {
  const transfer = stream.color_transfer;
  const space = stream.color_space;

  // HDR10
  if (transfer === 'smpte2084' && space === 'bt2020nc') {
    return 'HDR10';
  }

  // Dolby Vision
  if (stream.side_data_list?.some((sd: any) => sd.side_data_type === 'DOVI configuration record')) {
    return 'Dolby Vision';
  }

  // HDR10+
  if (stream.side_data_list?.some((sd: any) => sd.side_data_type === 'HDR10+ metadata')) {
    return 'HDR10+';
  }

  // HLG (Hybrid Log-Gamma)
  if (transfer === 'arib-std-b67') {
    return 'HLG';
  }

  return null;
}
```

---

## Quality Detection

Derive quality label from resolution:

```typescript
function getQualityFromResolution(width: number, height: number): string {
  if (height >= 2160) return '4K';
  if (height >= 1080) return '1080p';
  if (height >= 720) return '720p';
  if (height >= 480) return '480p';
  return 'SD';
}
```

**Usage:**
```typescript
const videoStream = await db.getVideoStream('movie', 1);
const quality = getQualityFromResolution(videoStream.width, videoStream.height);
// "4K"
```

---

## NFO File Generation

### Write Stream Details to NFO

When generating NFO files, read stream details from database and write to `<fileinfo><streamdetails>` section:

```typescript
async function generateMovieNFO(movieId: number): Promise<string> {
  const movie = await db.getMovie(movieId);
  const videoStream = await db.getVideoStream('movie', movieId);
  const audioStreams = await db.getAudioStreams('movie', movieId);
  const subtitleStreams = await db.getSubtitleStreams('movie', movieId);

  const nfo = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<movie>
  <title>${escapeXml(movie.title)}</title>
  <year>${movie.year}</year>
  <!-- ... other metadata ... -->

  <fileinfo>
    <streamdetails>
      ${generateVideoStreamXML(videoStream)}
      ${audioStreams.map(generateAudioStreamXML).join('\n      ')}
      ${subtitleStreams.filter(s => !s.is_external).map(generateSubtitleStreamXML).join('\n      ')}
    </streamdetails>
  </fileinfo>
</movie>`;

  return nfo;
}

function generateVideoStreamXML(stream: VideoStream): string {
  return `<video>
        <codec>${stream.codec}</codec>
        <aspect>${stream.aspect_ratio.toFixed(2)}</aspect>
        <width>${stream.width}</width>
        <height>${stream.height}</height>
        <durationinseconds>${stream.duration_seconds}</durationinseconds>
      </video>`;
}

function generateAudioStreamXML(stream: AudioStream): string {
  return `<audio>
        <codec>${stream.codec}</codec>
        <language>${stream.language}</language>
        <channels>${stream.channels}</channels>
      </audio>`;
}

function generateSubtitleStreamXML(stream: SubtitleStream): string {
  return `<subtitle>
        <language>${stream.language}</language>
      </subtitle>`;
}
```

**Note:** Only **embedded** subtitle streams are written to NFO (external .srt files are not included in `<streamdetails>`).

---

## API Endpoints

### Get Stream Details

```
GET /api/movies/:id/streams

Response:
{
  "video": {
    "codec": "hevc",
    "resolution": "3840x2160",
    "aspect_ratio": 2.35,
    "duration": "2h 16m",
    "bitrate": "45 Mbps",
    "framerate": 23.976,
    "hdr": "HDR10",
    "file_size": "43.0 GB"
  },
  "audio": [
    {
      "index": 0,
      "codec": "TrueHD",
      "language": "English",
      "channels": "7.1",
      "bitrate": "4.6 Mbps",
      "default": true
    },
    {
      "index": 1,
      "codec": "AC3",
      "language": "English",
      "channels": "5.1",
      "bitrate": "640 kbps",
      "default": false
    }
  ],
  "subtitles": [
    {
      "index": 0,
      "language": "English",
      "codec": "SubRip",
      "external": false,
      "default": true
    },
    {
      "language": "Spanish",
      "codec": "SubRip",
      "external": true,
      "file": "The Matrix.spa.srt"
    }
  ]
}
```

### Trigger Stream Scan

```
POST /api/movies/:id/scan-streams

Response:
{
  "success": true,
  "message": "Stream scan completed",
  "scanned_at": "2025-10-04T10:30:00Z"
}
```

---

## Best Practices

### 1. Scan on Import
Always scan stream details immediately after importing new media (webhook or library scan).

### 2. Update on File Change
Rescan streams if file is replaced (e.g., upgraded from 1080p to 4K).

### 3. Handle Errors Gracefully
If FFprobe fails (corrupted file, unsupported codec), log error and continue processing other metadata.

### 4. Use Timeouts
Set reasonable timeout for FFprobe (30 seconds for large files).

### 5. Cache Duration
Store `duration_seconds` in database - use as authoritative runtime instead of NFO `<runtime>`.

### 6. Quality Badges
Display quality badge in UI derived from resolution (4K, 1080p, 720p).

### 7. Audio/Subtitle Indicators
Show audio language/codec and subtitle availability in UI.

### 8. External Subtitle Discovery
Scan for external .srt files in same directory as video file.

---

## Troubleshooting

### FFprobe Not Found

**Error:** `Command 'ffprobe' not found`

**Solution:**
- Install FFmpeg/FFprobe
- Add FFmpeg bin directory to system PATH
- Restart Metarr application

### Invalid JSON Output

**Error:** `Unexpected token in JSON`

**Solution:**
- Check FFprobe version (requires FFmpeg 3.0+)
- Ensure `-print_format json` flag is used
- Check for stderr output mixed with stdout

### Missing Stream Data

**Error:** Video stream exists but no audio/subtitle streams

**Solution:**
- Some containers have separate audio/video files
- Check if file is a video stub or placeholder
- Verify file is not corrupted

### Incorrect Language Detection

**Error:** All audio tracks show language as "und"

**Solution:**
- Language metadata may be missing from file
- Use filename pattern matching as fallback
- Allow manual language override in UI

---

## Future Enhancements

1. **Codec Validation**: Warn if codec is not supported by target media players
2. **Bitrate Analysis**: Detect low-quality encodes based on bitrate/resolution ratio
3. **Stream Preferences**: Allow users to set preferred audio/subtitle languages
4. **Automatic Conversion**: Trigger transcoding if codec is incompatible
5. **Stream Comparison**: Compare streams before/after file upgrade
