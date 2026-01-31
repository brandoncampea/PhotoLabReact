# Multi-Provider Checkout Integration

## Overview

Your Photo Lab app now supports multiple print fulfillment providers:

1. **WHCC** (Whitehouse Custom Colour) — Primary production partner
2. **ROES** (ROES Web Components) — Alternative editor & ordering
3. **Standard Backend** — Fallback/custom processing

**Checkout automatically routes to the first enabled provider** (priority: WHCC > ROES > Standard).

---

## Quick Start

### 1. Enable WHCC

1. Go to `/admin/whcc-config`
2. Get credentials from https://developer.whcc.com
3. Enable toggle, enter Consumer Key/Secret
4. Test connection
5. Save

### 2. Configure Checkout

Update your Cart.tsx checkout handler:

```tsx
import { processCheckout } from '../services/checkoutService';

const handleCheckout = async () => {
  try {
    const result = await processCheckout({
      customer: {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        address: {
          addr1: shippingAddress.addr1,
          city: shippingAddress.city,
          state: shippingAddress.state,
          zip: shippingAddress.zip,
        }
      },
      cartItems: cart,
    });

    console.log('Order submitted:', result.orderId);
    // result.provider === 'whcc' | 'roes' | 'standard'
  } catch (error) {
    console.error('Checkout failed:', error);
  }
};
```

---

## Provider Configuration

### WHCC (`/admin/whcc-config`)
- Consumer Key + Consumer Secret
- Environment (Sandbox/Production)
- Ship From Address
- Auto-routes orders via WHCC API

### ROES (`/admin/roes-config`)
- API Key
- Config ID (optional)
- Embedded editor at `/roes-web`
- Auto-adds items to cart

### Standard Backend
- Falls back if no providers enabled
- Endpoint: `/orders/submit`

---

## Files Reference

### Services
- **`src/services/whccService.ts`** — WHCC API integration
- **`src/services/roesService.ts`** — ROES Web Components
- **`src/services/checkoutService.ts`** — Multi-provider routing

### Admin Pages
- **`src/pages/admin/AdminWhccConfig.tsx`** — WHCC configuration
- **`src/pages/admin/AdminRoesConfig.tsx`** — ROES configuration

### Routes
- **`/admin/whcc-config`** — WHCC admin panel
- **`/admin/roes-config`** — ROES admin panel
- **`/roes-web`** — ROES embedded editor

---

## Checkout Flow

```
Customer clicks Checkout
          ↓
processCheckout({customer, cartItems})
          ↓
Check which provider enabled:
  ├─ WHCC enabled?
  │   ├─ Yes → whccService.submitCompleteOrder()
  │   │         ├─ Convert to WHCC schema
  │   │         ├─ GET /api/AccessToken
  │   │         ├─ POST /api/OrderImport
  │   │         └─ POST /api/OrderImport/Submit/{ID}
  │   └─ Return: {success, provider: 'whcc', confirmationId, total}
  │
  ├─ ROES enabled?
  │   ├─ Yes → roesService.submitOrderThroughBackend()
  │   │         └─ POST /orders/roes-submit (backend forwards to ROES)
  │   └─ Return: {success, provider: 'roes', orderId}
  │
  └─ Standard enabled?
      ├─ Yes → submitOrderThroughStandardBackend()
      │         └─ POST /orders/submit (your backend)
      └─ Return: {success, provider: 'standard', orderId}
```

---

## Configuration Storage

### localStorage Keys
- `whccConfig` — WHCC credentials & settings
- `roesConfig` — ROES API key & settings

### Format
```typescript
// localStorage.whccConfig
{
  enabled: boolean;
  consumerKey: string;
  consumerSecret: string;
  isSandbox: boolean;
  shipFromAddress: {
    name: string;
    addr1: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  }
}

// localStorage.roesConfig
{
  enabled: boolean;
  apiKey: string;
  configId?: string;
}
```

---

## Testing Each Provider

### Test WHCC
1. `/admin/whcc-config` → Test Connection button
2. Add item to cart
3. Checkout → Should submit to WHCC Sandbox
4. Check WHCC dashboard for order

### Test ROES
1. `/admin/roes-config` → Enable + set API key
2. `/roes-web` → Load sample product/images
3. Editor emits add_to_cart → Item auto-adds to cart
4. Checkout → Orders to ROES backend

### Test Standard
1. Disable both WHCC and ROES
2. Add item to cart
3. Checkout → POST /orders/submit on your backend

---

## Environment Variables (Optional)

For production, use env vars instead of localStorage:

```bash
# WHCC
VITE_WHCC_CONSUMER_KEY=your-key
VITE_WHCC_CONSUMER_SECRET=your-secret
VITE_WHCC_SANDBOX=false

# ROES
VITE_ROES_API_KEY=your-key
```

Update services to check env vars first:

```typescript
const key = import.meta.env.VITE_WHCC_CONSUMER_KEY || localStorage.whccConfig?.consumerKey;
```

---

## Response Objects

### Success Response
```typescript
{
  success: true,
  provider: 'whcc' | 'roes' | 'standard',
  orderId: string;
  confirmationId?: string;      // WHCC
  total?: string;               // WHCC (price)
  account?: string;             // WHCC (account ID)
  // ... provider-specific fields
}
```

### Error Response
```typescript
throw new Error('checkout error message');
// Log via:
// whccService.logEvent('checkout_failed', {error})
// roesService.logEvent('checkout_failed', {error})
```

---

## Integration Checklist

### WHCC Setup
- [ ] Get API credentials from WHCC Developer Portal
- [ ] Configure in `/admin/whcc-config`
- [ ] Test connection
- [ ] Map your products to WHCC ProductUIDs
- [ ] Upload sample images to S3 (or file server)
- [ ] Test sandbox orders
- [ ] Switch to production credentials
- [ ] Configure WHCC webhooks for status updates

### ROES Setup
- [ ] Get API key from ROES (if applicable)
- [ ] Configure in `/admin/roes-config`
- [ ] Test `/roes-web` page
- [ ] Verify add_to_cart events populate cart
- [ ] Backend endpoint `/orders/roes-submit` created

### Checkout Integration
- [ ] Update Cart/Checkout component to call `processCheckout()`
- [ ] Handle success response (redirect, show order ID)
- [ ] Handle error responses (show error message)
- [ ] Test all three providers
- [ ] Verify customer receives confirmation email

### Production
- [ ] Move credentials to environment variables
- [ ] Test end-to-end with real orders
- [ ] Set up order tracking/webhooks
- [ ] Configure error logging
- [ ] Document provider-specific requirements

---

## Troubleshooting

### "Provider not enabled"
- Check `/admin/whcc-config` or `/admin/roes-config`
- Enable toggle + save
- Verify credentials saved to localStorage

### "Invalid credentials"
- WHCC: Verify Consumer Key/Secret from developer portal
- ROES: Verify API key is active
- Test in provider's dashboard first

### "Order not appearing"
- WHCC: Check WHCC dashboard (sandbox vs prod)
- ROES: Check backend `/orders/roes-submit` endpoint
- Standard: Check your backend logs

### Images not printing
- Must be HTTPS URLs (no mixed content)
- WHCC requires MD5 hash (currently placeholder)
- Calculate actual MD5 in production

---

## Next Steps

1. **Get WHCC API credentials** → https://developer.whcc.com
2. **Configure in admin panel** → `/admin/whcc-config`
3. **Update checkout handler** → `processCheckout()` call
4. **Test sandbox** → `/admin/whcc-config` → Test Connection
5. **Go live** → Switch to production credentials

---

## Documentation Links

- [WHCC Integration Guide](./WHCC_INTEGRATION.md)
- [ROES Integration Guide](./ROES_CART_INTEGRATION.md)
- [WHCC Developer Docs](https://developer.whcc.com)
- [ROES Web Components](https://roeswebtest.com)
