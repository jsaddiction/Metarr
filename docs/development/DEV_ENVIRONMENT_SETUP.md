# Development Environment Setup

This guide sets up a complete development environment for Metarr on a headless Ubuntu server, with remote development via VSCode.

## Architecture Overview

```
┌──────────────────┐         SSH          ┌─────────────────────────────────┐
│  Your Laptop     │ ◄──────────────────► │  Dev Server (Ubuntu)            │
│  (Windows)       │                      │                                 │
│  - VSCode        │                      │  Docker Compose:                │
│  - No Docker     │                      │  ├── metarr (Node 20 + app)     │
│  - No WSL        │                      │  ├── radarr (test instance)     │
└──────────────────┘                      │  ├── nzbget (downloader)        │
        │                                 │  └── mariadb (Kodi shared lib)  │
        │ Browser                         │                                 │
        ▼                                 │  Volumes:                       │
   http://dev-server:3001                 │  ├── ./metarr-data/ (app data)  │
   (Metarr UI)                            │  ├── ./media/ (test movies)     │
                                          │  └── ./downloads/ (NZBGet)      │
                                          └─────────────────────────────────┘
```

## Prerequisites

### On Dev Server (Ubuntu)

1. **Docker & Docker Compose**
   ```bash
   # Install Docker
   curl -fsSL https://get.docker.com | sh
   sudo usermod -aG docker $USER
   # Log out and back in for group change to take effect

   # Verify
   docker --version
   docker compose version
   ```

2. **Git**
   ```bash
   sudo apt update && sudo apt install -y git
   ```

3. **SSH Server** (usually pre-installed on Ubuntu Server)
   ```bash
   sudo apt install -y openssh-server
   sudo systemctl enable ssh
   ```

### On Your Laptop (Windows)

1. **VSCode** with extensions:
   - Remote - SSH (Microsoft)
   - Remote - SSH: Editing Configuration Files (Microsoft)

2. **SSH client** (built into Windows 10/11)

---

## Step 1: Clone Repository on Dev Server

SSH into your dev server and clone the repo:

```bash
# Create development directory
mkdir -p ~/dev
cd ~/dev

# Clone the repository
git clone https://github.com/jsaddiction/Metarr.git
cd Metarr

# Create the backend-overhaul branch
git checkout -b backend-overhaul
```

---

## Step 2: Create Docker Files

The following files should already exist in the repository after the backend overhaul setup.

### File: `Dockerfile.dev`

Development Dockerfile with hot-reload support:

```dockerfile
# Development Dockerfile for Metarr
FROM node:20-bookworm-slim

# Install system dependencies
# - git: for npm packages that pull from git
# - python3/make/g++: for native node modules (sqlite3, sharp)
# - imagemagick: for phash-imagemagick
RUN apt-get update && apt-get install -y \
    git \
    python3 \
    make \
    g++ \
    imagemagick \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files first (for layer caching)
COPY package*.json ./

# Install ALL dependencies (including devDependencies)
RUN npm ci

# Copy the rest of the application
# In development, this is overridden by volume mount
COPY . .

# Expose ports
# 3000 = Backend API
# 3001 = Vite dev server (frontend)
EXPOSE 3000 3001

# Default command for development
CMD ["npm", "run", "dev:all"]
```

### File: `docker-compose.yml`

Complete development stack:

```yaml
services:
  # ===========================================
  # METARR - Main Application
  # ===========================================
  metarr:
    build:
      context: .
      dockerfile: Dockerfile.dev
    container_name: metarr-dev
    ports:
      - "3000:3000"   # Backend API
      - "3001:3001"   # Frontend dev server
    volumes:
      # Source code mount - changes reflect immediately
      - .:/app
      # Preserve node_modules from container (don't overwrite with host)
      - /app/node_modules
      # Persistent data
      - ./metarr-data:/data
    environment:
      - NODE_ENV=development
      - METARR_DATA_DIR=/data
      - METARR_LOG_LEVEL=debug
    depends_on:
      - mariadb
    networks:
      - metarr-network
    # Restart on crash during development
    restart: unless-stopped

  # ===========================================
  # RADARR - Movie Management (Test Instance)
  # ===========================================
  radarr:
    image: lscr.io/linuxserver/radarr:latest
    container_name: radarr-dev
    environment:
      - PUID=1000
      - PGID=1000
      - TZ=America/New_York
    volumes:
      - ./radarr-config:/config
      - ./media/movies:/movies
      - ./downloads:/downloads
    ports:
      - "7878:7878"
    networks:
      - metarr-network
    restart: unless-stopped

  # ===========================================
  # NZBGET - Usenet Downloader
  # ===========================================
  nzbget:
    image: lscr.io/linuxserver/nzbget:latest
    container_name: nzbget-dev
    environment:
      - PUID=1000
      - PGID=1000
      - TZ=America/New_York
    volumes:
      - ./nzbget-config:/config
      - ./downloads:/downloads
    ports:
      - "6789:6789"
    networks:
      - metarr-network
    restart: unless-stopped

  # ===========================================
  # MARIADB - Kodi Shared Library Database
  # ===========================================
  mariadb:
    image: mariadb:10.11
    container_name: mariadb-dev
    environment:
      - MYSQL_ROOT_PASSWORD=devroot
      - MYSQL_DATABASE=kodi_video
      - MYSQL_USER=kodi
      - MYSQL_PASSWORD=kodi
    volumes:
      - ./mariadb-data:/var/lib/mysql
    ports:
      - "3306:3306"
    networks:
      - metarr-network
    restart: unless-stopped

networks:
  metarr-network:
    driver: bridge
```

### File: `.dockerignore`

Prevents unnecessary files from being copied to the Docker image:

```
# Dependencies (installed in container)
node_modules

# Build outputs
dist
public/frontend/dist

# Data directories
data
metarr-data
radarr-config
nzbget-config
mariadb-data
downloads
media
logs

# Git
.git
.gitignore

# IDE
.vscode
.idea
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Environment files with secrets
.env
.env.local
.env.*.local

# Test artifacts
coverage
*.log
```

---

## Step 3: Configure VSCode Remote-SSH

### On Your Laptop

1. **Open VSCode**

2. **Configure SSH Host**
   - Press `Ctrl+Shift+P` → "Remote-SSH: Open SSH Configuration File"
   - Add your dev server:
   ```
   Host dev-server
       HostName 192.168.x.x    # Your dev server IP
       User your-username
       # Optional: specify key file
       # IdentityFile ~/.ssh/id_rsa
   ```

3. **Connect to Dev Server**
   - Press `Ctrl+Shift+P` → "Remote-SSH: Connect to Host"
   - Select "dev-server"
   - VSCode opens a new window connected to the server

4. **Open the Project**
   - File → Open Folder → `/home/your-username/dev/Metarr`

---

## Step 4: Start the Development Stack

In VSCode's integrated terminal (which runs on the dev server):

```bash
# First time: Build the Metarr container
docker compose build metarr

# Start all services
docker compose up -d

# View logs (follow mode)
docker compose logs -f metarr

# Or view all logs
docker compose logs -f
```

### Access Points

| Service | URL | Notes |
|---------|-----|-------|
| Metarr Frontend | http://dev-server:3001 | Vite dev server with hot-reload |
| Metarr API | http://dev-server:3000/api | Backend API |
| Radarr | http://dev-server:7878 | Test movie manager |
| NZBGet | http://dev-server:6789 | Downloader |
| MariaDB | dev-server:3306 | Kodi shared library |

Replace `dev-server` with your actual server IP or hostname.

---

## Step 5: Development Workflow

### Making Code Changes

1. Edit files in VSCode (they're on the dev server via SSH)
2. Changes are immediately visible to the container (volume mount)
3. Nodemon/Vite detect changes and hot-reload
4. Refresh browser to see changes

### Rebuilding the Container

Only needed when:
- `package.json` changes (new dependencies)
- `Dockerfile.dev` changes

```bash
# Rebuild and restart
docker compose up -d --build metarr
```

### Viewing Logs

```bash
# All services
docker compose logs -f

# Just Metarr
docker compose logs -f metarr

# Last 100 lines
docker compose logs --tail 100 metarr
```

### Stopping Everything

```bash
# Stop but keep data
docker compose down

# Stop and remove volumes (DELETES DATA)
docker compose down -v
```

### Running Commands in Container

```bash
# Open shell in Metarr container
docker compose exec metarr bash

# Run npm commands
docker compose exec metarr npm run lint
docker compose exec metarr npm run typecheck
docker compose exec metarr npm test
```

---

## Step 6: Configure Radarr

After starting the stack, configure Radarr:

1. Open http://dev-server:7878
2. Complete initial setup wizard
3. Add a root folder: `/movies`
4. Configure download client:
   - Type: NZBGet
   - Host: `nzbget`  (Docker service name)
   - Port: 6789
   - Username/Password: (check NZBGet config)

5. **Configure webhook for Metarr:**
   - Settings → Connect → Add → Webhook
   - Name: Metarr
   - Triggers: On Grab, On Import, On Rename, On Delete
   - URL: `http://metarr:3000/webhooks/radarr`
   - Method: POST

---

## Step 7: Configure Kodi Shared Library (Later)

When ready to add Kodi:

1. **On Kodi device**, configure MySQL shared library:
   - Edit `advancedsettings.xml`:
   ```xml
   <advancedsettings>
     <videodatabase>
       <type>mysql</type>
       <host>dev-server-ip</host>
       <port>3306</port>
       <user>kodi</user>
       <pass>kodi</pass>
     </videodatabase>
   </advancedsettings>
   ```

2. **Point Kodi's movie source** to the same location Radarr uses
   (via NFS, SMB, or direct mount)

---

## Troubleshooting

### Container won't start

```bash
# Check logs
docker compose logs metarr

# Common issues:
# - Port already in use: change ports in docker-compose.yml
# - Permission issues: check PUID/PGID match your user
```

### Hot reload not working

```bash
# Ensure volume mount is correct
docker compose exec metarr ls -la /app/src

# Check if nodemon is running
docker compose logs metarr | grep nodemon
```

### Can't connect from laptop browser

1. Check dev server firewall allows ports 3000, 3001, 7878, 6789
2. Verify services are running: `docker compose ps`
3. Try from dev server itself: `curl http://localhost:3001`

### npm install issues in container

```bash
# Rebuild from scratch
docker compose down
docker compose build --no-cache metarr
docker compose up -d
```

### VSCode can't connect via SSH

1. Verify SSH works from command line: `ssh dev-server`
2. Check SSH config in VSCode
3. Ensure dev server SSH service is running: `sudo systemctl status ssh`

---

## Directory Structure on Dev Server

After setup, your dev server will have:

```
~/dev/Metarr/
├── docker-compose.yml
├── Dockerfile.dev
├── .dockerignore
├── package.json
├── src/                    # Backend source
├── public/frontend/        # Frontend source
├── metarr-data/           # Metarr persistent data (created by Docker)
├── radarr-config/         # Radarr config (created by Docker)
├── nzbget-config/         # NZBGet config (created by Docker)
├── mariadb-data/          # MariaDB data (created by Docker)
├── downloads/             # Downloaded files
└── media/
    └── movies/            # Test movie library
```

---

## Next Steps

Once the environment is running:

1. Add a test movie to Radarr
2. Verify webhook arrives at Metarr
3. Begin implementing the simplified backend architecture
