# Azure Deployment - Quick Start

## 🚀 Deploy Using GitHub Actions (Recommended)

### Prerequisites
- Azure App Service created: `campeaphotolab-api`
- Azure Static Web App created: `campeaphotolab-frontend`
- Azure SQL Database: Already configured ✓

### Step 1: Get Azure Credentials

#### Backend Publish Profile
1. Go to https://portal.azure.com
2. Find App Service: `campeaphotolab-api`
3. Click "Get publish profile" → Download
4. Copy entire file contents

#### Frontend Deployment Token
1. In Azure Portal, find Static Web App: `campeaphotolab-frontend`
2. Click "Manage deployment token"
3. Copy the token

### Step 2: Add GitHub Secrets

Go to your GitHub repo → Settings → Secrets and variables → Actions

Add these 3 secrets:

| Secret Name | Value | Where to get it |
|------------|-------|-----------------|
| `AZURE_WEBAPP_PUBLISH_PROFILE` | XML content from publish profile | Azure App Service → Get publish profile |
| `AZURE_STATIC_WEB_APPS_API_TOKEN` | Deployment token | Azure Static Web App → Manage deployment token |
| `VITE_API_URL` | `https://campeaphotolab-api.azurewebsites.net/api` | Your backend URL |

📖 **Detailed setup:** See [.github/GITHUB_SECRETS_SETUP.md](.github/GITHUB_SECRETS_SETUP.md)

### Step 3: Deploy

**Option A - Manual Trigger (First Time):**
```bash
# 1. Commit workflows
git add .github/
git commit -m "Add Azure deployment workflows"
git push origin main

# 2. Go to GitHub → Actions → "Deploy Full Stack to Azure" → Run workflow
```

**Option B - Automatic (Ongoing):**
```bash
# Just push to main - workflows trigger automatically
git push origin main
```

### Step 4: Verify

- Backend: https://campeaphotolab-api.azurewebsites.net/api/health
- Frontend: https://campeaphotolab-frontend.azurestaticapps.net

Test login:
- Email: `admin@example.com`
- Password: `password123`

---

## 🛠️ Deploy Using Script (Alternative)

If you prefer manual deployment:

### Step 1: Install Azure CLI
```bash
# Download from: https://aka.ms/installazureclimacos
# Or use Homebrew:
brew install azure-cli
```

### Step 2: Login
```bash
az login
```

### Step 3: Run Deployment Script
```bash
chmod +x scripts/deploy-azure.sh
./scripts/deploy-azure.sh
```

---

## 📋 Workflows Included

1. **azure-backend.yml** 
   - Triggers: Changes to `server/**`
   - Deploys: Backend API to App Service

2. **azure-frontend.yml**
   - Triggers: Changes to `src/**`, `public/**`
   - Deploys: Frontend to Static Web Apps

3. **azure-full-deploy.yml**
   - Triggers: Manual or any frontend/backend changes
   - Deploys: Both backend and frontend sequentially

---

## ⚡ Quick Commands

```bash
# View workflow runs
# Go to: https://github.com/YOUR_USERNAME/PhotoLabReact/actions

# View backend logs
az webapp log tail --name campeaphotolab-api --resource-group photolab-rg

# View deployment status
az webapp show --name campeaphotolab-api --resource-group photolab-rg --query state

# Test backend health
curl https://campeaphotolab-api.azurewebsites.net/api/health

# Restart backend
az webapp restart --name campeaphotolab-api --resource-group photolab-rg
```

---

## 🔧 Troubleshooting

### Deployment fails?
1. Check Actions tab for error logs
2. Verify all 3 GitHub secrets are set correctly
3. Ensure Azure resources exist (App Service + Static Web App)

### Backend not responding?
```bash
# Check logs
az webapp log tail --name campeaphotolab-api --resource-group photolab-rg

# Restart
az webapp restart --name campeaphotolab-api --resource-group photolab-rg
```

### Frontend not building?
- Check `VITE_API_URL` secret format (must start with https://)
- Review build logs in GitHub Actions

---

## 📚 More Documentation

- **Full Guide:** [AZURE_DEPLOYMENT.md](AZURE_DEPLOYMENT.md)
- **Secrets Setup:** [.github/GITHUB_SECRETS_SETUP.md](.github/GITHUB_SECRETS_SETUP.md)
- **Manual Script:** [scripts/deploy-azure.sh](scripts/deploy-azure.sh)

---

## 🎯 Next Steps After Deployment

1. ✅ Commit workflows to git
2. ✅ Set up GitHub secrets (3 required)
3. ✅ Trigger deployment
4. ✅ Test application
5. 🔜 Set up custom domain
6. 🔜 Configure monitoring
7. 🔜 Set up automated backups
