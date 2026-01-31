# WHCC Integration - Quick Reference

## In 30 Seconds

1. **Get API Key**: https://developer.whcc.com (request access)
2. **Configure**: Go to `/admin/whcc-config` on your app
3. **Enable**: Toggle "Enable WHCC Integration"
4. **Enter**: Consumer Key + Consumer Secret
5. **Test**: Click "Test Connection"
6. **Save**: Save Configuration
7. **Done**: Orders automatically route to WHCC

## Admin Panel
- **URL**: `http://localhost:3000/admin/whcc-config`
- **Who**: Admin users only (protected route)
- **What**: Configure WHCC credentials and ship-from address

## Key Files

| File | What |
|------|------|
| `src/services/whccService.ts` | WHCC API calls |
| `src/services/checkoutService.ts` | Routes to WHCC, ROES, or standard |
| `src/pages/admin/AdminWhccConfig.tsx` | Admin UI |

## Checkout Code

```tsx
import { processCheckout } from '../services/checkoutService';

// Works automatically - just call it
const result = await processCheckout({
  customer: { firstName, lastName, email, phone, address },
  cartItems: cart
});

// result.provider === 'whcc' if WHCC enabled
// result.confirmationId = WHCC order ID
// result.total = Order total from WHCC
```

## WHCC API Credentials

Get from: https://developer.whcc.com

- **Consumer Key**: ~40 character alphanumeric
- **Consumer Secret**: Base64-encoded string

## Storage

Saved in browser `localStorage` under key `whccConfig`:

```json
{
  "enabled": true,
  "consumerKey": "...",
  "consumerSecret": "...",
  "isSandbox": true,
  "shipFromAddress": { "name": "...", "addr1": "..." }
}
```

## Testing

```
1. Go to /admin/whcc-config
2. Enter test credentials (or get from WHCC)
3. Click "Test Connection" → Should show ✓
4. Add item to cart
5. Click Checkout → Order sent to WHCC
6. Check WHCC sandbox dashboard for order
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "Connection failed" | Check Consumer Key/Secret in WHCC portal |
| Order not appearing | Make sure you're on correct WHCC account |
| Image errors | Images must be HTTPS URLs |
| Credentials not saving | Check browser localStorage permissions |

## Production Checklist

- [ ] Get production credentials from WHCC
- [ ] Change environment from Sandbox to Production in `/admin/whcc-config`
- [ ] Update Consumer Key/Secret to production values
- [ ] Test with sandbox first, then switch
- [ ] Configure WHCC webhooks for order tracking
- [ ] Test end-to-end with real order

## Provider Priority

Orders route to first enabled provider:

1. **WHCC** (if enabled) → WHCC API
2. **ROES** (if WHCC disabled + ROES enabled) → ROES backend
3. **Standard** (if both disabled) → Your `/orders/submit` endpoint

## Cart Item Requirements

For WHCC to work, cart items need:

```typescript
{
  id: string;
  quantity: number;
  whccProductUID: number;    // Product type (2=5x7, 3=4x6, etc.)
  imageUrl: string;          // HTTPS URL
  imageName: string;         // Filename
  whccPaperType?: number;    // Paper type UID
  whccFinish?: number;       // Finish type UID
}
```

## Customer Info Required

```typescript
{
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  address: {
    addr1: string;
    city: string;
    state: string;  // MN, NY, CA, etc.
    zip: string;
  }
}
```

## Response

Success:
```json
{
  "success": true,
  "provider": "whcc",
  "confirmationId": "d4bcb9a7-caf0-4d2b-aa18-674a5d2c527e",
  "account": "10072",
  "total": "4.42"
}
```

Error:
```json
{
  "success": false,
  "error": "WHCC authentication failed. Check credentials."
}
```

## Documentation

- 📄 [WHCC_INTEGRATION.md](./WHCC_INTEGRATION.md) — Full guide
- 📄 [CHECKOUT_INTEGRATION.md](./CHECKOUT_INTEGRATION.md) — Multi-provider overview
- 📄 [WHCC_IMPLEMENTATION_COMPLETE.md](./WHCC_IMPLEMENTATION_COMPLETE.md) — What was built

## URLs

- **Your App**: http://localhost:3000
- **Admin Panel**: http://localhost:3000/admin/whcc-config
- **WHCC Developer**: https://developer.whcc.com
- **WHCC Sandbox**: https://sandbox.apps.whcc.com (API only)

## Support

- WHCC Issues: https://developer.whcc.com
- App Issues: Check console logs + browser localStorage
- Debug: whccService.logEvent() logged to console

---

**TL;DR**: Get API key from WHCC → Enter in `/admin/whcc-config` → Click Save → Done! Orders auto-route to WHCC.
