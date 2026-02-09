# Pay-in-Advance Subscriptions with Deferred Cancellation

## Overview
Subscriptions are now pay-in-advance with cancellation taking effect at the end of the current billing period, not immediately. Studios keep full access until their subscription expires.

## Key Features

### 1. Pay-in-Advance Model
- Studios pay upfront for their subscription period (monthly or yearly)
- Full access is granted immediately upon payment
- Access continues until the `subscription_end` date

### 2. Deferred Cancellation
- When a studio cancels, they keep access until renewal date
- Cancellation is marked with `cancellation_requested` flag
- Subscription remains `active` until the end date
- Studios can reactivate before the end date

### 3. Automatic Handling at Renewal
- When subscription ends and cancellation was requested, status changes to `inactive`
- If not cancelled, subscription automatically renews (via Stripe webhook)
- Clear cancellation flags on successful renewal

## Database Changes

### Studios Table - New Fields
```sql
cancellation_requested BOOLEAN DEFAULT 0    -- Flag indicating cancellation is scheduled
cancellation_date DATETIME                  -- When the cancellation was requested
```

### Field States
- **Active Subscription**: `subscription_status='active'`, `cancellation_requested=0`
- **Cancelled (Still Active)**: `subscription_status='active'`, `cancellation_requested=1`
- **Expired**: `subscription_status='inactive'`, `cancellation_requested=0`

## API Endpoints

### Cancel Subscription
**POST** `/api/studios/:studioId/subscription/cancel`

Schedules cancellation at the end of billing period.

**Authorization**: Studio admin or super admin

**Response**:
```json
{
  "message": "Subscription will be cancelled at the end of your billing period",
  "studio": { /* updated studio object */ },
  "cancelsOn": "2026-03-08T00:00:00.000Z"
}
```

**Effects**:
- Sets `cancellation_requested = 1`
- Sets `cancellation_date = now()`
- Updates Stripe subscription with `cancel_at_period_end: true`
- Studio keeps access until `subscription_end`

### Reactivate Subscription
**POST** `/api/studios/:studioId/subscription/reactivate`

Undoes a scheduled cancellation before it takes effect.

**Authorization**: Studio admin or super admin

**Response**:
```json
{
  "message": "Subscription reactivated successfully",
  "studio": { /* updated studio object */ }
}
```

**Effects**:
- Sets `cancellation_requested = 0`
- Clears `cancellation_date`
- Updates Stripe subscription with `cancel_at_period_end: false`
- Subscription will auto-renew normally

## UI Changes

### Studio Admin Dashboard

#### Cancellation Warning Banner
When `cancellation_requested` is true:
```
⚠️ Subscription Cancellation Scheduled

Your subscription will end on [date]. You will continue 
to have full access until then.

[Reactivate Subscription]
```
- Orange warning colors (`#ff9800` border)
- Shows exact end date
- Button to undo cancellation

#### Status Display
Shows cancellation in subscription card:
- Color: Orange (`#ff9800`) when cancelling
- Text: "Active (Cancels [date])"
- Clearly indicates temporary status

#### Cancel Subscription Button
- Only shown when:
  - Subscription is `active`
  - Not a free subscription
  - No cancellation already requested
- Red button with confirmation dialog
- Explains they keep access until end date

### Super Admin Dashboard

#### Studio Table Status Column
- Shows "Cancelling [date]" for studios with pending cancellation
- Orange badge (`#ff9800` background)
- Compact date format (e.g., "Cancelling Mar 8")

## User Experience Flow

### Cancelling a Subscription

1. Studio admin clicks "Cancel Subscription" button
2. Confirmation dialog: "Are you sure? You will retain access until the end of your billing period."
3. User confirms
4. Success message: "Subscription will be cancelled at the end of your billing period"
5. Dashboard updates:
   - Status shows "Active (Cancels [date])"
   - Orange warning banner appears
   - Cancel button replaced with reactivation option

### After Cancellation

**Studio continues to have full access**:
- ✅ Can create albums
- ✅ Can manage products
- ✅ Can process orders
- ✅ All features work normally

**Visual indicators**:
- Orange "Cancelling" status in admin views
- Warning banner with end date
- Ability to reactivate anytime

### Reactivating a Subscription

1. Studio clicks "Reactivate Subscription" in warning banner
2. Immediate reactivation (no confirmation needed)
3. Success message: "Subscription reactivated successfully"
4. Dashboard returns to normal:
   - Status shows "active" (green)
   - Warning banner disappears
   - Will auto-renew normally

### At Subscription End Date

If cancellation was requested:
- Access automatically ends on `subscription_end` date
- Status changes from `active` to `inactive`
- Feature gates activate (albums/selling blocked)
- Studio must resubscribe to regain access

If no cancellation (normal renewal):
- Stripe processes renewal payment
- `subscription_end` extended by billing period
- Subscription continues uninterrupted

## Stripe Integration

### Cancellation
```javascript
stripe.subscriptions.update(subscriptionId, {
  cancel_at_period_end: true  // Don't cancel immediately
});
```

### Reactivation
```javascript
stripe.subscriptions.update(subscriptionId, {
  cancel_at_period_end: false  // Resume normal billing
});
```

### Webhook Handling
- `invoice.payment_succeeded`: Clear cancellation flag, extend end date
- `customer.subscription.deleted`: Set status to inactive (only fires after period ends)

## Business Logic

### Subscription Update (PATCH /subscription)
When activating a subscription (e.g., after payment):
```javascript
if (subscriptionStatus === 'active') {
  updateData.cancellation_requested = 0;
  updateData.cancellation_date = null;
}
```
This ensures new/renewed subscriptions don't carry forward old cancellation flags.

### Feature Access
Subscription middleware checks:
```javascript
// Access granted if:
subscription_status === 'active' && 
is_free_subscription !== true
// Cancellation flag doesn't affect access
```

## Benefits

### For Studios
1. **No immediate loss of service** - Keep working until period ends
2. **Change their mind** - Can reactivate anytime before end date
3. **Fair billing** - Get full value of what they paid for
4. **Predictable** - Know exactly when access ends

### For Business
1. **Reduced refund requests** - Studios got full service period
2. **Higher retention** - Easy to reactivate, might reconsider
3. **Better UX** - No sudden service disruption
4. **Standard practice** - Matches how most SaaS works (Stripe, Netflix, etc.)

## Testing

### Test Cancellation
1. Login as studio admin with active subscription
2. Navigate to Studio Dashboard
3. Click "Cancel Subscription"
4. Confirm cancellation
5. ✅ Should see orange warning banner
6. ✅ Status should show "Active (Cancels [date])"
7. ✅ Should still be able to create albums
8. ✅ Should still be able to sell

### Test Reactivation
1. With cancelled subscription (from above)
2. Click "Reactivate Subscription" in banner
3. ✅ Banner should disappear
4. ✅ Status should return to green "active"
5. ✅ Subscription will renew normally

### Test Super Admin View
1. Login as super admin
2. View studios list
3. ✅ Should see cancelled studios with orange "Cancelling [date]" badge
4. ✅ Regular active subscriptions show green "active"

## Files Modified

### Backend
- `/server/database.js` - Added `cancellation_requested` and `cancellation_date` columns
- `/server/routes/studios.js`:
  - Added `POST /:studioId/subscription/cancel` endpoint
  - Added `POST /:studioId/subscription/reactivate` endpoint
  - Updated `PATCH /:studioId/subscription` to clear cancellation on activation

### Frontend
- `/src/pages/StudioAdminDashboard.tsx`:
  - Added cancellation fields to interface
  - Added `handleCancelSubscription()` function
  - Added `handleReactivateSubscription()` function
  - Added cancellation warning banner
  - Updated status display to show cancellation
  - Added "Cancel Subscription" button

- `/src/pages/SuperAdminDashboard.tsx`:
  - Added cancellation fields to interface
  - Updated status badge to show cancellation state

## Future Enhancements

1. **Email Notifications**:
   - Send confirmation email when cancellation is scheduled
   - Send reminder X days before subscription ends
   - Send reactivation confirmation

2. **Cancellation Feedback**:
   - Ask why they're cancelling
   - Offer discount/downgrade to retain
   - Collect feedback for product improvement

3. **Grace Period**:
   - Optional X-day grace period after end date
   - Read-only access to export data
   - Final chance to reactivate

4. **Automatic Cleanup**:
   - Archive albums after Y days of inactivity
   - Delete old data after Z days
   - Notify before deletion

5. **Downgrade Option**:
   - Switch to lower tier instead of cancelling
   - Keep some features active
   - Gradual off-boarding
