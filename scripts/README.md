# Development Scripts

Utility scripts for Metarr development.

## create-test-library.sh

Creates a sample Kodi-structured movie library for testing and development.

### Usage

```bash
./scripts/create-test-library.sh
```

This creates `data/test-library/movies/` with 5 sample movies:

1. **The Matrix (1999)** - Complete metadata with actors
2. **Inception (2010)** - Minimal metadata (identified only)
3. **Interstellar (2014)** - No NFO (unidentified)
4. **The Dark Knight (2008)** - With poster/fanart assets
5. **Blade Runner 2049 (2017)** - Basic metadata

### Adding to Metarr

1. Start Metarr: `npm run dev:all`
2. Navigate to **Settings → Libraries**
3. Click **Add Library**
4. Configure:
   - **Name**: Test Movies
   - **Type**: movie
   - **Path**: `/home/justin/Code/Metarr/data/test-library/movies` (adjust for your system)
5. Click **Save**
6. Click **Scan** to import the movies

### Expected Results

After scanning, the Dashboard should show:
- **Total**: 5 movies
- **Unidentified**: 1
- **Identified**: 3
- **Enriched**: 1

The Movies page should display all 5 movies with their respective identification_status states (red/yellow/green badges).

### Cleaning Up

To recreate the library:

```bash
rm -rf data/test-library
./scripts/create-test-library.sh
```

**Note**: The `data/` directory is in `.gitignore` and will not be committed to the repository.
