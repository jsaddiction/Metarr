#!/bin/bash

# Script to create test movie files for Metarr testing
# Creates small valid video files with Kodi NFO metadata

set -e

# Configuration
TEST_DIR="${1:-/tmp/metarr-test-movies}"
VIDEO_DURATION=5  # seconds

echo "Creating test movies in: $TEST_DIR"
mkdir -p "$TEST_DIR"

# Function to create a test video file
create_test_video() {
    local movie_name="$1"
    local year="$2"
    local movie_dir="$TEST_DIR/${movie_name} (${year})"
    local video_file="${movie_dir}/${movie_name}.mkv"

    echo "Creating: ${movie_name} (${year})"
    mkdir -p "$movie_dir"

    # Generate a small test video (5 seconds, 320x240, H.264)
    # This creates a valid video file that FFmpeg can parse
    ffmpeg -f lavfi -i testsrc=duration=${VIDEO_DURATION}:size=320x240:rate=30 \
           -f lavfi -i sine=frequency=1000:duration=${VIDEO_DURATION} \
           -c:v libx264 -preset ultrafast -crf 30 \
           -c:a aac -b:a 128k \
           -movflags +faststart \
           -y "$video_file" 2>/dev/null

    echo "  ✓ Created video: $(du -h "$video_file" | cut -f1)"
}

# Function to create a Kodi NFO file
create_nfo() {
    local movie_name="$1"
    local year="$2"
    local tmdb_id="$3"
    local imdb_id="$4"
    local plot="$5"
    local movie_dir="$TEST_DIR/${movie_name} (${year})"
    local nfo_file="${movie_dir}/${movie_name}.nfo"

    cat > "$nfo_file" <<EOF
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<movie>
    <title>${movie_name}</title>
    <originaltitle>${movie_name}</originaltitle>
    <sorttitle>${movie_name}</sorttitle>
    <year>${year}</year>
    <premiered>${year}-01-01</premiered>
    <tmdbid>${tmdb_id}</tmdbid>
    <id>${imdb_id}</id>
    <plot>${plot}</plot>
    <outline>Test movie for Metarr</outline>
    <tagline>A test movie</tagline>
    <runtime>5</runtime>
    <mpaa>PG-13</mpaa>
    <rating>7.5</rating>
    <votes>1000</votes>
    <genre>Action</genre>
    <genre>Adventure</genre>
    <studio>Test Studios</studio>
    <director>Test Director</director>
    <credits>Test Writer</credits>
    <actor>
        <name>Test Actor 1</name>
        <role>Hero</role>
        <order>0</order>
    </actor>
    <actor>
        <name>Test Actor 2</name>
        <role>Villain</role>
        <order>1</order>
    </actor>
</movie>
EOF

    echo "  ✓ Created NFO: ${nfo_file}"
}

# Function to create poster image
create_poster() {
    local movie_name="$1"
    local year="$2"
    local movie_dir="$TEST_DIR/${movie_name} (${year})"
    local poster_file="${movie_dir}/poster.jpg"

    # Create a simple colored poster using ImageMagick (if available)
    if command -v convert &> /dev/null; then
        convert -size 300x450 -background "#$(openssl rand -hex 3)" \
                -gravity center -pointsize 30 -fill white \
                label:"${movie_name}\n(${year})" \
                "$poster_file" 2>/dev/null || true

        if [ -f "$poster_file" ]; then
            echo "  ✓ Created poster: ${poster_file}"
        fi
    fi
}

# Create test movies
echo ""
echo "Generating test movie files..."
echo "================================"

# Movie 1: The Matrix (1999)
create_test_video "The Matrix" "1999"
create_nfo "The Matrix" "1999" "603" "tt0133093" \
    "A computer hacker learns about the true nature of reality and his role in the war against its controllers."
create_poster "The Matrix" "1999"

# Movie 2: Inception (2010)
create_test_video "Inception" "2010"
create_nfo "Inception" "2010" "27205" "tt1375666" \
    "A thief who steals corporate secrets through dream-sharing technology is given the inverse task of planting an idea."
create_poster "Inception" "2010"

# Movie 3: Interstellar (2014)
create_test_video "Interstellar" "2014"
create_nfo "Interstellar" "2014" "157336" "tt0816692" \
    "A team of explorers travel through a wormhole in space in an attempt to ensure humanity's survival."
create_poster "Interstellar" "2014"

# Movie 4: The Dark Knight (2008)
create_test_video "The Dark Knight" "2008"
create_nfo "The Dark Knight" "2008" "155" "tt0468569" \
    "When the menace known as the Joker wreaks havoc on Gotham, Batman must accept one of the greatest tests."
create_poster "The Dark Knight" "2008"

# Movie 5: Pulp Fiction (1994)
create_test_video "Pulp Fiction" "1994"
create_nfo "Pulp Fiction" "1994" "680" "tt0110912" \
    "The lives of two mob hitmen, a boxer, and a pair of diner bandits intertwine in four tales of violence."
create_poster "Pulp Fiction" "1994"

echo ""
echo "================================"
echo "✓ Test movie library created!"
echo ""
echo "Location: $TEST_DIR"
echo "Movies created: 5"
echo ""
echo "Next steps:"
echo "1. Start Metarr: npm run dev:all"
echo "2. Go to Settings → Libraries"
echo "3. Add new library pointing to: $TEST_DIR"
echo "4. Click 'Scan' to import the test movies"
echo ""
