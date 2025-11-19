# Asset Types Reference

**Purpose**: Complete reference for asset types by media category (movies, TV shows, music, actors).

**Related Docs**:
- Parent: [Asset Management](README.md)
- Database: [Asset Schema](../DATABASE.md#asset-management-tables)

## Quick Reference

**Movie Assets**: poster, fanart, banner, clearlogo, clearart, discart, landscape, keyart
**TV Show Assets**: Show-level + season-level + episode-level
**Music Assets**: Artist + album
**Actor Assets**: Actor headshots

## Movies

### Poster

**Purpose**: Primary vertical artwork for movie identification
**Dimensions**: Typically 1000x1500 (2:3 aspect ratio)
**Format**: JPG or PNG
**Player Support**: All players (Kodi, Jellyfin, Plex)
**File Naming**: `movie-poster.jpg` or `poster.jpg`

**Sources**:
- TMDB: Primary and alternative posters
- Fanart.tv: HD posters (higher quality)

**Quality Criteria**:
- Resolution (higher is better)
- Language match (user's preferred language)
- Aspect ratio (2:3 preferred)
- Vote average/count from provider

### Fanart

**Purpose**: Background artwork, displayed during movie playback or browsing
**Dimensions**: Typically 1920x1080 (16:9 aspect ratio)
**Format**: JPG (usually high quality)
**Player Support**: All players
**File Naming**: `movie-fanart.jpg` or `fanart.jpg`

**Sources**:
- TMDB: Backdrops
- Fanart.tv: HD movie backgrounds

**Quality Criteria**:
- Resolution (1920x1080 or higher preferred)
- Composition (no text overlays preferred)
- Language neutrality (no language-specific text)

### Banner

**Purpose**: Wide horizontal artwork for TV-style displays
**Dimensions**: Typically 1000x185 (approx 5.4:1 aspect ratio)
**Format**: JPG or PNG
**Player Support**: Kodi, some skins
**File Naming**: `movie-banner.jpg` or `banner.jpg`

**Sources**:
- Fanart.tv: Movie banners

**Quality Criteria**:
- Resolution
- Clear title text
- Aspect ratio

### Clear Logo

**Purpose**: Transparent title logo for overlays
**Dimensions**: Variable (usually ~800x310)
**Format**: PNG with alpha channel
**Player Support**: All players (for overlay effects)
**File Naming**: `movie-clearlogo.png` or `logo.png`

**Sources**:
- Fanart.tv: HD clear logos

**Quality Criteria**:
- Transparency quality
- Resolution
- Logo clarity

### Clear Art

**Purpose**: Transparent character/object artwork for overlays
**Dimensions**: Variable (usually ~1000x562)
**Format**: PNG with alpha channel
**Player Support**: Kodi, advanced skins
**File Naming**: `movie-clearart.png` or `clearart.png`

**Sources**:
- Fanart.tv: HD clear art

**Quality Criteria**:
- Transparency quality
- Character/object focus
- Composition

### Disc Art

**Purpose**: Disc/DVD artwork for media display
**Dimensions**: Variable (square, typically 1000x1000)
**Format**: PNG with alpha channel
**Player Support**: Kodi, Jellyfin
**File Naming**: `movie-disc.png` or `disc.png`

**Sources**:
- Fanart.tv: Disc art

**Quality Criteria**:
- Circular composition
- Transparency
- Movie-specific artwork

### Landscape

**Purpose**: Alternative horizontal artwork (16:9)
**Dimensions**: Typically 1920x1080
**Format**: JPG
**Player Support**: Jellyfin, Plex
**File Naming**: `landscape.jpg`

**Sources**:
- TMDB: Backdrops
- Fanart.tv: Movie thumbs

**Quality Criteria**:
- Resolution
- Composition

### Keyart

**Purpose**: Promotional poster artwork
**Dimensions**: Variable (often 2:3 like poster)
**Format**: JPG
**Player Support**: Limited (mainly for collection)
**File Naming**: `keyart.jpg`

**Sources**:
- TMDB: Posters tagged as keyart

**Quality Criteria**:
- Official promotional art
- High resolution

## TV Shows

TV shows have three levels of assets: show-level, season-level, and episode-level.

### Show-Level Assets

#### Poster

**Purpose**: Primary vertical artwork for series identification
**Dimensions**: 1000x1500 (2:3 aspect ratio)
**Format**: JPG or PNG
**File Naming**: `poster.jpg` in show directory

**Sources**:
- TMDB: Series posters
- TVDB: Series posters
- Fanart.tv: TV posters

#### Fanart

**Purpose**: Background artwork for series
**Dimensions**: 1920x1080 (16:9 aspect ratio)
**Format**: JPG
**File Naming**: `fanart.jpg` in show directory

**Sources**:
- TMDB: Backdrops
- TVDB: Fanart
- Fanart.tv: Show backgrounds

#### Banner

**Purpose**: Wide horizontal series artwork
**Dimensions**: 758x140 or 1000x185
**Format**: JPG or PNG
**File Naming**: `banner.jpg` in show directory

**Sources**:
- TVDB: Series banners
- Fanart.tv: TV banners

#### Clear Logo

**Purpose**: Transparent series title logo
**Dimensions**: Variable (~800x310)
**Format**: PNG with alpha channel
**File Naming**: `logo.png` in show directory

**Sources**:
- Fanart.tv: HD clear logos

#### Clear Art

**Purpose**: Transparent character artwork
**Dimensions**: Variable (~1000x562)
**Format**: PNG with alpha channel
**File Naming**: `clearart.png` in show directory

**Sources**:
- Fanart.tv: HD clear art

#### Character Art

**Purpose**: Individual character images
**Dimensions**: Variable
**Format**: PNG with alpha channel
**File Naming**: `character.png` in show directory

**Sources**:
- Fanart.tv: Character art

### Season-Level Assets

#### Season Poster

**Purpose**: Vertical artwork specific to season
**Dimensions**: 1000x1500 (2:3 aspect ratio)
**Format**: JPG or PNG
**File Naming**: `season01-poster.jpg` or `Season 01/poster.jpg`

**Sources**:
- TMDB: Season posters
- TVDB: Season posters
- Fanart.tv: Season posters

**Quality Criteria**:
- Season number clearly indicated
- Distinct from other seasons
- Consistent style with series

#### Season Fanart

**Purpose**: Background artwork specific to season
**Dimensions**: 1920x1080 (16:9 aspect ratio)
**Format**: JPG
**File Naming**: `season01-fanart.jpg` or `Season 01/fanart.jpg`

**Sources**:
- TMDB: Season backdrops
- TVDB: Season fanart

#### Season Banner

**Purpose**: Wide horizontal season artwork
**Dimensions**: 758x140 or 1000x185
**Format**: JPG or PNG
**File Naming**: `season01-banner.jpg` or `Season 01/banner.jpg`

**Sources**:
- TVDB: Season banners
- Fanart.tv: Season banners

### Episode-Level Assets

#### Episode Thumbnail

**Purpose**: Screenshot or artwork for specific episode
**Dimensions**: 1920x1080 or 1280x720 (16:9 aspect ratio)
**Format**: JPG
**File Naming**: `episode-thumb.jpg` or matching episode filename

**Example**: For `Show - S01E05.mkv`, thumbnail would be `Show - S01E05-thumb.jpg`

**Sources**:
- TMDB: Episode stills
- TVDB: Episode images

**Quality Criteria**:
- Representative scene from episode
- No spoilers (ideally)
- High resolution

## Music

### Artist Assets

#### Artist Poster

**Purpose**: Primary vertical artist image
**Dimensions**: Variable (typically 1000x1500)
**Format**: JPG or PNG
**File Naming**: `artist-poster.jpg` or `poster.jpg`

**Sources**:
- MusicBrainz: Artist images
- Fanart.tv: Artist thumbs

#### Artist Fanart

**Purpose**: Background artwork for artist
**Dimensions**: 1920x1080 (16:9 aspect ratio)
**Format**: JPG
**File Naming**: `artist-fanart.jpg` or `fanart.jpg`

**Sources**:
- Fanart.tv: Artist backgrounds

#### Artist Banner

**Purpose**: Wide horizontal artist artwork
**Dimensions**: 1000x185
**Format**: JPG or PNG
**File Naming**: `artist-banner.jpg` or `banner.jpg`

**Sources**:
- Fanart.tv: Artist banners

#### Artist Logo

**Purpose**: Transparent artist logo
**Dimensions**: Variable (~800x310)
**Format**: PNG with alpha channel
**File Naming**: `artist-logo.png` or `logo.png`

**Sources**:
- Fanart.tv: Artist HD logos

### Album Assets

#### Album Cover

**Purpose**: Primary album artwork
**Dimensions**: Square (typically 1000x1000 or higher)
**Format**: JPG or PNG
**File Naming**: `cover.jpg` or `album.jpg`

**Sources**:
- MusicBrainz: Album art
- Fanart.tv: Album covers

**Quality Criteria**:
- Official release artwork
- High resolution (1000x1000 minimum)
- Square aspect ratio

#### Album Disc

**Purpose**: Disc artwork for album
**Dimensions**: Square (typically 1000x1000)
**Format**: PNG with alpha channel
**File Naming**: `disc.png`

**Sources**:
- Fanart.tv: CD art

## Actors

### Actor Thumb

**Purpose**: Headshot image for actor/actress
**Dimensions**: Variable (typically portrait orientation)
**Format**: JPG
**File Naming**: Content-addressed in cache, linked to person

**Storage Location**:
- Cache: `/data/cache/actors/ab/c1/abc123...jpg`
- Library: `.actors/Actor Name.jpg` in show/movie directory

**Sources**:
- TMDB: Person profile images

**Quality Criteria**:
- Professional headshot
- Clear face visibility
- Neutral background preferred

**Player Support**:
- Kodi: Yes (via .actors directory or NFO)
- Jellyfin: Yes
- Plex: Yes

## Asset Type Constants

For reference, these are the asset types used in database and code:

```typescript
// Image types in cache_image_files.image_type
export const IMAGE_TYPES = [
  'poster',
  'fanart',
  'banner',
  'clearlogo',
  'clearart',
  'discart',
  'landscape',
  'keyart',
  'thumb',
  'actor_thumb',
  'unknown'
] as const;

// Media types for polymorphic associations
export const ENTITY_TYPES = [
  'movie',
  'series',
  'season',
  'episode',
  'actor'
] as const;
```

## Provider Comparison

### TMDB
- **Strengths**: Large collection, good for movies/TV, free API
- **Assets**: Posters, backdrops (fanart), logos (limited), episode stills
- **Quality**: Good, community-sourced
- **Languages**: Excellent multilingual support

### TVDB
- **Strengths**: TV-focused, detailed series metadata
- **Assets**: Posters, fanart, banners, season posters
- **Quality**: Good, community-sourced
- **Languages**: Good multilingual support

### Fanart.tv
- **Strengths**: HD artwork, clear logos/art, disc art
- **Assets**: All types (poster, fanart, banner, logo, clearart, discart, etc.)
- **Quality**: Highest quality, curated
- **Languages**: Limited (primarily English)

### MusicBrainz
- **Strengths**: Comprehensive music database
- **Assets**: Album covers, artist images (via CoverArtArchive)
- **Quality**: Official artwork
- **Languages**: Language-neutral

## Asset Selection Strategy

When multiple providers offer the same asset type:

1. **Quality Score**: Resolution, dimensions, language match
2. **Provider Priority**: Fanart.tv (quality) > TMDB (quantity) > TVDB (TV-specific)
3. **User Preference**: Language, style preferences
4. **Availability**: Fallback to lower-priority provider if preferred unavailable

See [Enrichment Phase](../../phases/ENRICHMENT.md) for scoring algorithm details.

## See Also

- [Asset Management Overview](README.md) - Three-tier architecture
- [Content Addressing](CONTENT_ADDRESSING.md) - File storage structure
- [Enrichment Phase](../../phases/ENRICHMENT.md) - Asset fetching and scoring
- [Publishing Phase](../../phases/PUBLISHING.md) - Asset deployment
