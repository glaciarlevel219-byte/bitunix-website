#!/usr/bin/env bash
# Bitunix VPS setup — safe when another website already runs on this server.
# Usage: curl -sSL ... | bash   OR   bash scripts/vps-setup.sh
set -euo pipefail

APP_NAME="bitunix"
APP_DIR="${APP_DIR:-/var/www/bitunix-website}"
REPO="${REPO:-https://github.com/glaciarlevel219-byte/bitunix-website.git}"
BRANCH="${BRANCH:-main}"
PORT="${PORT:-5608}"
DOMAIN="${DOMAIN:-bitunixpk.com}"

echo "=== Bitunix VPS setup ==="
echo "App dir: $APP_DIR"
echo "Port:    $PORT (purani site ko affect nahi karega)"
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js install ho raha hai..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs git nginx
fi

if ! command -v pm2 >/dev/null 2>&1; then
  echo "PM2 install ho raha hai..."
  sudo npm install -g pm2
fi

if ss -tlnp 2>/dev/null | grep -q ":${PORT} "; then
  echo "WARNING: Port $PORT busy hai. .env mein PORT=5610 set karo aur dubara chalao:"
  echo "  PORT=5610 bash scripts/vps-setup.sh"
  exit 1
fi

sudo mkdir -p "$(dirname "$APP_DIR")"

if [ -d "$APP_DIR/.git" ]; then
  echo "Repo update (git pull)..."
  git -C "$APP_DIR" fetch origin
  git -C "$APP_DIR" checkout "$BRANCH"
  git -C "$APP_DIR" pull origin "$BRANCH"
else
  echo "Repo clone..."
  sudo git clone "$REPO" "$APP_DIR"
  sudo chown -R "$USER:$USER" "$APP_DIR"
fi

cd "$APP_DIR"
npm install --omit=dev

if [ ! -f .env ]; then
  cp .env.example .env
fi

# Non-interactive: pass MONGODB_URI (and optional JWT_SECRET, ADMIN_PASSWORD) as env vars
if [ -n "${MONGODB_URI:-}" ]; then
  grep -q '^MONGODB_URI=' .env && sed -i "s|^MONGODB_URI=.*|MONGODB_URI=${MONGODB_URI}|" .env || echo "MONGODB_URI=${MONGODB_URI}" >> .env
fi
if [ -n "${JWT_SECRET:-}" ]; then
  grep -q '^JWT_SECRET=' .env && sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${JWT_SECRET}|" .env || echo "JWT_SECRET=${JWT_SECRET}" >> .env
fi
if [ -n "${ADMIN_PASSWORD:-}" ]; then
  grep -q '^ADMIN_PASSWORD=' .env && sed -i "s|^ADMIN_PASSWORD=.*|ADMIN_PASSWORD=${ADMIN_PASSWORD}|" .env || echo "ADMIN_PASSWORD=${ADMIN_PASSWORD}" >> .env
fi

if ! grep -q '^MONGODB_URI=mongodb' .env 2>/dev/null; then
  echo ""
  echo ">>> .env mein MONGODB_URI set karo (Vercel se copy):"
  echo "    nano $APP_DIR/.env"
  echo ""
  read -r -p "Press Enter jab .env save kar chuke hon..."
fi

export PORT="$PORT"
if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  pm2 restart ecosystem.config.js --update-env
else
  pm2 start ecosystem.config.js --name "$APP_NAME"
fi
pm2 save

NGINX_AVAIL="/etc/nginx/sites-available/${DOMAIN}"
NGINX_ENABLED="/etc/nginx/sites-enabled/${DOMAIN}"

if [ ! -f "$NGINX_AVAIL" ]; then
  echo "Nginx config add ho rahi hai ($DOMAIN → 127.0.0.1:$PORT)..."
  sudo cp nginx-hostinger.conf "$NGINX_AVAIL"
  if grep -q "127.0.0.1:5608" "$NGINX_AVAIL" && [ "$PORT" != "5608" ]; then
    sudo sed -i "s/127.0.0.1:5608/127.0.0.1:${PORT}/g" "$NGINX_AVAIL"
  fi
  sudo ln -sf "$NGINX_AVAIL" "$NGINX_ENABLED"
  sudo nginx -t
  sudo systemctl reload nginx
else
  echo "Nginx config pehle se hai — skip ($NGINX_AVAIL)"
fi

if command -v certbot >/dev/null 2>&1; then
  echo "SSL (certbot) — agar pehle se nahi hai:"
  echo "  sudo certbot --nginx -d ${DOMAIN} -d www.${DOMAIN}"
else
  echo "Certbot install: sudo apt install certbot python3-certbot-nginx"
fi

echo ""
curl -sf "http://127.0.0.1:${PORT}/health" && echo "" || echo "Health check fail — .env check karo (MONGODB_URI)"
echo ""
echo "=== Done ==="
echo "PM2:  pm2 list"
echo "Logs: pm2 logs $APP_NAME"
echo "DNS:  $DOMAIN A record → is VPS ka IP"
echo "Vercel se domain hatao taake conflict na ho"
