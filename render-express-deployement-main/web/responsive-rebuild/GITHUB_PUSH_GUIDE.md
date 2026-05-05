# GitHub Push Guide - Bitunix Website

## ⚠️ Important: Two Separate Repositories

You need to create **TWO** GitHub repositories:
1. **Main Website** - Frontend + API
2. **Admin Panel** - Admin dashboard

---

## Step 1: Push Main Website to GitHub

### 1.1 Create GitHub Repository
1. Go to https://github.com
2. Click "New Repository"
3. Name: `bitunix-website`
4. Make it **Public** or **Private**
5. Click "Create Repository"

### 1.2 Initialize Git and Push

**Open Terminal/CMD in the main folder:**

```bash
# Navigate to the project folder
cd "d:\applications\render-express-deployement-main\render-express-deployement-main\web\responsive-rebuild"

# Initialize git
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit - Bitunix website with admin access"

# Add remote (replace with your GitHub URL)
git remote add origin https://github.com/YOUR_USERNAME/bitunix-website.git

# Push to GitHub
git branch -M main
git push -u origin main
```

---

## Step 2: Push Admin Panel to GitHub

### 2.1 Create GitHub Repository
1. Go to https://github.com
2. Click "New Repository"
3. Name: `bitunix-admin`
4. Make it **Public** or **Private**
5. Click "Create Repository"

### 2.2 Initialize Git and Push

**Open Terminal/CMD:**

```bash
# Navigate to admin folder
cd "d:\applications\render-express-deployement-main\render-express-deployement-main\web\responsive-rebuild\admin"

# Initialize git
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit - Bitunix admin panel"

# Add remote (replace with your GitHub URL)
git remote add origin https://github.com/YOUR_USERNAME/bitunix-admin.git

# Push to GitHub
git branch -M main
git push -u origin main
```

---

## Alternative: Single Repository (Easier)

If you want everything in one repo:

```bash
# Navigate to main folder
cd "d:\applications\render-express-deployement-main\render-express-deployement-main\web\responsive-rebuild"

# Initialize git
git init

# Add all files (including admin folder)
git add .

# Commit
git commit -m "Initial commit - Bitunix website with admin panel"

# Add remote
git remote add origin https://github.com/YOUR_USERNAME/bitunix.git

# Push
git branch -M main
git push -u origin main
```

Then in Vercel, set the **Root Directory** to `admin` for admin deployment.

---

## Quick Commands Summary

### For Main Website:
```bash
cd "d:\applications\render-express-deployement-main\render-express-deployement-main\web\responsive-rebuild"
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/bitunix-website.git
git push -u origin main
```

### For Admin Panel:
```bash
cd "d:\applications\render-express-deployement-main\render-express-deployement-main\web\responsive-rebuild\admin"
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/bitunix-admin.git
git push -u origin main
```

---

## Troubleshooting

### If "git" is not recognized:
Install Git from: https://git-scm.com/download/win

### If you get "remote already exists":
```bash
git remote remove origin
git remote add origin https://github.com/YOUR_USERNAME/REPO_NAME.git
```

### If push is rejected:
```bash
git pull origin main --rebase
git push origin main
```

### If you need to update code later:
```bash
git add .
git commit -m "Update description"
git push origin main
```

---

## After GitHub Push

1. **Go to https://vercel.com**
2. **Import GitHub Repository**
3. **Deploy**

See `DEPLOYMENT_GUIDE.md` for full deployment instructions.

---

## Need Help?

If you get any errors, check:
1. Git is installed: `git --version`
2. You're in the correct folder
3. Your GitHub URL is correct
4. You have internet connection
