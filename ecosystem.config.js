/** PM2 config for Hostinger VPS — run: pm2 start ecosystem.config.js && pm2 save */
module.exports = {
  apps: [
    {
      name: "bitunix",
      script: "hostinger-server.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        PORT: 5608,
      },
      // VPS par pehle se website ho to alag naam + port use karo:
      // pm2 start ecosystem.config.js --name bitunix
    },
  ],
};
