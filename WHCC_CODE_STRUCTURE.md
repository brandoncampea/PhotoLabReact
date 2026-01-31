# WHCC Integration - Code Structure

## Complete File Organization

```
src/
├── services/
│   ├── whccService.ts                 ✅ NEW - WHCC API integration
│   ├── roesService.ts                 ✅ EXISTING - ROES integration
│   ├── checkoutService.ts             ✅ UPDATED - Multi-provider routing
│   ├── apiClient.ts                   (axios client - used by both)
│   └── ... (other services)
│
├── pages/
│   ├── admin/
│   │   ├── AdminWhccConfig.tsx        ✅ NEW - WHCC admin panel
│   │   ├── AdminRoesConfig.tsx        ✅ EXISTING - ROES admin panel
│   │   └── ... (other admin pages)
│   ├── RoesWeb.tsx                    ✅ EXISTING - ROES editor page
│   └── ... (other pages)
│
├── hooks/
│   ├── useRoesConfig.ts               ✅ EXISTING - ROES config hook
│   └── ... (other hooks)
│
├── components/
│   ├── AdminLayout.tsx                ✅ UPDATED - Added WHCC nav link
│   ├── Navbar.tsx                     (unchanged)
│   └── ... (other components)
│
├── App.tsx                            ✅ UPDATED - Added WHCC route
├── index.css
└── main.tsx

documentation/
├── WHCC_INTEGRATION.md                ✅ NEW - Full WHCC guide
├── WHCC_QUICKSTART.md                 ✅ NEW - Quick reference
├── WHCC_IMPLEMENTATION_COMPLETE.md    ✅ NEW - Implementation summary
├── CHECKOUT_INTEGRATION.md            ✅ NEW - Multi-provider overview
├── ROES_CART_INTEGRATION.md           ✅ EXISTING - ROES guide
└── ... (other docs)
```

## Service Layer Architecture

```
whccService.ts
├── Config Management
│   ├── getConfig()           // localStorage['whccConfig']
│   ├── isEnabled()
│   └── getApiUrl()           // sandbox vs production
│
├── Authentication
│   ├── getAccessToken()      // OAuth with caching
│   └── tokenCache (Map)      // Avoid repeated token requests
│
├── Order Processing
│   ├── convertCartToWhccOrder()    // App format → WHCC JSON
│   ├── importOrder()               // POST /api/OrderImport
│   ├── submitOrder()               // POST /api/OrderImport/Submit/{ID}
│   └── submitCompleteOrder()       // Full workflow
│
└── Utilities
    ├── testConnection()      // Verify credentials
    └── logEvent()           // Debug logging
```

## Checkout Flow Code

```typescript
// User triggers checkout
handleCheckout() → 

// Frontend calls
processCheckout({
  customer: {...},
  cartItems: [...]
})
  ↓
  ↓ Check enabled providers in order:
  ↓
  if (whccService.isEnabled()) {
    // WHCC enabled - use WHCC
    convertCartToWhccOrder() →
    getAccessToken() →           // OAuth
    importOrder() →              // Validate
    submitOrder()                // Process
  }
  else if (roesService.isEnabled()) {
    // WHCC disabled, ROES enabled
    convertCartToRoesOrder() →
    submitOrderThroughBackend()
  }
  else {
    // Both disabled, use standard
    submitOrderThroughStandardBackend()
  }
```

## Configuration Flow

```
Admin accesses /admin/whcc-config
        ↓
AdminWhccConfig component renders form
        ↓
Loads existing config from localStorage['whccConfig']
        ↓
Admin fills form:
- enabled (checkbox)
- consumerKey (text)
- consumerSecret (password)
- isSandbox (radio)
- shipFromAddress (address form)
        ↓
Admin clicks "Test Connection"
        ↓
handleTestConnection():
  ├─ Save temp config to localStorage
  ├─ Call whccService.testConnection()
  │   ├─ Call whccService.getAccessToken()
  │   │   └─ GET /api/AccessToken (real API call)
  │   └─ Return true/false
  └─ Show success/error message
        ↓
Admin clicks "Save Configuration"
        ↓
handleSave():
  ├─ Build full config object
  └─ localStorage.setItem('whccConfig', JSON.stringify(config))
        ↓
Config persists across page reloads
        ↓
Checkout automatically detects enabled setting
```

## Component Hierarchy

```
App.tsx
├── Router
│   ├── /admin/whcc-config
│   │   └── AdminProtectedRoute
│   │       └── AdminLayout
│   │           └── AdminWhccConfig    ✅ Form UI
│   │
│   └── /checkout (your page)
│       └── YourCheckoutComponent
│           └── processCheckout()      ✅ Routing logic
│
└── Main app (unchanged)
    └── Cart.tsx (where you call processCheckout)
```

## Data Flow: Customer Order

```
Customer fills cart → Click Checkout
        ↓
handleCheckout() in Cart.tsx
        ↓
processCheckout({
  customer: {
    firstName: "John",
    lastName: "Doe",
    email: "john@example.com",
    phone: "6125551234",
    address: {
      addr1: "123 Main St",
      city: "Minneapolis",
      state: "MN",
      zip: "55401"
    }
  },
  cartItems: [
    {
      id: "item-1",
      quantity: 1,
      whccProductUID: 2,
      imageUrl: "https://s3.../photo.jpg",
      imageName: "photo.jpg"
    }
  ]
})
        ↓
checkoutService.ts:
  if (whccService.isEnabled()) {
    return processWhccCheckout()
  }
        ↓
whccService.submitCompleteOrder() {
  
  Step 1: Convert format
    convertCartToWhccOrder() →
    {
      EntryId: "order-1706...",
      Orders: [{
        SequenceNumber: 1,
        ShipToAddress: {...},
        ShipFromAddress: {...},
        OrderItems: [{
          ProductUID: 2,
          Quantity: 1,
          ItemAssets: [{
            ProductNodeID: 10000,
            AssetPath: "https://s3.../photo.jpg",
            ImageHash: "a9825bb0...",
            PrintedFileName: "photo.jpg",
            AutoRotate: true
          }]
        }]
      }]
    }
  
  Step 2: Get token
    getAccessToken() →
    GET https://apps.whcc.com/api/AccessToken
      ?grant_type=consumer_credentials
      &consumer_key=B431BE78...
      &consumer_secret=RkZGRTM3...
    
    Response:
    {
      Token: "835770680158",
      ExpirationDate: "2024-01-27 14:30:00"
    }
    
    → Cache token
  
  Step 3: Import order
    importOrder(orderRequest) →
    POST https://apps.whcc.com/api/OrderImport
      Headers: Authorization: Bearer 835770680158
      Body: {...WHCC order JSON...}
    
    Response:
    {
      ConfirmationID: "d4bcb9a7-caf0-4d2b-aa18-674a5d2c527e",
      Account: "10072",
      Orders: [{
        Total: "4.42",
        SubTotal: "4.13",
        Tax: "0.29"
      }]
    }
  
  Step 4: Submit order
    submitOrder(confirmationId) →
    POST https://apps.whcc.com/api/OrderImport/Submit/d4bcb9a7-...
      Headers: Authorization: Bearer 835770680158
    
    Response:
    {
      Confirmation: "Entry ID=d4bcb9a7-...: Confirmed order submitted.",
      ConfirmedOrders: 1
    }
}
        ↓
Return to frontend:
{
  success: true,
  provider: "whcc",
  confirmationId: "d4bcb9a7-caf0-4d2b-aa18-674a5d2c527e",
  account: "10072",
  total: "4.42"
}
        ↓
Frontend handles response:
  - Show "Order #d4bcb9a7... submitted for $4.42"
  - Clear cart
  - Redirect to /orders
  - Send confirmation email
```

## localStorage Schema

```javascript
// localStorage['whccConfig']
{
  "enabled": true,                    // boolean
  "consumerKey": "B431BE78D2E9FFFE3709",  // string
  "consumerSecret": "RkZGRTM3MDk=",       // string (base64)
  "isSandbox": true,                  // boolean
  "shipFromAddress": {
    "name": "Returns Department",
    "addr1": "3432 Denmark Ave",
    "addr2": "Suite 390",
    "city": "Eagan",
    "state": "MN",
    "zip": "55123",
    "country": "US",
    "phone": "8002525234"
  }
}

// localStorage['roesConfig']  (for comparison)
{
  "enabled": false,
  "apiKey": "b53d7da12f...",
  "configId": "LabNameRWTest"
}
```

## API Call Sequence

### First Order (No Token Cache)
```
1. GET /api/AccessToken          (1-2 seconds)
2. POST /api/OrderImport         (1-2 seconds)
3. POST /api/OrderImport/Submit  (1-2 seconds)

Total: ~3-6 seconds
```

### Subsequent Orders (Token Cached)
```
1. POST /api/OrderImport         (1-2 seconds)
2. POST /api/OrderImport/Submit  (1-2 seconds)

Total: ~2-4 seconds (token skipped if < 55 minutes old)
```

## Error Handling Chain

```
processCheckout()
  ↓
  try {
    whccService.submitCompleteOrder()
      ↓
      try {
        getAccessToken()
          ↓
          apiClient.get('/api/AccessToken', ...)
          ↓ Catch: "WHCC authentication failed"
      }
      catch (error) {
        logEvent('auth_failed', error)
        throw new Error('WHCC authentication failed...')
      }
      
      ↓
      
      try {
        importOrder(orderRequest)
          ↓
          apiClient.post('/api/OrderImport', ...)
          ↓ Catch: "Invalid order request"
      }
      catch (error) {
        logEvent('import_failed', error)
        throw error
      }
      
      ↓
      
      try {
        submitOrder(confirmationId)
          ↓
          apiClient.post('/api/OrderImport/Submit/...', ...)
      }
      catch (error) {
        logEvent('submit_failed', error)
        throw error
      }
  }
  catch (error) {
    return { success: false, error: error.message }
  }
```

## Key Implementation Details

### 1. Token Caching
```typescript
private tokenCache: Map<string, WhccAccessToken & { expiresAt: number }> = new Map();

// Cache key: consumerKey:environment
// Cache hit if: expiresAt > Date.now() + 300000 (5-min buffer)
// Cache miss: Request new token
```

### 2. Provider Detection
```typescript
// In processCheckout():
if (whccService.isEnabled()) → WHCC
else if (roesService.isEnabled()) → ROES
else → Standard

// Each service calls isEnabled() which checks:
// localStorage.getItem('whccConfig')?.enabled === true
```

### 3. Order Conversion
```typescript
convertCartToWhccOrder(cartItems, customer) {
  // Maps:
  // customer.firstName + lastName → ShipToAddress.Name
  // cartItem.whccProductUID → ProductUID
  // cartItem.imageUrl → ItemAssets.AssetPath
  // cartItem.quantity → Quantity
  // Uses defaults for missing values
}
```

### 4. Multi-Provider Response
```typescript
// All providers return same shape:
{
  success: boolean,
  provider: 'whcc' | 'roes' | 'standard',
  orderId: string,  // Unique order ID
  // ... provider-specific fields
}
```

---

## Summary

✅ **Complete implementation**:
- whccService: 400+ lines of API integration
- AdminWhccConfig: 320+ lines of admin UI
- checkoutService: Updated to route to WHCC
- Routes & navigation: Updated to include /admin/whcc-config
- Documentation: 1000+ lines across 4 guides

Ready for testing and deployment! 🚀
