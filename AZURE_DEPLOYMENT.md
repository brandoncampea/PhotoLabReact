# Azure Deployment Guide

## Architecture Overview
- **Frontend**: React app deployed to Azure Static Web Apps
- **Backend**: Node.js API deployed to Azure App Service
- **Database**: Azure SQL Database (already configured)

## Prerequisites

1. **Azure CLI** - Install via:
   ```bash
   # macOS with Homebrew
   brew install azure-cli
   
   # Or download from: https://docs.microsoft.com/cli/azure/install-azure-cli
   ```

2. **Azure Login**:
   ```bash
   az login
   ```

3. **Set Default Subscription** (if you have multiple):
   ```bash
   az account list --output table
   az account set --subscription "Your-Subscription-Name-or-ID"
   ```

## Deployment Steps

### Option A: Quick Deploy (Using Script)

Run the automated deployment script:
```bash
chmod +x scripts/deploy-azure.sh
./scripts/deploy-azure.sh
```

### Option B: Manual Step-by-Step Deployment

#### 1. Create Resource Group (if not exists)
```bash
az group create \
  --name photolab-rg \
  --location eastus
```

#### 2. Deploy Backend API to Azure App Service

**Create App Service Plan:**
```bash
az appservice plan create \
  --name photolab-backend-plan \
  --resource-group photolab-rg \
  --sku B1 \
  --is-linux
```

**Create Web App:**
```bash
az webapp create \
  --name campeaphotolab-api \
  --resource-group photolab-rg \
  --plan photolab-backend-plan \
  --runtime "NODE:20-lts"
```

**Configure Environment Variables:**
```bash
az webapp config appsettings set \
  --name campeaphotolab-api \
  --resource-group photolab-rg \
  --settings \
    DB_HOST=campeaphotolabsql.database.windows.net \
    DB_PORT=1433 \
    DB_NAME=campeaphotolab-test \
    DB_USER=campeaphotolab \
    DB_PASSWORD=2026SQL987$ \
    MSSQL_ENCRYPT=true \
    MSSQL_TRUST_CERT=false \
    PORT=8080 \
    JWT_SECRET=your-jwt-secret-change-this \
    STRIPE_SECRET_KEY=your-stripe-secret-key
```

**Deploy Backend Code:**
```bash
# Create deployment package
cd server
zip -r ../backend-deploy.zip . -x "*.db" -x "*.db-journal" -x "node_modules/*"
cd ..

# Deploy to Azure
az webapp deployment source config-zip \
  --name campeaphotolab-api \
  --resource-group photolab-rg \
  --src backend-deploy.zip
```

**Set Startup Command:**
```bash
az webapp config set \
  --name campeaphotolab-api \
  --resource-group photolab-rg \
  --startup-file "node server.js"
```

#### 3. Deploy Frontend to Azure Static Web Apps

**Build the Frontend:**
```bash
npm run build
```

**Create Static Web App:**
```bash
az staticwebapp create \
  --name campeaphotolab-frontend \
  --resource-group photolab-rg \
  --location eastus2 \
  --source ./ \
  --app-location "/" \
  --output-location "dist" \
  --branch main
```

**Update Frontend Environment (for production):**

Create `.env.production` file:
```
VITE_API_URL=https://campeaphotolab-api.azurewebsites.net/api
VITE_USE_MOCK_API=false
```

**Deploy Frontend:**
```bash
# Using SWA CLI (Static Web Apps CLI)
npm install -g @azure/static-web-apps-cli

# Deploy
swa deploy ./dist \
  --app-name campeaphotolab-frontend \
  --resource-group photolab-rg \
  --env production
```

#### 4. Configure CORS on Backend

Add allowed origins for your frontend:
```bash
az webapp cors add \
  --name campeaphotolab-api \
  --resource-group photolab-rg \
  --allowed-origins \
    "https://campeaphotolab-frontend.azurestaticapps.net" \
    "http://localhost:3000"
```

#### 5. Configure Custom Domain (Optional)

**For Frontend:**
```bash
az staticwebapp hostname set \
  --name campeaphotolab-frontend \
  --resource-group photolab-rg \
  --hostname www.yourphotolabdomain.com
```

**For Backend:**
```bash
az webapp config hostname add \
  --webapp-name campeaphotolab-api \
  --resource-group photolab-rg \
  --hostname api.yourphotolabdomain.com
```

## Environment Variables Reference

### Backend (.env on App Service)
```
DB_HOST=campeaphotolabsql.database.windows.net
DB_PORT=1433
DB_NAME=campeaphotolab-test
DB_USER=campeaphotolab
DB_PASSWORD=2026SQL987$
MSSQL_ENCRYPT=true
MSSQL_TRUST_CERT=false
PORT=8080
JWT_SECRET=<generate-strong-secret>
STRIPE_SECRET_KEY=<your-stripe-key>
STRIPE_WEBHOOK_SECRET=<your-webhook-secret>
```

### Frontend (.env.production)
```
VITE_API_URL=https://campeaphotolab-api.azurewebsites.net/api
VITE_USE_MOCK_API=false
```

## Post-Deployment Verification

1. **Check Backend Health:**
   ```bash
   curl https://campeaphotolab-api.azurewebsites.net/api/health
   ```

2. **View Backend Logs:**
   ```bash
   az webapp log tail \
     --name campeaphotolab-api \
     --resource-group photolab-rg
   ```

3. **Check Frontend:**
   ```
   Open browser to: https://campeaphotolab-frontend.azurestaticapps.net
   ```

4. **Test Login:**
   - Use test credentials: `admin@example.com` / `password123`

## Continuous Deployment (GitHub Actions)

✅ **GitHub Actions workflows have been created!**

Three workflow files are ready in `.github/workflows/`:

1. **azure-backend.yml** - Deploys backend API on server changes
2. **azure-frontend.yml** - Deploys frontend on src/public changes
3. **azure-full-deploy.yml** - Deploys both backend and frontend together

### Quick Setup

1. **Set up GitHub Secrets** - Follow the guide in [.github/GITHUB_SECRETS_SETUP.md](.github/GITHUB_SECRETS_SETUP.md)
   
   Required secrets:
   - `AZURE_WEBAPP_PUBLISH_PROFILE` - From Azure App Service
   - `AZURE_STATIC_WEB_APPS_API_TOKEN` - From Azure Static Web Apps
   - `VITE_API_URL` - Your production API URL

2. **Commit and push workflows:**
   ```bash
   git add .github/
   git commit -m "Add Azure deployment workflows"
   git push origin main
   ```

3. **Trigger deployment:**
   - **Automatic**: Push changes to `main` branch
   - **Manual**: Go to Actions tab → Select workflow → "Run workflow"

### Workflow Triggers

- **Backend workflow** triggers on:
  - Changes to `server/**`
  - Manual trigger via Actions tab

- **Frontend workflow** triggers on:
  - Changes to `src/**`, `public/**`, `index.html`
  - Manual trigger via Actions tab

- **Full stack workflow** triggers on:
  - Changes to either backend or frontend
  - Manual trigger (recommended for initial deployment)

For detailed setup instructions, see [.github/GITHUB_SECRETS_SETUP.md](.github/GITHUB_SECRETS_SETUP.md)

## Troubleshooting

### Backend Issues

1. **App won't start:**
   ```bash
   az webapp log tail --name campeaphotolab-api --resource-group photolab-rg
   ```

2. **Database connection fails:**
   - Verify firewall rules on Azure SQL Server
   - Check App Service IP in SQL Server firewall

3. **Enable detailed logging:**
   ```bash
   az webapp log config \
     --name campeaphotolab-api \
     --resource-group photolab-rg \
     --application-logging filesystem \
     --level verbose
   ```

### Frontend Issues

1. **API calls fail:**
   - Check VITE_API_URL in build-time environment
   - Verify CORS settings on backend

2. **Static Web App build fails:**
   - Check build logs in Azure Portal
   - Verify output-location is "dist"

## Cost Optimization

- **Backend**: B1 App Service Plan (~$13/month)
- **Frontend**: Free tier of Static Web Apps (sufficient for most use cases)
- **Database**: Already provisioned Azure SQL

## Scaling Considerations

- **App Service**: Scale up plan for more resources
- **Database**: Consider serverless or higher tier for production
- **CDN**: Add Azure CDN for global content delivery

## Next Steps

1. Set up custom domain with SSL
2. Configure Azure Application Insights for monitoring
3. Set up automated backups for database
4. Configure Azure Key Vault for secrets management
