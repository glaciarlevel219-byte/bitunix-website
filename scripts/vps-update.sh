#!/usr/bin/env bash
# Pull latest code and restart Bitunix (purani site safe).
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/bitunix-website}"
APP_NAME="${APP_NAME:-bitunix}"

cd "$APP_DIR"
git pull origin main
npm install --omit=dev
pm2 restart "$APP_NAME" --update-env
pm2 save

curl -sf "http://127.0.0.1:${PORT:-5608}/health" && echo "" || echo "Health check failed"
echo "Update complete."
