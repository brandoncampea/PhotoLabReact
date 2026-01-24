# SQLite Backend Migration Complete

All localStorage data has been migrated to SQLite via backend API endpoints.

## Backend Changes (Node.js + SQLite)

### New Database Tables
- `albums` - Enhanced with password protection and price list fields
- `photos` - Photo metadata storage
- `price_lists` - Pricing configuration
- `product_sizes` - Product pricing by size per price list
- `packages` - Product bundles tied to price lists
- `profile_config` - Business profile settings (singleton)
- `user_cart` - User shopping cart persistence
- `watermarks` - Watermark templates
- `discount_codes` - Discount code management
- `discount_code_products` - Product-specific discount mapping

### New API Routes
- `POST /api/profile` - Get/update business profile
- `GET|POST|DELETE /api/cart` - Cart management
- `GET|POST|PUT|DELETE /api/watermarks/:id` - Watermark CRUD
- `GET|POST|PUT|DELETE /api/discount-codes/:id` - Discount code CRUD
- `GET|POST|PUT|DELETE /api/price-lists/:id` - Price lists with setDefault
- `GET|POST|PUT|DELETE /api/packages/:id` - Package management

## Frontend Changes

### Context Updates
- **CartContext** - Now syncs to `/api/cart` instead of localStorage
  - Falls back to localStorage if API unavailable
  - Persists across browser sessions and devices

### Service Layer
- Created `adminService.ts` with profiles for:
  - `profileService` - Business configuration
  - `watermarkService` - Watermark templates
  - `discountCodeService` - Discount codes
  - All services support mock API fallback when `VITE_USE_MOCK_API=true`

### Modified Services
- `priceListService` - Uses `/api/price-lists` for creation
- `albumService` - Passes through to real API endpoints
- `photoService` - Passes through to real API endpoints

## Environment Configuration

Edit `.env.local`:
```
VITE_API_URL=http://localhost:3001/api
VITE_USE_MOCK_API=false
```

## Running the Application

1. **Start Backend Server:**
   ```bash
   npm run server
   ```
   - Initializes SQLite database at `server/photolab.db`
   - All data persists automatically

2. **Start Frontend Dev Server (separate terminal):**
   ```bash
   npm run dev
   ```

## Data Persistence

All data now persists to SQLite:
- ✅ Uploaded photos stored in `server/uploads/`
- ✅ Album configurations and metadata
- ✅ User shopping carts
- ✅ Price lists and packages
- ✅ Watermarks and discount codes
- ✅ Business profile settings

## Fallback Behavior

If backend is unavailable:
- Cart falls back to localStorage (same session only)
- Admin features use mock API (data lost on refresh)
- Real backend recommended for production

## Next Steps

1. Implement real authentication endpoints
2. Add user account management routes
3. Create order management and checkout endpoints
4. Add analytics and reporting endpoints
5. Deploy to production server
