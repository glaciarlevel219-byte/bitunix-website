# Bitunix — Hostinger Deployment Guide

Site ab **Hostinger** par chalani hai (Vercel ki jagah).

---

## Zaroori cheezain

1. **Hostinger VPS** ya **Business/Cloud hosting** jisme **Node.js** ho  
   (Sirf basic PHP shared hosting par full site nahi chalegi — MongoDB + API chahiye)

2. **MongoDB URI** — Vercel dashboard se copy karo:  
   Project → Settings → Environment Variables → `MONGODB_URI`

3. Domain **bitunixpk.com** DNS → VPS IP **`2.24.197.24`** (abhi Vercel par hai — change karna zaroori)

**Quick guide (is IP ke liye):** [VPS_DEPLOY_2.24.197.24.md](./VPS_DEPLOY_2.24.197.24.md)

---

## Option A: Hostinger VPS (recommended)

### One command (SSH par — purani site safe)

```bash
ssh root@2.24.197.24
git clone https://github.com/glaciarlevel219-byte/bitunix-website.git /var/www/bitunix-website
cd /var/www/bitunix-website
chmod +x scripts/*.sh
bash scripts/vps-setup.sh
```

Script `.env` banata hai, PM2 start karta hai, nginx add karta hai — **dusri website ko touch nahi karta**.

Baad mein code update:
```bash
cd /var/www/bitunix-website && bash scripts/vps-update.sh
```

---

### Same VPS par pehle se website hai? (Multi-site)

**Koi masla nahi** — ek VPS par **multiple websites** chal sakti hain.

| Website | Domain | Node port | Nginx file |
|---------|--------|-----------|------------|
| Purani site | `otherdomain.com` | e.g. `5600` | pehle se configured — **mat chhedo** |
| **Bitunix** | `bitunixpk.com` | **`5608`** | naya file add karo |

**Steps (purani site safe rehti hai):**

1. Bitunix alag folder mein clone karo — purani site ke folder ko mat overwrite karo:
   ```bash
   cd /var/www
   git clone https://github.com/glaciarlevel219-byte/bitunix-website.git bitunix-website
   cd bitunix-website
   npm install
   cp .env.example .env && nano .env
   ```

2. PM2 par **alag process** (dusri site chalti rahegi):
   ```bash
   pm2 start ecosystem.config.js --name bitunix
   pm2 save
   pm2 list   # dono apps dikhengi
   ```

3. Nginx mein **sirf naya config add** karo — purani `.conf` file edit mat karo:
   ```bash
   sudo cp nginx-hostinger.conf /etc/nginx/sites-available/bitunixpk.com
   sudo ln -sf /etc/nginx/sites-available/bitunixpk.com /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   sudo certbot --nginx -d bitunixpk.com -d www.bitunixpk.com
   ```

4. DNS: sirf **bitunixpk.com** ka A record VPS IP par point karo.  
   Purani website ka domain apne IP/DNS par hi rahega.

5. Vercel se **bitunixpk.com domain hatao**, taake conflict na ho.

**Port clash check:** agar `5608` busy ho:
   ```bash
   ss -tlnp | grep 5608
   ```
   `.env` mein `PORT=5610` set karo aur `nginx-hostinger.conf` mein bhi `5610` likho.

---

### 1. SSH se server par login (fresh VPS)

```bash
ssh root@2.24.197.24
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
| A    | @    | 2.24.197.24  |
| A    | www  | 2.24.197.24  |

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
