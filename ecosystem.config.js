/** PM2 config for Hostinger VPS — run: pm2 start ecosystem.config.js && pm2 save */
const path = require("path");
const { loadEnvFile } = require("./scripts/load-env.js");

loadEnvFile(path.join(__dirname, ".env"));

module.exports = {
  apps: [
    {
      name: "bitunix",
      script: "hostinger-server.js",
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        PORT: Number(process.env.PORT) || 5608,
        MONGODB_URI: process.env.MONGODB_URI || "",
        JWT_SECRET: process.env.JWT_SECRET || "",
        ADMIN_USERNAME: process.env.ADMIN_USERNAME || "",
        ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || "",
        ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH || "",
        SMTP_HOST: process.env.SMTP_HOST || "",
        SMTP_PORT: process.env.SMTP_PORT || "",
        SMTP_USER: process.env.SMTP_USER || "",
        SMTP_PASS: process.env.SMTP_PASS || "",
        API_ORIGIN: process.env.API_ORIGIN || "https://bitunix-website-glaciars-projects-a1c0ea7e.vercel.app",
      },
    },
  ],
};
