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

    // Calculate total amount from items — count packagePrice once per group for package items
    const itemsTotal = (() => {
      const seenGroups = new Set();
      return items.reduce((sum, item) => {
        if (item.packageGroupId) {
          if (!seenGroups.has(item.packageGroupId)) {
            seenGroups.add(item.packageGroupId);
            return sum + (Number(item.packagePrice) || 0);
          }
          return sum;
        }
        return sum + (Number(item.price) || 0) * (Number(item.quantity) || 0);
      }, 0);
    })();
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

// Get current subscription status for the authenticated studio admin
router.get('/subscription-status', authRequired, async (req, res) => {
  try {
    const studioId = req.user?.studio_id;
    if (!studioId) return res.status(400).json({ error: 'No studio associated with this account' });

    const row = await queryRow(`
      SELECT s.id, s.name, s.email,
             s.subscription_plan, s.subscription_status, s.billing_cycle,
             s.subscription_start, s.subscription_end,
             s.stripe_customer_id, s.stripe_subscription_id,
             s.is_free_subscription, s.cancellation_requested, s.cancellation_date,
             sp.id as plan_id, sp.monthly_price, sp.yearly_price,
             sp.features, sp.description as plan_description,
             sp.stripe_monthly_price_id, sp.stripe_yearly_price_id
      FROM studios s
      LEFT JOIN subscription_plans sp ON LOWER(sp.name) = LOWER(s.subscription_plan)
      WHERE s.id = $1
    `, [studioId]);

    if (!row) return res.status(404).json({ error: 'Studio not found' });

    let features = [];
    try { features = row.features ? JSON.parse(row.features) : []; } catch {}

    res.json({
      studioId: row.id,
      studioName: row.name,
      subscriptionPlan: row.subscription_plan,
      subscriptionStatus: row.subscription_status,
      billingCycle: row.billing_cycle || 'monthly',
      subscriptionStart: row.subscription_start,
      subscriptionEnd: row.subscription_end,
      hasStripeCustomer: !!row.stripe_customer_id,
      hasStripeSubscription: !!row.stripe_subscription_id,
      isFreeSubscription: !!row.is_free_subscription,
      cancellationRequested: !!row.cancellation_requested,
      cancellationDate: row.cancellation_date,
      planDetails: row.plan_id ? {
        id: row.plan_id,
        monthlyPrice: parseFloat(row.monthly_price) || 0,
        yearlyPrice: row.yearly_price != null ? parseFloat(row.yearly_price) : null,
        features,
        description: row.plan_description,
        stripeMonthlyPriceId: row.stripe_monthly_price_id,
        stripeYearlyPriceId: row.stripe_yearly_price_id,
      } : null,
    });
  } catch (error) {
    console.error('Error fetching subscription status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create a Stripe Checkout session for subscribing to a plan
router.post('/create-subscription-checkout', authRequired, async (req, res) => {
  try {
    const { planId, billingCycle } = req.body;
    const studioId = req.user?.studio_id;

    if (!studioId) return res.status(400).json({ error: 'No studio associated with this account' });
    if (!planId) return res.status(400).json({ error: 'planId is required' });
    if (!['monthly', 'yearly'].includes(billingCycle)) return res.status(400).json({ error: 'billingCycle must be monthly or yearly' });

    const plan = await queryRow('SELECT * FROM subscription_plans WHERE id = $1 AND is_active = 1', [planId]);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });

    const priceId = billingCycle === 'yearly' ? plan.stripe_yearly_price_id : plan.stripe_monthly_price_id;
    if (!priceId) return res.status(400).json({ error: `No Stripe price ID configured for ${billingCycle} billing on this plan` });

    const studio = await queryRow('SELECT id, name, email, stripe_customer_id FROM studios WHERE id = $1', [studioId]);
    if (!studio) return res.status(404).json({ error: 'Studio not found' });

    const { secretKey } = getNormalizedStripeKeys();
    if (!secretKey) return res.status(503).json({ error: 'Stripe is not configured' });

    const stripe = (await import('stripe')).default(secretKey);

    const origin = req.headers.origin
      || process.env.FRONTEND_URL
      || process.env.CANONICAL_APP_URL
      || 'https://labs.campeaphotography.com';

    const sessionParams = {
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/admin/billing?subscribed=1`,
      cancel_url: `${origin}/admin/billing?cancelled=1`,
      subscription_data: {
        metadata: {
          studioId: String(studioId),
          billingCycle,
          planId: String(planId),
        },
      },
      metadata: {
        studioId: String(studioId),
        billingCycle,
        planId: String(planId),
      },
    };

    if (studio.stripe_customer_id) {
      sessionParams.customer = studio.stripe_customer_id;
    } else {
      sessionParams.customer_email = studio.email;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    res.json({ url: session.url });
  } catch (error) {
    console.error('Error creating subscription checkout:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create a Stripe Customer Portal session (for managing existing subscription)
router.post('/billing-portal', authRequired, async (req, res) => {
  try {
    const studioId = req.user?.studio_id;
    if (!studioId) return res.status(400).json({ error: 'No studio associated with this account' });

    const studio = await queryRow('SELECT stripe_customer_id FROM studios WHERE id = $1', [studioId]);
    if (!studio) return res.status(404).json({ error: 'Studio not found' });
    if (!studio.stripe_customer_id) return res.status(400).json({ error: 'No Stripe customer on file — subscribe first.' });

    const { secretKey } = getNormalizedStripeKeys();
    if (!secretKey) return res.status(503).json({ error: 'Stripe is not configured' });

    const stripe = (await import('stripe')).default(secretKey);

    const origin = req.headers.origin
      || process.env.FRONTEND_URL
      || process.env.CANONICAL_APP_URL
      || 'https://labs.campeaphotography.com';

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: studio.stripe_customer_id,
      return_url: `${origin}/admin/billing`,
    });

    res.json({ url: portalSession.url });
  } catch (error) {
    console.error('Error creating billing portal session:', error);
    res.status(500).json({ error: error.message });
  }
});

// Super admin: get all studios with subscription info
router.get('/admin/studio-subscriptions', authRequired, superAdminRequired, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT s.id, s.name, s.email,
             s.subscription_plan, s.subscription_status, s.billing_cycle,
             s.subscription_start, s.subscription_end,
             s.stripe_customer_id, s.stripe_subscription_id,
             s.is_free_subscription, s.cancellation_requested,
             sp.monthly_price, sp.yearly_price
      FROM studios s
      LEFT JOIN subscription_plans sp ON LOWER(sp.name) = LOWER(s.subscription_plan)
      ORDER BY s.name
    `);

    res.json((rows || []).map(r => ({
      id: r.id,
      name: r.name,
      email: r.email,
      plan: r.subscription_plan || null,
      status: r.subscription_status || 'inactive',
      billingCycle: r.billing_cycle || 'monthly',
      subscriptionStart: r.subscription_start,
      subscriptionEnd: r.subscription_end,
      hasStripeCustomer: !!r.stripe_customer_id,
      hasStripeSubscription: !!r.stripe_subscription_id,
      isFreeSubscription: !!r.is_free_subscription,
      cancellationRequested: !!r.cancellation_requested,
      monthlyPrice: r.monthly_price != null ? parseFloat(r.monthly_price) : null,
      yearlyPrice: r.yearly_price != null ? parseFloat(r.yearly_price) : null,
    })));
  } catch (error) {
    console.error('Error fetching studio subscriptions:', error);
    res.status(500).json({ error: error.message });
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
