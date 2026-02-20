#!/bin/bash

# AWS Lightsail Deployment Script
# This script deploys the PhotoLab backend to AWS Lightsail

set -e

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  Photo Lab - AWS Lightsail Deployment Script               ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check prerequisites
echo -e "${YELLOW}→ Checking prerequisites...${NC}"

# Check AWS CLI
if ! command -v aws &> /dev/null; then
    echo -e "${RED}✗ AWS CLI not found${NC}"
    echo "Install from: https://aws.amazon.com/cli/"
    exit 1
fi

echo -e "${GREEN}✓ AWS CLI installed${NC}"

# Check if logged in
if ! aws sts get-caller-identity &> /dev/null; then
    echo -e "${RED}✗ Not logged into AWS${NC}"
    echo "Run: aws configure"
    exit 1
fi

echo -e "${GREEN}✓ AWS credentials configured${NC}"

# Get AWS account info
AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
AWS_REGION=$(aws configure get region)
echo -e "${GREEN}  Account: $AWS_ACCOUNT, Region: $AWS_REGION${NC}"

echo ""
echo -e "${YELLOW}═════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}  Step 1: Create Lightsail Instance${NC}"
echo -e "${YELLOW}═════════════════════════════════════════════════════════════${NC}"

read -p "Enter instance name (default: photolab-api): " INSTANCE_NAME
INSTANCE_NAME=${INSTANCE_NAME:-photolab-api}

read -p "Enter region (default: us-east-1): " REGION
REGION=${REGION:-us-east-1}

read -p "Enter availability zone (default: us-east-1a): " AZ
AZ=${AZ:-us-east-1a}

echo -e "${YELLOW}→ Creating Lightsail instance...${NC}"

# Check if instance already exists
if aws lightsail get-instances --region $REGION --query "instances[?name=='$INSTANCE_NAME']" --output json | grep -q "$INSTANCE_NAME"; then
    echo -e "${YELLOW}✓ Instance '$INSTANCE_NAME' already exists${NC}"
else
    echo -e "${YELLOW}→ Launching new instance...${NC}"
    aws lightsail create-instances \
        --instance-names "$INSTANCE_NAME" \
        --availability-zone "$AZ" \
        --blueprint-id nodejs_20_2024_01_13 \
        --bundle-id nano_3_0 \
        --region "$REGION" \
        --key-pair-name "LightsailDefaultKeyPair" || true
    
    echo -e "${YELLOW}→ Waiting for instance to start (30 seconds)...${NC}"
    sleep 30
fi

# Get instance IP
INSTANCE_IP=$(aws lightsail get-instances \
    --instance-names "$INSTANCE_NAME" \
    --region "$REGION" \
    --query 'instances[0].publicIpAddress' \
    --output text)

echo -e "${GREEN}✓ Instance IP: $INSTANCE_IP${NC}"

echo ""
echo -e "${YELLOW}═════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}  Step 2: Get Private Key${NC}"
echo -e "${YELLOW}═════════════════════════════════════════════════════════════${NC}"

read -p "Enter path to your Lightsail private key (default: ~/.ssh/LightsailDefaultKey.pem): " KEY_PATH
KEY_PATH=${KEY_PATH:-~/.ssh/LightsailDefaultKey.pem}

if [ ! -f "$KEY_PATH" ]; then
    echo -e "${RED}✗ Key not found at $KEY_PATH${NC}"
    echo "Download from Lightsail console and try again"
    exit 1
fi

chmod 600 "$KEY_PATH"
echo -e "${GREEN}✓ Private key ready${NC}"

echo ""
echo -e "${YELLOW}═════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}  Step 3: Deploy Application${NC}"
echo -e "${YELLOW}═════════════════════════════════════════════════════════════${NC}"

# Create deployment script
DEPLOY_SCRIPT=$(cat << 'DEPLOY_EOF'
#!/bin/bash
set -e

echo "Updating system..."
sudo apt-get update && sudo apt-get upgrade -y

echo "Installing dependencies..."
sudo apt-get install -y git nginx curl

echo "Installing PM2..."
sudo npm install -g pm2

echo "Creating app directory..."
mkdir -p ~/apps
cd ~/apps

echo "Cloning repository..."
if [ -d "PhotoLabReact" ]; then
    cd PhotoLabReact
    git pull origin main
    cd ..
else
    git clone https://github.com/brandoncampea/PhotoLabReact.git
fi

cd PhotoLabReact

echo "Installing node modules..."
npm ci --production

echo "Setting up environment variables..."
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

echo "Starting application with PM2..."
pm2 delete photolab-api || true
pm2 start server/server.js --name "photolab-api" --env production
pm2 startup
pm2 save

echo "Configuring Nginx..."
sudo tee /etc/nginx/sites-available/photolab > /dev/null << 'NGINX_CONF'
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX_CONF

sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -sf /etc/nginx/sites-available/photolab /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
sudo systemctl enable nginx

echo "✓ Deployment complete!"
echo ""
echo "API URL: http://$(hostname -I | awk '{print $1}')/api"
echo "Health check: http://$(hostname -I | awk '{print $1}')/api/health"

DEPLOY_EOF
)

# Copy and execute deployment script
echo -e "${YELLOW}→ Deploying to instance...${NC}"

echo "$DEPLOY_SCRIPT" | ssh -i "$KEY_PATH" -o StrictHostKeyChecking=no ubuntu@"$INSTANCE_IP" 'bash -s'

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                  ✓ Deployment Complete!                     ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}Backend URL: http://$INSTANCE_IP/api${NC}"
echo -e "${GREEN}Health Check: http://$INSTANCE_IP/api/health${NC}"
echo ""
echo "Next steps:"
echo "1. Test the API:"
echo "   curl http://$INSTANCE_IP/api/health"
echo ""
echo "2. Update frontend VITE_API_URL to:"
echo "   http://$INSTANCE_IP/api"
echo ""
echo "3. (Optional) Set up custom domain:"
echo "   - Create Lightsail Static IP"
echo "   - Point domain DNS to Static IP"
echo "   - Set up SSL with Let's Encrypt"
echo ""
echo "4. Monitor logs:"
echo "   ssh -i $KEY_PATH ubuntu@$INSTANCE_IP"
echo "   pm2 logs photolab-api"
echo ""
