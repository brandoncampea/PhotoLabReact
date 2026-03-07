#!/bin/bash

set -euo pipefail

# Deploy full-stack app (React + Express API) to a single Azure App Service
# Required env vars:
#   AZURE_WEBAPP_NAME (default: CampeaPhotoLab)
#   AZURE_RESOURCE_GROUP (default: PhotoLab)
# Optional:
#   VITE_API_URL (defaults to /api for same-origin API calls)

if ! command -v az >/dev/null 2>&1; then
  echo "Azure CLI is required. Install: https://learn.microsoft.com/cli/azure/install-azure-cli"
  exit 1
fi

if ! command -v zip >/dev/null 2>&1; then
  echo "zip is required. Install it and retry."
  exit 1
fi

if [[ -z "${AZURE_WEBAPP_NAME:-}" ]]; then
  echo "Missing AZURE_WEBAPP_NAME"
  exit 1
fi

if [[ -z "${AZURE_RESOURCE_GROUP:-}" ]]; then
  echo "Missing AZURE_RESOURCE_GROUP"
  exit 1
fi

if [[ -z "${JWT_SECRET:-}" ]]; then
  echo "Missing JWT_SECRET"
  exit 1
fi

HAS_VALID_CONN_STRING=0
if [[ -n "${MSSQL_CONNECTION_STRING:-}" ]]; then
  if echo "$MSSQL_CONNECTION_STRING" | grep -Eiq '(^|;)[[:space:]]*(server|data source)[[:space:]]*='; then
    HAS_VALID_CONN_STRING=1
  else
    echo "Warning: MSSQL_CONNECTION_STRING appears invalid; it will be ignored in favor of DB_* settings"
  fi
fi

if [[ "$HAS_VALID_CONN_STRING" -ne 1 ]]; then
  if [[ -z "${DB_HOST:-}" || -z "${DB_NAME:-}" || -z "${DB_USER:-}" || -z "${DB_PASSWORD:-}" ]]; then
    echo "Missing DB settings. Provide valid MSSQL_CONNECTION_STRING or DB_HOST/DB_NAME/DB_USER/DB_PASSWORD"
    exit 1
  fi
fi

if ! az account show >/dev/null 2>&1; then
  echo "Not logged into Azure. Run: az login"
  exit 1
fi

echo "Building frontend..."
npm ci
VITE_API_URL="${VITE_API_URL:-/api}" npm run build:appservice
npm prune --omit=dev

echo "Configuring App Service runtime settings..."

APP_URL="https://${AZURE_WEBAPP_NAME}.azurewebsites.net"
SETTINGS=(
  "SCM_DO_BUILD_DURING_DEPLOYMENT=false"
  "ENABLE_ORYX_BUILD=false"
  "NODE_ENV=production"
  "NODE_OPTIONS=--no-deprecation"
  "PORT=8080"
  "JWT_SECRET=${JWT_SECRET}"
  "FRONTEND_URL=${FRONTEND_URL:-$APP_URL}"
)

if [[ "$HAS_VALID_CONN_STRING" -eq 1 ]]; then
  SETTINGS+=("MSSQL_CONNECTION_STRING=${MSSQL_CONNECTION_STRING}")
fi

if [[ -n "${DB_HOST:-}" && -n "${DB_NAME:-}" && -n "${DB_USER:-}" && -n "${DB_PASSWORD:-}" ]]; then
  SETTINGS+=("DB_HOST=${DB_HOST}")
  SETTINGS+=("DB_PORT=${DB_PORT:-1433}")
  SETTINGS+=("DB_NAME=${DB_NAME}")
  SETTINGS+=("DB_USER=${DB_USER}")
  SETTINGS+=("DB_PASSWORD=${DB_PASSWORD}")
fi

SETTINGS+=("MSSQL_ENCRYPT=${MSSQL_ENCRYPT:-true}")
SETTINGS+=("MSSQL_TRUST_CERT=${MSSQL_TRUST_CERT:-false}")

if [[ -n "${STRIPE_SECRET_KEY:-}" ]]; then
  SETTINGS+=("STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY}")
fi

if [[ -n "${STRIPE_WEBHOOK_SECRET:-}" ]]; then
  SETTINGS+=("STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK_SECRET}")
fi

if [[ -n "${MPIX_API_KEY:-}" ]]; then
  SETTINGS+=("MPIX_API_KEY=${MPIX_API_KEY}")
fi

if [[ -n "${MPIX_API_SECRET:-}" ]]; then
  SETTINGS+=("MPIX_API_SECRET=${MPIX_API_SECRET}")
fi

az webapp config appsettings set \
  --name "$AZURE_WEBAPP_NAME" \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --settings "${SETTINGS[@]}" \
  --output none

az webapp config set \
  --name "$AZURE_WEBAPP_NAME" \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --startup-file "npm start" \
  --output none

echo "Creating deploy package..."
rm -f appservice-deploy.zip
zip -r appservice-deploy.zip \
  server \
  dist \
  node_modules \
  package.json \
  package-lock.json \
  -x "**/.DS_Store" "**/*.log" "**/test-results/**" "**/playwright-report/**" "server/uploads/**" "server/*.db" "server/*.db.*" >/dev/null

echo "Deploying zip package..."
az webapp deploy \
  --name "$AZURE_WEBAPP_NAME" \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --src-path appservice-deploy.zip \
  --type zip \
  --output none

echo "Deployment submitted."
echo "Health check: https://${AZURE_WEBAPP_NAME}.azurewebsites.net/api/health"
