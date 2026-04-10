#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  deploy.sh  –  SaFi Njema Backend Deployment Script
#  Ubuntu 22.04 / 24.04 · Node.js + PM2 + Nginx + SSL
#  Usage:  chmod +x deploy.sh && sudo ./deploy.sh
# ═══════════════════════════════════════════════════════════════

set -e
DOMAIN="safinjema.co.za"
APP_DIR="/var/www/safinjema"
NODE_VERSION="20"
PM2_APP_NAME="safinjema-api"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   🌿  SaFi Njema – Deployment Script         ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ── 1. Update system ──
echo "▶  Updating system packages..."
apt-get update -qq && apt-get upgrade -y -qq

# ── 2. Install Node.js ──
echo "▶  Installing Node.js ${NODE_VERSION}..."
if ! command -v node &>/dev/null; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | bash -
  apt-get install -y nodejs
fi
echo "   Node: $(node -v)  NPM: $(npm -v)"

# ── 3. Install PM2 ──
echo "▶  Installing PM2..."
npm install -g pm2 --quiet

# ── 4. Install Nginx ──
echo "▶  Installing Nginx..."
apt-get install -y nginx certbot python3-certbot-nginx -qq

# ── 5. App directory ──
echo "▶  Setting up app directory..."
mkdir -p "$APP_DIR"
cp -r . "$APP_DIR/"
cd "$APP_DIR"

# ── 6. Install npm deps ──
echo "▶  Installing npm dependencies..."
npm ci --omit=dev

# ── 7. .env check ──
if [ ! -f .env ]; then
  echo ""
  echo "⚠️   No .env file found!"
  echo "    Copy .env.example → .env and fill in your values:"
  echo "    cp .env.example .env && nano .env"
  echo ""
  echo "    Minimum required:"
  echo "      JWT_SECRET=<random 64-char string>"
  echo "      SMTP_USER=safinjema@outlook.com"
  echo "      SMTP_PASS=<your email password>"
  echo ""
  read -p "    Press Enter once .env is ready..." _
fi

# ── 8. Start with PM2 ──
echo "▶  Starting app with PM2..."
pm2 delete "$PM2_APP_NAME" 2>/dev/null || true
pm2 start server.js --name "$PM2_APP_NAME" --env production
pm2 save
pm2 startup systemd -u root --hp /root | bash || true

# ── 9. Nginx config ──
echo "▶  Configuring Nginx..."
cat > "/etc/nginx/sites-available/${DOMAIN}" << NGINX
server {
    listen 80;
    server_name ${DOMAIN} www.${DOMAIN};

    # Security headers
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Frontend static files
    root ${APP_DIR}/public;
    index index.html;

    # API proxy to Node.js
    location /api {
        proxy_pass         http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 60s;
        client_max_body_size 10m;
    }

    # Static assets caching
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|woff2|webp|svg)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # SPA fallback for HTML pages
    location / {
        try_files \$uri \$uri/ \$uri.html /index.html;
    }

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_types text/plain text/css text/javascript application/json application/javascript;
}
NGINX

ln -sf "/etc/nginx/sites-available/${DOMAIN}" "/etc/nginx/sites-enabled/"
nginx -t && systemctl reload nginx

# ── 10. SSL with Certbot ──
echo "▶  Setting up SSL certificate..."
certbot --nginx -d "$DOMAIN" -d "www.${DOMAIN}" --non-interactive --agree-tos \
  --email "$(grep SMTP_USER .env | cut -d= -f2)" --redirect 2>/dev/null || \
  echo "⚠️   SSL setup skipped (run manually: certbot --nginx -d ${DOMAIN})"

# ── Done ──
echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   ✅  Deployment Complete!                   ║"
echo "╠══════════════════════════════════════════════╣"
echo "║   🌐  https://${DOMAIN}"
echo "║   📡  API:   https://${DOMAIN}/api"
echo "║   👑  Admin: https://${DOMAIN}/admin.html"
echo "╠══════════════════════════════════════════════╣"
echo "║   PM2 status: pm2 status                    ║"
echo "║   PM2 logs:   pm2 logs safinjema-api         ║"
echo "║   Restart:    pm2 restart safinjema-api      ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
