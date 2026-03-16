#!/bin/bash
# Inject VITE_APP_VERSION from package.json and latest git commit hash
PACKAGE_VERSION=$(jq -r .version package.json)
GIT_COMMIT=$(git rev-parse --short HEAD)
VERSION_STRING="$PACKAGE_VERSION-$GIT_COMMIT"

# Write to .env.local (preserve other envs)
grep -v '^VITE_APP_VERSION=' .env.local > .env.local.tmp
mv .env.local.tmp .env.local

echo "VITE_APP_VERSION=$VERSION_STRING" >> .env.local

echo "Injected VITE_APP_VERSION=$VERSION_STRING"
