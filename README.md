# Metarr

**Metadata Management for Your Media Library**

Metarr is a "set it and forget it" metadata management application that bridges downloader tools (Sonarr/Radarr/Lidarr) and media players (Kodi/Jellyfin/Plex). It automates metadata enrichment while preserving your manual edits through an intelligent field-locking system.

---

## 🎯 What Does Metarr Do?

Metarr solves a common problem: **keeping your media library metadata rich, accurate, and personalized** without constantly re-doing manual edits when files are upgraded or re-imported.

### The Problem It Solves

When you use Sonarr/Radarr to manage your media:
- Files get upgraded (quality improvements, better releases)
- Media managers sometimes delete metadata and images during cleanup
- You lose manual edits when metadata is refreshed
- Web sources (TMDB/TVDB) occasionally remove images
- Players need fresh metadata after file changes

**Metarr fixes this** by maintaining a protected database and cache that survives all these operations.

---

## ✨ Key Features

### 🔒 Field-Level Locking
- **Manual edits automatically lock fields** - your customizations are protected
- **Automated processes only update unlocked fields** - no overwriting your work
- **Smart monitoring** - tracks which fields need attention vs. which are complete

### 💾 Two-Copy Architecture (Disaster Recovery)
- **Database**: All metadata stored safely (titles, plots, cast, crew, ratings)
- **Cache Directory**: All assets stored safely (images, trailers, subtitles)
- **Library Directory**: Working copies for media players (can be rebuilt from cache)
- **Survives**: Radarr/Sonarr file operations, TMDB/TVDB content removal, accidental deletions

### 🔄 Automated Workflow
1. **Sonarr/Radarr downloads complete** → Sends webhook to Metarr
2. **Metarr parses NFO files** → Extracts metadata and assets
3. **Metarr enriches data** → Fetches additional info from TMDB/TVDB (optional)
4. **Media players updated** → Triggers library scan on Kodi/Jellyfin/Plex
5. **Scheduled updates** → Keeps unlocked fields fresh while respecting your edits

### 🎬 Media Player Integration
- **Kodi**: Full JSON-RPC support (WebSocket + HTTP)
- **Jellyfin**: REST API integration *(coming soon)*
- **Plex**: API integration *(planned)*

### 📊 Metadata Providers
- **TMDB**: Movies and TV shows
- **TVDB**: TV shows and episodes
- **MusicBrainz**: Music metadata *(planned)*

---

## 🏗️ Architecture Overview

### Core Concept: Protected Storage

```
┌─────────────────────────────────────────────────────────────┐
│                    SOURCE OF TRUTH                          │
│  ┌──────────────────┐         ┌─────────────────────────┐  │
│  │    Database      │         │    Cache Directory      │  │
│  │  (Metadata)      │         │  (Assets)               │  │
│  │  • Titles        │         │  • Posters              │  │
│  │  • Plots         │         │  • Fanart               │  │
│  │  • Cast/Crew     │         │  • Trailers             │  │
│  │  • Ratings       │         │  • Subtitles            │  │
│  └──────────────────┘         └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            ↓
                ┌───────────────────────┐
                │  Library Directory    │
                │  (Working Copies)     │
                │  • Can be rebuilt     │
                │  • For player scans   │
                └───────────────────────┘
```

### Disaster Recovery Scenarios

**Scenario 1: Radarr Upgrades Movie Quality**
- Radarr deletes old movie and images during cleanup
- Metarr detects missing assets during next scan
- Rebuilds from cache (no TMDB API calls needed)
- ✅ All metadata and images restored

**Scenario 2: TMDB Removes Image**
- Image no longer available on TMDB servers
- Metarr has cache copy from original download
- Can still rebuild library directory from cache
- ✅ Image preserved despite web source removal

**Scenario 3: Accidental Directory Deletion**
- User accidentally deletes movie directory
- Database and cache intact
- User re-downloads movie via Radarr
- Metarr receives webhook, rebuilds directory from cache
- ✅ Only movie file re-downloaded, all metadata/assets restored

---

## 🚀 Technology Stack

### Backend
- **Node.js** with **TypeScript**
- **Express.js** for REST API
- **Multi-database support**: SQLite3, PostgreSQL, MySQL
- **Server-Sent Events (SSE)** for real-time updates

### Frontend
- **React** with **TypeScript**
- **Vite** for fast development and building
- **Tailwind CSS** with purple theme (Sonarr/Radarr-inspired)
- **React Router** for navigation

### Integrations
- **Kodi JSON-RPC** (WebSocket + HTTP)
- **TMDB API** for movie/TV metadata
- **TVDB API** for TV show metadata
- **Sonarr/Radarr/Lidarr webhooks**

---

## 📦 Installation

### Prerequisites
- Node.js 18+ and npm
- SQLite3 (included) or PostgreSQL/MySQL
- FFprobe (for video stream analysis)

### Quick Start

```bash
# Clone the repository
git clone https://github.com/jsaddiction/Metarr.git
cd Metarr

# Install dependencies
npm install

# Create environment configuration
cp .env.example .env
# Edit .env with your settings

# Build the application
npm run build

# Start the server
npm start
```

### Development Mode

```bash
# Run backend and frontend concurrently
npm run dev:all

# Backend only (http://localhost:3000)
npm run dev

# Frontend only (http://localhost:3001)
npm run dev:frontend
```

---

## ⚙️ Configuration

### Environment Variables

```env
# Server
PORT=3000
NODE_ENV=production

# Database
DB_TYPE=sqlite3                    # sqlite3 | postgres | mysql
DB_FILE=./data/metarr.sqlite       # For SQLite
# DB_HOST=localhost                # For PostgreSQL/MySQL
# DB_PORT=5432                     # For PostgreSQL/MySQL
# DB_NAME=metarr
# DB_USER=metarr
# DB_PASSWORD=password

# API Keys
TMDB_API_KEY=your_tmdb_key_here

# Media Players
KODI_HOST=192.168.1.100
KODI_PORT=8080
KODI_USERNAME=kodi
KODI_PASSWORD=kodi

# Jellyfin (coming soon)
# JELLYFIN_HOST=192.168.1.101
# JELLYFIN_PORT=8096
# JELLYFIN_API_KEY=your_jellyfin_key
```

### Web Interface

Access the web UI at `http://localhost:3000` after starting the server.

---

## 🎯 Usage

### Initial Setup

1. **Configure Libraries**
   - Add your movie/TV show directories
   - Configure path mappings (if Metarr runs on different machine than players)
   - Set up ignore patterns for files you want to skip

2. **Connect Media Players**
   - Add Kodi instances with connection details
   - Test connectivity
   - Configure automatic library scan triggers

3. **Configure Metadata Providers**
   - Add TMDB API key
   - Configure language preferences
   - Set up automatic enrichment rules

4. **Set Up Webhooks**
   - Configure Sonarr/Radarr/Lidarr to send webhooks to Metarr
   - Webhook URL: `http://your-metarr-server:3000/api/webhooks/radarr` (or `/sonarr`, `/lidarr`)

### Daily Operation

Once configured, Metarr operates automatically:

1. **Sonarr/Radarr downloads complete** → Webhook received
2. **Metarr processes new content** → Parses NFO, enriches metadata
3. **Assets cached** → Images, trailers copied to protected cache
4. **Media players notified** → Library scan triggered
5. **Scheduled maintenance** → Keeps metadata fresh, respects locked fields

### Manual Editing

- Use the web UI to edit any metadata field
- **Fields auto-lock when manually edited**
- Locked fields won't be overwritten by automated processes
- Unlock fields individually if you want automatic updates to resume

---

## 📚 Documentation

Detailed documentation is available in the [`docs/`](docs/) directory:

- [API Architecture](docs/API_ARCHITECTURE.md) - REST API + SSE communication
- [Database Schema](docs/DATABASE_SCHEMA.md) - Complete schema reference
- [Workflows](docs/WORKFLOWS.md) - Core application workflows
- [Field Locking](docs/FIELD_LOCKING.md) - Field-level locking system
- [Image Management](docs/IMAGE_MANAGEMENT.md) - Three-tier image storage
- [Kodi API](docs/KODI_API.md) - Kodi JSON-RPC integration
- [NFO Parsing](docs/NFO_PARSING.md) - Kodi NFO file format
- [Path Mapping](docs/PATH_MAPPING.md) - Path translation system
- [Metadata Providers](docs/METADATA_PROVIDERS.md) - TMDB/TVDB integration

---

## Project Status

**Development Phase**: Pre-Release
**Current Focus**: Building distributable codebase with production-ready features

For detailed development status and roadmap, see [docs/PROJECT_ROADMAP.md](docs/PROJECT_ROADMAP.md).

For contribution guidelines and git workflow, see [docs/GIT_WORKFLOW.md](docs/GIT_WORKFLOW.md).

---

## 🤝 Contributing

Contributions are welcome! This project is in active development.

### Development Guidelines

1. **Code Style**: Follow the existing TypeScript/ESLint configuration
2. **Documentation**: Update relevant docs for any feature changes
3. **Testing**: Add tests for new features *(testing framework coming soon)*
4. **Commits**: Use clear, descriptive commit messages

### Getting Started

```bash
# Fork and clone the repository
git clone https://github.com/YOUR_USERNAME/Metarr.git

# Create a feature branch
git checkout -b feature/your-feature-name

# Make your changes and commit
git commit -m "Add: your feature description"

# Push and create a pull request
git push origin feature/your-feature-name
```

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- **Sonarr/Radarr/Lidarr** - Inspiration for the UI design and workflow patterns
- **Kodi** - NFO file format and JSON-RPC API
- **TMDB** - Movie and TV show metadata
- **TVDB** - TV show metadata

---

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/jsaddiction/Metarr/issues)
- **Discussions**: [GitHub Discussions](https://github.com/jsaddiction/Metarr/discussions)

---

**Made with ❤️ for the home media server community**
