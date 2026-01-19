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
    echo "[entrypoint] Setting abc group to GID ${PGID}..."
    groupmod -o -g "${PGID}" abc
    echo "[entrypoint] Group modified"
fi

# Modify abc user to match PUID
if [ "$(id -u abc)" != "${PUID}" ]; then
    echo "[entrypoint] Setting abc user to UID ${PUID}..."
    usermod -o -u "${PUID}" abc
    echo "[entrypoint] User modified"
fi

# Fix ownership of data directory
echo "[entrypoint] Setting ownership of /data..."
chown abc:abc /data
echo "[entrypoint] /data ownership set"

# Execute the command as the abc user
echo "[entrypoint] Starting Metarr as abc (${PUID}:${PGID})..."
exec gosu abc "$@"
