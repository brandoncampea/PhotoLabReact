# Security Implementation Guide

This document outlines the security improvements implemented in Photo Lab React to protect your APIs from unauthorized access and common web vulnerabilities.

## Security Features Implemented

### 1. Authentication & Authorization

**Session-Based + JWT Authentication**
- All protected API routes require either a valid session cookie or JWT token
- Two authentication methods supported:
  - Session-based (recommended for browser clients): Stored in HTTP-only cookies
  - JWT-based: Sent via `Authorization: Bearer {token}` header
- User roles enforced: `customer`, `studio_admin`, `admin`, `super_admin`

**Example Protected Route:**
```javascript
import { authRequired, adminRequired } from '../middleware/auth.js';

// All authenticated users can access
router.get('/api/profile', authRequired, (req, res) => {
  res.json(req.user);
});

// Admin-only access
router.get('/api/admin/users', adminRequired, (req, res) => {
  // ...
});
```

**Dev Mode Security Note:**
- Development mode (`NODE_ENV !== 'production'`) no longer auto-approves requests with invalid tokens
- All requests require explicit authentication even in development
- Use the login endpoint to obtain valid tokens for testing

### 2. Security Headers (Helmet.js)

Automatically adds HTTP security headers:
- **Content-Security-Policy**: Prevents inline scripts and restricts resource loading
- **X-Frame-Options**: `DENY` - Prevents clickjacking attacks
- **X-Content-Type-Options**: `nosniff` - Prevents MIME type sniffing
- **Strict-Transport-Security** (HSTS): Enforces HTTPS (31536000 seconds)
- **Referrer-Policy**: `strict-origin-when-cross-origin` - Controls referrer information

### 3. CORS (Cross-Origin Resource Sharing)

**Whitelist-Based CORS**
```javascript
const allowedOrigins = [
  'http://localhost:3004',      // Dev frontend
  'https://labs.campeaphotography.com', // Production
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'), false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-acting-studio-id'],
}));
```

**Configuration:**
- Dev origins (localhost) only included when `NODE_ENV !== 'production'`
- Production strictly limits to whitelisted HTTPS origins
- Add your frontend URLs to `allowedOrigins` array in [server/server.mjs](server/server.mjs#L132)

### 4. Rate Limiting

**Global Rate Limiting**
- 100 requests per 15-minute window per IP
- Health check endpoints (`/health`, `/api/health`) excluded
- Responds with HTTP 429 when limit exceeded

**Strict Auth Rate Limiting**
- 5 failed login attempts per 15 minutes per IP
- Applies to: `/api/auth/login`, `/api/auth/register`, `/api/auth/reset-password`
- Prevents brute force attacks

**Testing Rate Limits:**
```bash
# Trigger rate limit with multiple requests
for i in {1..101}; do curl http://localhost:3000/api/; done
# Will see: 429 Too Many Requests (after 100 requests)
```

### 5. Session Security

**Session Configuration**
```javascript
app.use(session({
  secret: process.env.SESSION_SECRET,  // Required - must be set in .env.local
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,                    // Cannot be accessed by JavaScript
    secure: isProduction,              // HTTPS-only in production
    sameSite: isProduction ? 'strict' : 'lax',  // CSRF protection
    maxAge: 1000 * 60 * 60 * 24 * 7   // 1 week expiration
  }
}));
```

**Requirements:**
- `SESSION_SECRET` environment variable must be set (will throw error if missing in production)
- In production, sessions only sent over HTTPS
- `SameSite: strict` in production prevents CSRF attacks

### 6. Input Validation & Sanitization

**Sanitization Utilities** ([server/utils/sanitization.js](server/utils/sanitization.js))

Available functions:
- `sanitizeString(input, maxLength)` - Escapes HTML, limits length
- `sanitizeEmail(input)` - Validates and normalizes email format
- `sanitizeUrl(input)` - Validates URL format and protocol
- `sanitizeNumber(input, min, max)` - Validates numeric ranges
- `sanitizeInteger(input, min, max)` - Validates integer ranges
- `sanitizeBoolean(input)` - Converts to boolean safely
- `sanitizeStringArray(input, maxItems, maxItemLength)` - Array of strings
- `sanitizeObject(obj, schema)` - Batch sanitization with schema

**Usage Example:**
```javascript
import { sanitizeObject, sanitizeEmail } from '../utils/sanitization.js';

// Single field sanitization
const email = sanitizeEmail(req.body.email);

// Batch sanitization
const schema = {
  name: 'string',
  email: 'email',
  price: 'number',
  quantity: 'integer',
  is_published: 'boolean',
};
const sanitized = sanitizeObject(req.body, schema);
```

**Recommended: Apply to public endpoints**
- Search endpoints: Sanitize search queries
- Form submissions: Validate all user inputs
- Admin endpoints: Validate IDs and filters

### 7. Token Encryption

**Social Media Integration Tokens** (Instagram, SmugMug)

Tokens stored encrypted in database using AES-256-GCM:
```javascript
import { encryptToken, decryptToken } from '../utils/socialTokenCrypto.js';

// Store encrypted
const encrypted = encryptToken(accessToken);
db.save({ access_token: encrypted });

// Retrieve and decrypt
const encrypted = db.get().access_token;
const plaintext = decryptToken(encrypted);
```

Encryption key derived from environment variables:
- `SOCIAL_TOKEN_ENCRYPTION_KEY` (preferred)
- Falls back to `INSTAGRAM_TOKEN_ENCRYPTION_KEY`
- Falls back to `JWT_SECRET`

### 8. HTTPS in Production

**Requirements:**
- Production deployment must use HTTPS
- All `secure: true` cookie flags will only work over HTTPS
- Ensure your proxy/load balancer properly forwards HTTPS headers

**Testing HTTPS Locally:**
```bash
# Generate self-signed certificate (macOS)
openssl req -x509 -newkey rsa:4096 -nodes -out cert.pem -keyout key.pem -days 365

# Start server with HTTPS (requires code changes to add https module)
```

## Environment Variables

**Critical Security Variables** (must be set before deployment):

| Variable | Purpose | Production Required |
|----------|---------|-------------------|
| `JWT_SECRET` | Signing JWT tokens | ✅ Yes |
| `SESSION_SECRET` | Encrypting session data | ✅ Yes |
| `NODE_ENV` | Set to `production` | ✅ Yes |
| `SOCIAL_TOKEN_ENCRYPTION_KEY` | Encrypt OAuth tokens | ✅ Yes |

**Generate Secure Random Values:**
```bash
# Generate 32-character secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## API Security Checklist

### Before Deploying to Production

- [ ] Set `NODE_ENV=production`
- [ ] Generate and set `JWT_SECRET` (minimum 32 characters)
- [ ] Generate and set `SESSION_SECRET` (minimum 32 characters)
- [ ] Generate and set `SOCIAL_TOKEN_ENCRYPTION_KEY` (minimum 32 characters)
- [ ] Configure `FRONTEND_URL` to production domain
- [ ] Update CORS whitelist to only include production origins
- [ ] Enable HTTPS on your server/proxy
- [ ] Update session `secure: true` (automatic when NODE_ENV=production)
- [ ] Test authentication flows with valid credentials
- [ ] Verify rate limiting prevents brute force
- [ ] Scan for sensitive data in logs (credentials should never be logged)
- [ ] Enable database encryption (if using Azure SQL, enable Transparent Data Encryption)
- [ ] Set up WAF (Web Application Firewall) rules if available
- [ ] Review and minimize admin access permissions
- [ ] Set up security monitoring and alerts

### Development Mode

- Session `secure: false` (works over HTTP)
- CORS includes localhost origins
- Rate limiting still active (but higher limits for testing)
- Authentication still required (no dev fallback bypass)

## Common Security Issues & Fixes

### Issue: "Invalid token" / "Authentication required"

**Causes:**
1. JWT_SECRET changed (tokens from before change are invalid)
2. Session expired (check maxAge: 7 days default)
3. Missing Authorization header
4. Token sent via GET parameter instead of header

**Fix:**
```javascript
// ❌ Wrong - token in query string
GET /api/protected?token=xyz

// ✅ Correct - token in header
GET /api/protected
Authorization: Bearer xyz
```

### Issue: CORS errors in browser console

**Cause:** Frontend origin not in CORS whitelist

**Fix:** Add your frontend URL to `allowedOrigins` in [server/server.mjs](server/server.mjs#L132):
```javascript
const allowedOrigins = [
  'https://your-frontend.com',  // Add this
  'https://labs.campeaphotography.com',
];
```

### Issue: Rate limit 429 errors during testing

**Cause:** Exceeded 5 failed login attempts or 100 general requests in 15 minutes

**Fix:**
1. Wait 15 minutes, OR
2. Use different IP address (for development), OR
3. Modify rate limiter in [server/server.mjs](server/server.mjs#L116-L130) for testing

### Issue: "SESSION_SECRET is required in production"

**Cause:** Production deployment without SESSION_SECRET environment variable

**Fix:** Set `SESSION_SECRET` in your deployment environment before starting server:
```bash
# Azure App Service: Settings → Configuration → New application setting
SESSION_SECRET=your-generated-secret-here

# Or in .env.local for local production testing
SESSION_SECRET=your-generated-secret-here
```

## Monitoring & Alerts

Consider implementing:
1. Failed login attempt tracking
2. Rate limit metric collection
3. Audit log for admin operations
4. Security event notifications
5. Regular dependency vulnerability scans (`npm audit`)

## Additional Resources

- [OWASP Top 10](https://owasp.org/Top10/) - Most critical web security risks
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
- [Helmet.js Documentation](https://helmetjs.github.io/)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)

## Questions or Issues?

If you encounter security-related issues:
1. Check the [SECURITY.md](SECURITY.md) checklist
2. Review environment variables are correctly set
3. Check browser console for CORS errors
4. Check server logs for authentication failures
5. Verify NODE_ENV setting matches deployment stage
