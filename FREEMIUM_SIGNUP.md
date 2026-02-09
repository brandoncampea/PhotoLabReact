# Freemium Signup Implementation

## Overview
Studios can now sign up for free without requiring immediate payment, but they must subscribe to an active plan before they can create albums or start selling products.

## Changes Made

### 1. Backend Changes

#### Signup Route (`/server/routes/studios.js`)
- Made `subscriptionPlan` parameter **optional** during signup
- Studios can register without selecting a plan
- Default subscription status is set to `inactive` for free signups
- Studios without a plan are created with `subscription_plan = null`

#### Subscription Middleware (`/server/middleware/subscription.js`)
New middleware `requireActiveSubscription` that:
- Checks if user's studio has an active subscription
- Blocks access if `subscription_status !== 'active'` or `is_free_subscription === true`
- Super admins bypass all checks
- Customers bypass checks (they're using studio's account)
- Returns `403` error with `requiresSubscription: true` flag for restricted access

#### Protected Routes
Added subscription middleware to:
- **Albums**: `POST /api/albums` - Creating new albums requires subscription
- **Products**: `POST /api/products` - Adding/modifying products requires subscription  
- **Orders**: `POST /api/orders` - Processing orders/selling requires subscription

### 2. Frontend Changes

#### Signup Page (`/src/pages/StudioSignup.tsx`)
- Added "Free" option to plan selection
- Free option shows "$0 - Subscribe later"
- Made plan selection optional
- Form submits with `subscriptionPlan: undefined` if Free is selected
- Updated UI text to clarify subscription is optional

#### Studio Admin Dashboard (`/src/pages/StudioAdminDashboard.tsx`)
- Added prominent subscription banner for inactive/free accounts
- Banner shows when `subscription_status === 'inactive'` or `is_free_subscription === true`
- Banner displays:
  - 🔒 "Subscription Required" heading
  - Explanation that albums/selling require subscription
  - "View Subscription Plans" button to open upgrade modal
- Banner styled with yellow warning colors (`#fff3cd` background, `#ffc107` border)

#### Admin Albums Page (`/src/pages/admin/AdminAlbums.tsx`)
- Enhanced error handling for album creation
- Detects `requiresSubscription` flag in API errors
- Shows user-friendly alert: "Subscription Required: [error message]. Please subscribe to create albums."

## User Flow

### New Studio Signup
1. User visits signup page
2. Selects "Free" option (or any paid plan)
3. Fills in studio and admin information
4. Submits form
5. Account created with `inactive` subscription status

### Using Studio Without Subscription
1. Studio admin logs in
2. Sees yellow subscription banner on dashboard
3. Can browse interface but cannot:
   - Create albums
   - Add/modify products
   - Process orders (sell)
4. Attempting restricted actions shows subscription error

### Subscribing
1. Click "View Subscription Plans" on banner
2. Select monthly or yearly plan
3. Complete payment
4. Subscription status changes to `active`
5. All features unlocked

## Technical Details

### Database States
- **Free Signup**: `subscription_status = 'inactive'`, `subscription_plan = null`
- **Active Paid**: `subscription_status = 'active'`, `subscription_plan = 'basic'/'professional'/'premium'`
- **Free Subscription**: `subscription_status = 'active'`, `is_free_subscription = 1` (super admin granted)

### API Error Format
When subscription is required:
```json
{
  "error": "Active subscription required. Please subscribe to use this feature.",
  "requiresSubscription": true,
  "subscriptionStatus": "inactive"
}
```

### Security
- JWT authentication still required for all routes
- Subscription middleware adds additional layer after auth
- Super admins bypass subscription checks
- Customers use their studio's subscription status

## Testing

### Test Free Signup
1. Go to `/studio-signup`
2. Select "Free" option
3. Fill in all fields
4. Submit - should succeed without payment

### Test Feature Restrictions
1. Login as studio admin with inactive subscription
2. Try to create album - should show subscription error
3. Try to modify products - should be blocked
4. Subscribe to a plan
5. Retry operations - should work

### Test Subscription Banner
1. Login as studio admin without active subscription
2. Dashboard should show yellow banner with "Subscription Required"
3. Banner should have "View Subscription Plans" button
4. After subscribing, banner should disappear

## Files Modified

### Backend
- `/server/routes/studios.js` - Made subscription optional in signup
- `/server/middleware/subscription.js` - New middleware for subscription checks
- `/server/routes/albums.js` - Added subscription middleware to POST route
- `/server/routes/products.js` - Added subscription middleware to POST route
- `/server/routes/orders.js` - Added subscription middleware to POST route

### Frontend
- `/src/pages/StudioSignup.tsx` - Added Free option, made plan optional
- `/src/pages/StudioAdminDashboard.tsx` - Added subscription required banner
- `/src/pages/admin/AdminAlbums.tsx` - Enhanced error handling for subscription errors

## Benefits

1. **Lower Barrier to Entry**: Studios can explore the platform before committing to payment
2. **Increased Signups**: Free tier removes friction from registration process
3. **Natural Upsell**: Users see value before being asked to pay
4. **Clear Limitations**: Prominent banner makes subscription benefits obvious
5. **Flexible Conversion**: Studios can subscribe whenever ready

## Future Enhancements

- Add feature comparison table on signup page
- Show "locked" icons on restricted features in UI
- Send email reminders about subscription benefits
- Add trial period option (7/14/30 days active, then require subscription)
- Track conversion metrics (free signup → paid subscription)
