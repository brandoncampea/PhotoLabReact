import express from 'express';
import mssql from '../mssql.cjs';
const { queryRow, query } = mssql;
import { authRequired, superAdminRequired } from '../middleware/auth.js';

const router = express.Router();

const roundCurrency = (value) => {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return 0;
  return Number(numeric.toFixed(2));
};

const getStudioIdFromItems = async (items) => {
  let studioId = null;

  for (const item of items || []) {
    const photoIds = Array.isArray(item.photoIds)
      ? item.photoIds
      : item.photoId
      ? [item.photoId]
      : [];
    const primaryPhotoId = Number(photoIds[0] || 0);
    if (!Number.isInteger(primaryPhotoId) || primaryPhotoId <= 0) continue;

    const row = await queryRow(
      `SELECT a.studio_id as studioId
       FROM photos p
       INNER JOIN albums a ON a.id = p.album_id
       WHERE p.id = $1`,
      [primaryPhotoId]
    );

    if (!row?.studioId) continue;

    if (studioId && Number(studioId) !== Number(row.studioId)) {
      throw new Error('Orders cannot span multiple studios');
    }

    studioId = Number(row.studioId);
  }

  return studioId;
};

const getFallbackDirectShippingChargeForStudio = async (studioId) => {
  const fallback = 9.95;
  if (!studioId) return fallback;

  const row = await queryRow(
    `SELECT direct_pricing_mode as directPricingMode,
            direct_flat_fee as directFlatFee,
            direct_shipping_charge as directShippingCharge
     FROM shipping_config
     WHERE id = $1`,
    [studioId]
  );

  const mode = String(row?.directPricingMode || 'flat_fee').toLowerCase();
  const flatFee = Number(row?.directFlatFee);
  const directCharge = Number(row?.directShippingCharge);

  if (mode === 'flat_fee' && Number.isFinite(flatFee) && flatFee > 0) {
    return roundCurrency(flatFee);
  }

  if (Number.isFinite(directCharge) && directCharge > 0) {
    return roundCurrency(directCharge);
  }

  return fallback;
};

const getNormalizedStripeKeys = () => {
  const rawPublishableKey = String(process.env.STRIPE_PUBLISHABLE_KEY || '').trim();
  const rawSecretKey = String(process.env.STRIPE_SECRET_KEY || '').trim();
  const webhookSecret = String(process.env.STRIPE_WEBHOOK_SECRET || '').trim();

  let publishableKey = rawPublishableKey;
  let secretKey = rawSecretKey;

  const publishableLooksSecret = publishableKey.startsWith('sk_');
  const secretLooksPublishable = secretKey.startsWith('pk_');

  // Auto-recover from swapped env values.
  if (publishableLooksSecret && secretLooksPublishable) {
    publishableKey = rawSecretKey;
    secretKey = rawPublishableKey;
  }

  // Hard safety: only allow expected key types downstream.
  if (!publishableKey.startsWith('pk_')) {
    publishableKey = '';
  }
  if (!secretKey.startsWith('sk_')) {
    secretKey = '';
  }

  return {
    publishableKey,
    secretKey,
    webhookSecret,
    isLiveMode: publishableKey.startsWith('pk_live_'),
    isActive: !!publishableKey && !!secretKey,
  };
};

// Update Stripe payment method status/mode (admin only)
router.post('/admin/payment-method/stripe', authRequired, superAdminRequired, async (req, res) => {
  try {
    const { isActive, isLiveMode } = req.body;
    if (typeof isActive !== 'boolean' || typeof isLiveMode !== 'boolean') {
      return res.status(400).json({ error: 'isActive and isLiveMode must be boolean.' });
    }
    // Update the config row (id = 1)
    await query(
      `UPDATE stripe_config SET is_active = @p1, is_live_mode = @p2, updated_at = CURRENT_TIMESTAMP WHERE id = 1`,
      [isActive ? 1 : 0, isLiveMode ? 1 : 0]
    );
    res.json({ success: true, isActive, isLiveMode });
  } catch (error) {
    console.error('Error updating Stripe payment method status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get Stripe configuration
router.get('/config', async (req, res) => {
  try {
    const { publishableKey, webhookSecret, isLiveMode, isActive } = getNormalizedStripeKeys();
    const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
    const isHttps = req.secure || forwardedProto === 'https';
    const reason = isLiveMode && !isHttps ? 'live_mode_requires_https' : undefined;

    res.json({
      publishableKey,
      isLiveMode,
      isActive,
      webhookSecret,
      reason,
    });
  } catch (error) {
    console.error('Error fetching Stripe config:', error);
    res.status(500).json({ error: error.message });
  }
});

// Test Stripe connection
router.post('/test-connection', authRequired, superAdminRequired, async (req, res) => {
  try {
    const { secretKey } = getNormalizedStripeKeys();
    if (!secretKey) {
      return res.status(400).json({ error: 'Secret key is required' });
    }
    // Dynamically import Stripe with the environment key
    const stripe = (await import('stripe')).default(secretKey);
    // Test the connection by retrieving the account
    const account = await stripe.accounts.retrieve();
    res.json({
      success: true,
      message: `Connected successfully to Stripe account: ${account.email || account.id}`,
      accountId: account.id,
      accountEmail: account.email,
      isLive: !secretKey.startsWith('sk_test_')
    });
  } catch (error) {
    console.error('Stripe test connection error:', error);
    
    if (error.type === 'StripeAuthenticationError') {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid Stripe API key. Please check your credentials.' 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to connect to Stripe' 
    });
  }
});

// Update Stripe configuration (admin only)
router.put('/config', authRequired, superAdminRequired, async (req, res) => {
  try {
    // Stripe config is now managed via environment variables, not database
    res.status(501).json({ error: 'Stripe config update is not supported. Set keys in environment variables.' });
  } catch (error) {
    console.error('Error updating Stripe config:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create payment intent
router.post('/create-payment-intent', authRequired, async (req, res) => {
  try {
    const { items, shippingOption, shippingCost, discountAmount, taxAmount, feeAmount } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Invalid or empty cart items' });
    }

    // Calculate total amount from items
    const itemsTotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    // If all items are digital, force shipping to 0
    const allDigital = Array.isArray(items) && items.length > 0 && items.every((item) => {
      const options = (() => {
        try {
          return typeof item.productOptions === 'string' ? JSON.parse(item.productOptions) : (item.productOptions || {});
        } catch { return {}; }
      })();
      const category = String(item.productCategory || '').toLowerCase();
      const name = String(item.productName || '').toLowerCase();
      return options?.isDigital === true || options?.is_digital_only === true || options?.digitalOnly === true || category.includes('digital') || name.includes('digital');
    });
    const normalizedShippingOption = String(shippingOption || '').toLowerCase() === 'batch' ? 'batch' : 'direct';
    const requestedShippingCost = Number(shippingCost) || 0;

    let shipping = 0;
    if (!allDigital && normalizedShippingOption !== 'batch') {
      if (requestedShippingCost > 0) {
        shipping = requestedShippingCost;
      } else {
        const studioId = await getStudioIdFromItems(items);
        shipping = await getFallbackDirectShippingChargeForStudio(studioId);
      }
    }

    const discount = discountAmount || 0;
    const tax = taxAmount || 0;
    const fee = feeAmount || 0;
    const totalAmount = itemsTotal + shipping + tax + fee - discount;

    if (totalAmount <= 0) {
      return res.status(400).json({ error: 'Invalid total amount' });
    }

    const { secretKey, isLiveMode } = getNormalizedStripeKeys();
    if (!secretKey) {
      return res.status(503).json({ error: 'Stripe is not configured or inactive' });
    }

    const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
    const isHttps = req.secure || forwardedProto === 'https';
    if (isLiveMode && !isHttps) {
      return res.status(400).json({
        error: 'Stripe live mode requires HTTPS.',
        reason: 'live_mode_requires_https',
      });
    }

    // Dynamically import Stripe with the secret key
    const stripe = (await import('stripe')).default(secretKey);
    // Create a PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(totalAmount * 100), // Stripe expects cents
      currency: 'usd',
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        items: (() => {
          // Deduplicate by photoId and sum quantities, then use compact keys to stay under Stripe's 500-char limit
          const merged = {};
          for (const i of items) {
            merged[i.photoId] = (merged[i.photoId] || 0) + (i.quantity || 1);
          }
          const compact = Object.entries(merged).map(([p, q]) => ({ p: Number(p), q }));
          const str = JSON.stringify(compact);
          // Stripe metadata value limit is 500 chars; truncate with a flag if still over
          return str.length <= 500 ? str : str.slice(0, 496) + '...]';
        })(),
        shippingOption: normalizedShippingOption,
        shippingCost: shipping.toFixed(2),
        discountAmount: discount.toFixed(2),
        taxAmount: tax.toFixed(2),
        feeAmount: fee.toFixed(2),
      },
    });

    res.json({
      id: paymentIntent.id,
      clientSecret: paymentIntent.client_secret,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      status: paymentIntent.status,
      livemode: Boolean(paymentIntent.livemode),
    });
  } catch (error) {
    console.error('Error creating payment intent:', error);

    // If this is a Stripe error, return as much detail as possible
    if (error && error.type && error.type.startsWith('Stripe')) {
      return res.status(500).json({
        error: error.message || 'Stripe error',
        type: error.type,
        code: error.code,
        raw: error.raw || undefined,
      });
    }
    // Authentication error
    if (error && error.type === 'StripeAuthenticationError') {
      return res.status(503).json({ error: 'Stripe authentication failed. Check your secret key.' });
    }
    // Other errors
    res.status(500).json({ error: error.message || 'Unknown error', details: error });
  }
});

// Confirm payment intent
router.post('/confirm-payment/:paymentIntentId', authRequired, async (req, res) => {
  try {
    const { paymentIntentId } = req.params;

    if (!paymentIntentId) {
      return res.status(400).json({ success: false, error: 'Payment intent ID is required' });
    }

    const { secretKey } = getNormalizedStripeKeys();
    if (!secretKey) {
      return res.status(503).json({ success: false, error: 'Stripe is not configured or inactive' });
    }

    const stripe = (await import('stripe')).default(secretKey);
    const isTestMode = secretKey.startsWith('sk_test_');

    let paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status === 'succeeded' || paymentIntent.status === 'processing') {
      return res.json({
        success: true,
        message: paymentIntent.status === 'succeeded' ? 'Payment confirmed successfully' : 'Payment is processing',
        status: paymentIntent.status,
      });
    }

    if (paymentIntent.status === 'requires_payment_method' || paymentIntent.status === 'requires_confirmation') {
      if (!isTestMode) {
        return res.status(400).json({
          success: false,
          error: 'Live payments require Stripe Elements or another client-side payment confirmation flow.',
        });
      }

      paymentIntent = await stripe.paymentIntents.confirm(paymentIntentId, {
        payment_method: 'pm_card_visa',
      });
    }

    if (paymentIntent.status === 'requires_capture') {
      paymentIntent = await stripe.paymentIntents.capture(paymentIntentId);
    }

    if (paymentIntent.status === 'succeeded' || paymentIntent.status === 'processing') {
      return res.json({
        success: true,
        message: paymentIntent.status === 'succeeded' ? 'Payment confirmed successfully' : 'Payment is processing',
        status: paymentIntent.status,
      });
    }

    return res.status(400).json({
      success: false,
      error: `Payment could not be confirmed. Current status: ${paymentIntent.status}`,
      status: paymentIntent.status,
    });
  } catch (error) {
    console.error('Error confirming payment intent:', error);

    if (error && error.type === 'StripeAuthenticationError') {
      return res.status(503).json({ success: false, error: 'Stripe authentication failed. Check your secret key.' });
    }

    res.status(500).json({ success: false, error: error.message });
  }
});

// --- STRIPE WEBHOOK FOR FEES ---

router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const { secretKey, webhookSecret } = getNormalizedStripeKeys();
  if (!secretKey || !webhookSecret) {
    return res.status(503).json({ error: 'Stripe is not configured or webhook secret missing' });
  }
  const stripe = (await import('stripe')).default(secretKey);
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Scheduling booking payment completed
  if (event.type === 'checkout.session.completed') {
    const { handleSchedulingCheckoutCompleted } = await import('./scheduling.js');
    await handleSchedulingCheckoutCompleted(event.data.object).catch(err =>
      console.error('[stripe webhook] scheduling checkout handler error:', err)
    );
  }

  // Listen for payment_intent.succeeded and charge.succeeded
  if (event.type === 'payment_intent.succeeded' || event.type === 'charge.succeeded') {
    let paymentIntent = event.data.object;
    let chargeId = paymentIntent.latest_charge || paymentIntent.id;
    if (event.type === 'charge.succeeded') {
      chargeId = paymentIntent.id;
    }
    try {
      const charge = await stripe.charges.retrieve(chargeId, { expand: ['balance_transaction'] });
      const fee = charge.balance_transaction.fee / 100; // Stripe fee in dollars
      // Update your order in the DB (adjust for your schema)
      await query(
        `UPDATE orders SET stripe_fee_amount = @p1 WHERE payment_intent_id = @p2`,
        [fee, paymentIntent.id]
      );
    } catch (err) {
      console.error('Failed to update Stripe fee:', err);
    }
  }
  res.json({ received: true });
});

export default router;
