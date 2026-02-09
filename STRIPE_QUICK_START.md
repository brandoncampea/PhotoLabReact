# Stripe Integration - Quick Start (5 Minutes)

## Step 1: Get Stripe API Keys (1 min)

1. Visit https://stripe.com and sign in (or create account)
2. Go to **Dashboard** → Click your avatar → **Developers**
3. Click **API Keys** (tab)
4. Copy your **Publishable Key** (starts with `pk_`)
5. Copy your **Secret Key** (starts with `sk_`)

## Step 2: Add Environment Variables (1 min)

Create or edit `.env` in project root:

```bash
STRIPE_PUBLIC_KEY=pk_test_your_key_here
STRIPE_SECRET_KEY=sk_test_your_key_here
STRIPE_WEBHOOK_SECRET=whsec_test_secret
FRONTEND_URL=http://localhost:5173
```

**Don't have a webhook secret yet?** Use a placeholder for now, we'll update it in Step 5.

## Step 3: Create Stripe Products (2 min)

In Stripe Dashboard:

1. Go to **Products** → **Create Product**
2. Create first product:
   - **Name**: Photo Lab Starter
   - **Type**: Service
   - **Pricing**: Monthly billing, $29.00
   - Click **Create Product**
3. Copy the **Price ID** (starts with `price_`)
4. Repeat for Professional ($79.00) and Enterprise ($199.00)

## Step 4: Update Price IDs (1 min)

Edit `/server/constants/subscriptions.js`:

```javascript
basic: {
  // ... other properties
  stripePriceId: 'price_from_step_3_starter',
  // ...
},
professional: {
  // ... other properties
  stripePriceId: 'price_from_step_3_professional',
  // ...
},
enterprise: {
  // ... other properties
  stripePriceId: 'price_from_step_3_enterprise',
  // ...
}
```

## Step 5: Configure Webhook (Optional for testing)

To test payments locally:

1. In Stripe Dashboard, go to **Developers** → **Webhooks**
2. Click **Test in a local environment** → Follow their guide with ngrok
3. Or: Skip this for now and manually test webhook in Stripe Dashboard

For production, set endpoint to: `https://yourdomain.com/api/webhooks/stripe`

## Step 6: Start the Backend

```bash
cd /Users/brandoncampea/Projects/PhotoLabReact
node server/server.js
```

You should see: `Server running on http://localhost:3001`

## Step 7: Test the Flow

1. Open http://localhost:5173 in your browser
2. Go to `/studio-admin` (or navigate from navbar after login)
3. Click **"Continue to Payment"** on any plan
4. You'll be redirected to **Stripe Checkout**
5. Enter test card: `4242 4242 4242 4242`
6. Any future expiry date and any CVC
7. Click **"Pay"**
8. You should see success page

## Test Cards

- **Success**: 4242 4242 4242 4242
- **Decline**: 4000 0000 0000 0002
- **3D Secure**: 4000 2500 0000 3155
- **Expiry**: Any future date (e.g., 12/25)
- **CVC**: Any 3 digits

## Verify It Worked

In Stripe Dashboard:
1. Go to **Customers** - should see new customer
2. Go to **Subscriptions** - should see active subscription
3. Go to **Invoices** - should see invoice generated
4. Go to **Webhooks** → Your endpoint → Events - should see events logged

## Next: Production Setup

When ready for real payments:

1. Replace test keys with **live** keys (pk_live_*, sk_live_*)
2. Create live products in Stripe
3. Update `.env` with live Price IDs
4. Update webhook endpoint to production domain
5. Test with live card or use Stripe's live test card
6. Deploy to production

## Troubleshooting

**Checkout button does nothing?**
- Check browser console (F12) for errors
- Verify `.env` variables are set
- Restart backend after changing `.env`

**Getting 401/403 errors?**
- Make sure you're logged in
- Verify JWT token in localStorage
- Check that your user has `studio_admin` role

**Stripe Checkout not loading?**
- Verify Stripe Public Key in `.env`
- Check network tab in browser DevTools
- Ensure backend is returning `checkoutUrl`

**Webhook not working?**
- In Stripe Dashboard, click webhook endpoint
- Check "Events" tab for received events
- Look for HTTP 200 responses
- Check server logs for webhook errors

## Quick Reference

| Component | Location |
|-----------|----------|
| Constants | `/server/constants/subscriptions.js` |
| Stripe Service | `/server/services/stripeService.js` |
| Checkout Endpoint | `/server/routes/studios.js` |
| Webhook Endpoint | `/server/routes/webhooks.js` |
| Frontend | `/src/pages/StudioAdminDashboard.tsx` |
| Success Page | `/src/pages/CheckoutSuccess.tsx` |

---

**That's it!** You now have a working Stripe subscription system. 🎉

For detailed setup, see [STRIPE_INTEGRATION_COMPLETE.md](STRIPE_INTEGRATION_COMPLETE.md)
