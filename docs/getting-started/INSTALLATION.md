# Installation

**Purpose**: Basic installation guide for Metarr on bare metal or local development environments.

**Related Docs**:
- Parent: [Getting Started](../INDEX.md#getting-started)
- Next: [Docker Setup](DOCKER.md)
- See also: [Configuration](CONFIGURATION.md), [First Run](FIRST_RUN.md)

## Quick Reference

- **Node.js 20+** and **npm 10+** required
- **Clone → Install → Run** (zero configuration needed for development)
- Embedded API keys included for immediate testing
- SQLite database by default (no setup required)
- Production deployment should use environment variables

---

## Prerequisites

### Required

**Node.js 20 or higher**
```bash
# Check your Node.js version
node --version  # Should be v20.0.0 or higher

# Check npm version
npm --version   # Should be v10.0.0 or higher
```

**Installation sources**:
- [Official Node.js installer](https://nodejs.org/) (includes npm)
- [nvm (Node Version Manager)](https://github.com/nvm-sh/nvm) - recommended for managing multiple versions

### Optional

**Git** - For cloning the repository
```bash
git --version
```

**PostgreSQL** - For large libraries (10k+ items)
- SQLite works great for most deployments
- PostgreSQL recommended for high-concurrency or very large libraries
- See [Performance](../operations/PERFORMANCE.md) for guidance

---

## Installation Steps

### 1. Clone Repository

```bash
git clone https://github.com/yourusername/metarr.git
cd metarr
```

**Alternative**: Download ZIP from GitHub releases and extract

### 2. Install Dependencies

```bash
npm install
```

**What this does**:
- Installs all Node.js packages (backend and frontend)
- Downloads Sharp for image processing
- Sets up TypeScript compilation
- Configures development tools

**Expected time**: 2-5 minutes depending on network speed

**Common issues**:
- **Sharp build failures**: Ensure you have build tools installed
  - Windows: `npm install --global windows-build-tools`
  - Linux: `sudo apt-get install build-essential`
  - macOS: Install Xcode Command Line Tools
- **Permission errors**: Don't use `sudo npm install` - fix npm permissions instead

### 3. Environment Configuration (Optional)

Metarr includes embedded API keys for development. For production:

```bash
cp .env.example .env
# Edit .env with your preferred settings
```

**Optional configurations**:
- Database type (SQLite or PostgreSQL)
- API keys (TMDB, TVDB, Fanart.tv)
- Storage paths
- Performance tuning

See [Configuration Guide](CONFIGURATION.md) for details.

### 4. Database Initialization

**Automatic on first run** - no manual steps required.

The database will be created at:
- SQLite: `./data/metarr.sqlite`
- PostgreSQL: Uses `DATABASE_URL` from environment

---

## Verification

### Development Mode

Start both backend and frontend:
```bash
npm run dev:all
```

**Expected output**:
```
[backend]  Server running on http://localhost:3000
[frontend] Local: http://localhost:3001
```

**Verify**:
1. Open browser to `http://localhost:3001`
2. You should see Metarr interface
3. No errors in terminal output

### Production Build

Build for production:
```bash
npm run build          # Build backend
npm run build:frontend # Build frontend
npm start             # Run production server
```

**Production server runs on**: `http://localhost:3000`

---

## Directory Structure After Installation

```
metarr/
├── data/                 # Created on first run
│   ├── cache/           # Protected asset cache
│   ├── recycle/         # Deleted items (30-day retention)
│   └── metarr.sqlite    # Database (if using SQLite)
├── logs/                # Created on first run
│   ├── app-YYYY-MM-DD.log
│   └── error-YYYY-MM-DD.log
├── node_modules/        # Dependencies
├── public/              # Frontend build output
├── src/                 # Source code
└── dist/                # Compiled backend (after build)
```

**Git-ignored directories**:
- `data/` - Your runtime data
- `logs/` - Application logs
- `node_modules/` - Dependencies
- `dist/` - Build output

---

## Next Steps

**After successful installation**:

1. **[Configure Metarr](CONFIGURATION.md)** - Set up providers, paths, and players
2. **[First Run Guide](FIRST_RUN.md)** - Walk through initial setup
3. **[Docker Setup](DOCKER.md)** - If you prefer containerized deployment

**For production deployment**:
1. Review [Security Best Practices](../operations/SECURITY.md)
2. Set up [Backup Strategy](../operations/BACKUP_RECOVERY.md)
3. Configure [Monitoring](../operations/MONITORING.md)

---

## Troubleshooting

### Installation Failures

**Problem**: `npm install` fails with EACCES errors
**Solution**: Fix npm permissions - [Official guide](https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally)

**Problem**: Sharp installation fails
**Solution**: Install platform build tools (see step 2 above)

**Problem**: Out of memory during install
**Solution**: Increase Node.js memory: `NODE_OPTIONS=--max-old-space-size=4096 npm install`

### Runtime Issues

**Problem**: Port 3000 or 3001 already in use
**Solution**:
- Stop other services using these ports
- Or modify port in configuration

**Problem**: Database locked errors
**Solution**: Ensure only one Metarr instance is running

**Problem**: Cannot find module errors
**Solution**:
```bash
rm -rf node_modules package-lock.json
npm install
```

### Getting Help

- Check [Troubleshooting Guide](../operations/TROUBLESHOOTING.md)
- Search [GitHub Issues](https://github.com/yourusername/metarr/issues)
- Join [Discord Community](https://discord.gg/metarr)
