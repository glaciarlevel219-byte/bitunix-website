# Quick Deploy Guide - 2 Minute Setup

## 🚀 Render.com Par Deploy Karein (Recommended)

**Best option hai - Free, fast, proper server support!**

### Step 1: GitHub Par Push Karein
```bash
git add .
git commit -m "Ready for Render deployment"
git push origin main
```

### Step 2: Render.com Par Deploy

1. **https://dashboard.render.com** par jayein
2. **"New +"** → **"Web Service"** click karein
3. **GitHub repo connect karein:** `bitunix-website`
4. **Settings:**
   - **Name:** `bitunix-website`
   - **Environment:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Plan:** Free
5. **"Create Web Service"**

### Step 3: Admin Panel Deploy
1. Phir se **"New +"** → **"Web Service"**
2. **Same repo**
3. **Settings:**
   - **Name:** `bitunix-admin`
   - **Environment:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `node admin-server-fixed.js`
   - **Plan:** Free
4. **"Create Web Service"**

### Step 4: Done! 🎉
- **Website:** `https://bitunix-website.onrender.com`
- **Admin Panel:** `https://bitunix-admin.onrender.com`
- **Login:** admin / admin123

---

## ✅ Features Working:
- ✅ Admin Login
- ✅ Deposits Show
- ✅ Withdrawals Show  
- ✅ Approve/Reject Buttons
- ✅ Customer Support Messages
- ✅ All Data Proper

**5 minute mein sab kaam karega!** 🚀
