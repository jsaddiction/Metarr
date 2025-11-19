# Security Best Practices

**Purpose**: Security hardening guide for production Metarr deployments.

**Related Docs**:
- Parent: [Operations](../INDEX.md#operations)
- See also: [Configuration](../getting-started/CONFIGURATION.md), [Docker Setup](../getting-started/DOCKER.md)

## Quick Reference

- **No built-in authentication** - Use reverse proxy with auth
- **API keys are sensitive** - Never commit to version control
- **HTTPS required** for production - Use reverse proxy SSL termination
- **Network exposure** - Restrict to trusted networks when possible
- **File permissions** - Ensure proper ownership and access control
- **Regular updates** - Keep dependencies current

---

## Threat Model

### Attack Vectors

**1. Unauthorized Access**
- Web interface exposed to internet
- No authentication by default
- Risk: Unauthorized metadata manipulation

**2. API Key Exposure**
- Keys in configuration files
- Keys in logs or error messages
- Risk: API abuse, rate limit exhaustion

**3. File System Access**
- Write access to media library
- Cache directory tampering
- Risk: Data deletion, malware injection

**4. Network Attacks**
- Man-in-the-middle (HTTP)
- Cross-site scripting (XSS)
- Cross-site request forgery (CSRF)

**5. Dependency Vulnerabilities**
- Outdated npm packages
- Known CVEs in dependencies
- Risk: Remote code execution

---

## Authentication and Authorization

### Current State

**Metarr does NOT include built-in authentication** (as of v1.0)

**Reasoning**:
- Most deployments are home networks (trusted)
- Authentication complexity varies by use case
- Better handled by reverse proxy layer

### Recommended Solutions

#### Option 1: Reverse Proxy Authentication (Recommended)

**Nginx with Basic Auth**:
```nginx
server {
    listen 80;
    server_name metarr.yourdomain.com;

    # Basic authentication
    auth_basic "Metarr Login";
    auth_basic_user_file /etc/nginx/.htpasswd;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

**Create password file**:
```bash
sudo htpasswd -c /etc/nginx/.htpasswd username
```

**Authelia/Authentik (Advanced)**:
- OIDC/LDAP authentication
- Multi-factor authentication (MFA)
- Single sign-on (SSO)

#### Option 2: Network Isolation

**Restrict to local network only**:
```yaml
# docker-compose.yml
services:
  metarr:
    ports:
      - "127.0.0.1:3000:3000"  # Localhost only
```

**Access via VPN**:
- WireGuard
- OpenVPN
- Tailscale (zero-config mesh VPN)

**Firewall rules** (iptables):
```bash
# Allow only from local network
iptables -A INPUT -p tcp --dport 3000 -s 192.168.1.0/24 -j ACCEPT
iptables -A INPUT -p tcp --dport 3000 -j DROP
```

#### Option 3: Cloudflare Access

**Zero-trust access** via Cloudflare:
1. Domain proxied through Cloudflare
2. Cloudflare Access application configured
3. Authentication via Google/GitHub/Email

**Benefits**:
- No VPN required
- Free tier available
- Automatic HTTPS

---

## HTTPS/TLS Configuration

### Why HTTPS is Critical

**Risks of HTTP**:
- Credentials sent in plain text
- API keys visible on network
- Session hijacking possible
- MITM attacks trivial

**HTTPS benefits**:
- Encrypted traffic
- Authentication of server
- Tamper protection

### Implementation Options

#### Option 1: Reverse Proxy SSL Termination (Recommended)

**Nginx with Let's Encrypt**:
```nginx
server {
    listen 443 ssl http2;
    server_name metarr.yourdomain.com;

    # SSL certificates from Let's Encrypt
    ssl_certificate /etc/letsencrypt/live/metarr.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/metarr.yourdomain.com/privkey.pem;

    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Proxy to Metarr
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name metarr.yourdomain.com;
    return 301 https://$server_name$request_uri;
}
```

**Obtain certificate**:
```bash
sudo certbot --nginx -d metarr.yourdomain.com
```

#### Option 2: Cloudflare Proxy

**Automatic HTTPS**:
1. Domain DNS points to Cloudflare
2. Cloudflare proxy enabled (orange cloud)
3. SSL/TLS mode: Full (Strict) recommended

**Benefits**:
- Free SSL certificates
- DDoS protection
- CDN caching (for static assets)

#### Option 3: Traefik (Docker)

**Automatic Let's Encrypt**:
```yaml
# docker-compose.yml
services:
  traefik:
    image: traefik:v2.10
    command:
      - "--providers.docker=true"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.websecure.address=:443"
      - "--certificatesresolvers.letsencrypt.acme.httpchallenge=true"
      - "--certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web"
      - "--certificatesresolvers.letsencrypt.acme.email=you@example.com"
      - "--certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json"
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - "/var/run/docker.sock:/var/run/docker.sock:ro"
      - "./letsencrypt:/letsencrypt"

  metarr:
    image: metarr/metarr:latest
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.metarr.rule=Host(`metarr.yourdomain.com`)"
      - "traefik.http.routers.metarr.entrypoints=websecure"
      - "traefik.http.routers.metarr.tls.certresolver=letsencrypt"
```

---

## API Key Management

### Secure Storage

**Never commit API keys to version control**

**Use environment variables**:
```env
# .env file (add to .gitignore)
TMDB_API_KEY=your_api_key_here
TVDB_API_KEY=your_api_key_here
FANART_TV_API_KEY=your_api_key_here
```

**Docker secrets** (Swarm mode):
```yaml
services:
  metarr:
    image: metarr/metarr:latest
    secrets:
      - tmdb_api_key
    environment:
      - TMDB_API_KEY_FILE=/run/secrets/tmdb_api_key

secrets:
  tmdb_api_key:
    external: true
```

**Vault/Secrets Manager** (Enterprise):
- HashiCorp Vault
- AWS Secrets Manager
- Azure Key Vault

### API Key Rotation

**When to rotate**:
- Suspected compromise
- Employee departure (if shared)
- Regular schedule (quarterly recommended)

**Rotation procedure**:
1. Generate new API key at provider
2. Update `.env` file
3. Restart Metarr
4. Verify functionality
5. Delete old key at provider

### Monitoring for Abuse

**Check for unexpected API usage**:
```bash
# Count provider requests in logs
grep "TMDB API" logs/app-*.log | wc -l

# Check for rate limit errors
grep "rate limit" logs/error-*.log
```

**Provider dashboards**:
- TMDB: Check usage statistics
- TVDB: Monitor API calls
- Alert on unusual patterns

---

## File System Security

### Permissions

**Principle of least privilege**: Metarr should run as non-root user

**Docker**:
```yaml
services:
  metarr:
    user: "1000:1000"  # Non-root UID:GID
    volumes:
      - ./data:/data
      - /mnt/media:/media:rw
```

**File ownership**:
```bash
# Ensure Metarr user owns data directory
sudo chown -R metarr:metarr /path/to/metarr/data

# Media library: Read/write for Metarr
sudo chown -R metarr:metarr /mnt/media
# OR
sudo chmod -R 775 /mnt/media
sudo usermod -aG media-group metarr
```

**Directory permissions**:
```bash
# Data directory: 750 (owner RWX, group RX)
chmod 750 /path/to/metarr/data

# Media library: 755 (owner RWX, others RX)
chmod 755 /mnt/media

# Configuration: 600 (owner RW only)
chmod 600 /path/to/metarr/.env
```

### Preventing Path Traversal

**Metarr protects against**:
- Accessing files outside configured paths
- Symlink attacks
- Relative path exploits

**Validation**:
- All file paths validated against library roots
- Symlinks resolved before validation
- Path mapping enforces boundaries

**User responsibility**:
- Don't configure library paths that overlap system directories
- Avoid root filesystem as library path

---

## Network Security

### Firewall Configuration

**UFW (Ubuntu/Debian)**:
```bash
# Allow SSH (if remote)
sudo ufw allow ssh

# Allow Metarr (local network only)
sudo ufw allow from 192.168.1.0/24 to any port 3000

# Enable firewall
sudo ufw enable
```

**iptables**:
```bash
# Allow established connections
iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

# Allow local network to port 3000
iptables -A INPUT -p tcp -s 192.168.1.0/24 --dport 3000 -j ACCEPT

# Drop all other connections to port 3000
iptables -A INPUT -p tcp --dport 3000 -j DROP
```

### Docker Network Isolation

**Custom bridge network**:
```yaml
services:
  metarr:
    networks:
      - metarr-network

networks:
  metarr-network:
    driver: bridge
    internal: false  # Set true to block internet (not recommended)
```

**Internal services network** (database):
```yaml
services:
  metarr:
    networks:
      - frontend
      - backend

  postgres:
    networks:
      - backend  # Not exposed to frontend

networks:
  frontend:
  backend:
    internal: true  # No internet access
```

---

## Input Validation

### User-Provided Data

**Metarr validates**:
- File paths (against configured libraries)
- Configuration values (type and range)
- API inputs (schema validation)

**Protected against**:
- SQL injection (parameterized queries)
- XSS (React escapes output)
- Command injection (no shell execution of user input)

### Webhook Validation

**Webhook sources**:
- Radarr
- Sonarr
- Lidarr

**Security considerations**:
1. **Validate webhook source** (future: HMAC signatures)
2. **Path validation** (against configured libraries)
3. **Rate limiting** (prevent DoS)

**Current protection**:
- Path mapping prevents access outside libraries
- Webhook payload schema validation
- Job queue rate limiting

---

## Dependency Management

### Keeping Dependencies Updated

**Check for vulnerabilities**:
```bash
npm audit
```

**Update dependencies**:
```bash
# Update all to latest compatible
npm update

# Update to latest (including major versions)
npm install package@latest
```

**Automated security updates** (Dependabot/Renovate):
- GitHub Dependabot enabled by default
- Creates PRs for security updates
- Review and merge promptly

### Monitoring CVEs

**Resources**:
- GitHub Security Advisories
- npm security advisories
- Snyk vulnerability database

**Notifications**:
- GitHub watch repository for security alerts
- npm audit alerts in CI/CD

---

## Logging and Auditing

### Security-Relevant Logging

**Currently logged**:
- API authentication attempts (future)
- File access (debug level)
- Configuration changes (future)
- Failed operations (error logs)

**Sensitive data protection**:
- API keys redacted from logs
- Personal file paths truncated (debug mode)

### Log Security

**Protect log files**:
```bash
# Restrict access to logs
chmod 640 logs/*.log
chown metarr:metarr logs/*.log
```

**Log rotation** (automatic):
- Daily rotation
- 7-day retention (default)
- Compressed archives (future)

**Remote logging** (future):
- Syslog integration
- ELK stack support
- Splunk compatibility

See [Monitoring Guide](MONITORING.md) for log analysis.

---

## Secrets Management

### Development vs Production

**Development** (.env file):
```env
# OK for development
TMDB_API_KEY=dev_key_here
```

**Production** (environment variables):
```bash
# Set in system/container environment
export TMDB_API_KEY="production_key"
```

**Docker Compose** (env_file):
```yaml
services:
  metarr:
    env_file:
      - /secure/path/.env  # Outside project directory
```

### Secrets Scanning

**Prevent commits of secrets**:

**git-secrets**:
```bash
git secrets --install
git secrets --register-aws
git secrets --add 'TMDB_API_KEY=[A-Za-z0-9]+'
```

**Pre-commit hooks**:
```bash
# .git/hooks/pre-commit
#!/bin/bash
if grep -r "TMDB_API_KEY=.*" --exclude-dir=.git .; then
    echo "ERROR: API key found in commit"
    exit 1
fi
```

---

## Multi-User Deployments

### Considerations

**If sharing Metarr with others**:
1. **Authentication required** (reverse proxy)
2. **Field locking** - Prevent overwrites of manual edits
3. **Audit logging** - Track who changed what (future)
4. **Role-based access** - Future feature

**Current limitations**:
- No user management built-in
- No activity attribution
- All users have full access

**Recommendations**:
- Use reverse proxy authentication
- Document manual changes elsewhere
- Consider separate Metarr instances for different users

---

## Security Checklist

### Production Deployment

- [ ] HTTPS enabled (reverse proxy or Cloudflare)
- [ ] Authentication configured (reverse proxy or network isolation)
- [ ] API keys in environment variables (not code)
- [ ] .env file not committed to version control
- [ ] File permissions configured (non-root user)
- [ ] Firewall rules restrict access (trusted networks only)
- [ ] Regular backups configured (see [Backup Guide](BACKUP_RECOVERY.md))
- [ ] Dependencies up to date (`npm audit` clean)
- [ ] Logs protected (restricted permissions)
- [ ] Monitoring configured (see [Monitoring Guide](MONITORING.md))

### Regular Maintenance

**Monthly**:
- [ ] Review logs for suspicious activity
- [ ] Update dependencies (`npm update`)
- [ ] Rotate API keys (if policy requires)
- [ ] Review firewall rules

**Quarterly**:
- [ ] Security audit (`npm audit`)
- [ ] Test backup restoration
- [ ] Review access controls
- [ ] Update documentation

---

## Incident Response

### Suspected Compromise

**If you suspect unauthorized access**:

1. **Isolate system**:
   ```bash
   # Block network access immediately
   docker-compose down
   # OR
   iptables -A INPUT -p tcp --dport 3000 -j DROP
   ```

2. **Review logs**:
   ```bash
   # Check access logs
   grep "GET\|POST" logs/app-*.log

   # Check error logs
   tail -100 logs/error-*.log
   ```

3. **Rotate credentials**:
   - Change all API keys
   - Change reverse proxy passwords
   - Change database passwords

4. **Assess damage**:
   - Check database integrity
   - Verify cache files
   - Review recent metadata changes

5. **Restore from backup** (if needed):
   - See [Backup & Recovery](BACKUP_RECOVERY.md)

6. **Harden security**:
   - Apply recommendations from this guide
   - Add authentication if not present
   - Restrict network access

---

## See Also

- [Configuration Guide](../getting-started/CONFIGURATION.md) - Environment variables
- [Docker Setup](../getting-started/DOCKER.md) - Container security
- [Monitoring](MONITORING.md) - Log analysis and alerts
- [Backup & Recovery](BACKUP_RECOVERY.md) - Data protection
