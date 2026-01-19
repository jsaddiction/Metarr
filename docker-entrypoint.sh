#!/bin/bash
set -e

# LinuxServer.io style PUID/PGID handling
PUID=${PUID:-911}
PGID=${PGID:-911}

echo "
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    Metarr - Media Metadata Manager
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    PUID: ${PUID}
    PGID: ${PGID}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"

# Modify abc group to match PGID
if [ "$(id -g abc)" != "${PGID}" ]; then
    echo "Setting abc group to GID ${PGID}..."
    groupmod -o -g "${PGID}" abc
fi

# Modify abc user to match PUID
if [ "$(id -u abc)" != "${PUID}" ]; then
    echo "Setting abc user to UID ${PUID}..."
    usermod -o -u "${PUID}" abc
fi

# Fix ownership of data directory
echo "Setting ownership of /data..."
chown -R abc:abc /data

# Note: /node_modules is already owned by abc from the Docker build

# Execute the command as the abc user
echo "Starting Metarr as abc (${PUID}:${PGID})..."
exec gosu abc "$@"
