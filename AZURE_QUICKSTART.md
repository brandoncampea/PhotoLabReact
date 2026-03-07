# Azure Deployment - Quick Start

## 🚀 Deploy Using GitHub Actions (Recommended)

## ✅ Single App Service (Frontend + API in one app)

Use workflow: [.github/workflows/azure-appservice-fullstack.yml](.github/workflows/azure-appservice-fullstack.yml)

Required GitHub secrets:

| Secret Name | Required | Notes |
|------------|----------|-------|
| `AZURE_CREDENTIALS` | Yes | Service principal JSON for `azure/login` |
| `JWT_SECRET` | Yes | Strong random string |
| `MSSQL_CONNECTION_STRING` | Yes* | Preferred single DB secret |
| `DB_HOST` | Yes* | Required if `MSSQL_CONNECTION_STRING` is not set |
| `DB_NAME` | Yes* | Required if `MSSQL_CONNECTION_STRING` is not set |
| `DB_USER` | Yes* | Required if `MSSQL_CONNECTION_STRING` is not set |
| `DB_PASSWORD` | Yes* | Required if `MSSQL_CONNECTION_STRING` is not set |
| `DB_PORT` | No | Defaults to `1433` |
| `MSSQL_ENCRYPT` | No | Defaults to `true` |
| `MSSQL_TRUST_CERT` | No | Defaults to `false` |
| `STRIPE_SECRET_KEY` | No | Needed for Stripe endpoints |
| `STRIPE_WEBHOOK_SECRET` | No | Needed for Stripe webhooks |
| `MPIX_API_KEY` | No | Needed for MPix proxy routes |
| `MPIX_API_SECRET` | No | Needed for MPix proxy routes |

\* Provide either `MSSQL_CONNECTION_STRING`, or the `DB_*` credentials set.

Manual local deploy script: [scripts/deploy-azure-appservice.sh](scripts/deploy-azure-appservice.sh)

### Prerequisites
- Azure App Service created: `CampeaPhotoLab`
- Azure SQL Database configured and reachable from App Service

### Step 1: Get Azure Credentials

#### Service principal JSON (`AZURE_CREDENTIALS`)
1. Go to https://portal.azure.com
2. Create or reuse a service principal with access to the target resource group
3. Generate credentials JSON for GitHub Actions (`azure/login` format)
4. Copy the JSON as one line (or preserve JSON formatting)

### Step 2: Add GitHub Secrets

Go to your GitHub repo → Settings → Secrets and variables → Actions

Required minimum:

| Secret Name | Value | Where to get it |
|------------|-------|-----------------|
| `AZURE_CREDENTIALS` | Service principal JSON | Azure Entra ID / Azure CLI |
| `JWT_SECRET` | Strong random secret | Generate locally |
| `MSSQL_CONNECTION_STRING` | SQL connection string (preferred) | Azure SQL |

Alternative DB secrets (if not using `MSSQL_CONNECTION_STRING`):
- `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` (and optional `DB_PORT`)

📖 **Detailed setup:** See [.github/GITHUB_SECRETS_SETUP.md](.github/GITHUB_SECRETS_SETUP.md)

### Step 3: Deploy

**Option A - Manual Trigger (First Time):**
```bash
# 1. Commit workflows
git add .github/
git commit -m "Use single Azure App Service workflow"
git push origin main

# 2. Go to GitHub → Actions → "Deploy Full Stack to Azure App Service" → Run workflow
```

**Option B - Automatic (Ongoing):**
```bash
# Just push to main - workflows trigger automatically
git push origin main
```

### Step 4: Verify

- Health: https://CampeaPhotoLab.azurewebsites.net/api/health
- App: https://CampeaPhotoLab.azurewebsites.net

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
chmod +x scripts/deploy-azure-appservice.sh
./scripts/deploy-azure-appservice.sh
```

---

## 📋 Workflows Included

1. **azure-appservice-fullstack.yml**
   - Triggers: Manual and `main` pushes affecting backend/frontend files
   - Deploys: React frontend + Express API to one Azure App Service

---

## ⚡ Quick Commands

```bash
# View workflow runs
# Go to: https://github.com/YOUR_USERNAME/PhotoLabReact/actions

# View backend logs
az webapp log tail --name CampeaPhotoLab --resource-group PhotoLab

# View deployment status
az webapp show --name CampeaPhotoLab --resource-group PhotoLab --query state

# Test backend health
curl https://CampeaPhotoLab.azurewebsites.net/api/health

# Restart backend
az webapp restart --name CampeaPhotoLab --resource-group PhotoLab
```

---

## 🔧 Troubleshooting

### Deployment fails?
1. Check Actions tab for error logs
2. Verify required GitHub secrets are set correctly
3. Ensure Azure resources exist (App Service + SQL)

### Backend not responding?
```bash
# Check logs
az webapp log tail --name CampeaPhotoLab --resource-group PhotoLab

# Restart
az webapp restart --name CampeaPhotoLab --resource-group PhotoLab
```

---

## 📚 More Documentation

- **Full Guide:** [AZURE_DEPLOYMENT.md](AZURE_DEPLOYMENT.md)
- **Secrets Setup:** [.github/GITHUB_SECRETS_SETUP.md](.github/GITHUB_SECRETS_SETUP.md)
- **Manual Script:** [scripts/deploy-azure-appservice.sh](scripts/deploy-azure-appservice.sh)

---

## 🎯 Next Steps After Deployment

1. ✅ Commit workflows to git
2. ✅ Set up GitHub secrets
3. ✅ Trigger deployment
4. ✅ Test application
5. 🔜 Set up custom domain
6. 🔜 Configure monitoring
7. 🔜 Set up automated backups
