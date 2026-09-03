# Bitunix — VPS Deploy (IP: 2.24.197.24)

Purani website safe rahegi. Sirf Bitunix alag folder + port par chalegi.

---

## Step 1: SSH login

```bash
ssh root@2.24.197.24
```

(Password Hostinger VPS panel se — hPanel → VPS → SSH access)

---

## Step 2: Setup (copy-paste poora block)

```bash
git clone https://github.com/glaciarlevel219-byte/bitunix-website.git /var/www/bitunix-website
cd /var/www/bitunix-website
chmod +x scripts/*.sh
bash scripts/vps-setup.sh
```

Jab script `.env` banaye, **nano** se ye values bhari hain (Vercel → Settings → Environment Variables se copy):

```bash
nano /var/www/bitunix-website/.env
```

Zaroori:
- `MONGODB_URI=...`
- `JWT_SECRET=...`
- `ADMIN_USERNAME=admin`
- `ADMIN_PASSWORD=Bitunix@Admin2026!` (ya apna password)

Save: `Ctrl+O`, Enter, `Ctrl+X`

Phir dubara:
```bash
cd /var/www/bitunix-website
pm2 restart bitunix --update-env
pm2 save
```

---

## Step 3: Check server par

```bash
curl http://127.0.0.1:5608/health
pm2 list
```

Expected: `{"ok":true,"host":"hostinger",...}`

---

## Step 4: DNS (Hostinger hPanel)

Domain **bitunixpk.com** → DNS Zone:

| Type | Name | Value | Action |
|------|------|-------|--------|
| A | @ | **2.24.197.24** | Add/Update |
| A | www | **2.24.197.24** | Add/Update |

**Delete / remove purane records:**
- `64.29.17.1` (Vercel)
- `216.198.79.1` (purana)

DNS 5–30 minute lag sakta hai.

---

## Step 5: SSL

```bash
sudo certbot --nginx -d bitunixpk.com -d www.bitunixpk.com
```

---

## Step 6: Vercel se domain hatao

Vercel → Project **bitunix-website** → Settings → Domains → **Remove bitunixpk.com**

---

## Verify (apne PC se)

```bash
curl https://bitunixpk.com/health
```

Browser:
- https://bitunixpk.com
- https://bitunixpk.com/admin

---

## Baad mein code update

```bash
ssh root@2.24.197.24
cd /var/www/bitunix-website && bash scripts/vps-update.sh
```

---

## Agar port 5608 busy ho

```bash
ss -tlnp | grep 5608
PORT=5610 bash scripts/vps-setup.sh
```

---

## Purani website

| | Purani site | Bitunix |
|---|-------------|---------|
| Folder | jo pehle hai | `/var/www/bitunix-website` |
| PM2 | purani app | `bitunix` |
| Port | apna | `5608` |
| Domain | apna | `bitunixpk.com` |

Purani nginx config **mat edit karo**.
