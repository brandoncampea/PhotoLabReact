# Azure Deployment Setup - COMPLETE ✅

## What Was Created

### GitHub Actions Workflows (`.github/workflows/`)
1. **azure-appservice-fullstack.yml** - Automated full-stack deployment to Azure App Service

### Documentation
1. **AZURE_DEPLOYMENT.md** - Complete deployment guide
2. **AZURE_QUICKSTART.md** - Quick start reference
3. **.github/GITHUB_SECRETS_SETUP.md** - Secrets configuration guide

### Scripts
1. **scripts/deploy-azure-appservice.sh** - Manual deployment script (alternative to GitHub Actions)

## ✅ Committed to Git
All files committed in: `6ec7afb`

---

## 🚀 Next Steps to Deploy

### Step 1: Create Azure Resources (if not already done)

#### Backend App Service
```bash
# Install Azure CLI first (if needed)
# Download from: https://aka.ms/installazureclimacos

az login

# Create App Service
az group create --name PhotoLab --location eastus

az appservice plan create \
  --name photolab-backend-plan \
  --resource-group PhotoLab \
  --sku B1 \
  --is-linux

az webapp create \
  --name CampeaPhotoLab \
  --resource-group PhotoLab \
  --plan photolab-backend-plan \
  --runtime "NODE:20-lts"

# Configure environment
az webapp config appsettings set \
  --name CampeaPhotoLab \
  --resource-group PhotoLab \
  --settings \
    DB_HOST=campeaphotolabsql.database.windows.net \
    DB_PORT=1433 \
    DB_NAME=campeaphotolab-test \
    DB_USER=campeaphotolab \
    DB_PASSWORD=2026SQL987$ \
    MSSQL_ENCRYPT=true \
    MSSQL_TRUST_CERT=false \
    PORT=8080 \
    JWT_SECRET=your-secure-secret-here
```

#### Frontend Static Web App
```bash
az staticwebapp create \
  --name campeaphotolab-frontend \
  --resource-group PhotoLab \
  --location eastus2
```

### Step 2: Configure GitHub Secrets

Go to: **GitHub repo → Settings → Secrets and variables → Actions**

Add these 3 secrets:

#### 1. AZURE_WEBAPP_PUBLISH_PROFILE
```
Source: Azure Portal → App Service (campeaphotolab-api) → Get publish profile
Value: Paste entire XML file contents
```

#### 2. AZURE_STATIC_WEB_APPS_API_TOKEN
```
Source: Azure Portal → Static Web App (campeaphotolab-frontend) → Manage deployment token
Value: Paste the deployment token
```

#### 3. VITE_API_URL
```
Value: https://campeaphotolab-api.azurewebsites.net/api
```

### Step 3: Push and Deploy

```bash
# If you haven't pushed yet
git push origin main

# Then go to GitHub → Actions tab
# Select "Deploy Full Stack to Azure"
# Click "Run workflow" → Run workflow
```

---

## 📖 Quick Reference

### View Deployment Status
- Go to: https://github.com/YOUR_USERNAME/PhotoLabReact/actions

### Test Deployment
- **Backend Health:** https://campeaphotolab-api.azurewebsites.net/api/health
- **Frontend:** https://campeaphotolab-frontend.azurestaticapps.net
- **Login:** admin@example.com / password123

### View Backend Logs
```bash
az webapp log tail \
  --name CampeaPhotoLab \
  --resource-group PhotoLab
```

### Restart Backend
```bash
az webapp restart \
  --name CampeaPhotoLab \
  --resource-group PhotoLab
```

---

## 🎯 Workflow Triggers

### Automatic Triggers
- **Backend:** Changes to `server/**` → deploys backend
- **Frontend:** Changes to `src/**` or `public/**` → deploys frontend
- **Full Stack:** Changes to either → can deploy both

### Manual Triggers
1. Go to GitHub → Actions tab
2. Select desired workflow
3. Click "Run workflow"
4. Select branch (main)
5. Click "Run workflow"

---

## 📚 Documentation Guide

| Document | Purpose | When to Use |
|----------|---------|-------------|
| [AZURE_QUICKSTART.md](AZURE_QUICKSTART.md) | Quick reference | First time setup |
| [AZURE_DEPLOYMENT.md](AZURE_DEPLOYMENT.md) | Complete guide | Detailed instructions |
| [.github/GITHUB_SECRETS_SETUP.md](.github/GITHUB_SECRETS_SETUP.md) | Secrets config | Setting up GitHub secrets |
| [scripts/deploy-azure.sh](scripts/deploy-azure.sh) | Manual deploy | Alternative to GitHub Actions |

---

## ✅ What's Ready

- [x] GitHub Actions workflows configured
- [x] Deployment documentation complete
- [x] Manual deployment script available
- [x] Health checks and verification included
- [x] All files committed to git

## ⏳ What You Need to Do

- [ ] Create Azure App Service (if not exists)
- [ ] Create Azure Static Web App (if not exists)
- [ ] Add 3 GitHub Secrets
- [ ] Push to GitHub and trigger workflow
- [ ] Verify deployment

---

## 🆘 Need Help?

1. **Detailed Setup:** See [AZURE_QUICKSTART.md](AZURE_QUICKSTART.md)
2. **Secrets Guide:** See [.github/GITHUB_SECRETS_SETUP.md](.github/GITHUB_SECRETS_SETUP.md)
3. **Full Documentation:** See [AZURE_DEPLOYMENT.md](AZURE_DEPLOYMENT.md)

---

**Last Updated:** February 16, 2026  
**Commit:** 6ec7afb
