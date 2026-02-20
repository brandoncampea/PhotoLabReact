# Heroku Deployment Guide

## Prerequisites
1. Heroku account (free): https://signup.heroku.com
2. Heroku CLI installed

## Installation

```bash
# Install Heroku CLI
npm install -g heroku

# Or using brew (if available)
brew tap heroku/brew && brew install heroku
```

## Deployment Steps

### Step 1: Login to Heroku
```bash
heroku login
```

### Step 2: Create Heroku App
```bash
cd /Users/brandoncampea/Projects/PhotoLabReact
heroku create campeaphotolab-api
```

### Step 3: Set Environment Variables
```bash
heroku config:set \
  DB_HOST=campeaphotolabsql.database.windows.net \
  DB_PORT=1433 \
  DB_NAME=campeaphotolab-test \
  DB_USER=campeaphotolab \
  DB_PASSWORD='2026SQL987$' \
  MSSQL_ENCRYPT=true \
  MSSQL_TRUST_CERT=false \
  PORT=5000 \
  JWT_SECRET=photo-lab-secret-2026
```

### Step 4: Create Procfile
Create a file named `Procfile` in the root:
```
web: cd server && node server.js
```

### Step 5: Deploy
```bash
git push heroku main
```

### Step 6: Verify
```bash
heroku logs --tail
heroku open
```

## Test Deployment
```bash
curl https://campeaphotolab-api.herokuapp.com/api/health
```

## Monitor Logs
```bash
heroku logs --tail --app campeaphotolab-api
```

## Update GitHub Actions Workflow

Update `.github/workflows/azure-backend.yml` to deploy to Heroku instead:

```yaml
name: Deploy Backend to Heroku

on:
  push:
    branches: [main]
    paths:
      - 'server/**'
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
      with:
        fetch-depth: 0

    - name: Deploy to Heroku
      uses: akhileshns/heroku-deploy@v3.12.13
      with:
        heroku_api_key: ${{ secrets.HEROKU_API_KEY }}
        heroku_app_name: campeaphotolab-api
        heroku_email: ${{ secrets.HEROKU_EMAIL }}
        appdir: ./server
```

Then add GitHub secrets:
- `HEROKU_API_KEY` - From Heroku account settings
- `HEROKU_EMAIL` - Your Heroku email
