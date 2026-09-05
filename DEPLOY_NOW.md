# Deploy — Sirf 2 cheezain aap se chahiye

Main aapke VPS par **direct login nahi kar sakta** (SSH password mere paas nahi).  
Aap **2 minute** ka kaam karo — baaki script khud deploy karegi.

---

## Mujhe ye 2 cheezain bhejo / karo

### 1. `MONGODB_URI` (zaroori)

Vercel se copy karo:
- [vercel.com](https://vercel.com) → Project **bitunix-website**
- **Settings** → **Environment Variables**
- `MONGODB_URI` ki value copy karo

Chat mein bhej do (ya khud neeche command mein paste karo).

### 2. Hostinger par ek command paste karo (1 minute)

1. [hpanel.hostinger.com](https://hpanel.hostinger.com) → **VPS** → **2.24.197.24**
2. **Browser terminal** / **SSH access** kholo
3. Neeche wala **poora block** copy karke paste karo
4. `PASTE_MONGODB_URI_HERE` ki jagah apni URI lagao
5. Enter

```bash
export MONGODB_URI='PASTE_MONGODB_URI_HERE'
export JWT_SECRET='bitunix-jwt-hostinger-2026'
export ADMIN_PASSWORD='Bitunix@Admin2026!'
git clone https://github.com/glaciarlevel219-byte/bitunix-website.git /var/www/bitunix-website 2>/dev/null || true
cd /var/www/bitunix-website && git pull origin main
chmod +x scripts/*.sh
bash scripts/vps-setup.sh
sudo certbot --nginx -d bitunixpk.com -d www.bitunixpk.com --non-interactive --agree-tos -m support@bitunixpk.com || true
curl -s http://127.0.0.1:5608/health
pm2 list
```

Agar terminal output ka screenshot bhej do — main verify kar dunga.

---

## DNS (aapko khud karna — 1 minute)

Abhi DNS abhi bhi Vercel par hai. Hostinger → **bitunixpk.com** → **DNS**:

| Type | Name | Value |
|------|------|-------|
| A | @ | **2.24.197.24** |
| A | www | **2.24.197.24** |

Purane `64.29.17.x` records **delete** karo.

*(DNS Hostinger login chahiye — password chat mein mat bhejo.)*

---

## Deploy ke baad check

```bash
curl https://bitunixpk.com/health
```

Browser: https://bitunixpk.com/admin

---

## Summary

| Kaam | Kaun karega |
|------|-------------|
| Code + scripts | ✅ Ready (GitHub par) |
| VPS par install | 👉 Aap — 1 command paste |
| `MONGODB_URI` | 👉 Aap — Vercel se bhejo |
| DNS A record | 👉 Aap — Hostinger DNS |
| Vercel domain remove | ✅ Aap ne kar diya |

**Sabse kam kaam:** `MONGODB_URI` chat mein bhejo + Hostinger terminal mein upar wala block paste karo.
