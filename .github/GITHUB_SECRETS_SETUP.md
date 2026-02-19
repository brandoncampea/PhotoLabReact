# GitHub Secrets Setup for Azure Deployment

This guide explains how to configure GitHub repository secrets for automated Azure deployments.

## Required Secrets

### 1. AZURE_CREDENTIALS (Backend)

**What it is:** Azure Service Principal credentials for deploying to Azure App Service

**How to get it:**

First, install Azure CLI:
```bash
# macOS
curl -L https://aka.ms/installazureclimacos | bash

# Or if you have brew installed:
brew install azure-cli
```

Then create a service principal:
```bash
# Login to Azure
az login

# Get your subscription ID
az account list --query "[].id" -o tsv

# Create service principal (replace SUBSCRIPTION_ID)
az ad sp create-for-rbac \
  --name "github-photolab-deploy" \
  --role contributor \
  --scopes /subscriptions/SUBSCRIPTION_ID/resourceGroups/photolab-rg \
  --sdk-auth
```

Copy the entire JSON output.

**How to add to GitHub:**
1. Go to your GitHub repository
2. Settings → Secrets and variables → Actions
3. Click "New repository secret"
4. Name: `AZURE_CREDENTIALS`
5. Value: Paste the entire JSON output from the command above
6. Click "Add secret"

**Example JSON format:**
```json
{
  "clientId": "...",
  "clientSecret": "...",
  "subscriptionId": "...",
  "tenantId": "...",
  "activeDirectoryEndpointUrl": "https://login.microsoftonline.com",
  "resourceManagerEndpointUrl": "https://management.azure.com/",
  "activeDirectoryGraphResourceId": "https://graph.windows.net/",
  "sqlManagementEndpointUrl": "https://management.core.windows.net:8443/",
  "galleryEndpointUrl": "https://gallery.azure.com/",
  "managementEndpointUrl": "https://management.core.windows.net/"
}
```

---

### 2. AZURE_STATIC_WEB_APPS_API_TOKEN (Frontend)

**What it is:** Deployment token for Azure Static Web Apps

**How to get it:**
1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to your Static Web App: `campeaphotolab-frontend`
3. Click **"Manage deployment token"** in the Overview section
4. Copy the deployment token

**How to add to GitHub:**
1. Go to your GitHub repository
2. Settings → Secrets and variables → Actions
3. Click "New repository secret"
4. Name: `AZURE_STATIC_WEB_APPS_API_TOKEN`
5. Value: Paste the deployment token
6. Click "Add secret"

---

### 3. VITE_API_URL (Frontend Build)

**What it is:** Production API URL for frontend to connect to backend

**Value:**
```
https://campeaphotolab-api.azurewebsites.net/api
```

**How to add to GitHub:**
1. Go to your GitHub repository
2. Settings → Secrets and variables → Actions
3. Click "New repository secret"
4. Name: `VITE_API_URL`
5. Value: `https://campeaphotolab-api.azurewebsites.net/api`
6. Click "Add secret"

---

## Alternative: Using Azure Service Principal (Advanced)

If you prefer using a service principal instead of publish profiles:

### Create Service Principal

```bash
az ad sp create-for-rbac \
  --name "github-photolab-deploy" \
  --role contributor \
  --scopes /subscriptions/{subscription-id}/resourceGroups/photolab-rg \
  --sdk-auth
```

Copy the entire JSON output and add it as secret:
- Name: `AZURE_CREDENTIALS`

### Update workflows to use service principal

Replace the `azure/webapps-deploy` step with:

```yaml
- name: Azure Login
  uses: azure/login@v1
  with:
    creds: ${{ secrets.AZURE_CREDENTIALS }}

- name: Deploy to Web App
  uses: azure/webapps-deploy@v2
  with:
    app-name: campeaphotolab-api
    package: backend-deploy.zip
```

---

## Verifying Secrets

After adding all secrets, you should see:

1. ✓ `AZURE_CREDENTIALS`
2. ✓ `AZURE_STATIC_WEB_APPS_API_TOKEN`
3. ✓ `VITE_API_URL`

## Testing the Workflows

### Manual Trigger
1. Go to Actions tab in your repository
2. Select "Deploy Full Stack to Azure"
3. Click "Run workflow"
4. Select branch: `main`
5. Click "Run workflow"

### Automatic Trigger
Push any change to:
- `server/**` → triggers backend deployment
- `src/**` or `public/**` → triggers frontend deployment
- Both → triggers full stack deployment

## Troubleshooting

### "Secret not found" error
- Make sure secret names match exactly (case-sensitive)
- Check that secrets are in "Actions secrets" not "Codespaces secrets"

### Backend deployment fails
- Verify AZURE_WEBAPP_PUBLISH_PROFILE is complete XML
- Check App Service name matches in workflow
- Review workflow logs for specific error

### Frontend deployment fails
- Verify AZURE_STATIC_WEB_APPS_API_TOKEN is valid
- Check token hasn't expired
- Ensure Static Web App exists in Azure

### Build fails
- Check VITE_API_URL format (should start with https://)
- Verify all dependencies are in package.json
- Review build logs in Actions tab

## Security Best Practices

1. **Never commit secrets to git**
2. **Rotate tokens regularly** (every 90 days recommended)
3. **Use environment-specific secrets** for staging vs production
4. **Limit secret access** to only necessary workflows
5. **Enable secret scanning** in repository settings

## Next Steps

After setting up secrets:
1. ✓ Commit the workflow files to `main` branch
2. ✓ Push to trigger first deployment
3. ✓ Monitor Actions tab for deployment progress
4. ✓ Verify deployment at:
   - Backend: https://campeaphotolab-api.azurewebsites.net
   - Frontend: https://campeaphotolab-frontend.azurestaticapps.net

## Resources

- [GitHub Actions Secrets Documentation](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
- [Azure App Service Deployment](https://docs.microsoft.com/azure/app-service/deploy-github-actions)
- [Azure Static Web Apps GitHub Actions](https://docs.microsoft.com/azure/static-web-apps/github-actions-workflow)
