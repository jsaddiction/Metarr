# Development Environment Setup

This guide sets up a development environment for Metarr on a headless Ubuntu server, with remote development via VSCode.

## Architecture Overview

```
┌──────────────────┐         SSH          ┌─────────────────────────────────┐
│  Your Laptop     │ ◄──────────────────► │  Dev Server (Ubuntu)            │
│  (Windows)       │                      │                                 │
│  - VSCode        │                      │  Metarr Docker Compose:         │
│  - No Docker     │                      │  ├── metarr (Node 20 + app)     │
│  - No WSL        │                      │  └── postgres (database)        │
└──────────────────┘                      │                                 │
        │                                 │  Your Existing Stack:           │
        │ Browser                         │  ├── radarr                     │
        ▼                                 │  ├── nzbget                     │
   http://dev-server:3001                 │  └── mariadb (kodi)             │
   (Metarr UI)                            │                                 │
                                          │  Kodi Box (separate device)     │
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

# Switch to the backend-overhaul branch
git checkout backend-overhaul
```

---

## Step 2: Configure VSCode Remote-SSH

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

## Step 3: Start Metarr Dev Stack

In VSCode's integrated terminal (which runs on the dev server):

```bash
# First time: Build the Metarr container
docker compose build metarr

# Start Metarr and PostgreSQL
docker compose up -d

# View logs (follow mode)
docker compose logs -f metarr
```

### Access Points

| Service | URL | Notes |
|---------|-----|-------|
| Metarr Frontend | http://dev-server:3001 | Vite dev server with hot-reload |
| Metarr API | http://dev-server:3000/api | Backend API |
| PostgreSQL | dev-server:5432 | Metarr database |

Replace `dev-server` with your actual server IP or hostname.

---

## Step 4: Configure Connections

Metarr needs to connect to your existing *arr stack and Kodi. These run on your existing compose stack, not this one.

### Network Connectivity

If your existing stack is on the same Docker host, you have options:

**Option A: Use host network mode** (simplest)
```yaml
# In docker-compose.yml, add to metarr service:
extra_hosts:
  - "host.docker.internal:host-gateway"
```
Then use `host.docker.internal` to reach services on the host.

**Option B: Join the existing network**
```yaml
# In docker-compose.yml, modify networks:
networks:
  metarr-network:
    external: true
    name: your-existing-network-name
```

**Option C: Use host IP directly**
Configure Metarr to connect via the dev server's LAN IP.

### Environment Variables

Edit `docker-compose.yml` or create a `.env` file:

```bash
# .env file (optional, for sensitive values)
RADARR_URL=http://192.168.x.x:7878
RADARR_API_KEY=your-api-key
KODI_URL=http://192.168.x.x:8080
KODI_USERNAME=kodi
KODI_PASSWORD=kodi
```

Or configure these via the Metarr UI after starting.

---

## Step 5: Configure Radarr Webhook

In your existing Radarr instance:

1. Settings → Connect → Add → Webhook
2. Configure:
   - Name: `Metarr`
   - Triggers: On Grab, On Import, On Rename, On Delete
   - URL: `http://dev-server:3000/webhooks/radarr`
   - Method: POST

---

## Development Workflow

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

### Database Access

```bash
# Connect to PostgreSQL
docker compose exec postgres psql -U metarr

# Or from host with psql client
psql -h localhost -U metarr -d metarr
```

---

## Troubleshooting

### Container won't start

```bash
# Check logs
docker compose logs metarr

# Common issues:
# - Port already in use: change ports in docker-compose.yml
# - PostgreSQL not ready: check postgres logs
```

### Hot reload not working

```bash
# Ensure volume mount is correct
docker compose exec metarr ls -la /app/src

# Check if nodemon is running
docker compose logs metarr | grep nodemon
```

### Can't connect to Radarr/Kodi

1. Verify network connectivity from container:
   ```bash
   docker compose exec metarr curl http://your-radarr:7878/api/v3/system/status
   ```
2. Check firewall rules on dev server
3. Verify API keys are correct

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
├── docker-compose.yml      # Metarr + PostgreSQL
├── Dockerfile.dev          # Development container
├── .dockerignore
├── .env                    # Optional: environment overrides
├── package.json
├── src/                    # Backend source
├── public/frontend/        # Frontend source
├── metarr-data/           # Metarr cache/logs (created by Docker)
└── postgres-data/         # PostgreSQL data (created by Docker)
```

Your existing *arr stack remains in its own directory/compose file.

---

## Next Steps

Once the environment is running:

1. Verify Metarr UI loads at http://dev-server:3001
2. Configure Radarr connection in Settings
3. Configure Kodi connection in Settings
4. Set up Radarr webhook pointing to Metarr
5. Test with a movie import
