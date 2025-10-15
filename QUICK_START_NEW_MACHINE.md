# Quick Start Guide - New Machine Setup

**Last Updated**: 2025-10-15
**Branch**: `master`
**Commit**: `f6b5907` - "feat: complete clean schema migration with flexible asset discovery"

---

## Prerequisites

- Node.js (v18+ recommended)
- Git
- SQLite3 (for development) or PostgreSQL (for production)

---

## Setup Steps

### 1. Clone Repository

```bash
git clone https://github.com/jsaddiction/Metarr.git
cd Metarr
git checkout master
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Clean Slate (Important!)

**Delete old database** to force clean schema migration:

```bash
# Windows PowerShell
Remove-Item data\metarr.sqlite -Force -ErrorAction SilentlyContinue

# Linux/Mac
rm -f data/metarr.sqlite
```

### 4. Build Backend

```bash
npm run build
```

### 5. Start Development Servers

**Option A: Both servers** (recommended)
```bash
npm run dev:all
```

**Option B: Separate terminals**
```bash
# Terminal 1: Backend
npm run dev

# Terminal 2: Frontend
npm run dev:frontend
```

### 6. Access Application

- **Frontend**: http://localhost:3001
- **Backend API**: http://localhost:3000
- **WebSocket**: ws://localhost:3000/ws

---

## Verify Setup

### 1. Check Backend Logs

```bash
# Windows PowerShell
Get-Content logs/app.log -Tail 50

# Linux/Mac
tail -f logs/app.log
```

**Look for**:
- ✅ "Database migrations completed"
- ✅ "Metarr server started on 0.0.0.0:3000"
- ❌ NO errors about missing tables/columns

### 2. Test Library Scan

1. Open http://localhost:3001
2. Go to **Settings → Libraries**
3. Click **Add Library**
4. Browse to a directory with movie files (use test-library if available)
5. Click **Scan**

**Expected Results**:
- Scan completes without errors
- Movies appear in Movies list
- Assets discovered (5 per movie: fanart, banner, logo, clearart, discart)
- Unknown files listed (~10-20 per movie depending on extras)

### 3. Check Database

```bash
sqlite3 data/metarr.sqlite
```

```sql
-- Verify tables exist
.tables
-- Should include: cache_assets, ignore_patterns, unknown_files, movies, etc.

-- Check discovered assets
SELECT COUNT(*) FROM cache_assets;
-- Should have assets (5 per movie scanned)

-- Check unknown files
SELECT COUNT(*) FROM unknown_files;
-- Should have unknown files (~10-20 per movie)

-- Exit
.exit
```

---

## Current System Status

### ✅ Working

- **Library Scanning**: Zero-error scans, all movies discovered
- **Asset Discovery**: 5 asset types validated and stored per movie
- **Unknown Files Detection**: Correctly identifying non-standard extras
- **Database Schema**: Clean schema (20251015_001) fully migrated
- **Stream Extraction**: Video/audio/subtitle metadata with HDR detection
- **NFO Parsing**: Kodi NFO format supported

### ⚠️ Known Issues

1. **Poster/Keyart Not Discovered**
   - Symptom: Files exist but not discovered/stored
   - Impact: Medium - Recognized as "known files" but not in DB
   - Investigation: Aspect ratio validation may be too strict (2:3 ±10%)

2. **Images/Extras Endpoints Disabled**
   - Status: Return empty arrays
   - Impact: UI tabs load but show no data
   - Next Step: Rewrite to query cache_assets via FK columns

3. **Library Scheduler Errors**
   - Error: `library_scheduler_config` table missing
   - Impact: Low - Periodic checks fail, manual scanning works
   - Fix: Add table to migration or disable checks

### 📋 Next Steps

**High Priority**:
1. Investigate poster discovery (check dimensions, adjust tolerance)
2. Implement Images endpoint (query cache_assets)
3. Implement Extras endpoint (trailers, subtitles)

**Medium Priority**:
1. Add library_scheduler_config table
2. Implement trailer discovery
3. Write unit tests for asset discovery

---

## Troubleshooting

### Build Fails

```bash
# Clean build
rm -rf dist node_modules
npm install
npm run build
```

### Database Errors

```bash
# Force clean migration
rm data/metarr.sqlite
npm run build
npm start
# Database will be recreated with clean schema
```

### Port Already in Use

```bash
# Windows PowerShell
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess | Stop-Process -Force

# Linux/Mac
lsof -ti:3000 | xargs kill -9
```

### Frontend Not Loading

```bash
# Rebuild frontend
cd public/frontend
npm install
npm run build
cd ../..
```

---

## Important Files

### Documentation
- `docs/ASSET_DISCOVERY_STATUS.md` - Asset system details
- `docs/SESSION_2025-10-15_CLEAN_SCHEMA_COMPLETION.md` - Session summary
- `docs/ARCHITECTURE.md` - Overall architecture
- `docs/DATABASE_SCHEMA.md` - Schema reference

### Core Implementation
- `src/services/media/assetDiscovery_flexible.ts` - Asset discovery logic
- `src/services/media/assetTypeSpecs.ts` - Kodi specifications
- `src/services/media/unknownFilesDetection.ts` - Unknown files detection
- `src/database/migrations/20251015_001_clean_schema.ts` - Clean schema

### Configuration
- `src/config/ConfigManager.ts` - Environment config
- `.env` - Environment variables (create if missing)

---

## Development Workflow

### 1. Make Changes

Edit TypeScript files in `src/` or React files in `public/frontend/src/`

### 2. Build

```bash
npm run build              # Backend only
npm run build:frontend     # Frontend only
```

### 3. Test

```bash
npm run typecheck          # Type checking
npm run lint               # Linting
npm test                   # Run tests (when implemented)
```

### 4. Commit

```bash
git add .
git commit -m "feat: description of changes

🤖 Generated with Claude Code

Co-Authored-By: Claude <noreply@anthropic.com>"
```

### 5. Push

```bash
git push origin master
```

---

## Quick Commands

```bash
# Development
npm run dev:all            # Both servers
npm run dev                # Backend only
npm run dev:frontend       # Frontend only

# Building
npm run build              # Backend
npm run build:frontend     # Frontend

# Code Quality
npm run lint               # Check linting
npm run lint:fix           # Fix linting issues
npm run format             # Format with Prettier
npm run typecheck          # Type check without building

# Logs
Get-Content logs/app.log -Tail 50 -Wait     # Windows
tail -f logs/app.log                        # Linux/Mac

# Clean logs before restart (recommended)
Remove-Item logs\*.* -Force                 # Windows
rm -f logs/*                                # Linux/Mac
```

---

## Contact & Support

- **Repository**: https://github.com/jsaddiction/Metarr
- **Issues**: https://github.com/jsaddiction/Metarr/issues
- **Documentation**: See `docs/` directory

---

**Ready to develop!** 🚀

All changes are committed and pushed. The system is in a clean, working state with comprehensive documentation for continuation on a new machine.
