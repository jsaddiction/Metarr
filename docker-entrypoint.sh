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

# LinuxServer.io trick: temporarily set home to /root to speed up usermod
# usermod scans the home directory for files to chown - /root is small
USERHOME=$(grep abc /etc/passwd | cut -d ":" -f6)
usermod -d /root abc

# Modify abc group to match PGID
if [ "$(id -g abc)" != "${PGID}" ]; then
    groupmod -o -g "${PGID}" abc
fi

# Modify abc user to match PUID
if [ "$(id -u abc)" != "${PUID}" ]; then
    usermod -o -u "${PUID}" abc
fi

# Restore original home directory
usermod -d "${USERHOME}" abc

# lsiown: LinuxServer.io style ownership fix
# Only chowns files that don't already have correct ownership (fast on repeat starts)
lsiown() {
    local user group path
    IFS=: read -r user group <<< "$1"
    path="$2"
    find "$path" \( ! -group "$group" -o ! -user "$user" \) -exec chown "$user":"$group" {} + 2>/dev/null || true
}

# Fix ownership of data directory (only files with wrong ownership)
lsiown abc:abc /data

# Execute the command as the abc user
echo "Starting Metarr as abc (${PUID}:${PGID})..."
exec gosu abc "$@"
