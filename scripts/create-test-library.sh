#!/bin/bash

# Create test library structure for Metarr development
# This creates a sample Kodi-structured movie library for testing

BASE_DIR="data/test-library/movies"
mkdir -p "$BASE_DIR"

echo "Creating test movie library..."

# Movie 1: The Matrix (1999) - Complete metadata
mkdir -p "$BASE_DIR/The Matrix (1999)"

cat > "$BASE_DIR/The Matrix (1999)/The Matrix (1999).nfo" << 'NFOEOF'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<movie>
  <title>The Matrix</title>
  <originaltitle>The Matrix</originaltitle>
  <year>1999</year>
  <plot>A computer hacker learns from mysterious rebels about the true nature of his reality and his role in the war against its controllers.</plot>
  <runtime>136</runtime>
  <tmdbid>603</tmdbid>
  <imdbid>tt0133093</imdbid>
  <genre>Action</genre>
  <genre>Science Fiction</genre>
  <studio>Warner Bros. Pictures</studio>
  <director>Lana Wachowski</director>
  <director>Lilly Wachowski</director>
  <actor>
    <name>Keanu Reeves</name>
    <role>Neo</role>
  </actor>
  <actor>
    <name>Laurence Fishburne</name>
    <role>Morpheus</role>
  </actor>
</movie>
NFOEOF

touch "$BASE_DIR/The Matrix (1999)/The Matrix (1999).mkv"

# Movie 2: Inception (2010) - Minimal metadata
mkdir -p "$BASE_DIR/Inception (2010)"

cat > "$BASE_DIR/Inception (2010)/Inception (2010).nfo" << 'NFOEOF'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<movie>
  <title>Inception</title>
  <year>2010</year>
  <tmdbid>27205</tmdbid>
  <imdbid>tt1375666</imdbid>
</movie>
NFOEOF

touch "$BASE_DIR/Inception (2010)/Inception (2010).mkv"

# Movie 3: Interstellar (2014) - No NFO (unidentified)
mkdir -p "$BASE_DIR/Interstellar (2014)"
touch "$BASE_DIR/Interstellar (2014)/Interstellar (2014).mkv"

# Movie 4: The Dark Knight (2008) - With assets
mkdir -p "$BASE_DIR/The Dark Knight (2008)"

cat > "$BASE_DIR/The Dark Knight (2008)/The Dark Knight (2008).nfo" << 'NFOEOF'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<movie>
  <title>The Dark Knight</title>
  <year>2008</year>
  <tmdbid>155</tmdbid>
  <imdbid>tt0468569</imdbid>
  <genre>Drama</genre>
  <genre>Action</genre>
  <studio>Warner Bros. Pictures</studio>
  <director>Christopher Nolan</director>
</movie>
NFOEOF

touch "$BASE_DIR/The Dark Knight (2008)/The Dark Knight (2008).mkv"
touch "$BASE_DIR/The Dark Knight (2008)/The Dark Knight (2008)-poster.jpg"
touch "$BASE_DIR/The Dark Knight (2008)-fanart.jpg"

# Movie 5: Blade Runner 2049 (2017)
mkdir -p "$BASE_DIR/Blade Runner 2049 (2017)"

cat > "$BASE_DIR/Blade Runner 2049 (2017)/Blade Runner 2049 (2017).nfo" << 'NFOEOF'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<movie>
  <title>Blade Runner 2049</title>
  <year>2017</year>
  <tmdbid>335984</tmdbid>
  <imdbid>tt1856101</imdbid>
</movie>
NFOEOF

touch "$BASE_DIR/Blade Runner 2049 (2017)/Blade Runner 2049 (2017).mkv"

echo ""
echo "✓ Test library created successfully!"
echo ""
echo "Location: $(pwd)/data/test-library/movies"
echo ""
echo "Movies created:"
echo "  1. The Matrix (1999) - Complete metadata with actors"
echo "  2. Inception (2010) - Minimal metadata (identified only)"
echo "  3. Interstellar (2014) - No NFO (unidentified)"
echo "  4. The Dark Knight (2008) - With poster/fanart assets"
echo "  5. Blade Runner 2049 (2017) - Basic metadata"
echo ""
echo "Add this library in Metarr:"
echo "  1. Navigate to Settings → Libraries"
echo "  2. Click 'Add Library'"
echo "  3. Configure:"
echo "     Name: Test Movies"
echo "     Type: movie"
echo "     Path: $(pwd)/data/test-library/movies"
echo "  4. Save and Scan"
echo ""
echo "Expected results after scan:"
echo "  - Total: 5 movies"
echo "  - Unidentified: 1 (Interstellar)"
echo "  - Identified: 3 (Inception, Dark Knight, Blade Runner)"
echo "  - Enriched: 1 (The Matrix)"
