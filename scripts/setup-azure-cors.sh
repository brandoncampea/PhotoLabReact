#!/bin/bash
# Setup Azure Blob Storage CORS for local dev
# Usage: ./scripts/setup-azure-cors.sh <storage-account-name>

set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <storage-account-name>"
  exit 1
fi

ACCOUNT_NAME="$1"

az storage cors add \
  --methods GET HEAD OPTIONS \
  --origins http://localhost:3000 \
  --services b \
  --allowed-headers '*' \
  --exposed-headers '*' \
  --max-age 3600 \
  --account-name "$ACCOUNT_NAME"

echo "CORS set for Azure Blob Storage account: $ACCOUNT_NAME"
