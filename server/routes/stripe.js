
import express from 'express';
import { queryRow, query } from '../mssql.mjs';
import { authRequired, superAdminRequired } from '../middleware/auth.js';

const router = express.Router();

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
    // Use environment variables for Stripe keys
    const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY || '';
    const secretKey = process.env.STRIPE_SECRET_KEY || '';
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
    const isLiveMode = publishableKey.startsWith('pk_live_');
    const isActive = !!publishableKey && !!secretKey;
    res.json({
      publishableKey,
      isLiveMode,
      isActive,
      webhookSecret,
    });
  } catch (error) {
    console.error('Error fetching Stripe config:', error);
    res.status(500).json({ error: error.message });
  }
});

// Test Stripe connection
router.post('/test-connection', authRequired, superAdminRequired, async (req, res) => {
  try {
    // Use environment variable for secret key
    const secretKey = process.env.STRIPE_SECRET_KEY || '';
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
    const { items, shippingOption, shippingCost, discountAmount } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Invalid or empty cart items' });
    }

    // Calculate total amount from items
    const itemsTotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const shipping = shippingCost || 0;
    const discount = discountAmount || 0;
    const totalAmount = itemsTotal + shipping - discount;

    if (totalAmount <= 0) {
      return res.status(400).json({ error: 'Invalid total amount' });
    }

    // Use environment variable for Stripe secret key
    const secretKey = process.env.STRIPE_SECRET_KEY || '';
    if (!secretKey) {
      return res.status(503).json({ error: 'Stripe is not configured or inactive' });
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
        items: JSON.stringify(items.map(i => ({ photoId: i.photoId, quantity: i.quantity }))),
        shippingOption,
        shippingCost: shipping.toFixed(2),
        discountAmount: discount.toFixed(2),
      },
    });

    res.json({
      id: paymentIntent.id,
      clientSecret: paymentIntent.client_secret,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      status: paymentIntent.status,
    });
  } catch (error) {
    console.error('Error creating payment intent:', error);

    if (error && error.type === 'StripeAuthenticationError') {
      return res.status(503).json({ error: 'Stripe authentication failed. Check your secret key.' });
    }

    res.status(500).json({ error: error.message });
  }
});

export default router;
