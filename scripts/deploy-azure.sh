#!/bin/bash

# Azure Deployment Script for Photo Lab React
# This script deploys both backend and frontend to Azure

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
RESOURCE_GROUP="photolab-rg"
LOCATION="eastus"
BACKEND_APP_NAME="campeaphotolab-api"
FRONTEND_APP_NAME="campeaphotolab-frontend"
BACKEND_PLAN="photolab-backend-plan"

# Database configuration (from .env.local)
DB_HOST="campeaphotolabsql.database.windows.net"
DB_PORT="1433"
DB_NAME="campeaphotolab-test"
DB_USER="campeaphotolab"
DB_PASSWORD="2026SQL987$"

echo -e "${GREEN}╔════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   Photo Lab React - Azure Deployment          ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════╝${NC}"
echo ""

# Check if Azure CLI is installed
if ! command -v az &> /dev/null; then
    echo -e "${RED}✗ Azure CLI is not installed${NC}"
    echo "Install it from: https://docs.microsoft.com/cli/azure/install-azure-cli"
    exit 1
fi

# Check if logged in to Azure
echo -e "${YELLOW}→ Checking Azure login status...${NC}"
if ! az account show &> /dev/null; then
    echo -e "${RED}✗ Not logged in to Azure${NC}"
    echo "Please run: az login"
    exit 1
fi

echo -e "${GREEN}✓ Azure CLI authenticated${NC}"

# Get current subscription
SUBSCRIPTION=$(az account show --query name -o tsv)
echo -e "${GREEN}✓ Using subscription: ${SUBSCRIPTION}${NC}"
echo ""

# Prompt for JWT secret if not set
read -p "Enter JWT_SECRET (or press Enter to use default): " JWT_SECRET
JWT_SECRET=${JWT_SECRET:-"your-jwt-secret-change-this-in-production"}

# Prompt for Stripe key
read -p "Enter STRIPE_SECRET_KEY (or press Enter to skip): " STRIPE_SECRET_KEY
STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY:-""}

echo ""
echo -e "${YELLOW}═══════════════════════════════════════════════${NC}"
echo -e "${YELLOW}  Step 1: Create/Verify Resource Group${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════${NC}"

if az group show --name $RESOURCE_GROUP &> /dev/null; then
    echo -e "${GREEN}✓ Resource group '$RESOURCE_GROUP' already exists${NC}"
else
    echo -e "${YELLOW}→ Creating resource group '$RESOURCE_GROUP'...${NC}"
    az group create \
      --name $RESOURCE_GROUP \
      --location $LOCATION \
      --output none
    echo -e "${GREEN}✓ Resource group created${NC}"
fi

echo ""
echo -e "${YELLOW}═══════════════════════════════════════════════${NC}"
echo -e "${YELLOW}  Step 2: Deploy Backend API${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════${NC}"

# Create App Service Plan
if az appservice plan show --name $BACKEND_PLAN --resource-group $RESOURCE_GROUP &> /dev/null; then
    echo -e "${GREEN}✓ App Service Plan '$BACKEND_PLAN' already exists${NC}"
else
    echo -e "${YELLOW}→ Creating App Service Plan...${NC}"
    az appservice plan create \
      --name $BACKEND_PLAN \
      --resource-group $RESOURCE_GROUP \
      --sku B1 \
      --is-linux \
      --output none
    echo -e "${GREEN}✓ App Service Plan created${NC}"
fi

# Create Web App
if az webapp show --name $BACKEND_APP_NAME --resource-group $RESOURCE_GROUP &> /dev/null; then
    echo -e "${GREEN}✓ Web App '$BACKEND_APP_NAME' already exists${NC}"
else
    echo -e "${YELLOW}→ Creating Web App for backend...${NC}"
    az webapp create \
      --name $BACKEND_APP_NAME \
      --resource-group $RESOURCE_GROUP \
      --plan $BACKEND_PLAN \
      --runtime "NODE:20-lts" \
      --output none
    echo -e "${GREEN}✓ Web App created${NC}"
fi

# Configure environment variables
echo -e "${YELLOW}→ Configuring backend environment variables...${NC}"
az webapp config appsettings set \
  --name $BACKEND_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --settings \
    DB_HOST=$DB_HOST \
    DB_PORT=$DB_PORT \
    DB_NAME=$DB_NAME \
    DB_USER=$DB_USER \
    DB_PASSWORD="$DB_PASSWORD" \
    MSSQL_ENCRYPT=true \
    MSSQL_TRUST_CERT=false \
    PORT=8080 \
    JWT_SECRET="$JWT_SECRET" \
    STRIPE_SECRET_KEY="$STRIPE_SECRET_KEY" \
  --output none
echo -e "${GREEN}✓ Environment variables configured${NC}"

# Set startup command
echo -e "${YELLOW}→ Setting startup command...${NC}"
az webapp config set \
  --name $BACKEND_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --startup-file "node server.js" \
  --output none
echo -e "${GREEN}✓ Startup command set${NC}"

# Create deployment package
echo -e "${YELLOW}→ Creating backend deployment package...${NC}"
cd server
zip -r ../backend-deploy.zip . -x "*.db" -x "*.db-journal" -x "node_modules/*" -x ".DS_Store" > /dev/null
cd ..
echo -e "${GREEN}✓ Deployment package created${NC}"

# Deploy backend
echo -e "${YELLOW}→ Deploying backend to Azure...${NC}"
az webapp deployment source config-zip \
  --name $BACKEND_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --src backend-deploy.zip \
  --output none

echo -e "${GREEN}✓ Backend deployed successfully!${NC}"

# Get backend URL
BACKEND_URL="https://${BACKEND_APP_NAME}.azurewebsites.net"
echo -e "${GREEN}  Backend URL: ${BACKEND_URL}${NC}"

# Clean up deployment package
rm backend-deploy.zip

echo ""
echo -e "${YELLOW}═══════════════════════════════════════════════${NC}"
echo -e "${YELLOW}  Step 3: Configure CORS${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════${NC}"

echo -e "${YELLOW}→ Adding CORS origins...${NC}"
az webapp cors add \
  --name $BACKEND_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --allowed-origins \
    "https://${FRONTEND_APP_NAME}.azurestaticapps.net" \
    "http://localhost:3000" \
  --output none 2>/dev/null || echo -e "${YELLOW}  (CORS may already be configured)${NC}"
echo -e "${GREEN}✓ CORS configured${NC}"

echo ""
echo -e "${YELLOW}═══════════════════════════════════════════════${NC}"
echo -e "${YELLOW}  Step 4: Build and Deploy Frontend${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════${NC}"

# Create .env.production for build
echo -e "${YELLOW}→ Creating production environment config...${NC}"
cat > .env.production << EOF
VITE_API_URL=${BACKEND_URL}/api
VITE_USE_MOCK_API=false
EOF
echo -e "${GREEN}✓ Production config created${NC}"

# Build frontend
echo -e "${YELLOW}→ Building frontend application...${NC}"
npm run build
echo -e "${GREEN}✓ Frontend built successfully${NC}"

# Create Static Web App
if az staticwebapp show --name $FRONTEND_APP_NAME --resource-group $RESOURCE_GROUP &> /dev/null; then
    echo -e "${GREEN}✓ Static Web App '$FRONTEND_APP_NAME' already exists${NC}"
    
    # Get deployment token
    echo -e "${YELLOW}→ Getting deployment token...${NC}"
    DEPLOYMENT_TOKEN=$(az staticwebapp secrets list \
      --name $FRONTEND_APP_NAME \
      --resource-group $RESOURCE_GROUP \
      --query "properties.apiKey" -o tsv)
    
else
    echo -e "${YELLOW}→ Creating Static Web App...${NC}"
    az staticwebapp create \
      --name $FRONTEND_APP_NAME \
      --resource-group $RESOURCE_GROUP \
      --location eastus2 \
      --output none
    echo -e "${GREEN}✓ Static Web App created${NC}"
    
    # Get deployment token
    DEPLOYMENT_TOKEN=$(az staticwebapp secrets list \
      --name $FRONTEND_APP_NAME \
      --resource-group $RESOURCE_GROUP \
      --query "properties.apiKey" -o tsv)
fi

# Check if SWA CLI is installed
if ! command -v swa &> /dev/null; then
    echo -e "${YELLOW}→ Installing Azure Static Web Apps CLI...${NC}"
    npm install -g @azure/static-web-apps-cli
    echo -e "${GREEN}✓ SWA CLI installed${NC}"
fi

# Deploy frontend using SWA CLI
echo -e "${YELLOW}→ Deploying frontend to Azure Static Web Apps...${NC}"
swa deploy ./dist \
  --deployment-token "$DEPLOYMENT_TOKEN" \
  --env production \
  --no-use-keychain

echo -e "${GREEN}✓ Frontend deployed successfully!${NC}"

# Get frontend URL
FRONTEND_URL="https://${FRONTEND_APP_NAME}.azurestaticapps.net"
echo -e "${GREEN}  Frontend URL: ${FRONTEND_URL}${NC}"

echo ""
echo -e "${YELLOW}═══════════════════════════════════════════════${NC}"
echo -e "${YELLOW}  Step 5: Verification${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════${NC}"

echo -e "${YELLOW}→ Waiting for backend to start (30 seconds)...${NC}"
sleep 30

echo -e "${YELLOW}→ Testing backend health endpoint...${NC}"
if curl -s -f "${BACKEND_URL}/api/health" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Backend is responding${NC}"
else
    echo -e "${YELLOW}⚠ Backend may still be starting up${NC}"
    echo -e "${YELLOW}  You can check logs with: az webapp log tail --name $BACKEND_APP_NAME --resource-group $RESOURCE_GROUP${NC}"
fi

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║          🎉 Deployment Complete! 🎉            ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}📍 Your application is now live:${NC}"
echo ""
echo -e "  ${YELLOW}Frontend:${NC} ${FRONTEND_URL}"
echo -e "  ${YELLOW}Backend:${NC}  ${BACKEND_URL}"
echo ""
echo -e "${GREEN}🔐 Test Credentials:${NC}"
echo "  Email: admin@example.com"
echo "  Password: password123"
echo ""
echo -e "${GREEN}📝 Next Steps:${NC}"
echo "  1. Test the application at the frontend URL"
echo "  2. Configure custom domain (optional)"
echo "  3. Set up monitoring in Azure Portal"
echo "  4. Review backend logs if needed:"
echo "     az webapp log tail --name $BACKEND_APP_NAME --resource-group $RESOURCE_GROUP"
echo ""
echo -e "${GREEN}📚 Documentation:${NC}"
echo "  See AZURE_DEPLOYMENT.md for more details"
echo ""
