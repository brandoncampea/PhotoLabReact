#!/bin/bash

# AWS S3 + CloudFront Deployment Script
# Usage: ./scripts/deploy-aws.sh

set -e

# Configuration
S3_BUCKET="campeaphotolab"
AWS_REGION="us-east-2"
CLOUDFRONT_DISTRIBUTION_ID="${CLOUDFRONT_DIST_ID:-}" # Set via environment variable

echo "🚀 Starting deployment to AWS S3..."

# Step 1: Build the app
echo "📦 Building application..."
npm run build

if [ ! -d "dist" ]; then
  echo "❌ Build failed: dist/ directory not found"
  exit 1
fi

echo "✅ Build successful"

# Step 2: Check AWS credentials
echo "🔐 Checking AWS credentials..."
if ! aws sts get-caller-identity &> /dev/null; then
  echo "❌ AWS credentials not configured"
  echo "Run: aws configure"
  exit 1
fi

echo "✅ AWS credentials valid"

# Step 3: Upload to S3
echo "📤 Uploading to S3 bucket: $S3_BUCKET"

# Upload assets with long cache (all files except index.html)
aws s3 sync dist/ s3://$S3_BUCKET/ \
  --region $AWS_REGION \
  --delete \
  --exclude "index.html" \
  --cache-control "public, max-age=31536000, immutable"

# Upload index.html with no cache (for React Router SPA)
aws s3 cp dist/index.html s3://$S3_BUCKET/index.html \
  --region $AWS_REGION \
  --cache-control "public, no-cache, no-store, must-revalidate" \
  --content-type "text/html"

echo "✅ Files uploaded to S3"

# Step 4: Invalidate CloudFront cache (if distribution ID provided)
if [ -n "$CLOUDFRONT_DISTRIBUTION_ID" ]; then
  echo "🔄 Invalidating CloudFront cache..."
  aws cloudfront create-invalidation \
    --distribution-id $CLOUDFRONT_DISTRIBUTION_ID \
    --paths "/*"
  echo "✅ CloudFront cache invalidated"
else
  echo "⏭️  Skipping CloudFront invalidation (set CLOUDFRONT_DIST_ID environment variable to enable)"
fi

echo "✅ Deployment complete!"
echo ""
echo "📊 Deployment Summary:"
echo "  S3 Bucket: s3://$S3_BUCKET"
echo "  Region: $AWS_REGION"
if [ -n "$CLOUDFRONT_DISTRIBUTION_ID" ]; then
  echo "  CloudFront Distribution: $CLOUDFRONT_DISTRIBUTION_ID"
fi
echo ""
echo "Next steps:"
echo "1. Verify files in S3: https://console.aws.amazon.com/s3/"
echo "2. Test your CloudFront distribution URL"
echo "3. Update DNS to point to CloudFront domain if using custom domain"
