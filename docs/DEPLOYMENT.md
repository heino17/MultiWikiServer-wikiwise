# MWS Deployment Guide

## Overview

This guide covers deploying MultiWikiServer (MWS) in production environments, including setup, configuration, monitoring, and maintenance procedures.

> **⚠️ Important**: MWS is still in development and not recommended for production use with sensitive data.

## Deployment Options

### 1. Standalone Server

Direct deployment on a server or VPS.

**Pros:**
- Full control over environment
- Direct access to logs and files
- Simple backup procedures

**Cons:**
- Manual server management
- No automatic scaling
- Manual SSL certificate management

### 2. Container Deployment

Deploy using Docker containers.

**Pros:**
- Consistent environments
- Easy scaling and orchestration
- Simplified dependency management

**Cons:**
- Container overhead
- More complex networking
- Volume management complexity

### 3. Cloud Platform Deployment

Deploy on cloud platforms (AWS, Google Cloud, Azure, etc.).

**Pros:**
- Managed infrastructure
- Auto-scaling capabilities
- Integrated monitoring and backups

**Cons:**
- Vendor lock-in
- Potentially higher costs
- Learning curve for platform-specific features

## Prerequisites

### System Requirements

**Minimum:**
- CPU: 1 core
- RAM: 512MB
- Storage: 5GB
- OS: Linux, macOS, or Windows

**Recommended:**
- CPU: 2+ cores
- RAM: 2GB+
- Storage: 20GB+ SSD
- OS: Ubuntu 20.04+ or similar

### Software Dependencies

- **Node.js**: Version 18 or higher
- **npm**: Comes with Node.js
- **Git**: For code deployment
- **Process Manager**: PM2, systemd, or similar
- **Reverse Proxy**: nginx, Apache, or Cloudflare
- **SSL Certificates**: Let's Encrypt or commercial

## Standalone Server Deployment

### 1. Server Setup

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install Node.js (using NodeSource repository)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install additional tools
sudo apt install -y git nginx certbot python3-certbot-nginx

# Create application user
sudo adduser --system --home /opt/mws --shell /bin/bash mws
sudo mkdir -p /opt/mws
sudo chown mws:mws /opt/mws
```

### 2. Application Deployment

```bash
# Switch to application user
sudo -u mws bash

# Navigate to application directory
cd /opt/mws

# Clone repository
git clone https://github.com/TiddlyWiki/MultiWikiServer.git app
cd app

# Install dependencies
npm ci --production

# Build application
npm run build

# Create production configuration
cp mws.run.mjs mws.prod.mjs
```

### 3. Production Configuration

Create `mws.prod.mjs`:

```javascript
#!/usr/bin/env node
import startServer from "./dist/mws.js";

startServer({
  // Production configuration
  wikiPath: "/opt/mws/data",
  listeners: [{
    port: 3000,
    host: "127.0.0.1", // Only bind to localhost
    prefix: "",
  }],
  // Add other production settings
}).catch(console.error);
```

### 4. Environment Configuration

Create `/opt/mws/.env`:

```bash
NODE_ENV=production
DATABASE_URL=file:/opt/mws/data/store/database.sqlite
PORT=3000
HOST=127.0.0.1

# Security settings
SESSION_SECRET=your-very-long-random-session-secret
COOKIE_SECURE=true
COOKIE_SAME_SITE=strict

# Logging
LOG_LEVEL=info
LOG_FILE=/opt/mws/logs/mws.log

# Optional: External database
# DATABASE_URL=postgresql://user:pass@localhost:5432/mws
```

### 5. Directory Structure

```bash
# Create necessary directories
sudo -u mws mkdir -p /opt/mws/{data,logs,backups}

# Set proper permissions
sudo chown -R mws:mws /opt/mws
sudo chmod 755 /opt/mws
sudo chmod 700 /opt/mws/data
```

## Process Management

### Using PM2

```bash
# Install PM2 globally
sudo npm install -g pm2

# Create ecosystem file
sudo -u mws cat > /opt/mws/ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'mws',
    script: './mws.prod.mjs',
    cwd: '/opt/mws/app',
    user: 'mws',
    env: {
      NODE_ENV: 'production'
    },
    error_file: '/opt/mws/logs/error.log',
    out_file: '/opt/mws/logs/out.log',
    log_file: '/opt/mws/logs/combined.log',
    time: true,
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    max_memory_restart: '1G',
    restart_delay: 4000
  }]
};
EOF

# Start application
sudo -u mws pm2 start /opt/mws/ecosystem.config.js

# Save PM2 configuration
sudo -u mws pm2 save

# Generate startup script
sudo pm2 startup systemd -u mws --hp /opt/mws
```

### Using systemd

Create `/etc/systemd/system/mws.service`:

```ini
[Unit]
Description=MultiWikiServer
Documentation=https://github.com/TiddlyWiki/MultiWikiServer
After=network.target

[Service]
Type=simple
User=mws
WorkingDirectory=/opt/mws/app
Environment=NODE_ENV=production
EnvironmentFile=/opt/mws/.env
ExecStart=/usr/bin/node mws.prod.mjs
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

# Security settings
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/mws/data /opt/mws/logs

[Install]
WantedBy=multi-user.target
```

```bash
# Enable and start service
sudo systemctl enable mws
sudo systemctl start mws

# Check status
sudo systemctl status mws
```

## Reverse Proxy Configuration

### nginx Configuration

Create `/etc/nginx/sites-available/mws`:

```nginx
upstream mws_backend {
    server 127.0.0.1:3000;
    keepalive 32;
}

server {
    listen 80;
    server_name your-domain.com;
    
    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Referrer-Policy "strict-origin-when-cross-origin";

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/javascript
        application/xml+rss
        application/json;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=login:10m rate=1r/s;

    # Main application
    location / {
        proxy_pass http://mws_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;

        # Security
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Server $host;
    }

    # API rate limiting
    location /api/ {
        limit_req zone=api burst=20 nodelay;
        proxy_pass http://mws_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Login endpoint with stricter rate limiting
    location /api/auth/login {
        limit_req zone=login burst=5 nodelay;
        proxy_pass http://mws_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Static assets caching
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        proxy_pass http://mws_backend;
        proxy_cache_valid 200 302 1h;
        proxy_cache_valid 404 1m;
        add_header Cache-Control "public, immutable";
        expires 1y;
    }

    # Health check endpoint
    location /health {
        proxy_pass http://mws_backend;
        access_log off;
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/mws /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### SSL Certificate Setup

```bash
# Install SSL certificate with Certbot
sudo certbot --nginx -d your-domain.com

# Test automatic renewal
sudo certbot renew --dry-run

# Set up automatic renewal
echo "0 12 * * * /usr/bin/certbot renew --quiet" | sudo crontab -
```

## Container Deployment

### Dockerfile

Create `Dockerfile`:

```dockerfile
# Multi-stage build
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY packages/*/package.json ./packages/*/

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Build application
RUN npm run build

# Production image
FROM node:18-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create app user
RUN addgroup -g 1001 -S mws && \
    adduser -S mws -u 1001

# Create directories
RUN mkdir -p /app /data /logs && \
    chown -R mws:mws /app /data /logs

# Set working directory
WORKDIR /app

# Copy built application
COPY --from=builder --chown=mws:mws /app/dist ./dist
COPY --from=builder --chown=mws:mws /app/node_modules ./node_modules
COPY --from=builder --chown=mws:mws /app/package.json ./
COPY --from=builder --chown=mws:mws /app/mws.run.mjs ./

# Switch to non-root user
USER mws

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "const http = require('http'); \
    const req = http.request({hostname: 'localhost', port: 3000, path: '/health'}, \
    (res) => process.exit(res.statusCode === 200 ? 0 : 1)); \
    req.on('error', () => process.exit(1)); req.end();"

# Set environment
ENV NODE_ENV=production
ENV DATA_PATH=/data
ENV LOG_PATH=/logs

# Start application
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "mws.run.mjs"]
```

### Docker Compose

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  mws:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=file:/data/store/database.sqlite
    volumes:
      - mws_data:/data
      - mws_logs:/logs
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3000/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/ssl/certs:ro
      - mws_logs:/var/log/nginx
    depends_on:
      - mws
    restart: unless-stopped

volumes:
  mws_data:
    driver: local
  mws_logs:
    driver: local

networks:
  default:
    driver: bridge
```

### Container Deployment Commands

```bash
# Build and start services
docker-compose up -d

# View logs
docker-compose logs -f mws

# Update application
docker-compose pull
docker-compose up -d

# Backup data
docker run --rm -v mws_mws_data:/data -v $(pwd):/backup alpine tar czf /backup/mws-data-$(date +%Y%m%d).tar.gz /data

# Restore data
docker run --rm -v mws_mws_data:/data -v $(pwd):/backup alpine tar xzf /backup/mws-data-20231201.tar.gz -C /
```

## Database Configuration

### SQLite (Default)

SQLite is the default database and requires minimal configuration:

```javascript
// Configuration for production SQLite
{
  database: {
    url: "file:/opt/mws/data/store/database.sqlite",
    pool: {
      min: 1,
      max: 1 // SQLite doesn't support multiple connections
    }
  }
}
```

**SQLite Optimization:**

```sql
-- Add to database initialization
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = 10000;
PRAGMA temp_store = MEMORY;
PRAGMA mmap_size = 268435456; -- 256MB
```

### PostgreSQL (Recommended for Production)

For higher load and concurrent users:

```bash
# Install PostgreSQL
sudo apt install postgresql postgresql-contrib

# Create database and user
sudo -u postgres psql
CREATE USER mws WITH PASSWORD 'secure_password';
CREATE DATABASE mws OWNER mws;
GRANT ALL PRIVILEGES ON DATABASE mws TO mws;
\q
```

Update configuration:

```javascript
{
  database: {
    url: "postgresql://mws:secure_password@localhost:5432/mws",
    pool: {
      min: 2,
      max: 10
    }
  }
}
```

## Monitoring and Logging

### Application Monitoring

#### Health Checks

Create health check endpoint:

```javascript
// Add to your route configuration
router.get('/health', (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    // Add database health check
    database: 'connected' // Check actual database connection
  };
  
  res.json(health);
});
```

#### Performance Monitoring

```bash
# Install monitoring tools
npm install --save prom-client
```

```javascript
// Add Prometheus metrics
const promClient = require('prom-client');

const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code']
});

const httpRequestTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code']
});

// Register metrics endpoint
router.get('/metrics', (req, res) => {
  res.set('Content-Type', promClient.register.contentType);
  res.end(promClient.register.metrics());
});
```

### Log Management

#### Structured Logging

```javascript
const winston = require('winston');

const logger = winston.createLogger({
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ 
      filename: '/opt/mws/logs/error.log', 
      level: 'error' 
    }),
    new winston.transports.File({ 
      filename: '/opt/mws/logs/combined.log' 
    })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}
```

#### Log Rotation

```bash
# Install logrotate configuration
sudo cat > /etc/logrotate.d/mws << 'EOF'
/opt/mws/logs/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    copytruncate
    su mws mws
}
EOF
```

## Backup and Recovery

### Automated Backup Script

Create `/opt/mws/scripts/backup.sh`:

```bash
#!/bin/bash

BACKUP_DIR="/opt/mws/backups"
DATA_DIR="/opt/mws/data"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="mws_backup_${DATE}.tar.gz"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Stop application for consistent backup
sudo systemctl stop mws

# Create backup
tar czf "$BACKUP_DIR/$BACKUP_FILE" \
    -C /opt/mws \
    data \
    .env \
    app/mws.prod.mjs

# Start application
sudo systemctl start mws

# Remove old backups (keep 30 days)
find "$BACKUP_DIR" -name "mws_backup_*.tar.gz" -mtime +30 -delete

# Log backup completion
echo "$(date): Backup completed: $BACKUP_FILE" >> /opt/mws/logs/backup.log

# Optional: Upload to remote storage
# aws s3 cp "$BACKUP_DIR/$BACKUP_FILE" s3://your-backup-bucket/
```

### Database-Specific Backups

#### SQLite Backup

```bash
#!/bin/bash
sqlite3 /opt/mws/data/store/database.sqlite ".backup /opt/mws/backups/database_$(date +%Y%m%d_%H%M%S).sqlite"
```

#### PostgreSQL Backup

```bash
#!/bin/bash
pg_dump -h localhost -U mws -f /opt/mws/backups/database_$(date +%Y%m%d_%H%M%S).sql mws
```

### Backup Automation

```bash
# Add to crontab
sudo -u mws crontab -e

# Add these lines:
# Daily backup at 2 AM
0 2 * * * /opt/mws/scripts/backup.sh

# Weekly full backup
0 1 * * 0 /opt/mws/scripts/full_backup.sh
```

## Security Considerations

### Server Security

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Configure firewall
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable

# Disable root login
sudo sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
sudo systemctl reload sshd

# Install fail2ban
sudo apt install fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

### Application Security

#### Environment Variables

```bash
# Secure .env file
sudo chmod 600 /opt/mws/.env
sudo chown mws:mws /opt/mws/.env
```

#### SSL/TLS Configuration

```nginx
# Strong SSL configuration in nginx
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512;
ssl_prefer_server_ciphers off;
ssl_dhparam /etc/nginx/dhparam.pem;

# HSTS header
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
```

#### Rate Limiting

Implement application-level rate limiting:

```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', limiter);
```

## Performance Optimization

### Server-Level Optimization

```bash
# Increase file descriptor limits
echo "mws soft nofile 65536" | sudo tee -a /etc/security/limits.conf
echo "mws hard nofile 65536" | sudo tee -a /etc/security/limits.conf

# Optimize kernel parameters
sudo tee -a /etc/sysctl.conf << 'EOF'
net.core.somaxconn = 1024
net.core.netdev_max_backlog = 5000
net.core.rmem_default = 262144
net.core.rmem_max = 16777216
net.core.wmem_default = 262144
net.core.wmem_max = 16777216
EOF

sudo sysctl -p
```

### Application-Level Optimization

#### Caching

```javascript
// Redis caching
const redis = require('redis');
const client = redis.createClient();

const cache = {
  async get(key) {
    return await client.get(key);
  },
  
  async set(key, value, ttl = 3600) {
    return await client.setex(key, ttl, JSON.stringify(value));
  }
};
```

#### Connection Pooling

```javascript
// Database connection pooling
const config = {
  database: {
    pool: {
      min: 2,
      max: 20,
      acquire: 30000,
      idle: 10000
    }
  }
};
```

## Troubleshooting

### Common Issues

#### Service Won't Start

```bash
# Check logs
sudo journalctl -u mws -f

# Check process
sudo ps aux | grep mws

# Check ports
sudo netstat -tlnp | grep :3000
```

#### Database Connection Issues

```bash
# Check database file permissions
ls -la /opt/mws/data/store/

# Check database connectivity
sqlite3 /opt/mws/data/store/database.sqlite "SELECT COUNT(*) FROM users;"
```

#### High Memory Usage

```bash
# Monitor memory usage
top -p $(pgrep -f mws)

# Check for memory leaks
node --inspect mws.prod.mjs
```

### Emergency Procedures

#### Service Recovery

```bash
# Quick restart
sudo systemctl restart mws

# Restore from backup
sudo systemctl stop mws
sudo rm -rf /opt/mws/data
sudo tar xzf /opt/mws/backups/mws_backup_latest.tar.gz -C /opt/mws
sudo chown -R mws:mws /opt/mws/data
sudo systemctl start mws
```

#### Database Recovery

```bash
# SQLite recovery
sqlite3 /opt/mws/data/store/database.sqlite ".recover" > recovered.sql
sqlite3 /opt/mws/data/store/database_new.sqlite < recovered.sql
```

This deployment guide provides a comprehensive foundation for running MWS in production environments. Remember to adapt configurations to your specific needs and always test deployments in staging environments first.
