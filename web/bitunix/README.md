# Bitunix — Crypto Trading Platform

A full-featured cryptocurrency trading web application with live market data, charting, user authentication, deposit/withdrawal, C2C trading, and lock-up mining.

## Project Structure

```
bitunix/
├── src/
│   ├── public/                 # Frontend (served as static files)
│   │   ├── index.html          # Main HTML page
│   │   ├── styles.css          # All CSS styles
│   │   ├── app.js              # Frontend JavaScript
│   │   └── assets/             # Images and uploads
│   │       ├── uploads/        # Uploaded images
│   │       └── shadow-grey.png
│   ├── server/                 # Backend
│   │   └── server.js           # Node.js HTTP server + API routes
│   └── data/                   # Data storage
│       ├── users.json          # Registered users
│       └── fallback/           # API fallback data (offline mode)
│           ├── config.json
│           ├── country.json
│           ├── currency.json
│           └── news.json
├── package.json                # Node.js project config
├── .env                        # Environment variables (not in git)
├── .gitignore                  # Git ignore rules
├── ecosystem.config.js         # PM2 production config
├── nginx.conf                  # Nginx reverse proxy template
└── README.md                   # This file
```

## Quick Start (Local)

```bash
# 1. Navigate to project
cd bitunix

# 2. Start the server (no npm install needed — zero dependencies!)
npm start

# 3. Open in browser
# http://localhost:5600
```

## Deploy to Production (VPS)

### 1. Upload to server
```bash
scp -r ./bitunix root@YOUR_VPS_IP:/var/www/bitunix
```

### 2. Install Node.js on server
```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 3. Install PM2 and start
```bash
sudo npm install -g pm2
cd /var/www/bitunix

# Edit ecosystem.config.js — change JWT_SECRET!
pm2 start ecosystem.config.js
pm2 startup
pm2 save
```

### 4. Setup Nginx
```bash
sudo apt install nginx -y
sudo cp nginx.conf /etc/nginx/sites-available/bitunix
# Edit the file: replace "yourdomain.com" with your actual domain
sudo ln -s /etc/nginx/sites-available/bitunix /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 5. Add SSL (HTTPS)
```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

### 6. Point your domain
Add these DNS records at your domain registrar:
- **A record**: `@` → `YOUR_VPS_IP`
- **A record**: `www` → `YOUR_VPS_IP`

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HOST` | `0.0.0.0` | Server bind address |
| `PORT` | `5600` | Server port |
| `JWT_SECRET` | `local-dev-secret` | **Change for production!** |

## Features

- 📊 Live crypto market data (Binance + CoinGecko fallback)
- 📈 Interactive candlestick charts (Lightweight Charts)
- 🔐 User authentication (register/login with JWT)
- 💰 Deposit & Withdrawal simulation
- 🤝 C2C peer-to-peer trading
- ⛏️ Lock-up mining products
- 🌍 230+ country calling codes
- 📱 Fully responsive (mobile + desktop)
