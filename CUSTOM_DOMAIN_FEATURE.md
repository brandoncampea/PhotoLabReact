# Custom Domain Feature Documentation

## Overview
Studios can now configure custom domains that automatically redirect to their albums gallery page. This allows studios to create branded access points to their albums, such as `photos.yourstudio.com` or `gallery.yourcompany.com`.

## How It Works

### Architecture
1. **Domain Configuration**: Studios enter their custom domain in the Profile Settings page
2. **Storage**: The custom domain is stored in the `profile_config` table (`custom_domain` column)
3. **Request Handling**: When a request comes in with a matching custom domain, a middleware redirects to `/albums?studioSlug=STUDIO_SLUG`
4. **Album Access**: The albums page loads with the correct studio's content

### Flow Diagram
```
User visits: https://labs.campeaphotography.com
                    ↓
Browser sends Host header: labs.campeaphotography.com
                    ↓
customDomainRedirect middleware checks profile_config
                    ↓
Finds matching studio with public_slug="campea-photography"
                    ↓
Redirects (307) to: /albums?studioSlug=campea-photography
                    ↓
User sees studio's albums page
```

## Implementation Details

### Files Modified

#### 1. **src/types/index.ts**
- Added `customDomain?: string` to `ProfileConfig` interface

#### 2. **server/routes/profile.js**
- Added `custom_domain` column creation to `ensureProfileConfigTable()` 
- Added customDomain to all SELECT queries in GET `/profile`
- Added customDomain handling in PUT `/profile` with domain validation
- Domain regex validation ensures proper format (e.g., `labs.example.com`)

#### 3. **src/pages/admin/AdminProfile.tsx**
- Added `customDomain` state variable
- Added form input field for custom domain
- Added comprehensive DNS configuration instructions with:
  - Step-by-step guide for common registrars
  - CNAME record example
  - Tips for using subdomains
  - Expected propagation time (24-48 hours)
- Included helpful info box with DNS setup details

#### 4. **server/middleware/customDomainRedirect.js** (NEW)
- Express middleware that checks request Host header
- Queries `profile_config` table for matching custom domain
- Performs 307 redirect to albums page with studioSlug parameter
- Gracefully skips API requests, uploads, and static assets

#### 5. **server/server.mjs**
- Imported `customDomainRedirect` middleware
- Applied middleware early in request chain (after JSON parsing, before API routes)

### Database Schema
```sql
-- Added to profile_config table:
custom_domain NVARCHAR(255) NULL
```

## Usage Guide

### For Studio Admins

#### Setting Up a Custom Domain

1. **Choose a Domain**
   - Go to **Profile Settings** in your Admin Dashboard
   - Find the **Custom Domain** field

2. **Enter Your Domain**
   - Enter your domain (e.g., `photos.yourstudio.com`)
   - Leave blank to disable custom domain
   - Click **Save Profile**

3. **Configure DNS**
   Follow these steps at your domain registrar (GoDaddy, Namecheap, etc.):
   - Go to DNS Settings
   - Add a **CNAME record**
   - Point it to: `labs.campeaphotography.com`
   - Wait 24-48 hours for DNS propagation

4. **Test**
   - Visit your custom domain in a browser
   - You should be redirected to your albums page

#### Example Configurations

**Using a Subdomain** (Recommended)
- Domain: `photos.mysite.com`
- CNAME: `photos.mysite.com` → `labs.campeaphotography.com`
- Result: https://photos.mysite.com redirects to albums

**Using a Full Domain**
- Domain: `photography.studio`
- CNAME: `photography.studio` → `labs.campeaphotography.com`
- Result: https://photography.studio redirects to albums

### For Developers

#### Domain Validation
The custom domain is validated on the server side using a regex pattern:
```javascript
const domainRegex = /^([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
```

This ensures domains follow standard format rules.

#### Middleware Behavior
The `customDomainRedirect` middleware:
- Runs early in the request pipeline
- Skips API requests (`/api/*`)
- Skips static assets and uploads
- Uses 307 (Temporary) redirects for user customization
- Logs errors but doesn't break the request

#### Database Query
```javascript
SELECT id, public_slug, custom_domain 
FROM profile_config 
WHERE custom_domain = $1 AND custom_domain IS NOT NULL
```

## Security Considerations

1. **HTTPS**: Ensure your domain is SSL-configured for security
2. **Validation**: Domain format is validated server-side
3. **Uniqueness**: Multiple studios can use different custom domains
4. **Ownership**: DNS CNAME configuration acts as proof of domain ownership
5. **API Bypass**: API requests aren't affected by custom domain redirects

## Testing

### Manual Testing Steps

1. **Add a Custom Domain**
   - Login as studio admin
   - Go to Profile Settings
   - Enter test domain: `test.example.com`
   - Save changes

2. **Verify in Database**
   ```sql
   SELECT custom_domain FROM profile_config WHERE studio_id = 1;
   ```

3. **Local Testing with Hosts File**
   - Edit `/etc/hosts` (Mac/Linux) or `C:\Windows\System32\drivers\etc\hosts` (Windows)
   - Add: `127.0.0.1 test.example.com`
   - Visit `http://test.example.com:3000` locally
   - Should redirect to `/albums?studioSlug=your-slug`

### Error Scenarios Handled

| Scenario | Behavior |
|----------|----------|
| Domain not found in DB | Request proceeds normally |
| Custom domain field NULL | Request proceeds normally |
| Database connection error | Request proceeds normally (safe fail) |
| Invalid Host header | Request proceeds normally |
| API request with custom domain | Bypassed, API route handles request |

## Troubleshooting

### Domain Not Redirecting

**Problem**: Visiting custom domain shows error instead of redirecting

**Solutions**:
1. Verify DNS CNAME is correctly configured (use `nslookup` or `dig` to check)
2. Wait 24-48 hours for DNS propagation
3. Clear browser cache
4. Verify domain is entered correctly in Profile Settings
5. Check that `public_slug` is set for the studio

### Redirect Loop

**Problem**: Website keeps redirecting infinitely

**Solution**: This shouldn't happen, but if it does:
1. The middleware checks Host header only, not path
2. Verify your CNAME points to the correct application host
3. Check for custom domain field being accidentally duplicated

### Domain Shows Blank Page

**Problem**: Domain redirects but shows no content

**Solution**:
1. Verify studio has albums
2. Check that `studioSlug` parameter is correctly passed
3. Verify albums page loads normally with direct URL

## Future Enhancements

- SSL certificate auto-provisioning via Let's Encrypt
- Domain verification with automatic record checking
- Custom domain statistics/analytics
- Support for root domain (not just subdomains)
- Admin interface to manage all custom domains across studios
- Domain expiration warnings

## Support

For issues with custom domains, check:
1. DNS configuration is correct (CNAME record)
2. Studio has a public_slug configured
3. Studio has at least one album
4. Custom domain field is saved in Profile Settings
5. Browser cache is cleared

Contact support with the following info:
- Studio name
- Custom domain being configured
- Current DNS CNAME configuration
- Screenshots of the issue
