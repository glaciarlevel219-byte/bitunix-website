#!/usr/bin/env bash
# Point bitunixpk.com DNS to Hostinger VPS (run after VPS health check OK).
set -euo pipefail
VPS_IP="${VPS_IP:-2.24.197.24}"
DOMAIN="${DOMAIN:-bitunixpk.com}"

echo "Adding A records: ${DOMAIN} → ${VPS_IP}"
npx vercel dns add "$DOMAIN" "@" A "$VPS_IP" || true
npx vercel dns add "$DOMAIN" "www" A "$VPS_IP" || true
echo "Done. DNS propagate: 5-30 min. Check: curl http://${VPS_IP}:5608/health"
