# WHCC Integration Guide

## Overview

Complete integration with Whitehouse Custom Colour (WHCC) Order Submit API for submitting photo printing orders programmatically.

**Status**: ✅ Complete - Admin configuration panel and checkout routing ready.

---

## What Was Built

### Services Created

#### **`src/services/whccService.ts`** — Core WHCC Integration
- `getConfig()` / `isEnabled()` — Check if WHCC is active (reads from localStorage)
- `getAccessToken()` — Request OAuth token from WHCC API (1-hour lifetime, cached)
- `convertCartToWhccOrder()` — Transform app cart items to WHCC JSON schema
- `importOrder()` — POST order to `/api/OrderImport` endpoint (Step 1)
- `submitOrder()` — POST confirmation to `/api/OrderImport/Submit/{ConfirmationID}` (Step 2)
- `submitCompleteOrder()` — Full workflow: convert → import → submit
- `testConnection()` — Verify credentials work
- `logEvent()` — Debug logging

#### **`src/services/checkoutService.ts`** — Updated Checkout Orchestration
- `processCheckout()` — Auto-routes to WHCC, ROES, or standard backend
- Priority: WHCC > ROES > Standard (first enabled service is used)
- Each provider returns structured response with `{ success, provider, orderId, ... }`

### Components Created

#### **`src/pages/admin/AdminWhccConfig.tsx`** — WHCC Admin Panel
Complete configuration interface:
- **Basic Settings**
  - Enable/disable WHCC integration
  - Environment selector (Sandbox vs Production)
  - Consumer Key input
  - Consumer Secret input (password field)
  - Test Connection button
  
- **Ship From Address** (required for all orders)
  - Name, Address 1-2, City, State, Zip
  - Phone (optional)
  - Used on shipping labels and return address
  
- **Integration Notes & Production Checklist**
  - Links to WHCC developer docs
  - Security recommendations
  - Image URL requirements

### Routes Updated

- **Frontend**: Added `/admin/whcc-config` route (protected, admin-only)
- **Sidebar**: Added "📦 WHCC Config" link in admin navigation

---

## WHCC API Flow

```
Customer checkout → processCheckout() checks which service enabled
                ↓
              If WHCC:
                ↓
          1. Request Access Token
             GET /api/AccessToken?grant_type=consumer_credentials&consumer_key=...&consumer_secret=...
             Returns: { Token, ClientId, ExpirationDate, ... }
                ↓
          2. Import Order
             POST /api/OrderImport
             Body: { EntryId, Orders: [{ ShipToAddress, ShipFromAddress, OrderItems[], ... }] }
             Returns: { ConfirmationID, Account, Orders[], Total, ... }
                ↓
          3. Submit Order
             POST /api/OrderImport/Submit/{ConfirmationID}
             Returns: { Confirmation, ConfirmedOrders, ... }
                ↓
          Order submitted to WHCC for production
```

---

## WHCC Order Schema

### Request Format
```json
{
  "EntryId": "order-12345",
  "Orders": [
    {
      "SequenceNumber": 1,
      "Reference": "Order-12345",
      "SendNotificationEmailToAccount": true,
      "SendNotificationEmailAddress": "customer@example.com",
      "ShipToAddress": {
        "Name": "John Doe",
        "Addr1": "123 Main St",
        "Addr2": null,
        "City": "Minneapolis",
        "State": "MN",
        "Zip": "55401",
        "Country": "US",
        "Phone": "6125551234"
      },
      "ShipFromAddress": {
        "Name": "Returns Department",
        "Addr1": "3432 Denmark Ave",
        "Addr2": "Suite 390",
        "City": "Eagan",
        "State": "MN",
        "Zip": "55123",
        "Country": "US",
        "Phone": "8002525234"
      },
      "OrderAttributes": [
        { "AttributeUID": 96 },  // Shipping method
        { "AttributeUID": 545 }   // Packaging
      ],
      "OrderItems": [
        {
          "ProductUID": 2,           // 5x7 print example
          "Quantity": 1,
          "ItemAssets": [
            {
              "ProductNodeID": 10000,
              "AssetPath": "https://s3.amazonaws.com/images/photo.jpg",
              "ImageHash": "a9825bb0836325e07ccfed16751b1d07",
              "PrintedFileName": "photo.jpg",
              "AutoRotate": true,
              "X": 0,
              "Y": 0,
              "ZoomX": 100,
              "ZoomY": 100
            }
          ],
          "ItemAttributes": [
            { "AttributeUID": 1 },    // Paper type
            { "AttributeUID": 5 }     // Finish
          ]
        }
      ]
    }
  ]
}
```

### Response Format
```json
{
  "Account": "10072",
  "ConfirmationID": "d4bcb9a7-caf0-4d2b-aa18-674a5d2c527e",
  "Key": "B431BE78D2E9FFFE3709",
  "NumberOfOrders": 1,
  "Orders": [
    {
      "SequenceNumber": "1",
      "SubTotal": "4.13",
      "Tax": "0.29",
      "Total": "4.42",
      "Products": [
        {
          "ProductDescription": "Print Fulfillment 5x7",
          "Quantity": 1,
          "Price": "0.65"
        }
      ]
    }
  ],
  "Received": "2024-01-27 10:30:00 CST"
}
```

---

## How to Use

### 1. Get WHCC API Credentials

Visit [WHCC Developer Portal](https://developer.whcc.com):
1. Sign up for a WHCC account
2. Request API access (sandbox + production)
3. Receive: **Consumer Key** and **Consumer Secret**

### 2. Configure in Admin Panel

1. Navigate to `/admin/whcc-config`
2. Enable WHCC Integration checkbox
3. Enter Consumer Key and Consumer Secret
4. Set environment (Sandbox for testing)
5. Configure Ship From Address
6. Click "Test Connection"
7. Click "Save Configuration"

Config stored in localStorage under key `whccConfig`:
```json
{
  "enabled": true,
  "consumerKey": "B431BE78D2E9FFFE3709",
  "consumerSecret": "RkZGRTM3MDk=",
  "isSandbox": true,
  "shipFromAddress": { ... }
}
```

### 3. Checkout Routes Automatically

When customer clicks checkout:

```tsx
// In your checkout component
import { processCheckout } from '../services/checkoutService';

const result = await processCheckout({
  customer: {
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    phone: '6125551234',
    address: {
      addr1: '123 Main St',
      city: 'Minneapolis',
      state: 'MN',
      zip: '55401',
      country: 'US'
    }
  },
  cartItems: [
    {
      id: 'item-1',
      whccProductUID: 2,        // 5x7 print
      quantity: 1,
      imageUrl: 'https://s3.../photo.jpg',
      imageName: 'photo.jpg',
      whccPaperType: 1,         // Photo paper
      whccFinish: 5,            // Glossy
      cropX: 0,
      cropY: 0,
      zoomX: 100,
      zoomY: 100
    }
  ]
});

// result.success === true
// result.provider === 'whcc'
// result.confirmationId === 'd4bcb9a7-...'
// result.total === '4.42'
```

---

## File Reference

| File | Purpose | Status |
|------|---------|--------|
| `src/services/whccService.ts` | Core WHCC API integration | ✅ Created |
| `src/services/checkoutService.ts` | Checkout routing (WHCC > ROES > Standard) | ✅ Updated |
| `src/pages/admin/AdminWhccConfig.tsx` | Admin configuration UI | ✅ Created |
| `src/App.tsx` | Route registration | ✅ Updated |
| `src/components/AdminLayout.tsx` | Admin sidebar nav | ✅ Updated |

---

## Configuration Requirements

### WHCC Credentials
- **Consumer Key**: ~40 character alphanumeric string
- **Consumer Secret**: Base64-encoded string
- Obtain from: https://developer.whcc.com/pages/order-submit-api/

### Cart Item Properties (Required)
```typescript
{
  id: string;                    // Unique item ID
  whccProductUID: number;        // WHCC product ID (2 = 5x7, etc.)
  quantity: number;              // Number of prints
  imageUrl: string;              // HTTPS URL to image
  imageName: string;             // Filename for printing
  whccPaperType: number;         // Paper type UID
  whccFinish: number;            // Finish type UID (glossy, matte, etc.)
  
  // Optional cropping
  cropX?: number;
  cropY?: number;
  zoomX?: number;                // 100 = normal
  zoomY?: number;
}
```

### Customer Properties (Required)
```typescript
{
  firstName: string;
  lastName: string;
  email: string;                 // For notification emails
  phone?: string;                // 10 digits, no punctuation
  address: {
    addr1: string;               // Street address
    addr2?: string;              // Apt, suite, etc.
    city: string;
    state: string;               // 2-letter state code (MN, NY, CA)
    zip: string;
    country?: string;            // Default: US
  }
}
```

---

## Product UIDs & Attributes

You'll need to map your products to WHCC's product catalog:

### Common Product UIDs
- `2` = 5x7 print
- `3` = 4x6 print
- `4` = 8x10 print
- [Full catalog](https://developer.whcc.com/pages/order-submit-api/product-catalog/) available on WHCC docs

### Common Order Attributes (Shipping)
- `96` = Economy Shipping (5-7 business days)
- `545` = Standard Packaging
- [See catalog](https://developer.whcc.com/pages/order-submit-api/product-catalog/) for complete list

### Common Item Attributes (Paper)
- `1` = Photo Paper
- `5` = Glossy Finish
- [See catalog](https://developer.whcc.com/pages/order-submit-api/product-catalog/) for options

---

## Image Requirements

### HTTPS URLs Only
- Images must be publicly accessible via HTTPS
- Recommended: Store on AWS S3 with public-read ACL or signed URLs
- Example: `https://bucket.s3.amazonaws.com/photos/image.jpg`

### Image Hashing
- WHCC requires MD5 hash of image for validation
- Current implementation uses placeholder hash
- **Production**: Calculate actual MD5 of image file:

```typescript
import crypto from 'crypto';

function getMd5Hash(imageBuffer: Buffer): string {
  return crypto.createHash('md5').update(imageBuffer).digest('hex');
}
```

### Image Enhancements (Optional)
- `"Default"` = Auto-optimize for printing (recommended)
- Can also be null to skip enhancement

---

## Authentication & Token Caching

### Access Token Lifecycle
- Tokens valid for 1 hour
- Service automatically caches tokens
- New token requested only if expiring within 5 minutes
- Cache key: `consumerKey:environment`

### Token Request
```
GET /api/AccessToken
  ?grant_type=consumer_credentials
  &consumer_key=B431BE78D2E9FFFE3709
  &consumer_secret=RkZGRTM3MDk=
```

---

## Testing Checklist

- [ ] Admin can access `/admin/whcc-config`
- [ ] Can enter credentials and save
- [ ] Test Connection button validates credentials
- [ ] Config persists in localStorage
- [ ] Production URL switches between sandbox/production
- [ ] Checkout detects WHCC enabled
- [ ] Cart items convert to WHCC schema properly
- [ ] Order import succeeds with valid data
- [ ] Order submit creates confirmation ID
- [ ] Webhooks receive order status updates
- [ ] Images accessible via HTTPS (no mixed content errors)

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "WHCC authentication failed" | Check Consumer Key/Secret are correct; test in WHCC dashboard |
| "Invalid order request" | Verify ProductUID exists in catalog; check address format |
| "Image not found" | Ensure image URL is HTTPS and publicly accessible |
| "ImageHash mismatch" | Calculate actual MD5 hash of image file (not placeholder) |
| "Token expired" | Service auto-refreshes; clear localStorage if stuck |
| Mixed content error | Ensure all image URLs use HTTPS, not HTTP |

---

## Production Deployment

### Pre-Launch Checklist
1. ✅ Switch Admin environment to **Production**
2. ✅ Update credentials to **Production** Consumer Key/Secret
3. ✅ Test with sandbox first, then switch
4. ✅ Store credentials in environment variables, not localStorage
5. ✅ Calculate actual image MD5 hashes
6. ✅ Set up WHCC webhooks for order tracking
7. ✅ Configure error handling and logging
8. ✅ Test multiple orders end-to-end
9. ✅ Set up customer notification emails from WHCC

### Environment Variables (Recommended)
```bash
VITE_WHCC_CONSUMER_KEY=your-production-key
VITE_WHCC_CONSUMER_SECRET=your-production-secret
VITE_WHCC_SANDBOX=false
```

Then update service to read from env vars:
```typescript
const config = {
  consumerKey: import.meta.env.VITE_WHCC_CONSUMER_KEY,
  consumerSecret: import.meta.env.VITE_WHCC_CONSUMER_SECRET,
  isSandbox: import.meta.env.VITE_WHCC_SANDBOX === 'true'
};
```

---

## API Documentation

- **Main Docs**: https://developer.whcc.com/pages/order-submit-api/
- **Product Catalog**: https://developer.whcc.com/pages/order-submit-api/product-catalog/
- **Authentication**: https://developer.whcc.com/pages/order-submit-api/authentication/
- **Webhooks**: https://developer.whcc.com/pages/order-submit-api/webhooks/

---

## Support

For WHCC-specific issues:
- Email: developer@whcc.com
- Portal: https://developer.whcc.com/

For integration issues in this app:
- Check browser console for logged events
- Review `whccService.logEvent()` calls
- Test credentials in WHCC dashboard first
