# Metarr

**Intelligent Metadata Management for Your Media Library**

Metarr bridges your media downloaders (Radarr/Sonarr/Lidarr) and media players (Kodi/Jellyfin/Plex), providing automated metadata enrichment while preserving your manual edits through intelligent field locking.

---

## The Problem

When using Radarr/Sonarr: files get upgraded, metadata gets deleted, manual edits are lost, images disappear.

**Metarr fixes this** with a protected database and cache that survives all these operations.

---

## Key Features

- **Field-Level Locking**: Manual edits automatically lock fields
- **Two-Copy Architecture**: Database + cache (protected) + library (working copies)
- **Automated Workflow**: Webhooks → Scan → Enrich → Publish → Player Sync
- **Providers**: TMDB, TVDB, OMDb, Fanart.tv, MusicBrainz _(planned)_
- **Players**: Kodi (full support), Jellyfin _(planned)_, Plex _(planned)_

---

## Quick Start

```bash
# Clone the repository
git clone https://github.com/jsaddiction/Metarr.git
cd Metarr

# Install dependencies
npm install

# Create environment configuration
cp .env.example .env
# Edit .env with your settings

# Development mode
npm run dev:all  # Starts backend (port 3000) and frontend (port 3001)

# Production build
npm run build
npm run build:frontend
npm start
```

**Zero Configuration**: Metarr includes embedded API keys for providers. Clone → Install → Run. No API signup required for development.

---

## Documentation

Complete documentation available in the [`docs/`](docs/) directory:

- **[INDEX.md](docs/INDEX.md)** - Complete documentation map
- **[Getting Started](docs/getting-started/)** - Installation, configuration, first run
- **[Architecture](docs/architecture/)** - System design, asset management, database
- **[Phases](docs/phases/)** - Scanning, enrichment, publishing workflows
- **[Providers](docs/providers/)** - TMDB, TVDB, OMDb, Fanart.tv integration
- **[Players](docs/players/)** - Kodi, Jellyfin, Plex integration
- **[Frontend](docs/frontend/)** - React component architecture
- **[Reference](docs/reference/)** - Asset scoring, NFO format, webhooks
- **[Development](docs/development/)** - Workflow, roadmap, testing

---

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

For AI assistants working on this project, see [CLAUDE.md](CLAUDE.md) for development workflow rules.

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## Acknowledgments

- **Sonarr/Radarr/Lidarr** - UI design and workflow patterns
- **Kodi** - NFO file format and JSON-RPC API
- **TMDB & TVDB** - Metadata providers
