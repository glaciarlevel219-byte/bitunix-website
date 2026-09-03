/**
 * Load .env into process.env (only keys not already set).
 * Used by hostinger-server.js before API modules load.
 */
const fs = require("node:fs");
const path = require("node:path");

function loadEnvFile(envPath) {
  const file = envPath || path.join(__dirname, "..", ".env");
  if (!fs.existsSync(file)) return false;

  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
  return true;
}

module.exports = { loadEnvFile };
