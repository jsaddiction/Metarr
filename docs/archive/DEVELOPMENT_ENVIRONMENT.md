# Development Environment Setup

This guide describes the distributed LAN development environment setup for Metarr development and testing.

---

## Development Architecture

```
┌─────────────────────┐
│ Development Machine │
│ (Windows + VSCode)  │
│ - Metarr source     │
│ - Frontend dev      │
│ - Backend dev       │
└──────────┬──────────┘
           │ LAN
           │
┌──────────▼──────────┐       ┌──────────────────┐
│   Docker Host       │       │   Kodi Machine   │
│ (Remote Server)     │◄──────│ (Test Player)    │
│ - PostgreSQL        │  LAN  │ - Kodi instance  │
│ - Redis             │       │ - Test library   │
│ - Radarr            │       └──────────────────┘
│ - Sonarr            │
│ - Test media files  │
└─────────────────────┘
```

---

## Local Development Setup (Windows Machine)

### Prerequisites

```bash
# Node.js 20+ and npm
node --version
npm --version

# Git
git --version
```

### Initial Setup

```bash
# Clone repository
git clone https://github.com/yourusername/metarr.git
cd metarr

# Install dependencies
npm install

# Create local environment file
copy .env.example .env.development
```

### Environment Configuration

```env
# .env.development - Points to LAN services
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug

# Database on Docker host
DB_TYPE=postgres
DB_HOST=192.168.1.100    # Docker host IP
DB_PORT=5432
DB_NAME=metarr
DB_USER=metarr
DB_PASSWORD=devpassword

# Redis on Docker host
REDIS_URL=redis://192.168.1.100:6379

# Real Radarr/Sonarr on Docker host
RADARR_URL=http://192.168.1.100:7878
RADARR_API_KEY=your_actual_api_key
SONARR_URL=http://192.168.1.100:8989
SONARR_API_KEY=your_actual_api_key

# Kodi on separate machine
KODI_HOST=192.168.1.101    # Kodi machine IP
KODI_PORT=8080
KODI_WS_PORT=9777
KODI_USERNAME=
KODI_PASSWORD=

# Path mapping for network shares
DOCKER_HOST_MEDIA_PATH=/media
LOCAL_MEDIA_PATH=\\192.168.1.100\media
```

### Development Commands

```bash
# Start backend with hot-reload (watches Docker host DB)
npm run dev:backend

# Start frontend with HMR
npm run dev:frontend

# Or both together
npm run dev:all

# Run database migrations against remote PostgreSQL
npm run migrate:dev

# Monitor job queue on remote Redis
npm run monitor:jobs
```

---

## Docker Host Setup (Remote LAN Server)

### Docker Compose for Services

```yaml
# docker-compose.yml on Docker host
version: '3.8'

services:
  # PostgreSQL for Metarr
  postgres:
    image: postgres:16-alpine
    container_name: metarr-postgres
    environment:
      - POSTGRES_DB=metarr
      - POSTGRES_USER=metarr
      - POSTGRES_PASSWORD=devpassword
    ports:
      - "5432:5432"  # Exposed to LAN
    volumes:
      - postgres-data:/var/lib/postgresql/data

  # Redis for Job Queue
  redis:
    image: redis:7-alpine
    container_name: metarr-redis
    ports:
      - "6379:6379"  # Exposed to LAN
    volumes:
      - redis-data:/data

  # Radarr (Real instance for testing)
  radarr:
    image: linuxserver/radarr
    container_name: radarr
    environment:
      - PUID=1000
      - PGID=1000
    volumes:
      - ./config/radarr:/config
      - /media/movies:/movies
    ports:
      - "7878:7878"

  # Sonarr (Real instance for testing)
  sonarr:
    image: linuxserver/sonarr
    container_name: sonarr
    environment:
      - PUID=1000
      - PGID=1000
    volumes:
      - ./config/sonarr:/config
      - /media/tv:/tv
    ports:
      - "8989:8989"

volumes:
  postgres-data:
  redis-data:
```

### Media Library Structure

```bash
# On Docker host
/media/
├── movies/
│   ├── The Matrix (1999)/
│   │   ├── The Matrix (1999).mkv
│   │   └── The Matrix (1999).en.srt
│   └── Inception (2010)/
│       └── Inception (2010).mkv
└── tv/
    └── Breaking Bad/
        └── Season 01/
            └── S01E01.mkv
```

---

## Kodi Machine Setup (Separate LAN Machine)

### Kodi Configuration

1. **Enable Web Interface**
   - Settings → Services → Control
   - Allow remote control via HTTP: ON
   - Port: 8080
   - Username/Password: (optional)

2. **Enable JSON-RPC**
   - Settings → Services → Control
   - Allow remote control from applications: ON

3. **Configure Media Sources**
   - Add network share: `smb://192.168.1.100/media/movies`
   - Add network share: `smb://192.168.1.100/media/tv`

4. **Test Connection from Dev Machine**
   ```bash
   # Test Kodi JSON-RPC
   curl -X POST http://192.168.1.101:8080/jsonrpc \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","method":"JSONRPC.Version","id":1}'
   ```

---

## Network Path Mapping

### Configure Path Translation

Since media files are accessed differently from each machine:

```javascript
// src/config/pathMapping.js
const PATH_MAPPINGS = {
  // Docker host sees files at /media/
  // Metarr development sees them at \\192.168.1.100\media\
  // Kodi sees them at smb://192.168.1.100/media/

  development: {
    dockerToLocal: (path) => {
      return path.replace('/media/', '\\\\192.168.1.100\\media\\');
    },
    localToDocker: (path) => {
      return path.replace('\\\\192.168.1.100\\media\\', '/media/');
    },
    dockerToKodi: (path) => {
      return path.replace('/media/', 'smb://192.168.1.100/media/');
    }
  }
};
```

---

## VSCode Remote Development (Future)

For direct development on the Docker host:

### Option 1: SSH Remote Development
```json
// .vscode/settings.json
{
  "remote.SSH.remotePlatform": {
    "192.168.1.100": "linux"
  }
}
```

### Option 2: Docker Context
```bash
# Set up Docker context for remote host
docker context create remote --docker "host=ssh://user@192.168.1.100"
docker context use remote

# Now Docker commands run on remote host
docker ps  # Shows containers on 192.168.1.100
```

### Option 3: Mount Remote Code
```bash
# Use SSHFS or SMB to mount remote code locally
net use Z: \\192.168.1.100\metarr
cd Z:\
code .
```

---

## Test Data Setup

### 1. Create Test Media Library

```bash
#!/bin/bash
# dev/scripts/setup-test-library.sh

# Create directory structure
mkdir -p test-library/{movies,tv,incoming}

# Create test movie directories
mkdir -p "test-library/movies/The Matrix (1999)"
mkdir -p "test-library/movies/Inception (2010)"
mkdir -p "test-library/movies/Interstellar (2014)"
mkdir -p "test-library/movies/The Dark Knight (2008)"

# Generate test video files with embedded metadata
ffmpeg -f lavfi -i testsrc=duration=10:size=1920x1080:rate=30 \
  -f lavfi -i sine=frequency=1000:duration=10 \
  -c:v libx264 -c:a aac \
  -metadata title="The Matrix" \
  -metadata year="1999" \
  "test-library/movies/The Matrix (1999)/The Matrix (1999).mkv"

# Add embedded subtitles to test file
ffmpeg -i "test-library/movies/The Matrix (1999)/The Matrix (1999).mkv" \
  -i dev/samples/sample.en.srt \
  -c copy -c:s mov_text \
  -metadata:s:s:0 language=eng \
  -metadata:s:s:0 title="English" \
  "test-library/movies/The Matrix (1999)/The Matrix (1999)_with_subs.mkv"

# Create sample NFO file
cat > "test-library/movies/The Matrix (1999)/movie.nfo" << 'EOF'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<movie>
    <title>The Matrix</title>
    <originaltitle>The Matrix</originaltitle>
    <year>1999</year>
    <plot>A computer hacker learns about the true nature of reality.</plot>
    <rating>8.7</rating>
    <mpaa>R</mpaa>
    <imdbid>tt0133093</imdbid>
    <tmdbid>603</tmdbid>
    <genre>Science Fiction</genre>
    <genre>Action</genre>
    <actor>
        <name>Keanu Reeves</name>
        <role>Neo</role>
        <thumb>https://image.tmdb.org/t/p/original/keanu.jpg</thumb>
    </actor>
</movie>
EOF

# Create external subtitle file
echo "1
00:00:01,000 --> 00:00:04,000
Welcome to the Matrix

2
00:00:05,000 --> 00:00:08,000
Follow the white rabbit" > "test-library/movies/The Matrix (1999)/The Matrix (1999).en.srt"
```

### 2. Database Seeder

```typescript
// dev/scripts/seed-dev-database.ts
import { DatabaseManager } from '../../src/database/DatabaseManager';

async function seedDatabase() {
    const db = new DatabaseManager({
        type: 'postgres',
        host: 'localhost',
        port: 5432,
        database: 'metarr',
        user: 'metarr',
        password: 'devpassword'
    });

    await db.connect();

    // Create test library
    const libraryId = await db.execute(`
        INSERT INTO libraries (name, path, type, scan_interval)
        VALUES ('Test Movies', '/media/movies', 'movie', 3600)
        RETURNING id
    `);

    // Add test movies
    const movies = [
        {
            title: 'The Matrix',
            year: 1999,
            tmdb_id: '603',
            imdb_id: 'tt0133093',
            path: '/media/movies/The Matrix (1999)/The Matrix (1999).mkv',
            monitored: true
        },
        {
            title: 'Inception',
            year: 2010,
            tmdb_id: '27205',
            imdb_id: 'tt1375666',
            path: '/media/movies/Inception (2010)/Inception (2010).mkv',
            monitored: true
        },
        {
            title: 'Interstellar',
            year: 2014,
            tmdb_id: '157336',
            imdb_id: 'tt0816692',
            path: '/media/movies/Interstellar (2014)/Interstellar (2014).mkv',
            monitored: false  // Test unmonitored
        }
    ];

    for (const movie of movies) {
        await db.execute(`
            INSERT INTO movies (
                library_id, title, year, tmdb_id, imdb_id,
                file_path, monitored, identification_status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'identified')
        `, [libraryId, movie.title, movie.year, movie.tmdb_id,
            movie.imdb_id, movie.path, movie.monitored]);
    }

    // Add test Kodi player
    await db.execute(`
        INSERT INTO media_players (name, type, config, enabled)
        VALUES ('Test Kodi', 'kodi', ?, true)
    `, [JSON.stringify({
        host: 'localhost',
        port: 8080,
        username: '',
        password: '',
        websocket_port: 9777
    })]);

    console.log('✅ Development database seeded');
    await db.disconnect();
}

seedDatabase().catch(console.error);
```

---

## Mock Service Configurations

### dev/mocks/radarr.json

```json
[
  {
    "httpRequest": {
      "method": "GET",
      "path": "/api/v3/system/status"
    },
    "httpResponse": {
      "statusCode": 200,
      "body": {
        "version": "4.0.0.0",
        "buildTime": "2024-01-01T00:00:00Z",
        "isDebug": false,
        "isProduction": true,
        "isAdmin": true,
        "isUserInteractive": false,
        "startupPath": "/app",
        "appData": "/config",
        "osName": "Linux",
        "urlBase": ""
      }
    }
  },
  {
    "httpRequest": {
      "method": "GET",
      "path": "/api/v3/movie"
    },
    "httpResponse": {
      "statusCode": 200,
      "body": [
        {
          "id": 1,
          "title": "The Matrix",
          "year": 1999,
          "tmdbId": 603,
          "imdbId": "tt0133093",
          "path": "/movies/The Matrix (1999)",
          "hasFile": true,
          "monitored": true
        }
      ]
    }
  }
]
```

### dev/mocks/webhook-payloads.json

```json
{
  "download": {
    "eventType": "Download",
    "movie": {
      "id": 1,
      "title": "The Dark Knight",
      "year": 2008,
      "folderPath": "/movies/The Dark Knight (2008)",
      "tmdbId": 155,
      "imdbId": "tt0468569"
    },
    "movieFile": {
      "relativePath": "The Dark Knight (2008).mkv",
      "path": "/movies/The Dark Knight (2008)/The Dark Knight (2008).mkv",
      "quality": "Bluray-1080p",
      "size": 15000000000
    }
  },
  "upgrade": {
    "eventType": "Upgrade",
    "movie": {
      "id": 1,
      "title": "The Matrix",
      "year": 1999,
      "folderPath": "/movies/The Matrix (1999)",
      "tmdbId": 603
    },
    "movieFile": {
      "relativePath": "The Matrix (1999).mkv",
      "path": "/movies/The Matrix (1999)/The Matrix (1999).mkv",
      "quality": "Bluray-2160p",
      "size": 25000000000
    },
    "deletedFiles": [
      {
        "path": "/movies/The Matrix (1999)/The Matrix (1999).720p.mkv",
        "quality": "Bluray-720p"
      }
    ]
  }
}
```

---

## Testing Utilities

### 1. Webhook Tester

```bash
#!/bin/bash
# dev/scripts/send-webhook.sh

WEBHOOK_TYPE=${1:-download}
MOVIE_TITLE=${2:-"Test Movie"}
METARR_URL=${3:-http://localhost:3000}

# Load webhook payload
PAYLOAD=$(cat dev/mocks/webhook-payloads.json | jq ".${WEBHOOK_TYPE}")

# Send webhook
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-Radarr-Event: ${WEBHOOK_TYPE}" \
  -d "${PAYLOAD}" \
  "${METARR_URL}/api/webhooks/radarr"

echo "✅ Sent ${WEBHOOK_TYPE} webhook for ${MOVIE_TITLE}"
```

### 2. Subtitle Injector

```bash
#!/bin/bash
# dev/scripts/inject-subtitles.sh

INPUT_FILE=$1
OUTPUT_FILE=${2:-"${INPUT_FILE%.mkv}_with_subs.mkv"}

# Create test subtitle file
cat > /tmp/test.srt << 'EOF'
1
00:00:00,000 --> 00:00:05,000
This is a test subtitle

2
00:00:05,000 --> 00:00:10,000
For development testing
EOF

# Inject into video file
ffmpeg -i "$INPUT_FILE" \
  -i /tmp/test.srt \
  -c copy -c:s mov_text \
  -metadata:s:s:0 language=eng \
  -metadata:s:s:0 title="English (Test)" \
  "$OUTPUT_FILE"

echo "✅ Created ${OUTPUT_FILE} with embedded subtitles"
```

### 3. Job Queue Monitor

```typescript
// dev/scripts/monitor-jobs.ts
import { createClient } from 'redis';

async function monitorJobs() {
    const redis = createClient({ url: 'redis://localhost:6379' });
    await redis.connect();

    console.log('📊 Job Queue Monitor');
    console.log('===================\n');

    setInterval(async () => {
        // Get queue stats
        const pending = await redis.lLen('bull:metarr:wait');
        const active = await redis.lLen('bull:metarr:active');
        const completed = await redis.lLen('bull:metarr:completed');
        const failed = await redis.lLen('bull:metarr:failed');

        console.clear();
        console.log('📊 Job Queue Monitor');
        console.log('===================');
        console.log(`⏳ Pending:   ${pending}`);
        console.log(`🔄 Active:    ${active}`);
        console.log(`✅ Completed: ${completed}`);
        console.log(`❌ Failed:    ${failed}`);
        console.log('\nPress Ctrl+C to exit');
    }, 1000);
}

monitorJobs().catch(console.error);
```

---

## Environment Variables

### .env.development

```env
# Application
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug

# Database
DB_TYPE=postgres
DB_HOST=localhost
DB_PORT=5432
DB_NAME=metarr
DB_USER=metarr
DB_PASSWORD=devpassword

# Redis
REDIS_URL=redis://localhost:6379

# Mock Services
RADARR_URL=http://localhost:7878
RADARR_API_KEY=mock-api-key
SONARR_URL=http://localhost:8989
SONARR_API_KEY=mock-api-key

# Test Kodi
KODI_HOST=localhost
KODI_PORT=8080
KODI_WS_PORT=9777

# Provider API Keys (optional - embedded defaults work)
# TMDB_API_KEY=your_key_here
# TVDB_API_KEY=your_key_here
# FANART_TV_API_KEY=your_key_here
```

---

## Development Workflow

### 1. Initial Setup

```bash
# Start services
docker-compose -f docker-compose.dev.yml up -d

# Wait for services to be ready
docker-compose -f docker-compose.dev.yml ps

# Check logs if needed
docker-compose -f docker-compose.dev.yml logs -f postgres

# Initialize database
npm run migrate:dev

# Seed test data
npm run seed:dev
```

### 2. Development Cycle

```bash
# Terminal 1: Backend with hot-reload
npm run dev:backend

# Terminal 2: Frontend with HMR
npm run dev:frontend

# Terminal 3: Job queue monitor
npm run monitor:jobs

# Terminal 4: Testing webhooks
./dev/scripts/send-webhook.sh download "The Matrix"
```

### 3. Testing Specific Features

```bash
# Test subtitle extraction
npm run test:subtitles

# Test NFO generation
npm run test:nfo

# Test Kodi connection
npm run test:kodi

# Test webhook processing
npm run test:webhooks
```

### 4. Cleanup

```bash
# Stop all services
docker-compose -f docker-compose.dev.yml down

# Remove volumes (full reset)
docker-compose -f docker-compose.dev.yml down -v

# Remove test data
rm -rf test-library
```

---

## Debugging Tips

### Remote Database Queries (PostgreSQL on Docker Host)

```bash
# From development machine
psql -h 192.168.1.100 -U metarr -d metarr

# Or use pgAdmin/DBeaver with connection:
# Host: 192.168.1.100
# Port: 5432
# Database: metarr
# User: metarr
# Password: devpassword
```

```sql
-- Check job queue status
SELECT type, status, COUNT(*)
FROM job_queue
GROUP BY type, status;

-- View recent webhook events
SELECT * FROM webhook_events
ORDER BY created_at DESC
LIMIT 10;

-- Check workflow settings
SELECT * FROM app_settings
WHERE key LIKE 'workflow.%'
ORDER BY key;
```

### Remote Redis Commands

```bash
# From development machine
redis-cli -h 192.168.1.100

# View all keys
KEYS *

# Check queue lengths
LLEN bull:metarr:wait
LLEN bull:metarr:active

# Monitor commands in real-time
MONITOR
```

### Kodi Testing (Remote Machine)

```bash
# Test from development machine to Kodi machine
curl -X POST http://192.168.1.101:8080/jsonrpc \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"JSONRPC.Version","id":1}'

# Trigger library scan
curl -X POST http://192.168.1.101:8080/jsonrpc \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"VideoLibrary.Scan","id":1}'
```

---

## Troubleshooting

### Common Issues

1. **Cannot connect to PostgreSQL on Docker host**
   ```bash
   # Check firewall on Docker host
   sudo ufw status
   sudo ufw allow 5432/tcp

   # Ensure PostgreSQL is listening on all interfaces
   # In docker-compose.yml, ports should be "0.0.0.0:5432:5432"

   # Test from dev machine
   telnet 192.168.1.100 5432
   ```

2. **Redis connection refused**
   ```bash
   # Similar to PostgreSQL, check firewall
   sudo ufw allow 6379/tcp

   # Test Redis connectivity
   redis-cli -h 192.168.1.100 ping
   # Should return: PONG
   ```

3. **Kodi not responding**
   ```bash
   # Check Kodi web interface is enabled
   # Settings → Services → Control → Allow remote control via HTTP

   # Check Windows firewall on Kodi machine
   # May need to allow port 8080

   # Test from dev machine
   telnet 192.168.1.101 8080
   ```

4. **Path mapping issues**
   ```bash
   # Verify network share is accessible
   # From Windows dev machine:
   dir \\192.168.1.100\media

   # Ensure Radarr/Sonarr use Docker paths
   # Metarr will translate them for local access
   ```

5. **Webhook not reaching Metarr**
   ```bash
   # Check Windows firewall allows port 3000
   netsh advfirewall firewall add rule name="Metarr Dev" dir=in action=allow protocol=TCP localport=3000

   # Configure Radarr webhook to point to dev machine
   # URL: http://192.168.1.50:3000/api/webhooks/radarr
   # (where 192.168.1.50 is your dev machine IP)
   ```

---

## Next Steps

1. **Implement subtitle extraction** using ffmpeg/mkvtoolnix
2. **Create NFO generator** following Kodi XML schema
3. **Build asset selection algorithm** with scoring
4. **Complete webhook handlers** for all event types
5. **Test Kodi library updates** with real content

This development environment provides everything needed to build and test Metarr's critical features before v1.0 release.