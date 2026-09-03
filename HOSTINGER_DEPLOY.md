# Bitunix — Hostinger Deployment Guide

Site ab **Hostinger** par chalani hai (Vercel ki jagah).

---

## Zaroori cheezain

1. **Hostinger VPS** ya **Business/Cloud hosting** jisme **Node.js** ho  
   (Sirf basic PHP shared hosting par full site nahi chalegi — MongoDB + API chahiye)

2. **MongoDB URI** — Vercel dashboard se copy karo:  
   Project → Settings → Environment Variables → `MONGODB_URI`

3. Domain **bitunixpk.com** DNS Hostinger ki taraf point karni hogi

---

## Option A: Hostinger VPS (recommended)

### 1. SSH se server par login

```bash
ssh root@YOUR_VPS_IP
```

### 2. Node.js install (agar nahi hai)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git nginx
sudo npm install -g pm2
```

### 3. Code upload

```bash
cd /var/www
git clone https://github.com/glaciarlevel219-byte/bitunix-website.git
cd bitunix-website
npm install
```

### 4. Environment file

```bash
cp .env.example .env
nano .env
```

Vercel se ye values copy karo: `MONGODB_URI`, `JWT_SECRET`, `SMTP_*`, `ADMIN_PASSWORD`

### 5. Start with PM2

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### 6. Nginx

```bash
sudo cp nginx-hostinger.conf /etc/nginx/sites-available/bitunixpk.com
sudo ln -sf /etc/nginx/sites-available/bitunixpk.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d bitunixpk.com -d www.bitunixpk.com
```

### 7. DNS (Hostinger hPanel)

Domain → **DNS / Nameservers** → **A record**:

| Type | Name | Value        |
|------|------|--------------|
| A    | @    | YOUR_VPS_IP  |
| A    | www  | YOUR_VPS_IP  |

**Purani Vercel A record (64.29.17.1) delete karo.**

---

## Option B: Hostinger hPanel Node.js Web App

1. hPanel → **Websites** → **Add Website** → **Node.js Apps**
2. GitHub repo connect: `glaciarlevel219-byte/bitunix-website`
3. **Build command:** `npm install`
4. **Start command:** `node hostinger-server.js`
5. **Environment variables:** `.env.example` ki tarah sab add karo
6. Deploy click karo
7. Domain **bitunixpk.com** is app se connect karo
8. Vercel DNS hatao

---

## Verify

```bash
curl https://bitunixpk.com/health
# {"ok":true,"host":"hostinger",...}

curl https://bitunixpk.com/admin
# Admin login page with btn-send-chat, Force Clear buttons
```

---

## Vercel band karna

1. Vercel → Project **bitunix-website** → Settings → Domains → **bitunixpk.com remove**
2. DNS Hostinger par point (upar wale steps)
3. (Optional) Vercel project delete — taake galat deploy na ho

---

## Local test (Hostinger server)

```bash
cp .env.example .env
# .env edit karo
npm start
# Opens http://localhost:5608
```

---

## Support

- MongoDB data wahi rahega (Atlas same URI)
- Admin: `https://bitunixpk.com/admin`
- API: `https://bitunixpk.com/api/...`
