#!/bin/bash
set -e

# LinuxServer.io style PUID/PGID handling
PUID=${PUID:-1000}
PGID=${PGID:-1000}

echo "
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    Metarr - Media Metadata Manager
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    PUID: ${PUID}
    PGID: ${PGID}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"

# Modify metarr group to match PGID
if [ "$(id -g metarr)" != "${PGID}" ]; then
    echo "Updating metarr group to GID ${PGID}..."
    groupmod -o -g "${PGID}" metarr
fi

# Modify metarr user to match PUID
if [ "$(id -u metarr)" != "${PUID}" ]; then
    echo "Updating metarr user to UID ${PUID}..."
    usermod -o -u "${PUID}" metarr
fi

# Fix ownership of data directory
echo "Setting ownership of /data to metarr:metarr..."
chown -R metarr:metarr /data

# Fix ownership of app directory for development
# Only change ownership of files we own, not mounted volumes
if [ -d "/app" ]; then
    # Ensure the metarr user can write to necessary directories
    chown metarr:metarr /app 2>/dev/null || true

    # Create and own the node_modules directory if it exists
    if [ -d "/app/node_modules" ]; then
        chown -R metarr:metarr /app/node_modules 2>/dev/null || true
    fi
fi

# Execute the command as the metarr user
echo "Starting Metarr as user metarr (${PUID}:${PGID})..."
exec gosu metarr "$@"
