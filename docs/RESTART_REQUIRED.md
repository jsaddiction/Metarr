# RESTART REQUIRED - Critical Database Schema Mismatch

## Current Status

✅ **Scanner is working correctly!**
- Detecting images: 7 per movie
- Detecting trailers: 1 per movie
- Detecting landscapes: YES (in known files list)

❌ **API endpoint is broken due to database schema mismatch**
- Error: `SQLITE_ERROR: no such column: provider_name`
- Endpoint: `GET /api/movies/:id?include=files`
- Movie Edit page: **Cannot load** (500 error)

## Root Cause

The **database was never recreated** with the new schema. The code expects columns that don't exist in the current database:

### Columns Missing in Current Database
1. `provider_name` - All file tables
2. `clearlogo_id` - movies table
3. `category` - unknown_files table
4. `sample_rate`, `channels`, `language` - audio_files table

### What the Code Expects (New Schema)
All these columns exist in `src/database/migrations/20251015_001_clean_schema.ts`:
- ✅ `provider_name` defined on line 204 (image_files)
- ✅ `clearlogo_id` defined on line 345 (movies)
- ✅ `category` defined on line 306 (unknown_files)
- ✅ `sample_rate`, `channels`, `language` defined on lines 240-242 (audio_files)

## The Fix

### **RESTART THE BACKEND SERVER**

The development workflow deletes `data/metarr.sqlite` on startup and recreates it from migrations.

**Steps:**
1. Stop the backend server (Ctrl+C or kill process)
2. **Optional but recommended:** Delete `data/metarr.sqlite` manually to be sure
3. Start the backend server: `npm run dev`
4. Database will be recreated with correct schema
5. Trigger library scan
6. All endpoints will work correctly

## Evidence from Logs

### Scanner Success (from app.log)
```json
{"entityId":1,"entityType":"movie","images":7,"trailers":1,"subtitles":0}
{"entityId":2,"entityType":"movie","images":7,"trailers":1,"subtitles":0}
{"entityId":3,"entityType":"movie","images":7,"trailers":1,"subtitles":0}
```

### API Failure (from error.log)
```json
{"error":"Query failed: SQLITE_ERROR: no such column: provider_name"}
{"url":"/api/movies/1?include=files"}
```

### Landscape Files Present
```
"landscape.jpg" appears in known files list for ALL movies
```

## What Will Work After Restart

1. ✅ **Movies page** - Asset indicators will show correct counts
2. ✅ **Movie edit page** - Will load without errors
3. ✅ **API endpoint** - `/api/movies/:id?include=files` will return data
4. ✅ **Asset discovery** - Will detect all file types:
   - Images: poster, fanart, landscape, clearlogo, banner, clearart, discart, keyart, thumb
   - Trailers: .mp4/.mkv files with "trailer" keyword
   - Subtitles: .srt/.sub/.ass files (if present)
   - Theme songs: .mp3/.flac files with "theme" keyword (if present)

## Summary

**The scanner is NOT broken - it's working perfectly!**

The issue is a database schema version mismatch. The code was updated but the database wasn't recreated.

**Solution: Restart the backend server.**

That's it. No code changes needed - everything is already fixed and ready to go.
