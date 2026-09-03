# Bitunix Deployment Guide

## Current hosting (recommended): **Hostinger**

Full guide: **[HOSTINGER_DEPLOY.md](./HOSTINGER_DEPLOY.md)**

- Start command: `node hostinger-server.js` (or `npm start`)
- Same MongoDB + API as Vercel (`api/[...route].js`)
- DNS: point `bitunixpk.com` A record to Hostinger VPS IP (remove Vercel 64.29.17.1)

---

## Legacy: Vercel (optional)

Git push + `npx vercel deploy --prod` — `vercel.json` must be valid or deploy fails.

---

## Local development

**Main Website:**
- Port: 5608
- Command: `npm start` → runs `hostinger-server.js`
- Needs `.env` with `MONGODB_URI` (copy from `.env.example`)

**Old local server (JSON files, no MongoDB):**
- Command: `npm run start:legacy` → `server.js`

**Admin Panel:** `https://yoursite.com/admin` (same server on Hostinger)

---

## Old notes (archive)

### Step 1: Deploy Admin Panel to Vercel

1. **Push admin folder to GitHub:**
```bash
cd admin
git init
git add .
git commit -m "Initial admin panel"
git push origin main
```

2. **Deploy to Vercel:**
- Go to https://vercel.com
- Import the admin GitHub repo
- Framework Preset: `Other`
- Build Command: `npm start`
- Output Directory: (leave blank)
- Click Deploy

3. **Get Admin Panel URL:**
- After deployment, Vercel gives you a URL like: `https://admin-panel-bitunix.vercel.app`
- **Save this URL** - you'll need it for the main website

### Step 2: Deploy Main Website to Vercel

1. **Push main folder to GitHub:**
```bash
cd ..
git init
git add .
git commit -m "Initial website"
git push origin main
```

2. **Deploy to Vercel:**
- Go to https://vercel.com
- Import the main GitHub repo
- Framework Preset: `Other`
- Build Command: `npm start`
- Output Directory: (leave blank)

3. **Set Environment Variables:**
In Vercel dashboard → Project Settings → Environment Variables:
```
ADMIN_PANEL_URL=https://your-admin-panel-url.vercel.app
```

### Step 3: Connect Your Hostinger Domain

1. **In Vercel:**
- Go to Project Settings → Domains
- Add your domain (e.g., `bitunix.com`)
- Vercel gives you DNS records

2. **In Hostinger:**
- Go to DNS/Domain Management
- Add the DNS records from Vercel
- Usually: A record pointing to Vercel's IP or CNAME

3. **SSL Certificate:**
- Vercel automatically provides SSL
- Your site will be HTTPS

### Step 4: Admin Panel Access

**Current Access Method:**
1. Main website: `https://bitunix.com`
2. Admin panel: `https://admin-panel-bitunix.vercel.app` (or your custom domain)

**Login Credentials:**
- Username: `admin`
- Password: `admin123`

## Important Notes

### Data Persistence
- On free Vercel tier, data resets on each deployment
- For production, consider using:
  - MongoDB Atlas (free tier)
  - Vercel Postgres (paid)
  - Or upgrade to Vercel Pro for persistent storage

### Admin Panel URL in Code
You'll need to update the admin panel URL in:
- `app.js` - for admin API calls (currently `http://127.0.0.1:5618`)
- Search for `127.0.0.1:5618` and replace with your admin URL

### CORS Configuration
The admin server already has CORS enabled, but you may need to update allowed origins in `admin-server-fixed.js`.

## Admin Panel Access from Main Website

After deployment, you can access the admin panel from the main website:

### Method 1: Hidden Link (Recommended)
1. Scroll to the **footer** of the main website
2. Look for a small **dot (.)** next to "Support" link
3. **Click rapidly 5 times** on the dot within 2 seconds
4. Admin panel will open in a new tab

### Method 2: Direct URL (Backup)
- Bookmark your admin panel URL: `https://your-admin-url.vercel.app`
- Access directly anytime

### Configure Admin URL
You can set the admin panel URL in the website:
```javascript
// In browser console on main website
localStorage.setItem('adminPanelUrl', 'https://your-admin-url.vercel.app');
```

## Post-Deployment Checklist

- [ ] Main website loads correctly
- [ ] Admin panel loads correctly
- [ ] Login works on admin panel
- [ ] Deposits show in admin panel
- [ ] Withdrawals show in admin panel
- [ ] Customer support messages work
- [ ] SSL/HTTPS working
- [ ] Admin panel access from footer works
