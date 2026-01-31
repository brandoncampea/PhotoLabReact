# ROES Cart Integration Guide

## Overview
Complete cart integration for submitting orders through ROES Web Components (RWC) when enabled, or through standard backend when disabled.

**Status**: Code created and ready to integrate. Admin panel (`/admin/roes-config`) is functional.

---

## What Was Built

### Services Created

1. **`src/services/roesService.ts`** — Core ROES integration
   - `getConfig()` / `isEnabled()` — Check if ROES is active (reads from localStorage)
   - `convertCartToRoesOrder(cartItems, customer)` — Transform cart items to ROES format
   - `submitOrderThroughBackend(payload)` — POST to `/orders/roes-submit` endpoint
   - `logEvent(eventName, data)` — Debug logging

2. **`src/services/checkoutService.ts`** — Checkout orchestration
   - `processCheckout(request)` — Main function that auto-routes to ROES or standard backend
   - `useCheckout()` — React hook for checkout handling

3. **`src/hooks/useRoesConfig.ts`** — React hook
   - Reads ROES config from localStorage
   - Listens for storage changes (admin panel updates)
   - Returns `{ config, isEnabled }`

### Components Updated

- **`src/pages/RoesWeb.tsx`** — Now integrates with CartContext
  - Listens for `add_to_cart` events from ROES
  - Automatically adds items to app cart when ROES is enabled
  - Logs events via `roesService.logEvent()`

### Example Component

- **`src/components/CheckoutWithRoesExample.tsx`** — Reference implementation showing how to use `processCheckout()`

---

## How It Works

### Flow Diagram

```
Customer edits in /roes-web
           ↓
ROES emits "add_to_cart" event
           ↓
RoesWeb.tsx listener transforms payload
           ↓
CartContext.addItem() called
           ↓
Item added to app cart
           ↓
Customer clicks "Checkout"
           ↓
processCheckout() checks roesService.isEnabled()
           ↓
If ROES enabled → POST /orders/roes-submit (backend forwards to ROES)
If ROES disabled → POST /orders/submit (standard backend)
           ↓
Order submitted
```

### Admin Configuration

Admins manage ROES via `/admin/roes-config`:
- Toggle ROES on/off
- Set API key
- Set config ID (optional)
- Test connection button

Config stored in localStorage: `localStorage['roesConfig'] = { apiKey, configId, enabled }`

---

## Next Steps — What You Need to Decide

### Option 1: Integrate into Existing Cart Page
Update your current `src/pages/Cart.tsx` (or checkout component) to use `processCheckout()`:

```tsx
import { processCheckout } from '../services/checkoutService';

const handleCheckout = async () => {
  const result = await processCheckout({
    customer: { firstName, lastName, email, phone },
    cartItems: cart,
    notes: 'Optional notes'
  });
  // Handle result
};
```

### Option 2: Create Backend Endpoint
Create `/orders/roes-submit` endpoint on your Node.js backend:

```javascript
// server/routes/orders.js
router.post('/roes-submit', async (req, res) => {
  const { roesOrder } = req.body;
  
  // Option A: Forward to ROES directly
  // Option B: Process locally and store in DB
  // Option C: Both (store + forward)
  
  res.json({ orderId: '...', status: 'submitted' });
});
```

### Option 3: Both
Do both integrations together.

---

## Key Files Reference

| File | Purpose | Status |
|------|---------|--------|
| `src/services/roesService.ts` | Core ROES logic | ✅ Created |
| `src/services/checkoutService.ts` | Checkout routing | ✅ Created |
| `src/hooks/useRoesConfig.ts` | Config hook | ✅ Created |
| `src/components/CheckoutWithRoesExample.tsx` | Reference code | ✅ Created |
| `src/pages/RoesWeb.tsx` | Updated to add to cart | ✅ Updated |
| `src/pages/admin/AdminRoesConfig.tsx` | Admin panel | ✅ Exists |
| `server/routes/orders.js` | Backend endpoint | ❌ Needs creation |
| `src/pages/Cart.tsx` | Checkout integration | ❌ Needs update |

---

## Usage Examples

### Check if ROES is enabled
```tsx
import { roesService } from '../services/roesService';

if (roesService.isEnabled()) {
  console.log('ROES is active');
}
```

### Process checkout (auto-routes)
```tsx
import { processCheckout } from '../services/checkoutService';

const result = await processCheckout({
  customer: { firstName, lastName, email, phone },
  cartItems: cart,
  shippingAddress: { ... },
  notes: 'Order notes'
});

console.log(result.orderId); // Order ID from backend
```

### Use the hook
```tsx
import { useRoesConfig } from '../hooks/useRoesConfig';

const { config, isEnabled } = useRoesConfig();

return (
  <div>
    {isEnabled && <p>✓ ROES enabled</p>}
  </div>
);
```

---

## Config Schema

### localStorage['roesConfig']
```typescript
{
  apiKey: string;      // ROES API key (long hex string)
  configId: string;    // Optional ROES config ID
  enabled: boolean;    // Master enable/disable switch
}
```

---

## Environment Variables (Optional)

For development without admin panel:
```bash
VITE_ROES_API_KEY=<your-api-key>
```

Production: Use admin panel to set API key (stored in localStorage or database).

---

## Testing Checklist

- [ ] Admin can enable/disable ROES in `/admin/roes-config`
- [ ] API key saves/loads from localStorage
- [ ] Test connection works in admin panel
- [ ] ROES editor loads at `/roes-web`
- [ ] Items from ROES automatically add to cart
- [ ] Checkout routes to `/orders/roes-submit` when ROES enabled
- [ ] Checkout routes to `/orders/submit` when ROES disabled
- [ ] Backend receives ROES order payloads correctly

---

## Backend Considerations

### What ROES Order Payload Looks Like
```json
{
  "customer": {
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "555-1234"
  },
  "items": [
    {
      "_id": "roes-product-id",
      "quantity": 2,
      "price": 15.99,
      "options": { ... }
    }
  ],
  "totalPrice": 31.98,
  "notes": "Special instructions"
}
```

### Backend Should:
1. Validate customer/items
2. Store order in database
3. Optionally forward to ROES via their API
4. Return `{ orderId, status }`

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Cart items not appearing when ROES emits | Check `roesService.isEnabled()` returns true |
| Checkout route unclear | Add console.log in `processCheckout()` |
| Backend endpoint 404 | Ensure `/orders/roes-submit` is registered |
| Config not persisting | Check browser localStorage under 'roesConfig' key |

---

## References
- Admin panel: `/admin/roes-config`
- ROES editor: `/roes-web`
- roesService: `src/services/roesService.ts`
- Checkout service: `src/services/checkoutService.ts`
- Example component: `src/components/CheckoutWithRoesExample.tsx`
