// PM2 Process Manager Configuration
// Usage: pm2 start ecosystem.config.js
// Docs:  https://pm2.keymetrics.io/docs/usage/application-declaration/

module.exports = {
  apps: [
    {
      name: "bitunix",
      script: "src/server/server.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "256M",
      env: {
        NODE_ENV: "production",
        HOST: "127.0.0.1",     // behind Nginx reverse proxy
        PORT: 5600,
        JWT_SECRET: "CHANGE_ME_TO_A_RANDOM_64_CHAR_STRING",
      },
    },
  ],
};
