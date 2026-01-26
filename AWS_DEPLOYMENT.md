# AWS Deployment Setup Guide

## Prerequisites

1. **AWS CLI** - Install via:
   ```bash
   # macOS with Homebrew (if available)
   brew install awscli
   
   # Or download from: https://aws.amazon.com/cli/
   ```

2. **AWS Credentials** - Configure with:
   ```bash
   aws configure
   # Enter your AWS Access Key ID
   # Enter your AWS Secret Access Key
   # Default region: us-east-2
   # Default output format: json
   ```

## Setup Steps

### 1. Create S3 Bucket
```bash
aws s3 mb s3://campeaphotolab --region us-east-2
```

### 2. Enable Static Website Hosting
```bash
aws s3 website s3://campeaphotolab/ \
  --index-document index.html \
  --error-document index.html
```

### 3. Configure Bucket Policy (Allow Public Access)
Save as `bucket-policy.json`:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicRead",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::campeaphotolab/*"
    }
  ]
}
```

Apply it:
```bash
aws s3api put-bucket-policy \
  --bucket campeaphotolab \
  --policy file://bucket-policy.json
```

### 4. Create CloudFront Distribution (Optional but Recommended)
- Go to AWS Console → CloudFront
- Create Distribution
- Origin: Select your S3 bucket
- Default Root Object: `index.html`
- Add custom error response:
  - 404 → index.html (for React Router)

### 5. Update Environment Variables
Edit `.env.production`:
```
VITE_API_URL=https://your-api-domain.com/api
```

## Deployment Methods

### Option A: Manual Deployment (Bash Script)
```bash
# Set CloudFront distribution ID (optional)
export CLOUDFRONT_DIST_ID="your-distribution-id"

# Deploy
./scripts/deploy-aws.sh
```

### Option B: Automated GitHub Actions (CI/CD)

1. Add GitHub Secrets:
   - `AWS_ACCESS_KEY_ID` - Your AWS access key
   - `AWS_SECRET_ACCESS_KEY` - Your AWS secret key
   - `VITE_API_URL` - Your production API URL

2. Add GitHub Variables:
   - `CLOUDFRONT_DISTRIBUTION_ID` - Your CloudFront distribution ID (optional)

3. Workflow triggers automatically on:
   - Push to `main` branch
   - Manual trigger via GitHub Actions tab

## Verification

After deployment:

1. **Check S3 files:**
   ```bash
   aws s3 ls s3://campeaphotolab/ --recursive
   ```

2. **Test S3 website URL:**
   ```
   http://campeaphotolab.s3-website.us-east-2.amazonaws.com
   ```

3. **Test CloudFront URL:**
   - Check CloudFront Distribution in AWS Console
   - Use the domain name provided

4. **Custom Domain (Optional):**
   - Update Route 53 or your DNS provider
   - Point domain to CloudFront distribution

## Troubleshooting

**"AWS credentials not configured"**
```bash
aws configure
```

**"Access Denied" uploading to S3**
- Check IAM user permissions
- Ensure user has S3:PutObject, S3:DeleteObject permissions

**CloudFront showing old files**
- Invalidate cache: AWS Console → CloudFront → Invalidations → Create

**CORS errors**
- Configure CORS in your ASP.NET backend API
- Add CloudFront domain to allowed origins

## Rollback

To restore previous version:
```bash
# View previous deployments in S3 version history
aws s3api list-object-versions --bucket campeaphotolab

# Restore a specific version if versioning is enabled
```

## Cost Estimation

- **S3 Storage**: ~$0.023/GB/month (first 50TB)
- **Data Transfer**: ~$0.085/GB (outbound)
- **CloudFront**: ~$0.085/GB (first 10TB/month)
- **Typical app**: $1-5/month

## Next Steps

1. Set up monitoring: CloudWatch, S3 access logs
2. Configure backup: S3 versioning or cross-region replication
3. Set up DNS: Point your domain to CloudFront
4. Enable HTTPS: CloudFront provides free SSL/TLS
