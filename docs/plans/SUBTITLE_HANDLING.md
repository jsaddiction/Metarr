# Subtitle Handling Implementation Plan

**Created**: 2025-12-12
**Status**: Planning
**Last Updated**: 2025-12-31

## Overview

This document outlines the complete plan for implementing subtitle handling in Metarr. Subtitles follow the same asset pattern as images and trailers: discover → aggregate → score → select → cache → publish.

## Table of Contents

1. [Goals & Non-Goals](#goals--non-goals)
2. [Architecture](#architecture)
3. [Key Decisions](#key-decisions)
4. [Subtitle Types](#subtitle-types)
5. [Providers](#providers)
6. [Sync Validation](#sync-validation)
7. [Language Detection](#language-detection)
8. [Selection Algorithm](#selection-algorithm)
9. [User Override & Locking](#user-override--locking)
10. [Database Schema](#database-schema)
11. [Configuration](#configuration)
12. [File Naming Convention](#file-naming-convention)
13. [Subtitle Cleaning](#subtitle-cleaning)
14. [Implementation Phases](#implementation-phases)
15. [Technical Details](#technical-details)
16. [UI Requirements](#ui-requirements)
17. [Testing Strategy](#testing-strategy)
18. [Open Questions](#open-questions)

---

## Goals & Non-Goals

### Goals

- **Unified asset workflow**: Subtitles follow the same candidates → cache → library pattern as other assets
- **Quality assurance**: Validate sync timing and language before selection
- **User control**: Configurable language preferences with priority ordering
- **Multi-provider aggregation**: Combine embedded, external, and downloaded subtitles
- **Cross-platform compatibility**: Naming conventions work with Kodi, Jellyfin, and Plex
- **Zero-config operation**: Works out-of-box with SubDB; OpenSubtitles enhances when configured
- **Smart automation with override**: Auto-selects best subtitles, user can override and lock selections

### Non-Goals

- **Whisper/AI transcription**: Too resource-intensive, not planned
- **Hardcoded subtitle extraction**: Requires OCR, out of scope
- **Subtitle editing/timing adjustment**: Users should use dedicated tools
- **Real-time subtitle streaming**: Focus is on file-based subtitles
- **TV Show support**: Movies first; TV support will follow once movies are complete

---

## Architecture

### Asset Flow

```
SOURCES                           CANDIDATES                CACHE                 LIBRARY
┌─────────────────┐              ┌──────────────────┐      ┌──────────────┐      ┌──────────────┐
│ Embedded        │──extract────►│                  │      │              │      │              │
│ (from video)    │              │                  │      │              │      │              │
├─────────────────┤              │  subtitle_       │      │  /data/      │      │  /media/     │
│ External        │──discover───►│  candidates      │─────►│  cache/      │─────►│  movies/     │
│ (library files) │              │  table           │      │  subtitles/  │      │  Movie/      │
├─────────────────┤              │                  │      │              │      │  Movie.en.srt│
│ OpenSubtitles   │──download───►│                  │      │              │      │              │
├─────────────────┤              │                  │      │              │      │              │
│ SubDB           │──download───►│                  │      │              │      │              │
└─────────────────┘              └──────────────────┘      └──────────────┘      └──────────────┘
                                         │
                                         ▼
                                 ┌──────────────────┐
                                 │ VALIDATION       │
                                 │ • Language detect│
                                 │ • Sync scoring   │
                                 │ • Quality score  │
                                 └──────────────────┘
```

### Processing Pipeline

```
SCANNING PHASE
├── Detect embedded subtitle streams (FFprobe) → subtitle_streams table
├── Create candidates from embedded streams → subtitle_candidates (cache_file_id=NULL)
├── Discover external subtitle files (.srt, .ass, .vtt)
└── Store external as candidates with source_type='external'

ENRICHMENT PHASE
├── Compute video hashes (OpenSubtitles hash + SubDB hash)
├── Query OpenSubtitles (hash match first, then IMDB/TMDB fallback)
├── Query SubDB (hash match only)
├── Store provider results as candidates → subtitle_candidates
├── Score all candidates (source trust + language match + format preference)
└── Select best per language (up to maxPerLanguage limit)

CACHING PHASE (for selected candidates only)
├── For each selected candidate:
│   ├── If embedded: Extract to temp directory via ffmpeg
│   ├── If provider: Download to temp directory
│   ├── Run language detection (franc) → update language_detected
│   ├── Run sync validation (ffsubsync) → update sync_score
│   ├── If validation passes:
│   │   ├── Move to cache → create cache_text_files record
│   │   └── Update subtitle_candidates.cache_file_id
│   └── If validation fails:
│       ├── Mark candidate as rejected
│       └── Try next best candidate for that language
└── Clean up temp files

PUBLISHING PHASE
├── Copy selected subtitles from cache to library
├── Apply naming convention (Movie.en.srt, Movie.en.forced.srt)
├── Create library_text_files records
├── Optionally: Strip embedded subtitles from video file
│   ├── ffmpeg -i input.mkv -map 0 -map -0:s -c copy output.mkv
│   ├── Replace original with stripped version
│   └── Rehash video file
└── Update library_path in database
```

---

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Table design** | Dedicated `subtitle_candidates` table + existing `cache_text_files` | Candidates track options; cache stores selected files |
| **Whisper support** | Not implemented | Resource-intensive, diminishing returns |
| **Strip embedded after publish** | Optional (default OFF) | Destructive operation, user opt-in only |
| **When to extract embedded** | After selection, during caching | Extract only selected subs, validate in temp first |
| **Primary provider** | OpenSubtitles | Largest database, hash matching, well-documented API |
| **Secondary provider** | SubDB | Free, hash-based, no API key needed, open-source friendly |
| **Sync validation tool** | ffsubsync | Actively maintained (Nov 2025), 7.5k stars, Python-native |
| **Sync validation fallback** | Skip if unavailable | If ffsubsync not installed, skip sync validation rather than fail |
| **Language detection** | franc (npm) | Popular, well-maintained, 400+ languages |
| **Language settings** | Separate from artwork | Different use cases (single vs multi-select) |
| **Naming convention** | Kodi/Jellyfin/Plex compatible | Maximum player compatibility |
| **Format strategy** | Text-based only (SRT/ASS/VTT), skip bitmap (PGS/VobSub) | Bitmap requires OCR; text formats are syncable, cleanable |
| **Subtitle cleaning** | Always on, remove ads/attributions | High-quality, clean output to cache/library |
| **Rate limit handling** | HTTP response codes | Same pattern as other providers (429 handling) |
| **Audio extraction** | Extract once, validate all | Extract audio from video once, reuse for all candidate sync validations |
| **Selection grouping** | By language + type | Select best per (language, type) combo: full, forced, SDH |
| **User override** | Manual selection with locking | User can override auto-selection; locked selections preserved on re-enrichment |

---

## Subtitle Types

Subtitles are grouped by **type** within each language. Users may want multiple types for the same language.

### Type Definitions

| Type | Description | Use Case |
|------|-------------|----------|
| **Full** | Complete dialogue transcription | Accessibility, language learning, noisy environments |
| **Forced** | Foreign parts only | When primary audio is your language but some dialogue is foreign (e.g., Elvish in LOTR, Japanese in Kill Bill) |
| **SDH** | Subtitles for Deaf/Hard of Hearing | Includes `[sound effects]`, `[music]`, speaker identification |

### Examples

For a user with `languages: ['en', 'es']` and `includeForced: true, includeFull: true`:

| File | Type | Purpose |
|------|------|---------|
| `Movie.en.srt` | Full | All English dialogue |
| `Movie.en.forced.srt` | Forced | Only foreign dialogue translated to English |
| `Movie.es.srt` | Full | All Spanish dialogue |
| `Movie.es.forced.srt` | Forced | Only foreign dialogue translated to Spanish |

### Provider Support for Forced Flag

| Provider | Forced Detection |
|----------|------------------|
| **OpenSubtitles** | `foreign_parts_only: true` in API response |
| **SubDB** | No forced flag (limited metadata) |
| **Embedded** | FFprobe `disposition.forced` flag |
| **External files** | Filename contains `.forced.` |

### Selection Logic

Selection happens per **(language, type)** group, not just per language:

```typescript
// Selection groups for languages: ['en', 'es'], includeForced: true, includeFull: true, includeSdh: false
const groups = [
  { language: 'en', type: 'full' },
  { language: 'en', type: 'forced' },
  { language: 'es', type: 'full' },
  { language: 'es', type: 'forced' },
];

// Select best candidate for EACH group
for (const group of groups) {
  const candidates = getCandidatesFor(group.language, group.type);
  const best = selectBest(candidates);
  if (best) markSelected(best);
}
```

---

## Providers

### OpenSubtitles (Primary - Optional)

**API**: REST API at `api.opensubtitles.com`
**Documentation**: https://opensubtitles.stoplight.io/docs/opensubtitles-api

> **Note**: OpenSubtitles requires user account configuration. When not configured, Metarr falls back to SubDB only. Configuring OpenSubtitles significantly improves subtitle availability and quality.

| Aspect | Details |
|--------|---------|
| Authentication | API key + user account required |
| Free tier | 10 downloads/day |
| VIP tier | 1000 downloads/day (~$15/year) |
| Rate limit | 40 requests/10 seconds |
| Hash support | Yes (OpenSubtitles hash algorithm) |
| Search methods | Hash, IMDB ID, TMDB ID, text |
| Forced flag | Yes (`foreign_parts_only` field) |

**Hash Algorithm** (first 64KB + last 64KB → sum):
```typescript
// OpenSubtitles hash is sum of uint64 values from first and last 64KB
async function computeOpenSubtitlesHash(filePath: string): Promise<string> {
  const CHUNK_SIZE = 65536; // 64KB
  const fileSize = (await fs.stat(filePath)).size;

  // Read first and last 64KB
  const fd = await fs.open(filePath, 'r');
  const firstChunk = Buffer.alloc(CHUNK_SIZE);
  const lastChunk = Buffer.alloc(CHUNK_SIZE);

  await fd.read(firstChunk, 0, CHUNK_SIZE, 0);
  await fd.read(lastChunk, 0, CHUNK_SIZE, fileSize - CHUNK_SIZE);
  await fd.close();

  // Sum as uint64 little-endian values
  let hash = BigInt(fileSize);
  for (let i = 0; i < CHUNK_SIZE; i += 8) {
    hash += firstChunk.readBigUInt64LE(i);
    hash += lastChunk.readBigUInt64LE(i);
  }

  return (hash & BigInt('0xffffffffffffffff')).toString(16).padStart(16, '0');
}
```

**Key Endpoints**:
- `POST /login` - Get JWT token
- `GET /subtitles` - Search subtitles
- `POST /download` - Get download link

**Match Accuracy**:
- Hash match: ~99.9%
- IMDB/TMDB match: ~70% (may need sync adjustment)

### SubDB (Secondary - Zero Config)

**API**: REST API at `api.thesubdb.com`
**Documentation**: http://thesubdb.com/api/

> **Note**: SubDB works out-of-box with no configuration required. This enables basic subtitle functionality immediately after installation.

| Aspect | Details |
|--------|---------|
| Authentication | User-agent string only |
| Cost | Free (non-commercial/open-source only) |
| Rate limit | Not documented |
| Hash support | Yes (different algorithm - MD5) |
| Search methods | Hash only |
| Forced flag | No (limited metadata) |

**Hash Algorithm** (first 64KB + last 64KB → MD5):
```typescript
import crypto from 'crypto';

async function computeSubDBHash(filePath: string): Promise<string> {
  const CHUNK_SIZE = 65536; // 64KB
  const fileSize = (await fs.stat(filePath)).size;

  const fd = await fs.open(filePath, 'r');
  const buffer = Buffer.alloc(CHUNK_SIZE * 2);

  // Read first 64KB
  await fd.read(buffer, 0, CHUNK_SIZE, 0);
  // Read last 64KB
  await fd.read(buffer, CHUNK_SIZE, CHUNK_SIZE, fileSize - CHUNK_SIZE);
  await fd.close();

  return crypto.createHash('md5').update(buffer).digest('hex');
}
```

**Key Endpoints**:
- `GET /?action=search&hash={hash}` - Check available languages
- `GET /?action=download&hash={hash}&language={lang}` - Download subtitle

**Required User-Agent Format**:
```
SubDB/1.0 (Metarr/1.0; https://github.com/jsaddiction/Metarr)
```

---

## Sync Validation

### Tool: ffsubsync

**Repository**: https://github.com/smacke/ffsubsync
**License**: MIT
**Status**: Actively maintained (last release Nov 2025, 7.5k stars)

| Platform | Installation |
|----------|-------------|
| All | `pip install ffsubsync` |
| Docker | Include in Python dependencies |

**Requirements**: ffmpeg in PATH for audio extraction

### Fallback Behavior

> **Important**: If ffsubsync is not installed or fails, Metarr skips sync validation rather than failing the entire subtitle workflow. Candidates without sync validation get `sync_score = NULL` and are scored based on other factors (source trust, language match, format).

```typescript
async function validateSync(videoPath: string, subtitlePath: string): Promise<SyncResult | null> {
  // Check if ffsubsync is available
  if (!await isFFSubsyncAvailable()) {
    logger.warn('ffsubsync not available, skipping sync validation');
    return null;  // NULL sync_score, not failure
  }

  // Run validation...
}
```

### Audio Extraction Optimization

The most expensive step in sync validation is **audio extraction from the video file** (~10-20 seconds). To avoid extracting audio multiple times when validating multiple candidates:

```
1. Get all candidates for movie
2. Extract audio from video file ONCE → temp audio file
3. For each candidate needing sync validation:
   - Run ffsubsync with extracted audio as reference
   - Store sync_score
4. Clean up temp audio file
```

This optimization reduces total validation time from `N × 20-30s` to `20-30s + (N × 5-10s)`.

```typescript
async function validateAllCandidates(
  videoPath: string,
  candidates: SubtitleCandidate[]
): Promise<void> {
  // Extract audio once
  const audioPath = await extractAudioForSync(videoPath);

  try {
    for (const candidate of candidates) {
      const result = await runFFSubsync(audioPath, candidate.tempPath);
      await updateSyncScore(candidate.id, result);
    }
  } finally {
    // Clean up extracted audio
    await fs.unlink(audioPath);
  }
}
```

### Why ffsubsync over alternatives

- **Actively maintained** - Regular releases through 2025
- **Large community** - 7.5k GitHub stars, 13 contributors
- **Python-native** - Direct integration, no binary shelling
- **Well-documented** - Official docs at subsync.readthedocs.io
- **Reliable** - Covers 95%+ of use cases (start/end offset issues)

**Alternatives considered**:
- alass: Better edge case handling but stale (no updates since 2019, creator inactive 5+ years)
- sc0ty/subsync: Archived October 2024
- tympanix/subsync: Neural net approach, less mature

### Usage

```bash
# Sync subtitle to video
ffsubsync video.mkv -i subtitle.srt -o output.srt

# Get alignment info without writing output
ffsubsync video.mkv -i subtitle.srt --no-fix
```

### Output Parsing

```typescript
interface FFSubsyncResult {
  // Offset in seconds (positive = subtitle was late)
  offset_seconds: number;
  // Framerate ratio (for pace correction)
  framerate_ratio: number;
  // Whether sync was successful
  success: boolean;
}
```

### Performance

- Audio extraction: 10-20 seconds (most expensive step)
- Alignment computation: 5-10 seconds
- Total: ~20-30 seconds per subtitle
- With extracted audio reference: ~5-10 seconds per subtitle
- With reference SRT (no audio extraction): < 1 second

**Integration Approach**:
```typescript
import { spawn } from 'child_process';

interface SyncResult {
  syncScore: number;
  offsetSeconds: number;
  success: boolean;
}

async function validateSubtitleSync(
  videoPath: string,
  subtitlePath: string
): Promise<SyncResult> {
  return new Promise((resolve, reject) => {
    const process = spawn('python3', [
      '-m', 'ffsubsync',
      videoPath,
      '-i', subtitlePath,
      '--no-fix',  // Don't write output, just analyze
      '--vad', 'webrtc'
    ], { timeout: 120000 });

    let stdout = '';
    let stderr = '';

    process.stdout.on('data', (data) => { stdout += data; });
    process.stderr.on('data', (data) => { stderr += data; });

    process.on('close', (code) => {
      if (code === 0) {
        // Parse output for offset info
        const offsetMatch = stdout.match(/offset: ([-\d.]+)/);
        const offset = offsetMatch ? parseFloat(offsetMatch[1]) : 0;

        // Convert offset to sync score (smaller offset = better score)
        // Perfect sync (0s offset) = 100, 5s offset = 50, 10s+ = 0
        const syncScore = Math.max(0, 100 - Math.abs(offset) * 10);

        resolve({
          syncScore,
          offsetSeconds: offset,
          success: true
        });
      } else {
        resolve({
          syncScore: 0,
          offsetSeconds: 0,
          success: false
        });
      }
    });
  });
}
```

**Sync Score Calculation**:
```typescript
// Convert ffsubsync offset to 0-100 score
function calculateSyncScore(offsetSeconds: number): number {
  const absOffset = Math.abs(offsetSeconds);

  if (absOffset <= 0.5) return 100;      // Perfect sync
  if (absOffset <= 1.0) return 95;       // Excellent
  if (absOffset <= 2.0) return 85;       // Good
  if (absOffset <= 3.0) return 75;       // Acceptable
  if (absOffset <= 5.0) return 65;       // Marginal
  if (absOffset <= 10.0) return 50;      // Poor
  return Math.max(0, 50 - (absOffset - 10) * 5);  // Very poor
}
```

---

## Language Detection

### Tool: franc

**Package**: `franc` (npm)
**Documentation**: https://github.com/wooorm/franc

| Variant | Languages | Size |
|---------|-----------|------|
| `franc` | 400+ | Full |
| `franc-min` | 82 | Minimal |

**Recommendation**: Use `franc-min` for performance (covers all common languages)

**Installation**:
```bash
npm install franc-min
```

**Usage**:
```typescript
import { francAll } from 'franc-min';

function detectLanguage(text: string): { code: string; confidence: number } | null {
  // franc needs sufficient text for accurate detection
  if (text.length < 50) {
    return null; // Too short for reliable detection
  }

  const results = francAll(text);

  if (results.length === 0 || results[0][1] < 0.5) {
    return null; // Low confidence
  }

  // franc returns ISO 639-3, convert to ISO 639-1
  const iso639_3 = results[0][0];
  const iso639_1 = convertIso639_3to1(iso639_3);

  return {
    code: iso639_1,
    confidence: results[0][1]
  };
}

// Aggregate multiple subtitle cues for better detection
async function detectSubtitleLanguage(subtitlePath: string): Promise<{ code: string; confidence: number } | null> {
  const content = await fs.readFile(subtitlePath, 'utf-8');

  // Extract text from SRT (remove timestamps and formatting)
  const textOnly = extractTextFromSRT(content);

  // Sample first ~2000 characters for detection
  const sample = textOnly.slice(0, 2000);

  return detectLanguage(sample);
}
```

**ISO 639-3 to ISO 639-1 Mapping**:
```typescript
const ISO_MAPPING: Record<string, string> = {
  'eng': 'en',
  'fra': 'fr',
  'deu': 'de',
  'spa': 'es',
  'ita': 'it',
  'por': 'pt',
  'rus': 'ru',
  'jpn': 'ja',
  'zho': 'zh',
  'kor': 'ko',
  'nld': 'nl',
  'pol': 'pl',
  'swe': 'sv',
  'dan': 'da',
  'nor': 'no',
  'fin': 'fi',
  'tur': 'tr',
  'ara': 'ar',
  'heb': 'he',
  'hin': 'hi',
  'tha': 'th',
  'vie': 'vi',
  'ind': 'id',
  'msa': 'ms',
  'ces': 'cs',
  'hun': 'hu',
  'ron': 'ro',
  'bul': 'bg',
  'hrv': 'hr',
  'slk': 'sk',
  'slv': 'sl',
  'ukr': 'uk',
  'ell': 'el',
  // ... etc
};
```

---

## Selection Algorithm

### Weighted Scoring (0-100 points)

```typescript
interface SubtitleScore {
  sourceScore: number;      // 0-40 points
  syncScore: number;        // 0-30 points
  languageScore: number;    // 0-20 points
  formatScore: number;      // 0-10 points
  total: number;            // 0-100 points
}

function calculateSubtitleScore(
  candidate: SubtitleCandidate,
  preferredLanguages: string[],
  minSyncScore: number
): SubtitleScore {
  let sourceScore = 0;
  let syncScore = 0;
  let languageScore = 0;
  let formatScore = 0;

  // === SOURCE TRUST (0-40 points) ===
  if (candidate.hash_match) {
    sourceScore = 40;  // Hash-matched provider
  } else if (candidate.release_match) {
    sourceScore = 35;  // Release name matched
  } else if (candidate.source_type === 'embedded' && candidate.language_detected) {
    sourceScore = 30;  // Embedded with verified language
  } else if (candidate.source_type === 'external') {
    sourceScore = 25;  // External file in library
  } else if (candidate.source_type === 'opensubtitles' || candidate.source_type === 'subdb') {
    sourceScore = 15;  // Provider match without hash
  } else if (candidate.source_type === 'embedded') {
    sourceScore = 10;  // Embedded with unknown language
  }

  // === SYNC VALIDATION (0-30 points) ===
  if (candidate.sync_score !== null) {
    if (candidate.sync_score < minSyncScore) {
      // Reject if below threshold
      return { sourceScore: 0, syncScore: 0, languageScore: 0, formatScore: 0, total: 0 };
    }

    if (candidate.sync_score >= 95) syncScore = 30;
    else if (candidate.sync_score >= 85) syncScore = 25;
    else if (candidate.sync_score >= 75) syncScore = 20;
    else if (candidate.sync_score >= 65) syncScore = 10;
  } else {
    // No sync data - assume embedded/external are synced
    if (candidate.source_type === 'embedded' || candidate.source_type === 'external') {
      syncScore = 25;  // Trust local files
    }
  }

  // === LANGUAGE MATCH (0-20 points) ===
  const detectedLang = candidate.language_detected || candidate.language_claimed;
  if (detectedLang) {
    const langIndex = preferredLanguages.indexOf(detectedLang);
    if (langIndex === 0) {
      languageScore = 20;  // Primary language
    } else if (langIndex > 0) {
      languageScore = 15;  // Secondary language
    } else if (candidate.language_detected === detectedLang) {
      languageScore = 5;   // Verified but not preferred
    }
  }

  // === FORMAT PREFERENCE (0-10 points) ===
  switch (candidate.format?.toLowerCase()) {
    case 'srt': formatScore = 10; break;
    case 'vtt': formatScore = 8; break;
    case 'ass':
    case 'ssa': formatScore = 6; break;
    default: formatScore = 2;
  }

  const total = sourceScore + syncScore + languageScore + formatScore;

  return { sourceScore, syncScore, languageScore, formatScore, total };
}
```

### Selection Process

```typescript
async function selectSubtitles(
  entityType: 'movie' | 'episode',
  entityId: number,
  config: SubtitleConfig
): Promise<void> {
  const candidates = await db.query<SubtitleCandidate>(
    `SELECT * FROM subtitle_candidates
     WHERE entity_type = ? AND entity_id = ?`,
    [entityType, entityId]
  );

  // Score all candidates
  const scored = candidates.map(c => ({
    ...c,
    ...calculateSubtitleScore(c, config.languages, config.minSyncScore)
  }));

  // Group by detected language
  const byLanguage = new Map<string, typeof scored>();
  for (const candidate of scored) {
    const lang = candidate.language_detected || candidate.language_claimed || 'unknown';
    if (!byLanguage.has(lang)) byLanguage.set(lang, []);
    byLanguage.get(lang)!.push(candidate);
  }

  // Select best candidates per preferred language
  const selected: number[] = [];

  for (const lang of config.languages) {
    const langCandidates = byLanguage.get(lang) || [];

    // Sort by total score descending
    langCandidates.sort((a, b) => b.total - a.total);

    // Select up to maxPerLanguage
    for (let i = 0; i < Math.min(config.maxPerLanguage, langCandidates.length); i++) {
      if (langCandidates[i].total >= 50) {  // Minimum threshold
        selected.push(langCandidates[i].id);
      }
    }
  }

  // Update selection in database
  await db.execute(
    `UPDATE subtitle_candidates SET is_selected = 0 WHERE entity_type = ? AND entity_id = ?`,
    [entityType, entityId]
  );

  if (selected.length > 0) {
    await db.execute(
      `UPDATE subtitle_candidates
       SET is_selected = 1, selected_at = CURRENT_TIMESTAMP
       WHERE id IN (${selected.join(',')})`,
      []
    );
  }
}
```

---

## User Override & Locking

Following Metarr's core philosophy of **"Smart Automation with Manual Override"**, users can override automatic subtitle selection and lock their choices.

### The Lock Pattern

This mirrors the existing field-level locking pattern used elsewhere in Metarr:

| State | Behavior |
|-------|----------|
| **Unlocked** | Automation selects best candidate; may change on re-enrichment if better found |
| **Locked** | User's manual selection preserved; automation won't override on re-enrichment |

### User Workflow

1. **View candidates**: User sees all available subtitles grouped by language and type
2. **See auto-selection**: Currently selected subtitle highlighted with score breakdown
3. **Override**: User clicks different candidate to select it
4. **Auto-lock**: Manual selection automatically locks that (language, type) group
5. **Unlock**: User can unlock to return to auto-selection mode

### Database Fields

```sql
-- Added to subtitle_candidates table
user_selected INTEGER DEFAULT 0,     -- User manually chose this (boolean)
user_selected_at TEXT,               -- When user made selection (ISO datetime)
```

### Selection Logic with Locking

```typescript
async function selectSubtitles(
  entityType: 'movie' | 'episode',
  entityId: number,
  config: SubtitleConfig
): Promise<void> {
  const candidates = await getCandidates(entityType, entityId);

  // Group by (language, type)
  const groups = groupByLanguageAndType(candidates);

  for (const [groupKey, groupCandidates] of groups) {
    // Check if this group has a user-locked selection
    const userSelected = groupCandidates.find(c => c.user_selected);

    if (userSelected) {
      // Respect user's locked selection - don't change it
      continue;
    }

    // No lock - run auto-selection
    const best = selectBest(groupCandidates, config);
    if (best) {
      await markSelected(best.id);
    }
  }
}
```

### API Endpoints

```typescript
// Manual selection (auto-locks)
POST /api/movies/:id/subtitles/select
Body: { candidateId: number }

// Unlock (returns to auto-selection)
POST /api/movies/:id/subtitles/unlock
Body: { language: string, type: 'full' | 'forced' | 'sdh' }

// Get candidates with selection state
GET /api/movies/:id/subtitles
Response: {
  groups: [
    {
      language: 'en',
      type: 'full',
      locked: boolean,
      selected: SubtitleCandidate | null,
      alternatives: SubtitleCandidate[]
    }
  ]
}
```

### UI Behavior

When user selects a different candidate:

1. Mark new candidate as `is_selected = 1, user_selected = 1`
2. Clear previous selection in same group
3. If new candidate not yet cached:
   - Download/extract to temp
   - Validate (language, sync if available)
   - Clean and cache
4. Publish to library with correct naming

### Re-enrichment Behavior

| Scenario | Locked Groups | Unlocked Groups |
|----------|---------------|-----------------|
| New candidates found | Keep user selection, show new alternatives in UI | May change selection if new candidate scores higher |
| Selected candidate no longer available | Keep locked, show warning in UI | Auto-select next best |
| User clicks "Refresh" | Fetch new candidates, preserve locks | Fetch new candidates, re-run auto-selection |

---

## Database Schema

### New Table: subtitle_candidates

A dedicated table for tracking subtitle options from all sources (embedded, external, providers).

```sql
CREATE TABLE subtitle_candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('movie', 'episode')),
  entity_id INTEGER NOT NULL,

  -- Source identification
  source_type TEXT NOT NULL CHECK(source_type IN (
    'embedded',           -- Detected in video file (not yet extracted)
    'external',           -- Found in library folder
    'opensubtitles',      -- Downloaded from OpenSubtitles
    'subdb'               -- Downloaded from SubDB
  )),
  provider_subtitle_id TEXT,      -- Provider's unique ID for this subtitle

  -- Language tracking
  language_claimed TEXT,          -- What source/metadata says (ISO 639-1)
  language_detected TEXT,         -- What franc detected (ISO 639-1)
  language_confidence REAL,       -- franc confidence 0.0-1.0

  -- Quality metrics
  sync_score REAL,                -- ffsubsync-derived score 0-100
  sync_offset_seconds REAL,       -- Timing offset in seconds
  hash_match INTEGER DEFAULT 0,   -- Was this a hash match? (boolean)
  release_match INTEGER DEFAULT 0,-- Was this a release name match? (boolean)

  -- File information
  format TEXT NOT NULL,           -- 'srt', 'ass', 'vtt', 'sub', 'pgs', 'vobsub'
  is_text_based INTEGER DEFAULT 1,-- Can we process this? (0 for PGS/VobSub bitmap formats)
  forced INTEGER DEFAULT 0,       -- Forced subtitles flag (boolean)
  sdh INTEGER DEFAULT 0,          -- Subtitles for Deaf/Hard of Hearing (boolean)

  -- For embedded subtitles (before extraction)
  stream_index INTEGER,           -- FFprobe stream index

  -- For external/downloaded
  download_url TEXT,              -- Provider download URL
  file_hash TEXT,                 -- SHA256 for deduplication
  file_size INTEGER,              -- File size in bytes

  -- Cache reference (after extraction/download)
  cache_file_id INTEGER,          -- FK to cache_text_files when cached

  -- Selection state
  score INTEGER,                  -- Calculated weighted score (0-100)
  is_selected INTEGER DEFAULT 0,  -- Whether selected for use (boolean)
  selected_at TEXT,               -- When selected (ISO datetime)
  user_selected INTEGER DEFAULT 0,-- User manually selected this (locks against auto-change)
  user_selected_at TEXT,          -- When user made manual selection

  -- Timestamps
  discovered_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),

  -- Constraints
  FOREIGN KEY (entity_id) REFERENCES movies(id) ON DELETE CASCADE,
  FOREIGN KEY (cache_file_id) REFERENCES cache_text_files(id) ON DELETE SET NULL,
  UNIQUE(entity_type, entity_id, source_type, COALESCE(provider_subtitle_id, CAST(stream_index AS TEXT), file_hash))
);

-- Indexes for common queries
CREATE INDEX idx_subtitle_candidates_entity ON subtitle_candidates(entity_type, entity_id);
CREATE INDEX idx_subtitle_candidates_language ON subtitle_candidates(language_detected);
CREATE INDEX idx_subtitle_candidates_selected ON subtitle_candidates(is_selected) WHERE is_selected = 1;
CREATE INDEX idx_subtitle_candidates_source ON subtitle_candidates(source_type);
CREATE INDEX idx_subtitle_candidates_cache ON subtitle_candidates(cache_file_id);
```

### Existing Tables Used

**`subtitle_streams`** - Raw FFprobe stream metadata (codec, language tag, forced flag). Used during scanning to populate `subtitle_candidates` with `source_type='embedded'`.

**`cache_text_files`** - Protected cache storage. When a subtitle candidate is selected:
1. Download/extract to temp directory
2. Validate (language detection, sync scoring)
3. If valid, move to cache and create `cache_text_files` record
4. Link via `subtitle_candidates.cache_file_id`

**`library_text_files`** - Published subtitles in library (ephemeral, rebuilds from cache).

### Data Flow

```
SCANNING
  │
  ▼
subtitle_streams (FFprobe raw data)
  │
  ▼
subtitle_candidates (source_type='embedded', stream_index set, cache_file_id=NULL)

ENRICHMENT
  │
  ├── Query providers → subtitle_candidates (source_type='opensubtitles'/'subdb')
  │
  ▼
SELECTION
  │
  ├── Score all candidates
  ├── Mark best as is_selected=1
  │
  ▼
CACHING (for selected candidates)
  │
  ├── Embedded: Extract to temp → validate → move to cache
  ├── Provider: Download to temp → validate → move to cache
  │
  ▼
cache_text_files (subtitle stored)
  │
  ├── Update subtitle_candidates.cache_file_id
  │
  ▼
PUBLISHING
  │
  ├── Copy from cache to library with naming convention
  ├── Optionally strip embedded subs from video file
  │
  ▼
library_text_files (published subtitle)
```

---

## Configuration

### Settings Keys

```typescript
// Subtitle-specific settings
'subtitle.languages'           = '["en"]'       // JSON array, ordered by priority
'subtitle.includeFull'         = 'true'         // Include full dialogue subtitles
'subtitle.includeForced'       = 'true'         // Include forced (foreign parts only) subtitles
'subtitle.includeSdh'          = 'false'        // Include SDH/HI subtitles
'subtitle.minSyncScore'        = '65'           // Reject below this threshold (0 to disable)
'subtitle.stripEmbedded'       = 'false'        // Remove embedded subs from video after publish

// Provider settings (in providers table)
'opensubtitles.apiKey'      = ''             // User's API key (optional, for VIP tier)
'opensubtitles.username'    = ''             // Account username (required for OpenSubtitles)
'opensubtitles.password'    = ''             // Account password (encrypted)
```

**Note**: When `minSyncScore` is set to 0 or sync validation is unavailable, subtitles are scored based on other factors only.

**Note on `subtitle.stripEmbedded`**:
When enabled, after publishing external subtitles, Metarr will:
1. Create a new video file without subtitle streams: `ffmpeg -i input.mkv -map 0 -map -0:s -c copy output.mkv`
2. Replace the original video file with the stripped version
3. Rehash the video file for future scanning
4. This reduces file size and avoids duplicate subtitles in players

**Warning**: This is a destructive operation. The original embedded subtitles cannot be recovered after stripping.

### TypeScript Interfaces

```typescript
interface SubtitleConfig {
  languages: string[];           // Ordered by priority, e.g., ['en', 'es']
  includeFull: boolean;          // Default: true - get full dialogue subtitles
  includeForced: boolean;        // Default: true - get forced (foreign parts) subtitles
  includeSdh: boolean;           // Default: false - get SDH/HI subtitles
  minSyncScore: number;          // Default: 65, 0 to disable sync filtering
  stripEmbedded: boolean;        // Default: false - remove embedded subs after publish
}

// Subtitle type enumeration
type SubtitleType = 'full' | 'forced' | 'sdh';

// Selection group key
interface SubtitleGroup {
  language: string;              // ISO 639-1 code, e.g., 'en'
  type: SubtitleType;            // 'full', 'forced', or 'sdh'
}

// Keep artwork/trailers on existing single language
interface EnrichmentPhaseConfig {
  fetchProviderAssets: boolean;
  autoSelectAssets: boolean;
  preferredLanguage: string;     // Single language for artwork/trailers
}
```

---

## File Naming Convention

### Standard Format

```
{MovieName}.{language}.{flags}.{extension}
```

### Examples

| File Name | Description |
|-----------|-------------|
| `Movie Name (2024).en.srt` | English subtitles |
| `Movie Name (2024).en.forced.srt` | English forced (signs/text only) |
| `Movie Name (2024).en.sdh.srt` | English SDH (hearing impaired) |
| `Movie Name (2024).en.default.srt` | English, set as default |
| `Movie Name (2024).de.srt` | German subtitles |
| `Movie Name (2024).es.forced.sdh.srt` | Spanish, forced + SDH |

### Flags

| Flag | Purpose | Notes |
|------|---------|-------|
| `.forced` | Forced subtitles | Translations of signs, text on screen |
| `.sdh` | Subtitles for Deaf/Hard of Hearing | Preferred over `.hi` for compatibility |
| `.hi` | Hearing impaired | Use with language code: `en.hi.srt` |
| `.cc` | Closed captions | Alternative to SDH |
| `.default` | Set as default track | Player auto-selects this |

### Compatibility Notes

- **Jellyfin**: Use `.sdh` instead of `.hi` alone (conflicts with Hindi)
- **Plex**: Requires Plex Movie agent (not Legacy) for SDH support
- **Kodi**: Supports all flags

### Implementation

```typescript
function generateSubtitleFilename(
  movieFilename: string,  // e.g., "Movie Name (2024).mkv"
  language: string,       // e.g., "en"
  format: string,         // e.g., "srt"
  forced: boolean,
  sdh: boolean,
  isDefault: boolean
): string {
  const baseName = movieFilename.replace(/\.[^.]+$/, '');  // Remove extension

  const flags: string[] = [];
  if (forced) flags.push('forced');
  if (sdh) flags.push('sdh');
  if (isDefault) flags.push('default');

  const flagStr = flags.length > 0 ? '.' + flags.join('.') : '';

  return `${baseName}.${language}${flagStr}.${format}`;
}
```

---

## Subtitle Cleaning

All subtitles are cleaned before caching to ensure high-quality output. Cleaning is **always enabled** - ads and attributions are never desirable.

### Why Clean Subtitles?

Subtitle files from providers (especially OpenSubtitles) often contain:
- **Promotional text**: Links to subtitle websites
- **Attribution lines**: "Subtitles by...", "Synced by..."
- **Release info**: Quality tags, encoding info
- **Social media**: Follow/donate requests

These appear at the **beginning and end** of subtitle files, typically in the first and last 1-3 cues.

### Cleaning Patterns

Based on research from community tools ([sub-clean.sh](https://github.com/brianspilner01/media-server-scripts/blob/master/sub-clean.sh), [srtcleaner](https://pypi.org/project/srtcleaner/), [CleanSubs](https://forum.kodi.tv/showthread.php?tid=283342)):

```typescript
const AD_PATTERNS = [
  // === Website/Service Ads ===
  /opensubtitles\.org/gi,
  /subscene\.com/gi,
  /addic7ed\.com/gi,
  /podnapisi\.net/gi,
  /yifysubtitles/gi,
  /thesubdb/gi,
  /(?:www\.|http).*(?:\.com|\.org|\.net)/gi,

  // === Attribution Lines ===
  /^(?:subtitle|caption|sub)s?\s+(?:by|from|ripped|synced|corrected).*$/gim,
  /^(?:translated|sync(?:ed|hronized)?|ripped|encoded)\s+by.*$/gim,
  /^(?:support|download|get)\s+(?:more\s+)?(?:subtitle|sub)s?\s+(?:at|from).*$/gim,

  // === VIP/Support Ads ===
  /support us and become vip/gi,
  /advertise your product/gi,
  /(?:follow|like|subscribe|donate).*(?:twitter|facebook|patreon|paypal)/gi,

  // === Release/Quality Info ===
  /^\[.*(?:720p|1080p|2160p|4k|x264|x265|hevc|bluray|webrip|dvdrip|brrip).*\]$/gim,
  /(?:br|dvd|web)[\.\-]?(?:rip|scr)/gi,

  // === Subtitle Site Attributions ===
  /\[.*(?:subtitle|sub|caption).*\]/gi,
  /bozxphd|sazu489|psagmeno|normita|anoxmous/gi,
];

// Patterns that indicate the ENTIRE cue should be removed
const FULL_CUE_REMOVAL_PATTERNS = [
  /^www\./i,
  /^http/i,
  /^subtitle[sd]?\s+by/i,
  /^sync(?:ed|hronized)?\s+by/i,
  /^corrected\s+by/i,
  /^encoded\s+by/i,
  /^ripped\s+by/i,
  /opensubtitles/i,
  /subscene/i,
  /addic7ed/i,
];
```

### Cleaning Algorithm

```typescript
interface CleaningResult {
  cleaned: string;
  removedCues: number;
  modifiedCues: number;
}

async function cleanSubtitle(
  content: string,
  format: 'srt' | 'ass' | 'vtt'
): Promise<CleaningResult> {
  // 1. Parse into cues
  const cues = parseSubtitleCues(content, format);

  let removedCues = 0;
  let modifiedCues = 0;

  // 2. Process each cue
  const cleanedCues = cues
    .map(cue => {
      // Check if entire cue should be removed
      if (shouldRemoveCue(cue.text)) {
        removedCues++;
        return null;
      }

      // Clean the cue text
      const cleanedText = cleanCueText(cue.text);

      if (cleanedText !== cue.text) {
        modifiedCues++;
      }

      // Remove if now empty
      if (cleanedText.trim().length === 0) {
        removedCues++;
        return null;
      }

      return { ...cue, text: cleanedText };
    })
    .filter(Boolean);

  // 3. Rebuild subtitle file
  const cleaned = rebuildSubtitleFile(cleanedCues, format);

  return { cleaned, removedCues, modifiedCues };
}

function shouldRemoveCue(text: string): boolean {
  const trimmed = text.trim();
  return FULL_CUE_REMOVAL_PATTERNS.some(pattern => pattern.test(trimmed));
}

function cleanCueText(text: string): string {
  let cleaned = text;

  for (const pattern of AD_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }

  // Normalize whitespace
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  cleaned = cleaned.trim();

  return cleaned;
}
```

### Format-Specific Handling

| Format | Considerations |
|--------|----------------|
| **SRT** | Simple text, just clean and preserve `<i>`, `<b>` tags |
| **ASS** | Preserve styling tags `{\an8}`, `{\pos()}`, colors, etc. |
| **VTT** | Preserve positioning, `::cue` styling, `<c>` tags |

### Logging

```typescript
// Log cleaning results for transparency
logger.info(`Cleaned subtitle: removed ${result.removedCues} cues, modified ${result.modifiedCues} cues`);
```

---

## Implementation Phases

### Phase 1: Foundation (Database & Core Types)

**Goal**: Establish data structures and basic infrastructure

**Tasks**:
1. [ ] Add `subtitle_candidates` table to migration
2. [ ] Create TypeScript interfaces for subtitle types
3. [ ] Add subtitle settings to PhaseConfigService
4. [ ] Implement hash computation (OpenSubtitles + SubDB algorithms)
5. [ ] Add franc-min dependency

**Estimated Effort**: 1-2 days

### Phase 2: Embedded Subtitle Detection

**Goal**: Discover and catalog embedded subtitles during scanning

**Tasks**:
1. [ ] Enhance FFprobe service to extract subtitle stream details
2. [ ] Create SubtitleDiscoveryService for scanning
3. [ ] Store embedded streams in subtitle_candidates
4. [ ] Run language detection on extractable text streams
5. [ ] Handle external subtitle files during scan

**Estimated Effort**: 2-3 days

### Phase 3: Provider Integration

**Goal**: Fetch subtitles from external providers

**Tasks**:
1. [ ] Implement OpenSubtitlesClient
   - Authentication (API key + JWT)
   - Hash-based search
   - IMDB/TMDB fallback search
   - Download handling
2. [ ] Implement SubDBClient
   - Hash-based search
   - Download handling
3. [ ] Add provider settings UI
4. [ ] Create SubtitleEnrichmentPhase

**Estimated Effort**: 3-4 days

### Phase 4: Sync Validation

**Goal**: Validate subtitle timing matches video

**Tasks**:
1. [ ] Add ffsubsync Python dependency
2. [ ] Implement sync validation wrapper
3. [ ] Parse ffsubsync output for offset/score
4. [ ] Store sync_score in candidates
5. [ ] Handle extraction for embedded subtitle validation
6. [ ] Add timeout and error handling

**Estimated Effort**: 2-3 days

### Phase 5: Selection & Caching

**Goal**: Score, select, and cache best subtitles

**Tasks**:
1. [ ] Implement SubtitleScoringService
2. [ ] Implement SubtitleSelectionPhase
3. [ ] Add cache storage for subtitles
4. [ ] Implement extraction logic (fallback mode)
5. [ ] Handle format conversion if needed

**Estimated Effort**: 2-3 days

### Phase 6: Publishing

**Goal**: Deploy selected subtitles to library

**Tasks**:
1. [ ] Implement subtitle publishing in PublishingService
2. [ ] Apply naming conventions
3. [ ] Handle flag detection (forced, SDH)
4. [ ] Update library_path in database
5. [ ] Integrate with existing publish workflow

**Estimated Effort**: 1-2 days

### Phase 7: UI Implementation

**Goal**: User interface for configuration and management

**Tasks**:
1. [ ] Create language multi-select component (with priority ordering)
2. [ ] Add subtitle settings to Workflow page
3. [ ] Create Subtitles tab in Movie detail view
4. [ ] Show candidates with scores, allow manual selection
5. [ ] Add provider configuration UI (OpenSubtitles credentials)

**Estimated Effort**: 3-4 days

### Phase 8: Testing & Polish

**Goal**: Ensure reliability and handle edge cases

**Tasks**:
1. [ ] Unit tests for hash computation
2. [ ] Unit tests for scoring algorithm
3. [ ] Integration tests for provider clients
4. [ ] E2E tests for full workflow
5. [ ] Documentation updates
6. [ ] Error handling and logging improvements

**Estimated Effort**: 2-3 days

### Total Estimated Effort: 16-24 days

---

## Technical Details

### Hash Computation

Both providers require hash computation from video files:

```typescript
// src/services/subtitles/hashService.ts

export async function computeOpenSubtitlesHash(filePath: string): Promise<string>;
export async function computeSubDBHash(filePath: string): Promise<string>;
```

### Embedded Subtitle Extraction

Use ffmpeg to extract embedded subtitles:

```bash
# Extract specific stream to SRT
ffmpeg -i input.mkv -map 0:s:0 -c:s srt output.srt

# Extract with stream index
ffmpeg -i input.mkv -map 0:2 output.srt
```

```typescript
// src/services/subtitles/extractionService.ts

export async function extractEmbeddedSubtitle(
  videoPath: string,
  streamIndex: number,
  outputPath: string,
  format: 'srt' | 'vtt' | 'ass'
): Promise<void>;
```

### Provider Client Architecture

```typescript
// src/services/providers/subtitles/SubtitleProvider.ts

export interface SubtitleProvider {
  name: string;

  search(params: SubtitleSearchParams): Promise<SubtitleSearchResult[]>;
  download(subtitle: SubtitleSearchResult, outputPath: string): Promise<void>;
}

export interface SubtitleSearchParams {
  videoPath: string;
  videoHash?: string;
  imdbId?: string;
  tmdbId?: number;
  languages: string[];
}

export interface SubtitleSearchResult {
  providerId: string;
  providerSubtitleId: string;
  language: string;
  format: string;
  downloadUrl: string;
  hashMatch: boolean;
  releaseMatch: boolean;
  forced?: boolean;
  sdh?: boolean;
}
```

### Python Integration for ffsubsync

```typescript
// src/services/subtitles/syncValidationService.ts

import { spawn } from 'child_process';

export class SyncValidationService {
  /**
   * Validate subtitle sync against video using ffsubsync
   *
   * @param videoPath Path to video file
   * @param subtitlePath Path to subtitle file
   * @returns Sync score (0-100) and offset in seconds
   */
  async validateSync(
    videoPath: string,
    subtitlePath: string
  ): Promise<{ score: number; offsetSeconds: number; success: boolean }> {
    return new Promise((resolve) => {
      const proc = spawn('python3', [
        '-m', 'ffsubsync',
        videoPath,
        '-i', subtitlePath,
        '--no-fix'
      ], { timeout: 120000 });

      let output = '';
      proc.stdout.on('data', (d) => output += d);
      proc.stderr.on('data', (d) => output += d);

      proc.on('close', (code) => {
        if (code !== 0) {
          resolve({ score: 0, offsetSeconds: 0, success: false });
          return;
        }

        // Parse offset from output
        const match = output.match(/offset seconds: ([-\d.]+)/i);
        const offset = match ? parseFloat(match[1]) : 0;
        const score = this.calculateSyncScore(offset);

        resolve({ score, offsetSeconds: offset, success: true });
      });
    });
  }

  private calculateSyncScore(offsetSeconds: number): number {
    const abs = Math.abs(offsetSeconds);
    if (abs <= 0.5) return 100;
    if (abs <= 1.0) return 95;
    if (abs <= 2.0) return 85;
    if (abs <= 3.0) return 75;
    if (abs <= 5.0) return 65;
    if (abs <= 10.0) return 50;
    return Math.max(0, 50 - (abs - 10) * 5);
  }
}
```

---

## UI Requirements

### Workflow Settings Page

**New Section**: Subtitle Settings

```
┌─────────────────────────────────────────────────────────────┐
│ Subtitle Settings                                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Preferred Languages                                         │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 1. English (en)                              [↕] [✕]   │ │
│ │ 2. Spanish (es)                              [↕] [✕]   │ │
│ └─────────────────────────────────────────────────────────┘ │
│ [+ Add Language]                                            │
│ Drag to reorder priority                                    │
│                                                             │
│ Subtitle Types                                              │
│ ☑ Full subtitles (all dialogue)                             │
│ ☑ Forced subtitles (foreign parts only)                     │
│ ☐ SDH/CC subtitles (hearing impaired)                       │
│                                                             │
│ Minimum sync score    [65 ▼]  (0 to disable)                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Movie Detail - Subtitles Tab

Subtitles are grouped by **language**, then by **type** (full/forced/SDH). Users can override auto-selection within each group.

```
┌─────────────────────────────────────────────────────────────────┐
│ Subtitles                                          [↻ Refresh]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ English                                                         │
│ ┌───────────────────────────────────────────────────────────┐   │
│ │ FULL SUBTITLES                                            │   │
│ │ ● OpenSubtitles (hash match)        Score: 95  [✓] 🔒    │   │
│ │   Sync: 98% │ Format: SRT                                 │   │
│ │ ○ Embedded (stream #3)              Score: 72            │   │
│ │   Sync: N/A │ Format: SRT                                 │   │
│ │ ○ OpenSubtitles                     Score: 68            │   │
│ │   Sync: 87% │ Format: SRT                                 │   │
│ ├───────────────────────────────────────────────────────────┤   │
│ │ FORCED (Foreign Parts Only)                               │   │
│ │ ● OpenSubtitles (hash match)        Score: 91  [✓]       │   │
│ │   Sync: 96% │ Format: SRT                                 │   │
│ │ ○ Embedded (stream #4)              Score: 68            │   │
│ │   Sync: N/A │ Format: SRT │ forced flag                   │   │
│ ├───────────────────────────────────────────────────────────┤   │
│ │ SDH (Hearing Impaired)                         [Disabled] │   │
│ │   Not enabled in settings                                 │   │
│ └───────────────────────────────────────────────────────────┘   │
│                                                                 │
│ Spanish                                                         │
│ ┌───────────────────────────────────────────────────────────┐   │
│ │ FULL SUBTITLES                                            │   │
│ │ ● SubDB (hash match)                Score: 92  [✓]       │   │
│ │   Sync: 95% │ Format: SRT                                 │   │
│ ├───────────────────────────────────────────────────────────┤   │
│ │ FORCED (Foreign Parts Only)                               │   │
│ │   No candidates found               [Search Again]        │   │
│ └───────────────────────────────────────────────────────────┘   │
│                                                                 │
│ Legend: ● Selected  ○ Alternative  🔒 User-locked               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**UI Behavior:**
- **Radio buttons** within each (language, type) group - click to override
- **🔒 Lock icon** appears when user manually selects (prevents auto-change on re-enrichment)
- **Click lock** to unlock and return to auto-selection
- **Score breakdown** shown on hover/click for transparency
- **Warnings** for candidates below sync threshold

### Provider Settings

Add OpenSubtitles configuration to Providers page:

```
┌─────────────────────────────────────────────────────────────┐
│ OpenSubtitles                                   [Test] [●]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ⓘ Optional - SubDB works without configuration             │
│   Configure for better results and more languages           │
│                                                             │
│ Username    [________________________]                      │
│ Password    [________________________]                      │
│ API Key     [________________________] (optional, for VIP)  │
│                                                             │
│ Status: Connected (Free tier: 8/10 downloads today)         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

```
┌─────────────────────────────────────────────────────────────┐
│ SubDB                                           [Test] [●]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ✓ No configuration required                                 │
│   Hash-based matching only (no text search)                 │
│                                                             │
│ Status: Available                                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Testing Strategy

### Unit Tests

```typescript
// tests/services/subtitles/hashService.test.ts
describe('Hash Computation', () => {
  it('computes OpenSubtitles hash correctly');
  it('computes SubDB hash correctly');
  it('handles files smaller than 128KB');
});

// tests/services/subtitles/scoringService.test.ts
describe('Subtitle Scoring', () => {
  it('scores hash-matched subtitles highest');
  it('rejects subtitles below sync threshold');
  it('prefers detected language over claimed');
  it('applies format preference correctly');
});

// tests/services/subtitles/languageDetection.test.ts
describe('Language Detection', () => {
  it('detects English correctly');
  it('detects non-Latin scripts');
  it('returns null for insufficient text');
  it('converts ISO 639-3 to ISO 639-1');
});
```

### Integration Tests

```typescript
// tests/integration/subtitleProviders.test.ts
describe('OpenSubtitles Integration', () => {
  it('authenticates successfully');
  it('searches by hash');
  it('searches by IMDB ID');
  it('downloads subtitle file');
  it('handles rate limits gracefully');
});

describe('SubDB Integration', () => {
  it('searches by hash');
  it('downloads subtitle file');
  it('uses correct user agent');
});
```

### Test Data

Create test fixtures with known subtitle files:
- English SRT (valid sync)
- Spanish SRT (offset sync)
- ASS with styling
- Corrupted/invalid subtitle
- Very short subtitle (< 10 cues)

---

## Open Questions

### All Resolved ✅

| Question | Resolution |
|----------|------------|
| Artwork multi-language? | Keep single `preferredLanguage` for artwork/trailers |
| Sync tool choice? | ffsubsync - actively maintained, Python-native |
| Sync validation fallback? | **Skip if unavailable** - if ffsubsync not installed, skip sync validation rather than fail |
| Audio extraction optimization? | **Extract once, validate all** - extract audio from video once, reuse for all candidate validations |
| SubDB terms compliance? | Yes, Metarr qualifies as open-source/non-commercial |
| OpenSubtitles required? | **No - optional** - SubDB works out-of-box; OpenSubtitles enhances when configured |
| Embedded extraction timing? | **After selection phase** - extract only when selected as best option, validate in temp dir first |
| Embedded subtitle stripping? | **Optional at publish time** - user can choose to remove embedded subs and rehash the video |
| Provider rate limit handling? | **Same as other providers** - listen to HTTP response codes (429, etc.) |
| Subtitle format conversion? | **No conversion** - preserve original format, all common formats are supported by players |
| Cache organization? | **Follow existing pattern** - use `cache_text_files` table with `text_type='subtitle'` |
| Selection grouping? | **By language + type** - select best per (language, type) combo: full, forced, SDH |
| User override? | **Manual selection with locking** - user can override; locked selections preserved on re-enrichment |
| Subtitle cleaning? | **Always enabled** - remove ads/attributions using community-tested patterns |
| TV Show support? | **Movies first** - TV support will follow once movies are complete |

### Subtitle Format Strategy

**Philosophy**: Detect everything, but only process and output high-quality, text-based formats that we can validate and clean.

#### Format Classification

| Format | Type | Syncable | Lang Detect | Cleanable | Detect | Process |
|--------|------|----------|-------------|-----------|--------|---------|
| **SRT** | Text | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ **Primary** |
| **ASS/SSA** | Text | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ **Supported** |
| **VTT** | Text | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ **Supported** |
| **SUB** | Text | ⚠️ Frame-based | ✅ Yes | ✅ Yes | ✅ Yes | ⚠️ **Low priority** |
| **PGS** | Bitmap | ❌ No | ❌ No (OCR) | ❌ No | ✅ Yes | ❌ **Track only** |
| **VobSub** | Bitmap | ❌ No | ❌ No (OCR) | ❌ No | ✅ Yes | ❌ **Track only** |

#### Why Detect Everything?

We detect ALL subtitle formats (including bitmap) for two critical reasons:

1. **Future stripping support**: Users may want to remove unwanted embedded subtitles (e.g., foreign language PGS tracks they'll never use). By tracking them, we can later offer "strip all except selected" functionality.

2. **Avoid false positives in unknown file detection**: If we don't track bitmap subtitles, they could be misidentified as unknown files and potentially flagged for deletion. By recognizing them as subtitles (even if unprocessable), they flow through the proper pipeline.

#### Processing Rules

**Text-based formats (SRT, ASS, VTT)**:
1. **Detect** during scanning → create candidate with `is_text_based=1`
2. **Validate** - language detection, sync scoring
3. **Clean** before caching (see cleaning rules below)
4. **Cache** the cleaned version
5. **Publish** to library

**Bitmap formats (PGS, VobSub)**:
1. **Detect** during scanning → create candidate with `is_text_based=0`
2. **Track** in `subtitle_candidates` table (not just `subtitle_streams`)
3. **Skip validation** - cannot run language detection or sync scoring
4. **Skip caching** - no `cache_file_id` will be set
5. **UI display**: Show as "Detected (bitmap format - not processable)"
6. **Future use**: Available for stripping operations when user wants to remove unwanted embedded subs

#### Subtitle Cleaning Rules

Before caching, clean subtitle files to ensure quality output:

```typescript
interface SubtitleCleaningRules {
  // Remove common junk
  removeAds: true,              // "[Subtitles by XYZ]", "www.opensubtitles.org", etc.
  removeAttributions: true,     // "Translated by...", "Synced by...", etc.
  removeFrameInfo: true,        // "{frame info}" tags in some formats

  // Normalize formatting
  normalizeLineEndings: true,   // Convert to \n (Unix style)
  trimWhitespace: true,         // Remove leading/trailing whitespace per cue
  removeEmptyCues: true,        // Remove cues with no text

  // Preserve content
  preserveStyling: true,        // Keep ASS styling, italic/bold tags in SRT
  preservePositioning: true,    // Keep VTT/ASS positioning
}
```

**Common patterns to remove**:

```typescript
const AD_PATTERNS = [
  // Website/service ads
  /\[.*(?:subtitle|sub|caption).*\]/gi,
  /(?:www\.|http).*(?:\.com|\.org|\.net)/gi,
  /opensubtitles\.org/gi,
  /subscene\.com/gi,
  /addic7ed\.com/gi,
  /yifysubtitles/gi,

  // Attribution lines (typically at start or end)
  /^(?:subtitle|caption|sub)s?\s+(?:by|from|ripped|synced|corrected).*$/gim,
  /^(?:translated|sync(?:ed|hronized)?|ripped|encoded)\s+by.*$/gim,
  /^(?:support|download|get)\s+(?:more\s+)?(?:subtitle|sub)s?\s+(?:at|from).*$/gim,

  // Quality/encoding info
  /^\[.*(?:720p|1080p|x264|x265|bluray|webrip).*\]$/gim,

  // Social media / donation requests
  /(?:follow|like|subscribe|donate).*(?:twitter|facebook|patreon|paypal)/gi,
];
```

**Cleaning implementation**:

```typescript
async function cleanSubtitle(
  content: string,
  format: 'srt' | 'ass' | 'vtt'
): Promise<{ cleaned: string; removedCount: number }> {
  let cleaned = content;
  let removedCount = 0;

  // Parse into cues based on format
  const cues = parseSubtitleCues(cleaned, format);

  // Filter and clean each cue
  const cleanedCues = cues
    .map(cue => ({
      ...cue,
      text: removeAdPatterns(cue.text)
    }))
    .filter(cue => {
      const isEmpty = cue.text.trim().length === 0;
      if (isEmpty) removedCount++;
      return !isEmpty;
    });

  // Rebuild subtitle file
  cleaned = rebuildSubtitleFile(cleanedCues, format);

  return { cleaned, removedCount };
}
```

#### Output Format

**All text-based formats output as-is** (no conversion):
- SRT → SRT (cleaned)
- ASS → ASS (cleaned, styling preserved)
- VTT → VTT (cleaned, positioning preserved)

**Exception**: SUB (MicroDVD) may be converted to SRT since it's frame-based and rarely used.

#### Scoring by Format

Format affects the quality score:

```typescript
function getFormatScore(format: string): number {
  switch (format.toLowerCase()) {
    case 'srt': return 10;   // Universal, simple, reliable
    case 'ass':
    case 'ssa': return 8;    // Good, but more complex
    case 'vtt': return 8;    // Good, web standard
    case 'sub': return 4;    // Acceptable, but dated
    default:    return 0;    // Unknown/unsupported
  }
}
```

#### Why Not Convert Everything to SRT?

While SRT is the most universal, we preserve original formats because:
1. **ASS styling is valuable** - anime subtitles often have carefully designed positioning, colors, and effects
2. **VTT is modern** - better for web playback, some players prefer it
3. **Conversion loses information** - positioning, styling, effects
4. **All target players support all formats** - Kodi, Jellyfin, Plex handle SRT/ASS/VTT natively

#### Future: Bitmap Format Support

PGS/VobSub support would require OCR integration (Tesseract or similar). This is explicitly **out of scope for v1** due to:
- Significant complexity increase
- Additional dependencies (Tesseract, language models)
- Processing time (OCR is slow)
- Quality concerns (OCR accuracy varies)

If needed later, this would be a separate feature with its own planning document.

---

## References

### External Documentation

- [OpenSubtitles API](https://opensubtitles.stoplight.io/docs/opensubtitles-api/e3750fd63a100-getting-started)
- [SubDB API](http://thesubdb.com/api/)
- [ffsubsync GitHub](https://github.com/smacke/ffsubsync)
- [ffsubsync Docs](https://subsync.readthedocs.io/)
- [franc GitHub](https://github.com/wooorm/franc)
- [Jellyfin Subtitle Naming](https://jellyfin.org/docs/general/server/media/movies/)
- [Plex Subtitle Naming](https://support.plex.tv/articles/200471133-adding-local-subtitles-to-your-media/)

### Internal Documentation

- [Asset Management](../architecture/ASSET_MANAGEMENT/README.md)
- [Job Queue](../architecture/JOB_QUEUE.md)
- [Provider Architecture](../implementation/Providers/)
- [Database Schema](../architecture/DATABASE.md)
