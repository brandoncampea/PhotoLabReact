# Stripe Subscription Integration - Complete Setup

## Overview

The Photo Lab now has a complete Stripe subscription system for managing studio subscriptions. This allows studios to upgrade/downgrade plans and make payments through Stripe.

## What's Been Implemented

### 1. Backend Services

#### Stripe Service (`/server/services/stripeService.js`)
- `createCheckoutSession()` - Create Stripe checkout sessions
- `getSubscription()` - Retrieve subscription details
- `updateSubscription()` - Change subscription plan
- `cancelSubscription()` - Cancel active subscription
- `createCustomer()` - Create Stripe customer
- `verifyWebhookSignature()` - Verify webhook authenticity

#### API Endpoints

**Studio Checkout**
```
POST /api/studios/:studioId/checkout
Headers: Authorization: Bearer <token>
Body: { planId: 'basic' | 'professional' | 'enterprise' }
Response: { checkoutUrl: string, sessionId: string }
```
Redirects user to Stripe Checkout page

**Webhook Handler**
```
POST /api/webhooks/stripe
Signature: stripe-signature header
Handles events:
- customer.subscription.created
- customer.subscription.updated
- customer.subscription.deleted
- invoice.payment_succeeded
- invoice.payment_failed
```

### 2. Frontend Pages

#### CheckoutSuccess (`/src/pages/CheckoutSuccess.tsx`)
- Shown after successful Stripe checkout
- Waits for webhook processing
- Auto-redirects to studio dashboard

#### Updated StudioAdminDashboard
- "Continue to Payment" button creates Stripe checkout session
- Redirects to Stripe Checkout on upgrade/downgrade
- Shows loading state during checkout creation

### 3. Database Updates

The `studios` table tracks:
- `stripe_customer_id` - Stripe customer ID
- `stripe_subscription_id` - Active subscription ID
- `subscription_status` - Current status (active, past_due, canceled, paused)
- `subscription_start` - When subscription started
- `subscription_end` - Next renewal date (updated by webhooks)

### 4. Subscription Plans

Three tiers defined in `/server/constants/subscriptions.js`:

| Plan | Price | Albums | Storage | Users |
|------|-------|--------|---------|-------|
| Starter | $29/mo | 5 | - | 3 |
| Professional | $79/mo | Unlimited | - | 10 |
| Enterprise | $199/mo | Unlimited | - | Unlimited |

## Setup Instructions

### 1. Create Stripe Account
1. Go to https://stripe.com
2. Create account and go to Dashboard
3. Find your API Keys (look in Developers section)

### 2. Add Environment Variables

Create/update `.env` in project root:

```bash
# Stripe Keys (from Dashboard → Developers → API Keys)
STRIPE_PUBLIC_KEY=pk_test_your_publishable_key
STRIPE_SECRET_KEY=sk_test_your_secret_key
STRIPE_WEBHOOK_SECRET=whsec_test_your_webhook_secret

# Frontend URL for Stripe redirects
FRONTEND_URL=http://localhost:5173
```

### 3. Create Stripe Products

In Stripe Dashboard:

1. Go to **Products** → **Add Product**
2. Create 3 products:
   - Name: "Photo Lab Starter" - Price: $29/month
   - Name: "Photo Lab Professional" - Price: $79/month  
   - Name: "Photo Lab Enterprise" - Price: $199/month
3. Copy each Price ID (e.g., `price_1QqI2mFc0tLpWH2y0j1c3K8m`)
4. Update `/server/constants/subscriptions.js` with real Price IDs:

```javascript
basic: {
  stripePriceId: 'price_your_starter_id_here',
  // ...
},
professional: {
  stripePriceId: 'price_your_professional_id_here',
  // ...
},
enterprise: {
  stripePriceId: 'price_your_enterprise_id_here',
  // ...
}
```

### 4. Configure Webhooks

In Stripe Dashboard:

1. Go to **Developers** → **Webhooks**
2. Click **Add endpoint**
3. Endpoint URL: `http://localhost:3001/api/webhooks/stripe`
   (For production: `https://yourdomain.com/api/webhooks/stripe`)
4. Select events:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
5. Copy **Signing secret** and add to `.env`:
   ```
   STRIPE_WEBHOOK_SECRET=whsec_your_signing_secret
   ```

### 5. Test the Integration

**Using Test Cards:**
- Success: `4242 4242 4242 4242`
- Decline: `4000 0000 0000 0002`
- Expiry: Any future date (e.g., 12/25)
- CVC: Any 3 digits

**Test Flow:**
1. Navigate to `/studio-admin`
2. Click plan upgrade button
3. Select new plan and click "Continue to Payment"
4. Redirected to Stripe Checkout (test environment)
5. Enter test card `4242 4242 4242 4242`
6. Complete checkout
7. Redirected to success page
8. Subscription status updates via webhook

**Verify Webhook:**
- Stripe Dashboard → Webhooks → Click your endpoint
- See "Events" tab for sent events
- Check "Response" for success/error status

## File Structure

```
/server
  /services
    stripeService.js          # Stripe API interactions
  /routes
    studios.js                # Studio endpoints (with checkout)
    webhooks.js              # Webhook handlers
  /constants
    subscriptions.js         # Plan definitions (with Price IDs)
  database.js                # Updated with Stripe fields

/src
  /pages
    StudioAdminDashboard.tsx  # Updated with Stripe checkout
    CheckoutSuccess.tsx       # Success page after payment
    StudioSignup.tsx          # Studio registration
    SuperAdminDashboard.tsx   # Admin management
```

## Key Features

✅ **Subscription Plans** - 3 tiers with different features
✅ **Stripe Checkout** - Secure payment processing
✅ **Webhook Integration** - Automatic status updates
✅ **Status Tracking** - active, past_due, canceled, paused
✅ **Multi-tenant** - Each studio manages own subscription
✅ **Super Admin Control** - Manage all studio subscriptions
✅ **Test Mode** - Use test cards without real charges

## Security Considerations

1. **Webhook Verification** - All webhooks validated with signing secret
2. **API Authorization** - Endpoints require JWT token
3. **Role-Based Access** - studio_admin for own, super_admin for all
4. **Environment Variables** - Never commit secrets to git
5. **HTTPS** - Use HTTPS in production for webhooks

## Webhook Events Handled

| Event | Action |
|-------|--------|
| `customer.subscription.created` | Store customer/subscription IDs, set active |
| `customer.subscription.updated` | Update status and renewal date |
| `customer.subscription.deleted` | Mark as canceled |
| `invoice.payment_succeeded` | Set to active |
| `invoice.payment_failed` | Set to past_due |

## Production Checklist

- [ ] Update `.env` with live Stripe keys (pk_live_*, sk_live_*)
- [ ] Create production products/prices in Stripe
- [ ] Update `/server/constants/subscriptions.js` with production IDs
- [ ] Configure production webhook endpoint (yourdomain.com)
- [ ] Enable SCA (Strong Customer Authentication)
- [ ] Set up email confirmations in Stripe
- [ ] Configure dunning (retry failed payments)
- [ ] Test with real card (use Stripe's test card before going live)
- [ ] Monitor webhooks in Stripe Dashboard
- [ ] Set up alerts for failed payments

## Testing Commands

```bash
# Start backend with Stripe integration
node server/server.js

# Test webhook locally (requires ngrok for tunnel)
ngrok http 3001
# Then update Stripe webhook URL to ngrok URL

# View webhook events
# Stripe Dashboard → Developers → Webhooks → Select endpoint → Events
```

## Troubleshooting

**Issue**: Checkout session not created
- Check Stripe Secret Key in `.env`
- Verify Price IDs are correct in subscriptions.js
- Check server logs for errors

**Issue**: Webhook events not received
- Verify webhook signing secret in `.env`
- Check Stripe Dashboard → Webhooks for error logs
- Ensure endpoint is accessible (use ngrok for local testing)

**Issue**: Subscription status not updating
- Check webhook handler logs in server
- Verify `raw` middleware used for webhook route
- Ensure `studio_id` is in subscription metadata

## Next Steps

1. **Email Notifications** - Send confirmation emails on successful payment
2. **Invoice Management** - Display invoices/billing history
3. **Dunning Management** - Automatic retries for failed payments
4. **Analytics** - Track MRR, churn, ARPU
5. **Proration** - Handle mid-cycle upgrades/downgrades
6. **Coupons** - Support discount codes with Stripe
7. **Localization** - Support multiple currencies

## Support Resources

- Stripe Documentation: https://stripe.com/docs
- API Reference: https://stripe.com/docs/api
- Testing Guide: https://stripe.com/docs/testing
- Webhooks Guide: https://stripe.com/docs/webhooks

---

**Status**: ✅ Complete and Ready for Testing
**Last Updated**: February 8, 2026
