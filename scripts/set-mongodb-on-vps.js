#!/usr/bin/env node
/**
 * One-time: set real MONGODB_URI on Hostinger VPS .env and restart PM2.
 * Usage: node scripts/set-mongodb-on-vps.js "mongodb+srv://..."
 */
const { execSync } = require("node:child_process");

const uri = process.argv[2];
const host = process.env.VPS_HOST || "2.24.197.24";
const user = process.env.VPS_USER || "root";
const pass = process.env.VPS_PASS;

if (!uri || !uri.startsWith("mongodb")) {
  console.error("Usage: VPS_PASS=... node scripts/set-mongodb-on-vps.js \"mongodb+srv://...\"");
  process.exit(1);
}
if (!pass) {
  console.error("Set VPS_PASS environment variable.");
  process.exit(1);
}

const escaped = uri.replace(/'/g, "'\\''");
const cmd = [
  `sed -i '/^MONGODB_URI=/d' /var/www/bitunix-website/.env`,
  `echo 'MONGODB_URI=${escaped}' >> /var/www/bitunix-website/.env`,
  `sed -i '/^API_ORIGIN=/d' /var/www/bitunix-website/.env`,
  `cd /var/www/bitunix-website && pm2 restart bitunix --update-env`,
  `sleep 2`,
  `curl -sf http://127.0.0.1:5608/admin/api/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"YourSecureAdminPassword123!"}' | head -c 80`,
].join(" && ");

try {
  execSync(
    `ssh -o StrictHostKeyChecking=no ${user}@${host} ${JSON.stringify(cmd)}`,
    {
      env: { ...process.env, SSHPASS: pass },
      stdio: "inherit",
      shell: true,
    }
  );
  console.log("\nDone — users should appear in admin after MongoDB connects.");
} catch (e) {
  process.exit(1);
}
