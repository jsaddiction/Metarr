# Movie Edit Page Implementation Summary

## Overview

Successfully implemented the complete movie editing interface with three main tabs: **Metadata**, **Images**, and **Extras**. This includes a robust backend caching system and frontend UI components.

## Backend Implementation

### 1. Image Service (`src/services/imageService.ts`)

Complete image management service implementing the three-tier caching architecture:

**Key Features:**
- **Three-tier storage**: Provider URLs → Cache Directory → Library Directory
- **Perceptual hashing**: Detects duplicate images using pHash algorithm (90% similarity threshold)
- **Smart selection**: Sorts by vote_average and resolution, filters duplicates
- **Field locking**: User-uploaded images are automatically locked
- **Recovery**: Can restore missing library images from cache

**Methods:**
- `getImages()` - Retrieve images for an entity with filtering
- `uploadCustomImage()` - Handle user uploads with auto-locking
- `downloadImageToCache()` - Download from provider to cache
- `calculatePerceptualHash()` - Generate pHash for duplicate detection
- `compareHashes()` - Compare similarity (0.0 = different, 1.0 = identical)
- `selectImages()` - Select best N images from provider candidates
- `setImageLock()` - Lock/unlock images
- `deleteImage()` - Remove image from cache, library, and database
- `recoverMissingImages()` - Restore from cache without provider API calls
- `getImageStream()` - Serve images to frontend

### 2. Image Controller (`src/controllers/imageController.ts`)

REST API endpoints for image operations:

**Endpoints:**
- `GET /api/movies/:id/images` - Get all images for a movie
- `POST /api/movies/:id/images/upload` - Upload custom image (multipart/form-data)
- `PATCH /api/images/:id/lock` - Lock/unlock image
- `DELETE /api/images/:id` - Delete image
- `GET /api/images/:id/file` - Serve image file from cache (with 1-year caching)
- `POST /api/movies/:id/images/recover` - Recover missing images from cache

**Features:**
- Multer integration for file uploads (10MB limit, JPEG/PNG only)
- Automatic error handling
- Image streaming with proper content-type headers
- Long-term caching headers for performance

### 3. API Routes Integration (`src/routes/api.ts`)

Added image routes to existing API router:
- Initialized `ImageService` and `ImageController`
- Registered all image endpoints
- Proper route ordering (specific routes before parameterized)
- Logging for debugging

## Frontend Implementation

### 1. Metadata Tab (`src/components/movie/MetadataTab.tsx`)

Complete metadata editing interface with field-level locking:

**Features:**
- **Field-level locking UI**: Lock/unlock icon on each field
- **Visual lock indicators**: Yellow badge for locked fields
- **Unsaved changes detection**: Shows save/reset banner
- **Organized sections**: Basic Info, Plot, Provider IDs, Related Entities
- **Read-only provider IDs**: TMDB/IMDB IDs are display-only
- **Related entities preview**: Shows genres, directors (full editing in future)

**Fields Supported:**
- Title, Original Title, Sort Title, Year
- MPAA Rating, Premiered Date
- Tagline, Outline, Plot
- Trailer URL, User Rating
- TMDB ID, IMDB ID (read-only)

### 2. Images Tab (`src/components/movie/ImagesTab.tsx`)

Complete image management interface:

**Features:**
- **Image type sections**: Posters, Fanart, Banners, Clear Logos, Clear Art, etc.
- **Upload interface**: File picker with validation
- **Grid layout**: Responsive grid (2-5 columns based on screen size)
- **Lock/unlock images**: Visual indicator and toggle button
- **Delete images**: Confirmation dialog before deletion
- **Image metadata display**: Dimensions, vote average, provider vs custom
- **Hover actions**: Lock/delete buttons appear on hover
- **Recovery feature**: Restore missing images from cache
- **Upload limits**: Enforces max count per image type (20 for posters/fanart, 1 for others)

**Image Types:**
- Posters (max 20)
- Fanart/Backdrops (max 20)
- Banners (max 1)
- Clear Logos (max 1)
- Clear Art (max 1)
- Landscapes (max 1)
- Key Art (max 1)
- Disc Art (max 1)

### 3. Extras Tab (`src/components/movie/ExtrasTab.tsx`)

Extras management interface:

**Features:**
- **Trailer section**: Display, delete trailer
- **Subtitles section**: List all subtitles with language/format info
- **Theme song section**: Display, delete theme song
- **File metadata**: Size, duration, format, resolution
- **Empty states**: Helpful messages for missing extras
- **Detection info**: Explains Kodi naming conventions

**Supported Extras:**
- Trailers (files ending with "-trailer")
- Subtitles (.srt, .ass, .sub)
- Theme songs (theme.mp3 or similar)

### 4. Movie Edit Page Integration (`src/pages/metadata/MovieEdit.tsx`)

Updated main edit page to use new tab components:

**Changes:**
- Imported `MetadataTab`, `ImagesTab`, `ExtrasTab`
- Replaced placeholder content with actual components
- Pass `movieId` prop to each tab
- Maintained existing Unknown Files tab

## Dependencies Installed

```json
{
  "sharp": "^0.34.4",          // Image processing (resize, metadata, format conversion)
  "multer": "^2.0.2",          // File upload middleware
  "axios": "^1.12.2",          // HTTP client for downloading images
  "fs-extra": "^11.3.2",       // Enhanced file system operations
  "@types/multer": "^2.0.0",   // TypeScript types
  "@types/fs-extra": "^11.0.4" // TypeScript types
}
```

## Database Schema

Uses existing `images` table from migrations:

```sql
CREATE TABLE images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  image_type TEXT NOT NULL,
  url TEXT,
  file_path TEXT,
  cache_path TEXT,
  width INTEGER,
  height INTEGER,
  vote_average REAL,
  locked BOOLEAN DEFAULT 0,
  perceptual_hash TEXT,
  deleted_on TIMESTAMP,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

## File Structure

```
src/
├── services/
│   └── imageService.ts          # Image caching, processing, and management
├── controllers/
│   └── imageController.ts       # REST API endpoints
├── routes/
│   └── api.ts                   # Updated with image routes

public/frontend/src/
├── components/
│   └── movie/
│       ├── MetadataTab.tsx      # Metadata editing UI
│       ├── ImagesTab.tsx        # Image management UI
│       └── ExtrasTab.tsx        # Extras management UI
└── pages/
    └── metadata/
        └── MovieEdit.tsx        # Main edit page (updated)
```

## Key Design Decisions

### 1. Three-Tier Caching Architecture

**Rationale:** Follows the IMAGE_MANAGEMENT.md documentation exactly:
- **Provider URLs** (Tier 1): Source of truth, enables re-download
- **Cache Directory** (Tier 2): Persistent backup, survives media manager cleanup
- **Library Directory** (Tier 3): Kodi-readable location, may be deleted externally

### 2. Perceptual Hashing

**Implementation:**
- Resize to 8×8 grayscale
- Calculate average pixel value
- Generate binary hash (1 if pixel > avg, 0 otherwise)
- Convert to hexadecimal for storage
- Compare using Hamming distance

**Threshold:** 90% similarity = duplicate (configurable)

### 3. Field Locking UI Pattern

**Design:**
- Lock/unlock button next to each field label
- Visual indicator (yellow badge) for locked fields
- Locked fields auto-set on manual user edits
- Automated processes respect locked fields

### 4. Image Upload Flow

1. User selects file via file picker
2. Client validates file type (JPEG/PNG only)
3. Upload to `/api/movies/:id/images/upload` with imageType
4. Server: Save to temp → Calculate pHash → Move to cache → Insert DB with locked=1
5. Return image with cache_url for immediate display
6. Frontend refreshes image list

### 5. Image Recovery

**Scenario:** Media manager (Radarr/Sonarr) deletes library images
**Solution:** Copy from cache without provider API calls
**Benefits:** No bandwidth usage, respects rate limits, instant recovery

## Testing Checklist

### Backend
- [x] ImageService compiles without errors
- [x] ImageController compiles without errors
- [x] API routes registered correctly
- [x] Dependencies installed successfully
- [ ] Image upload endpoint tested
- [ ] Image lock/unlock tested
- [ ] Image delete tested
- [ ] Image recovery tested
- [ ] Perceptual hash calculation tested

### Frontend
- [ ] Metadata tab renders correctly
- [ ] Field locking works
- [ ] Save/reset functionality
- [ ] Images tab renders correctly
- [ ] Image upload works
- [ ] Lock/unlock images works
- [ ] Delete images works
- [ ] Image grid responsive
- [ ] Extras tab renders correctly
- [ ] Tab navigation works

## Future Enhancements

### Metadata Tab
- [ ] Related entities editing (genres, actors, directors)
- [ ] Bulk field operations
- [ ] Undo/redo history
- [ ] Field validation

### Images Tab
- [ ] Drag-and-drop reordering
- [ ] Batch upload
- [ ] Image cropping/editing
- [ ] Provider image browser
- [ ] Automatic image downloads from TMDB/TVDB

### Extras Tab
- [ ] Trailer upload
- [ ] Subtitle upload with language selection
- [ ] Theme song upload
- [ ] Preview/playback functionality

## API Documentation

### Image Endpoints

#### Get Movie Images
```http
GET /api/movies/:id/images?type=poster
```

**Query Parameters:**
- `type` (optional): Filter by image type

**Response:**
```json
{
  "success": true,
  "images": [
    {
      "id": 1,
      "entity_type": "movie",
      "entity_id": 123,
      "image_type": "poster",
      "url": "https://image.tmdb.org/t/p/original/...",
      "cache_path": "/data/cache/images/123/poster_abc123.jpg",
      "file_path": "/movies/The Matrix (1999)/poster.jpg",
      "width": 2000,
      "height": 3000,
      "vote_average": 8.5,
      "locked": false,
      "cache_url": "/api/images/1/file"
    }
  ]
}
```

#### Upload Custom Image
```http
POST /api/movies/:id/images/upload
Content-Type: multipart/form-data

image: <file>
imageType: poster
```

**Response:**
```json
{
  "success": true,
  "message": "Image uploaded successfully",
  "image": { ... }
}
```

#### Lock/Unlock Image
```http
PATCH /api/images/:id/lock
Content-Type: application/json

{
  "locked": true
}
```

#### Delete Image
```http
DELETE /api/images/:id
```

#### Serve Image File
```http
GET /api/images/:id/file
```

**Response:** Image file stream with cache headers

#### Recover Missing Images
```http
POST /api/movies/:id/images/recover
```

**Response:**
```json
{
  "success": true,
  "message": "Recovered 3 image(s) from cache",
  "recoveredCount": 3
}
```

## Known Issues

1. **Extras Tab**: Backend endpoints not yet implemented (placeholder UI only)
2. **Metadata Tab**: Related entities editing not yet implemented
3. **Type Error**: Unused variable in `hashPerformanceTest.ts` (non-critical test file)

## Next Steps

1. Implement extras endpoints (trailer, subtitles, theme song)
2. Add metadata update endpoint with field locking
3. Test image upload flow end-to-end
4. Add provider image selection UI
5. Implement automatic image downloads from TMDB
6. Add image quality presets (poster sizes, fanart sizes)
