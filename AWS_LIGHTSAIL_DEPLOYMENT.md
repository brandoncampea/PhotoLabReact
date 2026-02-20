# AWS Lightsail Deployment Guide

## Overview
AWS Lightsail is perfect for small Node.js applications. Cost: $3.50-7/month with no quota restrictions.

## Prerequisites
1. AWS Account (free tier available)
2. AWS CLI installed (optional but helpful)

## Step 1: Create Lightsail Instance

### Via AWS Console:

1. Go to: https://lightsail.aws.amazon.com
2. Click **"Create Instance"**
3. Select:
   - **Location**: Pick closest region (e.g., us-east-1)
   - **Platform**: Linux
   - **Blueprint**: Node.js
   - **Instance Plan**: $3.50/month (512 MB RAM, 20GB SSD)
   - **Instance Name**: `photolab-api`
4. Click **"Create Instance"**

Wait 2-3 minutes for the instance to start.

---

## Step 2: Connect to Your Instance

### Option A: Browser Terminal (Easiest)
1. In Lightsail Console, click your instance
2. Click **"Connect using SSH"** button
3. Browser terminal opens automatically

### Option B: SSH from Terminal
1. Download private key from instance details
2. Run:
```bash
chmod 600 ~/path/to/LightsailDefaultKey.pem
ssh -i ~/path/to/LightsailDefaultKey.pem ubuntu@your-instance-ip
```

---

## Step 3: Setup Node.js Environment

In the SSH terminal:

```bash
# Update system
sudo apt-get update && sudo apt-get upgrade -y

# Install Node.js (already included, but verify)
node --version
npm --version

# Install git
sudo apt-get install -y git

# Install PM2 (process manager)
sudo npm install -g pm2

# Create app directory
mkdir -p ~/apps
cd ~/apps
```

---

## Step 4: Clone and Deploy Your Code

```bash
# Clone your repository
git clone https://github.com/brandoncampea/PhotoLabReact.git
cd PhotoLabReact

# Install production dependencies
npm ci --production

# Set environment variables
cat > .env << EOF
DB_HOST=campeaphotolabsql.database.windows.net
DB_PORT=1433
DB_NAME=campeaphotolab-test
DB_USER=campeaphotolab
DB_PASSWORD=2026SQL987$
MSSQL_ENCRYPT=true
MSSQL_TRUST_CERT=false
PORT=3001
JWT_SECRET=photo-lab-secret-2026
NODE_ENV=production
EOF

# Start with PM2
pm2 start server/server.js --name "photolab-api"

# Setup PM2 to auto-start on reboot
pm2 startup
pm2 save

# View logs
pm2 logs photolab-api
```

---

## Step 5: Setup Nginx Reverse Proxy

Nginx will handle incoming requests on port 80/443:

```bash
# Install Nginx
sudo apt-get install -y nginx

# Create Nginx config
sudo tee /etc/nginx/sites-available/photolab << EOF
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

# Enable the config
sudo ln -s /etc/nginx/sites-available/photolab /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test Nginx config
sudo nginx -t

# Start Nginx
sudo systemctl start nginx
sudo systemctl enable nginx
```

---

## Step 6: Configure Firewall

In Lightsail Console:

1. Click your instance
2. Go to **"Networking"** tab
3. Add inbound rules:
   - **HTTP**: Port 80 (already added)
   - **HTTPS**: Port 443 (add if using SSL)
   - **SSH**: Port 22 (already added)

---

## Step 7: Get Your Public IP

In Lightsail Console:
1. Click your instance
2. Look for **"Public IP"** (e.g., 54.123.45.67)

Your backend is now at: **http://54.123.45.67/api**

---

## Step 8: Setup SSL (Optional but Recommended)

Use Let's Encrypt for free HTTPS:

```bash
# Install Certbot
sudo apt-get install -y certbot python3-certbot-nginx

# Get certificate (replace with your domain if you have one)
# For now, skip this if you don't have a domain

# Or use Lightsail's static IP + domain:
# 1. In Lightsail, create a Static IP
# 2. Point your domain to that IP
# 3. Then run: sudo certbot --nginx -d yourdomain.com
```

---

## Step 9: Test Your API

```bash
# From your local terminal
curl http://YOUR_LIGHTSAIL_IP/api/health

# Should return:
# {"status":"ok","message":"Photo Lab API root","docs":"/api/health"}
```

---

## Step 10: Update Frontend API URL

Update your frontend to use the new API:

**In GitHub:**
1. Go to Settings → Secrets and variables → Actions
2. Update `VITE_API_URL`: `http://YOUR_LIGHTSAIL_IP/api`
3. Frontend will auto-deploy

Or locally:
```bash
# Update .env.production
echo "VITE_API_URL=http://YOUR_LIGHTSAIL_IP/api" > .env.production

# Build and deploy
npm run build
```

---

## Useful Commands

### View Logs
```bash
pm2 logs photolab-api
tail -f /var/log/nginx/access.log
```

### Restart Application
```bash
pm2 restart photolab-api
sudo systemctl restart nginx
```

### Update Code
```bash
cd ~/apps/PhotoLabReact
git pull origin main
npm ci --production
pm2 restart photolab-api
```

### Monitor Performance
```bash
pm2 monit
```

---

## Security Considerations

1. **Use HTTPS**: Set up SSL certificate with Let's Encrypt
2. **Use Static IP**: Assign static IP in Lightsail (free)
3. **Backup Database Connection**: Ensure firewall allows Azure SQL access
4. **Monitor Logs**: Check PM2 and Nginx logs regularly

---

## Cost Breakdown

- **Lightsail Instance** (512MB): $3.50/month
- **Static IP** (optional): Free for 1 instance
- **Data Transfer**: Included (1TB/month)
- **Total**: ~$3.50/month

---

## Troubleshooting

### App not starting?
```bash
pm2 logs photolab-api
# Check for errors
```

### Can't connect to database?
```bash
# Verify environment variables
cat ~/.env

# Check Azure SQL firewall allows Lightsail IP
# In Azure Portal → SQL Server → Firewall rules
# Add: Lightsail public IP
```

### Nginx returning 502 errors?
```bash
sudo nginx -t
sudo systemctl restart nginx
pm2 restart photolab-api
```

### Port already in use?
```bash
sudo lsof -i :3001
# Kill conflicting process
sudo kill -9 PID
```

---

## Next Steps

1. Create Lightsail instance
2. SSH into instance
3. Follow deployment steps
4. Test API endpoint
5. Update frontend API URL
6. Monitor logs in PM2/Nginx

**You're ready to go!** 🚀
