# Stripe Integration Setup Guide

This guide helps you set up Stripe for the Photo Lab subscription system.

## 1. Stripe Account Setup

1. Create a Stripe account at https://stripe.com
2. Go to the Dashboard and find your **API Keys**:
   - **Publishable Key** (starts with `pk_`)
   - **Secret Key** (starts with `sk_`)

## 2. Environment Variables

Add these to your `.env` file in the project root:

```
STRIPE_PUBLIC_KEY=pk_test_your_key_here
STRIPE_SECRET_KEY=sk_test_your_key_here
STRIPE_WEBHOOK_SECRET=whsec_test_your_secret_here
FRONTEND_URL=http://localhost:5173
```

## 3. Create Stripe Price IDs

In the Stripe Dashboard:

1. Go to **Products** → **Create Product**
2. Create three products for each plan:
   - **Starter**: $29/month
   - **Professional**: $79/month
   - **Enterprise**: $199/month

3. For each product:
   - Set the **Name** (e.g., "Photo Lab - Starter")
   - Set **Pricing**: Monthly, $XX
   - Get the **Price ID** (looks like `price_1QqI...`)

4. Update `/server/constants/subscriptions.js` with the real Price IDs:

```javascript
basic: {
  stripePriceId: 'price_your_actual_id_here',
  // ...
}
```

## 4. Webhook Setup

1. In Stripe Dashboard, go to **Webhooks** → **Add Endpoint**
2. Set the **Endpoint URL** to:
   ```
   https://yourdomain.com/api/webhooks/stripe
   ```
   (For local testing, use `http://localhost:3001/api/webhooks/stripe`)

3. Select these events:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`

4. Copy the **Signing Secret** and add to your `.env`:
   ```
   STRIPE_WEBHOOK_SECRET=whsec_your_secret_here
   ```

## 5. Testing

### Test Mode
Use Stripe test cards to avoid real charges:
- **Successful**: 4242 4242 4242 4242
- **Failed**: 4000 0000 0000 0002
- **Expiry**: Any future date (e.g., 12/25)
- **CVC**: Any 3 digits

### Test Subscription Flow
1. Go to `http://localhost:5173/studio-admin`
2. Click "Continue to Payment" on a plan
3. You'll be redirected to Stripe Checkout
4. Use test card 4242 4242 4242 4242
5. Complete the checkout
6. Webhook events will update the subscription status

### Verify Webhook
In Stripe Dashboard → Webhooks, you can see:
- Which events were sent
- Event details
- Response status

## 6. Production Checklist

Before going live:

- [ ] Switch from test to live API keys
- [ ] Update Stripe price IDs to production IDs
- [ ] Update webhook endpoint to production domain
- [ ] Set up webhook signing secret for production
- [ ] Test with real cards
- [ ] Set up email confirmations for successful payments
- [ ] Configure receipt emails in Stripe
- [ ] Set up dunning management for failed payments
- [ ] Enable strong customer authentication (SCA) for compliance

## 7. Key API Endpoints

- `POST /api/studios/:studioId/checkout` - Create checkout session
- `POST /api/webhooks/stripe` - Webhook endpoint (called by Stripe)
- `POST /api/studios/:studioId/subscription` - Update subscription (super admin)

## 8. Database Updates

The system automatically:
- Creates `stripe_customer_id` on checkout
- Creates `stripe_subscription_id` on successful subscription
- Updates `subscription_status` when webhooks arrive
- Tracks `subscription_start` and `subscription_end` dates

## 9. Error Handling

If you see webhook errors:
1. Check Stripe Dashboard → Webhooks for error logs
2. Verify the signing secret is correct
3. Ensure `raw` middleware is used for webhook (not parsed JSON)
4. Check server logs for detailed error messages

## 10. Support

For issues:
- Stripe Docs: https://stripe.com/docs
- API Reference: https://stripe.com/docs/api
- Testing Guide: https://stripe.com/docs/testing
